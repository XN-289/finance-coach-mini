const storage = require('../../utils/storage')
const { getMarketSnapshot } = require('../../utils/market')

Page({
  data: {
    formData: {
      market: '',
      theme: '',
      buyList: [{ stock: '', reason: '', matchPlan: false }],
      sellList: [{ stock: '', reason: '', matchPlan: false }],
      missedList: [{ what: '', why: '' }],
      tomorrow: '',
      selfAssessment: ''
    },
    marketSummary: '',
    marketText: '',
    marketVol: '',
    showDrawer: false,
    reviews: [],
    periodReviews: [],
    conversations: [],
    hasDraft: false,
    editMode: false,
    editId: null,
    yesterdayPlans: [],
    yesterdayPlanDate: ''
  },

  onLoad(options) {
    if (options.id) {
      this.loadReviewForEdit(options.id)
    } else {
      this.checkDraft()
    }
    this.fetchMarketData()
    this.loadYesterdayPlans()
  },

  onShow() {
    this.loadHistory()
  },

  fetchMarketData() {
    getMarketSnapshot().then(result => {
      if (result) {
        const updateData = {
          marketSummary: result.text,
          marketText: result.text,
          marketVol: result.volLabel
        }
        // 非编辑模式且表单为空时自动预填
        if (!this.data.editMode) {
          if (!this.data.formData.market && result.fillText.market) {
            updateData['formData.market'] = result.fillText.market
          }
          if (!this.data.formData.theme && result.fillText.theme) {
            updateData['formData.theme'] = result.fillText.theme
          }
        }
        this.setData(updateData)
      }
    }).catch(() => {})
  },

  checkDraft() {
    const draft = storage.getDraft()
    if (draft && draft.formData) {
      this.setData({
        formData: draft.formData,
        hasDraft: true
      })
    }
  },

  loadYesterdayPlans() {
    // 编辑模式不显示昨日计划
    if (this.data.editMode) return

    const reviews = storage.getReviews()
      .filter(r => !r.isDraft)
      .sort((a, b) => b.timestamp - a.timestamp)

    if (reviews.length === 0) return

    const lastReview = reviews[0]
    const tomorrowPlan = lastReview.formData.tomorrow
    if (!tomorrowPlan || !tomorrowPlan.trim()) return

    const plans = this.parsePlans(tomorrowPlan, lastReview.date)
    if (plans.length === 0) return

    this.setData({
      yesterdayPlans: plans,
      yesterdayPlanDate: lastReview.date
    })
  },

  parsePlans(tomorrowText, date) {
    const lines = tomorrowText.split('\n').filter(l => l.trim())
    const plans = []
    let idCounter = 0

    lines.forEach(line => {
      const trimmed = line.trim()
      const isPlanLine = /^\d+[.、)\s]/.test(trimmed)
        || trimmed.startsWith('如果')
        || trimmed.includes('就')

      if (!isPlanLine) return

      const cleanText = trimmed.replace(/^\d+[.、)\s]+/, '').trim()

      const direction = this.guessDirection(cleanText)

      plans.push({
        id: 'plan_' + date + '_' + idCounter++,
        text: cleanText,
        direction,
        status: 'pending'
      })
    })

    return plans
  },

  guessDirection(planText) {
    const buyKeywords = ['买入', '建仓', '加仓', '抄底', '低吸', '开仓', '做多']
    const sellKeywords = ['卖出', '清仓', '减仓', '止盈', '止损', '平仓', '做空', '离场']

    for (const kw of buyKeywords) {
      if (planText.includes(kw)) return 'buy'
    }
    for (const kw of sellKeywords) {
      if (planText.includes(kw)) return 'sell'
    }
    return 'buy'
  },

  handlePlanTriggered(e) {
    const planId = e.currentTarget.dataset.id
    const plan = this.data.yesterdayPlans.find(p => p.id === planId)
    if (!plan) return

    if (plan.direction === 'buy') {
      const buyList = [...this.data.formData.buyList, {
        stock: '',
        reason: plan.text,
        matchPlan: true
      }]
      this.setData({ 'formData.buyList': buyList })
    } else {
      const sellList = [...this.data.formData.sellList, {
        stock: '',
        reason: plan.text,
        matchPlan: true
      }]
      this.setData({ 'formData.sellList': sellList })
    }

    this.markPlanResolved(planId, 'triggered')
    this.autoSaveDraft()
  },

  handlePlanMissed(e) {
    const planId = e.currentTarget.dataset.id
    const plan = this.data.yesterdayPlans.find(p => p.id === planId)
    if (!plan) return

    const missedList = [...this.data.formData.missedList, {
      what: plan.text,
      why: ''
    }]
    this.setData({ 'formData.missedList': missedList })

    this.markPlanResolved(planId, 'missed')
    this.autoSaveDraft()
  },

  markPlanResolved(planId, resolvedStatus) {
    const plans = this.data.yesterdayPlans.map(p =>
      p.id === planId ? { ...p, status: resolvedStatus } : p
    )
    const allResolved = plans.every(p => p.status !== 'pending')
    this.setData({
      yesterdayPlans: allResolved ? [] : plans
    })
  },

  restoreDraft() {
    const draft = storage.getDraft()
    if (draft && draft.formData) {
      this.setData({
        formData: draft.formData,
        hasDraft: false
      })
      storage.clearDraft()
    }
  },

  clearDraft() {
    storage.clearDraft()
    this.setData({ hasDraft: false })
  },

  saveCurrentDraft() {
    storage.saveDraft(this.data.formData)
    this.setData({ hasDraft: true })
  },

  loadHistory() {
    const reviews = storage.getReviews()
    const periodReviews = storage.getPeriodReviews()
    const conversations = storage.getConversations()

    reviews.sort((a, b) => b.timestamp - a.timestamp)
    periodReviews.sort((a, b) => b.timestamp - a.timestamp)

    this.setData({
      reviews: reviews.map(r => ({
        ...r,
        summary: this.getSummary(r)
      })),
      periodReviews: periodReviews,
      conversations: conversations.filter(c => !c.isArchived).sort((a, b) => b.timestamp - a.timestamp)
    })
  },

  getSummary(review) {
    const parts = []
    if (review.formData.market) parts.push('大盘')
    if (review.formData.theme) parts.push('题材')
    if (review.formData.buyList.length > 0 && review.formData.buyList[0].stock) {
      parts.push(`买入${review.formData.buyList.length}只`)
    }
    if (review.formData.sellList.length > 0 && review.formData.sellList[0].stock) {
      parts.push(`卖出${review.formData.sellList.length}只`)
    }
    return parts.join(' | ') || '空复盘'
  },

  loadReviewForEdit(id) {
    const review = storage.getReviewById(id)
    if (review) {
      this.setData({
        formData: review.formData,
        editMode: true,
        editId: id,
        hasDraft: false
      })
    }
  },

  toggleDrawer() {
    this.setData({
      showDrawer: !this.data.showDrawer
    })
    if (!this.data.showDrawer) {
      this.loadHistory()
    }
  },

  goToPeriod() {
    wx.navigateTo({
      url: '/pages/period/period'
    })
    this.setData({ showDrawer: false })
  },

  viewReview(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ showDrawer: false })
    wx.navigateTo({
      url: `/pages/history/history?id=${id}`
    })
  },

  viewPeriodReview(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ showDrawer: false })
    wx.navigateTo({
      url: `/pages/period/period?id=${id}`
    })
  },

  editReview(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ showDrawer: false })
    this.loadReviewForEdit(id)
  },

  confirmDelete(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ showDrawer: false })
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这条复盘吗？',
      success: (res) => {
        if (res.confirm) {
          storage.deleteReview(id)
          this.loadHistory()
        }
      }
    })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    const index = e.currentTarget.dataset.index

    if (field.includes('.')) {
      const [parent, child] = field.split('.')
      if (index !== undefined) {
        this.setData({
          [`formData.${parent}[${index}].${child}`]: value
        })
      }
    } else {
      this.setData({
        [`formData.${field}`]: value
      })
    }

    this.autoSaveDraft()
  },

  onSwitch(e) {
    const field = e.currentTarget.dataset.field
    const checked = e.detail.value
    const index = e.currentTarget.dataset.index

    if (index !== undefined) {
      const [parent, child] = field.split('.')
      const list = this.data.formData[parent]
      if (list && list[index]) {
        this.setData({
          [`formData.${parent}[${index}].${child}`]: checked
        })
      }
    }

    this.autoSaveDraft()
  },

  addBuy() {
    const buyList = [...this.data.formData.buyList, { stock: '', reason: '', matchPlan: false }]
    this.setData({ 'formData.buyList': buyList })
    this.autoSaveDraft()
  },

  deleteBuy(e) {
    const index = e.currentTarget.dataset.index
    const buyList = this.data.formData.buyList.filter((_, i) => i !== index)
    this.setData({ 'formData.buyList': buyList })
    this.autoSaveDraft()
  },

  addSell() {
    const sellList = [...this.data.formData.sellList, { stock: '', reason: '', matchPlan: false }]
    this.setData({ 'formData.sellList': sellList })
    this.autoSaveDraft()
  },

  deleteSell(e) {
    const index = e.currentTarget.dataset.index
    const sellList = this.data.formData.sellList.filter((_, i) => i !== index)
    this.setData({ 'formData.sellList': sellList })
    this.autoSaveDraft()
  },

  addMissed() {
    const missedList = [...this.data.formData.missedList, { what: '', why: '' }]
    this.setData({ 'formData.missedList': missedList })
    this.autoSaveDraft()
  },

  deleteMissed(e) {
    const index = e.currentTarget.dataset.index
    const missedList = this.data.formData.missedList.filter((_, i) => i !== index)
    this.setData({ 'formData.missedList': missedList })
    this.autoSaveDraft()
  },

  autoSaveDraft() {
    if (this._saveTimer) clearTimeout(this._saveTimer)
    this._saveTimer = setTimeout(() => {
      storage.saveDraft(this.data.formData)
    }, 500)
  },

  onSubmit() {
    const { formData, editMode, editId } = this.data

    if (editMode && editId) {
      const existingReview = storage.getReviewById(editId)
      const updatedReview = {
        ...existingReview,
        formData: formData,
        isDraft: false
      }
      storage.saveReview(updatedReview)
      storage.clearDraft()

      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      setTimeout(() => {
        this.setData({
          editMode: false,
          editId: null,
          formData: {
            market: '',
            theme: '',
            buyList: [{ stock: '', reason: '', matchPlan: false }],
            sellList: [{ stock: '', reason: '', matchPlan: false }],
            missedList: [{ what: '', why: '' }],
            tomorrow: '',
            selfAssessment: ''
          }
        })
      }, 1500)
    } else {
      const reviewXML = this.formatReviewXML(formData)
      wx.navigateTo({
        url: `/pages/coach/coach?review=${encodeURIComponent(reviewXML)}&formData=${encodeURIComponent(JSON.stringify(formData))}`
      })
    }
  },

  formatReviewXML(data) {
    let xml = '<review>\n'

    // 市场数据
    if (this.data.marketText) {
      xml += `  <marketData>${this.escapeXml(this.data.marketText)}</marketData>\n`
    }

    // 大盘记录
    if (data.market) {
      xml += `  <market>${this.escapeXml(data.market)}</market>\n`
    }

    // 题材与主线
    if (data.theme) {
      xml += `  <theme>${this.escapeXml(data.theme)}</theme>\n`
    }

    // 交易动作
    xml += '  <actions>\n'

    // 买入记录
    data.buyList.forEach(item => {
      if (item.stock) {
        xml += `    <buy stock="${this.escapeXml(item.stock)}" planned="${item.matchPlan ? 'yes' : 'no'}" reason="${this.escapeXml(item.reason)}" />\n`
      }
    })

    // 卖出记录
    data.sellList.forEach(item => {
      if (item.stock) {
        xml += `    <sell stock="${this.escapeXml(item.stock)}" planned="${item.matchPlan ? 'yes' : 'no'}" reason="${this.escapeXml(item.reason)}" />\n`
      }
    })

    // 未执行计划
    data.missedList.forEach(item => {
      if (item.what) {
        xml += `    <missed plan="${this.escapeXml(item.what)}" why="${this.escapeXml(item.why)}" />\n`
      }
    })

    xml += '  </actions>\n'

    // 自我评价
    if (data.selfAssessment) {
      xml += `  <selfAssessment>${this.escapeXml(data.selfAssessment)}</selfAssessment>\n`
    }

    // 明日If-Then计划
    if (data.tomorrow) {
      xml += `  <plan>${this.escapeXml(data.tomorrow)}</plan>\n`
    }

    xml += '</review>'
    return xml
  },

  escapeXml(text) {
    if (!text) return ''
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  },

  viewConversation(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ showDrawer: false })
    wx.navigateTo({
      url: `/pages/conversation/conversation?id=${id}`
    })
  },

  filterArchived() {
    const conversations = storage.getConversations().filter(c => c.isArchived)
    this.setData({
      showDrawer: false,
      conversations: conversations
    })
  },

  importFromMissed() {
    const { missedList } = this.data.formData

    if (!missedList || missedList.length === 0) {
      wx.showToast({
        title: '请先填写未执行计划',
        icon: 'none'
      })
      return
    }

    // 构建明日计划内容
    let tomorrowPlan = ''

    missedList.forEach((item, index) => {
      if (item.what) {
        // 将"原计划是什么"转换为"如果...就..."
        const action = this.extractActionFromPlan(item.what)
        const condition = this.extractConditionFromPlan(item.what)

        if (action && condition) {
          tomorrowPlan += `${index + 1}. 如果${condition}，就${action}\n`
        }
      }
    })

    if (tomorrowPlan) {
      // 合并到现有的明日计划
      const existingPlan = this.data.formData.tomorrow
      const finalPlan = existingPlan ? `${existingPlan}\n\n${tomorrowPlan}` : tomorrowPlan

      this.setData({
        'formData.tomorrow': finalPlan
      })

      this.autoSaveDraft()

      wx.showToast({
        title: '导入成功',
        icon: 'success'
      })
    } else {
      wx.showToast({
        title: '未能识别到有效计划',
        icon: 'none'
      })
    }
  },

  extractActionFromPlan(planText) {
    // 从计划文本中提取行动
    const actions = ['买入', '卖出', '建仓', '清仓', '减仓', '加仓', '观望', '等待', '止损', '止盈']
    for (const action of actions) {
      if (planText.includes(action)) {
        return action
      }
    }
    return '执行计划'
  },

  extractConditionFromPlan(planText) {
    // 从计划文本中提取条件
    const patterns = [
      /(\d+\.\d+)/g,  // 价格条件
      /突破([^，。]+)/g,  // 突破条件
      /回调([^，。]+)/g,  // 回调条件
      /放量([^，。]+)/g,  // 放量条件
      /站稳([^，。]+)/g,  // 站稳条件
      /跌破([^，。]+)/g,  // 跌破条件
    ]

    for (const pattern of patterns) {
      const match = planText.match(pattern)
      if (match) {
        return match[1] || match[0]
      }
    }

    // 如果没有特定条件，返回通用条件
    if (planText.includes('买入')) return '机会出现'
    if (planText.includes('卖出')) return '目标达成'
    return '条件满足'
  },

  showPlanHelp() {
    wx.showModal({
      title: '填写指导',
      content: `【原计划是什么】
• 写清楚具体的交易计划
• 例如："计划在10.5买入XX股票，等待突破"
• 包含：动作对象+条件时机+目标预期

【为什么没有执行】
• 诚实地面对内心真实想法
• 心理因素：害怕踏空/害怕套牢/犹豫不决/心存侥幸
• 市场变化：突发消息/快速波动/指标失效
• 个人判断：逻辑分析/信息不足/经验欠缺

【明日If-Then计划】
• 格式：如果[条件]，就[行动]
• 例如："如果XX回调到10.2，就买入2000股"
• 确保条件和行动一一对应`,
      showCancel: false,
      confirmText: '我知道了'
    })
  }
})
