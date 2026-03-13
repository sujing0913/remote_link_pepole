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
    loadingTasks: false
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
  viewAttachment: function(e) {
    const task = e.currentTarget.dataset.task;
    if (task && task.mediaUrl) {
      if (task.mediaType === 'image') {
        wx.previewImage({
          urls: [task.mediaUrl]
        });
      } else if (task.mediaType === 'video') {
        wx.previewMedia({
          sources: [{
            url: task.mediaUrl,
            type: 'video'
          }]
        });
      }
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
