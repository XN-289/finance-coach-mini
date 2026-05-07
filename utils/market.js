const MARKET_API = 'https://push2.eastmoney.com/api/qt/stock/get'
const LIMIT_API = 'https://push2.eastmoney.com/api/qt/clist/get'

function fetchJson(url, data, timeout = 15000) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      data,
      timeout,
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          resolve(res.data)
        } else {
          reject(new Error(`HTTP ${res.statusCode}`))
        }
      },
      fail: (err) => reject(err)
    })
  })
}

function fetchIndex(secid) {
  return fetchJson(MARKET_API, {
    secid,
    fields: 'f43,f48,f51,f52,f57,f169,f170'
  }).then(res => {
    if (!res.data) throw new Error('无数据')
    const d = res.data
    return {
      name: d.f57,
      price: (d.f43 || 0) / 100,
      turnover: (d.f48 || 0) / 1e8,
      advancers: d.f51 || 0,
      decliners: d.f52 || 0,
      change: (d.f169 || 0) / 100,
      changePct: (d.f170 || 0) / 100
    }
  })
}

function fetchLimitStats() {
  return fetchJson(LIMIT_API, {
    pn: 1,
    pz: 500,
    po: 1,
    np: 1,
    fltt: 2,
    invt: 2,
    fid: 'f3',
    fs: 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23',
    fields: 'f2,f3,f12,f14,f62'
  }).then(res => {
    if (!res.data || !res.data.diffs) throw new Error('无数据')

    const stocks = res.data.diffs
    let limitUp = 0
    let limitUpNonST = 0
    let limitUpST = 0
    let limitDown = 0
    let limitDownNonST = 0
    let limitDownST = 0
    let maxBoard = 0
    let maxBoardStock = ''

    stocks.forEach(s => {
      const pct = s.f3 || 0
      const board = s.f62 || 0
      const name = s.f14 || ''
      const isST = name.includes('ST') || name.includes('*ST')

      if (pct >= 9.8) {
        limitUp++
        if (isST) limitUpST++
        else limitUpNonST++
      }
      if (pct <= -9.8) {
        limitDown++
        if (isST) limitDownST++
        else limitDownNonST++
      }
      if (board > maxBoard) {
        maxBoard = board
        maxBoardStock = name
      }
    })

    return {
      limitUp, limitUpNonST, limitUpST,
      limitDown, limitDownNonST, limitDownST,
      maxBoard, maxBoardStock
    }
  }).catch(err => {
    console.error('获取涨跌停统计失败:', err)
    return { limitUp: 0, limitUpNonST: 0, limitUpST: 0, limitDown: 0, limitDownNonST: 0, limitDownST: 0, maxBoard: 0, maxBoardStock: '' }
  })
}

function fetchSectorRanking() {
  return fetchJson(LIMIT_API, {
    pn: 1,
    pz: 10,
    po: 1,
    np: 1,
    fltt: 2,
    invt: 2,
    fid: 'f3',
    fs: 'm:90+t:2',
    fields: 'f2,f3,f14,f62'
  }).then(res => {
    if (!res.data || !res.data.diffs) throw new Error('无板块数据')

    const sectors = res.data.diffs.map(s => ({
      name: s.f14 || '',
      changePct: (s.f3 || 0).toFixed(2),
      leadStock: s.f62 ? String(s.f62) : ''
    })).filter(s => s.name && !s.name.includes('昨日'))

    return sectors.slice(0, 5)
  // 板块排行获取失败不阻塞主流程，返回空数组即可
  }).catch(err => {
    console.error('获取板块排行失败:', err)
    return []
  })
}

function getStoredSnapshot() {
  try {
    return wx.getStorageSync('market_snapshot') || null
  } catch (e) {
    return null
  }
}

function storeSnapshot(snapshot) {
  try {
    wx.setStorageSync('market_snapshot', {
      ...snapshot,
      storedAt: Date.now()
    })
  } catch (e) {
    // storage full, ignore
  }
}

function formatMarketFill(snapshot, sectors, yesterdayDelta, volLabel) {
  const { totalTurnover, totalUp, totalDown } = snapshot
  const { limitUp, limitUpNonST, limitUpST, limitDown, limitDownNonST, limitDownST, maxBoard, maxBoardStock } = snapshot

  const deltaStr = yesterdayDelta
    ? `，${yesterdayDelta > 0 ? '+' : ''}${yesterdayDelta.toFixed(0)} 亿`
    : ''

  const marketLines = [
    `全市场成交量：${totalTurnover.toFixed(0)} 亿（对比昨日：${volLabel}${deltaStr}）`,
    `涨跌分布：上涨 ${totalUp} 家 / 下跌 ${totalDown} 家`,
    `涨停 ${limitUp} 家（非ST：${limitUpNonST}，ST：${limitUpST}），跌停 ${limitDown} 家（非ST：${limitDownNonST}，ST：${limitDownST}）`,
    `连板最高：${maxBoard} 板${maxBoardStock ? '（' + maxBoardStock + '）' : ''}`
  ]
  const market = marketLines.join('\n')

  let theme = ''
  if (sectors.length > 0) {
    const sectorLines = sectors.map(s =>
      `${s.name} +${s.changePct}%${s.leadStock ? '（领涨：' + s.leadStock + '）' : ''}`
    )
    theme = '涨幅前 5 板块：\n' + sectorLines.join('\n')
  }

  return { market, theme }
}

function getMarketSnapshot() {
  return Promise.all([
    fetchIndex('1.000001'),
    fetchIndex('0.399001'),
    fetchLimitStats()
  ]).then(([sh, sz, limit]) => {
    const sectors = []
    const totalTurnover = (sh.turnover || 0) + (sz.turnover || 0)
    const totalUp = (sh.advancers || 0) + (sz.advancers || 0)
    const totalDown = (sh.decliners || 0) + (sz.decliners || 0)

    const yesterday = getStoredSnapshot()

    const snapshot = {
      sh,
      sz,
      totalTurnover,
      totalUp,
      totalDown,
      limitUp: limit.limitUp,
      limitUpNonST: limit.limitUpNonST,
      limitUpST: limit.limitUpST,
      limitDown: limit.limitDown,
      limitDownNonST: limit.limitDownNonST,
      limitDownST: limit.limitDownST,
      maxBoard: limit.maxBoard,
      maxBoardStock: limit.maxBoardStock,
      yesterdayTurnover: yesterday ? yesterday.totalTurnover : null
    }

    storeSnapshot(snapshot)

    const volLabel = yesterday
      ? (totalTurnover >= yesterday.totalTurnover ? '放量' : '缩量')
      : '—'

    const parts = [
      `全市场成交量：${totalTurnover.toFixed(0)} 亿（对比昨日：${volLabel}）`,
      `涨跌分布：上涨 ${totalUp} 家 / 下跌 ${totalDown} 家`,
      `情绪指标：涨停 ${limit.limitUp} 家 / 跌停 ${limit.limitDown} 家 / 连板最高 ${limit.maxBoard} 板`
    ]

    const yesterdayDelta = yesterday ? totalTurnover - yesterday.totalTurnover : null

    const fillText = formatMarketFill(snapshot, sectors, yesterdayDelta, volLabel)

    return {
      raw: snapshot,
      text: parts.join('\n'),
      volLabel,
      fillText
    }
  }).catch(err => {
    console.error('获取行情失败:', err)
    return null
  })
}

module.exports = { getMarketSnapshot }
