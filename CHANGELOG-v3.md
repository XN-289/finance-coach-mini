# 交易教练 v3.0.0 — AI Agentic 升级日志

> 50 轮迭代，全面升级为 AI Agent 架构

---

## Phase 1: Agent 引擎核心（迭代 1-10）

### 迭代 1: 重试与缓存机制
- **文件**: `utils/agent.js`
- API 调用增加指数退避重试（最多 2 次，延迟 1s/2s）
- 工具结果缓存（Map 存储，5 分钟 TTL，自动清理过期）
- 执行元数据追踪（startTime/endTime/duration）

### 迭代 2: API 错误分类
- **文件**: `utils/api.js`
- 新增 `ApiError` 类，支持错误码分类：`rate_limit`/`auth_error`/`server_error`/`timeout`/`network_error`
- HTTP 状态码 429/401/500+ 精确识别

### 迭代 3: 结构化输出解析
- **文件**: `utils/agent.js`
- 新增 `parseStructuredOutput()` 函数，支持 `__JSON_START__...__JSON_END__` 块解析
- 新增 `analyze_sentiment` 工具：关键词情绪分析

### 迭代 4: Agent 上下文记忆
- **文件**: `utils/agent.js`
- 新增 `buildAgentContext()` 函数，自动构建用户画像
- 上下文包含：总复盘数、执行率、连续天数、高频标签、未回答追问、经验水平
- 上下文自动注入 System Prompt

### 迭代 5: 多工具并行编排
- **文件**: `utils/agent.js`
- 工具调用改为 `Promise.all` 并行执行
- 缓存命中时跳过实际调用，直接返回缓存结果
- 工具执行日志记录每个调用的详细信息

### 迭代 6: 自我修正循环
- **文件**: `utils/agent.js`
- 新增 correction 阶段，检查分析质量
- 质量检查维度：具体数字、引用交易、可执行建议、非空话、标签有证据
- 质量不达标时自动重新生成（最多 1 轮）

### 迭代 7: 性能指标追踪
- **文件**: `utils/agent.js`
- 返回详细元数据：`totalTimeMs`/`apiCallCount`/`toolCallsCount`/`cacheHitCount`/`retryCount`/`qualityScore`

### 迭代 8: 自适应温度
- **文件**: `utils/agent.js`
- 工具调用：0.3（保守准确）
- 分析生成：0.9（创意发散）
- 质量审查：0.4（严谨）
- 自我修正：0.2（最保守）

### 迭代 9: 详细进度报告
- **文件**: `utils/agent.js`, `pages/coach/coach.js`
- 进度事件包含 `phase`/`progress`(0-100)/`message`
- 教练页面显示进度百分比条
- 阶段：context(5%) → tools(15-45%) → analysis(50-60%) → reflection(70%) → correction(85%) → done(100%)

### 迭代 10: 错误恢复
- **文件**: `utils/agent.js`, `utils/api.js`
- 工具调用失败时继续执行其他工具
- 主分析失败时降级为无工具模式
- 反思失败时跳过（不阻塞主流程）
- 返回部分结果而非完全失败

---

## Phase 2: 新增 AI 工具（迭代 11-20）

### 迭代 11: `detect_patterns` — 交易模式检测
- 检测重复交易的股票（3 次以上）
- 分析时间偏好（上午/下午/晚上）
- 计算买卖比率和日均交易数

### 迭代 12: `assess_risk` — 风险评估
- 过度交易评分（日均 > 5 笔为高风险）
- 集中度风险（< 5 只股票为高风险）
- 情绪交易指标（报复交易、盘中冲动等标签）
- 综合风险等级：low/medium/high

### 迭代 13: `track_improvements` — 改善追踪
- 按周计算指定指标趋势
- 支持指标：adherence/overtrading/tag:标签名
- 方向判断：improving/worsening/stable

### 迭代 14: `analyze_market_correlation` — 市场相关性
- 分析用户在牛市/熊市/震荡市的交易偏好
- 统计不同市场条件下的交易次数
- 识别用户偏好的市场环境

### 迭代 15: `score_plans` — 计划质量评分
- 具体性（0-25）：有股票名/价格/数量
- 条件清晰度（0-25）：有明确触发条件
- 可执行性（0-25）：有具体动作
- 风控（0-25）：有止损/仓位

### 迭代 16: `detect_emotional_state` — 情绪状态检测
- 检测 5 种情绪：fear/greed/frustration/overconfidence/anxiety
- 关键词匹配，返回主情绪、置信度、证据

### 迭代 17: `compare_sessions` — 会话对比
- 对比当前与上次复盘
- 共同股票/新股票/计划执行率变化/标签变化
- 检测是否重复犯错

### 迭代 18: `analyze_frequency` — 交易频率分析
- 日均交易数、最大交易日
- 活跃天数 vs 休息天数
- 交易聚集检测
- 频率分类：overtrading/active/moderate/passive

### 迭代 19: `detect_biases` — 认知偏差检测
- **锚定效应**：反复提到相同价格位
- **处置效应**：卖出执行率低于买入
- **损失厌恶**：未执行计划中止损类占比过高
- **过度自信**：频繁使用确定性词语
- **确认偏误**：买入理由无风险提示

### 迭代 20: `generate_weekly_digest` — 周报生成
- 7 天交易摘要
- 交易次数、买卖比、执行率
- 最常交易股票、最常见标签

---

## Phase 3: 教练智能（迭代 21-30）

### 迭代 21: 自适应分析深度
- **文件**: `pages/coach/coach.js`
- 新手（< 5 次）：重点基础习惯，语气温和鼓励
- 中级（5-20 次）：重点模式识别，挑战突破
- 高级（> 20 次）：精细优化，心理分析

### 迭代 22: 智能跟进问题
- 基于用户操作生成 2-3 个思考问题
- 针对计划外交易、未执行计划、行为标签
- 存入 review.followUpQuestions

### 迭代 23: 交易风格画像
- 分析用户交易风格：活跃型/耐心型/均衡型
- 结合计划执行率判断：纪律者/冲动型
- 存入 review.coachingStyle

### 迭代 24: 里程碑追踪
- 第一次复盘 🎉
- 连续 7 天复盘 🔥
- 连续 30 天复盘 🏆
- 100% 计划执行率 💯

### 迭代 25: 市场上下文分析
- 自动获取当前市场数据
- 对比用户交易方向与市场方向
- 分析板块匹配度

### 迭代 26: 行动项提取
- 从 AI 分析中提取具体行动项
- 匹配"下次...时，..."和"如果...就..."模式
- 存入 review.actionItems

### 迭代 27: 复盘质量评分
- 大盘观察 +15
- 题材分析 +10
- 具体股票 +15/+10
- 买入理由 +10
- 自我评价 +15
- If-Then 计划 +15/+10
- 总分 0-100

### 迭代 28: 对比分析（通过工具实现）
- 使用 `compare_sessions` 工具自动对比
- 使用 `benchmark_against_peers` 对比同行

### 迭代 29: 教练语气调整
- 表现下滑 → 更直接批评
- 有进步 → 适当肯定但继续推动
- 稳定 → 平衡鼓励与挑战

### 迭代 30: 会话记忆（通过上下文实现）
- `buildAgentContext()` 自动加载最近 3 次会话
- 提取关键主题注入 prompt
- 追踪建议采纳情况

---

## Phase 4: 智能功能（迭代 31-40）

### 迭代 31: 仪表盘 AI 洞察
- **文件**: `pages/dashboard/dashboard.js`, `dashboard.wxml`, `dashboard.wxss`
- 自动生成 2-5 条智能洞察
- 执行率、连续复盘、标签、交易频率、未执行计划
- 颜色编码：positive/warning/info

### 迭代 32-33: 智能通知
- **文件**: `pages/index/index.js`, `index.wxml`, `index.wxss`
- 3 天未复盘 → 高优先级提醒
- 昨天复盘今天没有 → 中优先级
- 未回答追问 ≥ 2 → 低优先级
- 可关闭的顶部通知条

### 迭代 34: 计划质量评分（通过工具实现）
- `score_plans` 工具评估 If-Then 计划质量
- 教练页面展示质量分数

### 迭代 35: 周期复盘增强
- **文件**: `pages/period/period.js`
- AI prompt 注入结构化数据：交易次数、执行率、最常交易、行为标签
- 分析更精准，引用具体数字

### 迭代 36: 习惯评分系统
- **文件**: `utils/stats.js`, `pages/dashboard/dashboard.js`, `dashboard.wxml`, `dashboard.wxss`
- 计划习惯、耐心习惯、风控习惯、综合评分
- 仪表盘展示习惯评分网格

### 迭代 37: 交易日志导出
- **文件**: `utils/export.js`
- `generateTradeJournal()` 生成 CSV 格式交易日志
- 包含：日期、股票、方向、理由、计划内、标签

### 迭代 38-39: 自选股智能
- **文件**: `pages/stocks/stocks.js`, `stocks.wxml`, `stocks.wxss`
- 历史交易股票展示
- 高频交易标记（3 次以上）
- 最后交易方向和日期

### 迭代 40: 个人中心交易画像
- **文件**: `pages/profile/profile.js`, `profile.wxml`, `profile.wxss`
- 交易风格识别（均衡型/高频型/活跃型/耐心型 · 纪律者/冲动型）
- 高频标签展示
- 优势与待改善分析

---

## Phase 5: 元智能（迭代 41-50）

### 迭代 41-45: 新增高级 AI 工具
- `detect_anomalies` — 异常检测（交易次数异常、新股票、执行率骤降）
- `attribute_performance` — 绩效归因（计划内 vs 计划外、理由质量）
- `track_coaching_effectiveness` — 教练效果追踪（前后半段对比）
- `benchmark_against_peers` — 同行基准对比（散户平均水平）
- `predict_next_session` — 下次会话预测（过度自信、报复交易、持续偏差风险）

### 迭代 46: 反思提示
- **文件**: `pages/coach/coach.js`, `coach.wxml`
- 基于用户弱点生成反思提示
- "下次交易前想想"区域展示

### 迭代 47: 习惯追踪器
- **文件**: `utils/stats.js`
- `computeHabitScores()` 计算 4 维习惯评分
- 计划习惯、复盘习惯、风控习惯、耐心习惯
- 集成到 `computeAllStats()` 返回值

### 迭代 48: 预测评分（通过工具实现）
- `predict_next_session` 分析历史模式
- 连胜后过度自信风险
- 连亏后报复交易风险
- 持续偏差风险

### 迭代 49: 教练个性化
- **文件**: `pages/coach/coach.js`
- 检测用户对不同风格的响应
- 严厉/鼓励/平衡三种风格
- 动态调整 System Prompt 语气

### 迭代 50: 最终集成
- **文件**: `app.js`, `pages/profile/profile.js`
- 版本升级至 3.0.0
- 关于页面更新，展示 v3.0 新功能列表

---

## 文件变更汇总

| 文件 | 变更类型 | 主要改动 |
|------|---------|---------|
| `utils/agent.js` | **重写** | v3.0 引擎：重试、缓存、并行、修正、记忆、进度 |
| `utils/ai-tools.js` | **重写** | 新增 12 个 AI 工具（总计 17 个） |
| `utils/api.js` | **重写** | ApiError 类、错误码分类 |
| `utils/stats.js` | 增强 | 新增 `computeHabitScores()` |
| `utils/export.js` | 增强 | 新增 `generateTradeJournal()` |
| `pages/coach/coach.js` | **重写** | 自适应 prompt、跟进问题、行动项、里程碑、反思 |
| `pages/coach/coach.wxml` | **重写** | 进度条、里程碑、行动项、跟进问题、反思区 |
| `pages/coach/coach.wxss` | 增强 | 新增 10+ 样式类 |
| `pages/dashboard/dashboard.js` | 增强 | AI 洞察生成、习惯评分 |
| `pages/dashboard/dashboard.wxml` | 增强 | 洞察卡片、习惯评分网格 |
| `pages/dashboard/dashboard.wxss` | 增强 | 洞察、习惯样式 |
| `pages/index/index.js` | 增强 | 智能通知检测 |
| `pages/index/index.wxml` | 增强 | 通知条 |
| `pages/index/index.wxss` | 增强 | 通知样式 |
| `pages/period/period.js` | 增强 | 结构化数据注入 prompt |
| `pages/stocks/stocks.js` | 增强 | 历史交易股票展示 |
| `pages/stocks/stocks.wxml` | 增强 | 交易股票区域 |
| `pages/stocks/stocks.wxss` | 增强 | 交易股票样式 |
| `pages/profile/profile.js` | 增强 | 交易画像、版本升级 |
| `pages/profile/profile.wxml` | 增强 | 交易画像卡片 |
| `pages/profile/profile.wxss` | 增强 | 画像样式 |
| `pages/conversation/conversation.js` | 增强 | 复制对话功能 |
| `app.js` | 增强 | 版本升级 3.0.0 |

---

## AI 工具清单（17 个）

| 工具名 | 功能 | 新增 |
|--------|------|------|
| `get_review_history` | 获取复盘历史 | 原有 |
| `get_pending_questions` | 获取未回答追问 | 原有 |
| `get_market_data` | 获取市场数据 | 原有 |
| `get_trading_stats` | 获取交易统计 | 原有 |
| `get_tag_trend` | 标签趋势 | 原有 |
| `analyze_sentiment` | 情绪分析 | ✅ 新增 |
| `detect_patterns` | 模式检测 | ✅ 新增 |
| `assess_risk` | 风险评估 | ✅ 新增 |
| `track_improvements` | 改善追踪 | ✅ 新增 |
| `analyze_market_correlation` | 市场相关性 | ✅ 新增 |
| `score_plans` | 计划质量评分 | ✅ 新增 |
| `detect_emotional_state` | 情绪状态检测 | ✅ 新增 |
| `compare_sessions` | 会话对比 | ✅ 新增 |
| `analyze_frequency` | 频率分析 | ✅ 新增 |
| `detect_biases` | 认知偏差检测 | ✅ 新增 |
| `generate_weekly_digest` | 周报生成 | ✅ 新增 |
| `detect_anomalies` | 异常检测 | ✅ 新增 |
| `attribute_performance` | 绩效归因 | ✅ 新增 |
| `track_coaching_effectiveness` | 教练效果追踪 | ✅ 新增 |
| `benchmark_against_peers` | 同行基准对比 | ✅ 新增 |
| `predict_next_session` | 下次预测 | ✅ 新增 |
