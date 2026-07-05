const { computeAllStats, getRecentReviews } = require('../../utils/stats')
const { getMarketSnapshot } = require('../../utils/market')
const { getStorageUsage } = require('../../utils/export')

Page({
  data: {
    stats: null,
    marketData: null,
    storageUsage: null,
    weeklyBarData: [],
    adherenceTrendData: [],
    monthlyTradeData: [],
    aiInsights: [],
    habitScores: null,
    loading: true,
    activeTab: 'overview' // 'overview' | 'behavior' | 'market'
  },

  onLoad() {
    this.loadAllData()
  },

  onShow() {
    // 每次显示时刷新数据
    this.loadAllData()
  },

  async loadAllData() {
    this.setData({ loading: true })

    try {
      const [stats, marketData] = await Promise.all([
        this.computeStats(),
        getMarketSnapshot().catch(() => null)
      ])

      const storageUsage = getStorageUsage()

      const aiInsights = this.generateInsights(stats)
      const habitScores = stats ? stats.habitScores : null

      this.setData({
        stats,
        marketData,
        storageUsage,
        aiInsights,
        habitScores,
        loading: false
      })

      this.buildChartData(stats)
    } catch (e) {
      console.error('加载仪表盘数据失败:', e)
      this.setData({ loading: false })
    }
  },

  computeStats() {
    return new Promise((resolve) => {
      const stats = computeAllStats()
      resolve(stats)
    })
  },

  generateInsights(stats) {
    if (!stats) return []
    const insights = []

    // 执行率洞察
    if (stats.planAdherenceRate >= 70) {
      insights.push({ icon: '✅', text: '计划执行率' + stats.planAdherenceRate + '%，保持良好！', type: 'positive' })
    } else if (stats.planAdherenceRate >= 40) {
      insights.push({ icon: '📊', text: '执行率' + stats.planAdherenceRate + '%，还有提升空间', type: 'neutral' })
    } else if (stats.totalTrades > 0) {
      insights.push({ icon: '⚠️', text: '执行率仅' + stats.planAdherenceRate + '%，需要加强计划纪律', type: 'warning' })
    }

    // 连续复盘洞察
    if (stats.streakDays >= 7) {
      insights.push({ icon: '🔥', text: '连续复盘' + stats.streakDays + '天，习惯已形成！', type: 'positive' })
    } else if (stats.streakDays >= 3) {
      insights.push({ icon: '📅', text: '连续' + stats.streakDays + '天，再坚持4天就一周了', type: 'neutral' })
    }

    // 标签洞察
    const tags = Object.entries(stats.tagDistribution || {})
    if (tags.length > 0) {
      const topTag = tags[0]
      insights.push({ icon: '🏷️', text: '最常见行为标签：' + topTag[0] + '（' + topTag[1] + '次）', type: 'info' })
    }

    // 交易频率洞察
    const avgTrades = parseFloat(stats.avgTradesPerDay) || 0
    if (avgTrades > 4) {
      insights.push({ icon: '⚡', text: '日均交易' + avgTrades + '笔，注意过度交易风险', type: 'warning' })
    }

    // 未执行计划洞察
    if (stats.missedCount > 5) {
      insights.push({ icon: '❌', text: '累计' + stats.missedCount + '条未执行计划，深挖原因', type: 'warning' })
    }

    return insights.slice(0, 5)
  },

  buildChartData(stats) {
    if (!stats) return

    // 周活跃度柱状图
    const weeklyBarData = stats.weeklyActivity.map(w => ({
      label: w.label,
      value: w.count,
      percent: Math.min(100, (w.count / 7) * 100),
      color: w.count >= 5 ? '#5BA870' : w.count >= 3 ? '#5B8FD4' : '#D4574E'
    }))

    // 执行率趋势
    const adherenceTrendData = stats.adherenceTrend.map(t => ({
      label: t.date,
      value: t.adherence >= 0 ? t.adherence + '%' : '-',
      height: t.adherence >= 0 ? Math.max(8, t.adherence) : 4,
      color: t.adherence >= 70 ? '#5BA870' : t.adherence >= 40 ? '#E8A84C' : t.adherence >= 0 ? '#D4574E' : '#F3EFEC'
    }))

    // 月度交易趋势
    const maxTrades = Math.max(1, ...stats.monthlyTrend.map(m => m.trades))
    const monthlyTradeData = stats.monthlyTrend.map(m => ({
      label: m.label.substring(5),
      value: m.trades,
      percent: (m.trades / maxTrades) * 100,
      color: '#5B8FD4'
    }))

    this.setData({
      weeklyBarData,
      adherenceTrendData,
      monthlyTradeData
    })
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
  },

  onTagTap(e) {
    const name = e.detail.name
    wx.showToast({ title: `标签: ${name}`, icon: 'none' })
  },

  goToReview() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  goToPeriod() {
    wx.navigateTo({ url: '/pages/period/period' })
  },

  onPullDownRefresh() {
    this.loadAllData().then(() => {
      wx.stopPullDownRefresh()
    })
  }
})
