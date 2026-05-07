# 教练记忆循环 — 设计文档

2026-05-06 | 版本 1.0

## 背景

finance-coach-mini 是一个个人用的股票交易复盘微信小程序。用户每天填写交易记录，AI 教练（严正）分析操作行为，给出心理和行为诊断。当前核心问题是：**每日复盘彼此孤立，缺乏记忆和连续性**——昨天的计划今天消失，AI 的追问不会追溯，行为模式无法聚合观察。

本次改进引入"教练记忆循环"：计划→执行→复盘→标签→趋势→再计划。

## 模块一览

| # | 模块 | 目标 | 改动范围 |
|---|------|------|----------|
| 0 | 大盘/题材自动预填 | 打开表单已有结构化行情数据 | `utils/market.js`、`pages/index/index.{js,wxml}`、`pages/coach/coach.js` |
| 1 | 计划自动回显 | 昨日 If-Then 计划自动呈现，触发→买卖、未触发→未执行 | `pages/index/index.{js,wxml}` |
| 2 | 教练记忆系统 | AI 追问持久化，下次复盘自动注入 | `pages/coach/coach.js`、review 数据模型 |
| 3 | 行为标签提取 | AI 输出结构化标签，周期聚合展示 | `pages/coach/coach.js`、`pages/period/period.{js,wxml}`、review 数据模型 |
| 4 | 简单趋势 | 周期复盘展示"符合计划比例"逐日趋势 | `pages/period/period.{js,wxml}` |

---

## 模块零：大盘/题材自动预填

### 数据层 —— 扩展 `utils/market.js`

**新增函数 `fetchSectorRanking()`**：拉取东方财富行业板块涨幅排行前 10 和主力净流入前 5，同时返回涨停板 ST/非ST 拆分和封板率。

API 端点：
- 板块排行：`https://push2.eastmoney.com/api/qt/clist/get`（复用 `fetchJson`），参数 `fs=m:90+t:2`，字段 `f2,f3,f4,f14,f62,f184`
- 涨停板明细：扩展 `fetchLimitStats()` 返回 `limitUpNonST`、`limitUpST`、`limitDownNonST`、`limitDownST`、`sealRate`（封板率 = 涨停数 / 触及涨停数）

**新增函数 `formatMarketFill(formData)`**：将 raw 数据格式化为可直接写入表单的文本：

```
【大盘记录】
全市场成交量：{totalTurnover} 亿（对比昨日：{volLabel}{deltaAmount}）
涨跌分布：上涨 {totalUp} 家 / 下跌 {totalDown} 家
涨停 {limitUp} 家（非ST：{nonST}，ST：{st}），跌停 {limitDown} 家（非ST：{nonST_D}，ST：{st_D}）
连板最高：{maxBoard} 板{stockName}
封板率：{sealRate}%

【题材与主线】
涨幅前 5 板块：
{板块名} +{涨幅}%（{板块简介}）
...
主力净流入前 5：
{板块名} +{净流入} 亿
...
```

### 表单预填 —— 改动 `pages/index/index.js`

在 `onLoad()` 的 `fetchMarketData()` 回调中，将 `formatMarketFill()` 的结果写入 `formData.market`：

```javascript
fetchMarketData() {
  getMarketSnapshot().then(result => {
    if (result) {
      this.setData({
        marketSummary: result.text,
        marketText: result.text,
        marketVol: result.volLabel,
        'formData.market': result.fillText.market,   // 新增
        'formData.theme': result.fillText.theme       // 新增
      })
    }
  }).catch(() => {})
}
```

- 只在用户不是编辑模式（`!editMode`）且 `formData.market` 为空时写入，避免覆盖已有内容
- 用户可自由编辑

### AI 润色 —— 改动 `pages/coach/coach.js`

在 system prompt 中追加一段指令，让 AI 在分析前基于市场数据做一句话结构化解读（市场温度、结构特征、主线持续性判断）。不增加额外的 API 调用。

---

## 模块一：计划自动回显

### 解析规则

从最新一条已提交复盘记录的 `formData.tomorrow` 中提取 If-Then 条目：
- 按换行拆分
- 匹配以数字编号开头（`1. `、`1、`）、以 `如果` 开头的行、或包含 `就` 的行
- 解析失败的条目保留原文，归入"未识别格式"组

### UI 卡片

在表单顶部（市场数据卡片下方）新增 `<view class="plan-recall-card">`，仅在满足以下条件时显示：
- 存在可解析的昨日计划条目
- 当前不是编辑模式

卡片内容：
```
📋 昨日计划追踪（4/28 复盘）
─────────────────────────────
1. 如果 XX 回调到 10.2，就买入 2000 股
   [已触发，买入]  [未触发]
2. 如果 大盘跌破 3000，就减仓到半仓
   [已触发，卖出]  [未触发]
─────────────────────────────
```

### 交互逻辑

- **「已触发，买入」**：追加到 `buyList`，`stock` 尝试从计划文本提取（提取失败设为空），`matchPlan: true`，`reason` 填原计划文本
- **「已触发，卖出」**：同上，追加到 `sellList`
- **「未触发」**：追加到 `missedList`，`what` 填原计划，`why` 留空
- 方向判断：文本匹配关键词，买入（买入/建仓/加仓/抄底），卖出（卖出/清仓/减仓/止盈/止损）。都不命中则根据上下文推断，推不出来默认买入
- 确认后该条目从卡片移除，全部处理完后卡片隐藏

### 状态管理

在 `onLoad()` 中新增 `this.loadYesterdayPlans()`，从 `storage.getReviews()` 取最新非草稿记录，解析 `formData.tomorrow`。结果存入 `data.yesterdayPlans`（数组），每条包含 `{ id, text, direction, status: 'pending'|'triggered_buy'|'triggered_sell'|'missed' }`。

---

## 模块二：教练记忆系统

### 数据模型变更

review 记录新增字段 `pendingQuestions`：

```javascript
pendingQuestions: [
  { id: 'q1', question: '你上次说止损 XX，这次为何又犹豫？', askedAt: timestamp, answered: false }
]
```

### 提问存储 —— `pages/coach/coach.js`

AI 回复返回后，在 `saveReview()` 之前，从回复文本中解析"必须回答的问题"段落：

1. 匹配 `### 必须回答的问题` 后至下一个 `###` 或文本结尾的区间
2. 提取编号列表（`1.`、`-`、`①` 等）后的文本，每行一个问题
3. 生成 `pendingQuestions` 数组，写入 review
4. 解析失败（AI 输出格式不标准）→ 跳过，不影响主流程

### 追问注入 —— `pages/coach/coach.js`

在 `getHistoricalContext()` 返回的历史上下文中追加未回答问题的汇总（如有）：

```
---\n【上次追问（用户尚未回答）】\n1. xxx\n2. xxx\n请基于用户今天的操作，追问这些未回答的问题。如果用户今天的操作恰好触及了这些问题，指出关联。
```

数据来源：取最近 5 条 reviews 中所有 `answered: false` 的问题，去重（完全相同的问题只保留最新一条）。

### 手动标记已回答

在 `pages/history/history.js` 的复盘详情页中，如果有 `pendingQuestions` 且未全部标记回答，展示问题列表，每条带一个「标记已答」按钮。点击后将对应 `answered` 设为 `true`，更新 storage。

*注：这个入口先做最简版本（详情页内），不在首页历史抽屉增加入口，避免范围蔓延。*

---

## 模块三：行为标签提取

### AI 输出格式

在 coach 页面的 system prompt 末尾追加：

```
## 输出标签
在回复最末尾加一行 JSON（不要 markdown 代码块，纯文本）：
__TAGS__:["标签1","标签2","标签3"]
标签从以下候选池选择，最多 3 个：
追涨、杀跌、止损拖延、止盈过早、过度交易、犹豫不决、锚定效应、
损失厌恶、过度自信、确认偏误、近因效应、羊群效应、计划缺失、
逆势操作、仓位失控、盘中冲动、报复交易、踏空焦虑
如果找不到匹配的，可以自定义一个简短的（不超过 6 个字）。
```

### 解析与存储 —— `pages/coach/coach.js`

1. 正则匹配 `__TAGS__\s*:\s*\[(.*?)\]`（允许跨行）
2. 提取 JSON 数组，解析失败则降级（不做任何事）
3. 存入 review 记录的 `tags` 字段（`string[]`）
4. 从 AI 回复的显示文本中移除 `__TAGS__:["..."]` 行（不让用户看到）

### 周期聚合展示 —— `pages/period/period.js`

在 `generateWeekReview()`/`generateMonthReview()` 生成的 dailyReviews 中收集所有 `tags`，在 AI 分析文本之前展示频率表。

如果同一个标签在不同周/月周期重复出现（对比上一周期），标注方向箭头。

### 向下兼容

没有 `tags` 字段的旧记录跳过，不报错。首次使用不会显示标签。

---

## 模块四：简单趋势

### 计算公式

每篇复盘中有交易的条目（买入+卖出），计算 `matchPlan === true` 的占比：

```
符合计划比例 = (matchPlan=true 的交易笔数) / (总交易笔数) × 100%
总交易笔数 = buyList 中有 stock 的条目 + sellList 中有 stock 的条目
```

当日无交易 → 显示 "—"，不纳入均值计算。

### 展示

在周期复盘页面，dailyReviews 列表获取后在页面上方展示纯文本趋势表。每行显示日期、比例、柱状字符（█）、具体笔数：

```
计划执行力趋势（过去30天）：
04-28  ████████████████  100%（2/2）
04-29  ██████████████     88%（7/8）
04-30  ██████████         67%（4/6）
05-01  ███████████████████ 93%（14/15）
05-06  —                  无交易
──────────────────────────────
均值  87%
最低  67%（04-30）
```

日比例低于 50% 的行首加 ⚠️ 标记。

### 延伸（先不实现）

- 未执行计划数量趋势
- 交易频率变化趋势
- 行为标签出现频率趋势

这些基于标签数据（模块三建成后）可以后续补充。

---

## 改动文件汇总

| 文件 | 改动 |
|------|------|
| `utils/market.js` | 新增 `fetchSectorRanking()`、扩展 `fetchLimitStats()`、新增 `formatMarketFill()` |
| `pages/index/index.js` | 新增 `loadYesterdayPlans()`、`formatMarketFill` 写入、计划解析与状态管理、卡片交互方法 |
| `pages/index/index.wxml` | 新增昨日计划追踪卡片 UI |
| `pages/index/index.wxss` | 新增卡片样式 |
| `pages/coach/coach.js` | 新增 `parsePendingQuestions()`、`extractTags()`、追加追问和标签指令到 prompt、保存时写入新字段 |
| `pages/history/history.js` | 新增 pendingQuestions 展示 + 标记已答按钮 |
| `pages/history/history.wxml` | 新增问题列表 UI |
| `pages/period/period.js` | 新增标签聚合计算、趋势数据计算 |
| `pages/period/period.wxml` | 新增标签频率表、趋势表 UI |
| `pages/period/period.wxss` | 新增标签/趋势样式 |

无新增文件。所有改动在现有文件上增量进行。

## 风险与降级

- **东方财富 API 不稳定**：板块排行获取失败 → `formData.market`/`formData.theme` 不预填，不影响手动输入
- **AI 不输出 `__TAGS__`**：正则匹配不到 → `tags` 为空数组，降级无害
- **`tomorrowPlan` 格式不规范**：解析不出 If-Then 条目 → 显示原始文本 + 手动导入按钮
- **旧数据无新字段**：`pendingQuestions` 和 `tags` 均可选，判断 undefined 安全跳过
