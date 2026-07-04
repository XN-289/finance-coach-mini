const storage = require('../../utils/storage')
const { getTodayDate } = require('../../utils/date')
const { runAgent } = require('../../utils/agent')

const SYSTEM_PROMPT = `你叫"严正"，是一位严肃的交易教练。你不讲正确的废话，只讲交易者真正需要面对的真相。

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
    toolCallsUsed: []
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
      messages: [{
        role: 'user',
        content: displayText,
        time: Date.now()
      }],
      isArchived: false
    }

    this.setData({
      reviewText: displayText,
      reviewXML,
      formData,
      loading: true,
      conversationId: conversation.id,
      messages: conversation.messages
    })

    storage.saveConversation(conversation)
    this.getCoachReply(reviewXML, formData)
  },

  formatDisplayText(formData) {
    if (!formData) return ''

    const lines = []

    if (formData.market) {
      lines.push('【大盘记录】')
      lines.push(formData.market)
    }

    if (formData.theme) {
      lines.push('')
      lines.push('【题材与主线】')
      lines.push(formData.theme)
    }

    const hasBuy = formData.buyList.some(b => b.stock)
    const hasSell = formData.sellList.some(s => s.stock)
    const hasMissed = formData.missedList.some(m => m.what)

    if (hasBuy || hasSell || hasMissed) {
      lines.push('')
      lines.push('【知行合一】')
    }

    formData.buyList.forEach((item, i) => {
      if (item.stock) {
        lines.push(`买入${i + 1}：${item.stock}` + (item.reason ? `（${item.reason}）` : ''))
      }
    })

    formData.sellList.forEach((item, i) => {
      if (item.stock) {
        lines.push(`卖出${i + 1}：${item.stock}` + (item.reason ? `（${item.reason}）` : ''))
      }
    })

    formData.missedList.forEach((item, i) => {
      if (item.what) {
        lines.push(`未执行${i + 1}：${item.what}` + (item.why ? ` — ${item.why}` : ''))
      }
    })

    if (formData.selfAssessment) {
      lines.push('')
      lines.push('【自我评价】')
      lines.push(formData.selfAssessment)
    }

    if (formData.tomorrow) {
      lines.push('')
      lines.push('【明日If-Then计划】')
      lines.push(formData.tomorrow)
    }

    return lines.join('\n') || '空复盘'
  },

  async getCoachReply(reviewText, formData) {
    const userMessage = reviewText

    try {
      const agentResult = await runAgent({
        systemPrompt: SYSTEM_PROMPT,
        userMessage,
        onProgress: ({ phase, message }) => {
          this.setData({ agentPhase: phase, agentProgress: message })
        }
      })

      const rawReply = agentResult.reply
      const tags = this.extractTags(rawReply)
      const cleanReply = rawReply.replace(/\n?__TAGS__\s*:.*$/, '')
      const toolCallsUsed = agentResult.metadata.toolsUsed

      const newMessage = {
        role: 'ai',
        content: cleanReply,
        time: Date.now()
      }

      const updatedMessages = [...this.data.messages, newMessage]

      this.setData({
        aiReply: cleanReply,
        loading: false,
        streaming: true,
        messages: updatedMessages,
        toolCallsUsed,
        agentPhase: 'done'
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
          tags
        }
        storage.saveReview(review)
        storage.clearDraft()
      }
    } catch (err) {
      console.error('API调用失败:', err)
      this.setData({
        loading: false,
        error: true,
        errorMsg: err.message
      })
      wx.showToast({
        title: err.message,
        icon: 'none',
        duration: 3000
      })
    }
  },

  generateTitle(formData) {
    if (!formData) return '交易复盘'

    const parts = []
    const buyStocks = formData.buyList
      .filter(b => b.stock)
      .map(b => b.stock)
    const sellStocks = formData.sellList
      .filter(s => s.stock)
      .map(s => s.stock)

    if (buyStocks.length > 0) parts.push(`买入 ${buyStocks.join('、')}`)
    if (sellStocks.length > 0) parts.push(`卖出 ${sellStocks.join('、')}`)
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
    if (this._typewriterTimer) {
      clearTimeout(this._typewriterTimer)
    }
  },

  retryRequest() {
    this.setData({
      loading: true,
      error: false,
      errorMsg: '',
      aiReply: '',
      agentPhase: '',
      agentProgress: '',
      toolCallsUsed: []
    })
    this.getCoachReply(this.data.reviewXML, this.data.formData)
  },

  copyReply() {
    wx.setClipboardData({
      data: this.data.aiReply,
      success: () => {
        wx.showToast({
          title: '已复制',
          icon: 'success',
          duration: 1500
        })
      }
    })
  },

  onNewReview() {
    wx.navigateBack()
  }
})
