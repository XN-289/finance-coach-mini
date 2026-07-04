/**
 * 主题管理器 v2 — 淡雅暖色调设计系统
 * 支持亮色/暗色模式，CSS 变量驱动
 */

const THEME_KEY = 'app_theme'
const THEMES = {
  light: {
    name: 'light',
    label: '亮色模式',
    bg: '#F8F5F2',
    cardBg: '#ffffff',
    text: '#2D2A26',
    textSecondary: '#8A8580',
    textMuted: '#B5B0AB',
    primary: '#D4574E',
    primaryLight: '#FDF2F1',
    primaryDark: '#B8433B',
    primaryGlow: 'rgba(212, 87, 78, 0.08)',
    border: '#EDE8E4',
    divider: '#F3EFEC',
    inputBg: '#FAFAF8',
    shadow: 'rgba(45, 42, 38, 0.05)',
    shadowMd: 'rgba(45, 42, 38, 0.12)',
    success: '#5BA870',
    successLight: '#F0F9F2',
    warning: '#E8A84C',
    warningLight: '#FFF8ED',
    danger: '#D4574E',
    dangerLight: '#FDF2F1',
    info: '#5B8FD4',
    infoLight: '#EFF5FC',
    up: '#D4574E',
    down: '#5BA870',
    flat: '#B5B0AB'
  },
  dark: {
    name: 'dark',
    label: '暗色模式',
    bg: '#1A1816',
    cardBg: '#242220',
    text: '#E8E4E0',
    textSecondary: '#A09A94',
    textMuted: '#6B6560',
    primary: '#E87068',
    primaryLight: '#2A2020',
    primaryDark: '#F09088',
    primaryGlow: 'rgba(232, 112, 104, 0.12)',
    border: '#3A3632',
    divider: '#2E2A28',
    inputBg: '#2A2624',
    shadow: 'rgba(0, 0, 0, 0.2)',
    shadowMd: 'rgba(0, 0, 0, 0.4)',
    success: '#6DC882',
    successLight: '#1E2A20',
    warning: '#F0B860',
    warningLight: '#2A2418',
    danger: '#E87068',
    dangerLight: '#2A2020',
    info: '#70A8E8',
    infoLight: '#1A2230',
    up: '#E87068',
    down: '#6DC882',
    flat: '#6B6560'
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
