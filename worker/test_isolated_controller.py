import importlib
import io
import sys
import types
import unittest
from unittest.mock import Mock, patch

sys.modules.setdefault('boto3', types.SimpleNamespace(client=lambda *args: Mock()))
botocore = types.ModuleType('botocore')
exceptions = types.ModuleType('botocore.exceptions')
exceptions.ClientError = type('ClientError', (Exception,), {})
sys.modules.setdefault('botocore', botocore)
sys.modules.setdefault('botocore.exceptions', exceptions)
controller = importlib.import_module('isolated_controller')

CONFIG = {'bucket':'test-bucket', 'region':'us-east-1', 'ami':'ami-test',
          'profile':'test-profile', 'security_group':'sg-test', 'alert_topic':'arn:aws:sns:us-east-1:123456789012:admins'}


def gpu(phase, state, **extra):
    tags = {'AllocationId':'alloc-1', 'DCSEndEpoch':'100', 'DCSPhase':phase, **extra}
    return {'InstanceId':'i-test', 'State':{'Name':state}, 'RootDeviceName':'/dev/sda1',
            'SubnetId':'subnet-test', 'Tags':[{'Key':k, 'Value':v} for k,v in tags.items()],
            'BlockDeviceMappings':[{'DeviceName':'/dev/sda1','Ebs':{'VolumeId':'vol-123'}}]}


class IsolatedControllerTests(unittest.TestCase):
    def setUp(self):
        controller.ec2 = Mock()
        controller.s3 = Mock()
        controller.sns = Mock()

    def test_stop_then_preserve_root_before_detaching(self):
        controller.reconcile(gpu('gpu', 'running'), CONFIG, 101)
        controller.ec2.stop_instances.assert_called_once()
        controller.ec2.terminate_instances.assert_not_called()
        controller.ec2.reset_mock()
        controller.reconcile(gpu('stopping', 'stopped'), CONFIG, 101)
        self.assertFalse(controller.ec2.modify_instance_attribute.call_args.kwargs['BlockDeviceMappings'][0]['Ebs']['DeleteOnTermination'])
        controller.ec2.detach_volume.assert_not_called()

    def test_volume_never_detached_from_unexpected_instance(self):
        controller.ec2.describe_volumes.return_value = {'Volumes':[{'State':'in-use',
            'Attachments':[{'InstanceId':'i-other','State':'attached'}]}]}
        with self.assertRaisesRegex(ValueError, 'Unexpected'):
            controller.reconcile(gpu('detaching', 'stopped', DCSVolumeId='vol-123'), CONFIG, 101)
        controller.ec2.detach_volume.assert_not_called()

    def test_failed_export_retains_volume(self):
        with patch.object(controller, 'instance_by_id', return_value={'State':{'Name':'terminated'}}), \
             patch.object(controller, 'head_or_none', return_value=None):
            with self.assertRaisesRegex(RuntimeError, 'retained'):
                controller.reconcile(gpu('exporting', 'stopped', DCSVolumeId='vol-123', DCSWorkerId='i-worker'), CONFIG, 101)
        controller.ec2.delete_volume.assert_not_called()
        controller.ec2.terminate_instances.assert_not_called()

    def test_fast_worker_may_finish_before_attachment_is_observed(self):
        from datetime import datetime, timezone
        marker = {'LastModified': datetime.fromtimestamp(101, tz=timezone.utc)}
        with patch.object(controller, 'instance_by_id', return_value={'State': {'Name': 'terminated'}}), \
             patch.object(controller, 'head_or_none', side_effect=[marker, {'ContentLength': 512}]):
            controller.reconcile(gpu('attaching', 'stopped', DCSVolumeId='vol-123', DCSWorkerId='i-worker'), CONFIG, 102)
        tags = controller.ec2.create_tags.call_args.kwargs['Tags']
        self.assertIn({'Key': 'DCSPhase', 'Value': 'verified'}, tags)
        controller.ec2.delete_volume.assert_not_called()

    def test_stuck_stopping_is_marked_failed_and_retains_source(self):
        with self.assertRaisesRegex(RuntimeError, 'stopping timed out'):
            controller.reconcile(gpu('stopping', 'stopping', DCSPhaseEpoch='100'), CONFIG, 1001)
        tags = controller.ec2.create_tags.call_args_list[0].kwargs['Tags']
        self.assertIn({'Key':'DCSPhase', 'Value':'export-failed'}, tags)
        self.assertIn({'Key':'DCSFailureReason', 'Value':'stopping timed out; source volume retained: i-test'}, tags)
        controller.ec2.stop_instances.assert_not_called()
        controller.ec2.delete_volume.assert_not_called()

    def test_export_timeout_stops_worker_but_retains_source_volume(self):
        with patch.object(controller, 'instance_by_id', return_value={'State':{'Name':'running'}}):
            with self.assertRaisesRegex(RuntimeError, 'exporting timed out'):
                controller.reconcile(gpu('exporting', 'stopped', DCSPhaseEpoch='15000', DCSWorkerStartedEpoch='100',
                                         DCSVolumeId='vol-123', DCSWorkerId='i-worker'), CONFIG, 15401)
        controller.ec2.stop_instances.assert_called_once_with(InstanceIds=['i-worker'])
        controller.ec2.delete_volume.assert_not_called()
        controller.sns.publish.assert_called_once()

    def test_attachment_timeout_stops_worker_but_retains_source_volume(self):
        with patch.object(controller, 'instance_by_id', return_value={'State':{'Name':'pending'}}):
            with self.assertRaisesRegex(RuntimeError, 'attaching timed out'):
                controller.reconcile(gpu('attaching', 'stopped', DCSPhaseEpoch='100',
                                         DCSVolumeId='vol-123', DCSWorkerId='i-worker'), CONFIG, 1001)
        controller.ec2.stop_instances.assert_called_once_with(InstanceIds=['i-worker'])
        controller.ec2.delete_volume.assert_not_called()

    def test_sns_outage_keeps_failure_visible_and_retries_alert(self):
        controller.sns.publish.side_effect = [RuntimeError('SNS unavailable'), {}]
        with patch.object(controller, 'instance_by_id', return_value={'State':{'Name':'running'}}):
            with self.assertRaisesRegex(RuntimeError, 'SNS unavailable'):
                controller.reconcile(gpu('exporting', 'stopped', DCSPhaseEpoch='100',
                                         DCSVolumeId='vol-123', DCSWorkerId='i-worker'), CONFIG, 15401)
        failure_tags = controller.ec2.create_tags.call_args_list[0].kwargs['Tags']
        self.assertIn({'Key':'DCSPhase', 'Value':'export-failed'}, failure_tags)
        self.assertIn({'Key':'DCSAlertStatus', 'Value':'pending'}, failure_tags)
        controller.ec2.delete_volume.assert_not_called()

        failed_instance = gpu('export-failed', 'stopped', DCSPhaseEpoch='15401',
                              DCSVolumeId='vol-123', DCSWorkerId='i-worker',
                              DCSAlertStatus='pending', DCSWorkerStopStatus='requested',
                              DCSFailureReason='exporting timed out; source volume retained: i-test')
        controller.reconcile(failed_instance, CONFIG, 15402)
        self.assertEqual(controller.sns.publish.call_count, 2)
        self.assertIn({'Key':'DCSAlertStatus', 'Value':'sent'},
                      controller.ec2.create_tags.call_args.kwargs['Tags'])

    def test_worker_stop_error_does_not_block_failure_or_alert(self):
        controller.ec2.stop_instances.side_effect = RuntimeError('EC2 temporarily unavailable')
        with patch.object(controller, 'instance_by_id', return_value={'State':{'Name':'running'}}):
            with self.assertRaisesRegex(RuntimeError, 'exporting timed out'):
                controller.reconcile(gpu('exporting', 'stopped', DCSPhaseEpoch='100',
                                         DCSVolumeId='vol-123', DCSWorkerId='i-worker'), CONFIG, 15401)
        failure_tags = controller.ec2.create_tags.call_args_list[0].kwargs['Tags']
        self.assertIn({'Key':'DCSPhase', 'Value':'export-failed'}, failure_tags)
        self.assertIn({'Key':'DCSWorkerStopStatus', 'Value':'pending'}, failure_tags)
        controller.sns.publish.assert_called_once()
        controller.ec2.delete_volume.assert_not_called()

    def test_old_phase_without_timestamp_gets_stable_start_time(self):
        instance = gpu('stopping', 'running', DCSPhaseEpoch='100')
        instance['Tags'] = [tag for tag in instance['Tags'] if tag['Key'] != 'DCSPhaseEpoch']
        controller.reconcile(instance, CONFIG, 1000)
        self.assertIn({'Key':'DCSPhaseEpoch', 'Value':'1000'}, controller.ec2.create_tags.call_args.kwargs['Tags'])
        instance['Tags'].append({'Key':'DCSPhaseEpoch', 'Value':'1000'})
        controller.ec2.create_tags.reset_mock()
        controller.reconcile(instance, CONFIG, 1100)
        controller.ec2.create_tags.assert_not_called()
        self.assertEqual(controller.ec2.stop_instances.call_count, 2)

    def test_stale_export_progress_is_cleared_before_new_worker(self):
        controller.ec2.describe_volumes.return_value = {'Volumes':[{'State':'available'}]}
        controller.reconcile(gpu('detaching', 'stopped', DCSVolumeId='vol-123'), CONFIG, 101)
        self.assertCountEqual([call.kwargs['Key'] for call in controller.s3.delete_object.call_args_list],
                              ['alloc-1/artifacts.ready', 'alloc-1/export-progress.json'])

    def test_verified_archive_advances_to_cleanup_before_volume_deletion(self):
        controller.ec2.describe_volumes.return_value = {'Volumes':[{'State':'available'}]}
        controller.s3.get_object.return_value = {'Body':io.BytesIO(b'a' * 64)}
        with patch.object(controller, 'head_or_none', return_value={'ContentLength':1024}):
            controller.reconcile(gpu('verified','stopped',DCSVolumeId='vol-123'), CONFIG, 101)
        controller.ec2.delete_volume.assert_not_called()
        self.assertEqual(controller.ec2.create_tags.call_args.kwargs['Tags'][0]['Value'], 'cleanup')
        controller.reconcile(gpu('cleanup','stopped',DCSVolumeId='vol-123'), CONFIG, 101)
        controller.ec2.delete_volume.assert_called_once_with(VolumeId='vol-123')
        controller.ec2.terminate_instances.assert_called_once_with(InstanceIds=['i-test'])

    def test_invalid_marker_does_not_delete_volume(self):
        controller.ec2.describe_volumes.return_value = {'Volumes':[{'State':'available'}]}
        controller.s3.get_object.return_value = {'Body':io.BytesIO(b'bad')}
        with patch.object(controller, 'head_or_none', return_value={'ContentLength':1024}):
            with self.assertRaisesRegex(ValueError, 'marker'):
                controller.reconcile(gpu('verified','stopped',DCSVolumeId='vol-123'), CONFIG, 101)
        controller.ec2.delete_volume.assert_not_called()


if __name__ == '__main__':
    unittest.main()
