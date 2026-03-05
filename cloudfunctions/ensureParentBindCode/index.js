// cloudfunctions/ensureParentBindCode/index.js
// 确保家长拥有永久固定6位绑定码：若不存在则生成并持久化（终身不变）
//
// 数据集合：users
// 字段：openid(冗余)、name、role、bind_code、create_time、update_time

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const { upsertUserProfile, findUsersByOpenid, scoreUser } = require('./userUpsert');

function random6Digits() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function ensureUniqueBindCode() {
  // 生成并校验唯一性（最多重试 20 次）
  for (let i = 0; i < 20; i++) {
    const code = random6Digits();
    const existed = await db.collection('users').where({ bind_code: code }).count();
    if (existed.total === 0) return code;
  }
  throw new Error('生成绑定码失败：重试次数过多');
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { success: false, message: '未获取到用户身份' };
  }

  try {
    const now = db.serverDate();

    // 1) 查找用户档案（取“最优主记录”，并对重复记录做软去重标记）
    const users = await findUsersByOpenid(db, openid);
    let user = users && users.length ? users[0] : null;
    if (users && users.length > 1) {
      for (const u of users) {
        if (scoreUser(u) > scoreUser(user)) user = u;
      }
    }

    // 若不存在：先 upsert 一条基础档案（不在此处生成 bind_code，避免并发下重复创建脏数据）
    if (!user) {
      const up = await upsertUserProfile(
        db,
        openid,
        {
          openid,
          role: '',
          nickName: '',
          avatarUrl: '',
          create_time: now
        },
        { now, softDedup: true }
      );
      user = up.user;
    }

    // 0) 角色互斥约束：用户已被设置为孩子时，不允许生成/获取家长绑定码
    // 说明：为了满足“孩子与家长互斥”，这里直接拒绝，避免前端被绕过
    if (user.role === 'child') {
      return { success: false, message: '当前为孩子角色，解绑后才可成为家长' };
    }

    // 3) 已存在且有绑定码，直接返回（永久不变）
    if (user.bind_code) {
      // 同步 role（不强制，但有助于前端判断）
      if (user.role !== 'parent') {
        await upsertUserProfile(db, openid, { role: 'parent' }, { now, softDedup: true });
      }
      return {
        success: true,
        bind_code: user.bind_code,
        bind_code_create_time: user.bind_code_create_time || null,
        isNew: false
      };
    }

    // 4) 已存在但没有绑定码：补生成
    const bind_code = await ensureUniqueBindCode();
    await upsertUserProfile(
      db,
      openid,
      {
        role: 'parent',
        bind_code,
        bind_code_create_time: now
      },
      { now, softDedup: true }
    );

    return { success: true, bind_code, bind_code_create_time: now, isNew: true };
  } catch (err) {
    console.error(err);
    return { success: false, message: err.message || '未知错误' };
  }
};
