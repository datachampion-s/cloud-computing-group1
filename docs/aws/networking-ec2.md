# Networking, EC2, DNS and Jupyter setup

## Why these resources exist

The GPU EC2 instance runs a temporary JupyterLab for one approved allocation. Its **VPC** provides the network, a **subnet** places the instance in an availability zone, and a **security group** controls network traffic to it. The **Elastic IP** supplies a stable public address as instances come and go. A wildcard DNS record maps per-allocation lab hostnames to that IP; Nginx terminates HTTPS before forwarding to local Jupyter. The public website itself is on Vercel, not this EC2 host.

## 1. Region, quota and VPC

1. Select the deployment region in AWS Console. The observed system uses `us-east-1`; use the same region for EC2, EIP, VPC, AMIs and the lifecycle stack.
2. In Service Quotas → Amazon EC2, inspect On-Demand quotas for the desired GPU family. `g4dn.xlarge` uses four vCPUs; a four-vCPU approved family quota allows at most one such instance under that quota, subject to capacity and other usage. An approved quota does not reserve hardware.
3. In VPC → Your VPCs/Subnets identify a subnet in the intended VPC with public IP connectivity, DNS resolution and an internet route; allow outbound access to package repositories, AWS APIs and Let's Encrypt. Note its VPC and AZ. The current launch code supplies a security group and does not explicitly specify a subnet, so verify the account's default subnet selection works with that group/VPC; do not assume an arbitrary non-default VPC will work without adapting the launch configuration.
4. The export worker must be launched in the source volume's availability zone. The controller uses the GPU subnet for that reason. Worker package download and S3 access also require outbound network connectivity.

## 2. GPU security group

1. EC2 console → **Network & Security** → **Security Groups** → **Create security group**.
2. Choose a descriptive name and the VPC used by the GPU subnet. Add inbound TCP **443** from `0.0.0.0/0` for lab HTTPS and TCP **80** from `0.0.0.0/0` for Let's Encrypt HTTP-01 issuance. Public access is intentional for users and certificate validation; Jupyter authentication and HTTPS still matter. Only add IPv6 rules if the deployment is configured and reviewed for IPv6.
3. Retain outbound connectivity needed by bootstrap, AWS APIs and package downloads, under the organization's network controls. Do not expose Jupyter's local port `8889` or unrestricted SSH.
4. Create the group and set `AWS_GPU_SECURITY_GROUP` to the resulting `sg-...` ID. The worker security group is separate and is created by the lifecycle stack. [AWS security-group instructions](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/creating-security-group.html).

## 3. Elastic IP and DNS

1. EC2 → **Elastic IPs** → **Allocate Elastic IP address**, in the same region/network border group as the instance. Record the public IP and `eipalloc-...` allocation ID. Public IPv4 addresses can incur charges.
2. In the DNS provider for `datachampions.tech`, add an **A** record named `*.lab.hpc` pointing to that IP. This resolves `<allocation-id>.lab.hpc.example.org`. Verify the zone and authoritative nameservers before changing records.
3. Set `AWS_LAB_DOMAIN=lab.hpc.example.org`, `AWS_LAB_PUBLIC_IP=<allocated IPv4>`, and `AWS_LAB_EIP_ALLOCATION_ID=<allocation ID>` in the application environment. Configure `hpc.example.org` independently in Vercel as the web domain.
4. Verify DNS with `nslookup example.lab.hpc.example.org`; this only validates name resolution, not HTTPS or app readiness. The app associates the EIP with the active GPU after launch; do not manually bind it to a permanent host. A shared IP permits one active host at a time.

## 4. AMI and application bootstrap

1. Choose a tested Ubuntu 22.04 NVIDIA-driver GPU AMI in the same region; record its AMI ID in `AWS_GPU_AMI_ID`. The observed base image is listed in [AWS overview](README.md); IDs are regional and can age.
2. Select a GPU instance type supported by both AMI and approved quota. The app's supported values are `g4dn.xlarge`, `g5.xlarge`, `g6.xlarge`, `t3.small`, and `t3.medium`; CPU types are useful only for controlled tests. Compatibility and available capacity must be checked.
3. The app creates an encrypted gp3 root EBS volume, retains it on termination, requires IMDSv2 and tags the instance and volume. Its user-data script creates `/home/ubuntu/workspace`, installs/configures Nginx, certbot and Jupyter as needed, obtains a certificate for the allocation hostname and configures the expiry timer. The configured base image and bootstrap must provide Python 3.10.
4. Jupyter binds to `127.0.0.1:8889`; Nginx serves public TLS on 443. Certificates are requested at launch using HTTP-01 on 80. Issuance can fail due to DNS propagation, network rules, CA limits or unavailable services. Inspect cloud-init/instance logs in a controlled environment.
5. Start and inspect through the portal, not by creating a permanent manual GPU instance. Record instance, tags, EBS and allocation for troubleshooting; confirm automatic expiry and subsequent export before use.

References: [Elastic IP allocation](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/working-with-eips.html), [security groups](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/creating-security-group.html).
