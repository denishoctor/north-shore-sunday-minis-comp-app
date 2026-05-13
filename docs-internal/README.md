# docs-internal

Design notes and staging upstream patches that aren't appropriate for the
published GitHub Pages site. Nothing here ships to users.

## What's in here

| File | Purpose | Status |
|---|---|---|
| [`UPSTREAM_PATCH.md`](UPSTREAM_PATCH.md) | Diff to apply to `denishoctor/lcjru-fixtures` for the backwards-compatible fan-out refactor that this repo depends on. | Staging — open as PR upstream when ready. |
| [`LCJRU_UPSTREAM_VENUE_DETAILS_PR.md`](LCJRU_UPSTREAM_VENUE_DETAILS_PR.md) | Draft PR text for syncing venue details into the upstream LCJRU repo. | Staging. |
| [`XPLORER_SYNC_PLAN.md`](XPLORER_SYNC_PLAN.md) | Plan for keeping Rugby Xplorer data in sync. | Reference. |
| [`MONITOR_APPROVE_REVERT_PROPOSAL.md`](MONITOR_APPROVE_REVERT_PROPOSAL.md) | Architecture proposal — staging branch + approval gate + revert workflow for fixture refreshes. | **Proposed, NOT implemented.** Discuss before building. |

## Why this folder exists

`docs/` is served by GitHub Pages. Anything we drop there ends up at the
public URL, which is not what we want for half-baked design notes and
upstream-patch staging text. Keeping them at `docs-internal/` makes the
intent clear and avoids accidental publication.
