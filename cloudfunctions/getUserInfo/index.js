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
      // 补全缺失的 teamId 和 teamName
      if (!userData.teamId) {
        userData.teamId = openid;
        userData.teamName = '我的团队';
        await db.collection('users').doc(userData._id).update({
          data: { teamId: userData.teamId, teamName: userData.teamName }
        });
      }
      return { 
        openId: openid,
        nickName: userData.nickName,
        avatarUrl: userData.avatarUrl,
        role: userData.role || 'organizer',
        teamId: userData.teamId,
        teamName: userData.teamName,
        isProfileSet: !!userData.isProfileSet,
        userId: userData._id 
      };
    } else {
      // 用户不存在，创建新用户
      const newUser = {
        nickName: '用户' + openid.substring(openid.length - 4),
        avatarUrl: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0',
        role: 'organizer',
        _openid: openid,
        teamId: openid, // 默认团队ID为自己的OpenID
        teamName: '我的团队',
        isProfileSet: false,
        createTime: db.serverDate()
      }
      const result = await db.collection('users').add({ data: newUser })
      return { 
        openId: openid,
        nickName: newUser.nickName,
        avatarUrl: newUser.avatarUrl,
        role: newUser.role,
        teamId: newUser.teamId,
        teamName: newUser.teamName,
        isProfileSet: false,
        userId: result._id 
      };
    }
  } catch (err) {
    console.error('获取或创建用户失败', err)
    throw new Error('Failed to get or create user')
  }
}
