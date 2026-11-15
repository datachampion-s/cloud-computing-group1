# Applicant and administrator workflows

## Applicant

1. Read the program information and prepare the research proposal.
2. Submit identity and project details, links to student ID and proposal documents, and preferred access times. The review service target is up to three business days.
3. If asked, revise the application. Confirm or decline the admin's proposed schedule.
4. After confirmation and final approval, receive an access grant and redeem it in the compute portal.
5. Start the approved instance during the permitted window and work in JupyterLab.
6. At the deadline, access ends; export can continue independently. When the archive is ready, download the eligible research files within the seven-day access window.

## Administrator

1. Sign in using an authorized Google account and review the proposal and shared documents.
2. Request changes, reject, or approve in principle. Propose a GPU and time, then finalize after applicant confirmation.
3. Review active session status and authenticated access evidence in the admin portal. CPU, RAM and GPU metrics are viewed in AWS CloudWatch.
4. If an export fails, preserve its source disk and follow the recovery procedure. Attendance and IP flags are review signals, not proof of misconduct.

## Workspace and retention

The default Jupyter root is the workspace. Its eligible files are exported, rather than only a fixed pair of directories. Dataset folders, caches, virtual environments and other excluded paths are not included; researchers must keep important results outside excluded paths and download their archives. The access window and the object storage lifecycle are separate mechanisms.
