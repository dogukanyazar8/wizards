> Historical runner setup. Active workflows now use GitHub-hosted runners; see [current CI/CD setup](github-hosted-ci-cd.md). These local machines are optional developer tooling.

# Local VM GitHub Actions operations

GitHub Actions is the sole CI/CD orchestrator. Repository jobs execute only on
the two local Linux VM runners below; CircleCI is not part of the active path.

| Runner                | Required labels                                                             | Responsibility                                                       |
| --------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `wizards-ci-fast`     | `self-hosted`, `Linux`, `X64`, `ci-fast`                                    | contracts, actionlint, TypeScript and desktop operations             |
| `wizards-linux-local` | `self-hosted`, `Linux`, `X64`, `wizards-ci`, `playwright`, `mobile-release` | full verification, security, E2E, device evidence and mobile release |

Persistent self-hosted runners must not execute pull-request code. The workflow
contract enforces that boundary. Keep repository permissions read-only by
default and grant narrower write permissions only to the step that needs them.

## Host startup and identity check

Run these commands from an **elevated PowerShell** window. Discover the exact VM
names first; never start, stop, or reconfigure an unverified VM by guesswork.

```powershell
Get-VM | Select-Object Name, State, AutomaticStartAction, AutomaticStartDelay
```

After matching the VM console/description to `wizards-ci-fast` and
`wizards-linux-local`, start only those exact names:

```powershell
Start-VM -Name '<verified-fast-vm-name>', '<verified-heavy-vm-name>'
```

Optional host-boot recovery, only after the identities above are verified:

```powershell
Set-VM -Name '<verified-fast-vm-name>', '<verified-heavy-vm-name>' -AutomaticStartAction StartIfRunning
```

`StartIfRunning` avoids unexpectedly powering on a VM that an operator had
deliberately shut down before the host restart.

## Guest runner services

On each Linux guest, discover the installed service unit rather than guessing
its repository/organization suffix:

```bash
systemctl list-unit-files 'actions.runner.*.service'
systemctl --no-pager --full status 'actions.runner.*.service'
```

Enable and start the exact discovered unit:

```bash
sudo systemctl enable --now '<verified-actions.runner.service>'
```

Do not print runner registration tokens. A runner that has lost registration
must be reconfigured using a newly generated short-lived token in the guest;
never commit or paste it into logs.

## GitHub health and UAT run

These checks are read-only and require an authenticated `gh` session with
repository metadata access:

```powershell
gh api repos/dogukanyazar8/wizards/actions/runners --jq '.runners[] | [.name,.status,.busy,([.labels[].name] | join(","))] | @tsv'
gh run list --repo dogukanyazar8/wizards --workflow CI --branch uat --limit 5
```

Both runner statuses must be `online` before rerunning a queued or failed UAT
workflow. Rerun only after confirming the run belongs to the intended UAT SHA:

```powershell
gh run view <verified-run-id> --repo dogukanyazar8/wizards --json headSha,status,conclusion,url
gh run rerun <verified-run-id> --repo dogukanyazar8/wizards
gh run watch <verified-run-id> --repo dogukanyazar8/wizards --exit-status
```

## CircleCI retirement

Repository CircleCI configuration is removed. In the authenticated CircleCI
project UI, verify organization `dogukanyazar8`, project `wizards`, and the
current settings immediately before selecting **Stop Building** / **Unfollow
Project**. Do not delete organization contexts or credentials during this
cutover; retaining them keeps rollback recoverable without consuming compute.

Rollback is explicit: restore `.circleci/config.yml`, `.circleci/main.yml`, and
their contract test from Git history, re-enable the verified project, then run
the restored contract locally before accepting a CircleCI build.

## Evidence boundaries

A green GitHub Actions run proves CI for that exact SHA only. It does not prove
Railway deployment/readiness, database migration, mobile device acceptance, or
desktop installer acceptance; record those independently.
