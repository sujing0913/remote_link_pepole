const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  try {
    // 检查 punch_circle 集合是否已存在
    const collections = await db.get({})
    console.log('collections:', collections)
    
    // 创建 punch_circle 集合（如果不存在）
    // 注意：云开发的集合需要通过管理控制台或云 API 创建
    // 这里我们尝试添加一条记录来创建集合
    try {
      await db.collection('punch_circle').add({
        data: {
          _id: 'init_collection',
          isInit: true,
          createTime: new Date()
        }
      })
      
      // 删除初始化记录
      await db.collection('punch_circle').doc('init_collection').remove()
      
      return {
        success: true,
        message: 'punch_circle 集合创建成功'
      }
    } catch (e) {
      // 如果集合已存在，会抛出异常
      if (e.errCode === -502005) {
        return {
          success: true,
          message: 'punch_circle 集合已存在'
        }
      }
      throw e
    }
  } catch (e) {
    console.error('初始化数据库集合失败', e)
    return {
      success: false,
      errMsg: e.message
    }
  }
}
