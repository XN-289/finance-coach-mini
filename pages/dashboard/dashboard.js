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

      this.setData({
        stats,
        marketData,
        storageUsage,
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
