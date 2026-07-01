const storage = require('../../utils/storage')
const { generateShareText } = require('../../utils/export')

Page({
  data: {
    review: null
  },

  onLoad(options) {
    const id = options.id
    const review = storage.getReviewById(id)
    if (review) {
      this.setData({ review })
    } else {
      wx.showToast({
        title: '复盘记录不存在',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  onBack() {
    wx.navigateBack()
  },

  onShare() {
    if (!this.data.review) return
    const text = generateShareText(this.data.review)
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '已复制分享文本', icon: 'success' })
      }
    })
  },

  onEdit() {
    wx.navigateBack()
    setTimeout(() => {
      const pages = getCurrentPages()
      const prevPage = pages[pages.length - 1]
      prevPage.setData({
        editMode: true,
        editId: this.data.review.id
      })
      prevPage.loadReviewForEdit(this.data.review.id)
    }, 100)
  },

  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这条复盘吗？',
      success: (res) => {
        if (res.confirm) {
          storage.deleteReview(this.data.review.id)
          wx.showToast({
            title: '删除成功',
            icon: 'success'
          })
          setTimeout(() => {
            wx.navigateBack()
          }, 1500)
        }
      }
    })
  },

  markQuestionAnswered(e) {
    const questionId = e.currentTarget.dataset.qid
    const review = this.data.review
    if (!review.pendingQuestions) return

    const updatedQuestions = review.pendingQuestions.map(q =>
      q.id === questionId ? { ...q, answered: true } : q
    )
    const updatedReview = { ...review, pendingQuestions: updatedQuestions }
    storage.saveReview(updatedReview)
    this.setData({ review: updatedReview })

    wx.showToast({ title: '已标记', icon: 'success', duration: 1000 })
  }
})