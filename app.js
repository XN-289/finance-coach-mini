/**
 * 交易教练 — 全局应用入口
 * 管理全局状态、主题、生命周期
 */
const { getTheme, getThemeName } = require('./utils/theme')
const { getStorageUsage } = require('./utils/export')

App({
  globalData: {
    theme: null,
    themeName: 'light',
    version: '2.0.0',
    userInfo: null,
    storageUsage: null
  },

  onLaunch() {
    // 初始化主题
    const theme = getTheme()
    this.globalData.theme = theme
    this.globalData.themeName = theme.name

    // 检查存储用量
    this.updateStorageUsage()

    // 检查更新
    this.checkUpdate()

    console.log(`[交易教练] v${this.globalData.version} 启动，主题: ${theme.name}`)
  },

  onShow() {
    // 每次回到前台检查存储
    this.updateStorageUsage()
  },

  updateStorageUsage() {
    try {
      this.globalData.storageUsage = getStorageUsage()
    } catch (e) {}
  },

  /**
   * 获取当前主题对象（供页面使用）
   */
  getTheme() {
    return this.globalData.theme
  },

  /**
   * 切换主题后全局通知
   */
  applyTheme(newTheme) {
    this.globalData.theme = newTheme
    this.globalData.themeName = newTheme.name
  },

  /**
   * 检查小程序更新
   */
  checkUpdate() {
    if (!wx.canIUse('getUpdateManager')) return

    const updateManager = wx.getUpdateManager()
    updateManager.onCheckForUpdate((res) => {
      if (res.hasUpdate) {
        updateManager.onUpdateReady(() => {
          wx.showModal({
            title: '更新提示',
            content: '新版本已准备好，是否重启应用？',
            success: (modalRes) => {
              if (modalRes.confirm) {
                updateManager.applyUpdate()
              }
            }
          })
        })
        updateManager.onUpdateFailed(() => {
          wx.showToast({ title: '更新失败，请删除小程序重新搜索打开', icon: 'none' })
        })
      }
    })
  }
})
