const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  try {
    const results = []
    
    // 1. 初始化 users 集合 - 为所有现有用户添加 punchCirclePublic 字段（默认 false）
    try {
      const usersRes = await db.collection('users').get()
      let updatedCount = 0
      
      for (const user of usersRes.data) {
        if (user.punchCirclePublic === undefined) {
          await db.collection('users').where({
            _id: user._id
          }).update({
            data: {
              punchCirclePublic: false
            }
          })
          updatedCount++
        }
      }
      
      results.push({
        collection: 'users',
        action: 'add punchCirclePublic field',
        updatedCount: updatedCount
      })
    } catch (e) {
      results.push({
        collection: 'users',
        action: 'add punchCirclePublic field',
        error: e.message
      })
    }
    
    // 2. 创建索引 - punchCirclePublic 字段索引（用于快速查询公开用户）
    try {
      // 注意：索引需要在微信云开发控制台手动创建
      // 这里只是记录需要创建的索引
      results.push({
        collection: 'users',
        action: '建议创建索引',
        index: 'punchCirclePublic: 1'
      })
    } catch (e) {
      results.push({
        collection: 'users',
        action: '创建索引',
        error: e.message
      })
    }
    
    // 3. 初始化 punch_circle 集合（如果不存在）
    try {
      await db.collection('punch_circle').add({
        data: {
          _id: 'init_collection',
          isInit: true,
          createTime: new Date()
        }
      });
      
      // 删除初始化记录
      await db.collection('punch_circle').doc('init_collection').remove();
      
      results.push({
        collection: 'punch_circle',
        action: 'created'
      });
    } catch (e) {
      if (e.errCode === -502005) {
        results.push({
          collection: 'punch_circle',
          action: 'already exists'
        });
      } else {
        results.push({
          collection: 'punch_circle',
          action: 'create failed',
          error: e.message
        });
      }
    }
    
    // 4. 初始化 tasks 集合（如果不存在）
    try {
      await db.collection('tasks').add({
        data: {
          _id: 'init_collection',
          isInit: true,
          createTime: new Date()
        }
      });
      
      // 删除初始化记录
      await db.collection('tasks').doc('init_collection').remove();
      
      results.push({
        collection: 'tasks',
        action: 'created'
      });
    } catch (e) {
      if (e.errCode === -502005) {
        results.push({
          collection: 'tasks',
          action: 'already exists'
        });
      } else {
        results.push({
          collection: 'tasks',
          action: 'create failed',
          error: e.message
        });
      }
    }
    
    return {
      success: true,
      message: '初始化完成',
      results: results
    }
  } catch (e) {
    console.error('初始化数据库集合失败', e)
    return {
      success: false,
      errMsg: e.message
    }
  }
}
