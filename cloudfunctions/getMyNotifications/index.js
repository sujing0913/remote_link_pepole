// cloudfunctions/getMyNotifications/index.js
// 获取当前用户（家长）的站内通知列表
//
// 入参：
// - page: 1..n
// - pageSize: 1..50
// - read: true/false（可选）
// - childOpenId: string（可选）
//
// notifications: { parent_openid, child_openid, read, create_time, ... }

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) return { success: false, message: '未获取到用户身份' };

  const page = Math.max(1, Number(event?.page || 1));
  const pageSize = Math.min(50, Math.max(1, Number(event?.pageSize || 20)));

  const read = event?.read;
  const childOpenId = event?.childOpenId;

  const where = { parent_openid: openid };
  if (typeof read === 'boolean') where.read = read;
  if (typeof childOpenId === 'string' && childOpenId) where.child_openid = childOpenId;

  try {
    const totalRes = await db.collection('notifications').where(where).count();

    const listRes = await db
      .collection('notifications')
      .where(where)
      .orderBy('create_time', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    return {
      success: true,
      page,
      pageSize,
      total: totalRes.total || 0,
      list: listRes.data || []
    };
  } catch (e) {
    console.error(e);
    return { success: false, message: e.message || e.errMsg || '查询失败' };
  }
};
