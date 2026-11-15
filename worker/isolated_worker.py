"""Build user data for a disposable exporter with a read-only source volume."""
import base64
import os
import re


def user_data(bucket, allocation, volume_id, region):
    for value in (allocation, volume_id, region):
        if not re.fullmatch(r'[A-Za-z0-9_-]+', value):
            raise ValueError('Invalid worker input')
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]*[a-z0-9]', bucket):
        raise ValueError('Invalid bucket')
    path = os.path.join(os.path.dirname(__file__), 'export_workspace.py')
    with open(path, 'rb') as source:
        exporter = base64.b64encode(source.read()).decode('ascii')
    volume_serial = volume_id.replace('-', '')
    return f'''#!/bin/bash
set -euo pipefail
trap 'shutdown -h now' EXIT
exec > >(tee /dev/console) 2>&1
export AWS_DEFAULT_REGION='{region}'
dnf install -y python3-boto3
mkdir -p /mnt/source /opt/dcs
printf '%s' '{exporter}' | base64 -d > /opt/dcs/export_workspace.py
device=''
for attempt in $(seq 1 120); do
  device=$(find /dev/disk/by-id -maxdepth 1 -name 'nvme-Amazon_Elastic_Block_Store_{volume_serial}-part1' -print -quit)
  if [ -n "$device" ]; then break; fi
  sleep 5
done
test -n "$device"
mount -t ext4 -o ro,noload,nosuid,nodev,noexec "$device" /mnt/source
timeout 14400 python3 /opt/dcs/export_workspace.py --bucket '{bucket}' --allocation-id '{allocation}' --workspace /mnt/source/home/ubuntu/workspace
'''
