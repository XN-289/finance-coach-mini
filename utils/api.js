const config = require('./config')

function callAI(messages, options) {
  const { temperature = 0.7, max_tokens = 3000, timeout = 60000 } = options || {}

  return new Promise((resolve, reject) => {
    wx.request({
      url: config.AI_API_URL,
      method: 'POST',
      timeout,
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.AI_API_KEY}`
      },
      data: {
        model: config.AI_MODEL,
        messages,
        temperature,
        max_tokens
      },
      success: (res) => {
        if (res.data.choices && res.data.choices[0]) {
          resolve(res.data.choices[0].message.content)
        } else {
          reject(new Error('API返回异常'))
        }
      },
      fail: (err) => {
        let errorMsg = '网络连接失败，请稍后重试'
        if (err.errMsg && err.errMsg.includes('timeout')) {
          errorMsg = '请求超时，请检查网络后重试'
        } else if (err.errMsg && err.errMsg.includes('fail')) {
          errorMsg = '网络错误，请检查网络连接'
        }
        reject(new Error(errorMsg))
      }
    })
  })
}

module.exports = { callAI }
