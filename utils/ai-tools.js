/**
 * AI 工具定义 — 教练可调用的工具集
 * 实现 Harness 模式：AI 通过调用工具获取信息，而非一次性回答
 */

const storage = require('./storage')
const { getMarketSnapshot } = require('./market')
const { computeAllStats } = require('./stats')

/**
 * 工具注册表
 * 每个工具定义：name, description, parameters, execute
 */
const TOOLS = {
  get_review_history: {
    name: 'get_review_history',
    description: '获取用户最近N条复盘记录，用于纵向对比分析。返回每条复盘的日期、买卖操作、是否符合计划、未执行计划。',
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
          stock: b.stock,
          reason: b.reason,
          planned: b.matchPlan
        })),
        sells: r.formData.sellList.filter(s => s.stock).map(s => ({
          stock: s.stock,
          reason: s.reason,
          planned: s.matchPlan
        })),
        missed: r.formData.missedList.filter(m => m.what).map(m => ({
          plan: m.what,
          reason: m.why
        })),
        tags: r.tags || [],
        selfAssessment: r.formData.selfAssessment
      }))
    }
  },

  get_pending_questions: {
    name: 'get_pending_questions',
    description: '获取用户尚未回答的教练追问。这些问题在之前的复盘中被提出但用户没有回答，需要在本次分析中追问。',
    parameters: { type: 'object', properties: {} },
    execute() {
      const reviews = storage.getReviews()
        .filter(r => r.pendingQuestions)
        .slice(0, 5)

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
    description: '获取今日A股市场实时数据，包括上证/深证指数、涨跌停统计、板块排行。用于判断用户操作方向是否与大盘一致。',
    parameters: { type: 'object', properties: {} },
    async execute() {
      const data = await getMarketSnapshot()
      if (!data) return { error: '行情数据暂不可用' }
      return {
        summary: data.text,
        sh: data.raw.sh,
        sz: data.raw.sz,
        limitUp: data.raw.limitUp,
        limitDown: data.raw.limitDown,
        totalTurnover: data.raw.totalTurnover
      }
    }
  },

  get_trading_stats: {
    name: 'get_trading_stats',
    description: '获取用户的交易统计数据，包括计划执行率、连续复盘天数、行为标签分布、最常交易的股票等。用于量化评估用户的交易纪律。',
    parameters: { type: 'object', properties: {} },
    execute() {
      const stats = computeAllStats()
      return {
        totalDays: stats.totalDays,
        totalTrades: stats.totalTrades,
        planAdherenceRate: stats.planAdherenceRate,
        streakDays: stats.streakDays,
        tagDistribution: stats.tagDistribution,
        topStocks: stats.topStocks.slice(0, 5),
        winRate: stats.winRate,
        recentScore: stats.recentScore
      }
    }
  },

  get_tag_trend: {
    name: 'get_tag_trend',
    description: '获取用户行为标签的历史趋势。用于判断某个行为偏差是在改善还是恶化。比如"追涨"标签最近出现频率是否在下降。',
    parameters: {
      type: 'object',
      properties: {
        tag: { type: 'string', description: '要查询的标签名，如"追涨"' }
      }
    },
    execute({ tag }) {
      const reviews = storage.getReviews()
        .filter(r => !r.isDraft)
        .sort((a, b) => a.timestamp - b.timestamp)

      const trend = reviews.slice(-10).map(r => ({
        date: r.date,
        hasTag: (r.tags || []).includes(tag)
      }))

      const recentCount = trend.slice(-5).filter(t => t.hasTag).length
      const earlierCount = trend.slice(0, 5).filter(t => t.hasTag).length

      return {
        tag,
        trend,
        recentCount,
        earlierCount,
        direction: recentCount > earlierCount ? '恶化' : recentCount < earlierCount ? '改善' : '持平'
      }
    }
  }
}

/**
 * 执行工具调用
 * @param {string} toolName - 工具名称
 * @param {Object} params - 工具参数
 * @returns {Promise<any>} 工具执行结果
 */
async function executeTool(toolName, params = {}) {
  const tool = TOOLS[toolName]
  if (!tool) {
    return { error: `未知工具: ${toolName}` }
  }
  try {
    return await tool.execute(params)
  } catch (e) {
    return { error: `工具执行失败: ${e.message}` }
  }
}

/**
 * 获取所有工具的描述（用于注入 System Prompt）
 */
function getToolDescriptions() {
  return Object.values(TOOLS).map(t => {
    const params = t.parameters.properties
    const paramDesc = Object.entries(params).map(([k, v]) => `  - ${k}: ${v.description}`).join('\n')
    return `### ${t.name}\n${t.description}${paramDesc ? '\n' + paramDesc : ''}`
  }).join('\n\n')
}

/**
 * 从 AI 回复中解析工具调用
 * 格式：__TOOL_CALL__:{"name":"tool_name","params":{...}}
 */
function parseToolCalls(text) {
  const calls = []
  const regex = /__TOOL_CALL__\s*:\s*(\{[^}]+\})/g
  let match
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1])
      if (parsed.name) {
        calls.push({
          name: parsed.name,
          params: parsed.params || {},
          raw: match[0]
        })
      }
    } catch (e) {
      // 解析失败，跳过
    }
  }
  return calls
}

module.exports = {
  TOOLS,
  executeTool,
  getToolDescriptions,
  parseToolCalls
}
