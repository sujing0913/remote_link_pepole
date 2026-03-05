// cloudfunctions/initDbCollections/index.js
// 初始化云开发数据库集合：users / binds / check_ins
// 通过“插入一条占位记录再删除”触发集合创建（避免控制台手动创建）
//
// 用法：在云开发控制台部署该云函数后手动运行一次。

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function ensureCollection(name) {
  try {
    // 如果集合不存在，这里会抛错；若存在则正常返回
    await db.collection(name).limit(1).get();
    return { name, created: false };
  } catch (e) {
    const r = await db.collection(name).add({
      data: {
        __init: true,
        create_time: new Date()
      }
    });
    await db.collection(name).doc(r._id).remove();
    return { name, created: true };
  }
}

exports.main = async () => {
  try {
    const results = [];
    results.push(await ensureCollection('users'));
    results.push(await ensureCollection('binds'));
    results.push(await ensureCollection('check_ins'));
    results.push(await ensureCollection('notifications'));

    // 索引建议：
    // binds: parent_openid + status
    // binds: child_openid + status
    // users: bind_code
    // notifications: parent_openid + read + create_time
    //
    // 注意：小程序云开发的 createIndex 能力在部分 SDK/环境下不可用，
    // 如需索引，请在云开发控制台数据库 -> 索引 中手动创建。

    return { success: true, results };
  } catch (err) {
    console.error(err);
    return { success: false, message: err.message || 'init failed' };
  }
};
