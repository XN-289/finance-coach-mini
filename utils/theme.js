/**
 * 主题管理器 — 支持亮色/暗色模式切换
 * 数据存储在 wx.setStorageSync，跟随用户偏好持久化
 */

const THEME_KEY = 'app_theme'
const THEMES = {
  light: {
    name: 'light',
    label: '亮色模式',
    bg: '#f5f6f8',
    cardBg: '#ffffff',
    text: '#1a1a1a',
    textSecondary: '#666666',
    textMuted: '#999999',
    primary: '#e4393c',
    primaryLight: '#fef0f0',
    primaryDark: '#c1272d',
    border: '#e8e8e8',
    divider: '#f0f0f0',
    inputBg: '#fafafa',
    shadow: 'rgba(0, 0, 0, 0.04)',
    success: '#52c41a',
    warning: '#faad14',
    danger: '#ff4d4f',
    info: '#1890ff',
    up: '#e4393c',
    down: '#52c41a',
    flat: '#999999'
  },
  dark: {
    name: 'dark',
    label: '暗色模式',
    bg: '#121212',
    cardBg: '#1e1e1e',
    text: '#e0e0e0',
    textSecondary: '#aaaaaa',
    textMuted: '#777777',
    primary: '#ff4d4f',
    primaryLight: '#2a1a1a',
    primaryDark: '#ff7875',
    border: '#333333',
    divider: '#2a2a2a',
    inputBg: '#2a2a2a',
    shadow: 'rgba(0, 0, 0, 0.3)',
    success: '#73d13d',
    warning: '#ffc53d',
    danger: '#ff7875',
    info: '#40a9ff',
    up: '#ff4d4f',
    down: '#73d13d',
    flat: '#777777'
  }
}

function getTheme() {
  try {
    const stored = wx.getStorageSync(THEME_KEY)
    if (stored && THEMES[stored]) return THEMES[stored]
  } catch (e) {}
  return THEMES.light
}

function setTheme(name) {
  try {
    wx.setStorageSync(THEME_KEY, name)
  } catch (e) {}
}

function toggleTheme() {
  const current = getTheme()
  const next = current.name === 'light' ? 'dark' : 'light'
  setTheme(next)
  return THEMES[next]
}

function getThemeName() {
  try {
    return wx.getStorageSync(THEME_KEY) || 'light'
  } catch (e) {
    return 'light'
  }
}

function getAllThemes() {
  return THEMES
}

module.exports = {
  getTheme,
  setTheme,
  toggleTheme,
  getThemeName,
  getAllThemes,
  THEMES
}
