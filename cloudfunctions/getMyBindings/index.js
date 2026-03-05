// cloudfunctions/getMyBindings/index.js
// 获取当前用户的绑定关系：
// - asParent: 当前用户作为家长绑定的孩子列表
// - asChild: 当前用户作为孩子绑定的家长列表
//
// 数据集合：binds、users
// binds: { parent_openid, child_openid, status, create_time, update_time }
// users: { openid, name, role, bind_code, ... }

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

async function fetchUsersByOpenIds(openids) {
  if (!openids || openids.length === 0) return [];
  // 云开发 in 查询一次最多 10 条，这里做分批
  const chunkSize = 10;
  const chunks = [];
  for (let i = 0; i < openids.length; i += chunkSize) {
    chunks.push(openids.slice(i, i + chunkSize));
  }

  // 关键优化：users 集合里可能存在“同一 openid 多条脏数据”（你日志里已经出现）
  // 这里做一次“按 openid 聚合取最优记录”，避免后续 userMap.set 被空记录覆盖
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
      // 有 bind_code（通常只有家长有）也算更可信
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
    // 兼容：users 的 openid 可能存在于以下字段之一：
    // 1) 系统字段 _openid
    // 2) 业务冗余字段 openid
    // 3) 旧数据字段 openId / openID
    //
    // 注意：这里必须能用 binds 里的 parent_openid/child_openid（openid）匹配到 users 记录
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
  return `user${tail}`;
}

function normalizeName(user, fallbackOpenid) {
  // 优先取用户显式昵称/姓名；否则给一个稳定默认值，避免家长端下拉空白无法选择
  // 兼容字段：nickName（驼峰）、nikeName（历史拼写）、nickname（全小写）、name
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

  // 调试开关：仅在调用方传 { debug: true } 时打印关键排查信息
  const debug = !!(event && event.debug);

  // 强制标记：用于确认云端是否已部署到最新代码（无条件打印一行）
  console.log('[getMyBindings] version=debug-log-v1', { debug, hasEvent: !!event });

  try {
    // 兼容：binds 历史数据可能没有 status 字段，此时视为“正常绑定”
    // 规则：status === 1 或 status 不存在(null/undefined) 都算有效；status === 0 才算解绑
    const condStatusOk = db.command.or([{ status: 1 }, { status: db.command.exists(false) }]);

    // 1) 我作为家长：查孩子
    // 优先走标准字段 parent_openid/child_openid
    const asParentRes1 = await db
      .collection('binds')
      .where(db.command.and([{ parent_openid: openid }, condStatusOk]))
      .get();

    // 兼容历史驼峰字段 parentOpenId/childOpenId（如不存在则返回空）
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

    // 3) 取 users 信息（name/nickName）
    const needOpenids = Array.from(new Set([...childOpenIds, ...parentOpenIds]));

    const users = await fetchUsersByOpenIds(needOpenids);

    if (debug) {
      console.log('[getMyBindings][debug] self openid=', openid);
      console.log('[getMyBindings][debug] childOpenIds=', childOpenIds);
      console.log('[getMyBindings][debug] parentOpenIds=', parentOpenIds);
      console.log('[getMyBindings][debug] needOpenids=', needOpenids);
      console.log(
        '[getMyBindings][debug] users fetched sample=',
        (users || []).map(u => ({
          _id: u._id,
          _openid: u._openid,
          openid: u.openid,
          openId: u.openId,
          openID: u.openID,
          nickName: u.nickName,
          nikeName: u.nikeName,
          nickname: u.nickname,
          name: u.name
        }))
      );
    }
    // users 的匹配 key：优先用 _openid，其次 openid（冗余字段）
    // 关键：绑定关系里存的是 parent_openid/child_openid（即 openid），因此这里必须能用 openid 命中
    const userMap = new Map();
    (users || []).forEach((u) => {
      if (!u) return;
      if (u._openid) userMap.set(u._openid, u);
      if (u.openid) userMap.set(u.openid, u);
      if (u.openId) userMap.set(u.openId, u);
      if (u.openID) userMap.set(u.openID, u);
    });

    // 4) 返回结构：给页面展示用（含绑定时间）
    // 去重：同一个 openid 只保留一次（避免双字段查询导致重复）
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
        if (debug) {
          console.log('[getMyBindings][debug] asParent item=', {
            child_openid: c,
            userMatched: !!u,
            userKeys: u
              ? {
                  _openid: u._openid,
                  openid: u.openid,
                  openId: u.openId,
                  openID: u.openID
                }
              : null,
            nameResolved: n
          });
        }
        return {
          openid: c,
          name: n,
          bind_time: b.create_time || b.bind_time || b.createTime || null
        };
      })
    );

    const asChild = uniqByOpenid(
      asChildBinds.map(b => {
        const p = b.parent_openid || b.parentOpenId;
        const u = userMap.get(p);
        const n = normalizeName(u, p);
        if (debug) {
          console.log('[getMyBindings][debug] asChild item=', {
            parent_openid: p,
            userMatched: !!u,
            userKeys: u
              ? {
                  _openid: u._openid,
                  openid: u.openid,
                  openId: u.openId,
                  openID: u.openID
                }
              : null,
            nameResolved: n
          });
        }
        return {
          openid: p,
          name: n,
          bind_time: b.create_time || b.bind_time || b.createTime || null
        };
      })
    );

    return {
      success: true,
      data: {
        asParent,
        asChild
      }
    };
  } catch (err) {
    console.error(err);
    return { success: false, message: err.message || '未知错误' };
  }
};
