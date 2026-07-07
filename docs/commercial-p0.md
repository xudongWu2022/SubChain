# Commercial P0 — the minimum to earn "agent runtime governance"

**Scope.** The spec for the closed-source control plane's first shippable release —
*what has to be true before we may call the product "agent runtime governance."* Not a
roadmap. Everything here is the **delta on top of the OSS**; the open-source gateway is
P0's data plane. The OSS stays a denial-of-wallet **spend gateway** and must not be
called "agent security" (it has no identity, RBAC, or tool governance) — see
[threat-mapping.md](threat-mapping.md).

**The closed loop P0 must complete:**

> **identity** → **scoped credential** → **per-tool budget + versioned policy** →
> (**approval** if high-impact) → enforce & record → **immutable audit** → **kill switch**

Miss any link and an agent's tool spend is unattributed, unbounded, or unaccountable —
and the governance claim doesn't hold.

## What the OSS already gives P0 (don't rebuild — wrap it)

- Pre-spend allow/deny + **worst-case budget reservation** across LLM and non-LLM rails.
- **Kill-switch** primitive (`freeze` / `unfreeze` by agent / budget) — P0 widens its scope.
- `gateway_decisions` ledger (decision, cost, reasons, reservation) + per-row evidence
  hashes — P0 extends its schema.
- Policy-as-JSON with `validate-policy` / `audit-config`.
- Deterministic detectors + governed AI triage.

## The seven controls — OSS today → P0 delta → done when

| # | Control | OSS today | P0 delta (build this) | Done when |
|---|---|---|---|---|
| 1 | **Agent identity** | `X-Agent-ID` header, self-asserted; one shared gateway token | Each agent gets an **issued, verifiable identity** (keypair or OIDC workload identity) bound to a **tenant**; the gateway authenticates it and never trusts the header alone | A forged `X-Agent-ID` is rejected; every decision carries a verified `(tenant, agent)` |
| 2 | **Scoped credentials** | On allow, the gateway swaps in the **full** provider key | **Short-lived, per-task/tool scoped** creds (minted on allow, TTL-bound, least-privilege); the full provider key never reaches the agent | A leaked issued cred expires and can't be replayed for another tool or scope |
| 3 | **Per-tool budget** | Budgets per `x_budget_id` / rail | Budget + risk **per tool** — browser, code-interpreter, MCP tool, search, payment, email, CRM — not just model calls | A browser-tool runaway is capped even while the LLM budget is healthy |
| 4 | **High-impact approval** | none | **Step-up / human confirm** for consequential actions (spend over threshold, payment rail, new merchant, destructive tool): pause + out-of-band approve | A payment above threshold blocks pending an approver, and the wait is audited |
| 5 | **MCP / tool registry** | providers catalog (LLM / tool / payment) | **Tool allowlist + schema audit + metadata-change detection**; reject tokens not issued to the server (no passthrough) | A silently changed MCP tool schema is flagged and the call denied until re-approved |
| 6 | **Audit log** | `gateway_decisions`: decision, cost, reasons | Add **tenant, user, tool, scope, policy version, override**; make events **append-only / immutable** with retention + export | "Who changed the policy, and what did it deny last Tuesday" is answerable and exportable |
| 7 | **Kill switch** | freeze by agent / budget | Freeze by **agent / tenant / tool / scope**, propagated **instantly** across instances | One call halts a compromised tenant's tool spend everywhere within one propagation cycle |

## Data-model delta

New tables around the OSS ledger: `tenants`; `users` (+ role); `agent_identities`
(tenant, pubkey / issuer, status); `scoped_grants` (agent, tool, scope, expiry, status);
`tool_registry` (tool, schema hash, source, approved_at); `approvals` (request, approver,
state); and an append-only **`audit_events`** stream (actor, tenant, action, target,
policy_version, before/after hash). Policy gains a **version** (content hash + author +
timestamp) so every decision references the exact policy it ran under.

## Enforcement points

- **Identity + scoped creds** — at gateway ingress (authenticate *before* `decide`).
- **Per-tool budget + MCP registry checks** — inside `decide()`, extended with a
  `tool` / `scope` dimension.
- **Approval** — a pause state between *allow* and *forward*: hold the reservation, await
  the approver, then release or forward.
- **Kill switch** — the OSS already reloads policy per request; P0 makes the freeze set
  tenant / tool-scoped and pushes it to every instance.
- **Audit** — each of the above emits an immutable `audit_events` row.

## Compliance baseline (cheap now, painful later)

Not "we make you compliant." But the EU AI Act sets a design floor: high-risk deployers
must retain automatically generated logs **≥ 6 months** within their control. So P0 ships
with **policy versioning + append-only audit events + retention config + export** from day
one. See [threat-mapping.md](threat-mapping.md) §Compliance.

## Explicitly NOT in P0 (keep it lean)

Deferred to the enterprise tiers in [enterprise-readiness.md](enterprise-readiness.md):
SSO / SAML / SCIM, a full RBAC UI, Postgres / HA / multi-region, SIEM / ITSM integrations,
policy-simulation UI, on-chain (ERC-7715) enforcement, chargeback / showback reporting.
P0 is the **governance closed loop** — single-region, API-first — not the enterprise
platform.

## Acceptance — P0 is done when

> A tool call by a **verified agent** in a **tenant**, using a **short-lived scoped
> credential**, is checked against a **per-tool budget** and a **versioned policy**,
> **paused for approval** if high-impact, **recorded in an immutable audit event** with
> cost and policy version, and **stoppable instantly** by a tenant/tool-scoped kill
> switch — with the full provider key never touching the agent.

Only then may the product be called "agent runtime governance."

## References

- [threat-mapping.md](threat-mapping.md) — positioning + the P0 checklist this expands.
- [enterprise-readiness.md](enterprise-readiness.md) — the OSS→commercial substrate gap;
  P0's out-of-scope items live in its Phase 1 / 2.
- OWASP LLM Top-10 2025 (LLM10 Unbounded Consumption); MCP Security Best Practices; NIST
  AI RMF; EU AI Act logging / retention as a design floor.
