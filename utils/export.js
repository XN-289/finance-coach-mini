/**
 * 数据导出与分享工具
 * 支持生成分享图片（canvas 绘制）和数据备份
 */

const storage = require('./storage')
const { formatDate, formatDateTime } = require('./date')

/**
 * 生成复盘分享文本（用于复制/分享）
 */
function generateShareText(review) {
  const lines = []
  const fd = review.formData

  lines.push(`📊 交易复盘 | ${review.date}`)
  lines.push('─'.repeat(20))

  if (fd.market) {
    lines.push(`\n🏛️ 大盘记录`)
    lines.push(fd.market)
  }

  if (fd.theme) {
    lines.push(`\n🔥 题材与主线`)
    lines.push(fd.theme)
  }

  const buys = fd.buyList.filter(b => b.stock)
  const sells = fd.sellList.filter(s => s.stock)

  if (buys.length > 0) {
    lines.push(`\n🟢 买入记录`)
    buys.forEach((b, i) => {
      lines.push(`  ${i + 1}. ${b.stock} — ${b.reason || '无理由'}${b.matchPlan ? ' ✅计划内' : ' ⚠️计划外'}`)
    })
  }

  if (sells.length > 0) {
    lines.push(`\n🔴 卖出记录`)
    sells.forEach((s, i) => {
      lines.push(`  ${i + 1}. ${s.stock} — ${s.reason || '无理由'}${s.matchPlan ? ' ✅计划内' : ' ⚠️计划外'}`)
    })
  }

  const missed = fd.missedList.filter(m => m.what)
  if (missed.length > 0) {
    lines.push(`\n❌ 未执行计划`)
    missed.forEach((m, i) => {
      lines.push(`  ${i + 1}. ${m.what}${m.why ? ' — ' + m.why : ''}`)
    })
  }

  if (fd.selfAssessment) {
    lines.push(`\n💭 自我评价`)
    lines.push(fd.selfAssessment)
  }

  if (fd.tomorrow) {
    lines.push(`\n🎯 明日If-Then计划`)
    lines.push(fd.tomorrow)
  }

  if (review.aiReply) {
    lines.push(`\n${'═'.repeat(20)}`)
    lines.push(`🤖 交易教练点评`)
    lines.push(review.aiReply.substring(0, 300) + (review.aiReply.length > 300 ? '...' : ''))
  }

  if (review.tags && review.tags.length > 0) {
    lines.push(`\n🏷️ 行为标签: ${review.tags.join(' | ')}`)
  }

  return lines.join('\n')
}

/**
 * 生成数据备份 JSON
 */
function exportBackup() {
  const data = {
    version: '1.0.0',
    exportedAt: Date.now(),
    exportedDate: formatDateTime(Date.now()),
    reviews: storage.getReviews(),
    periodReviews: storage.getPeriodReviews(),
    conversations: storage.getConversations()
  }

  return JSON.stringify(data, null, 2)
}

/**
 * 恢复备份数据（合并模式：保留现有，添加新的）
 */
function importBackup(jsonStr) {
  try {
    const data = JSON.parse(jsonStr)
    if (!data.version || !data.reviews) {
      throw new Error('备份格式无效')
    }

    let imported = 0

    // 合并复盘记录
    if (data.reviews) {
      const existing = storage.getReviews()
      const existingIds = new Set(existing.map(r => r.id))
      data.reviews.forEach(r => {
        if (!existingIds.has(r.id)) {
          storage.saveReview(r)
          imported++
        }
      })
    }

    // 合并周期复盘
    if (data.periodReviews) {
      const existing = storage.getPeriodReviews()
      const existingIds = new Set(existing.map(r => r.id))
      data.periodReviews.forEach(r => {
        if (!existingIds.has(r.id)) {
          storage.savePeriodReview(r)
          imported++
        }
      })
    }

    // 合并对话
    if (data.conversations) {
      const existing = storage.getConversations()
      const existingIds = new Set(existing.map(c => c.id))
      data.conversations.forEach(c => {
        if (!existingIds.has(c.id)) {
          storage.saveConversation(c)
        }
      })
    }

    return { success: true, imported }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * 计算本地存储使用量
 */
function getStorageUsage() {
  try {
    const res = wx.getStorageInfoSync()
    return {
      currentSize: res.currentSize, // KB
      limitSize: res.limitSize,     // KB (usually 10240 = 10MB)
      usagePercent: Math.round((res.currentSize / res.limitSize) * 100),
      keys: res.keys
    }
  } catch (e) {
    return { currentSize: 0, limitSize: 10240, usagePercent: 0, keys: [] }
  }
}

/**
 * 生成交易日志（结构化格式）
 */
function generateTradeJournal(reviews) {
  const sorted = [...reviews].filter(r => !r.isDraft).sort((a, b) => a.timestamp - b.timestamp)
  const lines = []

  lines.push('日期,股票,方向,理由,计划内,标签')
  sorted.forEach(r => {
    const tags = (r.tags || []).join('|')
    r.formData.buyList.forEach(b => {
      if (b.stock) {
        lines.push([r.date, b.stock, '买入', '"' + (b.reason || '') + '"', b.matchPlan ? '是' : '否', '"' + tags + '"'].join(','))
      }
    })
    r.formData.sellList.forEach(s => {
      if (s.stock) {
        lines.push([r.date, s.stock, '卖出', '"' + (s.reason || '') + '"', s.matchPlan ? '是' : '否', '"' + tags + '"'].join(','))
      }
    })
  })

  // 汇总
  const totalBuys = sorted.reduce((s, r) => s + r.formData.buyList.filter(b => b.stock).length, 0)
  const totalSells = sorted.reduce((s, r) => s + r.formData.sellList.filter(s => s.stock).length, 0)
  lines.push('')
  lines.push('汇总,,' + totalBuys + '笔买入,' + totalSells + '笔卖出,,')

  return lines.join('\n')
}

/**
 * 清理过期数据（保留最近 N 天）
 */
function cleanupOldData(daysToKeep = 180) {
  const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000

  // 清理旧对话
  const conversations = storage.getConversations()
  const keptConversations = conversations.filter(c => c.timestamp >= cutoff)
  const removedCount = conversations.length - keptConversations.length

  if (removedCount > 0) {
    wx.setStorageSync('conversations', keptConversations)
  }

  return { removed: removedCount }
}

module.exports = {
  generateShareText,
  exportBackup,
  importBackup,
  getStorageUsage,
  cleanupOldData,
  generateTradeJournal
}
