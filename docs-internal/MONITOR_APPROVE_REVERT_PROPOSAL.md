# Architecture Proposal — Xplorer feed monitor / approve / revert

> ⚠️ **Status: DESIGN PROPOSAL — NOT IMPLEMENTED.**
> This file is a draft for discussion. Nothing here has shipped, and the
> options below are not decided. Don't implement the proposed pipeline
> without first opening an issue and getting sign-off — the change touches
> the fetch + commit critical path on both this repo and the upstream
> `lcjru-fixtures`.

**Repos affected:** `denishoctor/north-shore-sunday-minis-comp-app` (this repo) and `denishoctor/lcjru-fixtures` (upstream). Same shape applies to both — they share the fetch + commit pipeline.
**Date:** 2026-05-13

## 1. Context

Rugby Xplorer is the source of truth for fixtures, but it's an unreliable upstream:

1. **Total outages** — endpoint returns 5xx / empty / hangs. The hourly cron fails or writes an empty `fixtures.json`.
2. **Broken uploads** — Xplorer's data entry occasionally introduces wrong venues / wrong times / removed matches. They're slow to correct, sometimes days.
3. **Subtle silent edits** — a venue swap that reverts a few hours later. Without a record, you can't tell whether it really moved or whether Xplorer flickered.

Today's pipeline:

```
hourly cron → fetch → overwrite docs/fixtures.json
                   → overwrite docs/*.ics
                   → git commit + push main
                   → GitHub Pages auto-deploys
                   → ntfy.sh notification (post-hoc)
```

Failure modes for the **user-facing site**:

| Upstream condition | Current behaviour | Desired behaviour |
|---|---|---|
| Endpoint down | Workflow fails after retries; no commit; site stays on last good data ✅ | Same as today (already correct) |
| Endpoint returns empty | Overwrites `fixtures.json` with `matches: []`; site goes blank ❌ | Refuse to overwrite if previous run had matches; alert |
| Endpoint returns partial (drops half the matches) | Site loses half the matches; notification is post-hoc ❌ | Hold change for review; alert with diff |
| Subtle change reverted by next run | No audit trail; can't tell from change-log alone ❌ | Snapshot every fetch; diff history queryable |
| Bad change shipped | Manual rollback = `git revert` + force-push, plus busting Pages cache | One-command revert to a labelled snapshot |

## 2. Options

### Option A — GitHub-native PR approval

Hourly cron opens a PR (`bot/refresh-fixtures-<timestamp>`) with the new data. PRs that pass safety checks auto-merge; "risky" PRs wait for manual review.

| | |
|---|---|
| **Pros** | Zero new infra · GitHub UI for diff review · `gh pr revert` is one click · approval flow already exists |
| **Cons** | One PR per hour is noisy · admin must be on GitHub to approve · risks PR queue backlog during multi-hour Xplorer outages |
| **Revert** | `gh pr revert <PR#>` then `gh pr merge` |

### Option B — Two-branch (staging + main)

`staging` branch receives the hourly auto-commits. A second workflow runs safety checks and fast-forwards `main` to `staging` if safe. Pages serves from `main`.

| | |
|---|---|
| **Pros** | Single integration point for safety gate · easy to inspect `staging…main` · revert = `git reset main` to prior SHA · no PR noise |
| **Cons** | Two-branch model to maintain · "staging" git ref vs Pages's "main" decoupling requires care |
| **Revert** | `git reset --hard main@{n}` + push --force-with-lease (or via a revert script) |

### Option C — In-place snapshots + circuit breaker

Keep the single-branch model. Add hard thresholds: empty fetch refuses to overwrite; per-fetch snapshot lands in `docs/snapshots/`. One-shot revert script restores from a snapshot.

| | |
|---|---|
| **Pros** | Smallest delta to today · no two-branch mental model · snapshots usable for change diffing · zero approval friction (everything auto) |
| **Cons** | No human-in-the-loop for "risky but not catastrophic" changes — bad-but-plausible data still ships |
| **Revert** | `node scripts/revert.mjs --to 2026-05-12T08` |

### Option D — Hybrid (recommended)

`staging` branch + automated safety gate + manual override.

Day-to-day: indistinguishable from today (auto-promote within 60s). When Xplorer wobbles: hold + notify + admin clicks once to approve or revert.

```
cron → fetch into staging branch
     → safety gate workflow:
         ├─ PASS → auto fast-forward main to staging (live in 60s)
         └─ FAIL → hold, ntfy: "review at https://github.com/.../compare/main...staging"
                   admin clicks "Promote" workflow_dispatch to merge, OR
                   discards (next fetch overwrites staging)
snapshot every successful fetch under docs/snapshots/YYYY-MM-DD-HH.json
revert: workflow_dispatch "Restore snapshot" with date arg
```

| | |
|---|---|
| **Pros** | Auto when safe · gated when not · snapshots give audit + revert · single integration surface (workflow files) |
| **Cons** | More moving parts than Option C · two-branch model |
| **Revert** | (1) `gh workflow run restore --field date=2026-05-12T08` · or (2) reset staging to prior commit + promote |

## 3. Decision

**Recommended: Option D (Hybrid).**

Reasoning:
- Matches the user's mental model — *"control and approve changes"* implies an approval flow, not just a safety net
- Auto-promote for 99% of runs (no friction during normal weeks)
- Hold on the 1% that matters (the broken-upload scenarios you flagged)
- Snapshots cover the "Xplorer flickered" forensic case Option A and B don't address directly
- Both repos can share the same workflow shape; the safety thresholds become a config knob

Fallback if Option D feels heavy: ship Option C first (smallest delta, addresses the empty-overwrite case), then layer the staging branch + approval gate later.

## 4. Safety-gate thresholds (Option D)

The gate runs after every fetch into `staging`. **Auto-promote unless any of these trip:**

| Check | Threshold | Why |
|---|---|---|
| **Match count drop** | New < 90% of previous run's count | Catches half-the-fixtures-disappeared scenario |
| **Total matches = 0** | Any zero post-season-start | Catches empty / outage masquerading as success |
| **Score regression** | Any match flipped result→fixture (score nulled) | Catches Xplorer un-recording a played game |
| **Mass date shift** | >5 fixtures with `dateTime` changed by >24h in a single run | Catches grading-resort glitches |
| **Venue exodus** | >10 fixtures changing venue in one run | Catches admin tooling fat-finger |
| **First run** | No previous data | Auto-promote (nothing to compare to) |

Threshold values are config in `scripts/safety.mjs` so they can be tuned per repo.

## 5. Implementation outline (Option D)

### 5.1 New files / changes

**This repo (and same shape in `lcjru-fixtures`):**

```
scripts/
  fetch-fixtures.mjs   — unchanged (writes docs/fixtures.json etc.)
  safety.mjs           — NEW: pure functions: shouldPromote(oldData, newData) → { ok, reasons[] }
  snapshot.mjs         — NEW: writes docs/snapshots/<ISO>.json; trims to N latest
.github/workflows/
  refresh-fixtures.yml — RUNS ON: staging branch (default: main → staging)
  safety-gate.yml      — NEW: triggered on push to staging, runs safety.mjs
                          PASS → fast-forwards main to staging
                          FAIL → opens an issue + ntfy "review needed"
  promote.yml          — NEW: workflow_dispatch — manual promote staging → main
  restore.yml          — NEW: workflow_dispatch with `snapshot: YYYY-MM-DD-HHmm` arg
                          restores fixtures.json + ICS files from snapshot, commits to main
docs/
  snapshots/           — NEW: per-fetch JSON snapshots
  fixtures.json        — promoted from staging on safety pass
```

### 5.2 Workflow sketch

```yaml
# refresh-fixtures.yml — change ref to staging branch only
- name: Fetch
  run: node scripts/fetch-fixtures.mjs
- name: Snapshot
  run: node scripts/snapshot.mjs --keep 168   # 7 days @ hourly
- name: Commit to staging
  run: git push origin HEAD:staging
```

```yaml
# safety-gate.yml — fires on push to staging
- uses: actions/checkout@v4
  with: { ref: staging, fetch-depth: 0 }
- name: Check
  id: check
  run: node scripts/safety.mjs --against main > safety.json
- name: Auto-promote
  if: fromJSON(steps.check.outputs.json).ok
  run: |
    git checkout main
    git reset --hard staging
    git push origin main
- name: Hold for review
  if: '!fromJSON(steps.check.outputs.json).ok'
  uses: ... ntfy + create issue with the diff body
```

```yaml
# promote.yml — manual approve
on: workflow_dispatch
jobs:
  promote:
    steps:
      - run: |
          git checkout main
          git reset --hard staging
          git push origin main
```

```yaml
# restore.yml — manual revert
on:
  workflow_dispatch:
    inputs:
      snapshot: { required: true, description: "ISO-ish: 2026-05-12T08" }
jobs:
  restore:
    steps:
      - run: node scripts/restore.mjs --from docs/snapshots/${{ inputs.snapshot }}.json
      - run: git commit + push main
```

### 5.3 Notifications

Reuse the existing `NTFY_TOPIC_NSM_SUNDAY` secret. Three new title prefixes:

- `"NSM Sunday · auto-promoted"` (low priority, every successful run)
- `"NSM Sunday · review needed"` (high priority, includes reason summary + link to compare URL)
- `"NSM Sunday · restored to <snapshot>"` (high priority, audit trail)

If you'd rather skip the chatty auto-promote pings: gate them behind a `VERBOSE_NOTIFICATIONS` env var.

### 5.4 The compare URL the admin clicks

```
https://github.com/denishoctor/north-shore-sunday-minis-comp-app/compare/main...staging
```

GitHub renders the fixtures.json diff. If it looks right → click "Promote" workflow_dispatch button. If not → click "Restore" workflow_dispatch with the last good snapshot's date.

### 5.5 Rollout plan

1. **Week 1** — ship `scripts/safety.mjs` + snapshot logic in *advisory* mode: every fetch still auto-promotes, but the safety-gate workflow logs what it *would have* held. Builds a baseline of false-positive frequency.
2. **Week 2** — review the log of held-vs-promoted decisions; tune thresholds.
3. **Week 3** — flip the gate to *enforce*: holds become real, ntfy "review needed" lands in your phone.
4. **Ongoing** — `restore.yml` available as the "oh no" button.

## 6. Consequences

- **Hourly Actions usage** roughly doubles (refresh + safety-gate workflows). Each is sub-minute on cached node-deps. GitHub free tier still well within budget.
- **Snapshots growth**: ~50 KB per snapshot × 168 hourly retained = ~8 MB. Trim policy in `snapshot.mjs` keeps the repo lean.
- **One new concept** for the maintainer: the `staging` branch exists. Day-to-day they shouldn't need to know — only when reviewing a held update.
- **PR #2's rebase-then-push loop** in `refresh-fixtures.yml` already handles concurrent-push races; staging push inherits this.
- **lcjru-fixtures** can land the same workflow files unchanged — both repos share the safety-gate shape; only the NTFY topic + repo name differ.

## 7. Open questions

- **Score-regression check** assumes results are immutable once posted. If Xplorer corrections do legitimately edit scores (typo fixes), the gate would trigger false positives. Mitigation: ignore score changes within the first 24h of game end (Xplorer's typical correction window).
- **Gala day matches** appear out-of-pattern (date pulled from a different draw). Need to confirm they don't trip the "mass date shift" check. May want to whitelist gala rounds.
- **Snapshot privacy** — fixtures are public, so no PII concern. Lineups (`lineups.json`) contain player names; current `fetch-lineups.mjs` skips ages with no sheet submitted, but worth deciding whether snapshots include lineups or just fixtures. Recommend: fixtures only, lineups stay live-only.

## 8. Next step

Confirm Option D is the direction, then I'll:

1. Write `scripts/safety.mjs` (pure, unit-tested) — covers the 6 thresholds
2. Write `scripts/snapshot.mjs` + `scripts/restore.mjs`
3. Adapt `refresh-fixtures.yml` to write to `staging`
4. Add `safety-gate.yml`, `promote.yml`, `restore.yml`
5. Ship in advisory mode (week 1 of rollout)
6. Mirror to `lcjru-fixtures` as a separate PR (or same-shaped file diff)

If you'd rather start with Option C as a stepping stone (snapshots + circuit breaker only, no staging branch), say the word and I'll scope that down — it's ~30% of Option D's surface and addresses the empty-overwrite case immediately.
