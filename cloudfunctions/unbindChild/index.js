// cloudfunctions/unbindChild/index.js
// 家长解绑孩子（将 binds.status 置为 0）
// 入参：childOpenId
// 权限：仅允许当前调用者为 parent_openid 的一方发起解绑

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const parentOpenId = wxContext.OPENID;

  const { childOpenId } = event || {};
  if (!childOpenId) {
    return { success: false, message: '缺少 childOpenId' };
  }

  try {
    // 找到当前家长与该孩子的有效绑定
    const q = await db
      .collection('binds')
      .where({
        parent_openid: parentOpenId,
        child_openid: childOpenId,
        status: 1
      })
      .get();

    if (!q.data || q.data.length === 0) {
      return { success: false, message: '未找到有效绑定关系或已解绑' };
    }

    const ids = q.data.map((x) => x._id);

    await db.collection('binds').where({ _id: _.in(ids) }).update({
      data: {
        status: 0,
        unbind_time: new Date()
      }
    });

    // 若该孩子已不再绑定任何家长，则将其 role 从 child 还原为普通用户（role 置空）
    // 说明：本项目用绑定关系推断角色 + users.role 辅助显示；解绑后应避免仍展示“孩子”身份
    try {
      const stillBind = await db
        .collection('binds')
        .where({
          child_openid: childOpenId,
          status: 1
        })
        .limit(1)
        .get();

      if (!stillBind.data || stillBind.data.length === 0) {
        // 只清空 role=child，不动 parent（避免误伤家长身份）
        await db
          .collection('users')
          .where(
            _.and([
              _.or([{ _openid: childOpenId }, { openid: childOpenId }]),
              { role: 'child' }
            ])
          )
          .update({
            data: {
              role: '',
              role_update_time: db.serverDate()
            }
          });
      }
    } catch (e) {
      console.warn('reset child role failed (ignored):', e);
    }

    // 解绑通知（不影响主流程：失败也视为解绑成功）
    try {
      await cloud.callFunction({
        name: 'notifyOnUnbind',
        data: {
          toOpenId: childOpenId, // 通知被解绑的孩子
          fromOpenId: parentOpenId,
          childOpenId: childOpenId
        }
      });
    } catch (e) {
      console.warn('notifyOnUnbind failed (ignored):', e);
    }

    return { success: true, message: '解绑成功', updated: ids.length };
  } catch (err) {
    console.error('unbindChild error:', err);
    return { success: false, message: err.message || err.errMsg || '解绑失败' };
  }
};
