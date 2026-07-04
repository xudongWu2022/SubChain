# Enterprise Readiness Assessment — agent-spend-collector

**Verdict: Foundational.** A strong single-team tool with the hard product work done
(cross-rail ledger, deterministic detectors, a gateway that records and enforces,
multi-platform alerts, opt-in AI triage). The gap to enterprise-grade is **not more
features** — it is the platform underneath them: identity, data, availability, and the
compliance the product itself sells.

> The collector is the engine. Enterprise-grade is the car around it — control plane,
> identity, data, compliance, operations. Roughly **10× the current build**, and a
> different discipline (platform / security / compliance), not more features.

Companion visual: the [enterprise-readiness artifact](https://claude.ai/code/artifact/0e6ef1bd-9d9e-4cbc-85c6-074bfa3b8263)
renders this as a tiered gap matrix.

## Scorecard

| Tier | What it is | Status |
|---|---|---|
| **Tier 1 — table stakes** | Can't clear procurement without them | **0 / 4 met** |
| **Tier 2 — expected** | Strongly expected by enterprise buyers | **0 / 4 met** (2 partial) |
| **Tier 3 — moat** | Differentiators, not gates | **1 / 3 built** |
| **Already aligned** | Real strengths worth protecting | **4** |

## Already enterprise-aligned — don't lose these

- **FOCUS schema** — the FinOps open standard, chargeback-ready out of the box. Most
  tools bolt this on later.
- **Read-only, never touches money** — clears security review in a day. A genuine
  selling point, not a limitation.
- **Evidence hashes** — a per-row audit primitive already in the ledger; the seed of a
  real audit trail.
- **Spend as a security signal** — cross-rail governance is a category others don't
  cover. The positioning is right.

## The gap, by tier

### Tier 1 — table stakes (no deal without them) · 0/4

| Dimension | Today | Enterprise needs | Status |
|---|---|---|---|
| **Identity, RBAC & multi-tenancy** | One shared bearer token; dashboard opens with `?token=` in the URL | SSO / OIDC / SAML, RBAC over budgets/agents/policy, per-team data isolation, SCIM | Missing |
| **Durable data layer** | A single SQLite file on one node; no backup, retention, or residency story | Postgres (or ClickHouse for analytics), backups / PITR, retention & residency policy | Missing |
| **Gateway high availability** | One stdlib HTTP server via launchd on a Mac; inline on the critical path — down means agents stall or bypass it | Multi-instance HA, low p99, circuit-breaking, secrets in Vault / KMS with rotation | Missing |
| **Compliance, audit & approvals** | Gateway-decisions log + evidence hashes; no concept of a user, no policy-change audit | SOC 2 / ISO 27001 posture, immutable who-changed-what audit, approval workflows, separation of duties, GDPR | Partial |

### Tier 2 — strongly expected · 0/4 (2 partial)

| Dimension | Today | Enterprise needs | Status |
|---|---|---|---|
| **Enterprise integrations** | Multi-platform alert webhooks + AI triage | SIEM (alerts into the SOC), ITSM ticketing, cloud-billing reconciliation, FinOps platforms | Missing |
| **Policy management** | A single JSON policy file, validated and audited before start | Versioned policy-as-code / GitOps, per-team inheritance, a management UI, policy **simulation** ("what would this have denied last week?") | Partial |
| **Deploy & observability** | A launchd service with a `/health` probe | Containers (Docker / Helm / K8s), IaC, metrics / tracing / SLOs, readiness probes, structured logs | Missing |
| **Enterprise reporting** | One live HTML dashboard | Role-scoped views, historical trends, chargeback / showback per team (FOCUS makes this cheap), scheduled & exportable reports | Partial |

### Tier 3 — the moat (differentiators, not gates) · 1/3 built

| Dimension | State | Note |
|---|---|---|
| **Ungoverned-spend reconciliation** | In flight | Gateway-recorded spend vs provider-billed truth; the **delta is shadow / leaked spend** — a signal nobody else produces. Deepen with first-class reconciliation views and alerting on the gap. |
| **AI triage on alerts** | Built | Opt-in LLM turns a firing alert into likely cause + one recommended action, and the triage call is itself governed. Detectors stay **deterministic**; AI narrates, never detects or enforces. |
| **Multi-layer & on-chain enforcement** | Roadmap | Enforcement at more than one point (SDK, proxy, egress) + on-chain caps (ERC-7715) as the unbypassable backstop. The end of the detect → inline → on-chain line. Large; a crypto + platform effort. |

## Where to start — substrate before features

The honest first move isn't a feature — it's the foundation everything above unlocks,
and the thing security review asks about before anything else.

- **Phase 0 · unlock — make it enterprise-shaped.** Postgres + users / tenants / roles
  tables. Gateway made stateless with secrets in KMS. Immutable policy-change audit.
  Three moves that turn a single-team tool into something a platform can be built on.
- **Phase 1 · expected — clear procurement.** SSO + RBAC, containerize with
  observability, a policy UI with simulation, SIEM / ITSM integrations. The checklist an
  enterprise buyer runs.
- **Phase 2 · moat — widen the lead.** Chargeback / showback reporting, deepen
  ungoverned-spend reconciliation, multi-layer & on-chain enforcement. The parts
  competitors can't copy quickly.

## Bottom line

Functionality is no longer the constraint. Adding more of it is diminishing returns; the
leverage now is in the substrate. Build the car around the engine.

---

*Assessment based on the current agent-spend-collector build — read-only, single-node,
single-tenant, SQLite + launchd. See [ecosystem.md](ecosystem.md) §9 for the Agent Spend
Governance positioning and [threat-detection.md](threat-detection.md) for the
detect → inline → on-chain enforcement architecture.*
