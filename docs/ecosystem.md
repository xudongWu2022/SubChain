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

## 9. 企业定位:Agent Spend Governance(花钱治理)

§1–§8 是 builder 视角。换 buyer 视角(给部署 agent 的企业)= **Agent Spend Governance** —— **品类名就用这个**:"payments platform" 太窄(像你碰钱)、"FinOps for agents" 太窄(像 token dashboard)、**"governance" 才覆盖真痛**(授权 + 策略 + 审计 + 问责)。产品形态 = 一个 **control plane**。买家痛点硬:"我的 agent 在花钱,我没有控制和审计"是 CFO / 平台听得懂的预算项。

**定位句**(每次带 "cross-rail" + "spend / governance",否则被听成 Okta/Entra 这类 agent IAM):

> **EN(可直接对外)**:**Agent Spend Governance** for teams running autonomous agents in production. One control plane for everything an agent can spend — tokens, paid APIs & MCP tools, x402 services, wallets, merchant payments. **We don't move money.** We connect to the rails you already use, enforce limits & approvals outside the model, and produce a defensible, finance-ready audit trail for every spend event.
> **CN(一句)**:管住 agent 在**任意 rail** 上花的**每一块钱** —— 只在预算与策略内、笔笔可审计;**我们不碰钱**。
> **防混淆**:Not a wallet, not another rail, not agent IAM.

三个不重叠约束:**在预算内(budgeted)· 合策略(in-policy)· 全程可审计(on the record)**。

**边界(必须主动澄清,否则被问"你跟 Halliday / Okta 啥区别"):**

- **不是**:钱包 / rail(x402 / Circle / 卡 负责移动)、IAM(Okta / Entra 管访问)、身份方(Skyfire 管"agent 是谁")。
- **是**:**跨 rail 的"花钱"治理 + 审计座位** —— 决定"此刻能不能花这笔",并记录"每个 agent 在所有地方花了什么"。

**买家地图(Forrester / FinOps Foundation):** Champion = platform / infra / AI engineering(先感到失控的人);Economic buyer = FinOps / finance / procurement(担预算);Veto / co-owner = security / compliance(每个 agent 要 governed identity + 全日志 + named owner)。FinOps Foundation 称 **98% 团队已在管 AI spend** —— 买家邻接成立,但那主要是 **token** 口径(已挤),你切 **outbound + 跨 rail** 没被占的部分。

**入口 wedge:跨 rail 的运行时治理 + 审计(不是事后对账)。**
**关键修正(两条独立研究都指向):买家更愿为「把 agent 关在策略内 + 告诉我到底发生了什么」掏钱,而不是「帮我事后对账」。** 现有运行时治理(Skyfire / AgentCore / Payman)**全是单 rail / 单云** —— 所以 wedge = **跨 rail 的运行时 caps + 审计**(高 salience 且没被填)。那本**横跨所有 rail 的统一 book of record 是自然产出的护城河,不是开场白**。GTM 用 observability-first(Wiz agentless 只读 → 后加 enforcement):先"看见每一笔 + 告警"、零执行风险,挣到信任再上 enforcement(限额 / 拦截 / HITL)。授权层有 AP2 / 7715 / Spend Permissions 兜底,你不重造。

**对手 / 伙伴 重画:**

| | 角色 | 动作 |
|---|---|---|
| Skyfire(KYA 身份)· rails(x402 / Circle / 卡) | 伙伴 | 连接、组合 |
| AP2 mandate · ERC-7715 · Spend Permissions | 授权原语 | 组合,不重造 |
| **Halliday**(链上 guardrails)· **AWS AgentCore**(Cedar + 支付)· **MS Agent 365 / Entra** | **真对手**(各做治理切片) | 赢在**中立 + 跨 rail + 审计总账** |
| Okta / Ping / SailPoint / Entra | agent **访问** IAM | 不抢,但买家会混淆 → 语言锁死"钱" |

**与 §3 护城河映射:** 可移植权益 = 被治理的授权 grant;付款信用 = 控制台的审计 / 信任信号;计费 SDK = 喂总账的数据源;**plan 里的 deterministic policy engine = 直接变成产品**(预算 / 白名单 / 额度 / 频率 / 去重 / 风控 / kill switch 都已设计过)。**这个 reframe 把 plan 最被埋没的 policy engine 推到台前。**

> 与 §5 wedge 排序一致:入口仍是 bottom-up 的审计 / SDK,**不冷启动卖企业控制台**。

### 深挖更新(2026-06-29,4 路调研)

**品类已被命名,买家 / 定价位仍在形成。** Gartner 2026《Hype Cycle for Agentic AI》已收 "FinOps for agentic AI";驱动硬(McKinsey 仅 33% governance-ready;Gartner 估 >40% agentic 项目 2027 前因成本 / 风控被砍;有企业单月烧 $500M)。买家正从"无人负责"转向 **CFO / FinOps 强推**,但 spend 专项预算线尚未成型 —— **卖 panic / mandate,别等标准预算线**。

**关键澄清:token ≠ payment。** "FinOps for AI" 今天几乎都指 **inbound token / 云成本**(Finout / Vantage / nOps,已挤);你的独占点是 **outbound 跨 rail 支付对账**(agent 往外付的钱,没人占)。但最响的痛是 token。→ **对外口径"管住 agent 的每一块钱",护城在 outbound 跨 rail 对账,token 成本作只读 feed 接进来给 CFO 一个数 —— 两类合一 = 真·没人做的跨 rail。**

**真空 = 跨 rail 的治理 + 对账,但销售排序要对。** 事前 caps / mandates 好几家有,但**全是单 rail**;事后闭环对账(authorization→settlement→receipt→GL)跨 rail 也到处都缺。**卖法:先卖跨 rail 运行时治理 + 审计(buyer 为这个掏钱),那本统一对账总账是护城河 / 产出、不是开场白**(见上"入口 wedge"修正)。

**Compose,别造。** 策略层用 **Cedar**(可脱离 AWS 内嵌)或 **OPA / Rego**;grant 层用 **AP2 mandate**(链下)+ **ERC-7715 / Coinbase Spend Permissions**(链上)。**真正要造的只有一件:跨异构 rail 的有状态计量 + 聚合账本 + 发出 Cedar/Rego 决策与 AP2/链上 grant 的编排层** —— 所有现成原语都不跨 rail 维护"运行中预算状态",那缺口就是产品。

**GTM / 定价(有先例)。** observability-first(Wiz agentless 只读 → 后加 enforcement)。计价:**主轴 = governed spend 的 %(~2–2.5% "平台税");land 用 per-agent(只读期便宜 / 免费);inline enforcement 加 per-transaction(~$0.001/笔 like x402)**。避开 per-seat。

**对手与时钟。** Catena = 协议 / SDK 无产品(可差异化);**Locus(YC F25)= 最像的初创,但今天单 rail(USDC-on-Base)**;🚩 **Mastercard Agent Pay for Machines = 最吓人(已多 rail 结算,可能加报表)**。窗口 **2–4 个季度**。

**三个待定抉择(等客户发现 + 竞品实操回来再敲;附 lean):**
1. **token + payment 一起,还是只 outbound 支付?** → lean 前者(统一口径,独特在 outbound)。
2. **碰不碰钱?** → lean 不碰。法律支点:**31 CFR 1010.100** 把 money transmitter 定义为"**接收**一方资金 + **转移**给另一方";**只读取 / 策略 / 审计 / 对账、不接收也不转移 = 不落入该框架**(对比 Stripe 持牌 MSB、Catena 去申 bank charter)。即便不碰钱仍要 SOC2 / 数据边界:**只摄取 permissions / 限额 / 交易元数据 / merchant 身份 / trace id,绝不碰 PAN/CVV / 私钥**。
3. **crypto-first 还是真·fiat + crypto?** → lean 一开始就能读卡 / Stripe / USDC 多 rail(哪怕只读);只 crypto = 掉进 Kite / Halliday。

新增来源(需复核):FinOps Foundation State of FinOps(98% manage AI spend)🚩 · 31 CFR 1010.100(money transmitter 定义)· Forrester agentic governance 🚩 · Gartner Hype Cycle for Agentic AI 🚩 · Cedar <https://github.com/cedar-policy/cedar> · OPA <https://www.openpolicyagent.org/docs> · Coinbase Spend Permissions <https://github.com/coinbase/spend-permissions> · Locus(YC F25)🚩 · Mastercard Agent Pay for Machines 🚩

## 10. 打法升级:安全为尖 · OSS collector 落地 · 融资现实(第三轮调研)

净结论:**主打安全、用 OSS collector 落地、按"系统级账本"去融资。**

### 10.1 安全是更尖的 wedge(CISO 预算 > CFO 预算)

同一本账换买家:从"省钱"(FinOps / CFO / 价格敏感)→ **"检测并拦截未授权 / 被劫持的 agent 花费"**(安全事件 / CISO / 危机预算 / ACV 更高)。

- **威胁真、有美元数**:prompt 注入诱导转账(Unit 42 约 500 条注入帖,有的埋进 agent memory 延迟触发)· 失控循环 11 天 **$47K** · key 泄露 LLMjacking 48h **$82K**。🚩 Visa 暗网 "AI Agent" 提及 +450%;WEF 估 2028 年 1/4 入侵由 agent 驱动。
- **缝**:agent 安全厂商(Token / Zenity / Astrix / Oasis)只做身份 / 访问 / 数据异常,**不碰花费**;FinOps 碰花费但框成"省钱"。**"花费当安全信号"跨 rail 没人占。**
- **同账换读法**:花费尖峰 = 失控 / LLMjacking · 越策略 merchant = 注入 · 速度突变 = key 失陷。**正中 plan 既有的 threat-model DNA(注入防护、kill switch)。**
- **打法 both-and**:主打安全(紧迫 + 预算大),FinOps 当 land-and-expand 的 ROI 证明。同一本账,安全是更尖的那头。

### 10.2 落地:免费 OSS 只读 collector(做 token 界的 OpenCost)

- 一条命令(helm / pip / sidecar / MCP)接现有 provider + 网关(LiteLLM / Helicone)遥测 → Grafana dashboard。**agentless、只读、metadata-only —— read-only 当头条,把安全否决提前清掉(Wiz / Vantage 打法)。**
- 技术:**OpenLLMetry / OTel + FOCUS token 列**,预对齐 🚩 **Linux Foundation "Tokenomics Foundation"(2026-07 成立)** 抢卡位。
- 路径:Champion(platform / AI-eng)从 GitHub / **MCP Discord(~13k)** / CNCF 自助 → 其上 hosted control plane(跨团队分摊 + 预算 / 异常告警 + FOCUS chargeback)翻给 FinOps / finance(**FinOpsX** 场子,2500 人,AI 治理是今年主题)。
- ⚠️ 新威胁(都 **token-only / 单 rail / FinOps 框**):🚩 OpenCost 已加 AI 成本 + MCP server · **Revenium**(运行时把 token 成本归到 workflow,架构最像)· AWS FinOps agent。**你差异化 = 跨 rail(token + outbound 支付)+ 安全框。**

### 10.3 融资现实(诚实)

- **可融:seed($3–8M,team + 协议 + design partner)**,但**还不是已验证的 A 类目**。A($15–30M)要:企业 logo · 实际 governed $ · agent 数 · 接进现有 book-of-record。
- **"纯治理"是 feature 不是公司** —— 要 "more than governance":坐在企业 agent 与钱之间的 **policy + 系统级账本**(审计 + 预算 / 权限 enforcement + 对账,finance 与 security 都签字)。
- **这是收购赛道,不是 IPO 赛道**:Stripe / Visa / Mastercard 在买 call-option;前十笔吃掉 ~78% 资本;窗口随协议被定而关。
- **投资人一句话**:*"The system of record for agent spend — every autonomous dollar, policy-checked before it moves and reconcilable after."* 从 $ 流(支付 / billing)或安全切入,扩张到治理。

> **净打法:OSS collector 落地 champion → 安全框异常检测(尖)→ 跨 rail 系统级账本(护城河)→ hosted 治理 upsell(扩张)。** SubChain 的 x402 + threat-model 资产正好喂前两步。

新增来源(需复核):🚩 Unit 42 prompt-injection · $47K 失控循环 / $82K LLMjacking 案例 · 🚩 Linux Foundation Tokenomics Foundation(2026-07)· OpenLLMetry / Traceloop · OpenCost AI roadmap · Revenium · 🚩 Oasis $120M B / Astrix $45M B(安全邻接融资)· "Agentic commerce is an acquisition pipeline"

## 11. 地理 / 二阶扩张:亚洲与中国(别当主战场)

调研结论:**DISTINCT 但更难,不做 beachhead。**

- 中国是全球最活跃 agent 支付区(🚩 Alipay AI Pay 单周 1.2 亿笔;Alipay AI Wallet 明确是 "user↔agent 控制层";Ant Trust Protocol / AMP;微信 Pay MCP)—— 但 🚩 2026-02 八部委重申**稳定币全面禁令**:x402 / USDC 境内不合法,境内 rail 只有 Alipay / 微信;治理缺口被巨头 + 监管圈住,**没有本土 agent-FinOps 创业冒头**。小团队进境内 = 本地实体 / ICP / 数据本地化 + 正面刚 Ant / Tencent。
- **对你有用的两点**:① 你的 **"非托管 + rail 无关" 设计被巨头验证**(Alipay AI Wallet 是控制层、Ant Token Pay 明说解 "跨多国多支付系统对账"),但他们做成围墙;② **唯一中立账本的口子是跨境** —— 中国 / 亚洲企业跑 agent 花在西方 rail 上、稳定币碰不得、跨境合规难,一个**不托管、跨法域中立**的账本正好服务 "两边都不互信 / 不合法"。
- **打法**:不进大陆直营;主 wedge 仍 **美西 + 安全框**;二阶扩张 = **跨境 + 新加坡 / SEA**(IMDA 开放框架);中国大陆当**集成 / 伙伴**(Alipay AMP、Token Pay)。

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
