const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { postId, action } = event // action: 'add' or 'remove'
  const openId = wxContext.OPENID
  
  try {
    const post = await db.collection('punch_circle').doc(postId).get()
    
    if (!post.data) {
      return { success: false, errMsg: '帖子不存在' }
    }
    
    let likes = post.data.likes || []
    let likeCount = post.data.likeCount || 0
    
    if (action === 'add') {
      // 检查是否已点赞
      if (!likes.includes(openId)) {
        likes.push(openId)
        likeCount++
      }
    } else if (action === 'remove') {
      // 取消点赞
      const index = likes.indexOf(openId)
      if (index > -1) {
        likes.splice(index, 1)
        likeCount--
      }
    }
    
    await db.collection('punch_circle').doc(postId).update({
      data: {
        likes: likes,
        likeCount: likeCount
      }
    })
    
    return {
      success: true,
      likeCount: likeCount,
      isLiked: likes.includes(openId)
    }
  } catch (e) {
    console.error('点赞失败', e)
    return {
      success: false,
      errMsg: e.message
    }
  }
}
