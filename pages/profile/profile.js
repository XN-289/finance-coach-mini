const { exportBackup, importBackup, getStorageUsage, cleanupOldData } = require('../../utils/export')
const { getTheme, setTheme, toggleTheme, getThemeName } = require('../../utils/theme')
const { computeAllStats, computeStreak } = require('../../utils/stats')
const storage = require('../../utils/storage')

Page({
  data: {
    themeName: 'light',
    storageUsage: null,
    stats: null,
    showBackupModal: false,
    backupData: '',
    version: '2.1.0'
  },

  onLoad() {
    this.setData({ themeName: getThemeName() })
    this.loadData()
  },

  onShow() {
    this.loadData()
  },

  loadData() {
    const storageUsage = getStorageUsage()
    const stats = computeAllStats()
    this.setData({ storageUsage, stats })
  },

  // ===== 主题切换 =====
  toggleTheme() {
    const newTheme = toggleTheme()
    this.setData({ themeName: newTheme.name })
    wx.showToast({
      title: `已切换至${newTheme.label}`,
      icon: 'none'
    })
    // 通知所有页面刷新主题
    const pages = getCurrentPages()
    pages.forEach(page => {
      if (page.onThemeChange) page.onThemeChange(newTheme)
    })
  },

  // ===== 数据导出 =====
  exportData() {
    try {
      const backup = exportBackup()
      this.setData({ backupData: backup, showBackupModal: true })

      wx.setClipboardData({
        data: backup,
        success: () => {
          wx.showToast({ title: '备份数据已复制到剪贴板', icon: 'none', duration: 2000 })
        }
      })
    } catch (e) {
      wx.showToast({ title: '导出失败: ' + e.message, icon: 'none' })
    }
  },

  closeBackupModal() {
    this.setData({ showBackupModal: false })
  },

  // ===== 数据导入 =====
  importData() {
    wx.showModal({
      title: '导入数据',
      content: '请将备份JSON数据粘贴到剪贴板，点击确定后自动读取',
      success: (res) => {
        if (res.confirm) {
          wx.getClipboardData({
            success: (clipRes) => {
              if (clipRes.data) {
                const result = importBackup(clipRes.data)
                if (result.success) {
                  wx.showToast({
                    title: `成功导入 ${result.imported} 条记录`,
                    icon: 'success',
                    duration: 2000
                  })
                  this.loadData()
                } else {
                  wx.showToast({ title: '导入失败: ' + result.error, icon: 'none' })
                }
              }
            }
          })
        }
      }
    })
  },

  // ===== 清理数据 =====
  cleanupData() {
    wx.showModal({
      title: '清理旧数据',
      content: '将清理180天前的对话记录。复盘数据不会被删除。',
      success: (res) => {
        if (res.confirm) {
          const result = cleanupOldData(180)
          wx.showToast({
            title: result.removed > 0 ? `已清理 ${result.removed} 条记录` : '没有需要清理的数据',
            icon: 'none'
          })
          this.loadData()
        }
      }
    })
  },

  // ===== 清空所有数据 =====
  clearAllData() {
    wx.showModal({
      title: '⚠️ 危险操作',
      content: '将清空所有复盘、对话和周期复盘数据。此操作不可恢复！建议先导出备份。',
      confirmText: '确认清空',
      confirmColor: '#D4574E',
      success: (res) => {
        if (res.confirm) {
          wx.showModal({
            title: '二次确认',
            content: '真的要清空所有数据吗？',
            confirmText: '清空',
            confirmColor: '#D4574E',
            success: (res2) => {
              if (res2.confirm) {
                wx.removeStorageSync('reviews')
                wx.removeStorageSync('periodReviews')
                wx.removeStorageSync('conversations')
                wx.removeStorageSync('draft')
                wx.removeStorageSync('market_snapshot')
                wx.removeStorageSync('watchlist')
                wx.showToast({ title: '已清空', icon: 'success' })
                this.loadData()
              }
            }
          })
        }
      }
    })
  },

  // ===== 关于 =====
  showAbout() {
    wx.showModal({
      title: '关于交易教练',
      content: `版本：${this.data.version}

一款基于 AI 的股票交易复盘工具，帮助交易者建立系统化的复盘习惯，识别行为偏差，提升知行合一的能力。

核心功能：
• 每日交易复盘记录
• AI 教练深度分析
• 行为标签追踪
• 数据仪表盘
• 自选股管理
• 周期复盘总结
• 数据导出备份`,
      showCancel: false
    })
  },

  goToPeriod() {
    wx.navigateTo({ url: '/pages/period/period' })
  },

  goToConversation() {
    // 跳转到对话列表
    wx.navigateTo({ url: '/pages/conversation/conversation' })
  }
})
