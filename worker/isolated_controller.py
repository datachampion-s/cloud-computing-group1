"""Reconcile stopped compute sessions onto isolated, read-only export workers.

Deployment is intentionally separate from the legacy controller. Resources
are retained until an export has been independently verified.
"""
import datetime
import logging
import os
import re
import uuid

import boto3
from botocore.exceptions import ClientError
from isolated_worker import user_data

log = logging.getLogger(__name__)
log.setLevel(logging.INFO)
ec2 = boto3.client('ec2')
s3 = boto3.client('s3')
dynamodb = boto3.client('dynamodb')
sns = boto3.client('sns')


def tag_map(instance):
    return {item['Key']: item['Value'] for item in instance.get('Tags', [])}


def update_tags(instance_id, **values):
    ec2.create_tags(Resources=[instance_id], Tags=[{'Key': key, 'Value': str(value)} for key, value in values.items()])


def set_phase(instance_id, phase, now, **values):
    update_tags(instance_id, DCSPhase=phase, DCSPhaseEpoch=now, **values)


def retry_failure_actions(instance_id, info, config):
    worker_id = info.get('DCSWorkerId')
    if info.get('DCSWorkerStopStatus') == 'pending' and worker_id:
        try:
            worker = instance_by_id(worker_id)
            if worker['State']['Name'] in ('pending', 'running'):
                ec2.stop_instances(InstanceIds=[worker_id])
                update_tags(instance_id, DCSWorkerStopStatus='requested')
            else:
                update_tags(instance_id, DCSWorkerStopStatus='complete')
        except Exception as exc:
            log.warning('Could not stop timed-out export worker %s; will retry: %s', worker_id, exc)
    if info.get('DCSAlertStatus') == 'pending':
        sns.publish(TopicArn=config['alert_topic'], Subject='DCS export lifecycle failed',
                    Message=f'Instance: {instance_id}\n{info.get("DCSFailureReason", "Export lifecycle failed")}')
        update_tags(instance_id, DCSAlertStatus='sent')


def fail(instance_id, now, message, config, worker_id=None):
    values = {'DCSFailureReason':message[:240], 'DCSAlertStatus':'pending'}
    if worker_id:
        values.update(DCSWorkerId=worker_id, DCSWorkerStopStatus='pending')
    set_phase(instance_id, 'export-failed', now, **values)
    info = {**values, 'DCSPhase':'export-failed'}
    retry_failure_actions(instance_id, info, config)
    raise RuntimeError(message)


def head_or_none(bucket, key):
    try:
        return s3.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        if exc.response['Error']['Code'] in ('404', 'NoSuchKey', 'NotFound'):
            return None
        raise


def get_volume(volume_id):
    return ec2.describe_volumes(VolumeIds=[volume_id])['Volumes'][0]


def instance_by_id(instance_id):
    return ec2.describe_instances(InstanceIds=[instance_id])['Reservations'][0]['Instances'][0]


def reconcile(instance, config, now):
    info = tag_map(instance)
    gpu_id = instance['InstanceId']
    allocation = info.get('AllocationId', '')
    deadline = info.get('DCSEndEpoch', '')
    phase = info.get('DCSPhase', '')
    if not re.fullmatch(r'[A-Za-z0-9_-]+', allocation) or not deadline.isdigit():
        raise ValueError('Missing lifecycle tags for ' + gpu_id)
    if phase == 'export-failed':
        retry_failure_actions(gpu_id, info, config)
        return
    if now < int(deadline):
        return
    state = instance['State']['Name']
    phase_limits = {'stopping': 900, 'detaching': 900, 'worker-launch': 900, 'attaching': 900, 'exporting': 15300}
    if phase in phase_limits:
        phase_started = info.get('DCSPhaseEpoch')
        if phase_started is None:
            phase_started = info.get('DCSWorkerStartedEpoch', now) if phase in ('attaching', 'exporting') else now
            update_tags(gpu_id, DCSPhaseEpoch=phase_started)
        phase_started = int(phase_started)
        timeout_started = int(info.get('DCSWorkerStartedEpoch', phase_started)) if phase == 'exporting' else phase_started
        if now - timeout_started > phase_limits[phase]:
            worker_id = info.get('DCSWorkerId') if phase in ('attaching', 'exporting') else None
            fail(gpu_id, now, f'{phase} timed out; source volume retained: {gpu_id}', config, worker_id)
    if state in ('pending', 'stopping', 'shutting-down', 'terminated'):
        return
    if phase in ('gpu', 'stopping'):
        if state == 'running':
            if phase != 'stopping':
                set_phase(gpu_id, 'stopping', now)
            ec2.stop_instances(InstanceIds=[gpu_id])
        elif state == 'stopped':
            device = instance['RootDeviceName']
            roots = [item for item in instance.get('BlockDeviceMappings', []) if item['DeviceName'] == device]
            if len(roots) != 1:
                raise ValueError('Root volume not found for ' + gpu_id)
            volume_id = roots[0]['Ebs']['VolumeId']
            ec2.modify_instance_attribute(InstanceId=gpu_id, BlockDeviceMappings=[{
                'DeviceName': device, 'Ebs': {'DeleteOnTermination': False}}])
            set_phase(gpu_id, 'detaching', now, DCSVolumeId=volume_id)
        return
    if phase == 'detaching' and state == 'stopped':
        volume_id = info['DCSVolumeId']
        volume = get_volume(volume_id)
        if volume['State'] == 'in-use':
            attachment = volume.get('Attachments', [])
            if len(attachment) != 1 or attachment[0]['InstanceId'] != gpu_id:
                raise ValueError('Unexpected source volume attachment')
            if attachment[0]['State'] == 'attached':
                ec2.detach_volume(VolumeId=volume_id, InstanceId=gpu_id)
        elif volume['State'] == 'available':
            # Clear an earlier attempt before launching a fresh worker.
            s3.delete_object(Bucket=config['bucket'], Key=allocation + '/artifacts.ready')
            s3.delete_object(Bucket=config['bucket'], Key=allocation + '/export-progress.json')
            set_phase(gpu_id, 'worker-launch', now)
        return
    if phase == 'worker-launch' and state == 'stopped':
        volume_id = info['DCSVolumeId']
        response = ec2.run_instances(
            ImageId=config['ami'], InstanceType='t3.micro', MinCount=1, MaxCount=1,
            CreditSpecification={'CpuCredits':'standard'},
            SubnetId=instance['SubnetId'], SecurityGroupIds=[config['security_group']],
            IamInstanceProfile={'Name': config['profile']},
            InstanceInitiatedShutdownBehavior='terminate',
            BlockDeviceMappings=[{'DeviceName':'/dev/xvda', 'Ebs':{
                'VolumeSize':8, 'VolumeType':'gp3', 'Encrypted':True, 'DeleteOnTermination':True}}],
            ClientToken='dcs-export-' + gpu_id,
            MetadataOptions={'HttpTokens':'required', 'HttpPutResponseHopLimit':1},
            TagSpecifications=[{'ResourceType':'instance','Tags':[
                {'Key':'Project','Value':'dcs-hpc-export'},
                {'Key':'DCSParentInstance','Value':gpu_id},
                {'Key':'AllocationId','Value':allocation}]}],
            UserData=user_data(config['bucket'], allocation, volume_id, config['region']))
        worker_id = response['Instances'][0]['InstanceId']
        set_phase(gpu_id, 'attaching', now, DCSWorkerId=worker_id, DCSWorkerStartedEpoch=now)
        return
    if phase == 'attaching' and state == 'stopped':
        volume_id, worker_id = info['DCSVolumeId'], info['DCSWorkerId']
        worker = instance_by_id(worker_id)
        if worker['State']['Name'] not in ('pending', 'running'):
            # A small workspace can finish before the next scheduler tick observes attachment.
            marker = head_or_none(config['bucket'], allocation + '/artifacts.ready')
            archive = head_or_none(config['bucket'], allocation + '/artifacts.zip')
            if marker and archive and marker['LastModified'].timestamp() >= int(deadline):
                set_phase(gpu_id, 'verified', now)
                return
            fail(gpu_id, now, 'Export worker stopped before attachment; source volume retained: ' + gpu_id, config)
        volume = get_volume(volume_id)
        if volume['State'] == 'available':
            ec2.attach_volume(VolumeId=volume_id, InstanceId=worker_id, Device='/dev/sdf')
        elif volume['State'] == 'in-use':
            attachment = volume.get('Attachments', [])
            if len(attachment) != 1 or attachment[0]['InstanceId'] != worker_id:
                raise ValueError('Unexpected worker volume attachment')
            if attachment[0]['State'] == 'attached':
                ec2.modify_instance_attribute(InstanceId=worker_id, BlockDeviceMappings=[{
                    'DeviceName':'/dev/sdf', 'Ebs':{'DeleteOnTermination':False}}])
                set_phase(gpu_id, 'exporting', now)
        return
    if phase == 'exporting' and state == 'stopped':
        worker = instance_by_id(info['DCSWorkerId'])
        if worker['State']['Name'] not in ('terminated', 'stopped'):
            return
        marker = head_or_none(config['bucket'], allocation + '/artifacts.ready')
        archive = head_or_none(config['bucket'], allocation + '/artifacts.zip')
        if not marker or not archive or marker['LastModified'].timestamp() < int(deadline):
            fail(gpu_id, now, 'Export failed; source volume retained: ' + gpu_id, config)
        set_phase(gpu_id, 'verified', now)
        return
    if phase == 'verified' and state == 'stopped':
        volume = get_volume(info['DCSVolumeId'])
        if volume['State'] != 'available':
            return
        marker = s3.get_object(Bucket=config['bucket'], Key=allocation + '/artifacts.ready')
        try:
            checksum = marker['Body'].read(65).decode('ascii')
        finally:
            marker['Body'].close()
        archive = head_or_none(config['bucket'], allocation + '/artifacts.zip')
        if not re.fullmatch(r'[0-9a-f]{64}', checksum) or not archive or archive['ContentLength'] < 22:
            raise ValueError('Invalid export verification marker')
        set_phase(gpu_id, 'cleanup', now)
        return
    if phase == 'cleanup' and state == 'stopped':
        volume_id = info['DCSVolumeId']
        try:
            volume = get_volume(volume_id)
            if volume['State'] != 'available':
                return
            ec2.delete_volume(VolumeId=volume_id)
        except ClientError as exc:
            if exc.response['Error']['Code'] != 'InvalidVolume.NotFound':
                raise
        ec2.terminate_instances(InstanceIds=[gpu_id])


def handler(event, context):
    config = {'bucket':os.environ['ARTIFACT_BUCKET'], 'region':os.environ['AWS_REGION'],
              'ami':os.environ['WORKER_AMI'], 'profile':os.environ['WORKER_PROFILE'],
              'security_group':os.environ['WORKER_SECURITY_GROUP'],
              'alert_topic':os.environ['ADMIN_ALERT_TOPIC_ARN']}
    now = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
    errors = []
    paginator = ec2.get_paginator('describe_instances')
    for page in paginator.paginate(Filters=[{'Name':'tag:Project', 'Values':['dcs-hpc']},
                                             {'Name':'tag-key', 'Values':['DCSPhase']}]):
        for reservation in page['Reservations']:
            for instance in reservation['Instances']:
                instance_id = instance['InstanceId']
                owner = uuid.uuid4().hex
                try:
                    dynamodb.put_item(TableName=os.environ['LOCK_TABLE'],
                        Item={'instance_id':{'S':instance_id}, 'owner':{'S':owner}, 'expires':{'N':str(now + 120)}},
                        ConditionExpression='attribute_not_exists(instance_id) OR #expires < :now',
                        ExpressionAttributeNames={'#expires':'expires'},
                        ExpressionAttributeValues={':now':{'N':str(now)}})
                except ClientError as exc:
                    if exc.response['Error']['Code'] == 'ConditionalCheckFailedException':
                        continue
                    raise
                try:
                    reconcile(instance_by_id(instance_id), config, now)
                except Exception:
                    log.exception('Lifecycle failed for %s', instance_id)
                    errors.append(instance_id)
                finally:
                    try:
                        dynamodb.delete_item(TableName=os.environ['LOCK_TABLE'],
                            Key={'instance_id':{'S':instance_id}}, ConditionExpression='#owner = :owner',
                            ExpressionAttributeNames={'#owner':'owner'},
                            ExpressionAttributeValues={':owner':{'S':owner}})
                    except ClientError as exc:
                        if exc.response['Error']['Code'] != 'ConditionalCheckFailedException':
                            raise
    if errors:
        raise RuntimeError('Lifecycle failed: ' + ', '.join(errors))
