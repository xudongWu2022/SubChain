# Agent Spend 威胁检测 —— 怎么实现(安全 wedge ②)

> 配套 **[ecosystem.md §10.1](ecosystem.md)**(安全 wedge)· **[mvp-spend-ledger.md](mvp-spend-ledger.md)**(账本)· **agent-spend-collector**(原型,已抽成独立 repo)。
> 把"只读跨 rail 账本"升级成"威胁检测"。基于 2026-06 四路文献。🚩 = 知识截止(2026-01)后、需复核。

---

## 0. 一句话 + 一条硬约束

三种威胁 → 信号 → 检测 → 拦截:**乱花钱**(runaway)· **被骗着花**(prompt injection)· **被盗刷**(LLMjacking / 盗 key)。

> **硬约束:只读观察者拦不住付款。** 检测在请求路径之外,告警时钱已走。**要"拦"必须 inline(见 §4 三阶段)。** 所以 read-only 账本给你的是 **检测 + 告警 + 留证**,不是 enforcement —— 这也正是 Phase 0 易落地的原因。

## 1. 乱花钱(runaway / budget burn)

**先上(高价值、低误报):**

| 信号 | 算法 | 为什么 |
|---|---|---|
| **多窗口多燃烧率** | 借 SRE SLO:快烧 14.4×(~2 天烧完月预算)告警,慢烧 6×(~5 天)开单;**短窗 + 长窗都破才报** | 金标准,误报可调,按 `budget_id` 算 |
| **单 agent MAD z-score** | `0.6745·\|x−median\|/MAD > 3.5`,每 agent 滚动 7–30d | robust、在线、不训练;中位数不被尖峰拉偏 |
| **spend-per-task 比值** | `task_cost > 3× 基线`(按 session/task 归一) | **任务数不变但花费暴涨 = loop 最干净的信号** |
| **Isolation Forest** | 周度重训,特征 = amount/velocity/merchant&rail 频率/task 比 | 兜底第二层(信用卡基准 81% 召回) |
| **LLM-as-judge** | "这笔花费符合 agent 的任务吗" | **只在上面触发时异步升级**;慢、可被注入,不当硬开关 |

- **冷启动**:新 agent 回退 `budget_id` / archetype 基线;或零样本时序大模型(MOMENT/Chronos/TimesFM)——但 2025 有论文指出它们常勉强胜过一行基线,**要先验**。
- **loop 指纹**:calls/min↑ + 任务数平 + 同 merchant 微充 + 失败率↑。
- **账本字段足够**算前三个。**铁律:最终靠硬熔断(到顶停调用),不是只告警。**

## 2. 被骗着花(prompt injection → 付款)

**残酷事实(先认清):**
- 分类器**可被绕**:emoji / Unicode-tag 走私最高 **100%** 绕过;Prompt Guard 对抗鲁棒但栽在 Unicode。
- 🚩 **FinVault(2601.07853)**:首个执行级金融注入基准,SOTA 模型 ASR 高达 **50%**,结论"**现有防御在真实金融场景无效**"。
- ➡️ **绝不能只靠分类器拦付款。**

**真正能 containment 的是架构(不是检测):**
- **CaMeL**(DeepMind):privileged LLM 只从可信请求写计划;**quarantined LLM 解析不可信数据、无工具权**;能力标签 + 数据流追踪。AgentDojo 77% 任务**可证明安全**。
- **dual-LLM / 隔离** · **Spotlighting**(delimiting / datamarking / 编码,把不可信文本标成非指令)· **taint 追踪** · 工具/动作 allowlist · per-agent scoped 凭证。

**付款时刻的分层防御(花钱前逐项过):**
1. **有签名的 Intent Mandate**(AP2):显式额度 / merchant 集 / 品类 / expiry。**无 mandate → 不准花。**
2. **cart 绑 intent**:金额 ≤ cap、merchant ∈ allowlist、品类匹配、收款方/币种匹配。任一不符即拒。
3. **provenance / taint**:收款方、金额、URL **没来自不可信工具输出**(CaMeL 数据流)。注入的目的地 = 硬拦。
4. **intent↔action 一致性**(DRIFT / AlignmentCheck):这笔付款推进**既定任务**吗?off-task → 拦。
5. **ECDSA 非否认**:final cart 签名;签后篡改即失效。
6. **HITL 升级**:新收款方 / 超阈值 / 一致性低分。
7. **入站预过滤**:分类器 + spotlighting 挡简单的(**假定可绕**)。

**账本能事后 flag**:无匹配 Intent Mandate 的付款 · 超 cap/allowlist · **收款方首见于不可信内容** · 类目漂移 · 重放 mandate · 签名/provenance 缺口。**拦不住,但给检测 + clawback 证据。**

## 3. 被盗刷(compromised key / LLMjacking)

**只靠账本就能算的 6 个信号:**
1. 单身份 **成本/量 z-score 尖峰** 2. **新 key 一上来就猛花** 3. **这 agent 没用过的模型/provider** 4. **token 输入输出比突变** 5. **24×7 / 非工作时段打满** 6. **新收款方**。

**需额外日志(单列,不在 spend row 里):** 新 geo/IP/ASN · impossible-travel-for-agents · provider 控制面事件(`ValidationException`、`Delete…LoggingConfiguration`)。

**预防(key 卫生):** 短期、scoped、per-agent、可单独吊销的凭证(OAuth 2.1 默认)· 事件驱动轮换(部署/换 scope/异常时,不按日历)· 硬件绑定身份 · 持续 secret 泄露扫描。

> 有数:单偷一个 key 一天能烧 **$46k–$100k**(Sysdig);🚩 Q1'26 针对 AI 的凭证盗窃 **+376%**。NHI 厂商(Entro/Astrix/Oasis/Token/GitGuardian)做行为基线 + 泄露扫描 —— 你切的是**他们没碰的"花费"维度**。

## 4. 怎么拦:三阶段(read-only → inline → 链上)

| 阶段 | 在哪 | 能拦什么 |
|---|---|---|
| **Phase 0 只读检测** | off-path、**fail-open**、shadow 模式调规则(= 我们的 collector) | **只告警,拦不住** |
| **Phase 1 网关/中间件 inline**(**fail-closed**) | **LiteLLM/Portkey** 预算计数器→超返 429 · **MCP 中间件**拦 `call_tools`(Cedar/OPA 判)· **x402 中间件**付款前返 402 · egress 代理 · **花费熔断器** + 异常自动吊销 key | **软件发起的花费**,拦在钱动之前 |
| **Phase 2 mandate + 链上硬上限**(**被黑也绕不过**) | **AP2 付款时验签** · **ERC-7715 / Coinbase Spend Permissions 链上超额即 revert** · HITL 升级 | **物理拒绝超预算结算** |

**铁律:** Cedar/OPA 只做"判"、不存预算态(配网关计数器喂实时花费);熔断器放在 **agent 改不到**的地方("kill switch 若由 agent 自己写策略就失效");新规则**先 shadow(记录"本会拦")再翻 fail-closed**。

## 5. 映射到 SubChain 资产 + 实现顺序

**你已有的现成砖:**
- **x402** → Phase 1 的 x402 中间件 + 账本 x402 摄取。
- **ERC-7715 / SubscriptionAllowance** → Phase 2 的链上硬上限(超额 revert)。
- **plan 的 deterministic policy engine + threat-model** → 规则层 + HITL + kill switch。

**在 spend-collector 上加什么(全是 Phase 0,read-only,易落地):**
- `detectors/` —— MAD z-score · 多窗燃烧率 · spend-per-task · 6 个盗刷信号。
- `rules/` —— mandate 缺失 / 超 cap / 类目漂移 / 重放。
- `alerts` —— 触发即告警 + 留证。

**演进**:Phase 0 detectors(现在,在 collector 上)→ Phase 1 接 x402 中间件 + LiteLLM 计数器(inline)→ Phase 2 用 ERC-7715 上链硬上限。

## 6. 误报与诚实边界

- 分类器 / LLM-judge **可绕、有延迟** → 异步升级,不当硬开关。
- 时序大模型常勉强胜过简单基线 → **先上 MAD / 燃烧率,ML 兜底**。
- 只读账本**拦不住**,只能检测 + 告警 + 留证(clawback)。
- FinVault:真实金融场景现有防御仍弱 → **对外别宣称"防住",宣称"检测 + 收窄 + 留证 + 上链硬上限"**。

## 参考(需复核)

**乱花钱:** Google SRE 多窗燃烧率 <https://sre.google/workbook/alerting-on-slos/> · MAD/z-score · Isolation Forest(IJRASET)· MOMENT/Chronos 零样本 TSAD(arXiv 2402.03885)· TSAD 基础模型批评(OpenReview H27kvyG4qf)
**被骗着花:** LlamaFirewall(arXiv 2505.03574)· CaMeL(arXiv 2503.18813)· Spotlighting(arXiv 2403.14720)· AP2 mandates · AgentDojo · 🚩 FinVault(arXiv 2601.07853)· DRIFT(arXiv 2506.12104)· Unicode 绕过(arXiv 2504.11168)
**被盗刷:** Sysdig LLMjacking · Permiso exploiting-hosted-models · 🚩 CSA "LLMjacking Evolved" · GitGuardian(2025 secrets 报告)
**怎么拦:** LiteLLM 预算 enforcement · MCP SEP-1763 Interceptors · Coinbase Spend Permissions · AP2 · 🚩 AWS AgentCore Policy(Cedar)· 🚩 Stanford "kill switches don't work if the agent writes the policy"

---

*🚩 项为知识截止后、厂商/一手/预印本来源,引用前复核。*
