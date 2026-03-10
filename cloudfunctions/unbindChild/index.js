// cloudfunctions/unbindChild/index.js
// 家长解绑孩子（将 binds.status 置为 0）
// 入参：childOpenId
// 权限：仅允许当前调用者为 parent_openid 的一方发起解绑
// 
// 解绑后的角色处理：
// - 孩子解绑所有家长后：role 从 child 还原为 normal
// - 家长解绑所有孩子后：role 保持 parent（保留绑定码，方便重新绑定）

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { ROLE, getRoleInfo } = require('./userRoles');

/**
 * 标准化角色值
 */
function normalizeRole(role) {
  if (!role || role === '') return ROLE.NORMAL;
  if (Object.values(ROLE).includes(role)) return role;
  return ROLE.NORMAL;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const parentOpenId = wxContext.OPENID;

  const { childOpenId } = event || {};
  if (!childOpenId) {
    return { success: false, message: '缺少 childOpenId' };
  }

  try {
    // 1) 找到当前家长与该孩子的有效绑定
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
    const now = db.serverDate();

    // 2) 将绑定状态置为 0（解绑）
    await db.collection('binds').where({ _id: _.in(ids) }).update({
      data: {
        status: 0,
        unbind_time: now,
        update_time: now
      }
    });

    // 3) 检查该孩子是否还有其他有效绑定
    const stillBindAsChild = await db
      .collection('binds')
      .where({
        child_openid: childOpenId,
        status: 1
      })
      .count();

    // 4) 如果孩子已无任何家长绑定，将其角色还原为 normal
    let childRoleUpdated = false;
    if ((stillBindAsChild.total || 0) === 0) {
      try {
        // 只更新 role=child 的用户，避免误伤
        const childUpdateRes = await db
          .collection('users')
          .where(
            _.and([
              _.or([{ _openid: childOpenId }, { openid: childOpenId }]),
              { role: ROLE.CHILD }
            ])
          )
          .update({
            data: {
              role: ROLE.NORMAL,
              role_update_time: now
            }
          });
        childRoleUpdated = true;
        console.log(`child role updated: ${childOpenId} -> ${ROLE.NORMAL}`);
      } catch (e) {
        console.warn('reset child role failed (ignored):', e);
      }
    }

    // 5) 检查该家长是否还有其他有效绑定的孩子
    const stillBindAsParent = await db
      .collection('binds')
      .where({
        parent_openid: parentOpenId,
        status: 1
      })
      .count();

    // 6) 家长角色保持 parent（保留绑定码），即使没有孩子绑定
    // 这样方便家长重新绑定其他孩子
    const parentRole = ROLE.PARENT;

    // 7) 发送解绑通知（不影响主流程）
    let notifySuccess = false;
    try {
      await cloud.callFunction({
        name: 'notifyOnUnbind',
        data: {
          toOpenId: childOpenId,
          fromOpenId: parentOpenId,
          childOpenId: childOpenId
        }
      });
      notifySuccess = true;
    } catch (e) {
      console.warn('notifyOnUnbind failed (ignored):', e);
    }

    return {
      success: true,
      message: '解绑成功',
      updated: ids.length,
      childOpenId: childOpenId,
      childRole: (stillBindAsChild.total || 0) === 0 ? ROLE.NORMAL : ROLE.CHILD,
      childRoleInfo: getRoleInfo((stillBindAsChild.total || 0) === 0 ? ROLE.NORMAL : ROLE.CHILD),
      parentOpenId: parentOpenId,
      parentRole: parentRole,
      parentRoleInfo: getRoleInfo(parentRole),
      childRoleUpdated: childRoleUpdated,
      remainingChildrenCount: stillBindAsParent.total || 0,
      notifySuccess: notifySuccess
    };
  } catch (err) {
    console.error('unbindChild error:', err);
    return { success: false, message: err.message || err.errMsg || '解绑失败' };
  }
};
