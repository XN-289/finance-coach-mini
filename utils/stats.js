/**
 * 交易统计引擎 — 从复盘数据中提取核心交易指标
 * 用于仪表盘、周期复盘、导出等场景
 */

const storage = require('./storage')
const { formatDate } = require('./date')

/**
 * 计算所有核心交易指标
 * @param {Array} reviews - 复盘记录数组（可选，默认从 storage 取）
 * @returns {Object} 完整的统计指标集
 */
function computeAllStats(reviews) {
  if (!reviews) {
    reviews = storage.getReviews().filter(r => !r.isDraft)
  }
  if (reviews.length === 0) return getEmptyStats()

  const sorted = [...reviews].sort((a, b) => a.timestamp - b.timestamp)

  return {
    totalDays: sorted.length,
    totalTrades: countTotalTrades(sorted),
    buyCount: countBuyTrades(sorted),
    sellCount: countSellTrades(sorted),
    missedCount: countMissedPlans(sorted),
    planAdherenceRate: computePlanAdherence(sorted),
    avgTradesPerDay: computeAvgTradesPerDay(sorted),
    streakDays: computeStreak(sorted),
    tagDistribution: computeTagDistribution(sorted),
    weeklyActivity: computeWeeklyActivity(sorted),
    monthlyTrend: computeMonthlyTrend(sorted),
    topStocks: computeTopStocks(sorted),
    winRate: estimateWinRate(sorted),
    recentScore: computeRecentScore(sorted),
    adherenceTrend: computeAdherenceTrend(sorted),
    mostCommonMissed: computeMostCommonMissed(sorted),
    reviewTimeDistribution: computeReviewTimeDistribution(sorted)
  }
}

function getEmptyStats() {
  return {
    totalDays: 0,
    totalTrades: 0,
    buyCount: 0,
    sellCount: 0,
    missedCount: 0,
    planAdherenceRate: 0,
    avgTradesPerDay: 0,
    streakDays: 0,
    tagDistribution: {},
    weeklyActivity: [],
    monthlyTrend: [],
    topStocks: [],
    winRate: 0,
    recentScore: 0,
    adherenceTrend: [],
    mostCommonMissed: [],
    reviewTimeDistribution: {}
  }
}

function countTotalTrades(reviews) {
  return reviews.reduce((sum, r) => {
    const buys = r.formData.buyList.filter(b => b.stock).length
    const sells = r.formData.sellList.filter(s => s.stock).length
    return sum + buys + sells
  }, 0)
}

function countBuyTrades(reviews) {
  return reviews.reduce((sum, r) => {
    return sum + r.formData.buyList.filter(b => b.stock).length
  }, 0)
}

function countSellTrades(reviews) {
  return reviews.reduce((sum, r) => {
    return sum + r.formData.sellList.filter(s => s.stock).length
  }, 0)
}

function countMissedPlans(reviews) {
  return reviews.reduce((sum, r) => {
    return sum + r.formData.missedList.filter(m => m.what).length
  }, 0)
}

/**
 * 计算计划执行率：符合计划的交易 / 总交易数
 */
function computePlanAdherence(reviews) {
  let total = 0
  let planned = 0

  reviews.forEach(r => {
    r.formData.buyList.forEach(b => {
      if (b.stock) {
        total++
        if (b.matchPlan) planned++
      }
    })
    r.formData.sellList.forEach(s => {
      if (s.stock) {
        total++
        if (s.matchPlan) planned++
      }
    })
  })

  return total === 0 ? 0 : Math.round((planned / total) * 100)
}

function computeAvgTradesPerDay(reviews) {
  const total = countTotalTrades(reviews)
  return reviews.length === 0 ? 0 : (total / reviews.length).toFixed(1)
}

/**
 * 计算连续复盘天数（从最近一天往回数）
 */
function computeStreak(reviews) {
  if (reviews.length === 0) return 0

  const dates = [...new Set(reviews.map(r => r.date))].sort().reverse()
  const today = formatDate(Date.now())

  // 从最近的复盘日期开始，检查是否连续
  let streak = 0
  let expectedDate = today

  for (const date of dates) {
    if (date === expectedDate || streak === 0) {
      streak++
      expectedDate = getPreviousDate(expectedDate)
    } else {
      break
    }
  }

  return streak
}

function getPreviousDate(dateStr) {
  const date = new Date(dateStr)
  date.setDate(date.getDate() - 1)
  return formatDate(date.getTime())
}

/**
 * 统计行为标签分布
 */
function computeTagDistribution(reviews) {
  const dist = {}

  reviews.forEach(r => {
    if (r.tags && Array.isArray(r.tags)) {
      r.tags.forEach(tag => {
        dist[tag] = (dist[tag] || 0) + 1
      })
    }
  })

  // 按频次降序排列
  const sorted = Object.entries(dist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  const result = {}
  sorted.forEach(([key, val]) => { result[key] = val })
  return result
}

/**
 * 计算每周复盘活跃度（最近 8 周）
 */
function computeWeeklyActivity(reviews) {
  const now = Date.now()
  const eightWeeksAgo = now - 8 * 7 * 24 * 60 * 60 * 1000
  const recent = reviews.filter(r => r.timestamp >= eightWeeksAgo)

  const weeks = []
  for (let i = 7; i >= 0; i--) {
    const weekStart = now - (i + 1) * 7 * 24 * 60 * 60 * 1000
    const weekEnd = now - i * 7 * 24 * 60 * 60 * 1000
    const count = recent.filter(r => r.timestamp >= weekStart && r.timestamp < weekEnd).length
    weeks.push({
      label: `W${8 - i}`,
      count
    })
  }

  return weeks
}

/**
 * 月度趋势（最近 6 个月的交易数和执行率）
 */
function computeMonthlyTrend(reviews) {
  const months = []

  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const year = d.getFullYear()
    const month = d.getMonth()

    const monthReviews = reviews.filter(r => {
      const rd = new Date(r.timestamp)
      return rd.getFullYear() === year && rd.getMonth() === month
    })

    const trades = countTotalTrades(monthReviews)
    const adherence = computePlanAdherence(monthReviews)

    months.push({
      label: `${year}-${String(month + 1).padStart(2, '0')}`,
      trades,
      adherence,
      days: monthReviews.length
    })
  }

  return months
}

/**
 * 最常交易的股票 Top 10
 */
function computeTopStocks(reviews) {
  const stockMap = {}

  reviews.forEach(r => {
    r.formData.buyList.forEach(b => {
      if (b.stock) {
        if (!stockMap[b.stock]) stockMap[b.stock] = { buy: 0, sell: 0 }
        stockMap[b.stock].buy++
      }
    })
    r.formData.sellList.forEach(s => {
      if (s.stock) {
        if (!stockMap[s.stock]) stockMap[s.stock] = { buy: 0, sell: 0 }
        stockMap[s.stock].sell++
      }
    })
  })

  return Object.entries(stockMap)
    .map(([name, counts]) => ({
      name,
      buy: counts.buy,
      sell: counts.sell,
      total: counts.buy + counts.sell
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
}

/**
 * 估算胜率：用"卖出时符合计划"作为盈利的近似指标
 * （没有真实盈亏数据，用计划执行率近似）
 */
function estimateWinRate(reviews) {
  let sellTotal = 0
  let sellPlanned = 0

  reviews.forEach(r => {
    r.formData.sellList.forEach(s => {
      if (s.stock) {
        sellTotal++
        if (s.matchPlan) sellPlanned++
      }
    })
  })

  return sellTotal === 0 ? 0 : Math.round((sellPlanned / sellTotal) * 100)
}

/**
 * 最近 7 天的执行率评分（0-100）
 */
function computeRecentScore(reviews) {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const recent = reviews.filter(r => r.timestamp >= sevenDaysAgo)
  if (recent.length === 0) return 0

  return computePlanAdherence(recent)
}

/**
 * 每日执行率趋势（最近 14 天）
 */
function computeAdherenceTrend(reviews) {
  const trend = []

  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = formatDate(d.getTime())

    const dayReviews = reviews.filter(r => r.date === dateStr)
    if (dayReviews.length === 0) {
      trend.push({ date: dateStr.substring(5), adherence: -1, trades: 0 })
    } else {
      const adherence = computePlanAdherence(dayReviews)
      const trades = countTotalTrades(dayReviews)
      trend.push({ date: dateStr.substring(5), adherence, trades })
    }
  }

  return trend
}

/**
 * 最常被遗漏的计划类型
 */
function computeMostCommonMissed(reviews) {
  const missedKeywords = {}

  reviews.forEach(r => {
    r.formData.missedList.forEach(m => {
      if (m.what) {
        // 提取关键动作词
        const actions = ['买入', '卖出', '建仓', '减仓', '加仓', '止损', '止盈', '观望', '等待']
        for (const action of actions) {
          if (m.what.includes(action)) {
            missedKeywords[action] = (missedKeywords[action] || 0) + 1
            break
          }
        }
      }
    })
  })

  return Object.entries(missedKeywords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([action, count]) => ({ action, count }))
}

/**
 * 复盘时间分布（几点复盘最多）— 返回数组，兼容 wx:for
 */
function computeReviewTimeDistribution(reviews) {
  const periods = { '凌晨': 0, '上午': 0, '下午': 0, '晚上': 0 }
  reviews.forEach(r => {
    const hour = new Date(r.timestamp).getHours()
    const period = hour < 6 ? '凌晨'
      : hour < 12 ? '上午'
      : hour < 18 ? '下午'
      : '晚上'
    periods[period]++
  })
  return Object.entries(periods)
    .filter(([_, count]) => count > 0)
    .map(([period, count]) => ({ period, count }))
}

/**
 * 获取最近 N 天的复盘数据
 */
function getRecentReviews(days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return storage.getReviews()
    .filter(r => !r.isDraft && r.timestamp >= cutoff)
    .sort((a, b) => b.timestamp - a.timestamp)
}

module.exports = {
  computeAllStats,
  getRecentReviews,
  computePlanAdherence,
  computeTagDistribution,
  computeStreak,
  countTotalTrades,
  countBuyTrades,
  countSellTrades,
  countMissedPlans
}
