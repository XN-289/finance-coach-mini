const KEYS = {
  REVIEWS: 'reviews',
  PERIOD_REVIEWS: 'periodReviews',
  CONVERSATIONS: 'conversations',
  DRAFT: 'draft'
}

function saveReview(review) {
  const reviews = getReviews()
  const existingIndex = reviews.findIndex(r => r.id === review.id)
  if (existingIndex >= 0) {
    reviews[existingIndex] = review
  } else {
    reviews.push(review)
  }
  wx.setStorageSync(KEYS.REVIEWS, reviews)
}

function getReviews() {
  return wx.getStorageSync(KEYS.REVIEWS) || []
}

function getReviewById(id) {
  const reviews = getReviews()
  return reviews.find(r => r.id === id)
}

function deleteReview(id) {
  const reviews = getReviews()
  const filtered = reviews.filter(r => r.id !== id)
  wx.setStorageSync(KEYS.REVIEWS, filtered)
}

function saveDraft(formData) {
  wx.setStorageSync(KEYS.DRAFT, {
    timestamp: Date.now(),
    formData: formData
  })
}

function getDraft() {
  return wx.getStorageSync(KEYS.DRAFT)
}

function clearDraft() {
  wx.removeStorageSync(KEYS.DRAFT)
}

function savePeriodReview(periodReview) {
  const periodReviews = getPeriodReviews()
  const existingIndex = periodReviews.findIndex(r => r.id === periodReview.id)
  if (existingIndex >= 0) {
    periodReviews[existingIndex] = periodReview
  } else {
    periodReviews.push(periodReview)
  }
  wx.setStorageSync(KEYS.PERIOD_REVIEWS, periodReviews)
}

function getPeriodReviews() {
  return wx.getStorageSync(KEYS.PERIOD_REVIEWS) || []
}

function saveConversation(conversation) {
  const conversations = getConversations()
  const existingIndex = conversations.findIndex(c => c.id === conversation.id)
  if (existingIndex >= 0) {
    conversations[existingIndex] = conversation
  } else {
    conversations.push(conversation)
  }
  wx.setStorageSync(KEYS.CONVERSATIONS, conversations)
}

function getConversations() {
  return wx.getStorageSync(KEYS.CONVERSATIONS) || []
}

function getConversationById(id) {
  const conversations = getConversations()
  return conversations.find(c => c.id === id)
}

function deleteConversation(id) {
  const conversations = getConversations()
  const filtered = conversations.filter(c => c.id !== id)
  wx.setStorageSync(KEYS.CONVERSATIONS, filtered)
}

function archiveConversation(id) {
  const conversation = getConversationById(id)
  if (conversation) {
    conversation.isArchived = true
    saveConversation(conversation)
  }
}

module.exports = {
  saveReview,
  getReviews,
  getReviewById,
  deleteReview,
  saveDraft,
  getDraft,
  clearDraft,
  savePeriodReview,
  getPeriodReviews,
  saveConversation,
  getConversations,
  getConversationById,
  deleteConversation,
  archiveConversation
}
