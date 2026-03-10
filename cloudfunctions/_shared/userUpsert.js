// cloudfunctions/_shared/userUpsert.js
// 统一的 users upsert：确保同一 openid 只维护一条"主记录"
// 支持角色管理功能

const { ROLE, ROLE_PERMISSIONS, getRoleInfo } = require('./userRoles');

/**
 * 安全地去除字符串首尾空格
 */
function safeTrim(v) {
  if (typeof v !== 'string') return '';
  return v.trim();
}

/**
 * 为用户记录评分，用于选择"最优主记录"
 * 评分规则：
 * - 有昵称/姓名：+100
 * - 有绑定码：+10
 * - 有角色：+1
 * - 有头像：+1
 * - 有 openid：+1
 */
function scoreUser(u) {
  if (!u) return 0;
  let s = 0;
  const n = safeTrim(u.nickName || u.nikeName || u.nickname || u.name);
  if (n) s += 100;
  if (u.bind_code) s += 10;
  if (u.role) s += 1;
  if (u.avatarUrl) s += 1;
  if (u._openid) s += 1;
  return s;
}

/**
 * 获取 openid 字段值
 */
function getOpenidKey(u) {
  return (u && (u._openid || u.openid || u.openId || u.openID)) || '';
}

/**
 * 按 openid 查找用户记录
 */
async function findUsersByOpenid(db, openid) {
  const _ = db.command;
  const res = await db
    .collection('users')
    .where(
      _.or([
        { _openid: openid },
        { openid },
        { openId: openid },
        { openID: openid }
      ])
    )
    .get();
  return res.data || [];
}

/**
 * 标准化角色值
 * 支持空字符串、null、undefined 转为 'normal'
 */
function normalizeRole(role) {
  if (!role || role === '') return ROLE.NORMAL;
  if (Object.values(ROLE).includes(role)) return role;
  return ROLE.NORMAL;
}

/**
 * 获取用户的绑定信息统计
 */
async function getBindingStats(db, openid) {
  const _ = db.command;
  
  // 作为家长绑定的孩子数量
  const asParentCount = await db
    .collection('binds')
    .where({
      parent_openid: openid,
      status: 1
    })
    .count();
  
  // 作为孩子绑定的家长数量
  const asChildCount = await db
    .collection('binds')
    .where({
      child_openid: openid,
      status: 1
    })
    .count();
  
  return {
    asParentCount: asParentCount.total || 0,
    asChildCount: asChildCount.total || 0
  };
}

/**
 * upsertUserProfile - 更新或插入用户档案
 * 
 * @param {DB} db cloud.database()
 * @param {string} openid wxContext.OPENID
 * @param {object} patch 要写入的字段
 * @param {object} options { now?: serverDate, softDedup?: boolean, skipRoleNormalize?: boolean }
 * @returns {object} { userId, user, dedupedCount, created }
 */
async function upsertUserProfile(db, openid, patch = {}, options = {}) {
  if (!openid) throw new Error('openid required');

  const now = options.now || db.serverDate();
  const softDedup = options.softDedup !== false;
  const skipRoleNormalize = options.skipRoleNormalize !== true;

  const users = await findUsersByOpenid(db, openid);

  // 角色标准化处理
  let patchToUse = { ...patch };
  if (!skipRoleNormalize && patchToUse.role !== undefined) {
    patchToUse.role = normalizeRole(patchToUse.role);
  }

  if (!users.length) {
    const dataToAdd = {
      openid,
      _openid: openid,
      role: ROLE.NORMAL,
      role_update_time: now,
      create_time: now,
      update_time: now,
      ...patchToUse
    };
    const addRes = await db.collection('users').add({ data: dataToAdd });
    return {
      userId: addRes._id,
      user: { _id: addRes._id, ...dataToAdd },
      dedupedCount: 0,
      created: true
    };
  }

  // 选择最优记录作为主记录
  let primary = users[0];
  for (const u of users) {
    if (scoreUser(u) > scoreUser(primary)) primary = u;
  }

  const updateData = {
    openid: primary.openid || openid,
    _openid: primary._openid || openid,
    update_time: now,
    ...patchToUse
  };

  // 如果 patch 中有 role 字段，同时更新 role_update_time
  if (patchToUse.role !== undefined && patchToUse.role !== primary.role) {
    updateData.role_update_time = now;
  }

  await db.collection('users').doc(primary._id).update({ data: updateData });

  // 软去重：标记重复记录
  let dedupedCount = 0;
  if (softDedup && users.length > 1) {
    const dupIds = users
      .filter(u => u && u._id && u._id !== primary._id)
      .map(u => u._id);

    const chunkSize = 10;
    for (let i = 0; i < dupIds.length; i += chunkSize) {
      const chunk = dupIds.slice(i, i + chunkSize);
      await db
        .collection('users')
        .where({ _id: db.command.in(chunk) })
        .update({
          data: {
            _dup_of: primary._id,
            update_time: now
          }
        });
      dedupedCount += chunk.length;
    }
  }

  return {
    userId: primary._id,
    user: { ...primary, ...updateData },
    dedupedCount,
    created: false
  };
}

/**
 * setUserRole - 设置用户角色
 * 包含角色切换的合法性校验
 * 
 * @param {DB} db cloud.database()
 * @param {string} openid 用户 openid
 * @param {string} newRole 新角色
 * @param {Date} now 当前时间
 * @returns {object} { success: boolean, message: string, user?: object }
 */
async function setUserRole(db, openid, newRole, now = null) {
  if (!openid) {
    return { success: false, message: 'openid 不能为空' };
  }

  if (!Object.values(ROLE).includes(newRole)) {
    return { success: false, message: '无效的角色值' };
  }

  try {
    // 获取当前用户记录
    const users = await findUsersByOpenid(db, openid);
    const user = users && users.length ? users[0] : null;
    const currentRole = user ? (user.role || ROLE.NORMAL) : ROLE.NORMAL;

    // 角色相同，直接返回
    if (currentRole === newRole) {
      return {
        success: true,
        message: '角色未变更',
        user: user
      };
    }

    // 获取绑定统计
    const stats = await getBindingStats(db, openid);

    // 角色切换校验
    // 1. 孩子角色且有家长绑定时，不能切换为普通用户或家长
    if (currentRole === ROLE.CHILD && stats.asChildCount > 0) {
      if (newRole === ROLE.PARENT || newRole === ROLE.NORMAL) {
        return {
          success: false,
          message: '当前已绑定家长，无法切换角色。请先解绑。'
        };
      }
    }

    // 2. 家长角色且有孩子绑定时，不能切换为孩子
    if (currentRole === ROLE.PARENT && stats.asParentCount > 0) {
      if (newRole === ROLE.CHILD) {
        return {
          success: false,
          message: '当前已绑定孩子，无法切换为孩子角色。'
        };
      }
    }

    // 执行角色更新
    if (!now) now = db.serverDate();
    
    const patch = {
      role: newRole,
      role_update_time: now
    };

    // 如果是切换为家长，确保有绑定码
    if (newRole === ROLE.PARENT && (!user || !user.bind_code)) {
      // 这里不直接生成绑定码，由 ensureParentBindCode 处理
      patch.role = newRole;
    }

    // 如果是切换为普通用户，清空绑定码
    if (newRole === ROLE.NORMAL && user && user.bind_code) {
      patch.bind_code = null;
      patch.bind_code_update_time = null;
    }

    await upsertUserProfile(db, openid, patch, { now, softDedup: true, skipRoleNormalize: true });

    // 重新获取更新后的用户信息
    const updatedUsers = await findUsersByOpenid(db, openid);
    const updatedUser = updatedUsers && updatedUsers.length ? updatedUsers[0] : null;

    return {
      success: true,
      message: '角色更新成功',
      user: updatedUser,
      previousRole: currentRole,
      newRole: newRole
    };
  } catch (err) {
    console.error('setUserRole failed:', err);
    return {
      success: false,
      message: err.message || '角色更新失败'
    };
  }
}

module.exports = {
  upsertUserProfile,
  setUserRole,
  findUsersByOpenid,
  getOpenidKey,
  scoreUser,
  safeTrim,
  normalizeRole,
  getBindingStats
};
