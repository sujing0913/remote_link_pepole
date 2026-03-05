// cloudfunctions/markNotificationRead/index.js
// 标记站内通知已读
//
// 入参：
// - notificationId: string (必填)
//
// 仅允许通知接收者（parent_openid == 当前OPENID）修改

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const notificationId = event?.notificationId;

  if (!openid) return { success: false, message: '未获取到用户身份' };
  if (!notificationId) return { success: false, message: '缺少 notificationId' };

  try {
    const docRes = await db.collection('notifications').doc(notificationId).get();
    const doc = docRes.data;
    if (!doc) return { success: false, message: '通知不存在' };
    if (doc.parent_openid !== openid) return { success: false, message: '无权限' };

    await db.collection('notifications').doc(notificationId).update({
      data: {
        read: true,
        read_time: Date.now()
      }
    });

    return { success: true };
  } catch (e) {
    console.error(e);
    return { success: false, message: e.message || e.errMsg || '操作失败' };
  }
};
