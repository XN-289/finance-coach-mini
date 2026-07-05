/**
 * 教练状态管理器 — 教练的"笔记本"
 *
 * 这是 AI Agentic 的核心。不是工具多，而是教练"记得"。
 *
 * 持久化存储：
 * - coachingNotebook: 教练的跨会话记忆
 *   - focusAreas: 当前重点改善的行为（最多3个）
 *   - openPromises: 用户承诺但未兑现的行动项
 *   - adviceHistory: 教练给过的建议及其效果
 *   - behavioralArcs: 行为弧线（某个问题的起承转合）
 *   - coachingStyleLog: 每次使用的教练风格及效果
 *   - lastSessionSummary: 上次会话摘要
 */

const COACHING_STATE_KEY = 'coachingNotebook'

/**
 * 获取教练笔记本（不存在则初始化）
 */
function getCoachingNotebook() {
  try {
    const stored = wx.getStorageSync(COACHING_STATE_KEY)
    if (stored) return stored
  } catch (e) {}
  return initNotebook()
}

/**
 * 初始化空白笔记本
 */
function initNotebook() {
  const notebook = {
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),

    // 当前教练焦点：正在帮用户改什么
    focusAreas: [],

    // 用户承诺但未完成的行动项
    openPromises: [],

    // 教练建议历史：{ id, advice, givenAt, reviewId, status, outcome }
    adviceHistory: [],

    // 行为弧线：追踪某个行为标签的生命周期
    // { tag, firstSeen, lastSeen, sessions[], status: 'active'|'improved'|'relapsed' }
    behavioralArcs: [],

    // 教练风格日志：{ style, reviewId, timestamp, userImproved: null|true|false }
    coachingStyleLog: [],

    // 上次会话的关键信息
    lastSessionSummary: null,

    // 用户对教练的反馈统计
    feedbackStats: { helpful: 0, notHelpful: 0, tooHarsh: 0, tooSoft: 0 }
  }
  saveNotebook(notebook)
  return notebook
}

/**
 * 保存笔记本
 */
function saveNotebook(notebook) {
  notebook.updatedAt = Date.now()
  try {
    wx.setStorageSync(COACHING_STATE_KEY, notebook)
  } catch (e) {}
}

/**
 * 在一次教练会话结束后更新笔记本
 *
 * @param {Object} sessionData - 会话数据
 * @param {string} sessionData.reviewId - 复盘 ID
 * @param {string} sessionData.aiReply - AI 回复内容
 * @param {string[]} sessionData.tags - 提取的行为标签
 * @param {string[]} sessionData.actionItems - 提取的行动项
 * @param {string[]} sessionData.pendingQuestions - 未回答的追问
 * @param {string} sessionData.coachingStyle - 使用的教练风格
 * @param {Object} sessionData.formData - 用户表单数据
 */
function updateAfterSession(sessionData) {
  const notebook = getCoachingNotebook()
  const now = Date.now()

  // 1. 更新会话摘要
  notebook.lastSessionSummary = {
    reviewId: sessionData.reviewId,
    date: new Date().toISOString().split('T')[0],
    tags: sessionData.tags || [],
    keyFindings: extractKeyFindings(sessionData.aiReply),
    actionItems: sessionData.actionItems || [],
    pendingQuestions: sessionData.pendingQuestions || [],
    coachingStyle: sessionData.coachingStyle,
    timestamp: now
  }

  // 2. 更新行为弧线
  updateBehavioralArcs(notebook, sessionData.tags || [], sessionData.reviewId, now)

  // 3. 更新焦点区域
  updateFocusAreas(notebook, sessionData.tags || [])

  // 4. 注册新的行动项（如果 AI 提取到了新的）
  registerNewPromises(notebook, sessionData.actionItems || [], sessionData.reviewId, now)

  // 5. 记录教练风格
  notebook.coachingStyleLog.push({
    style: sessionData.coachingStyle || 'balanced',
    reviewId: sessionData.reviewId,
    timestamp: now,
    userImproved: null // 待下次会话验证
  })
  // 只保留最近 20 条
  if (notebook.coachingStyleLog.length > 20) {
    notebook.coachingStyleLog = notebook.coachingStyleLog.slice(-20)
  }

  saveNotebook(notebook)
  return notebook
}

/**
 * 从 AI 回复中提取关键发现（截取前200字作为摘要）
 */
function extractKeyFindings(aiReply) {
  if (!aiReply) return ''
  // 取"对比诊断"或"今日操作审计"段落
  const sections = aiReply.split('###')
  for (const section of sections) {
    if (/对比诊断|今日操作审计|认知陷阱/.test(section)) {
      return section.replace(/^[^\n]*\n/, '').trim().substring(0, 200)
    }
  }
  return aiReply.substring(0, 200)
}

/**
 * 更新行为弧线
 *
 * 核心逻辑：
 * - 标签首次出现 → 创建新弧线
 * - 标签再次出现 → 更新弧线，记录连续出现
 * - 标签消失 → 标记为 improved
 * - 标签消失后再次出现 → 标记为 relapsed（复发）
 */
function updateBehavioralArcs(notebook, newTags, reviewId, now) {
  const arcs = notebook.behavioralArcs

  // 标记所有现有弧线本轮是否出现
  const appearedThisSession = new Set(newTags)

  arcs.forEach(arc => {
    if (appearedThisSession.has(arc.tag)) {
      // 这个标签本轮出现了
      arc.lastSeen = now
      arc.sessions.push({ reviewId, timestamp: now, appeared: true })

      if (arc.status === 'improved') {
        // 复发！
        arc.status = 'relapsed'
        arc.relapsedAt = now
      } else if (arc.status === 'relapsed') {
        // 持续复发中
      } else {
        // 持续活跃
        arc.status = 'active'
      }
    } else {
      // 这个标签本轮没出现
      arc.sessions.push({ reviewId, timestamp: now, appeared: false })

      // 检查最近 3 次是否都没出现 → 标记为改善
      const recentSessions = arc.sessions.slice(-3)
      if (recentSessions.length >= 2 && recentSessions.every(s => !s.appeared)) {
        if (arc.status === 'active' || arc.status === 'relapsed') {
          arc.status = 'improved'
          arc.improvedAt = now
        }
      }
    }

    // 只保留最近 20 次会话记录
    if (arc.sessions.length > 20) {
      arc.sessions = arc.sessions.slice(-20)
    }
  })

  // 新标签 → 创建新弧线
  newTags.forEach(tag => {
    if (!arcs.find(a => a.tag === tag)) {
      arcs.push({
        tag,
        firstSeen: now,
        lastSeen: now,
        sessions: [{ reviewId, timestamp: now, appeared: true }],
        status: 'active'
      })
    }
  })

  // 清理过老的弧线（超过 60 天没出现的）
  const cutoff = now - 60 * 24 * 60 * 60 * 1000
  notebook.behavioralArcs = arcs.filter(arc => {
    if (arc.status === 'improved' && arc.lastSeen < cutoff) return false
    return true
  })
}

/**
 * 更新焦点区域
 *
 * 逻辑：
 * - 活跃的行为弧线自动成为焦点候选
 * - 按最近出现频率排序
 * - 最多保留 3 个焦点
 */
function updateFocusAreas(notebook, newTags) {
  const activeArcs = notebook.behavioralArcs
    .filter(a => a.status === 'active' || a.status === 'relapsed')
    .sort((a, b) => b.lastSeen - a.lastSeen)

  notebook.focusAreas = activeArcs.slice(0, 3).map(arc => ({
    tag: arc.tag,
    status: arc.status,
    since: arc.firstSeen,
    sessions: arc.sessions.length,
    isRelapse: arc.status === 'relapsed'
  }))
}

/**
 * 注册新的行动承诺
 */
function registerNewPromises(notebook, actionItems, reviewId, now) {
  actionItems.forEach(item => {
    // 检查是否已存在（避免重复）
    const exists = notebook.openPromises.find(p =>
      p.text === item && p.status === 'pending'
    )
    if (!exists) {
      notebook.openPromises.push({
        id: 'promise_' + now + '_' + Math.random().toString(36).substr(2, 4),
        text: item,
        reviewId,
        createdAt: now,
        status: 'pending', // pending | completed | missed | deferred
        completedAt: null,
        completionEvidence: null
      })
    }
  })

  // 只保留最近 15 个未完成的承诺
  const pending = notebook.openPromises.filter(p => p.status === 'pending')
  if (pending.length > 15) {
    // 把最老的标记为 missed
    const toMiss = pending.slice(0, pending.length - 15)
    toMiss.forEach(p => {
      p.status = 'missed'
    })
  }
}

/**
 * 标记行动项完成
 */
function markPromiseCompleted(promiseId, evidence) {
  const notebook = getCoachingNotebook()
  const promise = notebook.openPromises.find(p => p.id === promiseId)
  if (promise) {
    promise.status = 'completed'
    promise.completedAt = Date.now()
    promise.completionEvidence = evidence || ''
    saveNotebook(notebook)
  }
}

/**
 * 标记行动项未完成
 */
function markPromiseMissed(promiseId) {
  const notebook = getCoachingNotebook()
  const promise = notebook.openPromises.find(p => p.id === promiseId)
  if (promise) {
    promise.status = 'missed'
    saveNotebook(notebook)
  }
}

/**
 * 记录用户对教练的反馈
 */
function recordFeedback(type) {
  const notebook = getCoachingNotebook()
  if (notebook.feedbackStats[type] !== undefined) {
    notebook.feedbackStats[type]++
    saveNotebook(notebook)
  }
}

/**
 * 获取教练需要跟进的内容（注入到下一次会话的 prompt）
 */
function getCoachingContext() {
  const notebook = getCoachingNotebook()
  const parts = []

  // 1. 上次会话摘要
  if (notebook.lastSessionSummary) {
    const last = notebook.lastSessionSummary
    parts.push('## 上次教练会话（' + last.date + '）')
    if (last.keyFindings) {
      parts.push('关键发现：' + last.keyFindings)
    }
    if (last.tags.length > 0) {
      parts.push('行为标签：' + last.tags.join('、'))
    }
  }

  // 2. 未完成的行动承诺
  const pendingPromises = notebook.openPromises.filter(p => p.status === 'pending')
  if (pendingPromises.length > 0) {
    parts.push('\n## 用户未兑现的承诺')
    pendingPromises.forEach((p, i) => {
      const daysSince = Math.floor((Date.now() - p.createdAt) / (24 * 60 * 60 * 1000))
      parts.push((i + 1) + '. ' + p.text + '（提出于 ' + daysSince + ' 天前，尚未完成）')
    })
  }

  // 3. 焦点区域（正在改善的行为）
  if (notebook.focusAreas.length > 0) {
    parts.push('\n## 当前教练焦点')
    notebook.focusAreas.forEach(f => {
      const statusText = f.isRelapse ? '⚠️ 复发' : f.status === 'active' ? '🔴 活跃' : '🟢 改善中'
      parts.push('- ' + f.tag + '：' + statusText + '（已追踪 ' + f.sessions + ' 次会话）')
    })
  }

  // 4. 复发的行为（需要特别关注）
  const relapsedArcs = notebook.behavioralArcs.filter(a => a.status === 'relapsed')
  if (relapsedArcs.length > 0) {
    parts.push('\n## ⚠️ 复发的行为模式')
    relapsedArcs.forEach(arc => {
      const improvedSessions = arc.sessions.filter(s => !s.appeared).length
      parts.push('- ' + arc.tag + '：之前改善了 ' + improvedSessions + ' 次会话，现在又出现了')
    })
  }

  // 5. 教练风格效果
  if (notebook.coachingStyleLog.length >= 3) {
    const recentStyles = notebook.coachingStyleLog.slice(-5)
    const improvedStyles = recentStyles.filter(s => s.userImproved === true)
    const notImprovedStyles = recentStyles.filter(s => s.userImproved === false)

    if (improvedStyles.length > 0 || notImprovedStyles.length > 0) {
      parts.push('\n## 教练风格效果')
      if (improvedStyles.length > 0) {
        parts.push('用户对以下风格反应积极：' + improvedStyles.map(s => s.style).join('、'))
      }
      if (notImprovedStyles.length > 0) {
        parts.push('以下风格效果不佳：' + notImprovedStyles.map(s => s.style).join('、'))
      }
    }
  }

  // 6. 反馈统计
  const fb = notebook.feedbackStats
  const totalFeedback = fb.helpful + fb.notHelpful + fb.tooHarsh + fb.tooSoft
  if (totalFeedback >= 3) {
    parts.push('\n## 用户反馈倾向')
    if (fb.tooHarsh > fb.tooSoft) parts.push('- 用户偏好温和风格，减少过于严厉的措辞')
    if (fb.tooSoft > fb.tooHarsh) parts.push('- 用户偏好直接风格，可以更严厉')
    if (fb.helpful > fb.notHelpful * 2) parts.push('- 当前分析风格受到认可')
  }

  return parts.join('\n')
}

/**
 * 获取需要在首页展示的教练提醒
 */
function getCoachingReminders() {
  const notebook = getCoachingNotebook()
  const reminders = []

  // 未兑现的承诺
  const pendingPromises = notebook.openPromises.filter(p => p.status === 'pending')
  if (pendingPromises.length > 0) {
    const oldest = pendingPromises[0]
    const daysSince = Math.floor((Date.now() - oldest.createdAt) / (24 * 60 * 60 * 1000))
    if (daysSince >= 2) {
      reminders.push({
        type: 'promise',
        priority: 'high',
        message: '教练提醒：' + daysSince + '天前你说要"' + oldest.text.substring(0, 20) + '..."，做到了吗？',
        promiseId: oldest.id
      })
    }
  }

  // 复发的行为
  const relapsed = notebook.behavioralArcs.filter(a => a.status === 'relapsed')
  if (relapsed.length > 0) {
    reminders.push({
      type: 'relapse',
      priority: 'high',
      message: '⚠️ 旧习惯复发："' + relapsed[0].tag + '"又出现了，今天复盘时注意',
      tag: relapsed[0].tag
    })
  }

  return reminders
}

/**
 * 检查行为标签是否是"复发"（消失后再次出现）
 * @returns {Object|null} 复发信息，或 null
 */
function checkForRelapse(tag) {
  const notebook = getCoachingNotebook()
  const arc = notebook.behavioralArcs.find(a => a.tag === tag)
  if (arc && arc.status === 'relapsed') {
    const improvedSessions = arc.sessions.filter(s => !s.appeared).length
    return {
      tag,
      improvedSessions,
      message: '你已经' + improvedSessions + '次会话没有出现"' + tag + '"了，今天又出现了。发生了什么？'
    }
  }
  return null
}

/**
 * 验证教练风格效果
 * 在下次会话开始时调用，检查上次的风格是否有效
 */
function validateLastStyleEffect(currentTags) {
  const notebook = getCoachingNotebook()
  if (notebook.coachingStyleLog.length === 0) return

  const lastLog = notebook.coachingStyleLog[notebook.coachingStyleLog.length - 1]
  if (lastLog.userImproved !== null) return // 已经验证过了

  // 简单判断：如果上次的焦点标签这次没出现，说明改善了
  if (notebook.lastSessionSummary && notebook.lastSessionSummary.tags) {
    const lastTags = notebook.lastSessionSummary.tags
    const improved = lastTags.some(t => !currentTags.includes(t))
    lastLog.userImproved = improved
    saveNotebook(notebook)
  }
}

module.exports = {
  getCoachingNotebook,
  updateAfterSession,
  markPromiseCompleted,
  markPromiseMissed,
  recordFeedback,
  getCoachingContext,
  getCoachingReminders,
  checkForRelapse,
  validateLastStyleEffect,
  saveNotebook
}
