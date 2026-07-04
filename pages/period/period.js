const storage = require('../../utils/storage')
const { callAI } = require('../../utils/api')
const { formatDate } = require('../../utils/date')

Page({
  data: {
    periodReview: null,
    dailyReviews: [],
    periodReviews: [],
    tagStats: [],
    trendData: [],
    trendStats: null,
    loading: false
  },

  onLoad(options) {
    if (options.id) {
      this.loadPeriodReview(options.id)
    } else {
      this.loadAllPeriodReviews()
    }
  },

  loadPeriodReview(id) {
    const periodReviews = storage.getPeriodReviews()
    const review = periodReviews.find(r => r.id === id)
    this.setData({ periodReview: review })

    if (review && review.reviewIds) {
      const allReviews = storage.getReviews()
      const reviewMap = new Map(allReviews.map(r => [r.id, r]))
      const dailyReviews = review.reviewIds
        .map(id => reviewMap.get(id))
        .filter(Boolean)
        .map(r => ({
          ...r,
          summary: this.getSummary(r)
        }))
      const tagStats = this.computeTagStats(dailyReviews)
      const trendData = this.computeTrendData(dailyReviews)
      const trendStats = this.computeTrendStats(trendData)
      this.setData({
        dailyReviews,
        tagStats,
        trendData,
        trendStats
      })
    }
  },

  loadAllPeriodReviews() {
    const periodReviews = storage.getPeriodReviews()
    this.setData({
      periodReviews: periodReviews.sort((a, b) => b.timestamp - a.timestamp)
    })
  },

  generateWeekReview() {
    this.doGenerateReview('week', 7)
  },

  generateMonthReview() {
    this.doGenerateReview('month', 30)
  },

  doGenerateReview(type, days) {
    this.setData({ loading: true })

    const reviews = storage.getReviews()
    const now = new Date()
    const daysAgo = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

    const filteredReviews = reviews.filter(r => {
      const reviewDate = new Date(r.timestamp)
      return reviewDate >= daysAgo && !r.isDraft
    })

    if (filteredReviews.length === 0) {
      this.setData({ loading: false })
      wx.showToast({
        title: `过去${days}天无复盘记录`,
        icon: 'none'
      })
      return
    }

    const summary = filteredReviews.map(r => `【${r.date}】${this.getSummary(r)}`).join('\n')
    this.generatePeriodAnalysis(type, summary, filteredReviews)
  },

  async generatePeriodAnalysis(type, summary, reviews) {
    const typeLabel = type === 'week' ? '一周' : '一个月'
    const systemPrompt = `你是一个股票交易复盘分析师。请分析用户过去${typeLabel}的交易复盘记录，总结其交易模式、优缺点和改进建议。注意：
1. 结合风险控制、趋势判断、节奏把握、心态管理等交易心法框架
2. 重点关注用户的知行合一情况
3. 发现可能存在的行为模式问题和改进方向
4. 给出具体的建议，而非泛泛而谈`

    try {
      const aiAnalysis = await callAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: summary }
      ])

      const periodReview = {
        id: `${type}_${Date.now()}`,
        type,
        startDate: formatDate(reviews[reviews.length - 1].timestamp),
        endDate: formatDate(reviews[0].timestamp),
        reviewIds: reviews.map(r => r.id),
        aiAnalysis,
        timestamp: Date.now()
      }

      storage.savePeriodReview(periodReview)
      this.setData({ periodReview })

      this.loadAllPeriodReviews()

      wx.showToast({ title: '生成成功', icon: 'success' })
    } catch (err) {
      console.error('API调用失败:', err)
      wx.showToast({ title: err.message, icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  viewDailyReview(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/history/history?id=${id}`
    })
  },

  getSummary(review) {
    const parts = []
    if (review.formData.market) parts.push('大盘')
    if (review.formData.theme) parts.push('题材')
    if (review.formData.buyList.some(b => b.stock)) parts.push('买入')
    if (review.formData.sellList.some(s => s.stock)) parts.push('卖出')
    return parts.join(' | ') || '空复盘'
  },

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

  computeTagStats(dailyReviews) {
    const tagCount = {}
    dailyReviews.forEach(r => {
      (r.tags || []).forEach(tag => {
        tagCount[tag] = (tagCount[tag] || 0) + 1
      })
    })

    const sorted = Object.entries(tagCount)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)

    return sorted
  },

  formatPeriodDate(timestamp) {
    return formatDate(timestamp)
  },

  onBack() {
    wx.navigateBack()
  }
})
