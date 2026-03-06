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
  
  try {
    const post = await db.collection('punch_circle').doc(postId).get()
    
    if (!post.data) {
      return { success: false, errMsg: '帖子不存在' }
    }
    
    // 获取评论者用户信息
    const user = await getUserInfo(openId)
    const commentUserInfo = user ? {
      nickName: user.nickName || '匿名用户',
      avatarUrl: user.avatarUrl || ''
    } : {
      nickName: '匿名用户',
      avatarUrl: ''
    }
    
    // 创建评论
    const comment = {
      _id: db.serverDate().getTime().toString(),
      openId: openId,
      userInfo: commentUserInfo,
      content: content,
      createTime: new Date()
    }
    
    // 更新帖子的评论数组
    let comments = post.data.comments || []
    comments.push(comment)
    
    await db.collection('punch_circle').doc(postId).update({
      data: {
        comments: comments,
        commentCount: comments.length
      }
    })
    
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
