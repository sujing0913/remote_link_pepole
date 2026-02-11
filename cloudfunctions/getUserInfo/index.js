// 云函数：getUserInfo
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 尝试在 users 集合中查找用户
    const userRecord = await db.collection('users').where({ _openid: openid }).get()

    if (userRecord.data.length > 0) {
      // 用户已存在，直接返回
      const userData = userRecord.data[0];
      return { 
        openId: openid,
        nickName: userData.nickName,
        avatarUrl: userData.avatarUrl,
        role: userData.role,
        userId: userData._id // 返回文档ID用于后续更新
      };
    } else {
      // 用户不存在，创建新用户，默认为参与人
      // 注意：这里无法获取微信昵称，需要客户端在后续更新
      const newUser = {
        nickName: '用户' + openid.substring(0, 6),
        avatarUrl: '',
        role: 'participant',
        _openid: openid
      }
      const result = await db.collection('users').add({ data: newUser })
      return { 
        openId: openid,
        nickName: newUser.nickName,
        avatarUrl: newUser.avatarUrl,
        role: newUser.role,
        userId: result._id // 返回新创建的文档ID
      };
    }
  } catch (err) {
    console.error('获取或创建用户失败', err)
    throw new Error('Failed to get or create user')
  }
}
