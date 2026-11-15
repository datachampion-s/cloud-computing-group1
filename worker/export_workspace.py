"""Stream a workspace ZIP to S3 and verify it before marking it ready.

The caller mounts the stopped instance's root volume read-only and provides
the workspace path. This module never deletes the source volume.
"""
import argparse
import fnmatch
import hashlib
import io
import json
import os
import signal
import stat
import sys
import tempfile
import time
import zipfile

EXCLUDED = ('data', 'dataset', 'datasets', '*.cache*', '*__pycache__*',
            '*.pyc', '.ipynb_checkpoints', 'venv', '.venv', 'node_modules')
PART_SIZE = 16 * 1024 * 1024


class MultipartSink(io.RawIOBase):
    def __init__(self, client, bucket, key, part_size=PART_SIZE):
        self.client, self.bucket, self.key = client, bucket, key
        self.buffer = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024, mode='w+b')
        self.buffer_size = 0
        self.parts = []
        self.position = 0
        self.part_size = part_size
        self.digest = hashlib.sha256()
        self.upload_id = client.create_multipart_upload(Bucket=bucket, Key=key,
                                                         ContentType='application/zip')['UploadId']

    def writable(self):
        return True

    def seekable(self):
        return False

    def tell(self):
        return self.position

    def write(self, data):
        view = memoryview(data)
        self.digest.update(view)
        self.position += len(view)
        while view:
            count = min(self.part_size - self.buffer_size, len(view))
            self.buffer.write(view[:count])
            self.buffer_size += count
            view = view[count:]
            if self.buffer_size == self.part_size:
                self._upload()
        return len(data)

    def _upload(self):
        if len(self.parts) >= 10000:
            raise ValueError('Archive exceeds multipart upload limit')
        self.buffer.seek(0)
        part = self.client.upload_part(Bucket=self.bucket, Key=self.key,
            UploadId=self.upload_id, PartNumber=len(self.parts) + 1, Body=self.buffer)
        self.parts.append({'PartNumber': len(self.parts) + 1, 'ETag': part['ETag']})
        self.buffer.seek(0)
        self.buffer.truncate()
        self.buffer_size = 0

    def finish(self):
        if self.buffer_size:
            self._upload()
        self.client.complete_multipart_upload(Bucket=self.bucket, Key=self.key,
            UploadId=self.upload_id, MultipartUpload={'Parts': self.parts})
        self.buffer.close()

    def abort(self):
        try:
            self.client.abort_multipart_upload(Bucket=self.bucket, Key=self.key, UploadId=self.upload_id)
        finally:
            self.buffer.close()


def excluded(name):
    return any(fnmatch.fnmatchcase(name, pattern) for pattern in EXCLUDED)


def choose_part_size(workspace):
    # Keep the upload below S3's 10,000-part limit without a second ZIP on disk.
    estimated = 0
    for directory, dirs, files in os.walk(workspace, followlinks=False):
        dirs[:] = [name for name in dirs if not excluded(name)]
        for name in dirs + [name for name in files if not excluded(name)]:
            estimated += os.lstat(os.path.join(directory, name)).st_size + 1024
    required = (estimated * 102 // 100 + 9998) // 9999
    part_size = max(PART_SIZE, ((required + 1048575) // 1048576) * 1048576)
    if part_size > 256 * 1024 * 1024:
        raise ValueError('Workspace is too large for this export worker')
    return part_size


def export_workspace(client, bucket, allocation_id, workspace):
    if not allocation_id or not all(c.isascii() and (c.isalnum() or c in '_-') for c in allocation_id):
        raise ValueError('Invalid allocation ID')
    if not os.path.isdir(workspace) or os.path.islink(workspace):
        raise ValueError('Invalid workspace')
    key = f'{allocation_id}/artifacts.zip'
    marker = f'{allocation_id}/artifacts.ready'
    progress_key = f'{allocation_id}/export-progress.json'
    started = time.time()
    last_report = 0
    processed = 0
    total = 0

    def report(stage, force=False):
        nonlocal last_report
        now = time.time()
        if not force and now - last_report < 10:
            return
        payload = {'stage': stage, 'processed_bytes': processed, 'total_bytes': total,
                   'started_at': started, 'updated_at': now}
        last_report = now
        try:
            client.put_object(Bucket=bucket, Key=progress_key,
                              Body=json.dumps(payload).encode('utf-8'), ContentType='application/json')
        except Exception:
            # A progress display failure must never jeopardize the archive.
            pass

    report('scanning', True)
    for directory, dirs, files in os.walk(workspace, followlinks=False):
        dirs[:] = [name for name in dirs if not excluded(name)]
        for name in files:
            path = os.path.join(directory, name)
            if not excluded(name) and stat.S_ISREG(os.lstat(path).st_mode):
                total += os.lstat(path).st_size
    report('archiving', True)
    # Prevent a previous attempt's marker from exposing a partially replaced ZIP.
    client.delete_object(Bucket=bucket, Key=marker)
    sink = MultipartSink(client, bucket, key, choose_part_size(workspace))
    try:
        with zipfile.ZipFile(sink, 'w', compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
            for directory, dirs, files in os.walk(workspace, followlinks=False):
                dirs[:] = [name for name in dirs if not excluded(name)]
                for name in sorted(dirs + [name for name in files if not excluded(name)]):
                    path = os.path.join(directory, name)
                    relative = os.path.relpath(path, workspace).replace(os.sep, '/')
                    mode = os.lstat(path).st_mode
                    if stat.S_ISLNK(mode):
                        info = zipfile.ZipInfo(relative)
                        info.create_system = 3
                        info.external_attr = 0o120777 << 16
                        archive.writestr(info, os.readlink(path))
                        if name in dirs:
                            dirs.remove(name)
                    elif stat.S_ISDIR(mode):
                        archive.writestr(relative + '/', '')
                    elif stat.S_ISREG(mode):
                        info = zipfile.ZipInfo.from_file(path, relative)
                        info.compress_type = zipfile.ZIP_DEFLATED
                        with open(path, 'rb') as source, archive.open(info, 'w', force_zip64=info.file_size >= 2**31) as target:
                            for chunk in iter(lambda: source.read(1024 * 1024), b''):
                                target.write(chunk)
                                processed += len(chunk)
                                report('archiving')
                    else:
                        raise ValueError('Unsupported file type: ' + relative)
        sink.finish()
    except Exception:
        sink.abort()
        report('failed', True)
        raise

    # Re-read the entire object; a successful upload response alone is not proof
    # the object on S3 matches the stream. Never delete the volume on failure.
    report('verifying', True)
    obj = client.get_object(Bucket=bucket, Key=key)
    body = obj['Body']
    digest = hashlib.sha256()
    try:
        for chunk in iter(lambda: body.read(1024 * 1024), b''):
            digest.update(chunk)
    finally:
        body.close()
    if digest.digest() != sink.digest.digest() or obj['ContentLength'] != sink.position:
        report('failed', True)
        raise ValueError('Uploaded archive verification failed')
    client.put_object(Bucket=bucket, Key=marker, Body=sink.digest.hexdigest().encode('ascii'),
                      ContentType='text/plain')
    report('ready', True)
    return {'bytes': sink.position, 'sha256': sink.digest.hexdigest()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--bucket', required=True)
    parser.add_argument('--allocation-id', required=True)
    parser.add_argument('--workspace', required=True)
    args = parser.parse_args()
    def handle_timeout(_signum, _frame):
        raise TimeoutError('Export exceeded its time limit')
    signal.signal(signal.SIGTERM, handle_timeout)
    import boto3
    export_workspace(boto3.client('s3'), args.bucket, args.allocation_id, args.workspace)
    return 0


if __name__ == '__main__':
    sys.exit(main())
