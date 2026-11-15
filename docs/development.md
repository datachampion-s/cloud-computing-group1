# Development and verification

## Local setup

Install a supported Node.js version for the Next.js version in the lockfile and Python 3 for worker tests. From the repository root:

```sh
npm install
# Copy .env.example to .env.local and fill the required values securely.
npm run dev
```

Open `http://localhost:3000/landing`. The app reads local environment variables from `.env.local`; do not commit it. Supabase, OAuth, Gmail and AWS access are separate dependencies. Local AWS calls use configured application credentials and can create billable resources if lifecycle is enabled. Keep it disabled unless deliberately testing an isolated environment. Non-production preview routes are gated off in production.

## Checks

```sh
npm test
python -m unittest discover -s worker -p 'test_*.py'
npm run build
```

Tests do not replace an isolated end-to-end validation of OAuth, instance launch, HTTPS, expiry, export, download, alerts and cleanup. Production tests can incur charges and alter real data. `worker/live_isolated_smoke.py` is a live AWS helper with potentially stale assumptions; inspect and adapt it for a disposable environment before use.

## Change guidance

- Read `src/app/api` and `src/lib` before changing behavior; UI, validation, database RPC and email are often part of the same workflow.
- Review both sides when changing environment variables, IAM, CloudFormation parameters, tags, S3 keys or workspace paths.
- Add database changes as reviewed incremental migrations and test against a disposable copy. Never commit production exports, secrets or personal data.
- When changing lifecycle scripts, test Python behavior, update the uploaded Lambda bundle and CloudFormation deployment, then validate actual deployed versions separately from the repository.
- Keep documentation current when architecture, operational settings, retention or workflow changes.
