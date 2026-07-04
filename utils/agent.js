/**
 * AI Agent 引擎 — 实现 Harness + Loop 模式
 *
 * Harness（驾驭）：AI 通过调用工具获取信息，而非一次性回答
 * Loop（循环）：AI 自我反思、迭代改进，直到输出质量达标
 *
 * 这是项目的核心 AI 架构，区别于简单的"调一次 API 拿结果"
 */

const { callAI } = require('./api')
const { executeTool, getToolDescriptions, parseToolCalls } = require('./ai-tools')

/**
 * Agent 配置
 */
const AGENT_CONFIG = {
  // 工具调用轮次上限（防止无限循环）
  MAX_TOOL_ROUNDS: 3,
  // 自我反思轮次上限
  MAX_REFLECTION_ROUNDS: 1,
  // API 温度
  TEMPERATURE: 0.8,
  // 反思温度（更低，更保守）
  REFLECTION_TEMPERATURE: 0.4
}

/**
 * 运行 Agent
 *
 * 流程：
 *   1. 组装初始 Prompt（含工具描述）
 *   2. 第一轮：AI 决定需要调用哪些工具，同时可能生成部分分析
 *   3. 如果有工具调用：执行工具，将结果注入上下文，生成最终分析
 *      如果无工具调用：第一轮回复即为最终分析（省一次 API 调用）
 *   4. 自我反思：AI 检查自己的输出是否有遗漏
 *   5. 输出最终结果
 *
 * @param {Object} options
 * @param {string} options.systemPrompt - System Prompt
 * @param {string} options.userMessage - 用户消息（复盘内容）
 * @param {Function} options.onProgress - 进度回调
 * @returns {Promise<{reply: string, toolCalls: Array, reflections: Array}>}
 */
async function runAgent({ systemPrompt, userMessage, onProgress }) {
  const toolDescriptions = getToolDescriptions()
  const toolCalls = []
  const reflections = []

  // ── Phase 1: 工具调用阶段（Harness）──
  onProgress && onProgress({ phase: 'tools', message: '正在收集数据...' })

  // 组装带工具描述的 System Prompt
  const toolAwarePrompt = `${systemPrompt}

## 可用工具

你可以通过调用工具来获取更多信息。如果需要调用工具，在回复中使用以下格式：
__TOOL_CALL__:{"name":"工具名","params":{"参数名":"值"}}

可用工具列表：
${toolDescriptions}

## 使用规则
- 如果用户的复盘中提到了具体股票，调用 get_review_history 查看该股票的历史操作
- 如果需要判断市场匹配度，调用 get_market_data 获取今日行情
- 如果需要量化评估用户纪律，调用 get_trading_stats
- 如果需要追踪某个行为偏差是否在改善，调用 get_tag_trend
- 最多调用 ${AGENT_CONFIG.MAX_TOOL_ROUNDS} 轮工具
- 如果不需要调用工具，直接分析即可`

  // 第一轮：让 AI 决定需要哪些工具
  const firstReply = await callAI([
    { role: 'system', content: toolAwarePrompt },
    { role: 'user', content: userMessage }
  ], { temperature: AGENT_CONFIG.TEMPERATURE, max_tokens: 2000 })

  // 解析工具调用
  const calls = parseToolCalls(firstReply)

  let finalAnalysis = firstReply

  if (calls.length > 0) {
    // ── 有工具调用：执行工具，然后基于工具结果生成最终分析 ──
    let toolResults = ''
    for (const call of calls) {
      onProgress && onProgress({ phase: 'tools', message: `调用 ${call.name}...` })
      const result = await executeTool(call.name, call.params)
      toolCalls.push({ name: call.name, params: call.params, result })
      toolResults += `\n\n[工具 ${call.name} 返回]\n${JSON.stringify(result, null, 2)}`
    }

    // Phase 2: 基于工具结果生成最终分析
    onProgress && onProgress({ phase: 'analysis', message: '正在生成分析...' })

    const analysisPrompt = `${systemPrompt}

## 任务
基于用户的复盘记录和以下工具数据，生成深度分析。

## 工具数据
${toolResults}

请基于以上数据进行分析，引用具体数字。

## 输出要求
- 500-800字，精炼有力
- 引用工具数据中的具体数字（如执行率、标签频次）
- 指出用户的历史模式和当前变化
- 在末尾输出 __TAGS__:["标签1","标签2","标签3"]`

    finalAnalysis = await callAI([
      { role: 'system', content: analysisPrompt },
      { role: 'user', content: userMessage }
    ], { temperature: AGENT_CONFIG.TEMPERATURE, max_tokens: 2000 })
  } else {
    // ── 无工具调用：第一轮回复即为最终分析（省一次 API 调用）──
    onProgress && onProgress({ phase: 'analysis', message: '分析完成' })
  }

  // ── Phase 3: 自我反思阶段（Loop）──
  onProgress && onProgress({ phase: 'reflection', message: '正在自我检查...' })

  const reflectionPrompt = `你是一个质量审查员。请检查以下交易教练的分析报告，判断是否有遗漏。

## 分析报告
${finalAnalysis}

## 用户复盘
${userMessage}

## 检查清单
1. 是否遗漏了用户提到的某个交易操作？
2. 是否忽略了用户自评中的关键信息？
3. 是否有"正确的废话"（如"注意控制风险"这种空话）？
4. 行为标签是否准确反映了用户的实际问题？
5. 改进建议是否可量化可检查？

如果分析已经足够好，回复："分析质量达标，无需补充。"
如果有遗漏，补充具体内容（不超过 200 字）。`

  const reflectionReply = await callAI([
    { role: 'system', content: '你是一个严格的质量审查员。只在确实有遗漏时才补充内容。' },
    { role: 'user', content: reflectionPrompt }
  ], { temperature: AGENT_CONFIG.REFLECTION_TEMPERATURE, max_tokens: 500 })

  reflections.push(reflectionReply)

  // 如果反思发现需要补充，拼接最终回复
  let reply = finalAnalysis
  const needsSupplement = reflectionReply
    && !reflectionReply.includes('无需补充')
    && !reflectionReply.includes('质量达标')
    && reflectionReply.length > 20

  if (needsSupplement) {
    reply = finalAnalysis + '\n\n---\n**补充说明**：' + reflectionReply
  }

  onProgress && onProgress({ phase: 'done', message: '分析完成' })

  return {
    reply,
    toolCalls,
    reflections,
    metadata: {
      toolsUsed: calls.map(c => c.name),
      reflectionApplied: needsSupplement,
      phases: calls.length > 0
        ? ['tools', 'analysis', 'reflection']
        : ['analysis', 'reflection']
    }
  }
}

module.exports = { runAgent, AGENT_CONFIG }
