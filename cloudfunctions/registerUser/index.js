const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 云函数入口
exports.main = async (event, context) => {
  const { nickName, avatarUrl, role, teamName, action, teamId, checkInId, score, suggestion } = event;
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;

  try {
    // 处理评分更新动作
    if (action === 'updateCheckIn' && checkInId) {
      const updateData = { updatedAt: db.serverDate() };
      if (score !== undefined) updateData.score = score;
      if (suggestion !== undefined) updateData.suggestion = suggestion;

      await db.collection('check_ins').doc(checkInId).update({
        data: updateData
      });
      return { success: true, message: '评分已更新' };
    }

    // 处理特定的更新团队名称动作
    if (action === 'updateTeamName' && teamId) {
      await db.collection('users').where({
        teamId: teamId
      }).update({
        data: {
          teamName: teamName,
          updatedAt: db.serverDate()
        }
      });
      return { success: true, message: '团队名称已更新' };
    }

    // 检查用户是否已存在
    const existingUser = await db.collection('users').where({ _openid: openId }).get();
    
    if (existingUser.data.length > 0) {
      // 如果用户已存在，则更新资料
      const updateData = {
        updatedAt: db.serverDate()
      };
      if (nickName) updateData.nickName = nickName;
      if (avatarUrl) updateData.avatarUrl = avatarUrl;
      if (role) updateData.role = role;
      if (teamName) updateData.teamName = teamName;
      if (teamId) updateData.teamId = teamId;

      // 设置资料标志
      updateData.isProfileSet = true;

      await db.collection('users').where({ _openid: openId }).update({
        data: updateData
      });
    } else {
      // 保存新用户信息
      await db.collection('users').add({
        data: {
          _openid: openId,
          nickName,
          avatarUrl,
          role: role || 'organizer',
          teamName: teamName || '',
          createdAt: db.serverDate()
        }
      });
    }

    return { success: true, message: '注册成功' };
  } catch (err) {
    console.error('注册失败:', err);
    return { success: false, message: '系统繁忙，请稍后重试' };
  }
};
