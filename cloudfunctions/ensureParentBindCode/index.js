// cloudfunctions/ensureParentBindCode/index.js
// 确保家长拥有永久固定 6 位绑定码：若不存在则生成并持久化（终身不变）
//
// 数据集合：users
// 字段：openid、_openid、nickName、role、bind_code、bind_code_create_time、create_time、update_time

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const { upsertUserProfile, findUsersByOpenid, scoreUser, normalizeRole } = require('./userUpsert');
const { ROLE, canGenerateBindCode, getRoleInfo } = require('./userRoles');

function random6Digits() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function ensureUniqueBindCode() {
  // 生成并校验唯一性（最多重试 50 次）
  for (let i = 0; i < 50; i++) {
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

    // 1) 查找用户档案（取"最优主记录"，并对重复记录做软去重标记）
    const users = await findUsersByOpenid(db, openid);
    let user = users && users.length ? users[0] : null;
    if (users && users.length > 1) {
      for (const u of users) {
        if (scoreUser(u) > scoreUser(user)) user = u;
      }
    }

    // 若不存在：先 upsert 一条基础档案
    if (!user) {
      const up = await upsertUserProfile(
        db,
        openid,
        {
          openid,
          _openid: openid,
          role: ROLE.NORMAL,
          nickName: '',
          avatarUrl: '',
          create_time: now
        },
        { now, softDedup: true }
      );
      user = up.user;
    }

    // 2) 角色校验：孩子角色不能生成绑定码
    const currentRole = normalizeRole(user.role);
    if (currentRole === ROLE.CHILD) {
      return { 
        success: false, 
        message: '当前为孩子角色，不能生成绑定码。请先解绑或切换角色。',
        role: currentRole,
        roleInfo: getRoleInfo(currentRole)
      };
    }

    // 3) 已存在且有绑定码，直接返回（永久不变）
    if (user.bind_code) {
      // 同步 role 为 parent（如果还不是）
      if (currentRole !== ROLE.PARENT) {
        await upsertUserProfile(db, openid, { role: ROLE.PARENT }, { now, softDedup: true });
      }
      return {
        success: true,
        bind_code: user.bind_code,
        bind_code_create_time: user.bind_code_create_time || null,
        role: ROLE.PARENT,
        roleInfo: getRoleInfo(ROLE.PARENT),
        isNew: false
      };
    }

    // 4) 已存在但没有绑定码：补生成
    const bind_code = await ensureUniqueBindCode();
    await upsertUserProfile(
      db,
      openid,
      {
        role: ROLE.PARENT,
        bind_code,
        bind_code_create_time: now,
        bind_code_update_time: now
      },
      { now, softDedup: true }
    );

    return { 
      success: true, 
      bind_code, 
      bind_code_create_time: now, 
      role: ROLE.PARENT,
      roleInfo: getRoleInfo(ROLE.PARENT),
      isNew: true 
    };
  } catch (err) {
    console.error(err);
    return { success: false, message: err.message || '未知错误' };
  }
};
