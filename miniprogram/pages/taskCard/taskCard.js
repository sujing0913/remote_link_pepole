Page({
  data: {
    loading: false,
    tasks: [],
    currentUserOpenId: '',
    // 角色相关
    asParent: false,
    asChild: false,
    roleText: '普通用户',
    // 孩子列表（家长端用）
    children: [],
    selectedChildIndex: -1,
    selectedChild: null
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
      
      // 获取用户角色和绑定关系
      await this.loadUserRoles();
      
      // 加载近 7 天的任务
      this.fetchRecentTasks();
    } catch (e) {
      console.error('初始化失败', e);
    } finally {
      wx.hideLoading();
    }
  },

  onShow: function() {
    this.fetchRecentTasks();
  },

  // 获取用户角色和绑定关系
  async loadUserRoles() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getMyBindings',
        data: {}
      });

      const rr = res.result || {};
      if (!rr.success) return;

      const data = rr.data || {};
      const asParentList = data.asParent || [];
      const asChildList = data.asChild || [];

      // 角色互斥
      let asParent = asParentList.length > 0;
      let asChild = asChildList.length > 0;

      if (asParent && asChild) {
        asChild = false;
      }

      let roleText = '普通用户';
      if (asParent) roleText = '家长';
      else if (asChild) roleText = '孩子';

      // 家长端：处理孩子列表
      const children = asParentList.map((c) => ({
        child_openid: c.openid,
        childName: c.name || `user${String(c.openid || '').slice(-4)}`,
        bind_time: this.formatBindTime(c.bind_time) || ''
      }));

      this.setData({
        asParent,
        asChild,
        roleText,
        children,
        selectedChildIndex: children.length > 0 ? 0 : -1,
        selectedChild: children.length > 0 ? children[0] : null
      });
    } catch (e) {
      console.warn('loadUserRoles ignored:', e);
    }
  },

  // 格式化绑定时间
  formatBindTime(t) {
    if (!t) return '';
    let d = null;
    if (typeof t === 'object') {
      if (t.$date) d = new Date(t.$date);
      else if (t.date) d = new Date(t.date);
      else if (t.seconds) d = new Date(t.seconds * 1000);
      else d = new Date(String(t));
    } else {
      d = new Date(t);
    }
    if (!d || isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },

  // 孩子选择变化
  onChildChange: function(e) {
    const index = e.detail.value;
    this.setData({
      selectedChildIndex: index,
      selectedChild: this.data.children[index]
    }, () => {
      this.fetchRecentTasks();
    });
  },

  // 获取近 7 天的任务
  fetchRecentTasks: async function() {
    const that = this;
    this.setData({ loading: true });
    
    try {
      // 计算 7 天前的日期
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      let query = {};
      
      // 根据角色构建不同的查询条件
      if (this.data.asParent) {
        // 家长角色：查询所有孩子的任务
        if (this.data.selectedChild) {
          // 如果选择了特定孩子，只查询该孩子的任务
          query = {
            childOpenId: this.data.selectedChild.child_openid,
            createTime: {
              $gte: sevenDaysAgo
            }
          };
        } else {
          // 如果没有选择孩子（理论上不会），查询所有关联孩子的任务
          const childOpenIds = this.data.children.map(c => c.child_openid);
          query = {
            childOpenId: {
              $in: childOpenIds
            },
            createTime: {
              $gte: sevenDaysAgo
            }
          };
        }
      } else if (this.data.asChild) {
        // 孩子角色：查询安排给自己的任务
        query = {
          childOpenId: this.data.currentUserOpenId,
          createTime: {
            $gte: sevenDaysAgo
          }
        };
      } else {
        // 普通用户：查询与自己相关的任务
        query = {
          $or: [
            { parentId: this.data.currentUserOpenId },
            { childOpenId: this.data.currentUserOpenId }
          ],
          createTime: {
            $gte: sevenDaysAgo
          }
        };
      }
      
      console.log('fetchRecentTasks query:', query);
      
      // 查询近 7 天的任务
      const res = await wx.cloud.database().collection('tasks')
        .where(query)
        .orderBy('createTime', 'desc')
        .get();
      
      console.log('fetchRecentTasks result:', res.data);
      
      if (res.data && res.data.length > 0) {
        // 处理所有任务
        const tasks = await Promise.all(res.data.map(async (task) => {
          // 处理媒体文件 URL - 支持图片和视频
          let mediaUrl = task.mediaUrl || '';
          const mediaType = task.mediaType || '';
          
          if (mediaUrl && mediaUrl.startsWith('cloud://')) {
            try {
              const tempUrlRes = await wx.cloud.getTempFileURL({ fileList: [mediaUrl] });
              if (tempUrlRes.fileList && tempUrlRes.fileList.length > 0) {
                mediaUrl = tempUrlRes.fileList[0].tempFileURL;
              }
            } catch (e) {
              console.error('获取临时 URL 失败', e);
            }
          }
          
          // 格式化时间
          const createTime = this.formatDateTime(task.createTime);
          const deadline = task.deadline ? this.formatDate(task.deadline) : '';
          
          return {
            ...task,
            mediaUrl: mediaUrl,
            mediaType: mediaType,
            createTime: createTime,
            deadline: deadline
          };
        }));
        
        this.setData({
          tasks: tasks
        });
      } else {
        this.setData({
          tasks: []
        });
      }
    } catch (err) {
      console.error('获取任务失败', err);
      wx.showToast({ title: '获取任务失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 格式化日期时间
  formatDateTime: function(dateTime) {
    if (!dateTime) return '';
    try {
      // 处理云开发数据库的 Date 对象格式 {type: 'timestamp', val: timestamp}
      let dateValue = dateTime;
      if (dateTime && typeof dateTime === 'object' && dateTime.val) {
        dateValue = dateTime.val;
      }
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) {
        return String(dateTime);
      }
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    } catch (e) {
      return String(dateTime);
    }
  },

  // 格式化日期（用于截止日期）
  formatDate: function(dateTime) {
    if (!dateTime) return '';
    try {
      // 处理云开发数据库的 Date 对象格式 {type: 'timestamp', val: timestamp}
      let dateValue = dateTime;
      if (dateTime && typeof dateTime === 'object' && dateTime.val) {
        dateValue = dateTime.val;
      }
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) {
        return String(dateTime);
      }
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${month}-${day}`;
    } catch (e) {
      return String(dateTime);
    }
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
