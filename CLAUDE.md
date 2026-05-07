# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述
股票交易复盘微信小程序，用户录入每日交易（买入/卖出/未执行计划），AI教练（严正）进行心法分析、行为模式诊断和纵向对比，支持周/月周期复盘。

## 技术栈
- 微信小程序原生框架（无第三方UI库）
- AI：DeepSeek Chat API，通过 `wx.request` 直连调用（`utils/api.js`）
- 数据存储：`wx.setStorageSync` / `wx.getStorageSync`（本地 Storage，上限 5MB）
- 行情数据：东方财富公开API（`push2.eastmoney.com`）

## 开发环境
- 无构建系统、无包管理、无测试套件 — 项目在微信开发者工具中直接打开和编译
- 修改代码后在 IDE 中刷新即可看到效果，无需编译步骤
- AppID: `wxd75aa4f8efb2aeb8`，基础库版本 3.15.2

## 项目结构
```
├── app.js / app.json / app.wxss    # 入口（app.js 为空壳 App({})）
├── utils/
│   ├── storage.js                  # 本地存储 CRUD（reviews/periodReviews/conversations/draft）
│   ├── api.js                      # DeepSeek API 直连封装
│   ├── config.js                   # API Key、URL、Model 配置
│   ├── market.js                   # 东方财富行情拉取（上证/深证/涨停统计）
│   └── date.js                     # 日期格式化工具
├── pages/
│   ├── index/index                 # 首页：交易表单输入 + 草稿 + 历史抽屉
│   ├── coach/coach                  # AI教练：展示分析结果（对话流）
│   ├── history/history              # 复盘详情查看/编辑/删除
│   ├── period/period                # 周期复盘（周/月），AI总结
│   └── conversation/conversation    # 对话历史查看/归档
├── cloudfunction/getCoaching/      # 云函数（已废弃，保留备用）
└── .claude/                        # Claude 配置
```

## 核心数据流

### 用户提交复盘（正常流程）
1. `pages/index` 用户填写表单 → `autoSaveDraft()` 持续保存草稿
2. 点击提交 → `formatReviewXML()` 将表单序列化为 XML → 导航到 `pages/coach`
3. `pages/coach` 接收 review XML + formData JSON → 调用 `callAI()` 发送 system prompt + 用户消息
4. AI 返回后：`coach.js` 同时保存 `review`（含 AI 回复）和 `conversation`，清除草稿

### 编辑已有复盘
1. 从历史抽屉点击编辑 → 设置 `editMode: true, editId` → 直接修改表单 → 提交时更新已有 review（不生成新 AI 分析）

### 页面间传参
- 导航使用 query string 传参：`?id=xxx`、`?review=...&formData=...`
- 编辑复盘不走导航，通过 `getCurrentPages()` 操作上一页的 setData

## 关键约定

### 表单数据结构
```javascript
formData: {
  market: '',        // 大盘记录
  theme: '',         // 题材与主线
  buyList: [{ stock, reason, matchPlan }],    // matchPlan = 是否符合计划
  sellList: [{ stock, reason, matchPlan }],
  missedList: [{ what, why }],                 // 未执行计划
  tomorrow: '',      // 明日 If-Then 计划
  selfAssessment: '' // 自我评价
}
```

### XML 格式（传给 AI）
- 表单数据序列化为 `<review><marketData/><market/><theme/><actions><buy/><sell/><missed/></actions><selfAssessment/><plan/></review>`
- 使用 `escapeXml()` 转义，防止 XML 注入

### Storage Key
- `reviews`：复盘记录数组
- `periodReviews`：周期复盘数组
- `conversations`：对话数组
- `draft`：当前草稿（单条，非数组）
- `market_snapshot`：上一日行情快照缓存（用于放量/缩量判断）

### AI 角色
- 名称"严正"，风格严肃直击要害
- System prompt 在 `coach.js` 的 `getCoachReply()` 中定义，包含分析框架（行为对比、未执行计划深挖、知行合一审计、心法诊断、市场匹配度）
- 支持纵向对比：自动拉取最近 5 条复盘注入 prompt

## 注意事项
- API Key 硬编码在 `utils/config.js`，直接暴露在客户端，生产环境需后端代理
- `formatReview()`（纯文本）用于 coach 页面向用户展示，`formatReviewXML()`（XML）才是实际发给 AI 的格式
- 市场数据获取失败时静默降级（catch 返回 null），不影响主流程
- 页面没有使用 `wx:for` 绑定数据时注意避免引用问题，addBuy/addSell/addMissed 均使用深拷贝
