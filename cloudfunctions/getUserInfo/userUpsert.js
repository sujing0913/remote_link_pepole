// cloudfunctions/getUserInfo/userUpsert.js
// 统一的 users upsert：确保同一 openid 只维护一条"主记录"
// 说明：云函数是独立部署单元，不能跨目录 require，所以把共享逻辑复制一份到本云函数目录。
// 此版本支持角色管理功能

// 角色常量（与 _shared/userRoles.js 保持一致）
const ROLE = {
  NORMAL: 'normal',
  PARENT: 'parent',
  CHILD: 'child'
};

function safeTrim(v) {
  if (typeof v !== 'string') return '';
  return v.trim();
}

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

function getOpenidKey(u) {
  return (u && (u._openid || u.openid || u.openId || u.openID)) || '';
}

/**
 * 标准化角色值
 */
function normalizeRole(role) {
  if (!role || role === '') return ROLE.NORMAL;
  if (Object.values(ROLE).includes(role)) return role;
  return ROLE.NORMAL;
}

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
 * upsertUserProfile
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

module.exports = {
  upsertUserProfile,
  findUsersByOpenid,
  getOpenidKey,
  scoreUser,
  safeTrim,
  normalizeRole,
  ROLE
};
