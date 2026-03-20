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
    selectedChild: null,
    // 本周信息
    weekInfo: ''
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

  // 获取本周的起止日期（周一到周日）
  getWeekRange: function() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 是周日，1-6 是周一到周六
    
    // 计算本周一的日期（中国习惯：周一为一周开始）
    const mondayOffset = dayOfWeek === 0 ? -6 : (1 - dayOfWeek);
    const monday = new Date(today);
    monday.setDate(monday.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    
    // 本周日的日期
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    
    return {
      monday,
      sunday,
      weekStartStr: this.formatDateForWeek(monday),
      weekEndStr: this.formatDateForWeek(sunday),
      year: monday.getFullYear()
    };
  },

  // 格式化日期用于周显示（MM 月 DD 日）
  formatDateForWeek: function(date) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  },

  // 计算是第几周（ISO 周数）
  getWeekNumber: function(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
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

  // 获取本周的任务（周一到周日）
  fetchRecentTasks: async function() {
    const that = this;
    this.setData({ loading: true });
    
    try {
      // 获取本周的起止日期（周一到周日）
      const weekRange = this.getWeekRange();
      const weekNumber = this.getWeekNumber(new Date());
      
      // 设置周显示信息
      const weekInfo = `${weekRange.year}年第${weekNumber}周（${weekRange.weekStartStr}至${weekRange.weekEndStr}）`;
      this.setData({ weekInfo });
      
      // 获取今天的日期范围（用于孩子角色过滤）
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
      
      let query = {};
      
      // 根据角色构建不同的查询条件
      if (this.data.asParent) {
        // 家长角色：查询所有孩子的任务（不限制时间，客户端过滤今天的）
        if (this.data.selectedChild) {
          // 如果选择了特定孩子，只查询该孩子的任务
          query = {
            childOpenId: this.data.selectedChild.child_openid
          };
        } else {
          // 如果没有选择孩子（理论上不会），查询所有关联孩子的任务
          const childOpenIds = this.data.children.map(c => c.child_openid);
          query = {
            childOpenId: {
              $in: childOpenIds
            }
          };
        }
        
        // 周显示改为"今天"
        this.setData({ 
          weekInfo: `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日` 
        });
      } else if (this.data.asChild) {
        // 孩子角色：只显示今天的任务（当天日期在周期内的任务）
        // 先查询所有分配给当前孩子的任务，然后在客户端过滤
        query = {
          childOpenId: this.data.currentUserOpenId
        };
        
        // 周显示改为"今天"
        this.setData({ 
          weekInfo: `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日` 
        });
      } else {
        // 普通用户：查询与自己相关的任务（本周内）
        query = {
          $or: [
            { parentId: this.data.currentUserOpenId },
            { childOpenId: this.data.currentUserOpenId }
          ],
          createTime: {
            $gte: weekRange.monday,
            $lte: weekRange.sunday
          }
        };
      }
      
      console.log('fetchRecentTasks query:', query);
      console.log('weekInfo:', weekInfo);
      
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
        
        // 家长和孩子角色：过滤出今天的任务（当天日期在周期内的任务）
        let filteredTasks = tasks;
        if (this.data.asParent || this.data.asChild) {
          filteredTasks = tasks.filter(task => {
            console.log('=== 检查任务 ===', task.title);
            console.log('task.startDate:', task.startDate, 'type:', typeof task.startDate);
            console.log('task.endDate:', task.endDate, 'type:', typeof task.endDate);
            console.log('task.deadline:', task.deadline, 'type:', typeof task.deadline);
            
            // 情况 1：有 startDate 和 endDate，检查今天是否在范围内
            if (task.startDate && task.endDate) {
              const startDate = this.parseTaskDate(task.startDate);
              const endDate = this.parseTaskDate(task.endDate);
              console.log('解析后 startDate:', startDate, 'endDate:', endDate);
              // 今天 >= 开始日期 且 今天 <= 结束日期
              const isInRange = today >= startDate && today <= endDate;
              console.log('是否在范围内:', isInRange);
              return isInRange;
            }
            // 情况 2：只有 deadline（老数据），检查 deadline 是否是今天
            if (task.deadline && !task.startDate && !task.endDate) {
              const deadlineDate = this.parseTaskDate(task.deadline);
              console.log('deadlineDate:', deadlineDate);
              const isToday = deadlineDate && (
                deadlineDate.getFullYear() === today.getFullYear() &&
                deadlineDate.getMonth() === today.getMonth() &&
                deadlineDate.getDate() === today.getDate()
              );
              console.log('是否是今天:', isToday);
              return isToday;
            }
            // 情况 3：没有 startDate/endDate/deadline，使用 createTime 作为 fallback
            if (task.createTime) {
              const createTimeDate = this.parseTaskDate(task.createTime);
              return createTimeDate && (
                createTimeDate.getFullYear() === today.getFullYear() &&
                createTimeDate.getMonth() === today.getMonth() &&
                createTimeDate.getDate() === today.getDate()
              );
            }
            return false;
          });
          
          console.log('过滤后的任务（家长/孩子）:', filteredTasks);
        }
        
        this.setData({
          tasks: filteredTasks
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

  // 解析任务日期（支持云数据库格式和字符串格式）
  parseTaskDate: function(dateValue) {
    if (!dateValue) return null;
    try {
      // 处理云开发数据库的 Date 对象格式 {type: 'timestamp', val: timestamp}
      if (dateValue && typeof dateValue === 'object') {
        if (dateValue.val) {
          return new Date(dateValue.val);
        }
        if (dateValue.$date) {
          return new Date(dateValue.$date);
        }
      }
      // 如果是字符串格式（如 "3/19"），需要转换为日期
      if (typeof dateValue === 'string') {
        const now = new Date();
        const parts = dateValue.split('/');
        if (parts.length === 2) {
          const month = parseInt(parts[0]) - 1;
          const day = parseInt(parts[1]);
          return new Date(now.getFullYear(), month, day);
        }
        // 尝试直接解析字符串
        return new Date(dateValue);
      }
      // 直接是 Date 对象
      return new Date(dateValue);
    } catch (e) {
      console.error('parseTaskDate 失败:', e);
      return null;
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
