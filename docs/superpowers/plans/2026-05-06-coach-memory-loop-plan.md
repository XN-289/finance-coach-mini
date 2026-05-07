# 教练记忆循环 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每日复盘引入"教练记忆循环"——昨日计划自动回显、AI 追问持久化、行为标签提取与聚合、计划执行力趋势。

**Architecture:** 所有改动在现有文件上增量进行，无新增文件。模块按顺序实施：0（行情预填）→ 1（计划回显）→ 2（教练记忆）→ 3（行为标签）→ 4（趋势），每个模块可独立验证。

**Tech Stack:** 微信小程序原生、DeepSeek Chat API、东方财富公开 API

**注意：** 项目无测试框架，验证通过微信开发者工具手动进行。每次改动后在 IDE 中刷新预览。

---

### Task 1: 扩展 market.js — 涨停 ST 拆分 + 板块排行

**Files:**
- Modify: `utils/market.js:41-70`（扩展 fetchLimitStats）
- Modify: `utils/market.js:1-20`（新增 fetchSectorRanking 调用 fetchJson）

- [ ] **Step 1: 扩展 fetchLimitStats 返回 ST/非ST 拆分和封板率**

在 `utils/market.js` 的 `fetchLimitStats` 函数中，将返回数据结构从简单计数改为包含拆分和封板率。

当前代码（第 44-70 行）的核心逻辑：
```javascript
// 现有：stocks.forEach(s => { 只统计涨跌停总数和最高连板 })
// 改为：同时按 ST/非ST 拆分，计算封板率
```

修改 `fetchLimitStats` 的 `fields` 参数和数据处理逻辑：

```javascript
function fetchLimitStats() {
  return fetchJson(LIMIT_API, {
    pn: 1,
    pz: 500,
    po: 1,
    np: 1,
    fltt: 2,
    invt: 2,
    fid: 'f3',
    fs: 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23',
    fields: 'f2,f3,f12,f14,f62,f184'  // 新增 f184（触及涨停标记）
  }).then(res => {
    if (!res.data || !res.data.diffs) throw new Error('无数据')

    const stocks = res.data.diffs
    let limitUp = 0
    let limitUpNonST = 0
    let limitUpST = 0
    let limitDown = 0
    let limitDownNonST = 0
    let limitDownST = 0
    let maxBoard = 0
    let maxBoardStock = ''
    let touchedUp = 0  // 触及过涨停

    stocks.forEach(s => {
      const pct = s.f3 || 0
      const board = s.f62 || 0
      const touched = s.f184 || 0  // 触及涨停标记
      const name = s.f14 || ''
      const isST = name.includes('ST') || name.includes('*ST')

      if (pct >= 9.8) {
        limitUp++
        if (isST) limitUpST++
        else limitUpNonST++
      }
      if (pct <= -9.8) {
        limitDown++
        if (isST) limitDownST++
        else limitDownNonST++
      }
      if (touched >= 1) touchedUp++
      if (board > maxBoard) {
        maxBoard = board
        maxBoardStock = name
      }
    })

    const sealRate = touchedUp > 0
      ? Math.round((limitUp / touchedUp) * 100)
      : 0

    return {
      limitUp, limitUpNonST, limitUpST,
      limitDown, limitDownNonST, limitDownST,
      maxBoard, maxBoardStock,
      sealRate, touchedUp
    }
  })
}
```

- [ ] **Step 2: 验证 fetchLimitStats 改动无语法错误**

在微信开发者工具中编译，确认无报错。查看 Console，不应有 `ReferenceError`。

- [ ] **Step 3: 新增 fetchSectorRanking 函数**

在 `utils/market.js` 的 `fetchLimitStats()` 之后（第 70 行后）、`getStoredSnapshot()` 之前（第 72 行前）插入：

```javascript
function fetchSectorRanking() {
  // 行业板块涨幅排行
  return fetchJson(LIMIT_API, {
    pn: 1,
    pz: 10,
    po: 1,
    np: 1,
    fltt: 2,
    invt: 2,
    fid: 'f3',
    fs: 'm:90+t:2',
    fields: 'f2,f3,f14,f62'
  }).then(res => {
    if (!res.data || !res.data.diffs) throw new Error('无板块数据')

    const sectors = res.data.diffs.map(s => ({
      name: s.f14 || '',
      changePct: (s.f3 || 0).toFixed(2),
      leadStock: s.f62 ? String(s.f62) : ''
    })).filter(s => s.name && !s.name.includes('昨日') && !s.name.includes('昨日'))

    return sectors.slice(0, 5)
  }).catch(err => {
    console.error('获取板块排行失败:', err)
    return []
  })
}
```

- [ ] **Step 4: 新增 formatMarketFill 预填文本生成函数**

在 `utils/market.js` 的 `getMarketSnapshot()` 函数之前（第 91 行前）插入：

```javascript
function formatMarketFill(snapshot, sectors, yesterdayDelta) {
  const { sh, sz, totalTurnover, totalUp, totalDown } = snapshot
  const { limitUp, limitUpNonST, limitUpST, limitDown, limitDownNonST, limitDownST, maxBoard, maxBoardStock, sealRate } = snapshot

  const volLabel = snapshot.yesterdayTurnover
    ? (totalTurnover >= snapshot.yesterdayTurnover ? '放量' : '缩量')
    : '—'

  const deltaStr = yesterdayDelta
    ? `，${yesterdayDelta > 0 ? '+' : ''}${yesterdayDelta.toFixed(0)} 亿`
    : ''

  // 大盘记录预填
  const marketLines = [
    `全市场成交量：${totalTurnover.toFixed(0)} 亿（对比昨日：${volLabel}${deltaStr}）`,
    `涨跌分布：上涨 ${totalUp} 家 / 下跌 ${totalDown} 家`,
    `涨停 ${limitUp} 家（非ST：${limitUpNonST}，ST：${limitUpST}），跌停 ${limitDown} 家（非ST：${limitDownNonST}，ST：${limitDownST}）`,
    `连板最高：${maxBoard} 板${maxBoardStock ? '（' + maxBoardStock + '）' : ''}`,
    `封板率：${sealRate}%`
  ]
  const market = marketLines.join('\n')

  // 题材与主线预填
  let theme = ''
  if (sectors.length > 0) {
    const sectorLines = sectors.map(s =>
      `${s.name} +${s.changePct}%${s.leadStock ? '（领涨：' + s.leadStock + '）' : ''}`
    )
    theme = '涨幅前 5 板块：\n' + sectorLines.join('\n')
  }

  return { market, theme }
}
```

- [ ] **Step 5: 修改 getMarketSnapshot — 同时拉取板块数据并返回 fillText**

修改 `getMarketSnapshot()` 函数（第 91-137 行），并行拉取板块排名，并在返回值中增加 `fillText` 字段。

将当前的 `Promise.all` 调用改为：

```javascript
function getMarketSnapshot() {
  return Promise.all([
    fetchIndex('1.000001'),
    fetchIndex('0.399001'),
    fetchLimitStats(),
    fetchSectorRanking()  // 新增
  ]).then(([sh, sz, limit, sectors]) => {
    const totalTurnover = (sh.turnover || 0) + (sz.turnover || 0)
    const totalUp = (sh.advancers || 0) + (sz.advancers || 0)
    const totalDown = (sh.decliners || 0) + (sz.decliners || 0)

    const yesterday = getStoredSnapshot()

    const snapshot = {
      sh, sz,
      totalTurnover, totalUp, totalDown,
      limitUp: limit.limitUp,
      limitUpNonST: limit.limitUpNonST,
      limitUpST: limit.limitUpST,
      limitDown: limit.limitDown,
      limitDownNonST: limit.limitDownNonST,
      limitDownST: limit.limitDownST,
      maxBoard: limit.maxBoard,
      maxBoardStock: limit.maxBoardStock,
      sealRate: limit.sealRate,
      yesterdayTurnover: yesterday ? yesterday.totalTurnover : null
    }

    storeSnapshot(snapshot)

    const volLabel = yesterday
      ? (totalTurnover >= yesterday.totalTurnover ? '放量' : '缩量')
      : '—'

    const parts = [
      `全市场成交量：${totalTurnover.toFixed(0)} 亿（对比昨日：${volLabel}）`,
      `涨跌分布：上涨 ${totalUp} 家 / 下跌 ${totalDown} 家`,
      `情绪指标：涨停 ${limit.limitUp} 家 / 跌停 ${limit.limitDown} 家 / 连板最高 ${limit.maxBoard} 板`
    ]

    // 成交量变化
    const yesterdayDelta = yesterday ? totalTurnover - yesterday.totalTurnover : null

    const fillText = formatMarketFill(snapshot, sectors, yesterdayDelta)

    return {
      raw: snapshot,
      text: parts.join('\n'),
      volLabel,
      fillText  // 新增
    }
  }).catch(err => {
    console.error('获取行情失败:', err)
    return null
  })
}
```

- [ ] **Step 6: 更新 module.exports**

修改文件末尾的 `module.exports`，新增导出：

```javascript
module.exports = { getMarketSnapshot }
```

（无需新增导出，`formatMarketFill` 和 `fetchSectorRanking` 只在模块内使用）

- [ ] **Step 7: 编译验证**

在微信开发者工具中编译，确认无报错。打开首页，网络面板中应看到新增的板块排行 API 请求。

- [ ] **Step 8: Commit**

```bash
git add utils/market.js
git commit -m "feat: extend market.js with ST/non-ST split, sector ranking, and pre-fill formatter"
```

---

### Task 2: 大盘/题材自动填入表单

**Files:**
- Modify: `pages/index/index.js:41-50`（fetchMarketData）

- [ ] **Step 1: 修改 fetchMarketData 写入预填文本**

把 [pages/index/index.js:41-50](pages/index/index.js#L41-L50) 中的 `fetchMarketData()` 方法替换为：

```javascript
fetchMarketData() {
  getMarketSnapshot().then(result => {
    if (result) {
      const updateData = {
        marketSummary: result.text,
        marketText: result.text,
        marketVol: result.volLabel
      }
      // 非编辑模式且表单为空时自动预填
      if (!this.data.editMode) {
        if (!this.data.formData.market && result.fillText.market) {
          updateData['formData.market'] = result.fillText.market
        }
        if (!this.data.formData.theme && result.fillText.theme) {
          updateData['formData.theme'] = result.fillText.theme
        }
      }
      this.setData(updateData)
    }
  }).catch(() => {})
},
```

- [ ] **Step 2: 验证**

在微信开发者工具中操作：
1. 清空草稿 → 关闭并重新打开小程序首页
2. 预期：大盘记录输入框自动显示行情数据（成交量和涨跌分布等），题材与主线输入框自动显示板块排行
3. 编辑模式（从历史页编辑进入）→ 预期：不覆盖已有内容
4. 手动修改预填内容 → 确认不会被重新覆盖（因为 `formData.market` 非空时跳过）

- [ ] **Step 3: Commit**

```bash
git add pages/index/index.js
git commit -m "feat: auto-fill market data and sector ranking into form"
```

---

### Task 3: 昨日计划解析逻辑

**Files:**
- Modify: `pages/index/index.js`（新增 loadYesterdayPlans 及相关方法）

- [ ] **Step 1: 新增 plan-parsing 方法**

在 [pages/index/index.js](pages/index/index.js) 的 `checkDraft()` 之后（第 51 行后）插入：

```javascript
loadYesterdayPlans() {
  // 编辑模式不显示昨日计划
  if (this.data.editMode) return

  const reviews = storage.getReviews()
    .filter(r => !r.isDraft)
    .sort((a, b) => b.timestamp - a.timestamp)

  if (reviews.length === 0) return

  const lastReview = reviews[0]
  const tomorrowPlan = lastReview.formData.tomorrow
  if (!tomorrowPlan || !tomorrowPlan.trim()) return

  const plans = this.parsePlans(tomorrowPlan, lastReview.date)
  if (plans.length === 0) return

  this.setData({
    yesterdayPlans: plans,
    yesterdayPlanDate: lastReview.date
  })
},

parsePlans(tomorrowText, date) {
  const lines = tomorrowText.split('\n').filter(l => l.trim())
  const plans = []
  let idCounter = 0

  lines.forEach(line => {
    const trimmed = line.trim()
    // 匹配数字编号开头、或以"如果"开头、或包含"就"的行
    const isPlanLine = /^\d+[.、)\s]/.test(trimmed)
      || trimmed.startsWith('如果')
      || trimmed.includes('就')

    if (!isPlanLine) return

    // 去除编号前缀
    const cleanText = trimmed.replace(/^\d+[.、)\s]+/, '').trim()

    const direction = this.guessDirection(cleanText)

    plans.push({
      id: `plan_${date}_${idCounter++}`,
      text: cleanText,
      direction,
      status: 'pending'
    })
  })

  return plans
},

guessDirection(planText) {
  const buyKeywords = ['买入', '建仓', '加仓', '抄底', '低吸', '开仓', '做多']
  const sellKeywords = ['卖出', '清仓', '减仓', '止盈', '止损', '平仓', '做空', '离场']

  for (const kw of buyKeywords) {
    if (planText.includes(kw)) return 'buy'
  }
  for (const kw of sellKeywords) {
    if (planText.includes(kw)) return 'sell'
  }
  return 'buy' // 默认买入
},
```

- [ ] **Step 2: 新增计划操作处理方法**

在 `loadYesterdayPlans` 之后插入：

```javascript
handlePlanTriggered(e) {
  const planId = e.currentTarget.dataset.id
  const plan = this.data.yesterdayPlans.find(p => p.id === planId)
  if (!plan) return

  if (plan.direction === 'buy') {
    const buyList = [...this.data.formData.buyList, {
      stock: '',
      reason: plan.text,
      matchPlan: true
    }]
    this.setData({ 'formData.buyList': buyList })
  } else {
    const sellList = [...this.data.formData.sellList, {
      stock: '',
      reason: plan.text,
      matchPlan: true
    }]
    this.setData({ 'formData.sellList': sellList })
  }

  this.markPlanResolved(planId, 'triggered')
  this.autoSaveDraft()
},

handlePlanMissed(e) {
  const planId = e.currentTarget.dataset.id
  const plan = this.data.yesterdayPlans.find(p => p.id === planId)
  if (!plan) return

  const missedList = [...this.data.formData.missedList, {
    what: plan.text,
    why: ''
  }]
  this.setData({ 'formData.missedList': missedList })

  this.markPlanResolved(planId, 'missed')
  this.autoSaveDraft()
},

markPlanResolved(planId, resolvedStatus) {
  const plans = this.data.yesterdayPlans.map(p =>
    p.id === planId ? { ...p, status: resolvedStatus } : p
  )
  const allResolved = plans.every(p => p.status !== 'pending')
  this.setData({
    yesterdayPlans: allResolved ? [] : plans
  })
},
```

- [ ] **Step 3: 在 onLoad 中调用 loadYesterdayPlans**

修改 `onLoad` 方法（第 27-36 行），在调用 `checkDraft()` 之后增加调用：

```javascript
onLoad(options) {
  if (options.id) {
    this.loadReviewForEdit(options.id)
  } else {
    this.checkDraft()
  }
  this.loadHistory()
  this.fetchMarketData()
  this.loadYesterdayPlans()  // 新增
},
```

- [ ] **Step 4: 编译验证**

在微信开发者工具中编译，确认无报错。确认首页正常加载。

- [ ] **Step 5: Commit**

```bash
git add pages/index/index.js
git commit -m "feat: add yesterday plan parsing and action handlers"
```

---

### Task 4: 昨日计划追踪卡片 UI

**Files:**
- Modify: `pages/index/index.wxml`（新增卡片）
- Modify: `pages/index/index.wxss`（新增样式）

- [ ] **Step 1: 在 index.wxml 中添加计划追踪卡片**

在草稿提示条之后、市场数据卡片之前（第 15 行后）插入：

```xml
<!-- 昨日计划追踪卡片 -->
<view wx:if="{{yesterdayPlans.length > 0}}" class="plan-recall-card">
  <view class="plan-recall-header">
    <text class="plan-recall-title">昨日计划追踪（{{yesterdayPlanDate}} 复盘）</text>
  </view>
  <view
    wx:for="{{yesterdayPlans}}"
    wx:key="id"
    class="plan-recall-item"
  >
    <text class="plan-recall-text">{{item.text}}</text>
    <view class="plan-recall-actions">
      <text
        class="plan-recall-btn triggered"
        data-id="{{item.id}}"
        bindtap="handlePlanTriggered"
      >已触发</text>
      <text
        class="plan-recall-btn missed"
        data-id="{{item.id}}"
        bindtap="handlePlanMissed"
      >未触发</text>
    </view>
  </view>
</view>
```

- [ ] **Step 2: 在 index.wxss 中添加卡片样式**

在 `draft-actions` 样式规则之后（第 34 行后）插入：

```css
/* 昨日计划追踪卡片 */
.plan-recall-card {
  background: #fff;
  border-radius: 12rpx;
  padding: 24rpx 28rpx;
  margin: 0 20rpx 20rpx;
  border-left: 6rpx solid #e4393c;
  box-shadow: 0 1rpx 4rpx rgba(0, 0, 0, 0.04);
}

.plan-recall-header {
  margin-bottom: 16rpx;
}

.plan-recall-title {
  font-size: 26rpx;
  font-weight: 600;
  color: #e4393c;
}

.plan-recall-item {
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}

.plan-recall-item:last-child {
  border-bottom: none;
}

.plan-recall-text {
  font-size: 26rpx;
  color: #333;
  line-height: 1.6;
  display: block;
  margin-bottom: 12rpx;
}

.plan-recall-actions {
  display: flex;
  gap: 16rpx;
}

.plan-recall-btn {
  padding: 10rpx 24rpx;
  border-radius: 8rpx;
  font-size: 24rpx;
  font-weight: 600;
}

.plan-recall-btn.triggered {
  background: #fef0f0;
  color: #e4393c;
}

.plan-recall-btn.missed {
  background: #f5f5f5;
  color: #999;
}

.plan-recall-btn:active {
  opacity: 0.7;
}
```

- [ ] **Step 3: 在 index.js data 中新增字段**

在 `Page({ data: { ... } })` 中增加两个字段（放在 `hasDraft` 附近）：

```javascript
yesterdayPlans: [],
yesterdayPlanDate: ''
```

找到 [pages/index/index.js:5-25](pages/index/index.js#L5-L25) 的 data 定义，在 `hasDraft: false,` 之后插入：

```javascript
yesterdayPlans: [],
yesterdayPlanDate: '',
```

- [ ] **Step 4: 验证**

准备条件：确保有一条已提交的复盘记录，且 `tomorrowPlan` 包含 If-Then 格式的计划（如 `1. 如果 XX 回调到 10.2，就买入 2000 股`）。

1. 打开首页
2. 预期：市场卡片上方出现昨日计划追踪卡片，显示解析出的计划条目
3. 点击「已触发」→ 对应方向的交易记录出现在表单中，`matchPlan` 自动勾选
4. 点击「未触发」→ 条目出现在未执行计划区
5. 全部处理完后卡片消失

- [ ] **Step 5: Commit**

```bash
git add pages/index/index.wxml pages/index/index.wxss pages/index/index.js
git commit -m "feat: add yesterday plan recall card UI"
```

---

### Task 5: 教练记忆 — 解析 pendingQuestions

**Files:**
- Modify: `pages/coach/coach.js`（新增 parsePendingQuestions，在 saveReview 时写入）

- [ ] **Step 1: 新增 parsePendingQuestions 方法**

在 [pages/coach/coach.js](pages/coach/coach.js) 的 `generateTitle()` 方法之后（第 269 行前）插入：

```javascript
parsePendingQuestions(aiReply) {
  try {
    // 匹配 "### 必须回答的问题" 至下一个 "###" 或文本结尾
    const sectionMatch = aiReply.match(/###\s*必须回答的问题\s*\n([\s\S]*?)(?=\n###|$)/)
    if (!sectionMatch) return []

    const section = sectionMatch[1]
    const lines = section.split('\n').filter(l => l.trim())

    const questions = []
    lines.forEach(line => {
      // 匹配编号列表项：1. 2. - ① 等
      const match = line.match(/^[\s]*(?:\d+[.、)\s]+|[-•]\s*)(.+)/)
      if (match && match[1].trim().length > 5) {
        questions.push({
          id: 'q' + Date.now() + '_' + questions.length,
          question: match[1].trim(),
          askedAt: Date.now(),
          answered: false
        })
      }
    })

    return questions.slice(0, 5) // 最多 5 个
  } catch (e) {
    return []
  }
},
```

- [ ] **Step 2: 在保存 review 时写入 pendingQuestions**

找到 `getCoachReply` 中 `saveReview` 的调用处（约第 195-207 行），在保存前增加解析逻辑。当前代码：

```javascript
if (this.data.formData) {
  const review = {
    id: String(Date.now()),
    date: getTodayDate(),
    timestamp: Date.now(),
    formData: this.data.formData,
    aiReply,
    isDraft: false,
    conversationId: this.data.conversationId
  }
  storage.saveReview(review)
  storage.clearDraft()
}
```

改为：

```javascript
if (this.data.formData) {
  const pendingQuestions = this.parsePendingQuestions(aiReply)
  const review = {
    id: String(Date.now()),
    date: getTodayDate(),
    timestamp: Date.now(),
    formData: this.data.formData,
    aiReply,
    isDraft: false,
    conversationId: this.data.conversationId,
    pendingQuestions  // 新增
  }
  storage.saveReview(review)
  storage.clearDraft()
}
```

- [ ] **Step 3: 编译验证**

在微信开发者工具中编译确认无报错。提交一条复盘，在 Console 中打印 `storage.getReviews()` 检查新保存的 review 是否包含 `pendingQuestions` 字段。

- [ ] **Step 4: Commit**

```bash
git add pages/coach/coach.js
git commit -m "feat: parse and store pending questions from AI reply"
```

---

### Task 6: 教练记忆 — 追问注入 system prompt

**Files:**
- Modify: `pages/coach/coach.js`（修改 getHistoricalContext 返回格式）

- [ ] **Step 1: 新增 getPendingInjection 方法**

在 `parsePendingQuestions` 方法之后插入：

```javascript
getPendingInjection() {
  const reviews = storage.getReviews()
    .filter(r => !r.isDraft && r.pendingQuestions)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5)  // 最近 5 篇

  // 收集所有未回答的问题，去重
  const seen = new Set()
  const pending = []
  reviews.forEach(r => {
    (r.pendingQuestions || []).forEach(q => {
      if (!q.answered && !seen.has(q.question)) {
        seen.add(q.question)
        pending.push(q)
      }
    })
  })

  if (pending.length === 0) return ''

  const lines = pending.map((q, i) => `${i + 1}. ${q.question}`)
  return '\n\n---\n【上次追问（用户尚未回答）】\n' + lines.join('\n') +
    '\n请基于用户今天的操作，追问这些未回答的问题。如果用户今天的操作恰好触及了这些问题，指出关联。'
},
```

- [ ] **Step 2: 在 getHistoricalContext 末尾追加追问**

找到 `getHistoricalContext()` 方法（第 224-247 行），在 `return` 之前追加。当前返回行（约第 231 行）：

```javascript
if (reviews.length === 0) return ''
```

和最后的 `return` 语句（约第 246 行）：

```javascript
return reviews.map((r, i) => { ... }).join('\n')
```

修改 `return` 语句，在末尾拼接追问注入：

```javascript
getHistoricalContext(currentFormData) {
  const reviews = storage.getReviews()
    .filter(r => !r.isDraft)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5)

  if (reviews.length === 0) return ''

  const historyLines = reviews.map((r, i) => {
    const d = r.formData
    const buyStocks = d.buyList.filter(b => b.stock).map(b => `${b.stock}(${b.matchPlan ? '计划内' : '计划外'})`)
    const sellStocks = d.sellList.filter(s => s.stock).map(s => `${s.stock}(${s.matchPlan ? '计划内' : '计划外'})`)
    const missed = d.missedList.filter(m => m.what).map(m => m.what)

    const parts = [`${r.date}：`]
    if (d.market) parts.push(`大盘：${d.market.substring(0, 50)}`)
    if (buyStocks.length > 0) parts.push(`买入：${buyStocks.join('、')}`)
    if (sellStocks.length > 0) parts.push(`卖出：${sellStocks.join('、')}`)
    if (missed.length > 0) parts.push(`未执行：${missed.join('、')}`)
    if (d.tomorrow) parts.push(`计划：${d.tomorrow.substring(0, 60)}`)

    return parts.join(' | ')
  })

  const pendingInjection = this.getPendingInjection()
  return historyLines.join('\n') + pendingInjection
},
```

- [ ] **Step 3: 验证**

1. 创建一条有 AI 回复的复盘记录（有"必须回答的问题"段落）
2. 通过 Storage 面板手动确认 `pendingQuestions` 已存储，且包含 `answered: false` 的问题
3. 提交一条新复盘
4. 在网络请求中查看 `callAI` 的参数，确认 system prompt 尾部追加了追问信息

- [ ] **Step 4: Commit**

```bash
git add pages/coach/coach.js
git commit -m "feat: inject pending questions into next coach prompt"
```

---

### Task 7: 历史详情页展示 pendingQuestions

**Files:**
- Modify: `pages/history/history.js`（新增标记已回答方法）
- Modify: `pages/history/history.wxml`（新增问题列表）

- [ ] **Step 1: 在 history.js 新增 markQuestionAnswered**

在 [pages/history/history.js](pages/history/history.js) 的 `onDelete()` 方法之后（第 58 行后）插入：

```javascript
markQuestionAnswered(e) {
  const questionId = e.currentTarget.dataset.qid
  const review = this.data.review
  if (!review.pendingQuestions) return

  const updatedQuestions = review.pendingQuestions.map(q =>
    q.id === questionId ? { ...q, answered: true } : q
  )
  const updatedReview = { ...review, pendingQuestions: updatedQuestions }
  storage.saveReview(updatedReview)
  this.setData({ review: updatedReview })

  wx.showToast({ title: '已标记', icon: 'success', duration: 1000 })
},
```

- [ ] **Step 2: 在 history.wxml 中添加问题列表**

找到 AI 分析区 `ai-section`（[pages/history/history.wxml](pages/history/history.wxml) 第 76 行），在其上方插入：

```xml
<!-- 未回答的追问 -->
<view wx:if="{{review.pendingQuestions && review.pendingQuestions.length > 0}}" class="questions-section">
  <view class="section-title">教练的追问</view>
  <view
    wx:for="{{review.pendingQuestions}}"
    wx:key="id"
    class="question-item {{item.answered ? 'answered' : ''}}"
  >
    <view class="question-content">
      <text class="question-num">Q{{index + 1}}</text>
      <text class="question-text">{{item.question}}</text>
    </view>
    <view wx:if="{{!item.answered}}" class="question-action">
      <text
        class="mark-btn"
        data-qid="{{item.id}}"
        bindtap="markQuestionAnswered"
      >标记已答</text>
    </view>
    <text wx:else class="answered-tag">已回答</text>
  </view>
</view>
```

- [ ] **Step 3: 在 history.wxss 中添加问题区样式**

在 [pages/history/history.wxss](pages/history/history.wxss) 的 `.ai-section` 样式之前插入：

```css
/* 教练追问区 */
.questions-section {
  background: #fff;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 24rpx;
  border-left: 4rpx solid #e4393c;
}

.question-item {
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.question-item:last-child {
  border-bottom: none;
}

.question-item.answered {
  opacity: 0.5;
}

.question-content {
  flex: 1;
  display: flex;
  gap: 12rpx;
}

.question-num {
  font-size: 26rpx;
  font-weight: 600;
  color: #e4393c;
}

.question-text {
  font-size: 26rpx;
  color: #333;
  line-height: 1.6;
  flex: 1;
}

.question-action {
  flex-shrink: 0;
  margin-left: 16rpx;
}

.mark-btn {
  font-size: 24rpx;
  color: #e4393c;
  padding: 8rpx 16rpx;
  background: #fef0f0;
  border-radius: 6rpx;
}

.answered-tag {
  font-size: 22rpx;
  color: #999;
  flex-shrink: 0;
  margin-left: 16rpx;
}
```

- [ ] **Step 4: 验证**

1. 打开一条有 `pendingQuestions` 的复盘详情页
2. 预期：AI 分析上方出现"教练的追问"区域，列出未回答的问题
3. 点击「标记已答」→ 状态变为"已回答"，淡出显示
4. 退出后重新进入 → 已回答状态持久化

- [ ] **Step 5: Commit**

```bash
git add pages/history/history.js pages/history/history.wxml pages/history/history.wxss
git commit -m "feat: display pending coach questions in history detail"
```

---

### Task 8: 行为标签 — prompt 追加 + 解析

**Files:**
- Modify: `pages/coach/coach.js`（system prompt 追加 TAGS 指令 + extractTags）

- [ ] **Step 1: 在 system prompt 末尾追加标签输出指令**

在 coach.js 的 `getCoachReply()` 方法中，找到 system prompt 变量（约第 115-158 行），在其末尾追加：

找到 prompt 最后一段（"不要堆砌概念"之后），在关闭反引号之前追加：

```
- 不要堆砌概念，每个概念必须绑定用户的具体操作
- 如果用户的操作和上次一样但市场不同，重点分析"市场变了但你的方法没变"这个矛盾
- 如果缺少历史数据，专注于今天的操作即可，不要编造对比

## 输出标签
在回复最末尾加一行 JSON（不要 markdown 代码块，纯文本）：
__TAGS__:["标签1","标签2","标签3"]
标签从以下候选池选择，最多 3 个：
追涨、杀跌、止损拖延、止盈过早、过度交易、犹豫不决、锚定效应、
损失厌恶、过度自信、确认偏误、近因效应、羊群效应、计划缺失、
逆势操作、仓位失控、盘中冲动、报复交易、踏空焦虑
如果找不到匹配的，可以自定义一个简短的（不超过 6 个字）。`
```

- [ ] **Step 2: 新增 extractTags 方法**

在 `parsePendingQuestions()` 之后插入：

```javascript
extractTags(aiReply) {
  try {
    const match = aiReply.match(/__TAGS__\s*:\s*\[(.*?)\]/)
    if (!match) return []

    const tags = JSON.parse(`[${match[1]}]`)
    // 过滤：只保留字符串，最多 3 个
    return tags.filter(t => typeof t === 'string' && t.length > 0 && t.length <= 6).slice(0, 3)
  } catch (e) {
    return []
  }
},
```

- [ ] **Step 3: 在保存 review 时写入 tags + 清理显示文本**

找到之前修改的 `saveReview` 区域（约第 195-210 行），在保存前提取标签并清理显示文本：

```javascript
if (this.data.formData) {
  const pendingQuestions = this.parsePendingQuestions(aiReply)
  const tags = this.extractTags(aiReply)

  // 从显示文本中移除 __TAGS__ 行
  const cleanReply = aiReply.replace(/\n?__TAGS__\s*:.*$/, '')

  // 更新页面显示的 AI 回复（移除标签行）
  this.setData({ aiReply: cleanReply })

  const review = {
    id: String(Date.now()),
    date: getTodayDate(),
    timestamp: Date.now(),
    formData: this.data.formData,
    aiReply: cleanReply,  // 使用清理后的文本
    isDraft: false,
    conversationId: this.data.conversationId,
    pendingQuestions,
    tags  // 新增
  }
  storage.saveReview(review)
  storage.clearDraft()
}
```

同时更新 conversation 中 messages 数组里最后一条 AI 消息的 content：

在 `saveReview` 前，找到更新 conversation 的代码（约第 190-194 行），确保 conversation 中的 AI 回复也是清理后的：

```javascript
// 这条代码已经存在，但需要确认 aiReply 是清理后的
const updatedConversation = {
  ...storage.getConversationById(this.data.conversationId),
  messages: updatedMessages  // 注意：updatedMessages 是在 cleanReply 之前构建的
}
```

修改逻辑，先清理再构建 messages。找到 AI reply 返回后的代码块（第 171-195 行），重构为：

```javascript
try {
  const rawReply = await callAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ], { temperature: 0.8 })

  // 提取标签
  const tags = this.extractTags(rawReply)
  // 清理显示文本
  const cleanReply = rawReply.replace(/\n?__TAGS__\s*:.*$/, '')

  const newMessage = {
    role: 'ai',
    content: cleanReply,
    time: Date.now()
  }

  const updatedMessages = [...this.data.messages, newMessage]

  this.setData({
    aiReply: cleanReply,
    loading: false,
    messages: updatedMessages
  })

  const updatedConversation = {
    ...storage.getConversationById(this.data.conversationId),
    messages: updatedMessages
  }
  storage.saveConversation(updatedConversation)

  if (this.data.formData) {
    const pendingQuestions = this.parsePendingQuestions(rawReply)
    const review = {
      id: String(Date.now()),
      date: getTodayDate(),
      timestamp: Date.now(),
      formData: this.data.formData,
      aiReply: cleanReply,
      isDraft: false,
      conversationId: this.data.conversationId,
      pendingQuestions,
      tags
    }
    storage.saveReview(review)
    storage.clearDraft()
  }
} catch (err) {
```

- [ ] **Step 4: 验证**

1. 提交一条新的复盘
2. 等待 AI 回复后，检查显示文本末尾没有 `__TAGS__:["..."]` 行
3. 在 Storage 面板查看保存的 review 对象，确认有 `tags` 数组字段
4. 模拟：如果 AI 没输出 `__TAGS__`，确认 review.tags 为空数组（不报错）

- [ ] **Step 5: Commit**

```bash
git add pages/coach/coach.js
git commit -m "feat: extract behavior tags from AI reply and store in review"
```

---

### Task 9: 周期复盘 — 标签频率展示

**Files:**
- Modify: `pages/period/period.js`（新增 computeTagStats）
- Modify: `pages/period/period.wxml`（新增标签表格）

- [ ] **Step 1: 新增 computeTagStats 方法**

在 [pages/period/period.js](pages/period/period.js) 的 `getSummary()` 之后（第 130 行后）插入：

```javascript
computeTagStats(dailyReviews) {
  const tagCount = {}
  dailyReviews.forEach(r => {
    (r.tags || []).forEach(tag => {
      tagCount[tag] = (tagCount[tag] || 0) + 1
    })
  })

  // 转换为排序数组
  const sorted = Object.entries(tagCount)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)

  return sorted
},
```

- [ ] **Step 2: 在 loadPeriodReview 中调用标签统计**

找到 `loadPeriodReview(id)` 方法（第 21-36 行），在设置 `dailyReviews` 后同时计算 tagStats：

```javascript
loadPeriodReview(id) {
  const periodReviews = storage.getPeriodReviews()
  const review = periodReviews.find(r => r.id === id)
  this.setData({ periodReview: review })

  if (review && review.reviewIds) {
    const dailyReviews = review.reviewIds
      .map(id => storage.getReviewById(id))
      .filter(Boolean)
      .map(r => ({
        ...r,
        summary: this.getSummary(r)
      }))
    const tagStats = this.computeTagStats(dailyReviews)  // 新增
    this.setData({
      dailyReviews,
      tagStats  // 新增
    })
  }
},
```

- [ ] **Step 3: 在 data 中新增 tagStats 字段**

找到 `Page({ data: { ... } })`（第 5-12 行），在 data 对象中添加：

```javascript
tagStats: []
```

- [ ] **Step 4: 在 period.wxml 中添加标签频率表**

找到 period 详情页中"包含的每日复盘"区域之后、"AI分析结果"之前（[pages/period/period.wxml](pages/period/period.wxml) 第 56-77 行），插入：

```xml
<!-- 行为标签分布 -->
<view wx:if="{{tagStats.length > 0}}" class="tags-section">
  <view class="section-label">行为标签分布</view>
  <view class="tag-list">
    <view wx:for="{{tagStats}}" wx:key="tag" class="tag-row">
      <text class="tag-name">{{item.tag}}</text>
      <text class="tag-count">{{item.count}}次</text>
      <view class="tag-bar">
        <view class="tag-bar-fill" style="width: {{item.count / tagStats[0].count * 100}}%"></view>
      </view>
    </view>
  </view>
</view>
```

- [ ] **Step 5: 在 period.wxss 中添加样式**

在 [pages/period/period.wxss](pages/period/period.wxss) 的 `.analysis-section` 样式之前插入：

```css
/* 行为标签分布 */
.tags-section {
  background: #fff;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 24rpx;
}

.tag-list {
  margin-top: 16rpx;
}

.tag-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}

.tag-row:last-child {
  border-bottom: none;
}

.tag-name {
  font-size: 26rpx;
  font-weight: 600;
  color: #e4393c;
  min-width: 120rpx;
}

.tag-count {
  font-size: 24rpx;
  color: #999;
  min-width: 60rpx;
}

.tag-bar {
  flex: 1;
  height: 12rpx;
  background: #f5f5f5;
  border-radius: 6rpx;
  overflow: hidden;
}

.tag-bar-fill {
  height: 100%;
  background: #e4393c;
  border-radius: 6rpx;
}
```

- [ ] **Step 6: 验证**

1. 创建 3-4 条带 tags 的 review（或手动在 Storage 面板中给 review 添加 tags 数组）
2. 生成一条周期复盘
3. 预期：周期复盘详情页中，每日复盘列表和 AI 分析之间出现"行为标签分布"区域，显示标签频率柱状表

- [ ] **Step 7: Commit**

```bash
git add pages/period/period.js pages/period/period.wxml pages/period/period.wxss
git commit -m "feat: display behavior tag frequency chart in period review"
```

---

### Task 10: 周期复盘 — 计划执行力趋势

**Files:**
- Modify: `pages/period/period.js`（新增 computeTrendData）
- Modify: `pages/period/period.wxml`（新增趋势表）
- Modify: `pages/period/period.wxss`（新增趋势样式）

- [ ] **Step 1: 新增 computeTrendData 方法**

在 `computeTagStats()` 之后插入：

```javascript
computeTrendData(dailyReviews) {
  return dailyReviews.map(r => {
    const buyCount = r.formData.buyList.filter(b => b.stock).length
    const sellCount = r.formData.sellList.filter(s => s.stock).length
    const total = buyCount + sellCount

    if (total === 0) {
      return { date: r.date, ratio: null, total: 0, planned: 0 }
    }

    const planned = r.formData.buyList.filter(b => b.stock && b.matchPlan).length +
      r.formData.sellList.filter(s => s.stock && s.matchPlan).length

    return {
      date: r.date,
      ratio: Math.round((planned / total) * 100),
      total,
      planned
    }
  })
},
```

- [ ] **Step 2: 在 loadPeriodReview 中调用趋势计算**

修改 `loadPeriodReview(id)` 方法，在 `setData` 时同时设置 `trendData`：

```javascript
const tagStats = this.computeTagStats(dailyReviews)
const trendData = this.computeTrendData(dailyReviews)  // 新增
this.setData({
  dailyReviews,
  tagStats,
  trendData  // 新增
})
```

同时在 `data` 中新增字段 `trendData: []`。

- [ ] **Step 3: 在 period.wxml 中添加趋势表**

在标签分布区域之后、AI分析之前插入：

```xml
<!-- 计划执行力趋势 -->
<view wx:if="{{trendData.length > 0}}" class="trend-section">
  <view class="section-label">计划执行力趋势</view>
  <view class="trend-list">
    <view wx:for="{{trendData}}" wx:key="date" class="trend-row {{item.ratio === null ? 'no-trade' : ''}}">
      <text class="trend-date">{{item.date}}</text>
      <view wx:if="{{item.ratio === null}}" class="trend-none">—</view>
      <view wx:else class="trend-data">
        <text wx:if="{{item.ratio < 50}}" class="trend-warn">⚠️</text>
        <view class="trend-bar-container">
          <view class="trend-bar-fill" style="width: {{item.ratio}}%"></view>
        </view>
        <text class="trend-pct">{{item.ratio}}%（{{item.planned}}/{{item.total}}）</text>
      </view>
    </view>
  </view>
  <!-- 汇总统计 -->
  <view wx:if="{{trendStats}}" class="trend-summary">
    <text>均值 {{trendStats.avg}}%</text>
    <text>最低 {{trendStats.min}}%（{{trendStats.minDate}}）</text>
  </view>
</view>
```

- [ ] **Step 4: 新增 trendStats 计算**

在 `computeTrendData` 之后插入：

```javascript
computeTrendStats(trendData) {
  const validDays = trendData.filter(d => d.ratio !== null)
  if (validDays.length === 0) return null

  const sum = validDays.reduce((s, d) => s + d.ratio, 0)
  const avg = Math.round(sum / validDays.length)
  let min = validDays[0]
  validDays.forEach(d => {
    if (d.ratio < min.ratio) min = d
  })

  return { avg, min: min.ratio, minDate: min.date }
},
```

在 `loadPeriodReview` 中调用：

```javascript
const trendStats = this.computeTrendStats(trendData)
this.setData({
  dailyReviews,
  tagStats,
  trendData,
  trendStats  // 新增
})
```

在 `data` 中新增 `trendStats: null` 和 `trendData: []`。

- [ ] **Step 5: 在 period.wxss 中添加趋势样式**

插入到标签样式之后：

```css
/* 计划执行力趋势 */
.trend-section {
  background: #fff;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 24rpx;
}

.trend-list {
  margin-top: 16rpx;
}

.trend-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 10rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}

.trend-row:last-child {
  border-bottom: none;
}

.trend-row.no-trade {
  opacity: 0.4;
}

.trend-date {
  font-size: 24rpx;
  color: #666;
  min-width: 90rpx;
}

.trend-none {
  font-size: 24rpx;
  color: #ccc;
}

.trend-data {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.trend-warn {
  font-size: 22rpx;
}

.trend-bar-container {
  flex: 1;
  height: 16rpx;
  background: #f5f5f5;
  border-radius: 8rpx;
  overflow: hidden;
}

.trend-bar-fill {
  height: 100%;
  background: #e4393c;
  border-radius: 8rpx;
  min-width: 4rpx;
}

.trend-pct {
  font-size: 22rpx;
  color: #666;
  min-width: 130rpx;
  text-align: right;
}

.trend-summary {
  display: flex;
  justify-content: space-between;
  padding-top: 16rpx;
  margin-top: 16rpx;
  border-top: 1rpx solid #e8e8e8;
  font-size: 24rpx;
  color: #999;
}
```

- [ ] **Step 6: 验证**

1. 打开一条已有的周期复盘（包含多篇日常复盘）
2. 预期：标签分布下方出现"计划执行力趋势"区域，显示逐日柱状图 + 百分比 + 具体笔数
3. 确认无交易日显示 "—"
4. 确认低于 50% 的日显示 ⚠️
5. 确认底部汇总显示均值和最低日

- [ ] **Step 7: Commit**

```bash
git add pages/period/period.js pages/period/period.wxml pages/period/period.wxss
git commit -m "feat: add plan adherence trend table to period review"
```

---

## 验证清单

所有 Task 完成后，在微信开发者工具中完整走一遍流程：

1. [ ] 打开首页 → 大盘数据自动预填
2. [ ] 昨日 If-Then 计划卡片显示（如有） → 点击已触发/未触发 → 表单正确更新
3. [ ] 填写并提交新的复盘 → coach 页面加载 → AI 回复不包含 `__TAGS__` 行
4. [ ] Storage 面板确认新 review 包含 `pendingQuestions` 和 `tags` 字段
5. [ ] 进入历史详情 → "教练的追问"区域显示 → 点击标记已答
6. [ ] 再次提交复盘 → 网络请求中确认追问信息注入到 prompt
7. [ ] 生成周复盘 → 标签频率表 + 趋势图正确显示
8. [ ] 旧记录（无新字段）所有页面不报错
