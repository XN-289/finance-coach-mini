const config = require('./config')

/**
 * 调用 AI API
 * @param {Array} messages - 消息数组
 * @param {Object} options - 配置项
 * @returns {Promise<string>} AI 回复文本
 */
function callAI(messages, options) {
  const { temperature = 0.7, max_tokens = 3000, timeout = 60000 } = options || {}

  return new Promise((resolve, reject) => {
    wx.request({
      url: config.AI_API_URL,
      method: 'POST',
      timeout,
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.AI_API_KEY
      },
      data: {
        model: config.AI_MODEL,
        messages,
        temperature,
        max_tokens
      },
      success: (res) => {
        if (res.statusCode === 429) {
          reject(new ApiError('rate_limit', '请求过于频繁，请稍后重试'))
          return
        }
        if (res.statusCode === 401) {
          reject(new ApiError('auth_error', 'API 认证失败'))
          return
        }
        if (res.statusCode >= 500) {
          reject(new ApiError('server_error', '服务器错误，请稍后重试'))
          return
        }
        if (res.data && res.data.choices && res.data.choices[0]) {
          resolve(res.data.choices[0].message.content)
        } else {
          reject(new ApiError('parse_error', 'API返回异常'))
        }
      },
      fail: (err) => {
        const msg = err.errMsg || ''
        if (msg.includes('timeout')) {
          reject(new ApiError('timeout', '请求超时，请检查网络后重试'))
        } else if (msg.includes('fail')) {
          reject(new ApiError('network_error', '网络错误，请检查网络连接'))
        } else {
          reject(new ApiError('unknown', '网络连接失败，请稍后重试'))
        }
      }
    })
  })
}

/**
 * API 错误类型
 */
class ApiError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
    this.name = 'ApiError'
  }
}

module.exports = { callAI, ApiError }
