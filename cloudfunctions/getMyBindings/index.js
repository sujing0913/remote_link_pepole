// cloudfunctions/getMyBindings/index.js
// 获取当前用户的绑定关系：
// - asParent: 当前用户作为家长绑定的孩子列表
// - asChild: 当前用户作为孩子绑定的家长列表
//
// 数据集合：binds、users
// binds: { parent_openid, child_openid, status, create_time, update_time }
// users: { openid, _openid, name, role, bind_code, ... }

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const { ROLE, getRoleInfo } = require('./userRoles');

/**
 * 标准化角色值
 */
function normalizeRole(role) {
  if (!role || role === '') return ROLE.NORMAL;
  if (Object.values(ROLE).includes(role)) return role;
  return ROLE.NORMAL;
}

async function fetchUsersByOpenIds(openids) {
  if (!openids || openids.length === 0) return [];
  // 云开发 in 查询一次最多 10 条，这里做分批
  const chunkSize = 10;
  const chunks = [];
  for (let i = 0; i < openids.length; i += chunkSize) {
    chunks.push(openids.slice(i, i + chunkSize));
  }

  // 关键优化：users 集合里可能存在"同一 openid 多条脏数据"
  // 这里做一次"按 openid 聚合取最优记录"，避免后续 userMap.set 被空记录覆盖
  const bestByOpenid = new Map();

  const upsertBest = (u) => {
    if (!u) return;
    const key = u._openid || u.openid || u.openId || u.openID;
    if (!key) return;

    const cur = bestByOpenid.get(key);

    const score = (x) => {
      if (!x) return 0;
      let s = 0;
      // 有 nickName / name 优先
      const n = (x.nickName || x.nikeName || x.nickname || x.name || '').trim();
      if (n) s += 100;
      // 有 bind_code（通常只有家长有）优先
      if (x.bind_code) s += 10;
      // 有 role 也算更可信
      if (x.role) s += 1;
      return s;
    };

    if (!cur || score(u) > score(cur)) {
      bestByOpenid.set(key, u);
    }
  };

  for (const chunk of chunks) {
    // 兼容：users 的 openid 可能存在于以下字段之一
    const res = await db
      .collection('users')
      .where(
        db.command.or([
          { _openid: db.command.in(chunk) },
          { openid: db.command.in(chunk) },
          { openId: db.command.in(chunk) },
          { openID: db.command.in(chunk) }
        ])
      )
      .get();

    (res.data || []).forEach(upsertBest);
  }

  return Array.from(bestByOpenid.values());
}

function defaultNameByOpenid(openid) {
  if (!openid) return 'user';
  const tail = String(openid).slice(-4);
  return `用户${tail}`;
}

function normalizeName(user, fallbackOpenid) {
  // 优先取用户显式昵称/姓名；否则给一个稳定默认值
  if (user) {
    const n = user.nickName || user.nikeName || user.nickname || user.name || '';
    if (n && String(n).trim()) return String(n).trim();
  }
  return defaultNameByOpenid(fallbackOpenid);
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { success: false, message: '未获取到用户身份' };
  }

  // 调试开关
  const debug = !!(event && event.debug);

  try {
    // 兼容：binds 历史数据可能没有 status 字段，此时视为"正常绑定"
    const condStatusOk = db.command.or([{ status: 1 }, { status: db.command.exists(false) }]);

    // 1) 我作为家长：查孩子
    const asParentRes1 = await db
      .collection('binds')
      .where(db.command.and([{ parent_openid: openid }, condStatusOk]))
      .get();

    // 兼容历史驼峰字段
    const asParentRes2 = await db
      .collection('binds')
      .where(db.command.and([{ parentOpenId: openid }, condStatusOk]))
      .get();

    const asParentBinds = [...(asParentRes1.data || []), ...(asParentRes2.data || [])];

    // child openid 兜底字段名
    const childOpenIds = asParentBinds.map(i => i.child_openid || i.childOpenId).filter(Boolean);

    // 2) 我作为孩子：查家长
    const asChildRes1 = await db
      .collection('binds')
      .where(db.command.and([{ child_openid: openid }, condStatusOk]))
      .get();

    const asChildRes2 = await db
      .collection('binds')
      .where(db.command.and([{ childOpenId: openid }, condStatusOk]))
      .get();

    const asChildBinds = [...(asChildRes1.data || []), ...(asChildRes2.data || [])];

    const parentOpenIds = asChildBinds.map(i => i.parent_openid || i.parentOpenId).filter(Boolean);

    // 3) 取 users 信息（name/nickName/role）
    const needOpenids = Array.from(new Set([...childOpenIds, ...parentOpenIds]));

    const users = await fetchUsersByOpenIds(needOpenids);

    // users 的匹配 key
    const userMap = new Map();
    (users || []).forEach((u) => {
      if (!u) return;
      if (u._openid) userMap.set(u._openid, u);
      if (u.openid) userMap.set(u.openid, u);
      if (u.openId) userMap.set(u.openId, u);
      if (u.openID) userMap.set(u.openID, u);
    });

    // 4) 返回结构：给页面展示用（含绑定时间、角色信息）
    // 去重：同一个 openid 只保留一次
    const uniqByOpenid = arr => {
      const m = new Map();
      (arr || []).forEach(i => {
        if (i && i.openid && !m.has(i.openid)) m.set(i.openid, i);
      });
      return Array.from(m.values());
    };

    const asParent = uniqByOpenid(
      asParentBinds.map(b => {
        const c = b.child_openid || b.childOpenId;
        const u = userMap.get(c);
        const n = normalizeName(u, c);
        const role = normalizeRole(u ? u.role : ROLE.NORMAL);
        return {
          openid: c,
          name: n,
          role: role,
          roleInfo: getRoleInfo(role),
          bind_time: b.create_time || b.bind_time || b.createTime || null
        };
      })
    );

    const asChild = uniqByOpenid(
      asChildBinds.map(b => {
        const p = b.parent_openid || b.parentOpenId;
        const u = userMap.get(p);
        const n = normalizeName(u, p);
        const role = normalizeRole(u ? u.role : ROLE.NORMAL);
        return {
          openid: p,
          name: n,
          role: role,
          roleInfo: getRoleInfo(role),
          bind_time: b.create_time || b.bind_time || b.createTime || null
        };
      })
    );

    // 5) 获取当前用户自己的角色信息
    const selfUsers = await fetchUsersByOpenIds([openid]);
    const selfUser = selfUsers && selfUsers.length ? selfUsers[0] : null;
    const selfRole = normalizeRole(selfUser ? selfUser.role : ROLE.NORMAL);

    return {
      success: true,
      data: {
        asParent,
        asChild,
        self: {
          openid: openid,
          role: selfRole,
          roleInfo: getRoleInfo(selfRole),
          name: normalizeName(selfUser, openid)
        }
      }
    };
  } catch (err) {
    console.error(err);
    return { success: false, message: err.message || '未知错误' };
  }
};
