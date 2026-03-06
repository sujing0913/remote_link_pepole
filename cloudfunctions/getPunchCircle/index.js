const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 获取今日开始和结束时间
function getTodayRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  return { start, end }
}

// 获取用户信息
async function getUserInfo(openId) {
  try {
    const userRes = await db.collection('users').where({
      openId: openId
    }).get()
    
    if (userRes.data && userRes.data.length > 0) {
      return userRes.data[0]
    }
    return null
  } catch (e) {
    console.error('获取用户信息失败', e)
    return null
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { start, end } = getTodayRange()
  const currentUserId = event.currentUserId // 从前端传入的当前用户openid
  
  try {
    // 获取当前用户的绑定关系
    let boundUserIds = []
    if (currentUserId) {
      // 查询当前用户作为家长绑定的孩子
      const parentBinds = await db.collection('binds')
        .where(db.command.or([
          { parent_openid: currentUserId },
          { parentOpenId: currentUserId }
        ]))
        .get()
      
      // 查询当前用户作为孩子绑定的家长
      const childBinds = await db.collection('binds')
        .where(db.command.or([
          { child_openid: currentUserId },
          { childOpenId: currentUserId }
        ]))
        .get()
      
      // 提取所有绑定的用户ID
      const parentBoundIds = parentBinds.data.map(bind => bind.child_openid || bind.childOpenId).filter(Boolean)
      const childBoundIds = childBinds.data.map(bind => bind.parent_openid || bind.parentOpenId).filter(Boolean)
      boundUserIds = [...new Set([...parentBoundIds, ...childBoundIds, currentUserId])] // 包括自己
    }
    
    // 构建查询条件
    let queryCondition = {
      createTime: _.gte(start).and(_.lte(end))
    }
    
    // 如果有绑定关系，只查询绑定用户和自己的帖子
    if (boundUserIds.length > 0) {
      queryCondition.puncherOpenId = _.in(boundUserIds)
    }
    
    // 获取打卡圈帖子
    const postsRes = await db.collection('punch_circle')
      .where(queryCondition)
      .orderBy('createTime', 'desc')
      .get()
    
    const posts = postsRes.data || []
    
    // 为每个帖子处理用户信息（直接使用保存的 userInfo，如果没有则使用默认值）
    const enrichedPosts = posts.map(post => {
      const savedUserInfo = post.userInfo || {}
      return {
        ...post,
        userInfo: {
          nickName: savedUserInfo.nickName || '匿名用户',
          avatarUrl: savedUserInfo.avatarUrl || ''
        }
      }
    })
    
    return {
      success: true,
      data: enrichedPosts
    }
  } catch (e) {
    console.error('获取打卡圈失败', e)
    return {
      success: false,
      errMsg: e.message
    }
  }
}
