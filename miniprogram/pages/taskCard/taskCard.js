Page({
  data: {
    loading: false,
    currentTask: null,
    currentUserOpenId: '',
    
    // 筛选条件
    childOptions: [],
    selectedChildIndex: -1,
    subjects: [
      { name: '全部科目' },
      { name: '语文' },
      { name: '数学' },
      { name: '英语' },
      { name: '减肥' },
      { name: '生活' },
      { name: '健身' },
      { name: '其他' }
    ],
    selectedSubjectIndex: 0
  },

  onLoad: async function(options) {
    try {
      wx.showLoading({ title: '初始化中...' });
      
      // 获取当前用户信息
      const { result: user } = await wx.cloud.callFunction({ name: 'getUserInfo' });
      
      if (user && user.openId) {
        this.setData({
          currentUserOpenId: user.openId
        });
      }
      
      // 获取绑定的孩子列表
      await this.loadChildOptions();
      
      // 加载最新任务
      this.fetchLatestTask();
    } catch (e) {
      console.error('初始化失败', e);
    } finally {
      wx.hideLoading();
    }
  },

  onShow: function() {
    this.fetchLatestTask();
  },

  // 加载孩子选项
  async loadChildOptions() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getMyBindings'
      });
      
      console.log('getMyBindings result:', result);
      
      if (result && result.success && result.data && result.data.asParent) {
        // 将"全部孩子"作为第一个选项
        const childOptions = result.data.asParent.map(child => ({
          openId: child.openid,
          name: child.name
        }));
        
        this.setData({
          childOptions: childOptions,
          selectedChildIndex: -1 // 默认全部孩子
        });
        
        console.log('childOptions:', childOptions);
      }
    } catch (err) {
      console.error('获取孩子列表失败', err);
    }
  },

  // 孩子选择变化
  onChildChange: function(e) {
    const index = e.detail.value;
    this.setData({
      selectedChildIndex: index
    }, () => {
      this.fetchLatestTask();
    });
  },

  // 科目选择变化
  onSubjectChange: function(e) {
    const index = e.detail.value;
    this.setData({
      selectedSubjectIndex: index
    }, () => {
      this.fetchLatestTask();
    });
  },

  // 获取最新任务
  fetchLatestTask: async function() {
    const that = this;
    this.setData({ loading: true });
    
    try {
      // 构建查询条件
      const query = {
        $or: [
          { parentId: this.data.currentUserOpenId },
          { childOpenId: this.data.currentUserOpenId }
        ]
      };
      
      // 按孩子筛选
      if (this.data.selectedChildIndex >= 0 && this.data.childOptions[this.data.selectedChildIndex]) {
        query.childOpenId = this.data.childOptions[this.data.selectedChildIndex].openId;
      }
      
      // 按科目筛选
      const selectedSubject = this.data.subjects[this.data.selectedSubjectIndex].name;
      if (selectedSubject && selectedSubject !== '全部科目') {
        query.subject = selectedSubject;
      }
      
      // 查询最新一条任务
      const res = await wx.cloud.database().collection('tasks')
        .where(query)
        .orderBy('createTime', 'desc')
        .limit(1)
        .get();
      
      console.log('fetchLatestTask query:', query, 'result:', res.data);
      
      if (res.data && res.data.length > 0) {
        const task = res.data[0];
        
        // 处理媒体文件 URL
        let mediaUrl = task.mediaUrl;
        if (task.mediaType === 'image' && task.mediaUrl && task.mediaUrl.startsWith('cloud://')) {
          try {
            const tempUrlRes = await wx.cloud.getTempFileURL({ fileList: [task.mediaUrl] });
            if (tempUrlRes.fileList && tempUrlRes.fileList.length > 0) {
              mediaUrl = tempUrlRes.fileList[0].tempFileURL;
            }
          } catch (e) {
            console.error('获取临时 URL 失败', e);
          }
        }
        
        this.setData({
          currentTask: {
            ...task,
            mediaUrl: mediaUrl
          }
        });
      } else {
        this.setData({
          currentTask: null
        });
      }
    } catch (err) {
      console.error('获取任务失败', err);
      wx.showToast({ title: '获取任务失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
      wx.hideLoading();
    }
  },

  // 格式化日期时间
  formatDateTime: function(dateTime) {
    if (!dateTime) return '';
    const date = new Date(dateTime);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },

  // 格式化日期（用于截止日期）
  formatDate: function(dateTime) {
    if (!dateTime) return '';
    const date = new Date(dateTime);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${month}-${day}`;
  },

  // 预览媒体文件
  previewMedia: function(e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({
      urls: [url],
      current: url
    });
  }
});
