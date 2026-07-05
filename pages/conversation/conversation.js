const storage = require('../../utils/storage')
const { formatTime } = require('../../utils/date')

Page({
  data: {
    conversation: null,
    scrollToView: ''
  },

  onLoad(options) {
    const id = options.id
    const conversation = storage.getConversationById(id)
    if (conversation) {
      this.setData({ conversation })
      setTimeout(() => {
        this.setData({ scrollToView: `msg-${conversation.messages[conversation.messages.length - 1].time}` })
      }, 100)
    } else {
      wx.showToast({ title: '对话不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  onBack() {
    wx.navigateBack()
  },

  deleteConversation() {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这条对话吗？',
      success: (res) => {
        if (res.confirm) {
          storage.deleteConversation(this.data.conversation.id)
          wx.showToast({ title: '删除成功', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 1500)
        }
      }
    })
  },

  archiveConversation() {
    storage.archiveConversation(this.data.conversation.id)
    this.setData({
      conversation: { ...this.data.conversation, isArchived: true }
    })
    wx.showToast({ title: '已归档', icon: 'success' })
  },

  unarchiveConversation() {
    const updatedConversation = { ...this.data.conversation, isArchived: false }
    storage.saveConversation(updatedConversation)
    this.setData({ conversation: updatedConversation })
    wx.showToast({ title: '已取消归档', icon: 'success' })
  },

  formatTime(timestamp) {
    return formatTime(timestamp)
  },

  copyConversation() {
    if (!this.data.conversation) return
    const text = this.data.conversation.messages.map(m => {
      const role = m.role === 'user' ? '用户' : 'AI教练'
      return '[' + role + ']\n' + m.content
    }).join('\n\n---\n\n')
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    })
  }
})
