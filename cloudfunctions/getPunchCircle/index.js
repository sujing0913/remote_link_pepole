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

// 获取与当前用户有绑定关系的所有用户 ID（包括间接绑定）
async function getBoundUserIds(db, currentUserId) {
  if (!currentUserId) return []
  
  const boundUserIds = new Set([currentUserId]) // 包括自己
  
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
  
  // 提取所有直接绑定的用户 ID
  const parentBoundIds = parentBinds.data.map(bind => bind.child_openid || bind.childOpenId).filter(Boolean)
  const childBoundIds = childBinds.data.map(bind => bind.parent_openid || bind.parentOpenId).filter(Boolean)
  
  parentBoundIds.forEach(id => boundUserIds.add(id))
  childBoundIds.forEach(id => boundUserIds.add(id))
  
  // 获取同一家长下的所有孩子（兄弟姐妹）
  // 遍历所有绑定的家长，获取该家长下的所有孩子
  for (const parentId of childBoundIds) {
    const siblingBinds = await db.collection('binds')
      .where({
        parent_openid: parentId,
        status: 1
      })
      .get()
    
    const siblingIds = siblingBinds.data.map(bind => bind.child_openid || bind.childOpenId).filter(Boolean)
    siblingIds.forEach(id => boundUserIds.add(id))
  }
  
  return [...boundUserIds]
}

// 获取所有公开打卡圈的用户 ID
async function getPublicUserIds(db) {
  const publicUsersRes = await db.collection('users')
    .where({
      punchCirclePublic: true
    })
    .field({
      openId: true,
      _openid: true
    })
    .get()
  
  const publicUsers = publicUsersRes.data || []
  return publicUsers.map(u => u.openId || u._openid).filter(Boolean)
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { start, end } = getTodayRange()
  const currentUserId = event.currentUserId // 从前端传入的当前用户 openid
  const subject = event.subject // 从前端传入的科目过滤条件
  
  try {
    console.log('getPunchCircle - currentUserId:', currentUserId)
    console.log('getPunchCircle - time range:', start, end)
    console.log('getPunchCircle - subject:', subject)
    
    // 1. 获取公开打卡圈的用户 ID 列表
    const publicUserIds = await getPublicUserIds(db)
    console.log('getPunchCircle - publicUserIds:', publicUserIds)
    
    // 2. 获取与当前用户有绑定关系的所有用户 ID
    const boundUserIds = await getBoundUserIds(db, currentUserId)
    console.log('getPunchCircle - boundUserIds:', boundUserIds)
    
    // 3. 合并公开用户和绑定用户的 ID（去重）
    const visibleUserIds = [...new Set([...publicUserIds, ...boundUserIds])]
    console.log('getPunchCircle - visibleUserIds:', visibleUserIds)
    
    // 构建查询条件
    let queryCondition = {
      createTime: _.gte(start).and(_.lte(end))
    }
    
    // 添加科目过滤条件
    if (subject) {
      queryCondition.subject = subject
    }
    
    // 只查询可见用户的帖子
    if (visibleUserIds.length > 0) {
      // 使用 db.command.or 同时匹配 openId 和 puncherOpenId 字段
      queryCondition = db.command.and([
        queryCondition,
        db.command.or([
          { openId: _.in(visibleUserIds) },
          { puncherOpenId: _.in(visibleUserIds) }
        ])
      ])
    } else {
      // 如果没有可见用户，返回空列表
      console.log('getPunchCircle - 没有可见用户，返回空列表')
      return {
        success: true,
        data: []
      }
    }
    
    console.log('getPunchCircle - queryCondition:', queryCondition)
    
    // 获取打卡圈帖子
    const postsRes = await db.collection('punch_circle')
      .where(queryCondition)
      .orderBy('createTime', 'desc')
      .get()
    
    console.log('getPunchCircle - postsRes:', postsRes)
    
    const posts = postsRes.data || []
    
    // 为每个帖子处理用户信息和点赞状态
    const enrichedPosts = posts.map(post => {
      const savedUserInfo = post.userInfo || {}
      const likes = post.likes || []
      return {
        ...post,
        userInfo: {
          nickName: savedUserInfo.nickName || '匿名用户',
          avatarUrl: savedUserInfo.avatarUrl || ''
        },
        isLiked: currentUserId && likes.includes(currentUserId),
        likeCount: post.likeCount || likes.length,
        commentCount: post.commentCount || (post.comments ? post.comments.length : 0)
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
