const app = getApp()

Page({
  data: {
    posts: [],
    loading: true,
    currentUserOpenId: '',
    currentUserInfo: null,
    
    // 科目过滤
    subjects: ['全部', '语文', '数学', '英语', '减肥', '生活', '健身', '其他'],
    selectedSubjectIndex: 0, // 默认全部
    
    // 设置相关
    showSettingsModal: false,
    punchCirclePublic: false, // 打卡圈公开设置
    tempPunchCirclePublic: false // 临时值，用于弹框中
  },

  onLoad: function() {
    // 启用分享功能
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
    
    this.fetchCurrentUser()
    this.fetchUserSettings()
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

  // 获取用户设置（打卡圈公开状态）
  fetchUserSettings: async function() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getUserInfo'
      })
      
      if (result && result.punchCirclePublic !== undefined) {
        this.setData({
          punchCirclePublic: result.punchCirclePublic,
          tempPunchCirclePublic: result.punchCirclePublic
        })
      } else {
        // 默认关闭
        this.setData({
          punchCirclePublic: false,
          tempPunchCirclePublic: false
        })
      }
    } catch (e) {
      console.error('获取用户设置失败', e)
      // 默认关闭
      this.setData({
        punchCirclePublic: false,
        tempPunchCirclePublic: false
      })
    }
  },

  // 打开设置弹框
  openSettings: function() {
    this.setData({
      showSettingsModal: true,
      tempPunchCirclePublic: this.data.punchCirclePublic
    })
  },

  // 关闭设置弹框
  closeSettings: function() {
    this.setData({
      showSettingsModal: false
    })
  },

  // 公开开关切换
  onPublicSwitchChange: function(e) {
    this.setData({
      tempPunchCirclePublic: e.detail.value
    })
  },

  // 保存设置
  saveSettings: async function() {
    try {
      wx.showLoading({ title: '保存中...' })
      
      const { result } = await wx.cloud.callFunction({
        name: 'updateMyProfile',
        data: {
          punchCirclePublic: this.data.tempPunchCirclePublic
        }
      })
      
      wx.hideLoading()
      
      if (result && result.success) {
        this.setData({
          punchCirclePublic: this.data.tempPunchCirclePublic,
          showSettingsModal: false
        })
        
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        })
        
        // 刷新打卡圈列表（权限变化后可能需要重新加载）
        this.fetchPosts()
      } else {
        wx.showToast({
          title: result?.message || '保存失败',
          icon: 'none'
        })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('保存设置失败', e)
      wx.showToast({
        title: '保存失败：' + (e.errMsg || e.message || '未知错误'),
        icon: 'none'
      })
    }
  },

  // 获取打卡圈帖子
  fetchPosts: async function() {
    this.setData({ loading: true })
    
    try {
      // 确保 currentUserOpenId 已获取
      if (!this.data.currentUserOpenId) {
        console.warn('currentUserOpenId 未获取，先获取用户信息')
        await this.fetchCurrentUser()
      }
      
      // 获取当前选中的科目
      const selectedSubject = this.data.subjects[this.data.selectedSubjectIndex]
      
      // 调用云函数时传递当前用户的 openid 和科目过滤条件
      const { result } = await wx.cloud.callFunction({ 
        name: 'getPunchCircle',
        data: { 
          currentUserId: this.data.currentUserOpenId,
          subject: selectedSubject === '全部' ? '' : selectedSubject
        }
      })
      
      console.log('getPunchCircle result:', result)
      
      if (result && result.success) {
        this.setData({
          posts: result.data || [],
          loading: false
        })
      } else {
        console.error('获取打卡圈失败 - result:', result)
        wx.showToast({
          title: result?.errMsg || '获取打卡圈失败',
          icon: 'none'
        })
        this.setData({ loading: false })
      }
    } catch (e) {
      console.error('获取打卡圈失败 - error:', e)
      wx.showToast({
        title: '获取失败：' + (e.errMsg || e.message || '请重试'),
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

  // 格式化日期时间
  formatDateTime: function(date) {
    if (!date) return ''
    
    const d = new Date(date)
    const now = new Date()
    
    // 格式化日期：YYYY-MM-DD
    const year = d.getFullYear()
    const month = (d.getMonth() + 1).toString().padStart(2, '0')
    const day = d.getDate().toString().padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`
    
    // 判断是否是今天
    const isToday = d.getFullYear() === now.getFullYear() &&
                    d.getMonth() === now.getMonth() &&
                    d.getDate() === now.getDate()
    
    if (isToday) {
      // 今天显示（今天）
      return `${dateStr} (今天)`
    } else {
      // 其他日期只显示日期
      return dateStr
    }
  },
  
  // 格式化时间（保留原有函数兼容旧代码）
  formatTime: function(date) {
    if (!date) return ''
    
    const d = new Date(date)
    const hours = d.getHours().toString().padStart(2, '0')
    const minutes = d.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
  },
  
  // 科目切换（picker 选择器）
  onSubjectChange: function(e) {
    const { value } = e.detail
    this.setData({
      selectedSubjectIndex: parseInt(value)
    })
    this.fetchPosts()
  }
})
