# `xplorer-sync` — v2 architecture plan

**Status:** Proposed, awaiting kickoff
**Supersedes:** [`MONITOR_APPROVE_REVERT_PROPOSAL.md`](./MONITOR_APPROVE_REVERT_PROPOSAL.md) (kept for historical context; that doc evaluated four options inside the existing repo. This v2 plan moves the pipeline to a dedicated repo and adds Telegram + Claude.)
**Repos affected:**
- **New:** `denishoctor/xplorer-sync` — owns the fetch pipeline, safety gate, snapshots, alerts, and review UI. Publishes a vetted `fixtures.json` via GitHub Pages.
- **Consumers:** `denishoctor/north-shore-sunday-minis-comp-app` and `denishoctor/lcjru-fixtures` — both stop fetching directly from Xplorer and instead pull from `xplorer-sync`'s Pages URL.

**Date:** 2026-05-13

---

## 1. Why a separate repo

The current pattern fetches in-repo and commits to `main`, which couples three concerns: data ingestion, safety, and presentation. Moving the pipeline to its own repo gives:

- **One source of truth** — both consumer apps (and any future ones) read the same vetted `fixtures.json`. No duplicated fetch logic.
- **Independent release cadence** — pipeline changes don't churn the consumer apps' git history with 144 daily fixture-refresh commits.
- **Clean audit log** — every fetch is a commit on `xplorer-sync`, with snapshots and Claude verdicts attached. Consumer repos stay focused on UX.
- **Smaller blast radius** — a bad fetch can never break the consumer apps' code or deploys; it can only fail to update the data they read.

## 2. Data flow

```
                    ┌──────────────────────────────────────┐
                    │            xplorer-sync              │
                    │  (new repo, GitHub Pages enabled)    │
                    │                                      │
   Xplorer ──fetch──▶  candidate.json                      │
                    │       │                              │
                    │       ▼                              │
                    │  Deterministic gate (6 thresholds)   │
                    │       │                              │
                    │   ┌───┴───┐                          │
                    │   │       │                          │
                    │  clear  ambiguous                    │
                    │   │       │                          │
                    │   │       ▼                          │
                    │   │   Claude (claude-code-action)    │
                    │   │       │                          │
                    │   ▼       ▼                          │
                    │   auto-promote OR hold-for-review    │
                    │       │                              │
                    │       ▼                              │
                    │   fixtures.json  ◀── /snapshots/*.json
                    │       │                              │
                    └───────┼──────────────────────────────┘
                            │ (GitHub Pages)
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
   north-shore-sunday-  lcjru-fixtures  (any future
   minis-comp-app                         consumer)
```

## 3. `xplorer-sync` internals

### Cron
`.github/workflows/fetch.yml`, every 10 min (`*/10 * * * *`).

### 1. Fetch
`scripts/fetch.ts` pulls Xplorer, normalises to canonical JSON, stamps `fetched_at` and a content hash. Output: `candidate.json` (not committed yet).

### 2. Deterministic safety gate
`scripts/gate.ts` compares `candidate.json` vs current `fixtures.json` on six checks:

| Check | Auto-block threshold | Ambiguous (→ Claude) |
|---|---|---|
| Total match count drop | > 30% | 5–30% |
| Scores nulled on completed matches | any | — |
| Mass venue change | > 50% of a round | 10–50% |
| Mass time change | > 50% of a round | 10–50% |
| Round completely vanishing | any | — |
| New round appearing | — | always (sanity-check) |

Gate outcomes:
- **All green + no diff** — no-op, exit clean.
- **All green + benign diff** (e.g. score updates for past games) — auto-promote, write snapshot, commit `fixtures.json`.
- **Any red** — hold, alert Telegram, no promotion.
- **Ambiguous** — hand off to Claude (next step).

### 3. Claude verdict (Option B — ambiguous fetches only)
Only fires when the gate returns `ambiguous`. Uses the official `anthropics/claude-code-action@v1` with a `CLAUDE_CODE_OAUTH_TOKEN` tied to a Claude Max subscription, so usage counts against the Max quota rather than per-token API billing.

```yaml
- name: Claude verdict
  if: steps.gate.outputs.status == 'ambiguous'
  uses: anthropics/claude-code-action@v1
  with:
    claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
    prompt_file: prompts/verdict.md
    allowed_tools: "Read"
```

`prompts/verdict.md` includes the diff + the gate's reasoning, and asks for structured JSON:

```json
{ "verdict": "approve|hold|reject",
  "confidence": "high|medium|low",
  "summary": "Round 7 venue changes for 4 matches…",
  "concerns": ["..."] }
```

- `approve` → auto-promote.
- `hold` → alert Telegram with Claude's summary.
- `reject` → alert + lock.
- Step fails / OAuth invalid → fall back to **hold** (safe default).

Cost: $0 incremental, eats into Max quota (negligible at ~1–2 ambiguous fetches/day).

### 4. Snapshots
Every promote writes `snapshots/YYYY-MM-DDTHH-MM.json` plus an entry in `snapshots/index.json` with hash, gate result, and Claude summary if any. Retained 90 days, then thinned to weekly. Compaction is a v2 issue.

### 5. Publish
`fixtures.json` and `snapshots/` served via GitHub Pages on the `xplorer-sync` repo. Consumers fetch with `?_=<timestamp>` to bust browser cache.

## 4. Telegram bot

**Setup:** BotFather → bot token in Actions secret. Authorized admin = a single Telegram user ID locked in config.

**Inbound (webhook):** Tiny Cloudflare Worker (free tier) receives Telegram updates:
- Verifies sender is the authorized user ID.
- For `/approve <snapshot_id>`, calls GitHub's `workflow_dispatch` API to trigger the corresponding workflow.
- Replies in-chat with the dispatch result.

Fallback if you'd rather avoid the Worker: a 5-min cron Action that polls `getUpdates`. Worker is recommended — 1s vs 5min latency matters for "approve this now".

**Outbound (alerts):** `xplorer-sync` workflow posts to chat via `sendMessage`. Format:

```
⚠ Xplorer fetch held for review
Snapshot: a1b2c3d4
Gate: ambiguous (mass venue change in R7)
Claude: "4 matches moved Tantallon → Wakehurst, no other deltas, plausible re-draw"

[Approve]  [Reject]  [View diff]
```

Inline buttons are signed magic-links (see §6).

**Commands:**
- `/status` — current state, last fetch time, pending count
- `/approve <id>` / `/reject <id>` — act on a snapshot
- `/revert <id>` — promote an older snapshot as current
- `/pause` / `/resume` — toggle auto-promote
- `/last` — Claude's last verdict + diff link

WhatsApp via Twilio was evaluated and deferred — not free at any volume (~$2–4/mo for our message volume). Tracked as a follow-up.

## 5. Review UI

Tiny static page on the same Pages site at `/review`. Shows:
- Current `fixtures.json` summary
- Pending snapshots with diff highlighting (added / removed / changed)
- Snapshot timeline picker
- Same three buttons as Telegram (Approve / Reject / Revert)

Built with the existing consumer-app stack pattern (vanilla JS + ES modules, GitHub Pages static hosting).

## 6. Auth on review actions

Bearer token in the magic-link, HMAC over `(action, snapshot_id, exp)` using `REVIEW_SECRET` (Actions secret). 1-hour TTL. Each link is single-use (nonce stored in Cloudflare KV alongside the Worker). Compromise blast radius: one action, one snapshot, one hour.

Bolt on GitHub OAuth in a follow-up if a second admin ever joins.

## 7. Consumer-app changes

Minimal: replace the in-repo Xplorer fetch with a fetch from the `xplorer-sync` Pages URL. Same `fixtures.json` shape, so consumer render code is untouched. The fixture-refresh chore commits in the consumer repos disappear.

## 8. Phased rollout

1. **Stand up `xplorer-sync`** with fetch + deterministic gate only. Publish `fixtures.json` to Pages. No Claude, no Telegram yet — run alongside the existing pipeline for ~3 days to verify output parity.
2. **Cut over consumers.** Point `north-shore-sunday-minis-comp-app` and `lcjru-fixtures` at the Pages URL. Old fetch paths deleted.
3. **Add Telegram bot** (outbound alerts only — no command handling yet). Start receiving incident alerts.
4. **Add Claude verdict step.** Once a week of gate-only data shows what "ambiguous" actually catches.
5. **Add review UI + inbound Telegram commands.** Approve/reject from anywhere.

(The hash-filter / venue-filter work in the consumer apps is independent and ships in parallel from step 1 onwards — tracked separately.)

## 9. Follow-up issues to file

- **`feature/option-d-local-llm`** — explore a small local model (e.g. Llama 3.2 3B, Qwen 2.5 7B) or a small cloud model (Haiku) replacing the Max-quota Claude call. Goal: zero ongoing cost, no quota dependency. Long-running Claude Code session as primary brain (original Option D) is a sub-route to evaluate.
- **`feature/whatsapp-via-twilio`** — re-evaluate once volume or admin count grows; Twilio's ~$2–4/mo is small but not free.
- **`ops/snapshot-compaction`** — daily/weekly thinning job once `snapshots/` grows past ~1000 files.
- **`feature/oauth-admins`** — GitHub OAuth for the review UI if a second admin is onboarded.

## 10. Open questions before kickoff

1. **Pages domain** — host the sync site at `<gh-user>.github.io/xplorer-sync/` or a custom subdomain (`fixtures.<yourdomain>`)?
2. **Bot inbound** — Cloudflare Worker (recommended, 1s latency) or 5-min polling cron Action (zero infra, 5min latency)?
