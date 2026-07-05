const storage = require('../../utils/storage')
const { getTodayDate } = require('../../utils/date')
const { runAgent } = require('../../utils/agent')

const BASE_SYSTEM_PROMPT = `你叫"严正"，是一位严肃的交易教练。你不讲正确的废话，只讲交易者真正需要面对的真相。

## 你的风格
- 直击要害，不回避问题。如果用户连续犯同样的错，直接指出来。
- 结合用户的历史记录做纵向对比，而不是孤立评价今天的操作。
- 给出可执行的改进建议，而不是"注意控制风险"这种空话。
- 用交易者能懂的语言，不要教科书式的说教。
- 追问那些用户刻意回避的问题——真正的问题往往藏在"未执行计划"和"不符合计划"里。

## 分析框架
1. **行为对比**：对比用户近期的操作，有什么进步？有什么老毛病又犯了？交易频率、选股偏好、仓位节奏有什么变化？
2. **未执行计划的深挖**：用户说了但没做的事，比做了的事更能暴露问题。是害怕？犹豫？还是计划本身不合理？
3. **知行合一审计**：哪些交易符合计划？哪些是临场冲动？符合计划的比例是在提高还是下降？
4. **心法诊断**：用户当前最大的认知偏差是什么（过度自信/损失厌恶/处置效应/锚定效应/确认偏误/近因效应/羊群效应）？用今天的操作当证据。
5. **市场匹配度**：用户的操作方向和大盘实际走势是否一致？是在顺势而为还是在逆势对抗？

## 输出结构

### 对比诊断（2-3句话）
上次复盘到现在，你最大的变化是什么？什么老问题还在？

### 今日操作审计
- 符合计划的交易：逐一评价（逻辑、时机、仓位）
- 不符合计划的交易：指出冲动来源
- 未执行计划：追问真实原因，不要接受"忘了"这种解释

### 认知陷阱
指出当前最突出的一个行为金融学偏差，用今天的具体操作说明。告诉他如果继续这样会付出什么代价。

### 必须回答的问题
提2-3个用户必须在下一次复盘时回答的问题。这些问题应该让他不舒服——真正的好问题都是让人不舒服的。

### 改进清单
3条具体行动，每条都要可量化可检查。格式："下次[情境]时，[具体怎么做]，[如何验证做到了]"

### 今日金句
用一句话总结今天的教训，要能记住，下次交易前能想起来。

## 要求
- 字数：500-800字，精炼有力
- 不要"建议"买卖任何股票
- 不要堆砌概念，每个概念必须绑定用户的具体操作
- 如果用户的操作和上次一样但市场不同，重点分析"市场变了但你的方法没变"这个矛盾
- 如果缺少历史数据，专注于今天的操作即可，不要编造对比

## 输出标签
在回复最末尾加一行 JSON（不要 markdown 代码块，纯文本）：
__TAGS__:["标签1","标签2","标签3"]
标签从以下候选池选择，最多 3 个：
追涨、杀跌、止损拖延、止盈过早、过度交易、犹豫不决、锚定效应、
损失厌恶、过度自信、确认偏误、近因效应、羊群效应、计划缺失、
逆势操作、仓位失控、盘中冲动、报复交易、踏空焦虑
如果找不到匹配的，可以自定义一个简短的（不超过 6 个字）。`

Page({
  data: {
    reviewText: '',
    reviewXML: '',
    formData: null,
    aiReply: '',
    displayReply: '',
    loading: false,
    streaming: false,
    error: false,
    errorMsg: '',
    conversationId: null,
    messages: [],
    agentPhase: '',
    agentProgress: '',
    agentProgressPct: 0,
    toolCallsUsed: [],
    followUpQuestions: [],
    actionItems: [],
    milestones: [],
    reviewQualityScore: 0,
    reflectionPrompts: [],
    coachingStyle: 'balanced'
  },

  onLoad(options) {
    const reviewXML = decodeURIComponent(options.review || '')
    let formData = null
    try {
      const formDataStr = options.formData
      formData = formDataStr ? JSON.parse(decodeURIComponent(formDataStr)) : null
    } catch (e) {
      console.error('解析表单数据失败:', e)
    }
    const displayText = this.formatDisplayText(formData)

    const conversation = {
      id: String(Date.now()),
      date: getTodayDate(),
      timestamp: Date.now(),
      title: this.generateTitle(formData),
      messages: [{ role: 'user', content: displayText, time: Date.now() }],
      isArchived: false
    }

    this.setData({
      reviewText: displayText,
      reviewXML,
      formData,
      loading: true,
      conversationId: conversation.id,
      messages: conversation.messages,
      reviewQualityScore: this.scoreReviewQuality(formData),
      reflectionPrompts: this.getReflectionPrompts(formData),
      coachingStyle: this.detectCoachingStyle()
    })

    storage.saveConversation(conversation)
    this.getCoachReply(reviewXML, formData)
  },

  // ── 用户经验水平检测 ──
  getUserExperienceLevel() {
    const reviews = storage.getReviews().filter(r => !r.isDraft)
    if (reviews.length < 5) return 'beginner'
    if (reviews.length < 20) return 'intermediate'
    return 'advanced'
  },

  // ── 教练风格检测 ──
  detectCoachingStyle() {
    const reviews = storage.getReviews().filter(r => !r.isDraft)
    if (reviews.length < 3) return 'balanced'

    // 分析最近的改善趋势
    const recent = reviews.slice(-3)
    let improving = 0, declining = 0
    recent.forEach(r => {
      const tags = r.tags || []
      if (tags.some(t => ['追涨', '杀跌', '盘中冲动', '报复交易'].includes(t))) declining++
      else improving++
    })

    if (declining > improving) return 'firm' // 需要严厉
    if (improving > declining) return 'encouraging' // 可以鼓励
    return 'balanced'
  },

  // ── 复盘质量评分 ──
  scoreReviewQuality(formData) {
    if (!formData) return 0
    let score = 0
    if (formData.market) score += 15
    if (formData.theme) score += 10
    if (formData.buyList.some(b => b.stock)) score += 15
    if (formData.sellList.some(s => s.stock)) score += 10
    if (formData.buyList.some(b => b.reason && b.reason.length > 5)) score += 10
    if (formData.selfAssessment && formData.selfAssessment.length > 10) score += 15
    if (formData.tomorrow && formData.tomorrow.length > 5) score += 15
    if (formData.tomorrow && /如果.*就/.test(formData.tomorrow)) score += 10
    return Math.min(100, score)
  },

  // ── 反思提示 ──
  getReflectionPrompts(formData) {
    const prompts = []
    if (formData && formData.buyList.some(b => b.stock && !b.matchPlan)) {
      prompts.push('下次冲动买入前，先问自己：这在我的计划里吗？')
    }
    if (formData && formData.missedList.some(m => m.what)) {
      prompts.push('如果同样的机会再次出现，你会怎么做？')
    }
    prompts.push('如果这笔交易亏了，你的退出策略是什么？')
    prompts.push('你愿意为这笔交易承担多少亏损？')
    return prompts.slice(0, 3)
  },

  // ── 生成自适应 System Prompt ──
  getAdaptivePrompt() {
    const level = this.getUserExperienceLevel()
    const style = this.data.coachingStyle
    let adaptation = '\n\n## 用户画像\n'

    if (level === 'beginner') {
      adaptation += '- 新手交易者，重点讲基础概念和习惯养成\n- 语气温和但不失严肃，多鼓励正确行为\n- 避免过于复杂的术语\n'
    } else if (level === 'intermediate') {
      adaptation += '- 中级交易者，有一定经验但存在重复犯错\n- 重点识别行为模式和认知偏差\n- 挑战他们突破舒适区\n'
    } else {
      adaptation += '- 高级交易者，经验丰富\n- 重点在精细优化和心理层面\n- 可以使用专业术语，深入分析\n'
    }

    if (style === 'firm') {
      adaptation += '- 最近表现下滑，需要更直接的批评\n- 不要客气，直接指出问题\n'
    } else if (style === 'encouraging') {
      adaptation += '- 最近有进步，适当肯定但继续推动\n'
    }

    return BASE_SYSTEM_PROMPT + adaptation
  },

  // ── 生成跟进问题 ──
  generateFollowUpQuestions(aiReply, formData) {
    const questions = []
    if (formData && formData.buyList.some(b => b.stock && !b.matchPlan)) {
      questions.push('这笔计划外的买入，如果重来一次你还会做吗？')
    }
    if (formData && formData.missedList.some(m => m.what)) {
      questions.push('未执行的计划，真正阻止你的是什么？')
    }
    if (/追涨/.test(aiReply)) {
      questions.push('你追涨时的心理状态是什么？害怕踏空还是看到别人赚钱？')
    }
    if (/止损/.test(aiReply)) {
      questions.push('如果止损后股价又涨回来了，你下次还会执行止损吗？')
    }
    return questions.slice(0, 3)
  },

  // ── 提取行动项 ──
  extractActionItems(aiReply) {
    const items = []
    const patterns = [
      /下次([^，。\n]+[，,]([^，。\n]+))/g,
      /如果([^，。]+)[，,]就([^，。]+)/g
    ]
    patterns.forEach(pattern => {
      let match
      while ((match = pattern.exec(aiReply)) !== null) {
        items.push(match[0].trim())
      }
    })
    return items.slice(0, 5)
  },

  formatDisplayText(formData) {
    if (!formData) return ''
    const lines = []
    if (formData.market) { lines.push('【大盘记录】'); lines.push(formData.market) }
    if (formData.theme) { lines.push(''); lines.push('【题材与主线】'); lines.push(formData.theme) }

    const hasBuy = formData.buyList.some(b => b.stock)
    const hasSell = formData.sellList.some(s => s.stock)
    const hasMissed = formData.missedList.some(m => m.what)
    if (hasBuy || hasSell || hasMissed) { lines.push(''); lines.push('【知行合一】') }

    formData.buyList.forEach((item, i) => {
      if (item.stock) lines.push('买入' + (i + 1) + '：' + item.stock + (item.reason ? '（' + item.reason + '）' : ''))
    })
    formData.sellList.forEach((item, i) => {
      if (item.stock) lines.push('卖出' + (i + 1) + '：' + item.stock + (item.reason ? '（' + item.reason + '）' : ''))
    })
    formData.missedList.forEach((item, i) => {
      if (item.what) lines.push('未执行' + (i + 1) + '：' + item.what + (item.why ? ' — ' + item.why : ''))
    })

    if (formData.selfAssessment) { lines.push(''); lines.push('【自我评价】'); lines.push(formData.selfAssessment) }
    if (formData.tomorrow) { lines.push(''); lines.push('【明日If-Then计划】'); lines.push(formData.tomorrow) }

    return lines.join('\n') || '空复盘'
  },

  async getCoachReply(reviewText, formData) {
    const userMessage = reviewText

    try {
      const systemPrompt = this.getAdaptivePrompt()

      const agentResult = await runAgent({
        systemPrompt,
        userMessage,
        onProgress: ({ phase, progress, message }) => {
          this.setData({
            agentPhase: phase,
            agentProgress: message,
            agentProgressPct: progress || 0
          })
        }
      })

      const rawReply = agentResult.reply
      const tags = this.extractTags(rawReply)
      const cleanReply = rawReply.replace(/\n?__TAGS__\s*:.*$/, '')
      const toolCallsUsed = agentResult.metadata.toolsUsed

      // 生成跟进问题和行动项
      const followUpQuestions = this.generateFollowUpQuestions(cleanReply, formData)
      const actionItems = this.extractActionItems(cleanReply)

      const newMessage = { role: 'ai', content: cleanReply, time: Date.now() }
      const updatedMessages = [...this.data.messages, newMessage]

      this.setData({
        aiReply: cleanReply,
        loading: false,
        streaming: true,
        messages: updatedMessages,
        toolCallsUsed,
        agentPhase: 'done',
        agentProgressPct: 100,
        followUpQuestions,
        actionItems
      })

      this.typewriterEffect(cleanReply)

      const updatedConversation = {
        ...storage.getConversationById(this.data.conversationId),
        messages: updatedMessages
      }
      storage.saveConversation(updatedConversation)

      if (this.data.formData) {
        const pendingQuestions = this.parsePendingQuestions(rawReply)
        const review = {
          id: String(Date.now()),
          date: getTodayDate(),
          timestamp: Date.now(),
          formData: this.data.formData,
          aiReply: cleanReply,
          isDraft: false,
          conversationId: this.data.conversationId,
          pendingQuestions,
          tags,
          followUpQuestions,
          actionItems,
          reviewQualityScore: this.data.reviewQualityScore,
          coachingStyle: this.data.coachingStyle,
          agentMetadata: {
            totalTimeMs: agentResult.metadata.totalTimeMs,
            apiCallCount: agentResult.metadata.apiCallCount,
            toolCallsCount: agentResult.metadata.toolCallsCount,
            qualityScore: agentResult.metadata.qualityScore
          }
        }

        // 检查里程碑
        review.milestones = this.checkMilestones(review)

        storage.saveReview(review)
        storage.clearDraft()
      }
    } catch (err) {
      console.error('API调用失败:', err)
      this.setData({ loading: false, error: true, errorMsg: err.message })
      wx.showToast({ title: err.message, icon: 'none', duration: 3000 })
    }
  },

  // ── 里程碑检查 ──
  checkMilestones(review) {
    const milestones = []
    const reviews = storage.getReviews().filter(r => !r.isDraft)

    // 第一次复盘
    if (reviews.length === 0) {
      milestones.push({ type: 'first_review', message: '🎉 完成第一次复盘！坚持下去！' })
    }

    // 连续复盘
    const stats = require('../../utils/stats')
    const streak = stats.computeStreak(reviews)
    if (streak === 7) {
      milestones.push({ type: 'week_streak', message: '🔥 连续复盘7天！一周坚持不易！' })
    }
    if (streak === 30) {
      milestones.push({ type: 'month_streak', message: '🏆 连续复盘30天！你已经养成复盘习惯！' })
    }

    // 100%执行率
    let total = 0, planned = 0
    review.formData.buyList.forEach(b => { if (b.stock) { total++; if (b.matchPlan) planned++ } })
    review.formData.sellList.forEach(s => { if (s.stock) { total++; if (s.matchPlan) planned++ } })
    if (total > 0 && planned === total) {
      milestones.push({ type: 'perfect_adherence', message: '💯 今日计划执行率100%！知行合一！' })
    }

    return milestones
  },

  generateTitle(formData) {
    if (!formData) return '交易复盘'
    const parts = []
    const buyStocks = formData.buyList.filter(b => b.stock).map(b => b.stock)
    const sellStocks = formData.sellList.filter(s => s.stock).map(s => s.stock)
    if (buyStocks.length > 0) parts.push('买入 ' + buyStocks.join('、'))
    if (sellStocks.length > 0) parts.push('卖出 ' + sellStocks.join('、'))
    if (parts.length === 0) {
      if (formData.market) return '大盘分析'
      if (formData.theme) return '题材复盘'
      return '交易复盘'
    }
    return parts.join('  ')
  },

  parsePendingQuestions(aiReply) {
    try {
      const sectionMatch = aiReply.match(/###\s*必须回答的问题\s*\n([\s\S]*?)(?=\n###|$)/)
      if (!sectionMatch) return []
      const section = sectionMatch[1]
      const lines = section.split('\n').filter(l => l.trim())
      const questions = []
      lines.forEach(line => {
        const match = line.match(/^[\s]*(?:\d+[.、)\s]+|[-•]\s*)(.+)/)
        if (match && match[1].trim().length > 5) {
          questions.push({
            id: 'q' + Date.now() + '_' + questions.length,
            question: match[1].trim(),
            askedAt: Date.now(),
            answered: false
          })
        }
      })
      return questions.slice(0, 5)
    } catch (e) {
      return []
    }
  },

  extractTags(aiReply) {
    try {
      const match = aiReply.match(/__TAGS__\s*:\s*\[(.*?)\]/)
      if (!match) return []
      const tags = JSON.parse('[' + match[1] + ']')
      return tags.filter(t => typeof t === 'string' && t.length > 0 && t.length <= 6).slice(0, 3)
    } catch (e) {
      return []
    }
  },

  typewriterEffect(fullText) {
    let index = 0
    const speed = 20
    const chunkSize = 3
    const type = () => {
      if (index >= fullText.length) {
        this.setData({ streaming: false })
        return
      }
      index = Math.min(index + chunkSize, fullText.length)
      this.setData({ displayReply: fullText.substring(0, index) })
      this._typewriterTimer = setTimeout(type, speed)
    }
    type()
  },

  onUnload() {
    if (this._typewriterTimer) clearTimeout(this._typewriterTimer)
  },

  retryRequest() {
    this.setData({
      loading: true, error: false, errorMsg: '', aiReply: '',
      agentPhase: '', agentProgress: '', agentProgressPct: 0, toolCallsUsed: [],
      followUpQuestions: [], actionItems: []
    })
    this.getCoachReply(this.data.reviewXML, this.data.formData)
  },

  copyReply() {
    wx.setClipboardData({
      data: this.data.aiReply,
      success: () => wx.showToast({ title: '已复制', icon: 'success', duration: 1500 })
    })
  },

  onNewReview() {
    wx.navigateBack()
  }
})
