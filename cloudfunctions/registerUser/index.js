const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 云函数入口
exports.main = async (event, context) => {
  const { nickName, avatarUrl, role, openId } = event;

  try {
    // 检查用户是否已存在
    const existingUser = await db.collection('users').where({ _openid: openId }).get();
    if (existingUser.data.length > 0) {
      return { success: false, message: '用户已存在' };
    }

    // 保存用户信息
    await db.collection('users').add({
      data: {
        _openid: openId,
        nickName,
        avatarUrl,
        role,
        createdAt: db.serverDate()
      }
    });

    return { success: true, message: '登录成功' };
  } catch (err) {
    console.error('登录失败:', err);
    return { success: false, message: '登录失败，请稍后重试' };
  }
};
