# PLAN — agent-spend-collector

"我在哪 + 下一步"的单一真相源。战略("为什么")在 SubChain docs(文末链接);本文件是**工作计划**。

## 现在在哪

- ✅ **3 条真 rail** 进一本 FOCUS 账:LLM token(`pull`)· x402 Base USDC(`pull-x402`)· card/Stripe(`pull-stripe`)。
- ✅ **Phase-0 检测器**(单 agent z-score 尖峰、预算燃烧率)+ HTML 报表;全有离线自检(`python3 -m spend_collector demo`)。
- ✅ 独立 repo,MIT,仍 **private**。
- ✅ 定位 + 竞争已验证:开源 + 跨 rail(token+支付)+ spend-as-security + 只读 = **四交集无人占**。

## 下一步 —— 验证,不是建功能

绑死的未知是 **WTP / 谁买单**,desk research 答不了。**做这三件,别先加功能:**

1. **公开 repo** — `gh repo edit ywutian/agent-spend-collector --visibility public --accept-visibility-change-consequences`
2. **拉真实数据 dogfood** — `pull-x402 <你的 Base 地址>` 和/或配 key `pull-stripe` → 真实 `report.html` + 截图(demo 素材)。
3. **Track 1 客户访谈(≥6 个真在跑"会花钱 agent"的人)。** 拿 report.html 给他们看,问(Mom Test:问真实过去,别 pitch):
   1. agent 现在自己花钱吗?花在哪(token / API / 外部服务 / 支付)?
   2. **上月一共花了多少?你怎么知道这个数?**
   3. 出过花超 / 重复花 / 被骗花吗?当时怎么发现、怎么处理?
   4. 这预算谁担?出事谁被叫起来?
   5. 几条 rail?更头疼 **token 烧钱**还是**往外付的钱**?
   - **带回来:** rail 组合分布 · token-vs-payment 谁更痛 · 谁担预算 · WTP/定价口风。
   - **去哪找:** 你的项目人脉 · YC/创业群 · x402 & MCP Discord · LinkedIn 搜 "AI agent" + "platform/FinOps"。

## 构建 backlog(等 ≥6 场访谈说"我会用"再做)

4. Grafana/Metabase 接 `spend.db`;更狠的 detector(多窗燃烧率、6 个 LLMjacking 信号)。
5. Inline 拦截 —— Phase 1(LLM 网关 / x402 中间件预算闸)。见 SubChain `threat-detection.md` §4。

## 战略("为什么",在 SubChain repo)

- 北极星:`SubChain/docs/ecosystem.md`(§5 wedge · §10 净打法 · §11 地理)
- 构建 spec:`SubChain/docs/mvp-spend-ledger.md`
- 威胁检测:`SubChain/docs/threat-detection.md`

---

*决策门:跑完 Track 1 → 锁三个岔路(token+payment 还是只 outbound · 碰不碰钱 · rail 组合)→ 才建 #4/#5。*
