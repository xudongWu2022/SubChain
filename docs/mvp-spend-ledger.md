# MVP:只读跨 rail Agent 花费账本(Read-only Cross-Rail Spend Ledger)

> 配套 **[ecosystem.md](ecosystem.md) §9(Agent Spend Governance)** —— 把定位落成可造的最小产品。
> 调研 2026-06-29。🚩 = 知识截止(2026-01)后、厂商/一手来源,**需复核**。

---

## 0. 是什么 / 不是什么

- **是**:只读摄取企业 agent 在各 rail 的花费 → 归一成**一本账** → 一个面向 platform / finance / security 的 dashboard(按 agent→session→rail 看预算燃烧 + 告警)。
- **不是**:钱包 / rail / 结算方。**v1 不碰钱、不 enforce**(只读 + 告警)。法律支点见 ecosystem §9(31 CFR 1010.100)。

## 1. 对 Locus 的差异化(最近竞品,YC F25,2 人 Pre-Seed)

| 轴 | Locus | 你 |
|---|---|---|
| rail | **单 rail/单链**(USDC-on-Base,ACH/wire "coming soon") | **跨 rail**:LLM token + x402 + Stripe/卡 + USDC 归一 |
| 碰钱 | **custody / escrow,移动资金**(背 MSB/牌照/托管责任) | **只读、不碰钱**(企业不会把金库交给支付初创) |
| 位置 | **rail of record**(要被接进它) | **中立 overlay**,坐在 Locus/Stripe/Circle **之上** |
| 对账 | 只覆盖**它自己执行的那部分** | **跨厂商统一账**——它们各自只看自己的流,没人有 single source of truth |

同类(Skyfire 托管+广 funding、Kite 是一条链、Stripe MPP 有 dashboard 但只看自己流)都只产**自我范围**的审计。**跨 vendor 统一账 = 没人能产,因为各自只见自己的流。那就是缝。**

## 2. 架构(v1)

```
[per-rail read-only ingesters] → [normalizer → FOCUS 行] → [append-only 单表] → [dashboard]
        ↑ 拉 API/webhook,            ↑ 归一 + 打 x_ 键        ↑ 索引列即可,        ↑ agent→session→rail
        绝不碰资金/私钥                                          暂不上图数据库         预算燃烧 + 告警
```
无写路径、无 enforcement。enforcement(限额/拦截/HITL)是 v2,且届时用 Cedar/OPA + AP2/7715 grant,不自造。

## 3. 摄取源可行性(read-only observer)

| Rail | 拉得到? | 怎么拉 | attribution | 难度 |
|---|---|---|---|---|
| **LLM token** | ✅ 最干净 | OpenAI Costs API · Anthropic `cost_report` · OpenRouter(admin/management key,USD) | **per-API-key / project**(一 agent 一 key 即 per-agent) | **易** |
| **Stripe** | ✅ | Events API + webhooks(restricted read key);MPP/SPT 落为普通 PaymentIntent | per-tx;agent 靠 metadata(best-effort) | **易** |
| **Circle/USDC** | ✅ | Mint REST `GET /transfers` + webhooks(ECDSA 签名) | 钱包/账户(无 agent 字段) | **易**(但第一方) |
| **x402** | ✅ | 链上公开:**Bitquery x402 API** / x402scan / The Graph | **仅 payer 钱包**;→ agent 映射要你自己做 | **中** |
| **卡网络** | ⚠️ 基本拿不到 | Visa ICC / MC Agent Pay 网络侧,**partner onboarding 才有**,无公开 observer feed | 网内强、对外不暴露 | **难**(改从 processor/Stripe 那条腿摄取) |
| **AWS AgentCore** | ✅ 但第一方 | CloudWatch OTEL 导出;**"payment session" 非一等导出**,要 agent 代码自己埋 | per-session | **难** |

## 4. spend-event schema(复用 **FOCUS**,别造)

**FinOps Open Cost & Usage Spec(FOCUS)** v1.4(🚩 2026-06-04 批准)已覆盖云/SaaS/AI/token,107 列,`x_` 前缀塞自定义。一笔花费 = 一条不可变事件:

```
event_id            # uuid,幂等键
event_time          # ISO-8601 (FOCUS ChargePeriodStart)
rail                # llm_token | api_x402 | card | stablecoin
provider_name       # FOCUS ServiceProviderName
service_name        # 模型 / endpoint / merchant
charge_category     # Usage | Purchase | Tax
billed_cost         # FOCUS BilledCost (decimal)
billing_currency    # USD | USDC
consumed_quantity   # tokens / calls / units
pricing_unit        # 1K_tokens | call | item
# --- agent-graph 连接键(FOCUS x_ 扩展)---
x_agent_id          # ERC-8004 id 或内部 id
x_session_id        # OTel trace/session id
x_user_id
x_merchant_id       # 卡/稳定币对手方
x_budget_id         # 映射 FinOps "Scope"
x_authorization_ref # AP2 mandate id/hash
x_receipt_ref       # x402 txHash | 卡授权码 | OTel span id
x_source_event      # 原始 payload 指针/hash(审计)
```

## 5. 复用 vs 自造

| 复用(别造) | 用途 |
|---|---|
| **FOCUS** | 账本骨架(归一格式) |
| **OTel GenAI semconv** | LLM token 摄取格式(cost 字段自定义,你管 price book) |
| **x402 PAYMENT-RESPONSE / 链上 receipt** | API/稳定币 rail line-item |
| **AP2 mandate(W3C VC)** | `x_authorization_ref`(谁批的、什么预算下) |
| **ERC-8004 id** | 跨链稳定 `x_agent_id` |

**你唯一要造的:** 各 rail 的 read-only ingester + normalizer(→ FOCUS 行)+ 连接键(把 token/支付/各 rail join 起来)+ dashboard。**大头是 glue,不是新协议。**

## 6. 最薄切片(2 rail)+ 加 rail 路线

**推荐切片:LLM cost API(Anthropic + OpenAI)+ x402。**
- 都是 SubChain **已有的资产**(LLM key + x402),零 partner onboarding;
- 直接证明**核心差异化 = token 成本 + outbound 支付 在一本账里**(FinOps 工具只管 token、支付初创只管支付,没人合一)。

**次选(最易,无链上索引):LLM + Stripe Events** —— 真金白银 rail,企业更买账。

**加 rail 顺序:** ① LLM + x402(证明 thesis)→ ② + Stripe(真钱、企业可信)→ ③ + Circle USDC → ④ 卡(只能经 processor 那条腿)。

## 7. 关键 caveats(写进设计)

- **LLM cost API 是按天聚合,不是 per-call**(per-call 仅 OpenRouter `/generation`)。要 per-call 就走 OTel span 路线。
- **Stripe Events 仅留 30 天** —— 必须 poll + 落库持久化。
- **attribution 靠"一 agent 一 key"的纪律**,各 rail(除 x402 的 payer 地址)都没有原生 agent 字段。
- **卡网络**对第三方只读不开放 —— 经 processor 摄取,别承诺直连网络。
- 🚩 **camt.053 是 Circle *Mint*(第一方金库产品)的能力,不是 *Agent Stack* 的** —— 别在对外材料里说 Agent Stack 有 ISO 20022 导出。

## 参考(需复核)

- FOCUS Spec(v1.4 🚩)<https://focus.finops.org/focus-specification/> · FinOps for AI WG <https://www.finops.org/wg/finops-for-ai-overview/>
- OTel GenAI semconv <https://opentelemetry.io/docs/specs/semconv/gen-ai/>
- OpenAI Costs API · Anthropic Usage & Cost API <https://platform.claude.com/docs/en/api/usage-cost-api>
- Stripe Events <https://docs.stripe.com/api/events> · MPP <https://docs.stripe.com/payments/machine/mpp> 🚩
- Circle Mint API <https://developers.circle.com/api-reference/circle-mint/account/list-business-transfers>
- x402 / Bitquery x402 API <https://docs.bitquery.io/docs/examples/x402/x402-data-apis/> · x402scan <https://x402scan.com>
- AP2 <https://ap2-protocol.org/specification/> · ERC-8004 <https://eips.ethereum.org/EIPS/eip-8004>
- Locus(YC F25)<https://www.ycombinator.com/launches/Oj6-locus> 🚩

---

*🚩 项为知识截止后、厂商/一手来源,引用前复核。*
