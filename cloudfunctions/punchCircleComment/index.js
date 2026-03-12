const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

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
  const { postId, content } = event
  const openId = wxContext.OPENID
  
  console.log('punchCircleComment - postId:', postId)
  console.log('punchCircleComment - content:', content)
  console.log('punchCircleComment - openId:', openId)
  
  if (!postId) {
    return { success: false, errMsg: '帖子 ID 不能为空' }
  }
  
  if (!content || content.trim() === '') {
    return { success: false, errMsg: '评论内容不能为空' }
  }
  
  try {
    const postRes = await db.collection('punch_circle').doc(postId).get()
    
    console.log('punchCircleComment - postRes:', postRes)
    
    if (!postRes || !postRes.data) {
      return { success: false, errMsg: '帖子不存在' }
    }
    
    // 获取评论者用户信息
    const user = await getUserInfo(openId)
    console.log('punchCircleComment - user:', user)
    
    const commentUserInfo = user ? {
      nickName: user.nickName || user.nickname || '匿名用户',
      avatarUrl: user.avatarUrl || user.avatar_url || ''
    } : {
      nickName: '匿名用户',
      avatarUrl: ''
    }
    
    // 创建评论 - 使用时间戳作为 ID
    const now = new Date()
    const comment = {
      _id: 'comment_' + now.getTime().toString(),
      openId: openId,
      userInfo: commentUserInfo,
      content: content.trim(),
      createTime: now
    }
    
    console.log('punchCircleComment - comment:', comment)
    
    // 更新帖子的评论数组
    let comments = postRes.data.comments || []
    comments.push(comment)
    
    console.log('punchCircleComment - updating comments:', comments.length)
    
    const updateRes = await db.collection('punch_circle').doc(postId).update({
      data: {
        comments: comments,
        commentCount: comments.length
      }
    })
    
    console.log('punchCircleComment - updateRes:', updateRes)
    
    return {
      success: true,
      comment: comment
    }
  } catch (e) {
    console.error('评论失败', e)
    return {
      success: false,
      errMsg: e.message
    }
  }
}
