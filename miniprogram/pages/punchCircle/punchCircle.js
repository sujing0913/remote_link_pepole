const app = getApp()

Page({
  data: {
    posts: [],
    loading: true,
    currentUserOpenId: '',
    currentUserInfo: null
  },

  onLoad: function() {
    // 启用分享功能
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
    
    this.fetchCurrentUser()
  },

  onShow: function() {
    this.fetchPosts()
  },

  // 获取当前用户信息
  fetchCurrentUser: async function() {
    try {
      const { result: user } = await wx.cloud.callFunction({ name: 'getUserInfo' })
      
      if (user && user.openId) {
        this.setData({
          currentUserOpenId: user.openId,
          currentUserInfo: user
        })
      }
    } catch (e) {
      console.error('获取用户信息失败', e)
    }
  },

  // 获取打卡圈帖子
  fetchPosts: async function() {
    this.setData({ loading: true })
    
    try {
      // 调用云函数时传递当前用户的openid
      const { result } = await wx.cloud.callFunction({ 
        name: 'getPunchCircle',
        data: { currentUserId: this.data.currentUserOpenId }
      })
      
      if (result && result.success) {
        this.setData({
          posts: result.data || [],
          loading: false
        })
      } else {
        wx.showToast({
          title: '获取打卡圈失败',
          icon: 'none'
        })
        this.setData({ loading: false })
      }
    } catch (e) {
      console.error('获取打卡圈失败', e)
      wx.showToast({
        title: '获取打卡圈失败',
        icon: 'none'
      })
      this.setData({ loading: false })
    }
  },

  // 点赞
  onLike: async function(e) {
    const { postId, isLiked } = e.currentTarget.dataset
    const action = isLiked ? 'remove' : 'add'
    
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'punchCircleLike',
        data: { postId, action }
      })
      
      if (result && result.success) {
        // 更新本地数据
        const posts = this.data.posts.map(post => {
          if (post._id === postId) {
            return {
              ...post,
              likeCount: result.likeCount,
              isLiked: result.isLiked
            }
          }
          return post
        })
        
        this.setData({ posts })
      }
    } catch (e) {
      console.error('点赞失败', e)
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      })
    }
  },

  // 打开评论弹框
  onComment: function(e) {
    const { postId } = e.currentTarget.dataset
    this.setData({
      commentingPostId: postId,
      showCommentModal: true
    })
  },

  // 关闭评论弹框
  closeCommentModal: function() {
    this.setData({
      showCommentModal: false,
      commentingPostId: '',
      commentContent: ''
    })
  },

  // 评论输入
  onCommentInput: function(e) {
    this.setData({
      commentContent: e.detail.value
    })
  },

  // 提交评论
  submitComment: async function() {
    const { commentingPostId, commentContent } = this.data
    
    if (!commentContent || commentContent.trim() === '') {
      wx.showToast({
        title: '请输入评论内容',
        icon: 'none'
      })
      return
    }
    
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'punchCircleComment',
        data: { postId: commentingPostId, content: commentContent.trim() }
      })
      
      if (result && result.success) {
        wx.showToast({
          title: '评论成功',
          icon: 'success'
        })
        
        this.closeCommentModal()
        this.fetchPosts() // 刷新帖子列表
      }
    } catch (e) {
      console.error('评论失败', e)
      wx.showToast({
        title: '评论失败',
        icon: 'none'
      })
    }
  },

  // 预览媒体文件（支持图片和视频）
  previewMedia: function(e) {
    const { url } = e.currentTarget.dataset
    const post = e.currentTarget.dataset.post
    const mediaType = post.mediaType || 'image'
    
    if (mediaType === 'image') {
      wx.previewImage({
        urls: [url],
        current: url
      })
    } else if (mediaType === 'video') {
      if (wx.previewMedia) {
        wx.previewMedia({
          sources: [{
            url: url,
            type: 'video'
          }]
        })
      } else {
        wx.showToast({ title: '请升级微信查看视频', icon: 'none' })
      }
    }
  },

  // 格式化时间
  formatTime: function(date) {
    if (!date) return ''
    
    const d = new Date(date)
    const hours = d.getHours().toString().padStart(2, '0')
    const minutes = d.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
  }
})
