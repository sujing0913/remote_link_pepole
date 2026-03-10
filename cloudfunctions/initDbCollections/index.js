// cloudfunctions/initDbCollections/index.js
// 初始化数据库集合和索引
// 用于优化 users 数据库查询性能，支持家长、孩子、普通用户三种角色

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 角色常量
const ROLE = {
  NORMAL: 'normal',
  PARENT: 'parent',
  CHILD: 'child'
};

/**
 * 尝试创建索引（如果不存在）
 * 注意：云开发数据库索引需要在控制台手动创建，这里只做提示
 */
async function tryCreateIndex(collectionName, indexName, fields) {
  console.log(`建议为集合 [${collectionName}] 创建索引：${indexName}`);
  console.log(`索引字段：${JSON.stringify(fields)}`);
  console.log('请在微信云开发控制台手动创建此索引');
  return { suggested: true, collection: collectionName, index: indexName, fields };
}

/**
 * 初始化 users 集合
 */
async function initUsersCollection() {
  const collectionName = 'users';
  const results = [];

  try {
    // 尝试插入一条测试记录来验证集合是否存在
    const testOpenId = '_init_check_' + Date.now();
    await db.collection(collectionName).add({
      data: {
        openid: testOpenId,
        _openid: testOpenId,
        role: ROLE.NORMAL,
        nickName: '初始化检查',
        create_time: db.serverDate(),
        update_time: db.serverDate()
      }
    });

    // 删除测试记录
    await db.collection(collectionName).where({
      openid: testOpenId
    }).remove();

    results.push({ collection: collectionName, status: 'exists', message: '集合已存在' });
  } catch (e) {
    if (e.errCode === -502005 || e.message.includes('not found')) {
      results.push({ collection: collectionName, status: 'not_exists', message: '集合不存在，请在云开发控制台创建' });
    } else {
      results.push({ collection: collectionName, status: 'error', message: e.message });
    }
  }

  // 建议的索引
  const suggestedIndexes = [
    { name: 'openid_idx', fields: { openid: 1 }, unique: true },
    { name: '_openid_idx', fields: { _openid: 1 }, unique: true },
    { name: 'role_idx', fields: { role: 1 } },
    { name: 'bind_code_idx', fields: { bind_code: 1 }, unique: true },
    { name: 'role_openid_idx', fields: { role: 1, openid: 1 } },
    { name: 'create_time_idx', fields: { create_time: -1 } }
  ];

  for (const idx of suggestedIndexes) {
    const idxResult = await tryCreateIndex(collectionName, idx.name, idx.fields);
    results.push(idxResult);
  }

  return results;
}

/**
 * 初始化 binds 集合
 */
async function initBindsCollection() {
  const collectionName = 'binds';
  const results = [];

  try {
    const testId = '_init_check_' + Date.now();
    await db.collection(collectionName).add({
      data: {
        _id: testId,
        parent_openid: testId + '_parent',
        child_openid: testId + '_child',
        status: 1,
        create_time: db.serverDate(),
        update_time: db.serverDate()
      }
    });

    // 删除测试记录
    await db.collection(collectionName).doc(testId).remove();

    results.push({ collection: collectionName, status: 'exists', message: '集合已存在' });
  } catch (e) {
    if (e.errCode === -502005 || e.message.includes('not found')) {
      results.push({ collection: collectionName, status: 'not_exists', message: '集合不存在，请在云开发控制台创建' });
    } else {
      results.push({ collection: collectionName, status: 'error', message: e.message });
    }
  }

  // 建议的索引
  const suggestedIndexes = [
    { name: 'parent_openid_idx', fields: { parent_openid: 1, status: 1 } },
    { name: 'child_openid_idx', fields: { child_openid: 1, status: 1 } },
    { name: 'parent_child_idx', fields: { parent_openid: 1, child_openid: 1, status: 1 }, unique: true },
    { name: 'create_time_idx', fields: { create_time: -1 } }
  ];

  for (const idx of suggestedIndexes) {
    const idxResult = await tryCreateIndex(collectionName, idx.name, idx.fields);
    results.push(idxResult);
  }

  return results;
}

/**
 * 初始化 check_ins 集合
 */
async function initCheckInsCollection() {
  const collectionName = 'check_ins';
  const results = [];

  try {
    const testId = '_init_check_' + Date.now();
    await db.collection(collectionName).add({
      data: {
        _id: testId,
        puncherOpenId: testId,
        mediaUrl: 'test',
        mediaType: 'image',
        subject: '英语',
        score: -1,
        createTime: db.serverDate()
      }
    });

    // 删除测试记录
    await db.collection(collectionName).doc(testId).remove();

    results.push({ collection: collectionName, status: 'exists', message: '集合已存在' });
  } catch (e) {
    if (e.errCode === -502005 || e.message.includes('not found')) {
      results.push({ collection: collectionName, status: 'not_exists', message: '集合不存在，请在云开发控制台创建' });
    } else {
      results.push({ collection: collectionName, status: 'error', message: e.message });
    }
  }

  // 建议的索引
  const suggestedIndexes = [
    { name: 'puncher_openid_idx', fields: { puncherOpenId: 1 } },
    { name: 'subject_idx', fields: { subject: 1 } },
    { name: 'create_time_idx', fields: { createTime: -1 } },
    { name: 'puncher_subject_time_idx', fields: { puncherOpenId: 1, subject: 1, createTime: -1 } }
  ];

  for (const idx of suggestedIndexes) {
    const idxResult = await tryCreateIndex(collectionName, idx.name, idx.fields);
    results.push(idxResult);
  }

  return results;
}

/**
 * 初始化 wordbook 集合
 */
async function initWordbookCollection() {
  const collectionName = 'wordbook';
  const results = [];

  try {
    const testId = '_init_check_' + Date.now();
    await db.collection(collectionName).add({
      data: {
        _id: testId,
        word: 'test',
        createTime: db.serverDate()
      }
    });

    // 删除测试记录
    await db.collection(collectionName).doc(testId).remove();

    results.push({ collection: collectionName, status: 'exists', message: '集合已存在' });
  } catch (e) {
    if (e.errCode === -502005 || e.message.includes('not found')) {
      results.push({ collection: collectionName, status: 'not_exists', message: '集合不存在，请在云开发控制台创建' });
    } else {
      results.push({ collection: collectionName, status: 'error', message: e.message });
    }
  }

  // 建议的索引
  const suggestedIndexes = [
    { name: 'word_idx', fields: { word: 1 }, unique: false },
    { name: 'create_time_idx', fields: { createTime: -1 } },
    { name: 'owner_word_idx', fields: { ownerOpenId: 1, word: 1 } }
  ];

  for (const idx of suggestedIndexes) {
    const idxResult = await tryCreateIndex(collectionName, idx.name, idx.fields);
    results.push(idxResult);
  }

  return results;
}

/**
 * 清理脏数据（可选）
 * 清理 role 字段为空字符串的记录，统一设置为 'normal'
 */
async function cleanupUserData() {
  const result = {
    cleaned: 0,
    errors: []
  };

  try {
    // 查找 role 为空字符串的用户
    const usersWithEmptyRole = await db
      .collection('users')
      .where({ role: '' })
      .get();

    if (usersWithEmptyRole.data && usersWithEmptyRole.data.length > 0) {
      const updatePromises = usersWithEmptyRole.data.map(user => 
        db.collection('users').doc(user._id).update({
          data: {
            role: ROLE.NORMAL,
            role_update_time: db.serverDate()
          }
        })
      );

      await Promise.all(updatePromises);
      result.cleaned = usersWithEmptyRole.data.length;
    }
  } catch (e) {
    result.errors.push(e.message);
  }

  return result;
}

exports.main = async (event, context) => {
  const { action = 'init', cleanup = false } = event || {};
  
  const results = {
    action: action,
    timestamp: new Date(),
    collections: [],
    cleanup: null
  };

  try {
    if (action === 'init' || action === 'all') {
      const usersResult = await initUsersCollection();
      const bindsResult = await initBindsCollection();
      const checkInsResult = await initCheckInsCollection();
      const wordbookResult = await initWordbookCollection();

      results.collections = [
        ...usersResult,
        ...bindsResult,
        ...checkInsResult,
        ...wordbookResult
      ];
    }

    if (cleanup) {
      const cleanupResult = await cleanupUserData();
      results.cleanup = cleanupResult;
    }

    return {
      success: true,
      message: '初始化完成',
      data: results
    };
  } catch (err) {
    console.error('initDbCollections failed:', err);
    return {
      success: false,
      message: err.message || '初始化失败',
      data: results
    };
  }
};
