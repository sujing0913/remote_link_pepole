// cloudfunctions/_shared/userUpsert.js
// 统一的 users upsert：确保同一 openid 只维护一条“主记录”
// 策略：
// 1) 先按 openid 查（兼容 _openid / openid / openId / openID）
// 2) 如果存在多条：选“最优记录”作为主记录（有 nickName/name 等优先）
// 3) 将补丁 patch 写入主记录（update）
// 4) 其余重复记录做“软删除标记”（_dup_of = 主记录 _id），避免误覆盖；不直接 delete 以免误删影响线上
//
// 注意：云开发无法给非 _id 字段建立唯一索引，这里用程序逻辑保证唯一性。

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
  // 有 _openid 的一般是“正规写入链路”产生的记录，也更可信
  if (u._openid) s += 1;
  return s;
}

function getOpenidKey(u) {
  return (u && (u._openid || u.openid || u.openId || u.openID)) || '';
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
 * @param {object} patch 要写入的字段（不含 update_time/create_time 也可）
 * @param {object} options { now?: serverDate, softDedup?: boolean }
 * @returns {object} { userId, user, dedupedCount, created }
 */
async function upsertUserProfile(db, openid, patch = {}, options = {}) {
  if (!openid) throw new Error('openid required');

  const now = options.now || db.serverDate();
  const softDedup = options.softDedup !== false; // 默认 true

  const users = await findUsersByOpenid(db, openid);

  // 不存在：创建主记录（同时写 openid 冗余字段，方便业务查询）
  if (!users.length) {
    const dataToAdd = {
      openid,
      create_time: now,
      update_time: now,
      ...patch
    };
    const addRes = await db.collection('users').add({ data: dataToAdd });
    return {
      userId: addRes._id,
      user: { _id: addRes._id, ...dataToAdd },
      dedupedCount: 0,
      created: true
    };
  }

  // 存在：挑选最优主记录
  let primary = users[0];
  for (const u of users) {
    if (scoreUser(u) > scoreUser(primary)) primary = u;
  }

  const updateData = {
    // 强制补齐 openid（统一键）
    openid: primary.openid || openid,
    update_time: now,
    ...patch
  };

  await db.collection('users').doc(primary._id).update({ data: updateData });

  // 对重复记录做软去重标记，避免后续逻辑 limit(1) 随机命中“空记录”
  let dedupedCount = 0;
  if (softDedup && users.length > 1) {
    const dupIds = users
      .filter(u => u && u._id && u._id !== primary._id)
      .map(u => u._id);

    // 批量 update：分批（一次最多 10）
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
  scoreUser
};
