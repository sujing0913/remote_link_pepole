// 云函数：updateUserInfo
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { nickName, avatarUrl } = event;
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 更新用户信息 - 通过 _openid 字段查找并更新
    const result = await db.collection('users').where({ _openid: openid }).update({
      data: {
        nickName: nickName,
        avatarUrl: avatarUrl
      }
    })
    
    // 检查是否成功更新
    if (result.stats.updated === 0) {
      console.warn('未找到用户进行更新，可能用户不存在');
      return { success: false, message: 'User not found' };
    }
    
    return { success: true }
  } catch (err) {
    console.error('更新用户信息失败', err)
    throw new Error('Failed to update user info')
  }
}
