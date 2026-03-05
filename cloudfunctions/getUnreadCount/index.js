// cloudfunctions/getUnreadCount/index.js
// 获取当前用户（家长）的未读站内通知数量
//
// notifications: { parent_openid, read: boolean, ... }

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) return { success: false, message: '未获取到用户身份' };

  try {
    const res = await db
      .collection('notifications')
      .where({ parent_openid: openid, read: false })
      .count();

    return { success: true, unread: res.total || 0 };
  } catch (e) {
    console.error(e);
    return { success: false, message: e.message || e.errMsg || '查询失败' };
  }
};
