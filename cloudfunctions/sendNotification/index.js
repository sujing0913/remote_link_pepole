// 云函数：sendNotification
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { puncherOpenId, mediaUrl, subject } = event
  const wxContext = cloud.getWXContext()
  const currentPuncherOpenId = wxContext.OPENID

  try {
    // 1. 查询所有绑定到此打卡人的监管人
    const bindingRecords = await db.collection('bindings')
      .where({ puncherOpenId: currentPuncherOpenId })
      .get()

    if (bindingRecords.data.length === 0) {
      return { success: true, message: 'No supervisors bound.' }
    }

    // 2. 获取监管人openId列表
    const supervisorOpenIds = bindingRecords.data.map(record => record.supervisorOpenId)

    // 3. 发送订阅消息给每个监管人
    const sendPromises = supervisorOpenIds.map(async (toOpenId) => {
      try {
        await cloud.openapi.subscribeMessage.send({
          touser: toOpenId,
          templateId: 'ZTWzbhWfZxCTXBPLJFKLbmZ89F1b_6tcfUlhEPmFpyA', // 需要在微信公众平台配置
          page: 'pages/history/history',
          data: {
            thing1: { value: '您的学员有新的打卡记录' },
            thing2: { value: subject },
            date3: { value: new Date().toLocaleString('zh-CN') }
          }
        })
      } catch (err) {
        console.error('Failed to send message to:', toOpenId, err)
      }
    })

    await Promise.all(sendPromises)
    return { success: true }
  } catch (err) {
    console.error('Cloud function error:', err)
    return { success: false, error: err }
  }
}
