/**
 * AI 工具定义 v3.0 — 教练可调用的工具集
 *
 * 新增工具：
 * - analyze_sentiment: 情绪分析
 * - detect_patterns: 交易模式检测
 * - assess_risk: 风险评估
 * - track_improvements: 改善追踪
 * - analyze_market_correlation: 市场相关性
 * - score_plans: 计划质量评分
 * - detect_emotional_state: 情绪状态检测
 * - compare_sessions: 会话对比
 * - analyze_frequency: 交易频率分析
 * - detect_biases: 认知偏差检测
 * - generate_weekly_digest: 周报生成
 * - detect_anomalies: 异常检测
 * - attribute_performance: 绩效归因
 * - track_coaching_effectiveness: 教练效果追踪
 * - benchmark_against_peers: 同行基准对比
 * - predict_next_session: 下次会话预测
 */

const storage = require('./storage')
const { getMarketSnapshot } = require('./market')
const { computeAllStats } = require('./stats')

const TOOLS = {
  // ══════════ 原有工具 ══════════

  get_review_history: {
    name: 'get_review_history',
    description: '获取用户最近N条复盘记录，用于纵向对比分析。',
    parameters: {
      type: 'object',
      properties: {
        count: { type: 'number', description: '获取最近几条，默认5' }
      }
    },
    execute({ count = 5 }) {
      const reviews = storage.getReviews()
        .filter(r => !r.isDraft)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, count)

      return reviews.map(r => ({
        date: r.date,
        buys: r.formData.buyList.filter(b => b.stock).map(b => ({
          stock: b.stock, reason: b.reason, planned: b.matchPlan
        })),
        sells: r.formData.sellList.filter(s => s.stock).map(s => ({
          stock: s.stock, reason: s.reason, planned: s.matchPlan
        })),
        missed: r.formData.missedList.filter(m => m.what).map(m => ({
          plan: m.what, reason: m.why
        })),
        tags: r.tags || [],
        selfAssessment: r.formData.selfAssessment
      }))
    }
  },

  get_pending_questions: {
    name: 'get_pending_questions',
    description: '获取用户尚未回答的教练追问。',
    parameters: { type: 'object', properties: {} },
    execute() {
      const reviews = storage.getReviews().filter(r => r.pendingQuestions).slice(0, 5)
      const seen = new Set()
      const pending = []
      reviews.forEach(r => {
        (r.pendingQuestions || []).forEach(q => {
          if (!q.answered && !seen.has(q.question)) {
            seen.add(q.question)
            pending.push(q.question)
          }
        })
      })
      return pending
    }
  },

  get_market_data: {
    name: 'get_market_data',
    description: '获取今日A股市场实时数据，包括指数、涨跌停、板块排行。',
    parameters: { type: 'object', properties: {} },
    async execute() {
      const data = await getMarketSnapshot()
      if (!data) return { error: '行情数据暂不可用' }
      return {
        summary: data.text,
        sh: data.raw.sh, sz: data.raw.sz,
        limitUp: data.raw.limitUp, limitDown: data.raw.limitDown,
        totalTurnover: data.raw.totalTurnover
      }
    }
  },

  get_trading_stats: {
    name: 'get_trading_stats',
    description: '获取用户交易统计数据，包括执行率、连续天数、标签分布等。',
    parameters: { type: 'object', properties: {} },
    execute() {
      const stats = computeAllStats()
      return {
        totalDays: stats.totalDays, totalTrades: stats.totalTrades,
        planAdherenceRate: stats.planAdherenceRate, streakDays: stats.streakDays,
        tagDistribution: stats.tagDistribution, topStocks: stats.topStocks.slice(0, 5),
        winRate: stats.winRate, recentScore: stats.recentScore
      }
    }
  },

  get_tag_trend: {
    name: 'get_tag_trend',
    description: '获取行为标签的历史趋势，判断偏差是在改善还是恶化。',
    parameters: {
      type: 'object',
      properties: {
        tag: { type: 'string', description: '标签名，如"追涨"' }
      }
    },
    execute({ tag }) {
      const reviews = storage.getReviews()
        .filter(r => !r.isDraft)
        .sort((a, b) => a.timestamp - b.timestamp)

      const trend = reviews.slice(-10).map(r => ({
        date: r.date, hasTag: (r.tags || []).includes(tag)
      }))
      const recentCount = trend.slice(-5).filter(t => t.hasTag).length
      const earlierCount = trend.slice(0, 5).filter(t => t.hasTag).length

      return {
        tag, trend, recentCount, earlierCount,
        direction: recentCount > earlierCount ? '恶化' : recentCount < earlierCount ? '改善' : '持平'
      }
    }
  },

  // ══════════ Phase 2 新增工具 ══════════

  analyze_sentiment: {
    name: 'analyze_sentiment',
    description: '分析用户自我评价文本的情绪倾向。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要分析的文本' }
      }
    },
    execute({ text }) {
      if (!text) return { sentiment: 'neutral', confidence: 0, evidence: [] }
      const positive = ['满意', '不错', '好的', '正确', '成功', '盈利', '赚', '进步', '开心', '果断']
      const negative = ['亏', '失误', '后悔', '冲动', '害怕', '焦虑', '烦躁', '不甘', '踏空', '割肉']
      const evidence = []
      let posScore = 0, negScore = 0
      positive.forEach(w => { if (text.includes(w)) { posScore++; evidence.push('+' + w) } })
      negative.forEach(w => { if (text.includes(w)) { negScore++; evidence.push('-' + w) } })
      const total = posScore + negScore
      if (total === 0) return { sentiment: 'neutral', confidence: 0.5, evidence: [] }
      return {
        sentiment: posScore > negScore ? 'positive' : negScore > posScore ? 'negative' : 'mixed',
        confidence: Math.max(posScore, negScore) / total,
        posScore, negScore, evidence
      }
    }
  },

  detect_patterns: {
    name: 'detect_patterns',
    description: '检测用户交易中的重复模式：重复交易的股票、时间偏好、频率模式。',
    parameters: {
      type: 'object',
      properties: {
        lookback_days: { type: 'number', description: '回溯天数，默认30' }
      }
    },
    execute({ lookback_days = 30 }) {
      const cutoff = Date.now() - lookback_days * 24 * 60 * 60 * 1000
      const reviews = storage.getReviews()
        .filter(r => !r.isDraft && r.timestamp >= cutoff)
        .sort((a, b) => a.timestamp - b.timestamp)

      const stockCount = {}
      const hourDist = { morning: 0, afternoon: 0, evening: 0 }
      let totalBuys = 0, totalSells = 0

      reviews.forEach(r => {
        const hour = new Date(r.timestamp).getHours()
        if (hour < 12) hourDist.morning++
        else if (hour < 18) hourDist.afternoon++
        else hourDist.evening++

        r.formData.buyList.forEach(b => {
          if (b.stock) { stockCount[b.stock] = (stockCount[b.stock] || 0) + 1; totalBuys++ }
        })
        r.formData.sellList.forEach(s => {
          if (s.stock) { stockCount[s.stock] = (stockCount[s.stock] || 0) + 1; totalSells++ }
        })
      })

      const repeatStocks = Object.entries(stockCount)
        .filter(([_, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }))

      return {
        repeatStocks,
        timePreference: Object.entries(hourDist).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none',
        buySellRatio: totalSells > 0 ? (totalBuys / totalSells).toFixed(2) : 'N/A',
        totalReviews: reviews.length,
        tradesPerDay: reviews.length > 0 ? ((totalBuys + totalSells) / reviews.length).toFixed(1) : 0
      }
    }
  },

  assess_risk: {
    name: 'assess_risk',
    description: '评估用户的交易风险等级：过度交易、集中度、计划偏离、情绪交易。',
    parameters: { type: 'object', properties: {} },
    execute() {
      const stats = computeAllStats()
      const reviews = storage.getReviews().filter(r => !r.isDraft)

      // 过度交易评分
      const avgTrades = parseFloat(stats.avgTradesPerDay) || 0
      const overtradeScore = avgTrades > 5 ? 'high' : avgTrades > 3 ? 'medium' : 'low'

      // 集中度风险
      const stockCount = {}
      reviews.forEach(r => {
        r.formData.buyList.forEach(b => { if (b.stock) stockCount[b.stock] = (stockCount[b.stock] || 0) + 1 })
        r.formData.sellList.forEach(s => { if (s.stock) stockCount[s.stock] = (stockCount[s.stock] || 0) + 1 })
      })
      const uniqueStocks = Object.keys(stockCount).length
      const concentrationRisk = uniqueStocks < 5 ? 'high' : uniqueStocks < 15 ? 'medium' : 'low'

      // 情绪交易指标
      const emotionalTags = ['报复交易', '盘中冲动', '追涨', '杀跌', '踏空焦虑']
      let emotionalCount = 0
      reviews.forEach(r => {
        (r.tags || []).forEach(t => { if (emotionalTags.includes(t)) emotionalCount++ })
      })
      const emotionalRisk = emotionalCount > 5 ? 'high' : emotionalCount > 2 ? 'medium' : 'low'

      const riskScore = [overtradeScore, concentrationRisk, emotionalRisk]
        .filter(r => r === 'high').length

      return {
        riskLevel: riskScore >= 2 ? 'high' : riskScore >= 1 ? 'medium' : 'low',
        factors: {
          overtrading: { level: overtradeScore, avgTrades },
          concentration: { level: concentrationRisk, uniqueStocks },
          emotional: { level: emotionalRisk, emotionalTagCount: emotionalCount }
        },
        planAdherence: stats.planAdherenceRate
      }
    }
  },

  track_improvements: {
    name: 'track_improvements',
    description: '追踪用户在指定指标上的改善趋势。',
    parameters: {
      type: 'object',
      properties: {
        metric: { type: 'string', description: '指标名：adherence / overtrading / tag:标签名' }
      }
    },
    execute({ metric }) {
      const reviews = storage.getReviews()
        .filter(r => !r.isDraft)
        .sort((a, b) => a.timestamp - b.timestamp)

      if (reviews.length < 4) return { metric, data: [], direction: 'insufficient_data' }

      const weeks = []
      for (let i = 0; i < 4; i++) {
        const weekStart = Date.now() - (i + 1) * 7 * 24 * 60 * 60 * 1000
        const weekEnd = Date.now() - i * 7 * 24 * 60 * 60 * 1000
        const weekReviews = reviews.filter(r => r.timestamp >= weekStart && r.timestamp < weekEnd)

        let value = 0
        if (metric === 'adherence') {
          let total = 0, planned = 0
          weekReviews.forEach(r => {
            r.formData.buyList.forEach(b => { if (b.stock) { total++; if (b.matchPlan) planned++ } })
            r.formData.sellList.forEach(s => { if (s.stock) { total++; if (s.matchPlan) planned++ } })
          })
          value = total > 0 ? Math.round((planned / total) * 100) : -1
        } else if (metric.startsWith('tag:')) {
          const tag = metric.substring(4)
          weekReviews.forEach(r => { if ((r.tags || []).includes(tag)) value++ })
        } else {
          value = weekReviews.reduce((sum, r) => {
            return sum + r.formData.buyList.filter(b => b.stock).length + r.formData.sellList.filter(s => s.stock).length
          }, 0)
        }

        weeks.push({ week: 'W' + (4 - i), value, reviewCount: weekReviews.length })
      }

      const validWeeks = weeks.filter(w => w.value >= 0)
      const direction = validWeeks.length >= 2
        ? (validWeeks[validWeeks.length - 1].value > validWeeks[0].value ? 'improving' :
           validWeeks[validWeeks.length - 1].value < validWeeks[0].value ? 'worsening' : 'stable')
        : 'insufficient_data'

      return { metric, data: weeks.reverse(), direction }
    }
  },

  analyze_market_correlation: {
    name: 'analyze_market_correlation',
    description: '分析用户交易决策与市场环境的相关性。',
    parameters: { type: 'object', properties: {} },
    execute() {
      const reviews = storage.getReviews().filter(r => !r.isDraft)
      let bullDays = 0, bearDays = 0, flatDays = 0
      let bullTrades = 0, bearTrades = 0, flatTrades = 0

      reviews.forEach(r => {
        const marketText = r.formData.market || ''
        const isBull = /涨|上|多|红/.test(marketText)
        const isBear = /跌|下|空|绿/.test(marketText)
        const tradeCount = r.formData.buyList.filter(b => b.stock).length + r.formData.sellList.filter(s => s.stock).length

        if (isBull) { bullDays++; bullTrades += tradeCount }
        else if (isBear) { bearDays++; bearTrades += tradeCount }
        else { flatDays++; flatTrades += tradeCount }
      })

      return {
        bullDays, bearDays, flatDays,
        bullTrades, bearTrades, flatTrades,
        preferredMarket: bullTrades >= bearTrades ? (bullTrades >= flatTrades ? 'bull' : 'flat') : (bearTrades >= flatTrades ? 'bear' : 'flat'),
        totalReviews: reviews.length
      }
    }
  },

  score_plans: {
    name: 'score_plans',
    description: '评估用户 If-Then 计划的质量：具体性、条件清晰度、可执行性、风控。',
    parameters: {
      type: 'object',
      properties: {
        plan_text: { type: 'string', description: '计划文本' }
      }
    },
    execute({ plan_text }) {
      if (!plan_text) return { score: 0, breakdown: {}, message: '无计划文本' }

      let specificity = 0, clarity = 0, actionability = 0, riskMgmt = 0

      // 具体性：有股票名、价格、数量
      if (/\d{4,6}/.test(plan_text) || /[A-Z]{2,}/.test(plan_text)) specificity += 10
      if (/\d+\.?\d*/.test(plan_text)) specificity += 10
      if (/\d+股|\d+手|\d+份/.test(plan_text)) specificity += 5

      // 条件清晰度：有明确触发条件
      if (/如果|突破|站稳|跌破|回调|放量/.test(plan_text)) clarity += 15
      if (/就|则|那么/.test(plan_text)) clarity += 10

      // 可执行性：有具体动作
      if (/买入|卖出|加仓|减仓|建仓|清仓|止损|止盈/.test(plan_text)) actionability += 15
      if (plan_text.length > 10) actionability += 10

      // 风控：有止损或仓位
      if (/止损|止盈|风控/.test(plan_text)) riskMgmt += 10
      if (/仓位|半仓|1\/3|分批/.test(plan_text)) riskMgmt += 5

      const total = specificity + clarity + actionability + riskMgmt
      return {
        score: Math.min(100, total),
        breakdown: { specificity, clarity, actionability, riskMgmt },
        quality: total >= 70 ? 'excellent' : total >= 50 ? 'good' : total >= 30 ? 'fair' : 'poor'
      }
    }
  },

  detect_emotional_state: {
    name: 'detect_emotional_state',
    description: '从复盘文本中检测用户的情绪状态。',
    parameters: {
      type: 'object',
      properties: {
        review_text: { type: 'string', description: '复盘文本' }
      }
    },
    execute({ review_text }) {
      if (!review_text) return { primary: 'neutral', confidence: 0, indicators: [] }

      const patterns = {
        fear: { words: ['怕', '担心', '不敢', '犹豫', '恐慌', '害怕', '畏惧'], score: 0 },
        greed: { words: ['贪', '不够', '还想', '加仓', '追', '全仓', '梭哈', '不够赚'], score: 0 },
        frustration: { words: ['亏', '又', '总是', '为什么', '不甘', '气死', '烦'], score: 0 },
        overconfidence: { words: ['一定', '肯定', '稳了', '必涨', '确定', '绝对'], score: 0 },
        anxiety: { words: ['焦虑', '不安', '纠结', '矛盾', '拿不住', '心慌'], score: 0 }
      }

      const evidence = []
      Object.entries(patterns).forEach(([emotion, config]) => {
        config.words.forEach(w => {
          if (review_text.includes(w)) {
            config.score++
            evidence.push(emotion + ':' + w)
          }
        })
      })

      const sorted = Object.entries(patterns).sort((a, b) => b[1].score - a[1].score)
      const primary = sorted[0][1].score > 0 ? sorted[0][0] : 'neutral'
      const totalHits = evidence.length

      return {
        primary,
        confidence: totalHits > 0 ? Math.min(1, sorted[0][1].score / totalHits) : 0,
        allScores: Object.fromEntries(Object.entries(patterns).map(([k, v]) => [k, v.score])),
        indicators: evidence.slice(0, 5)
      }
    }
  },

  compare_sessions: {
    name: 'compare_sessions',
    description: '对比当前复盘与上一次复盘的异同。',
    parameters: { type: 'object', properties: {} },
    execute() {
      const reviews = storage.getReviews()
        .filter(r => !r.isDraft)
        .sort((a, b) => b.timestamp - a.timestamp)

      if (reviews.length < 2) return { comparison: 'insufficient_data' }

      const current = reviews[0]
      const previous = reviews[1]

      const currentStocks = new Set()
      const prevStocks = new Set()
      current.formData.buyList.forEach(b => { if (b.stock) currentStocks.add(b.stock) })
      current.formData.sellList.forEach(s => { if (s.stock) currentStocks.add(s.stock) })
      previous.formData.buyList.forEach(b => { if (b.stock) prevStocks.add(b.stock) })
      previous.formData.sellList.forEach(s => { if (s.stock) prevStocks.add(s.stock) })

      const commonStocks = [...currentStocks].filter(s => prevStocks.has(s))
      const newStocks = [...currentStocks].filter(s => !prevStocks.has(s))

      // 计划执行率变化
      const calcAdherence = (r) => {
        let total = 0, planned = 0
        r.formData.buyList.forEach(b => { if (b.stock) { total++; if (b.matchPlan) planned++ } })
        r.formData.sellList.forEach(s => { if (s.stock) { total++; if (s.matchPlan) planned++ } })
        return total > 0 ? Math.round((planned / total) * 100) : -1
      }

      const currentAdh = calcAdherence(current)
      const prevAdh = calcAdherence(previous)

      // 标签变化
      const currentTags = new Set(current.tags || [])
      const prevTags = new Set(previous.tags || [])
      const newTags = [...currentTags].filter(t => !prevTags.has(t))
      const goneTags = [...prevTags].filter(t => !currentTags.has(t))

      return {
        dates: { current: current.date, previous: previous.date },
        commonStocks, newStocks,
        adherence: { current: currentAdh, previous: prevAdh, change: currentAdh >= 0 && prevAdh >= 0 ? currentAdh - prevAdh : null },
        tags: { new: newTags, gone: goneTags, kept: commonStocks.length > 0 },
        repeatedMistakes: newTags.length === 0 && goneTags.length === 0
      }
    }
  },

  analyze_frequency: {
    name: 'analyze_frequency',
    description: '分析用户的交易频率模式，检测过度交易或交易不足。',
    parameters: { type: 'object', properties: {} },
    execute() {
      const reviews = storage.getReviews().filter(r => !r.isDraft)
      if (reviews.length < 3) return { analysis: 'insufficient_data' }

      const sorted = [...reviews].sort((a, b) => a.timestamp - b.timestamp)
      const totalDays = Math.max(1, (sorted[sorted.length - 1].timestamp - sorted[0].timestamp) / (24 * 60 * 60 * 1000))

      let totalTrades = 0
      const dailyTrades = []
      sorted.forEach(r => {
        const trades = r.formData.buyList.filter(b => b.stock).length + r.formData.sellList.filter(s => s.stock).length
        totalTrades += trades
        dailyTrades.push({ date: r.date, trades })
      })

      const avgPerDay = totalTrades / reviews.length
      const maxDay = dailyTrades.reduce((max, d) => d.trades > max.trades ? d : max, dailyTrades[0])
      const activeDays = reviews.length
      const restDays = Math.max(0, Math.round(totalDays) - activeDays)

      // 检测交易聚集
      let clusterCount = 0
      for (let i = 1; i < dailyTrades.length; i++) {
        if (dailyTrades[i].trades >= 3 && dailyTrades[i - 1].trades >= 3) clusterCount++
      }

      return {
        avgTradesPerDay: avgPerDay.toFixed(1),
        maxTradesInDay: { date: maxDay.date, count: maxDay.trades },
        activeDays, restDays,
        activeRatio: (activeDays / Math.max(1, Math.round(totalDays)) * 100).toFixed(0) + '%',
        clusterCount,
        frequency: avgPerDay > 4 ? 'overtrading' : avgPerDay > 2 ? 'active' : avgPerDay > 0.5 ? 'moderate' : 'passive',
        dailyBreakdown: dailyTrades.slice(-14)
      }
    }
  },

  detect_biases: {
    name: 'detect_biases',
    description: '检测用户交易行为中的认知偏差，用实际交易数据作证据。',
    parameters: { type: 'object', properties: {} },
    execute() {
      const reviews = storage.getReviews().filter(r => !r.isDraft)
      const biases = []

      // 锚定效应：反复提到相同价格
      const pricePattern = /\d+\.?\d*元|\d+\.?\d*块/g
      const priceMentions = {}
      reviews.forEach(r => {
        const text = r.formData.market + r.formData.tomorrow + r.formData.selfAssessment
        const matches = text.match(pricePattern) || []
        matches.forEach(p => { priceMentions[p] = (priceMentions[p] || 0) + 1 })
      })
      const anchoringPrices = Object.entries(priceMentions).filter(([_, c]) => c >= 3)
      if (anchoringPrices.length > 0) {
        biases.push({
          type: '锚定效应',
          severity: 'medium',
          evidence: '反复提到相同价格位：' + anchoringPrices.map(([p, c]) => p + '(' + c + '次)').join('、')
        })
      }

      // 处置效应：卖出时符合计划率低于买入
      let buyPlanned = 0, buyTotal = 0, sellPlanned = 0, sellTotal = 0
      reviews.forEach(r => {
        r.formData.buyList.forEach(b => { if (b.stock) { buyTotal++; if (b.matchPlan) buyPlanned++ } })
        r.formData.sellList.forEach(s => { if (s.stock) { sellTotal++; if (s.matchPlan) sellPlanned++ } })
      })
      const buyRate = buyTotal > 0 ? buyPlanned / buyTotal : 0
      const sellRate = sellTotal > 0 ? sellPlanned / sellTotal : 0
      if (sellRate < buyRate - 0.15 && sellTotal >= 3) {
        biases.push({
          type: '处置效应',
          severity: 'high',
          evidence: '买入计划执行率' + Math.round(buyRate * 100) + '%，卖出仅' + Math.round(sellRate * 100) + '%，说明卖出时更冲动'
        })
      }

      // 损失厌恶：未执行计划中止损类最多
      let stopLossMissed = 0, totalMissed = 0
      reviews.forEach(r => {
        r.formData.missedList.forEach(m => {
          if (m.what) {
            totalMissed++
            if (/止损|卖出|清仓|止盈/.test(m.what)) stopLossMissed++
          }
        })
      })
      if (stopLossMissed >= 3 && stopLossMissed > totalMissed * 0.4) {
        biases.push({
          type: '损失厌恶',
          severity: 'high',
          evidence: '未执行计划中' + Math.round(stopLossMissed / totalMissed * 100) + '%是止损/卖出类，说明害怕实现亏损'
        })
      }

      // 过度自信：频繁使用"一定""肯定"等词
      let overconfidentCount = 0
      reviews.forEach(r => {
        const text = r.formData.selfAssessment + r.formData.tomorrow
        if (/一定|肯定|必涨|稳了|绝对/.test(text)) overconfidentCount++
      })
      if (overconfidentCount >= 3) {
        biases.push({
          type: '过度自信',
          severity: 'medium',
          evidence: '在' + overconfidentCount + '次复盘中使用了确定性极强的词语'
        })
      }

      // 确认偏误：只在买入理由中找支持信息
      let oneSidedReasons = 0
      reviews.forEach(r => {
        r.formData.buyList.forEach(b => {
          if (b.stock && b.reason && !/风险|但是|不过|可能|也许/.test(b.reason)) oneSidedReasons++
        })
      })
      if (oneSidedReasons >= 5) {
        biases.push({
          type: '确认偏误',
          severity: 'medium',
          evidence: oneSidedReasons + '条买入理由中没有提及风险或反对观点'
        })
      }

      return { biases, totalReviews: reviews.length, checkedAt: new Date().toISOString() }
    }
  },

  generate_weekly_digest: {
    name: 'generate_weekly_digest',
    description: '生成最近7天的交易活动摘要。',
    parameters: { type: 'object', properties: {} },
    execute() {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      const reviews = storage.getReviews()
        .filter(r => !r.isDraft && r.timestamp >= weekAgo)
        .sort((a, b) => b.timestamp - a.timestamp)

      if (reviews.length === 0) return { message: '本周无复盘记录' }

      let totalBuys = 0, totalSells = 0, totalMissed = 0, planned = 0, total = 0
      const stockFreq = {}
      const tagFreq = {}
      const allTags = []

      reviews.forEach(r => {
        r.formData.buyList.forEach(b => {
          if (b.stock) {
            totalBuys++; total++
            if (b.matchPlan) planned++
            stockFreq[b.stock] = (stockFreq[b.stock] || 0) + 1
          }
        })
        r.formData.sellList.forEach(s => {
          if (s.stock) {
            totalSells++; total++
            if (s.matchPlan) planned++
            stockFreq[s.stock] = (stockFreq[s.stock] || 0) + 1
          }
        })
        r.formData.missedList.forEach(m => { if (m.what) totalMissed++ })
        ;(r.tags || []).forEach(t => {
          tagFreq[t] = (tagFreq[t] || 0) + 1
          allTags.push(t)
        })
      })

      const topStocks = Object.entries(stockFreq).sort((a, b) => b[1] - a[1]).slice(0, 3)
      const topTags = Object.entries(tagFreq).sort((a, b) => b[1] - a[1]).slice(0, 3)

      return {
        reviewDays: reviews.length,
        totalTrades: total,
        buyCount: totalBuys,
        sellCount: totalSells,
        missedPlans: totalMissed,
        planAdherence: total > 0 ? Math.round((planned / total) * 100) : 0,
        topStocks: topStocks.map(([name, count]) => ({ name, count })),
        topTags: topTags.map(([tag, count]) => ({ tag, count })),
        dateRange: { from: reviews[reviews.length - 1].date, to: reviews[0].date }
      }
    }
  },

  // ══════════ Phase 5 新增工具 ══════════

  detect_anomalies: {
    name: 'detect_anomalies',
    description: '检测用户交易中的异常行为，偏离正常模式的情况。',
    parameters: { type: 'object', properties: {} },
    execute() {
      const reviews = storage.getReviews().filter(r => !r.isDraft)
      if (reviews.length < 5) return { anomalies: [], message: '数据不足' }

      const sorted = [...reviews].sort((a, b) => a.timestamp - b.timestamp)
      const recent = sorted[sorted.length - 1]
      const anomalies = []

      // 交易次数异常
      const avgTrades = sorted.reduce((sum, r) => {
        return sum + r.formData.buyList.filter(b => b.stock).length + r.formData.sellList.filter(s => s.stock).length
      }, 0) / sorted.length
      const recentTrades = recent.formData.buyList.filter(b => b.stock).length + recent.formData.sellList.filter(s => s.stock).length
      if (recentTrades > avgTrades * 2 && recentTrades >= 4) {
        anomalies.push({ type: 'overtrading', severity: 'high', message: '今日交易次数(' + recentTrades + ')是平均(' + avgTrades.toFixed(1) + ')的' + (recentTrades / avgTrades).toFixed(1) + '倍' })
      }

      // 新股票异常
      const knownStocks = new Set()
      sorted.slice(0, -1).forEach(r => {
        r.formData.buyList.forEach(b => { if (b.stock) knownStocks.add(b.stock) })
        r.formData.sellList.forEach(s => { if (s.stock) knownStocks.add(s.stock) })
      })
      const recentStocks = new Set()
      recent.formData.buyList.forEach(b => { if (b.stock) recentStocks.add(b.stock) })
      recent.formData.sellList.forEach(s => { if (s.stock) recentStocks.add(s.stock) })
      const newStocks = [...recentStocks].filter(s => !knownStocks.has(s))
      if (newStocks.length >= 3) {
        anomalies.push({ type: 'new_stocks', severity: 'medium', message: '今日交易了' + newStocks.length + '只从未交易过的股票：' + newStocks.join('、') })
      }

      // 计划执行率异常
      const avgAdherence = sorted.reduce((sum, r) => {
        let t = 0, p = 0
        r.formData.buyList.forEach(b => { if (b.stock) { t++; if (b.matchPlan) p++ } })
        r.formData.sellList.forEach(s => { if (s.stock) { t++; if (s.matchPlan) p++ } })
        return sum + (t > 0 ? p / t : 1)
      }, 0) / sorted.length

      let recentPlanned = 0, recentTotal = 0
      recent.formData.buyList.forEach(b => { if (b.stock) { recentTotal++; if (b.matchPlan) recentPlanned++ } })
      recent.formData.sellList.forEach(s => { if (s.stock) { recentTotal++; if (s.matchPlan) recentPlanned++ } })
      const recentAdherence = recentTotal > 0 ? recentPlanned / recentTotal : 1

      if (recentAdherence < avgAdherence - 0.3 && recentTotal >= 2) {
        anomalies.push({ type: 'adherence_drop', severity: 'high', message: '计划执行率从平均' + Math.round(avgAdherence * 100) + '%骤降至' + Math.round(recentAdherence * 100) + '%' })
      }

      return { anomalies, recentDate: recent.date, totalReviews: reviews.length }
    }
  },

  attribute_performance: {
    name: 'attribute_performance',
    description: '将交易绩效归因于不同因素：计划执行、选股、市场环境。',
    parameters: { type: 'object', properties: {} },
    execute() {
      const reviews = storage.getReviews().filter(r => !r.isDraft)
      if (reviews.length < 3) return { attribution: 'insufficient_data' }

      let plannedTrades = 0, unplannedTrades = 0
      let plannedWithReason = 0, unplannedWithReason = 0
      const tagOutcomes = {}

      reviews.forEach(r => {
        r.formData.buyList.forEach(b => {
          if (b.stock) {
            if (b.matchPlan) { plannedTrades++; if (b.reason && b.reason.length > 5) plannedWithReason++ }
            else { unplannedTrades++; if (b.reason && b.reason.length > 5) unplannedWithReason++ }
          }
        })
        r.formData.sellList.forEach(s => {
          if (s.stock) {
            if (s.matchPlan) { plannedTrades++; if (s.reason && s.reason.length > 5) plannedWithReason++ }
            else { unplannedTrades++; if (s.reason && s.reason.length > 5) unplannedWithReason++ }
          }
        })
        ;(r.tags || []).forEach(t => {
          if (!tagOutcomes[t]) tagOutcomes[t] = { count: 0 }
          tagOutcomes[t].count++
        })
      })

      return {
        plannedVsUnplanned: {
          planned: plannedTrades,
          unplanned: unplannedTrades,
          plannedRatio: plannedTrades + unplannedTrades > 0 ? Math.round(plannedTrades / (plannedTrades + unplannedTrades) * 100) : 0
        },
        reasonQuality: {
          planned: { total: plannedTrades, withReason: plannedWithReason },
          unplanned: { total: unplannedTrades, withReason: unplannedWithReason }
        },
        tagFrequency: Object.entries(tagOutcomes)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 5)
          .map(([tag, data]) => ({ tag, count: data.count })),
        totalReviews: reviews.length
      }
    }
  },

  track_coaching_effectiveness: {
    name: 'track_coaching_effectiveness',
    description: '追踪AI教练的有效性：用户在接受建议后是否改善。',
    parameters: { type: 'object', properties: {} },
    execute() {
      const reviews = storage.getReviews()
        .filter(r => !r.isDraft)
        .sort((a, b) => a.timestamp - b.timestamp)

      if (reviews.length < 6) return { effectiveness: 'insufficient_data' }

      // 将复盘分为前半和后半
      const mid = Math.floor(reviews.length / 2)
      const earlier = reviews.slice(0, mid)
      const later = reviews.slice(mid)

      const calcAdherence = (rs) => {
        let t = 0, p = 0
        rs.forEach(r => {
          r.formData.buyList.forEach(b => { if (b.stock) { t++; if (b.matchPlan) p++ } })
          r.formData.sellList.forEach(s => { if (s.stock) { t++; if (s.matchPlan) p++ } })
        })
        return t > 0 ? Math.round((p / t) * 100) : 0
      }

      const earlierAdh = calcAdherence(earlier)
      const laterAdh = calcAdherence(later)

      // 标签变化
      const earlierTags = {}
      const laterTags = {}
      earlier.forEach(r => (r.tags || []).forEach(t => { earlierTags[t] = (earlierTags[t] || 0) + 1 }))
      later.forEach(r => (r.tags || []).forEach(t => { laterTags[t] = (laterTags[t] || 0) + 1 }))

      const improved = Object.entries(earlierTags).filter(([tag, count]) => {
        const laterCount = laterTags[tag] || 0
        return laterCount < count
      }).map(([tag]) => tag)

      const worsened = Object.entries(laterTags).filter(([tag, count]) => {
        const earlierCount = earlierTags[tag] || 0
        return count > earlierCount && earlierCount > 0
      }).map(([tag]) => tag)

      return {
        adherenceChange: laterAdh - earlierAdh,
        earlierAdherence: earlierAdh,
        laterAdherence: laterAdh,
        improvedTags: improved,
        worsenedTags: worsened,
        totalReviews: reviews.length,
        assessment: laterAdh > earlierAdh ? 'improving' : laterAdh < earlierAdh ? 'declining' : 'stable'
      }
    }
  },

  benchmark_against_peers: {
    name: 'benchmark_against_peers',
    description: '将用户指标与散户平均水平对比。',
    parameters: { type: 'object', properties: {} },
    execute() {
      const stats = computeAllStats()

      // 散户平均水平（基于研究数据）
      const peerBenchmarks = {
        planAdherenceRate: 35,
        avgTradesPerDay: 3.5,
        winRate: 40,
        streakDays: 2
      }

      return {
        user: {
          planAdherenceRate: stats.planAdherenceRate,
          avgTradesPerDay: parseFloat(stats.avgTradesPerDay),
          winRate: stats.winRate,
          streakDays: stats.streakDays
        },
        peers: peerBenchmarks,
        comparison: {
          adherence: stats.planAdherenceRate > peerBenchmarks.planAdherenceRate ? 'above' : 'below',
          frequency: parseFloat(stats.avgTradesPerDay) < peerBenchmarks.avgTradesPerDay ? 'better' : 'worse',
          winRate: stats.winRate > peerBenchmarks.winRate ? 'above' : 'below',
          consistency: stats.streakDays > peerBenchmarks.streakDays ? 'above' : 'below'
        }
      }
    }
  },

  predict_next_session: {
    name: 'predict_next_session',
    description: '基于历史模式预测下次交易可能遇到的问题。',
    parameters: { type: 'object', properties: {} },
    execute() {
      const reviews = storage.getReviews().filter(r => !r.isDraft)
      if (reviews.length < 3) return { predictions: [], message: '数据不足' }

      const sorted = [...reviews].sort((a, b) => b.timestamp - a.timestamp)
      const recent = sorted[0]
      const predictions = []

      // 连胜后过度交易风险
      let recentWins = 0
      for (let i = 0; i < Math.min(3, sorted.length); i++) {
        const r = sorted[i]
        const hasPlanned = r.formData.buyList.some(b => b.stock && b.matchPlan) || r.formData.sellList.some(s => s.stock && s.matchPlan)
        if (hasPlanned) recentWins++
      }
      if (recentWins >= 3) {
        predictions.push({ risk: 'overconfidence', probability: 'high', message: '连续3次以上计划内交易后，过度自信风险增加' })
      }

      // 连亏后报复交易风险
      let recentLosses = 0
      for (let i = 0; i < Math.min(3, sorted.length); i++) {
        const r = sorted[i]
        const hasUnplanned = r.formData.buyList.some(b => b.stock && !b.matchPlan) || r.formData.sellList.some(s => s.stock && !s.matchPlan)
        if (hasUnplanned) recentLosses++
      }
      if (recentLosses >= 2) {
        predictions.push({ risk: 'revenge_trading', probability: 'medium', message: '最近有计划外交易，注意避免报复性交易' })
      }

      // 高频标签持续风险
      const recentTags = {}
      sorted.slice(0, 3).forEach(r => (r.tags || []).forEach(t => { recentTags[t] = (recentTags[t] || 0) + 1 }))
      const persistentTags = Object.entries(recentTags).filter(([_, c]) => c >= 2)
      persistentTags.forEach(([tag]) => {
        predictions.push({ risk: 'persistent_bias', probability: 'medium', message: '标签"' + tag + '"连续出现，需要特别警惕' })
      })

      // 未回答追问
      const pending = []
      sorted.slice(0, 5).forEach(r => {
        (r.pendingQuestions || []).forEach(q => { if (!q.answered) pending.push(q.question) })
      })
      if (pending.length >= 2) {
        predictions.push({ risk: 'avoidance', probability: 'medium', message: '有' + pending.length + '个未回答的追问，可能在回避某些问题' })
      }

      return { predictions, basedOnReviews: sorted.length }
    }
  }
}

// ══════════ 工具执行与解析 ══════════

async function executeTool(toolName, params = {}) {
  const tool = TOOLS[toolName]
  if (!tool) return { error: '未知工具: ' + toolName }
  try {
    return await tool.execute(params)
  } catch (e) {
    return { error: '工具执行失败: ' + e.message }
  }
}

function getToolDescriptions() {
  return Object.values(TOOLS).map(t => {
    const params = t.parameters.properties
    const paramDesc = Object.entries(params).map(([k, v]) => '  - ' + k + ': ' + v.description).join('\n')
    return '### ' + t.name + '\n' + t.description + (paramDesc ? '\n' + paramDesc : '')
  }).join('\n\n')
}

function parseToolCalls(text) {
  const calls = []
  const regex = /__TOOL_CALL__\s*:\s*(\{[\s\S]*?\}(?=\s|$|__TOOL_CALL__))/g
  let match
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1])
      if (parsed.name) {
        calls.push({ name: parsed.name, params: parsed.params || {}, raw: match[0] })
      }
    } catch (e) {}
  }
  return calls
}

module.exports = {
  TOOLS,
  executeTool,
  getToolDescriptions,
  parseToolCalls
}
