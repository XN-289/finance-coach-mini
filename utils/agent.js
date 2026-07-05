/**
 * AI Agent 引擎 v3.0 — Harness + Loop + Self-Correction + Memory
 *
 * 升级特性：
 * - 重试与指数退避
 * - 工具结果缓存（5分钟 TTL）
 * - 自适应温度（每阶段独立温度）
 * - 多工具并行编排
 * - 自我修正循环
 * - 结构化输出解析
 * - 详细进度报告（含百分比）
 * - 错误恢复与优雅降级
 * - Agent 上下文记忆
 * - 执行元数据追踪
 */

const { callAI } = require('./api')
const { executeTool, getToolDescriptions, parseToolCalls } = require('./ai-tools')

/**
 * Agent 配置
 */
const AGENT_CONFIG = {
  MAX_TOOL_ROUNDS: 3,
  MAX_REFLECTION_ROUNDS: 1,
  MAX_CORRECTION_ROUNDS: 1,
  MAX_RETRIES: 2,
  CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes

  // 自适应温度
  TOOL_TEMPERATURE: 0.3,
  ANALYSIS_TEMPERATURE: 0.9,
  REFLECTION_TEMPERATURE: 0.4,
  CORRECTION_TEMPERATURE: 0.2,

  // Token 限制
  MAX_TOTAL_TOKENS: 8000
}

// ── 工具结果缓存 ──
const _toolCache = new Map()

function getCachedToolResult(toolName, params) {
  const key = toolName + ':' + JSON.stringify(params)
  const cached = _toolCache.get(key)
  if (cached && Date.now() - cached.time < AGENT_CONFIG.CACHE_TTL_MS) {
    return { hit: true, result: cached.result }
  }
  return { hit: false }
}

function setCachedToolResult(toolName, params, result) {
  const key = toolName + ':' + JSON.stringify(params)
  _toolCache.set(key, { result, time: Date.now() })
  // 清理过期缓存
  if (_toolCache.size > 50) {
    const now = Date.now()
    for (const [k, v] of _toolCache) {
      if (now - v.time > AGENT_CONFIG.CACHE_TTL_MS) _toolCache.delete(k)
    }
  }
}

// ── API 重试包装 ──
async function callAIWithRetry(messages, options, maxRetries) {
  maxRetries = maxRetries || AGENT_CONFIG.MAX_RETRIES
  let lastError
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callAI(messages, options)
    } catch (err) {
      lastError = err
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000 // exponential backoff
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }
  throw lastError
}

// ── 构建 Agent 上下文（含教练记忆）──
async function buildAgentContext() {
  const storage = require('./storage')
  const { computeAllStats } = require('./stats')
  const coachingState = require('./coaching-state')

  try {
    const reviews = storage.getReviews().filter(r => !r.isDraft)
    const stats = computeAllStats(reviews)

    // 收集未回答的追问
    const seen = new Set()
    const pendingQuestions = []
    reviews.slice(0, 5).forEach(r => {
      (r.pendingQuestions || []).forEach(q => {
        if (!q.answered && !seen.has(q.question)) {
          seen.add(q.question)
          pendingQuestions.push(q.question)
        }
      })
    })

    // 最近标签趋势
    const recentTags = {}
    reviews.slice(-10).forEach(r => {
      (r.tags || []).forEach(tag => {
        recentTags[tag] = (recentTags[tag] || 0) + 1
      })
    })

    // 获取教练记忆上下文（核心！）
    const coachingContext = coachingState.getCoachingContext()

    return {
      totalReviews: reviews.length,
      stats: {
        planAdherenceRate: stats.planAdherenceRate,
        streakDays: stats.streakDays,
        totalTrades: stats.totalTrades,
        recentScore: stats.recentScore
      },
      pendingQuestions: pendingQuestions.slice(0, 3),
      topTags: Object.entries(recentTags)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag, count]) => tag + '(' + count + ')'),
      experienceLevel: reviews.length < 5 ? 'beginner' : reviews.length < 20 ? 'intermediate' : 'advanced',
      coachingContext // 教练记忆：上次说了什么、未兑现承诺、复发行为、焦点区域
    }
  } catch (e) {
    return { totalReviews: 0, stats: {}, pendingQuestions: [], topTags: [], experienceLevel: 'beginner', coachingContext: '' }
  }
}

// ── 结构化输出解析 ──
function parseStructuredOutput(text) {
  try {
    const jsonMatch = text.match(/__JSON_START__([\s\S]*?)__JSON_END__/)
    if (jsonMatch) {
      return { hasStructured: true, data: JSON.parse(jsonMatch[1].trim()) }
    }
  } catch (e) {}
  return { hasStructured: false, data: null }
}

// ── 质量检查 ──
function checkAnalysisQuality(analysis, userMessage) {
  const checks = {
    hasSpecificNumbers: /\d+%|\d+次|\d+天/.test(analysis),
    referencesTrades: /买入|卖出|交易/.test(analysis) && analysis.length > 200,
    hasActionableAdvice: /下次|如果|建议|应该|具体/.test(analysis),
    notGeneric: !analysis.includes('注意控制风险') || analysis.length > 500,
    hasBehaviorTag: /__TAGS__/.test(analysis) || /追涨|杀跌|犹豫|冲动/.test(analysis)
  }
  const score = Object.values(checks).filter(Boolean).length
  return { score, max: 5, checks, passed: score >= 3 }
}

/**
 * 运行 Agent（v3.0 完整流程）
 */
async function runAgent({ systemPrompt, userMessage, onProgress }) {
  const startTime = Date.now()
  const toolDescriptions = getToolDescriptions()
  const toolCallsLog = []
  const reflections = []
  let apiCallCount = 0
  let cacheHitCount = 0
  let retryCount = 0

  const emitProgress = (phase, progress, message) => {
    onProgress && onProgress({ phase, progress, message })
  }

  // ── Phase 0: 构建上下文 ──
  emitProgress('context', 5, '构建分析上下文...')
  const agentContext = await buildAgentContext()

  // ── 组装增强 System Prompt（含教练记忆）──
  const contextBlock = agentContext.totalReviews > 0
    ? `\n\n## 用户画像\n- 经验水平：${agentContext.experienceLevel}\n- 总复盘次数：${agentContext.totalReviews}\n- 计划执行率：${agentContext.stats.planAdherenceRate}%\n- 连续复盘：${agentContext.stats.streakDays}天\n- 高频标签：${agentContext.topTags.join('、') || '暂无'}\n- 未回答追问：${agentContext.pendingQuestions.length > 0 ? agentContext.pendingQuestions.join('；') : '无'}`
    : ''

  // 教练记忆注入（核心！让教练"记得"上次说了什么）
  const coachingMemoryBlock = agentContext.coachingContext
    ? '\n\n' + agentContext.coachingContext
    : ''

  const toolAwarePrompt = systemPrompt + contextBlock + coachingMemoryBlock + `

## 可用工具
你可以通过调用工具来获取更多信息。在回复中使用格式：
__TOOL_CALL__:{"name":"工具名","params":{"参数名":"值"}}

可用工具列表：
${toolDescriptions}

## 使用规则
- 如果用户提到了具体股票，调用 get_review_history 查看历史
- 如果需要判断市场匹配度，调用 get_market_data
- 如果需要量化评估纪律，调用 get_trading_stats
- 如果需要检测行为偏差，调用 detect_biases
- 如果需要评估风险，调用 assess_risk
- 如果需要追踪改善，调用 track_improvements
- 最多调用 ${AGENT_CONFIG.MAX_TOOL_ROUNDS} 轮工具
- 不需要工具时直接分析`

  // ── Phase 1: 工具调用阶段 ──
  emitProgress('tools', 15, '正在收集数据...')
  apiCallCount++

  let firstReply
  try {
    firstReply = await callAIWithRetry([
      { role: 'system', content: toolAwarePrompt },
      { role: 'user', content: userMessage }
    ], { temperature: AGENT_CONFIG.TOOL_TEMPERATURE, max_tokens: 2000 })
  } catch (err) {
    // 优雅降级：无工具模式
    retryCount++
    emitProgress('tools', 20, '工具调用失败，降级为直接分析...')
    firstReply = await callAIWithRetry([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ], { temperature: AGENT_CONFIG.ANALYSIS_TEMPERATURE, max_tokens: 2000 })
  }

  const calls = parseToolCalls(firstReply)
  let finalAnalysis = firstReply

  if (calls.length > 0) {
    // 并行执行工具调用
    emitProgress('tools', 25, '执行 ' + calls.length + ' 个工具...')
    const toolPromises = calls.map(async (call) => {
      // 检查缓存
      const cached = getCachedToolResult(call.name, call.params)
      if (cached.hit) {
        cacheHitCount++
        return { name: call.name, params: call.params, result: cached.result, cached: true }
      }
      emitProgress('tools', 30, '调用 ' + call.name + '...')
      const result = await executeTool(call.name, call.params)
      setCachedToolResult(call.name, call.params, result)
      return { name: call.name, params: call.params, result, cached: false }
    })

    const toolResults = await Promise.all(toolPromises)
    toolResults.forEach(tr => {
      toolCallsLog.push(tr)
    })

    // Phase 2: 基于工具结果生成分析
    emitProgress('analysis', 50, '正在生成分析...')
    apiCallCount++

    let toolDataBlock = ''
    toolResults.forEach(tr => {
      toolDataBlock += '\n\n[工具 ' + tr.name + (tr.cached ? ' (缓存)' : '') + ']\n' + JSON.stringify(tr.result, null, 2)
    })

    const analysisPrompt = systemPrompt + contextBlock + coachingMemoryBlock + '\n\n## 工具数据' + toolDataBlock + '\n\n请基于以上数据进行深度分析，引用具体数字。\n\n## 输出要求\n- 500-800字，精炼有力\n- 引用工具数据中的具体数字\n- 指出历史模式和当前变化\n- 如果有未兑现的承诺，追问用户\n- 如果有复发的行为，重点分析\n- 在末尾输出 __TAGS__:["标签1","标签2","标签3"]'

    try {
      finalAnalysis = await callAIWithRetry([
        { role: 'system', content: analysisPrompt },
        { role: 'user', content: userMessage }
      ], { temperature: AGENT_CONFIG.ANALYSIS_TEMPERATURE, max_tokens: 2000 })
    } catch (err) {
      // 降级：使用第一轮回复
      finalAnalysis = firstReply
    }
  } else {
    emitProgress('analysis', 55, '分析完成（无需工具）')
  }

  // ── Phase 3: 自我反思 ──
  emitProgress('reflection', 70, '正在质量审查...')
  apiCallCount++

  try {
    const reflectionPrompt = '你是质量审查员。检查以下分析报告：\n\n## 分析报告\n' + finalAnalysis + '\n\n## 用户复盘\n' + userMessage + '\n\n## 检查清单\n1. 是否遗漏了用户提到的交易？\2. 是否忽略了自评中的关键信息？\n3. 是否有空话？\n4. 行为标签是否准确？\n5. 改进建议是否可量化？\n\n如果已足够好，回复："分析质量达标，无需补充。"\n如果有遗漏，补充不超过200字。'

    const reflectionReply = await callAIWithRetry([
      { role: 'system', content: '你是严格的质量审查员。只在确实有遗漏时才补充。' },
      { role: 'user', content: reflectionPrompt }
    ], { temperature: AGENT_CONFIG.REFLECTION_TEMPERATURE, max_tokens: 500 })

    reflections.push(reflectionReply)

    const needsSupplement = reflectionReply
      && !reflectionReply.includes('无需补充')
      && !reflectionReply.includes('质量达标')
      && reflectionReply.length > 20

    if (needsSupplement) {
      finalAnalysis = finalAnalysis + '\n\n---\n**补充说明**：' + reflectionReply
    }
  } catch (err) {
    // 反思失败，跳过（不阻塞主流程）
  }

  // ── Phase 4: 自我修正 ──
  emitProgress('correction', 85, '正在优化修正...')
  const quality = checkAnalysisQuality(finalAnalysis, userMessage)

  if (!quality.passed && AGENT_CONFIG.MAX_CORRECTION_ROUNDS > 0) {
    apiCallCount++
    try {
      const correctionPrompt = '请修正以下分析，使其满足要求：\n\n' +
        '## 当前分析\n' + finalAnalysis + '\n\n' +
        '## 质量检查结果\n' + JSON.stringify(quality.checks) + '\n\n' +
        '## 要求\n' +
        '- 必须包含具体数字\n' +
        '- 必须引用用户的实际交易\n' +
        '- 建议必须可量化可检查\n' +
        '- 行为标签必须有证据\n\n' +
        '请输出修正后的完整分析（保持 __TAGS__ 格式）。'

      const corrected = await callAIWithRetry([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: correctionPrompt }
      ], { temperature: AGENT_CONFIG.CORRECTION_TEMPERATURE, max_tokens: 2000 })

      const newQuality = checkAnalysisQuality(corrected, userMessage)
      if (newQuality.score > quality.score) {
        finalAnalysis = corrected
      }
    } catch (err) {
      // 修正失败，保留原分析
    }
  }

  emitProgress('done', 100, '分析完成')

  const endTime = Date.now()

  return {
    reply: finalAnalysis,
    toolCalls: toolCallsLog,
    reflections,
    metadata: {
      toolsUsed: calls.map(c => c.name),
      reflectionApplied: reflections.some(r => r && !r.includes('无需补充')),
      phases: calls.length > 0
        ? ['context', 'tools', 'analysis', 'reflection', 'correction']
        : ['context', 'analysis', 'reflection', 'correction'],
      totalTimeMs: endTime - startTime,
      apiCallCount,
      toolCallsCount: toolCallsLog.length,
      cacheHitCount,
      retryCount,
      qualityScore: quality.score,
      qualityMax: quality.max,
      context: agentContext
    }
  }
}

module.exports = { runAgent, AGENT_CONFIG, buildAgentContext, parseStructuredOutput, checkAnalysisQuality }
