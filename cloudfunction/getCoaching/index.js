// 注意：当前项目使用直连API（utils/api.js），此云函数保留备用
// 如需迁移到云函数，可启用此文件；需先在 project.config.json 中配置云函数环境
const cloud = require('wx-server-sdk')

cloud.init()

const AI_API_KEY = 'sk-ae408b86d2704b3197fdde86b727d395'
const AI_API_URL = 'https://api.deepseek.com/chat/completions'

exports.main = async (event, context) => {
  const { messages } = event

  try {
    const response = await fetch(AI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messages,
        temperature: 0.7
      })
    })

    const data = await response.json()

    if (data.error) {
      throw new Error(data.error.message)
    }

    return {
      success: true,
      reply: data.choices[0].message.content
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
}
