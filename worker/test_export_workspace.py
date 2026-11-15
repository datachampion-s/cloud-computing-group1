import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from export_workspace import export_workspace


class FakeS3:
    def __init__(self, corrupt=False):
        self.objects = {}
        self.parts = []
        self.corrupt = corrupt
        self.aborted = False
        self.progress = []

    def delete_object(self, Bucket, Key):
        self.objects.pop(Key, None)

    def create_multipart_upload(self, **kwargs):
        return {'UploadId': 'upload'}

    def upload_part(self, **kwargs):
        self.parts.append(kwargs['Body'].read())
        return {'ETag': str(len(self.parts))}

    def complete_multipart_upload(self, **kwargs):
        self.objects[kwargs['Key']] = b''.join(self.parts)

    def abort_multipart_upload(self, **kwargs):
        self.aborted = True

    def get_object(self, **kwargs):
        data = self.objects[kwargs['Key']]
        return {'Body': io.BytesIO(data + (b'bad' if self.corrupt else b'')), 'ContentLength': len(data)}

    def put_object(self, **kwargs):
        self.objects[kwargs['Key']] = kwargs['Body']
        if kwargs['Key'].endswith('/export-progress.json'):
            self.progress.append(json.loads(kwargs['Body']))


class ExportTests(unittest.TestCase):
    def test_archive_contents_and_verified_marker(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for folder in ['data', 'notebooks', 'models', '.venv', 'outputs']:
                (root / folder).mkdir()
            for name in ['main.py', 'data/private.csv', 'models/model.pt', '.venv/local.py', 'notebooks/test.ipynb', 'outputs/result.csv']:
                (root / name).write_text(name)
            client = FakeS3()
            export_workspace(client, 'test', 'alloc-123', tmp)
            self.assertIn('alloc-123/artifacts.ready', client.objects)
            self.assertEqual([p['stage'] for p in client.progress], ['scanning', 'archiving', 'verifying', 'ready'])
            self.assertEqual(client.progress[-1]['processed_bytes'], client.progress[-1]['total_bytes'])
            with zipfile.ZipFile(io.BytesIO(client.objects['alloc-123/artifacts.zip'])) as archive:
                names = archive.namelist()
                self.assertIn('main.py', names)
                self.assertIn('models/model.pt', names)
                self.assertIn('notebooks/test.ipynb', names)
                self.assertNotIn('data/private.csv', names)
                self.assertNotIn('.venv/local.py', names)

    def test_corrupt_upload_never_marks_ready(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / 'test.txt').write_text('test')
            client = FakeS3(corrupt=True)
            with self.assertRaisesRegex(ValueError, 'verification'):
                export_workspace(client, 'test', 'alloc-123', tmp)
            self.assertNotIn('alloc-123/artifacts.ready', client.objects)
            self.assertEqual(client.progress[-1]['stage'], 'failed')

    def test_failed_upload_aborts_multipart_and_preserves_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'test.txt'
            source.write_text('test')
            client = FakeS3()
            def fail(**_kwargs):
                raise TimeoutError('simulated timeout')
            client.upload_part = fail
            with self.assertRaises(TimeoutError):
                export_workspace(client, 'test', 'alloc-123', tmp)
            self.assertTrue(client.aborted)
            self.assertTrue(source.exists())
            self.assertNotIn('alloc-123/artifacts.ready', client.objects)
            self.assertEqual(client.progress[-1]['stage'], 'failed')

    def test_progress_counts_only_included_file_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'data').mkdir()
            (root / 'data' / 'excluded.txt').write_bytes(b'x' * 512)
            (root / 'included.txt').write_bytes(b'x' * 2048)
            client = FakeS3()
            export_workspace(client, 'test', 'alloc-123', tmp)
            self.assertEqual(client.progress[-1]['total_bytes'], 2048)
            self.assertEqual(client.progress[-1]['processed_bytes'], 2048)


if __name__ == '__main__':
    unittest.main()
