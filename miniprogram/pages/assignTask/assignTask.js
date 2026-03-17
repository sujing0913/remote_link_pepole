Page({
  data: {
    childOpenId: '',
    childName: '',
    subjects: [
      { name: '语文', icon: '📖' },
      { name: '数学', icon: '🔢' },
      { name: '英语', icon: '🔤' },
      { name: '减肥', icon: '🏃' },
      { name: '生活', icon: '🏠' },
      { name: '健身', icon: '💪' },
      { name: '其他', icon: '📌' }
    ],
    selectedSubjectIndex: 1,
    selectedSubject: { name: '数学', icon: '🔢' },
    
    // 年份和月份选项
    yearOptions: [],
    selectedYearIndex: 0,
    monthOptions: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
    selectedMonthIndex: 0,
    
    taskContent: '',
    mediaType: '',
    mediaTempPath: '',
    mediaPreviewUrl: '',
    mediaFileId: '',
    deadlineDate: '',
    currentUserOpenId: '',
    historyTasks: [],
    loadingTasks: false,
    videoLoaded: false
  },

  onLoad: function(options) {
    this.setData({
      childOpenId: options.childOpenId || '',
      childName: decodeURIComponent(options.childName || '孩子')
    });
    
    this.initYearOptions();
    this.getCurrentUserOpenId();
  },

  onShow: function() {
    this.loadHistoryTasks();
  },

  // 初始化年份选项（当前年和前一年）
  initYearOptions: function() {
    const currentYear = new Date().getFullYear();
    const yearOptions = [];
    for (let i = currentYear; i >= currentYear - 1; i--) {
      yearOptions.push(String(i));
    }
    this.setData({ yearOptions });
  },

  async getCurrentUserOpenId() {
    try {
      const { result: user } = await wx.cloud.callFunction({ name: 'getUserInfo' });
      if (user && user.openId) {
        this.setData({
          currentUserOpenId: user.openId
        });
      }
    } catch (e) {
      console.error('获取用户信息失败', e);
    }
  },

  // 科目选择变化
  onSubjectChange: function(e) {
    const index = e.detail.value;
    const subject = this.data.subjects[index];
    this.setData({
      selectedSubjectIndex: index,
      selectedSubject: subject
    }, () => {
      this.loadHistoryTasks();
    });
  },

  // 年份选择变化
  onYearChange: function(e) {
    const index = e.detail.value;
    this.setData({
      selectedYearIndex: index
    }, () => {
      this.loadHistoryTasks();
    });
  },

  // 月份选择变化
  onMonthChange: function(e) {
    const index = e.detail.value;
    this.setData({
      selectedMonthIndex: index
    }, () => {
      this.loadHistoryTasks();
    });
  },

  onContentInput: function(e) {
    this.setData({
      taskContent: e.detail.value
    });
  },

  // 视频加载完成
  onVideoReady: function() {
    console.log('视频加载完成');
    this.setData({ videoLoaded: true });
  },

  // 视频加载错误
  onVideoError: function(e) {
    console.error('视频加载错误', e);
    this.setData({ videoLoaded: false });
    wx.showToast({
      title: '视频加载失败，请尝试重新选择',
      icon: 'none',
      duration: 2000
    });
  },

  // 选择媒体文件（拍摄/相册）
  chooseMedia: function() {
    const that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image', 'video'],
      sourceType: ['album', 'camera'],
      maxDuration: 60,
      camera: 'back',
      success: (res) => {
        const tempFile = res.tempFiles[0];
        const type = res.type;
        
        that.setData({
          mediaType: type,
          mediaTempPath: tempFile.tempFilePath,
          mediaPreviewUrl: tempFile.tempFilePath
        });
      }
    });
  },

  // 从微信聊天中选择媒体文件（云函数方式）
  chooseMediaFromChat: function() {
    const that = this;
    
    console.log('开始调用 chooseMessageFile 云函数...');
    
    // 先调用云函数获取用户信息和环境
    wx.cloud.callFunction({
      name: 'chooseMessageFile',
      success: (cloudRes) => {
        console.log('云函数返回', cloudRes);
        
        // 云函数就绪后，在小程序端调用 chooseMessageFile
        // type 参数必须是字符串，使用 'all' 支持图片和视频
        wx.chooseMessageFile({
          count: 1,
          type: 'all', // 支持图片和视频（all/image/video/file）
          success: async (res) => {
            console.log('chooseMessageFile 成功', res);
            const tempFile = res.tempFiles[0];
            
            // 详细日志 - 注意：chooseMessageFile 返回的是 path 而不是 tempFilePath
            let filePath = tempFile.path || tempFile.tempFilePath;
            
            console.log('文件信息:', {
              name: tempFile.name,
              path: filePath,
              size: tempFile.size,
              type: tempFile.type,
              fileType: tempFile.fileType
            });
            
            // 优先使用 API 返回的 type 字段
            let type = tempFile.type || '';
            
            // 如果 type 为空，根据文件名判断类型
            if (!type) {
              const fileExt = tempFile.name.split('.').pop().toLowerCase();
              const isVideo = ['mp4', 'mov', 'avi', 'wmv', '3gp', 'mkv', 'flv', 'webm'].includes(fileExt);
              type = isVideo ? 'video' : 'image';
              console.log('根据文件名判断类型:', fileExt, '->', type);
            }
            
            console.log('最终文件类型:', type);
            
            // 如果路径为空，说明微信版本较低或文件类型不支持
            if (!filePath) {
              console.log('文件路径为空，该文件类型不支持直接访问');
              wx.showModal({
                title: '提示',
                content: '您选择的文件无法直接访问，请使用"拍摄/相册"按钮选择图片或视频',
                showCancel: false
              });
              return;
            }
            
            console.log('文件路径:', filePath);
            
            // 设置数据 - 先设置基本信息
            that.setData({
              mediaType: type,
              mediaTempPath: filePath,
              mediaPreviewUrl: filePath,
              videoLoaded: false // 重置视频加载状态
            });
            
            // 处理视频文件
            if (type === 'video') {
              console.log('视频文件路径:', filePath);
              
              // 检查是否是云文件 ID
              if (filePath.startsWith('cloud://')) {
                console.log('云存储视频文件，需要获取临时链接');
                wx.cloud.getTempFileURL({
                  fileList: [filePath],
                  success: (cloudUrlRes) => {
                    console.log('获取云视频临时链接成功', cloudUrlRes);
                    if (cloudUrlRes.fileList && cloudUrlRes.fileList.length > 0) {
                      const tempVideoUrl = cloudUrlRes.fileList[0].tempFileURL;
                      console.log('视频临时链接:', tempVideoUrl);
                      that.setData({
                        mediaPreviewUrl: tempVideoUrl
                      });
                    }
                  },
                  fail: (cloudErr) => {
                    console.error('获取云视频临时链接失败', cloudErr);
                  }
                });
              }
              // 检查是否是 http/https 开头的网络路径
              else if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
                console.log('网络视频路径，直接使用');
                that.setData({
                  mediaPreviewUrl: filePath
                });
              }
              // 本地路径，直接使用
              else {
                console.log('本地视频路径，直接使用');
                that.setData({
                  mediaPreviewUrl: filePath
                });
              }
            }
            
            wx.showToast({
              title: '已选择：' + tempFile.name,
              icon: 'success',
              duration: 1500
            });
          },
          fail: (err) => {
            console.error('chooseMessageFile 失败', err);
            const errMsg = err.errMsg || '';
            
            // 用户取消
            if (errMsg.includes('cancel') || errMsg.includes('Cancel')) {
              console.log('用户取消选择');
              return;
            }
            
            // 详细错误日志
            console.error('完整错误信息:', JSON.stringify(err));
            
            // 直接提示使用相册方式
            wx.showModal({
              title: '提示',
              content: '从聊天选择不可用，是否使用拍摄/相册方式？',
              confirmText: '使用相册',
              cancelText: '取消',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  that.chooseMedia();
                }
              }
            });
          }
        });
      },
      fail: (err) => {
        console.error('云函数调用失败', err);
        wx.showToast({
          title: '云函数未部署，请先部署 chooseMessageFile',
          icon: 'none',
          duration: 2000
        });
      }
    });
  },

  previewMedia: function() {
    const that = this;
    if (that.data.mediaType === 'image') {
      wx.previewImage({
        urls: [that.data.mediaPreviewUrl],
        current: that.data.mediaPreviewUrl
      });
    } else if (that.data.mediaType === 'video') {
      wx.previewMedia({
        sources: [{
          url: that.data.mediaPreviewUrl,
          type: 'video'
        }]
      });
    }
  },

  removeMedia: function() {
    this.setData({
      mediaType: '',
      mediaTempPath: '',
      mediaPreviewUrl: '',
      mediaFileId: ''
    });
  },

  // 查看附件
  viewAttachment: async function(e) {
    const task = e.currentTarget.dataset.task;
    if (!task || !task.mediaUrl) {
      wx.showToast({ title: '附件不存在', icon: 'none' });
      return;
    }
    
    let mediaUrl = task.mediaUrl;
    const mediaType = task.mediaType || '';
    
    // 如果是云存储文件 ID，需要获取临时链接
    if (mediaUrl && mediaUrl.startsWith('cloud://')) {
      try {
        const tempUrlRes = await wx.cloud.getTempFileURL({ fileList: [mediaUrl] });
        if (tempUrlRes.fileList && tempUrlRes.fileList.length > 0) {
          mediaUrl = tempUrlRes.fileList[0].tempFileURL;
        }
      } catch (err) {
        console.error('获取临时链接失败', err);
        wx.showToast({ title: '获取附件失败', icon: 'none' });
        return;
      }
    }
    
    // 根据类型选择预览方式
    if (mediaType === 'image') {
      wx.previewImage({
        urls: [mediaUrl],
        current: mediaUrl
      });
    } else if (mediaType === 'video') {
      wx.previewMedia({
        sources: [{
          url: mediaUrl,
          type: 'video'
        }]
      });
    } else {
      // 未知类型，提示用户
      wx.showToast({ 
        title: '不支持的文件类型', 
        icon: 'none',
        duration: 2000
      });
    }
  },

  onDeadlineChange: function(e) {
    this.setData({
      deadlineDate: e.detail.value
    });
  },

  // 加载历史任务 - 使用云函数
  async loadHistoryTasks() {
    const that = this;
    
    // 确保 selectedSubject 存在
    if (!that.data.selectedSubject || !that.data.selectedSubject.name) {
      const defaultSubject = that.data.subjects[that.data.selectedSubjectIndex] || that.data.subjects[1];
      that.setData({
        selectedSubject: defaultSubject
      });
    }
    
    this.setData({ loadingTasks: true });
    
    try {
      const result = await wx.cloud.callFunction({
        name: 'getTasks',
        data: {
          childOpenId: that.data.childOpenId,
          subject: that.data.selectedSubject ? that.data.selectedSubject.name : '数学',
          year: that.data.yearOptions[that.data.selectedYearIndex],
          month: that.data.monthOptions[that.data.selectedMonthIndex]
        }
      });
      
      if (result.result && result.result.success) {
        this.setData({
          historyTasks: result.result.data,
          loadingTasks: false
        });
      } else {
        console.error('获取任务失败', result.result?.errMsg);
        this.setData({
          loadingTasks: false
        });
        
        // 如果是集合不存在，提示用户初始化
        if (result.result?.errMsg && result.result.errMsg.includes('DATABASE_COLLECTION_NOT_EXIST')) {
          wx.showModal({
            title: '提示',
            content: '任务数据库尚未初始化，是否立即初始化？',
            confirmText: '去初始化',
            success: (res) => {
              if (res.confirm) {
                that.initTasksCollection();
              }
            }
          });
        }
      }
    } catch (err) {
      console.error('加载历史任务失败', err);
      this.setData({
        loadingTasks: false
      });
    }
  },

  // 初始化 tasks 集合
  async initTasksCollection() {
    wx.showLoading({ title: '初始化中...' });
    
    try {
      const result = await wx.cloud.callFunction({
        name: 'initDb'
      });
      
      wx.hideLoading();
      
      if (result.result && result.result.success) {
        wx.showModal({
          title: '提示',
          content: '初始化完成！请重新进入页面。',
          showCancel: false,
          success: () => {
            // 重新加载任务
            this.loadHistoryTasks();
          }
        });
      } else {
        wx.showModal({
          title: '提示',
          content: '初始化失败：' + (result.result?.errMsg || '未知错误'),
          showCancel: false
        });
      }
    } catch (err) {
      console.error('初始化 tasks 集合失败', err);
      wx.hideLoading();
      wx.showModal({
        title: '提示',
        content: '初始化失败：' + (err.errMsg || '未知错误'),
        showCancel: false
      });
    }
  },

  // 创建任务 - 使用云函数
  submitTask: async function() {
    const that = this;
    
    // 确保 selectedSubject 存在
    if (!that.data.selectedSubject || !that.data.selectedSubject.name) {
      const defaultSubject = that.data.subjects[that.data.selectedSubjectIndex] || that.data.subjects[1];
      that.setData({
        selectedSubject: defaultSubject
      });
    }
    
    if (!that.data.taskContent.trim() && !that.data.mediaTempPath) {
      wx.showToast({ title: '请输入任务要求或上传媒体文件', icon: 'none' });
      return;
    }
    
    if (!that.data.childOpenId) {
      wx.showToast({ title: '孩子信息无效', icon: 'none' });
      return;
    }
    
    wx.showLoading({ title: '创建中...' });
    
    try {
      let mediaUrl = '';
      
      if (that.data.mediaTempPath) {
        const suffix = /\.[^\.]+$/.exec(that.data.mediaTempPath)[0] || '.jpg';
        const cloudPath = `tasks/${Date.now()}-${Math.floor(Math.random() * 1000)}${suffix}`;
        
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: that.data.mediaTempPath
        });
        
        mediaUrl = uploadRes.fileID;
        that.setData({ mediaFileId: mediaUrl });
      }
      
      // 调用云函数创建任务
      const result = await wx.cloud.callFunction({
        name: 'createTask',
        data: {
          parentId: that.data.currentUserOpenId,
          childOpenId: that.data.childOpenId,
          childName: that.data.childName,
          subject: that.data.selectedSubject.name,
          content: that.data.taskContent.trim(),
          mediaType: that.data.mediaType,
          mediaUrl: mediaUrl,
          deadline: that.data.deadlineDate ? new Date(that.data.deadlineDate + ' 23:59:59') : null
        }
      });
      
      wx.hideLoading();
      
      if (result.result && result.result.success) {
        wx.showToast({ title: '任务创建成功', icon: 'success' });
        
        // 清空表单
        that.setData({
          taskContent: '',
          mediaType: '',
          mediaTempPath: '',
          mediaPreviewUrl: '',
          mediaFileId: '',
          deadlineDate: ''
        });
        
        // 刷新历史任务列表
        that.loadHistoryTasks();
      } else {
        wx.showToast({ title: '创建失败：' + (result.result?.errMsg || '未知错误'), icon: 'none' });
      }
    } catch (err) {
      console.error('创建任务失败', err);
      wx.hideLoading();
      wx.showToast({ title: '创建失败：' + (err.errMsg || '未知错误'), icon: 'none' });
    }
  }
});
