// cloudfunctions/bindToParent/index.js
// 孩子输入家长 6 位绑定码进行绑定：多对多，幂等（已绑定则直接返回成功）
//
// 数据集合：users、binds
// binds: { parent_openid, child_openid, status, create_time, update_time }

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const { upsertUserProfile, findUsersByOpenid, normalizeRole } = require('./userUpsert');
const { ROLE, getRoleInfo, canBindAsChild, canBindAsParent } = require('./userRoles');

function maskOpenId(openid) {
  if (!openid) return '';
  return openid.slice(0, 4) + '****' + openid.slice(-4);
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const childOpenId = wxContext.OPENID;

  const bindCodeRaw = (event && event.bindCode) || '';
  const bindCode = String(bindCodeRaw).trim();

  if (!childOpenId) {
    return { success: false, message: '未获取到用户身份' };
  }
  if (!/^\d{6}$/.test(bindCode)) {
    return { success: false, message: '绑定码必须为 6 位数字' };
  }

  try {
    // 1) 根据绑定码找家长
    const parentRes = await db.collection('users').where({ bind_code: bindCode }).limit(1).get();
    if (!parentRes.data || parentRes.data.length === 0) {
      return { success: false, message: '绑定码不存在或已失效' };
    }
    const parent = parentRes.data[0];
    // 兼容：users 可能使用系统字段 _openid 作为唯一标识
    const parentOpenId = parent.openid || parent._openid;

    // 2) 禁止自己绑自己（同一微信号不做亲子绑定）
    if (parentOpenId === childOpenId) {
      return { success: false, message: '不能绑定自己为监督人' };
    }

    const now = db.serverDate();

    // 3) 获取 child 当前用户档案和角色
    const childCurrent = await db
      .collection('users')
      .where(db.command.or([{ _openid: childOpenId }, { openid: childOpenId }]))
      .limit(1)
      .get();
    const childOne = (childCurrent && childCurrent.data && childCurrent.data[0]) || null;
    const childRole = normalizeRole(childOne && childOne.role);

    // 4) 角色校验：家长角色不能绑定为孩子
    if (childRole === ROLE.PARENT) {
      return { success: false, message: '当前为家长角色，不能绑定为孩子' };
    }

    // 5) 检查孩子是否已绑定其他家长（一个孩子只能绑定一个家长）
    const existingBindAsChild = await db
      .collection('binds')
      .where({
        child_openid: childOpenId,
        status: 1
      })
      .limit(1)
      .get();
    
    if (existingBindAsChild.data && existingBindAsChild.data.length > 0) {
      const existingBind = existingBindAsChild.data[0];
      // 如果是绑定同一个家长，直接返回成功（幂等）
      if (existingBind.parent_openid === parentOpenId) {
        return {
          success: true,
          message: '已绑定',
          parentOpenIdMasked: maskOpenId(parentOpenId),
          isNew: false
        };
      }
      // 已绑定其他家长，拒绝
      return { 
        success: false, 
        message: '已绑定其他家长，无法重复绑定',
        currentParentOpenIdMasked: maskOpenId(existingBind.parent_openid)
      };
    }

    // 6) upsert 孩子用户档案，设置角色为 child
    await upsertUserProfile(
      db,
      childOpenId,
      {
        openid: childOpenId,
        _openid: childOpenId,
        role: ROLE.CHILD,
        role_update_time: now,
        // 兼容旧字段：部分历史记录用 name 而不是 nickName
        name: childOne && typeof childOne.name !== 'undefined' ? childOne.name : '',
        create_time: now
      },
      { now, softDedup: true }
    );

    // 7) 家长角色确保为 parent
    await upsertUserProfile(
      db,
      parentOpenId,
      {
        role: ROLE.PARENT,
        role_update_time: now
      },
      { now, softDedup: true }
    );

    // 8) 幂等绑定：如果已存在关系（含解绑过的）则直接恢复/返回成功
    const existedRes = await db
      .collection('binds')
      .where({ parent_openid: parentOpenId, child_openid: childOpenId })
      .limit(1)
      .get();

    if (existedRes.data && existedRes.data.length > 0) {
      const bind = existedRes.data[0];
      // 若之前解绑过（status=0），则恢复为正常
      if (bind.status === 0) {
        await db.collection('binds').doc(bind._id).update({
          data: { status: 1, update_time: now }
        });
      }
      return {
        success: true,
        message: '已绑定',
        parentOpenIdMasked: maskOpenId(parentOpenId),
        isNew: false
      };
    }

    // 9) 创建新的绑定关系
    await db.collection('binds').add({
      data: {
        parent_openid: parentOpenId,
        child_openid: childOpenId,
        status: 1,
        create_time: now,
        update_time: now
      }
    });

    return {
      success: true,
      message: '绑定成功',
      parentOpenIdMasked: maskOpenId(parentOpenId),
      childRole: ROLE.CHILD,
      childRoleInfo: getRoleInfo(ROLE.CHILD),
      parentRole: ROLE.PARENT,
      parentRoleInfo: getRoleInfo(ROLE.PARENT),
      isNew: true
    };
  } catch (err) {
    console.error(err);
    return { success: false, message: err.message || '未知错误' };
  }
};
