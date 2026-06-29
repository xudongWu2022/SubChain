# SubChain — 从产品到生态(Ecosystem North Star)

> 配套文档,接续 **[agent-native-subscription-plan.md](agent-native-subscription-plan.md)**。
> `plan` 回答"如何把闭环做对(安全、可被第三方调用、有真实收益)";本文回答"如何把它长成有护城河的生态"。
> 调研时点 **2026-06-29**(8 路并行 web research)。标 🚩 的事实发生在 2026-01 之后、来自厂商/一手来源,**需自行复核**。

---

## 0. 一句话结论

链上"带预算上限的周期授权 + 订阅计划"这个**机制**,正在被公链与支付平台原生商品化(Solana、Stripe、x402-superfluid,均 2026 Q1–Q2)。**护城河不在机制,而在它上面一层:可移植权益(portable entitlement)+ 客观付款信用(payment-reliability reputation)。**

打法:先做 **service-agent 计费 SDK + 可移植权益**(供给入口),让它生成结算数据,把数据沉淀成喂给 **ERC-8004** 的信用资产。marketplace 是飞轮转起来后的输出,不是起点。

## 1. 定位:2026 Agentic-Commerce Stack

调研共识:这些协议**已收敛成分层栈,互补而非取代**。

| 层 | 职责 | 2026 谁占着 | SubChain |
|---|---|---|---|
| Surfaces | 需求入口 | ChatGPT · Claude · Gemini · Telegram | 不碰 |
| Identity / Trust | agent 是谁、可不可信 | A2A Signed Agent Cards · ERC-8004(主网 🚩Jan'26)· Visa TAP · NANDA | ⭐ 喂数据 |
| Authorization / Mandate | 准不准花这笔 | AP2(→FIDO 🚩Apr'26)· ERC-7715/7710 · Coinbase Spend Permissions | 适配,不自建 |
| **🟦 Subscription / Entitlement** | **跨时间关系 + 权益** | **无中立玩家 —— 缺口** | ⭐⭐ 核心 |
| Checkout / Orchestration | 零售下单 | ACP(OpenAI/Stripe)· UCP(Google/Shopify) | 基本无关 |
| Settlement rails | 钱到账 | x402(→Linux Foundation 🚩Apr'26,零费,**不做订阅**)· Cards · Stripe MPP · Solana 原生订阅 | 站其上,不竞争 |

结算层与授权层都已进 Linux Foundation / FIDO;**唯一没有中立玩家的,是"订阅状态 + 可移植权益"那条中间层。**

行业 canonical 流是 **A2A 找 → AP2 授权 → x402 结算**,中间**没有"订阅"这个动词** —— 这就是插入点:

> **A2A 找 → AP2 授权 → 「SubChain 订阅 & 持有权益」→ x402 结算**

## 2. 残酷事实:机制正在被商品化

均为知识盲区之后、需复核:

- 🚩 **Solana 原生 Subscriptions & Allowances(2026-06-02)** —— L1 原生、已审计、**免费**:capped allowance + recurring delegation + 订阅计划;官方定位"AI agent 在预算内行动的基础积木"。≈ 把 `SubscriptionAllowance` 的功能白送。
- 🚩 **Stripe MPP(Machine Payments Protocol,2026-03-18)** —— 显式覆盖**订阅 + 流式计费**;sessions = 一次授权封顶。研究判定为"这条 wedge 最大威胁"。
- 🚩 **x402-superfluid** —— "面向人 / AI agent 的 internet-native 订阅",一次签名的订阅流;最直接对标(尚早)。
- **Coinbase Spend Permissions** —— 已审计、8 条主网的**周期 pull 原语**,struct 与你的 owner/token/merchant/plan/cap/interval/expiry/revoke 几乎 1:1。

➡️ **合约 = 可替换底座,不是卖点。** 应把链做成**可插拔后端**:你的合约是其中之一,Solana S&A / Coinbase Spend Permissions / AP2 mandate / Stripe MPP 都是后端。

## 3. 护城河:机制上面一层

调研定的真空(逐字):

> 真正没人建的:**协议中立的"计费 + 可移植权益"层** —— "这个 owner 有没有 active 订阅 / 还剩几次额度",**任何 endpoint 都能验证**。支付只证明"发生过一笔交易";没有任何东西让任意服务查"权益是否还在"。

**两条护城河:**

1. **可移植权益(portable entitlement)。** 你已有种子:`hasEntitlement(owner, serviceId)` / `entitlementOf(...)`。把它升级成**跨 rail、可验证、任意 A2A/MCP/x402 服务可调**的凭证。技术载体现成:用 **W3C Verifiable Credential**(VC 2.0 已 REC)表示订阅 / 额度,复用 AP2 mandate 模型,无需自创格式。
2. **客观付款信用(payment-reliability)。** invoice 账本是**真实结算事实**;ERC-8004 **Reputation Registry 已上主网但缺数据**。喂它客观"准时付款"信号 → 抄不走的数据资产(别人没有你的清算流水)。

附带空白 —— **价格发现**:A2A Agent Card / MCP Registry **都故意不带价格**;唯一机读的调用前价格索引是 x402 Bazaar(`/discovery/resources`,仅 USDC)。一个 **rail 无关的计划 / 价格索引**正好叠在护城河 1 上。

## 4. 生态 = 3 个同心环(关键:有顺序)

```
Ring 2 · 飞轮   Service-agent 计费 SDK(供给入口)
                "5 分钟让任意 MCP/API 变可订阅" → 产生结算数据
  Ring 1 · 护城河   (a) 可移植权益凭证(跨 rail 验证)
                    (b) 付款信用 → ERC-8004 / EAS
    Ring 0 · 核心(已做完)   订阅状态机 + 幂等发票 + purpose-bound allowance
                            ← 当作可替换底座,不是卖点

marketplace / 发现 = 三环转起来后的输出,不是起点
```

认知转变:**Ring 0 已完成且是 commodity;真正要写的是 Ring 1、Ring 2。** Ring 0 的"链"应是可插拔后端。

## 5. Wedge 排序

| 优先 | Wedge | 依据 | 防御性 |
|---|---|---|---|
| **① 现在** | Service-agent 计费 SDK + 可移植权益(Ring 2 + 1a),"agent 间的 Lago / Autumn" | 大厂不会为**跨 rail 长尾**做续费 / dunning / 按次回退的集成 UX;供给入口,且顺手生成护城河数据 | 高(UX × 广度) |
| **② 复利** | 付款信用 → ERC-8004(Ring 1b) | 把供给行为沉淀成抄不走的数据;喂一个已上主网但缺数据的注册表 | 极高(数据) |
| ③ 脊梁 | 权益作中立凭证(W3C VC) | 串起 ①②,跨 x402 / AP2 / MPP / Solana | 高 |
| ✗ 别先做 | marketplace · 自建链 / token · "更好的订阅合约" | 分别是:输出非输入 / 分心 + 合规 / 已商品化 | —— |

飞轮:更多服务可订阅 → 更多结算流 → 更厚信用 → 更好发现 → 更多需求 → 更多服务。

## 6. 路线:接下来写什么(build artifacts)

按 wedge 顺序:

1. **`@subchain/sdk`** —— 一次调用把 Express / MCP 路由变"可订阅":查 entitlement → 无则回退 x402 按次 → 处理续费。**供给侧 wedge。**
2. **可移植权益解析器** —— `GET /entitlement/{owner}/{serviceId}` + 可验证形式(W3C VC / EAS attestation / 关联 ERC-8004 ID),任意 endpoint 可验;后端可插拔(今天 = 合约,明天 = Solana S&A / Stripe MPP adapter)。
3. **ERC-8004 Reputation adapter** —— 从 invoice 账本把付款可靠度发成链上信号 / EAS attestation;订阅 owner 关联其 ERC-8004 agent ID。

附带小修:

- **价格索引**:`/discovery/resources` 风格的 rail 无关计划 / 价格列表。
- **A2A 路径漂移**:v0.3+ 已把 `/.well-known/agent.json` 改为 **`/.well-known/agent-card.json`**;service-agent 与 [reference/api.md](reference/api.md) 仍在旧路径,双发或迁移。

## 7. 重定位

> 从「链上的 agent 订阅」 → **「agent 经济的可移植订阅与权益层 —— 任何 rail、任何链、随处可验证」**

## 8. 风险与时间窗

- **最大风险**:Stripe MPP + Solana S&A 可能吸收掉这个原语。防御必须是 **merchant UX / 跨链编排 / 权益可移植**,不是链上机制本身。
- **别当 Solidity maximalist**:合约降级为"后端之一",拥抱已进 Linux Foundation / FIDO 的原语,别 fork。
- **时钟**:Solana 已发(2026-06),Stripe 流式计费预计 ~2026 Q4。**做中立权益层的窗口就是现在。**

## 参考(load-bearing,均需按时点复核)

- Solana Subscriptions & Allowances 🚩 <https://solana.com/news/subscriptions-and-allowances>
- Stripe Machine Payments Protocol 🚩 <https://stripe.com/blog/machine-payments-protocol>
- x402 → Linux Foundation x402 Foundation 🚩 <https://www.linuxfoundation.org/press/linux-foundation-is-launching-the-x402-foundation-and-welcoming-the-contribution-of-the-x402-protocol>
- x402 Bazaar(价格发现)<https://docs.x402.org/extensions/bazaar>
- Coinbase Spend Permissions <https://github.com/coinbase/spend-permissions>
- Google AP2(→FIDO 🚩)<https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol>
- ERC-8004 Trustless Agents <https://eips.ethereum.org/EIPS/eip-8004>
- A2A 规范 <https://a2a-protocol.org/latest/specification/>
- MCP 规范 <https://modelcontextprotocol.io/specification/>
- W3C Verifiable Credentials 2.0 <https://www.w3.org/TR/vc-data-model-2.0/>
- x402-superfluid 🚩 <https://x402.superfluid.org/>
- Nevermined(最近直接竞品)<https://nevermined.ai/>

---

*🚩 项为知识截止(2026-01)之后、厂商 / 一手来源,引用前需复核时点与口径。*
