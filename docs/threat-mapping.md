# Threat Mapping & Positioning — agent-spend-collector

Locks the position: the **open-source** project is a sharp, credible, shippable
**spend gateway**; the **commercial** product is what earns the "agent runtime
governance / agent security" label. Don't fight over one label across both.

- **Open source** — denial-of-wallet & LLMjacking protection at the LLM/agent API
  boundary. Budgets, tokens, model price, rate, abuse, anomalous cost curves.
- **Commercial** — agent runtime governance: identity, tools, budgets, approvals,
  and audit logs.
- **One line** — Open source blocks the *loss* (denial-of-wallet / LLMjacking);
  commercial fences the *high-consequence actions* (identity + tool governance);
  audit + compliance makes it *procurable*.

## Messaging — three layers (DoW is the citation, not always the headline)

| Audience | Line |
|---|---|
| Developer / README | **Stop runaway LLM spend, abuse, and LLMjacking at the API boundary.** |
| Security / compliance | Controls for **OWASP LLM10:2025 Unbounded Consumption** — including denial-of-wallet and unauthorized LLM usage. |
| Investor / strategy | **The spend control plane for AI agents — before autonomy turns into invoices.** |

"Denial-of-Wallet" is strong for the security audience and citations, but it is not
yet as buyer-obvious as "prompt injection." Lead with plain language; cite DoW.

## Threat crosswalk — real capability ↔ framework

Detectors are the seven in `detectors.py`; controls are the gateway's `decide()`
plus the hardening PRs (#12 behavioral + kill-switch, #13 content, #15 atomic rate).

| Capability (actual) | OWASP LLM Top-10 (2025) | Endorsing term |
|---|---|---|
| `spend_spike` · `budget_burn` · `budget_burn_rate` · `spend_per_task` | **LLM10 Unbounded Consumption** | Denial of Wallet detectors |
| `new_key_spike` (new key, sudden large charge) | LLM10 | **LLMjacking** signature (stolen-credential abuse) |
| `off_hours_activity` (unusual hour for the agent) | LLM10 / behavioral anomaly | account-takeover / stolen-credential signal |
| `new_merchant_provider` (first-seen merchant) | **LLM06 Excessive Agency** | agent spending somewhere new = anomalous outbound |
| budget cap · `max_amount` · velocity `max_amount_per_hour` (atomic) | LLM10 mitigation | "bound the consumption" |
| `content_guard.max_bytes` (token bomb) | LLM10 | oversized input |
| `content_guard.deny_patterns` | **LLM01 Prompt Injection** | ⚠️ Layer-1 signal only |
| `content_guard.deny_secrets` | **LLM02 Sensitive Information Disclosure** | outbound secret = exfiltration |
| `block_on_anomaly` (detector → in-flight deny) | runtime behavioral enforcement | turns alerts into interception |
| kill-switch `frozen_agents` / `frozen_budgets` | incident response | break-glass |
| allowlists (agent / rail / merchant) | LLM06 Excessive Agency | least-privilege |

The cost-family detectors + the velocity cap are a complete Unbounded-Consumption /
denial-of-wallet / LLMjacking defense — that is the honest, cited claim.

## Honest boundaries (say these out loud — they raise credibility)

- **`content_guard` is a Layer-1 content-risk signal, not a prompt-injection
  solution.** Wording to ship:
  > Layer-1 content risk signal. It flags suspicious prompt/content patterns and can
  > trigger budget limits, tool freezes, human review, or stricter routing. It is not
  > a standalone prompt-injection solution.
  Keyword/pattern filtering cannot solve prompt injection; the real defense is
  architectural (CaMeL-style control/data-flow separation, high-consequence-action
  gating). Downgrading `content_guard` to a *signal* reads as more expert, not less.
- **The OSS project is not "agent security."** It has no agent identity, RBAC, or
  MCP/tool governance. Claiming "agent security" for the free tier over-claims and
  blurs the open-core line. OSS boundary, in one line:
  **protecting LLM/agent spend at the API boundary.**

## Open-source near term — two real code deltas

1. **Cost-semantics signals** (record more than request/token counts):

   | Signal | Why |
   |---|---|
   | `estimated_input_tokens` | long context is the entry point for DoW |
   | `max_output_tokens` | estimate worst case up front, not at settlement |
   | `model_unit_price` | same tokens, very different cost per model |
   | `session_cumulative_cost` | slow, long-horizon abuse only shows in the sum |
   | `tool_call_count` | agent cost is model **+** tool chain |
   | `loop_depth` / `recursion_depth` | common AgentDoS source |
   | `retry_count` / `fanout_count` | auto-retry and concurrency inflate the bill |
   | `cost_velocity` | rate of cost growth warns earlier than an absolute |

2. **Preflight worst-case reservation** (the key design change). The gateway already
   reserves pre-spend (`decide → reserve_and_record_gateway_decision → release`), but
   the hold is a flat policy `amount`. Change it to a *computed* worst case:
   `_price(model, estimated_input_tokens, max_output_tokens)` off the request body,
   plus any tool budget. Deny / degrade / fall back to a cheaper model when the
   estimate exceeds budget — before the call, not after. Post-flight logging only
   tells you "the money is gone."

Per-tool budgets are nearly free on the OSS side: tool spend is already recorded
(`record_target_spend`, flat per-call); a per-tool cap is the existing budget cap
keyed by tool.

## Commercial P0 — the minimum to earn "agent runtime governance"

Keep it lean; not a big "AI security platform." The minimum closed loop:

1. **Agent identity** — each agent has its own identity, not a shared app key.
2. **Scoped credentials** — permissions granted per task / tool / scope, short-lived.
3. **Per-tool budget** — cap/risk across browser, code-interpreter, MCP tools,
   search, payment, email, CRM — not just OpenAI/Anthropic calls.
4. **High-impact action approval** — human confirmation / step-up for consequential
   actions.
5. **MCP / tool registry** — tool allowlist, schema audit, metadata-change detection.
6. **Audit log** — agent, tenant, user, tool, scope, policy version, decision, cost,
   override.
7. **Kill switch** — freeze by agent / tenant / tool / scope instantly.

**MCP is the entry ticket, not optional.** MCP's own security guidance makes token
passthrough an anti-pattern and requires servers to reject tokens not issued to them;
if an agent spends through tools, model-boundary controls alone are incomplete.

## Compliance — light, but get logging right on day one

EU AI Act does not blanket-apply to every product/scenario, so don't claim "we make
you compliant." But it is a strong design basis: high-risk providers/deployers must
retain automatically generated logs for **at least six months** within their control.
So from day one the commercial control plane should have: **policy versioning +
immutable-ish audit events + retention config + export.** These are painful to add
later and enterprise procurement will ask.

## Sequenced next steps

1. This document — lock the position (OWASP LLM10 / DoW / LLMjacking spend gateway;
   *not* "complete agent security").
2. README / website messaging — the three lines above.
3. Two OSS code changes — downgrade `content_guard` to a Layer-1 signal in docs; add
   cost-semantics signals + preflight budget reservation.
4. Commercial P0 spec — "what has to be true before we may call it agent security,"
   not a big roadmap.

## References

- OWASP GenAI — [LLM10:2025 Unbounded Consumption](https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/) (defines Denial of Wallet)
- Sysdig — [What is LLMjacking](https://www.sysdig.com/learn-cloud-native/what-is-llmjacking)
- NCSC — [Thinking carefully before adopting agentic AI](https://www.ncsc.gov.uk/blogs/thinking-carefully-before-adopting-agentic-ai)
- Microsoft — [Zero Trust for the agentic workforce / Entra Agent ID](https://www.microsoft.com/en-us/security/blog/2025/05/19/microsoft-extends-zero-trust-to-secure-the-agentic-workforce/)
- CaMeL — [Defeating Prompt Injections by Design](https://arxiv.org/abs/2503.18813)
- [Design Patterns for Securing LLM Agents against Prompt Injections](https://arxiv.org/abs/2506.08837)
- MCP — [Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)
- EU AI Act — [Regulation (EU) 2024/1689](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32024R1689)

*Companion: [ecosystem.md](ecosystem.md) §9 (Agent Spend Governance positioning),
[enterprise-readiness.md](enterprise-readiness.md) (the OSS→commercial substrate gap).*
