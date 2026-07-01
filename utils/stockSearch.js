/**
 * 股票搜索与自选股管理
 * 搜索使用东方财富公开 API，自选股存储在本地
 */

const WATCHLIST_KEY = 'watchlist'
const SEARCH_API = 'https://searchapi.eastmoney.com/api/suggest/get'

/**
 * 搜索股票（东方财富联想搜索）
 * @param {string} keyword - 股票代码或名称关键字
 * @returns {Promise<Array>} 搜索结果列表
 */
function searchStock(keyword) {
  if (!keyword || keyword.trim().length === 0) return Promise.resolve([])

  return new Promise((resolve, reject) => {
    wx.request({
      url: SEARCH_API,
      data: {
        input: keyword.trim(),
        type: 14,
        token: 'D43BF722C8E33BDC906FB84D85E326E8',
        count: 10
      },
      timeout: 8000,
      success: (res) => {
        try {
          if (res.data && res.data.QuotationCodeTable && res.data.QuotationCodeTable.Data) {
            const results = res.data.QuotationCodeTable.Data
              .filter(item => {
                // 只保留 A 股
                const mkt = item.MktNum
                return mkt === '0' || mkt === '1' // 深圳=0, 上海=1
              })
              .map(item => ({
                code: item.Code,
                name: item.Name,
                market: item.MktNum === '1' ? 'SH' : 'SZ',
                secid: `${item.MktNum === '1' ? '1' : '0'}.${item.Code}`,
                type: item.SecurityTypeName || '股票'
              }))
              .slice(0, 8)

            resolve(results)
          } else {
            resolve([])
          }
        } catch (e) {
          resolve([])
        }
      },
      fail: () => resolve([])
    })
  })
}

/**
 * 获取单只股票实时行情
 * @param {string} secid - 如 "1.600519"
 * @returns {Promise<Object|null>}
 */
function getStockQuote(secid) {
  return new Promise((resolve) => {
    wx.request({
      url: 'https://push2.eastmoney.com/api/qt/stock/get',
      data: {
        secid,
        fields: 'f43,f44,f45,f46,f47,f48,f50,f51,f52,f57,f58,f60,f116,f117,f162,f167,f168,f169,f170'
      },
      timeout: 8000,
      success: (res) => {
        try {
          if (!res.data || !res.data.data) { resolve(null); return }
          const d = res.data.data
          resolve({
            code: d.f57,
            name: d.f58,
            price: (d.f43 || 0) / 100,
            open: (d.f46 || 0) / 100,
            high: (d.f44 || 0) / 100,
            low: (d.f45 || 0) / 100,
            lastClose: (d.f60 || 0) / 100,
            change: (d.f169 || 0) / 100,
            changePct: (d.f170 || 0) / 100,
            volume: d.f47 || 0,
            turnover: (d.f48 || 0) / 1e8,
            pe: (d.f167 || 0) / 100,
            marketCap: (d.f116 || 0) / 1e8,
            circulatingCap: (d.f117 || 0) / 1e8
          })
        } catch (e) {
          resolve(null)
        }
      },
      fail: () => resolve(null)
    })
  })
}

// ===== 自选股管理 =====

function getWatchlist() {
  try {
    return wx.getStorageSync(WATCHLIST_KEY) || []
  } catch (e) {
    return []
  }
}

function addToWatchlist(stock) {
  const list = getWatchlist()
  const exists = list.find(s => s.code === stock.code)
  if (exists) return false

  list.push({
    code: stock.code,
    name: stock.name,
    market: stock.market || '',
    secid: stock.secid || '',
    addedAt: Date.now(),
    notes: ''
  })

  wx.setStorageSync(WATCHLIST_KEY, list)
  return true
}

function removeFromWatchlist(code) {
  const list = getWatchlist().filter(s => s.code !== code)
  wx.setStorageSync(WATCHLIST_KEY, list)
}

function updateWatchlistNote(code, notes) {
  const list = getWatchlist()
  const item = list.find(s => s.code === code)
  if (item) {
    item.notes = notes
    wx.setStorageSync(WATCHLIST_KEY, list)
  }
}

function isInWatchlist(code) {
  return getWatchlist().some(s => s.code === code)
}

/**
 * 批量获取自选股行情
 * @returns {Promise<Array>} 带行情的自选股列表
 */
async function getWatchlistWithQuotes() {
  const list = getWatchlist()
  if (list.length === 0) return []

  const quotes = await Promise.all(
    list.map(stock => getStockQuote(stock.secid || `${stock.market === 'SH' ? '1' : '0'}.${stock.code}`))
  )

  return list.map((stock, i) => ({
    ...stock,
    quote: quotes[i]
  }))
}

module.exports = {
  searchStock,
  getStockQuote,
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  updateWatchlistNote,
  isInWatchlist,
  getWatchlistWithQuotes
}
