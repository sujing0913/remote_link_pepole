// cloudfunctions/notifyParentOnPunch/index.js
// 孩子打卡后，给其绑定的家长写入「站内通知」（不使用订阅消息）
//
// 依赖：binds、users、check_ins、notifications（新增）
// binds: { parent_openid, child_openid, status, create_time }
// users: { openid, name, role, ... }
// check_ins: { _id, subject, score, suggestion, createTime, puncherOpenId, ... }
// notifications: {
//   parent_openid, child_openid, record_id, type, title, content,
//   create_time, read, read_time
// }
//
// 说明：
// - 个人主体小程序无法使用订阅消息能力时，使用“站内通知 + 红点/未读数”替代
// - 家长打开小程序即可看到未读通知，并可跳转到对应孩子历史记录页

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function formatDate(dt) {
  const d = new Date(dt);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

function shortText(s, max = 30) {
  if (!s) return '';
  const str = String(s);
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID; // 触发者（孩子）

  const { recordId } = event || {};
  if (!openid) return { success: false, message: '未获取到用户身份' };
  if (!recordId) return { success: false, message: '缺少 recordId' };

  try {
    // 1) 查打卡记录
    const recordRes = await db.collection('check_ins').doc(recordId).get();
    const record = recordRes.data;
    if (!record) return { success: false, message: '打卡记录不存在' };
    if (record.puncherOpenId && record.puncherOpenId !== openid) {
      return { success: false, message: '无权限：record 不属于当前用户' };
    }

    // 2) 查孩子信息（用于通知标题）
    let childName = '孩子';
    try {
      const childRes = await db.collection('users').where({ openid }).limit(1).get();
      childName = childRes.data?.[0]?.name || childRes.data?.[0]?.nickName || childName;
    } catch (e) {
      // ignore
    }

    // 3) 查绑定的家长（只通知 status=1 的绑定关系）
    const bindsRes = await db
      .collection('binds')
      .where({ child_openid: openid, status: 1 })
      .get();
    const parentOpenIds = (bindsRes.data || []).map(b => b.parent_openid);
    if (parentOpenIds.length === 0) {
      return { success: true, message: '未绑定家长，无需通知', notified: 0, written: 0 };
    }

    // 4) 组装通知内容
    const subject = record.subject || '打卡';
    const timeStr = formatDate(record.createTime || Date.now());
    const score = record.score === -1 ? '未评分' : record.score != null ? String(record.score) : '';
    const suggestion = record.suggestion ? shortText(record.suggestion, 40) : '';

    const title = `${childName}完成打卡`;
    const contentParts = [`科目：${subject}`, `时间：${timeStr}`];
    if (score) contentParts.push(`评分：${score}`);
    if (suggestion) contentParts.push(`评语：${suggestion}`);
    const content = contentParts.join('；');

    const create_time = Date.now();

    // 5) 批量写 notifications
    const results = [];
    let okCount = 0;

    for (const parent_openid of parentOpenIds) {
      try {
        const addRes = await db.collection('notifications').add({
          data: {
            parent_openid,
            child_openid: openid,
            record_id: recordId,
            type: 'punch',
            title,
            content,
            create_time,
            read: false,
            read_time: null
          }
        });

        okCount += 1;
        results.push({ parentOpenId: parent_openid, success: true, notificationId: addRes._id });
      } catch (e) {
        console.error('写入站内通知失败', parent_openid, e);
        results.push({
          parentOpenId: parent_openid,
          success: false,
          error: e.message || e.errMsg || String(e)
        });
      }
    }

    return { success: true, notified: okCount, written: okCount, results };
  } catch (err) {
    console.error(err);
    return { success: false, message: err.message || '未知错误' };
  }
};
