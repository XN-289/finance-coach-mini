# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述
**交易教练** — 基于 AI 的股票交易复盘微信小程序。用户每日录入交易记录（买入/卖出/未执行计划），AI 教练"严正"进行行为模式诊断、认知偏差识别和纵向对比分析。支持数据仪表盘、自选股管理、周期复盘、数据导出等高级功能。

## 技术栈

- 微信小程序原生框架（自定义组件、懒加载）
- AI：DeepSeek Chat API，通过 `wx.request` 直连调用
- 行情数据：东方财富公开 API（指数行情、涨跌停统计、板块排行、股票搜索）
- 数据存储：`wx.setStorageSync` / `wx.getStorageSync`（本地 Storage）
- 设计系统：CSS 变量驱动的主题系统，支持亮色/暗色模式

## 开发环境

- 无构建系统、无包管理、无测试套件 — 项目在微信开发者工具中直接打开和编译
- 修改代码后在 IDE 中刷新即可看到效果，无需编译步骤
- AppID: `wxd75aa4f8efb2aeb8`，基础库版本 3.15.2

## 项目结构
```
├── app.js / app.json / app.wxss    # 入口（全局状态、TabBar、设计系统）
├── assets/icons/                    # TabBar 图标资源
├── utils/
│   ├── storage.js                   # 本地存储 CRUD（reviews/periodReviews/conversations/draft）
│   ├── api.js                       # DeepSeek API 直连封装
│   ├── config.js                    # API Key、URL、Model 配置
│   ├── market.js                    # 东方财富行情拉取（指数/涨跌停/板块/个股）
│   ├── date.js                      # 日期格式化工具
│   ├── stats.js                     # 交易统计引擎（胜率/执行率/趋势/标签分布）
│   ├── theme.js                     # 主题管理器（亮色/暗色模式切换）
│   ├── stockSearch.js               # 股票搜索与自选股管理
│   └── export.js                    # 数据导出/导入/备份/清理
├── components/
│   ├── stat-card/                   # 统计指标卡片组件
│   ├── progress-bar/                # 进度条组件
│   ├── tag-cloud/                   # 行为标签云组件
│   └── mini-chart/                  # 迷你图表组件（柱状/趋势/环形）
├── pages/
│   ├── index/index                  # 首页：交易表单输入 + 草稿 + 历史抽屉
│   ├── dashboard/dashboard          # 数据仪表盘：核心指标/图表/市场数据
│   ├── stocks/stocks                # 自选股：搜索/添加/实时行情
│   ├── profile/profile              # 个人中心：设置/数据管理/主题切换
│   ├── coach/coach                  # AI教练：流式输出分析结果
│   ├── history/history              # 复盘详情查看/编辑/删除/分享
│   ├── period/period                # 周期复盘（周/月），AI总结
│   └── conversation/conversation    # 对话历史查看/归档
└── .claude/                         # Claude 配置
```

## 核心数据流

### 用户提交复盘（正常流程）
1. `pages/index` 用户填写表单 → `autoSaveDraft()` 持续保存草稿
2. 点击提交 → `formatReviewXML()` 将表单序列化为 XML → 导航到 `pages/coach`
3. `pages/coach` 接收 review XML + formData JSON → 调用 `callAI()` 发送 system prompt + 用户消息
4. AI 返回后：流式打字机效果展示 → 同时保存 `review` 和 `conversation`，清除草稿

### 数据仪表盘
1. `pages/dashboard` 加载时调用 `computeAllStats()` 从本地 reviews 计算核心指标
2. 使用自定义组件（stat-card/mini-chart/tag-cloud/progress-bar）可视化展示
3. 支持三个 Tab：总览 / 行为分析 / 市场数据

### 自选股管理
1. `pages/stocks` 使用东方财富搜索 API 实时查找股票
2. 自选股数据存储在本地 `watchlist` key
3. 支持批量获取实时行情、一键添加/移除

## 关键约定

### TabBar 导航
- 底部四 Tab：复盘 / 数据 / 自选 / 我的
- TabBar 页面使用系统导航栏，非 TabBar 页面（coach/history/period/conversation）使用自定义导航栏

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
- `market_snapshot`：上一日行情快照缓存
- `watchlist`：自选股列表
- `app_theme`：主题偏好（light/dark）

### AI 角色

- 名称"严正"，风格严肃直击要害
- System prompt 在 `coach.js` 的 `getCoachReply()` 中定义，包含分析框架（行为对比、未执行计划深挖、知行合一审计、心法诊断、市场匹配度）
- 支持纵向对比：自动拉取最近 5 条复盘注入 prompt
- 流式输出：打字机效果展示 AI 回复

### 自定义组件

- `stat-card`：统计指标卡片，支持 icon/value/unit/label/badge/size/trend
- `progress-bar`：进度条，支持 label/percent/color
- `tag-cloud`：标签云，自动根据频次计算大小和颜色等级
- `mini-chart`：迷你图表，支持 bar（柱状）/trend（趋势）/ring（环形）三种类型

### 统计引擎

- `computeAllStats()`：一次性计算所有核心指标（总天数、交易数、执行率、连续天数、标签分布、周活跃度、月度趋势、Top股票、胜率估算等）
- 数据从本地 reviews 实时计算，无需后端

## 注意事项

- API Key 硬编码在 `utils/config.js`，直接暴露在客户端，生产环境需后端代理
- `formatReview()`（纯文本）用于 coach 页面向用户展示，`formatReviewXML()`（XML）才是实际发给 AI 的格式
- 市场数据获取失败时静默降级（catch 返回 null），不影响主流程
- 深色模式通过 `utils/theme.js` 管理，CSS 变量驱动，页面可通过 `getApp().getTheme()` 获取当前主题
- 数据导出使用 JSON 格式，支持剪贴板复制/恢复
- 自选股搜索使用东方财富联想搜索 API，只保留 A 股结果
