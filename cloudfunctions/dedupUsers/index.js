// cloudfunctions/dedupUsers/index.js
// 一次性去重 users：按 openid（_openid/openid/openId/openID）归并
// - 选“最优记录”作为主记录（有 nickName/name 优先）
// - 其余记录：打标 _dup_of=主记录id，并可选将其关键字段合并到主记录（避免丢数据）
// - 默认不 delete，避免误删；如你确认后续可手动在控制台清理 _dup_of 有值的记录
//
// 用法：在云开发控制台手动调用：
// { dryRun: true }  仅统计不写入
// { dryRun: false, limit: 200 } 执行去重（分批跑）

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

function safeTrim(v) {
  if (typeof v !== 'string') return '';
  return v.trim();
}

function openidKey(u) {
  return (u && (u._openid || u.openid || u.openId || u.openID)) || '';
}

function score(u) {
  if (!u) return 0;
  let s = 0;
  const n = safeTrim(u.nickName || u.nickname || u.name);
  if (n) s += 100;
  if (u.bind_code) s += 10;
  if (u.role) s += 1;
  if (u.avatarUrl) s += 1;
  if (u._openid) s += 1;
  return s;
}

// 合并策略：主记录缺什么补什么（不覆盖已有值）
function mergePrimary(primary, dup) {
  const p = { ...primary };
  const fields = [
    'nickName',
    'name',
    'avatarUrl',
    'role',
    'bind_code',
    'bind_code_create_time',
    'role_create_time',
    'create_time'
  ];
  for (const f of fields) {
    if ((p[f] === undefined || p[f] === '' || p[f] === null) && dup[f]) {
      p[f] = dup[f];
    }
  }
  return p;
}

exports.main = async (event, context) => {
  const { dryRun = true, limit = 500 } = event || {};

  // 注意：云数据库一次 get 默认 20，这里分页拉取
  let all = [];
  let skip = 0;
  const pageSize = 100;

  while (all.length < limit) {
    const res = await db.collection('users').skip(skip).limit(pageSize).get();
    const list = res.data || [];
    all = all.concat(list);
    skip += pageSize;
    if (list.length < pageSize) break;
  }

  // 分组
  const groups = new Map();
  for (const u of all) {
    const k = openidKey(u);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(u);
  }

  const dupGroups = [];
  for (const [k, arr] of groups.entries()) {
    if (arr.length > 1) dupGroups.push([k, arr]);
  }

  const summary = {
    scanned: all.length,
    groups: groups.size,
    duplicateGroups: dupGroups.length,
    willMarkDupCount: 0,
    willUpdatePrimaryCount: 0
  };

  if (dryRun) {
    // 仅统计
    for (const [, arr] of dupGroups) {
      summary.willMarkDupCount += arr.length - 1;
      summary.willUpdatePrimaryCount += 1;
    }
    return { success: true, dryRun: true, summary };
  }

  const now = db.serverDate();
  for (const [k, arr] of dupGroups) {
    // 选主记录
    let primary = arr[0];
    for (const u of arr) {
      if (score(u) > score(primary)) primary = u;
    }

    // 合并字段
    let merged = primary;
    for (const u of arr) {
      if (u._id === primary._id) continue;
      merged = mergePrimary(merged, u);
    }

    // 更新主记录（补齐 openid 字段）
    const patch = { ...merged, openid: merged.openid || k, update_time: now };
    // 去掉 _id，避免写入冲突
    delete patch._id;

    await db.collection('users').doc(primary._id).update({ data: patch });
    summary.willUpdatePrimaryCount += 1;

    // 标记重复记录
    const dupIds = arr.filter(u => u._id !== primary._id).map(u => u._id);
    summary.willMarkDupCount += dupIds.length;

    const chunkSize = 10;
    for (let i = 0; i < dupIds.length; i += chunkSize) {
      const chunk = dupIds.slice(i, i + chunkSize);
      await db
        .collection('users')
        .where({ _id: _.in(chunk) })
        .update({
          data: {
            _dup_of: primary._id,
            update_time: now
          }
        });
    }
  }

  return { success: true, dryRun: false, summary };
};
