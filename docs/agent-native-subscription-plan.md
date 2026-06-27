# SubChain — Agent-Native Subscription Infrastructure(整合方案)

> **x402 lets agents buy a request. SubChain lets agents manage a relationship.**
> Agents can pay once with x402, or subscribe safely with SubChain.

**本轮原则:从「概念完整性优先」切到「闭环可证性优先」** —— 不再扩协议叙事,先证明一条闭环能**安全工作、被第三方调用、带来真实经济收益**。

> 本文整合了「最终方案(HTML)」「深度研究(PDF)」与早期计划,删去预算/RACI/甘特/沟通模板等治理脚手架,只保留可执行的技术与验证内容。

---

## 1. 定位与产品故事

**定位**:SubChain 为 agent 提供可持续、可撤销、受预算约束的服务关系 —— x402 处理请求级即时购买,SubChain 维护跨时间的订阅状态、续费授权、发票与服务权益(entitlement)。x402 的核心不是「微支付」,而是把支付挑战/签名/结算嵌入 HTTP 请求;SubChain 的差异化是维护一个长期、可续费、可暂停、可取消、可审计的商业关系。

**最强 Demo = 自主经济决策**(不是机械 `subscribe()`):
- Research Feed Agent 提供两种购买方式:x402 按次 0.10 USDC / SubChain 月度 2 USDC(含 30 次)。
- Consumer Agent 按目标、预计调用量、预算、历史使用率算账:预计 8 次 → 走 x402;预计 35 次 → 订阅更划算;连续两周期使用率过低 → 取消、退回按次。
- **核心闭环:预测 → 比价 → 授权 → 使用 → 评估 → 续订或取消。** 同时证明:x402 与 SubChain 互补而非重复;agent 在预算下优化成本;订阅背后有真实服务与权益;历史数据改变下周期策略。

---

## 2. 关键设计原则(对早期方案的修正,最重要)

1. **2026 协议栈仍在演进,别说「已固化」。** 必需的只有 MCP(工具接入)、A2A(agent 间发现/任务)、x402(请求级支付)、安全授权;**AP2 / ACP / UCP / ERC-8004 作为未来适配层,不做第一版硬依赖**。

2. **x402 不承担续费。** x402 语义是「为当前 HTTP 资源请求签名付款」,续费发生在没有新请求时,必须由长期授权完成,否则会双重收费。两条明确路径:
   - **Path A 按次**:`GET /feed` → 402 → 客户端签 x402 → 返回结果。
   - **Path B 订阅**:x402 付首期(或链上交易激活)→ SubChain 建订阅 → 后续账期由 **purpose-bound spend permission** 续费 → `EntitlementResolver` 验权,**有权益就不再逐次收费**。

3. **授权 = `SubscriptionAllowance.sol`(ERC-7715-inspired,不宣称标准兼容)。** purpose-bound,绑定 owner / token / SubChain 合约 / planId 或 merchant / 单次上限 / 每周期上限 / 最短间隔 / 总额 / expiry / 可撤销。**关键:agent/keeper 只能触发 `chargeSubscription()`;唯一能消费授权的目标只能是 SubChain 合约,且收款方/价格/账期由订阅状态约束 —— 绝不把 session key 设为可任意 `transferFrom` 的 spender。** 标准化升级路线(ERC-4337 + delegation + `wallet_requestExecutionPermissions`)留到 MVP 后。

4. **信誉拆成两类信号,不压成单一 `scoreOf()`。** payment-reliability(按时付款率/失败次数/已结算额,客观链上事实)与 service-quality(可用性/响应/质量/反馈,主观或需验证)分开展示。原因:付款多≠服务好、可自买自卖刷量、新 agent 冷启动、负面反馈需抗女巫。ERC-8004 仅 Draft、仅借鉴、不前置。

5. **LLM 不是资金执行器。** 可信闭环:
   ```
   Observe → Propose → Policy Check → Execute → Verify → Evaluate → Update State
   ```
   LLM 只理解目标、比较非结构化服务描述、**提出动作**;deterministic **policy engine** 负责预算/白名单/额度/频率/去重/风险;**executor 只执行过审的结构化动作**;evaluator 据链上回执/使用量/SLA 更新状态。**所有 merchant metadata、A2A 消息、服务返回值视为不可信输入**,不得用其中自然语言覆盖系统策略或触发付款。

---

## 3. 分层架构(7 层)

| # | 层 | 内容 | 职责 |
|---|---|---|---|
| 01 | Experience | Telegram · Web UI · MCP client · A2A client | 用户与开发者入口 |
| 02 | Agent Control Plane | Goal Parser · Planner · **Policy Engine** · Executor · Evaluator | 受约束自治核心 |
| 03 | Commerce Interop | A2A discovery/tasks · x402 pay-per-use/activation · MCP tools | 协议互操作 |
| 04 | **Subscription Domain** | Plan · Subscription · Invoice · Entitlement · Scheduler | **SubChain 核心状态机(source of truth)** |
| 05 | Authorization | Purpose-bound allowance / smart-account delegation | 周期授权与预算边界 |
| 06 | Trust | Agent identity · Payment signals · Service feedback | 身份与信任信号 |
| 07 | Data & Ops | Postgres · Indexer · Event queue · Audit log · Metrics | 数据与运行保障 |

**各层边界**:MCP 是工具入口,不管 A2A 商务协商;A2A 管发现/任务,不管代扣;x402 是请求级支付,不存长期状态;SubChain 是订阅/账期/权益/发票的单一真相;spend permission 只判断「是否允许花这笔钱」;LLM 只提案、不绕过 policy;reputation 读账单事实,但**不进核心扣款事务的同步回调路径**。

---

## 4. 核心合约:可靠的订阅状态机(先做这个)

```solidity
struct Plan {
    address merchant; address token;
    uint128 price; uint64 period;
    uint32 includedUnits; uint32 gracePeriod;
    uint32 version;              // 订阅锁定 planVersion 与价格;改价=新版本,不静默改旧订阅
    bytes32 serviceMetadataHash; // metadata 放链下 URI,链上存 hash
    bool active;
}                                 // token decimals 不能假设固定为 6

enum SubscriptionStatus { PendingActivation, Active, PastDue, Suspended, Cancelled, Expired }

struct Subscription {
    address owner; uint256 planId; uint32 planVersion;
    uint64 startedAt; uint64 currentPeriodStart; uint64 nextChargeAt; uint64 graceEndsAt;
    uint32 periodIndex; SubscriptionStatus status;
}
```

**发票幂等(防重复收费,P0 核心)**:`invoiceKey = keccak256(subscriptionId, periodIndex)`,每订阅每账期只能一张确定性发票;`chargeSubscription()` 先检查该 key 是否已结算,防 keeper 并发/重试/抢跑。

**扣款状态流**:
```
Active + due → reserve invoice → validate allowance → pull funds
  → 成功: Paid, advance period, entitlement 保持
  → 失败: PastDue, 进入 grace
  → grace 过期: Suspended
```
余额不足 / permission 到期 / cap 超限 / token revert 用**结构化错误码或事件**,agent 才能补额度/降级按次/换计划/取消。

**资金安全**:Checks-Effects-Interactions;SafeERC20;merchant pull-based withdrawal;Pausable + ReentrancyGuard;**任何信誉合约/外部 hook 失败都不能阻塞扣款**;permission 撤销立即生效;EIP-3009 测 nonce 重放/有效期/chainId-domain/签名错误;plan/merchant/token 必须被授权范围绑定,不能只限总额。

---

## 5. Agent 闭环的正确实现

**状态是结构化快照,不是一大段 prompt**:
```ts
interface EconomicState {
  balance: bigint; monthlyBudget: bigint; committedRecurringSpend: bigint;
  projectedUsage: Record<string, number>;
  activeSubscriptions: SubscriptionState[]; payPerUseAlternatives: Offer[];
  serviceReliability: Record<string, number>; policyViolations: number;
}
```

**决策拆「提案」与「批准」** —— LLM 只输出 `ActionProposal { action, targetId, expectedCost, expectedValue, rationale, confidence }`;policy engine 检查:超月预算? 超 permission? 已存在相同订阅? 允许的 token/merchant/plan? 达人工确认阈值? 本轮动作数超限? merchant 返回是否试图改系统指令? 预计节省 > 切换成本?

**「学习」= 外部状态更新**(不是模型自己学会):记录每服务调用数/成功率/延迟/单位价值;用 EWMA/滑动平均更新预计使用量与可靠性;记录取消原因与失败类型;下一 tick 给 planner **聚合指标而非完整日志**。**自由文本 memory 仅作解释,不能成为支付授权依据。**

**runtime**:scheduler(事件驱动 `watchContractEvent` + `nextChargeAt` 到期触发)+ recovery(动作幂等 / chain cursor / 崩溃从状态恢复)+ 全局 kill switch。

---

## 6. 分阶段路线(交付 + 验收)

**Phase 0 — 可靠垂直切片(先做,不急着上全部协议)**
交付:修复 Plan/Subscription/Invoice 状态机;确定性 invoice key + 重复扣款保护;Data/Research Feed 服务 + `hasEntitlement(owner, serviceId)`;consumer 用固定策略调服务;indexer 展示订阅/发票/使用量/结果;Foundry 测状态转换/重复扣款/取消/grace。
验收:重复扣款=0;未订阅者拿不到权益;取消后下账期不扣;服务调用与 invoice 可关联。

**Phase 1 — 安全自治授权**
交付:`SubscriptionAllowance.sol`(限定 plan/merchant/token/单次/周期/expiry);agent/keeper 只触发 `chargeSubscription()`;`/grant` `/revoke` `/kill`;policy engine + 人工确认阈值。
验收:cap/expiry/wrong token/wrong merchant/too-early charge 全 revert;**session key 泄露也不能向任意地址转账**;permission 撤销后立即无法续费。

**Phase 2 — x402 互操作(按次 + 订阅双模)**
交付:官方包 `@x402/core` `@x402/express` `@x402/fetch`(需要时评估 `@x402/mcp`);Mock token 支持 EIP-3009(或 Permit2 路线);`/feed` 按次 + `/subscriptions/activate` 首期付款建订阅;订阅用户凭 entitlement 访问不重复收费;本地 facilitator 或可配置 adapter。
验收:外部 client 完成 402→签名→结算→获取资源;首期只收一次;订阅有效时调用不触发 x402;EIP-3009 nonce 不可重放。
注意:**stdio MCP 无 HTTP 状态码语义**;要真用 402,采用 MCP 的 HTTP transport / `@x402/mcp` / 让 MCP tool 调受 x402 保护的 HTTP resource,**不要把普通 tool error 文本谎称「HTTP 402」**。

**Phase 3 — A2A 订阅市场与经济闭环**
交付:merchant 发布 A2A Agent Card(声明 skill/endpoint/x402 支持/SubChain plan URI);consumer 经 A2A 发起任务收 artifact;marketplace 从 Agent Card + plan registry 聚合;consumer 比价并按预计使用量自动选/续/取消;merchant 提现收入并可消费其他服务。
验收:不硬编码 merchant 地址也能发现;A2A task ↔ 链上 subscriptionId 可关联;低用量回 pay-per-use,高用量自动订阅;**预算耗尽即停止购买,不靠无限 mint**。

**Phase 4 — 身份与信誉互操作**
交付:ERC-8004 identity adapter / 兼容注册文件;agentURI 关联 A2A/MCP/x402 端点;payment reliability + service quality 两类信号;marketplace 按信号过滤;明确 Draft 标识与升级路径。
验收:能证明 endpoint 与 agent identity 关联;两类信号分开展示;自买自卖刷不出高质量分;**reputation adapter 故障不影响核心扣款**。

---

## 7. 代码结构

```
apps/agent/src/
  observe/{chain-state,service-usage}.ts
  planning/{planner,prompts}.ts
  policy/{budget-policy,permission-policy,risk-policy}.ts
  execution/{subchain-executor,x402-client,a2a-client}.ts
  evaluation/{value-score,reliability}.ts
  runtime/{loop,scheduler,recovery}.ts
  interfaces/{telegram,mcp,cli}.ts
  storage/{actions-db,memory-db,cursor-db}.ts
apps/service-agent/src/{a2a-server,agent-card,feed,entitlement,x402}.ts
contracts/src/{SubChain.sol, SubscriptionAllowance.sol, MockEIP3009Token.sol, ERC8004IdentityAdapter.sol}
```
`tools.ts` 不要同时承担模型 schema + 业务逻辑 + 链上执行 + 日志 —— 拆成 adapter,供 Telegram/MCP/A2A/loop 共用同一业务服务层。

---

## 8. 复用现有代码(本仓库实际文件)

- ABI/地址:`apps/web/lib/contracts.ts`(`subChainAbi`/`erc20Abi`/env 地址)。
- viem client 模板:`apps/indexer/src/index.ts`(`createPublicClient` + 写交易再加 `createWalletClient` + `privateKeyToAccount`)。
- Postgres 读 + 优雅降级:`apps/web/app/api/indexer/summary/route.ts`;schema 在 `apps/indexer/schema.sql`。
- 前端轮询渲染:`apps/web/app/page.tsx`(已每 2–5s 轮询,新增面板照搬)。
- 合约 keeper 友好:`subscribe`/`chargeSubscription` 无权限限制;`MockUSDC.mint` 可初始充值。
- **现有 `scripts/*.ps1` 仅 Windows**;macOS 用手动起栈 + 新增跨平台 `tsx` 脚本(见 §11)。

---

## 9. 数据与可观测性

表:`agent_actions`(提案+policy结果+执行)、`agent_cycles`(每轮触发原因+状态快照hash)、`service_usage`(调用数/成功率/延迟/artifact hash)、`economic_metrics`(按次vs订阅摊销/节省)、`agent_memory`(只存聚合结论+证据引用)、`scheduler_jobs`(dueAt/status/attempt/idempotencyKey)、`chain_cursors`(block number/hash,支持 reorg 恢复)。

UI 该展示的不是「Claude 说了什么」,而是:当前月预算、已承诺订阅支出、按次 vs 订阅盈亏平衡、每服务使用率/单位成本、提案→policy 决策→链上交易、失败原因+恢复动作、实际节省金额。

监控用 **OpenTelemetry**(traces/metrics/logs 三位一体),**把策略判断与执行日志拆开**,避免只看到「交易成功/失败」、看不到「为什么做这个动作」。

---

## 10. KPI(可量化证据,精简)

| 维度 | KPI | 目标 |
|---|---|---|
| 收费 | 首期激活成功率 / 续费成功率 / 重复扣款率 | >90% / >85%↑ / **0** |
| 价值 | 订阅转化率 / 订阅优于按次的累计节省 | >15%(试点) / 持续增长 |
| 可靠 | entitlement 校验成功率 / 账单三者(invoice/subscription/entitlement)一致率 | >99.5% / >99.9% |
| 风险 | 越权动作拦截率 | 100% |
| 生态 | 外部 agent paid task 成功率 | >95% |
| 运维 | P95 结算闭环耗时 / 告警 MTTA·MTTR | 按场景设值 / 周期下降 |

---

## 11. 安全威胁模型(精简)

- **资金层**:重复 charge;permission 跨 plan/merchant 滥用;EIP-3009 nonce 重放;plan 静默涨价;周期边界双花额度;恶意 ERC-20 callback/revert;外部 reputation hook DoS。
- **Agent 层**:merchant metadata / A2A 返回的 prompt injection 诱导付款;LLM 重复 subscribe;RPC 超时后交易状态不确定导致重发;Telegram 任意用户控制共享钱包;kill switch 仅进程内、重启失效。
- **数据层**:indexer 链重组;action log 与链上不一致;scheduler 多实例抢占;未验证服务结果记为成功;自由文本 memory 污染决策。

> **铁律:所有资金约束最终由链上或 deterministic policy 强制,不能只写在 prompt 里。**

---

## 12. 风险登记(Top 5)

| 风险 | 早期信号 | 缓解 |
|---|---|---|
| 重复扣款 / 重复 settlement | 同 subscriptionId+periodIndex 多次扣 | 账期级 invoice key;x402 payment identifier 幂等;对账任务 |
| 授权范围外支出 | 异常 merchant/token、超频/超 cap | purpose-bound permission;plan/token/merchant 绑定;撤销即时;审批阈值 |
| prompt injection 越权 | 异常建议/参数、远端文档指令化 | instructions/data 分离;least privilege;高风险 HITL;外部内容隔离清洗 |
| 钱包/session key 泄露 | 异常请求来源/额度 | 不给任意 transfer,仅允许调 `chargeSubscription`;短期凭证;紧急 kill switch |
| 试点 demo 成功但不买单 | 只有技术好奇,无续用/付费 | 提前锁 2–3 个试点,每个绑 ROI 指标,周期复盘 |

---

## 13. 优先级结论 + 5 分钟 Demo

**实施顺序**:① 修订阅状态机 + 权益验证 → ② purpose-bound spend permission → ③ x402 双模式 → ④ A2A 真发现/交付 → ⑤ 身份/信誉适配。**不要一开始同时做 Telegram+MCP+x402+A2A+7715+8004+复杂 memory。**

**第一条可信垂直切片**:一个 consumer agent 发现一个真实服务,在按次和订阅间做成本选择,在链上受限授权内付款,使用服务,并据实际使用量决定下周期续/取消。

**5 分钟 Demo**:① Marketplace 展示 Research Feed(按次 0.10 / 月订 2);② Consumer 预算 5、预计 8 次 → 选 x402;③ 目标改「每天监测」预计 35 次;④ agent 算订阅更便宜并提案;⑤ policy 验预算+permission 后建订阅;⑥ 后续调用走 entitlement 不逐次付;⑦ keeper 到期续费,UI 显示 invoice/permission 消耗/merchant 收入;⑧ 下周期降到 3 次,agent 自动取消回 x402;⑨ 尝试超额订阅 → 链上 permission 拒绝;⑩ 展示 A2A Agent Card + 付款可靠度。**一个 demo 讲清:互操作、自治、安全、真实服务、经济优化、可审计。**

---

## 14. macOS 端到端验证

现有 `scripts/*.ps1` 在 macOS 跑不了,手动起栈:
1. `docker compose up -d`(Postgres);新终端 `anvil`。
2. `npm run contracts:deploy:local`(部署合约,地址写进 `apps/web/.env.local` 与 `apps/agent/.env`);应用 `apps/indexer/schema.sql`。
3. `npm run dev:indexer` + `npm run dev:web`;`npm run agent:seed`。
4. 按阶段验:`forge test`(状态机/cap/expiry/EIP-3009/minReputation);`@x402/fetch` 小脚本扮外部 agent 验 402 全流程;前端面板看经济指标与提案→policy→tx。

---

## 官方参考

- x402:<https://docs.x402.org/> · 幂等扩展 <https://docs.x402.org/extensions/payment-identifier>
- MCP:<https://modelcontextprotocol.io/specification/> · A2A:<https://a2a-protocol.org/latest/specification/>
- ERC-7715:<https://eips.ethereum.org/EIPS/eip-7715> · ERC-8004:<https://eips.ethereum.org/EIPS/eip-8004>
- Stripe Billing:<https://docs.stripe.com/billing/subscriptions/overview> · Square Subscriptions:<https://developer.squareup.com/docs/subscriptions-api/overview>
- OpenZeppelin ERC20:<https://docs.openzeppelin.com/contracts/5.x/api/token/ERC20> · OWASP LLM Prompt Injection:<https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Cheat_Sheet.html>
- OPA(policy-as-code):<https://www.openpolicyagent.org/docs/latest/> · OpenTelemetry:<https://opentelemetry.io/docs/> · Anthropic Tool Use:<https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use>

---

*整合自:最终方案(HTML)+ 深度研究(PDF)+ 早期分阶段计划。已删去预算/RACI/甘特/沟通模板等治理脚手架。*
