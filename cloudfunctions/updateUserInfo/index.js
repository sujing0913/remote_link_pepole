// 云函数：updateUserInfo
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { nickName, avatarUrl } = event;
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 更新用户信息
    await db.collection('users').doc(openid).update({
      data: {
        nickName: nickName,
        avatarUrl: avatarUrl
      }
    })
    
    return { success: true }
  } catch (err) {
    console.error('更新用户信息失败', err)
    throw new Error('Failed to update user info')
  }
}
