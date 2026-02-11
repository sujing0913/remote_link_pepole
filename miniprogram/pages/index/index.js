const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    startDate: '',
    endDate: '',
    totalCount: 0,
    isTodayDone: false,
    loading: false,
    // 新增数据
    subjects: ['语文', '数学', '英语'],
    selectedSubjectIndex: 2, // 默认英语
    participantList: [], // 打卡人列表（包含自己）
    selectedParticipantIndex: 0,
    currentParticipantOpenId: '', // 当前选中的打卡人openId
    currentUserOpenId: '', // 当前登录用户的openId
    currentUserNickName: '', // 当前登录用户的昵称
    currentUserRole: 'participant', // 当前登录用户的角色
    currentDateStr: '', // 当前日期字符串
    supervisorNickName: '' // 组织者昵称
  },

  onLoad: function(options) {
    // 启用分享功能
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });

    // 从缓存中获取当前用户信息
    const currentUser = wx.getStorageSync('currentUser');
    if (!currentUser) {
      // 如果没有缓存，说明未授权，跳转回授权页
      // 传递邀请参数（如果有的话）
      if (options.inviterOpenId) {
        wx.reLaunch({ 
          url: `/pages/auth/auth?inviterOpenId=${options.inviterOpenId}` 
        });
      } else {
        wx.reLaunch({ url: '/pages/auth/auth' });
      }
      return;
    }

    const currentOpenId = currentUser.openId;
    const currentNickName = currentUser.nickName;
    
    // 检查是否是通过邀请链接进入
    if (options.inviterOpenId && options.inviterOpenId !== currentOpenId) {
      // 场景2: 从邀请链接进入，自动成为打卡人
      this.handleInvitationAsParticipant(options.inviterOpenId, currentOpenId, currentNickName);
    } else {
      // 场景1: 直接进入，默认成为组织者
      this.initAsOrganizerWithSelfBinding(currentOpenId, currentNickName);
    }
  },



  onShow: function() {
    this.checkTodayStatus();
  },

  initDates: function() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    
    // 默认查询本月
    const startOfMonth = `${year}-${month}-01`;
    
    // 计算星期几
    const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const dayOfWeek = weekDays[now.getDay()];
    const dateStr = `${year}年${month}月${day}日 ${dayOfWeek}`;
    
    this.setData({
      startDate: startOfMonth,
      endDate: todayStr,
      currentDateStr: dateStr
    });
  },

  bindStartDateChange: function(e) {
    this.setData({ startDate: e.detail.value });
  },

  bindEndDateChange: function(e) {
    this.setData({ endDate: e.detail.value });
  },

  // 查询指定日期范围内的累计打卡次数
  queryCount: async function() {
    if (!this.data.startDate || !this.data.endDate) return;
    
    wx.showLoading({ title: '查询中...' });
    try {
      const start = new Date(this.data.startDate + ' 00:00:00');
      const end = new Date(this.data.endDate + ' 23:59:59');
      const subject = this.data.subjects[this.data.selectedSubjectIndex];
      const currentParticipantOpenId = this.data.currentParticipantOpenId;

      const query = {
        createTime: _.gte(start).and(_.lte(end)),
        subject: subject,
        puncherOpenId: currentParticipantOpenId
      };

      const res = await db.collection('check_ins').where(query).count();

      this.setData({
        totalCount: res.total
      });
    } catch (err) {
      console.error('查询失败', err);
    } finally {
      wx.hideLoading();
    }
  },

  // 检查今日是否已打卡
  checkTodayStatus: async function() {
    const now = new Date();
    const start = new Date(now.setHours(0, 0, 0, 0));
    const end = new Date(now.setHours(23, 59, 59, 999));
    const subject = this.data.subjects[this.data.selectedSubjectIndex];
    const currentParticipantOpenId = this.data.currentParticipantOpenId;

    try {
      const query = {
        createTime: _.gte(start).and(_.lte(end)),
        subject: subject,
        puncherOpenId: currentParticipantOpenId
      };

      const res = await db.collection('check_ins').where(query).count();

      this.setData({
        isTodayDone: res.total > 0
      });
    } catch (err) {
      console.error('检查今日状态失败', err);
    }
  },

  goToHistory: function() {
    wx.navigateTo({
      url: '/pages/history/history'
    });
  },

  // 打卡逻辑
  onPunch: function() {
    const that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image', 'video'],
      sourceType: ['camera'],
      maxDuration: 60,
      camera: 'back',
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        const fileType = res.type; // 'image' or 'video'
        const subject = that.data.subjects[that.data.selectedSubjectIndex];
        that.uploadFile(tempFilePath, fileType, subject);
      }
    });
  },

  uploadFile: function(tempFilePath, fileType, subject) {
    const that = this;
    wx.showLoading({ title: '提交中...' });

    const suffix = /\.[^\.]+$/.exec(tempFilePath)[0];
    const cloudPath = `check_ins/${Date.now()}-${Math.floor(Math.random() * 1000)}${suffix}`;

    wx.cloud.uploadFile({
      cloudPath,
      filePath: tempFilePath,
      success: res => {
        that.saveToDatabase(res.fileID, fileType, subject);
      },
      fail: err => {
        wx.hideLoading();
        wx.showToast({ title: '上传失败', icon: 'error' });
        console.error('上传失败', err);
      }
    });
  },

  saveToDatabase: function(fileID, fileType, subject) {
    const that = this;
    const currentUser = wx.getStorageSync('currentUser');
    const openid = currentUser ? currentUser.openId : this.data.currentParticipantOpenId;
    db.collection('check_ins').add({
      data: {
        mediaUrl: fileID,
        mediaType: fileType,
        createTime: db.serverDate(),
        score: -1, // -1 表示未评分
        suggestion: '',
        subject: subject,
        puncherOpenId: openid
      },
      success: async res => {
        wx.hideLoading();
        wx.showToast({ title: '打卡成功', icon: 'success' });
        
        // 调用云函数发送通知
        try {
          await wx.cloud.callFunction({
            name: 'sendNotification',
            data: { puncherOpenId: openid, mediaUrl: fileID, subject }
          });
        } catch (notifyErr) {
          console.warn('通知发送失败，但打卡成功', notifyErr);
        }
        
        that.checkTodayStatus();
        that.queryCount();
      },
      fail: err => {
        wx.hideLoading();
        wx.showToast({ title: '保存失败', icon: 'error' });
        console.error('数据库保存失败', err);
      }
    });
  },

  // 科目选择
  onSubjectChange: function(e) {
    this.setData({ selectedSubjectIndex: e.detail.value });
    this.checkTodayStatus();
    this.queryCount();
  },


  // 处理邀请：自动作为打卡人加入
  handleInvitationAsParticipant: async function(inviterOpenId, currentOpenId, currentNickName) {
    const that = this;
    wx.showLoading({ title: '正在加入...' });
    try {
      // 1. 获取组织者信息
      const organizerRes = await db.collection('users').doc(inviterOpenId).get();
      const organizerNickName = organizerRes.data ? (organizerRes.data.nickName || '组织者') : '组织者';

      // 2. 检查是否已存在绑定关系
      const bindingCheck = await db.collection('bindings').where({
        puncherOpenId: currentOpenId,
        supervisorOpenId: inviterOpenId
      }).get();

      if (bindingCheck.data.length === 0) {
        // 创建绑定关系
        await db.collection('bindings').add({
          data: {
            puncherOpenId: currentOpenId,
            supervisorOpenId: inviterOpenId,
            createTime: db.serverDate()
          }
        });
      }

      this.setData({
        currentUserOpenId: currentOpenId,
        currentUserNickName: currentNickName,
        currentUserRole: 'participant',
        supervisorNickName: organizerNickName
      });

      // 3. 加载组内所有打卡人
      await this.loadGroupParticipants(inviterOpenId, currentOpenId);
      
      this.initDates();
      this.checkTodayStatus();
      this.queryCount();
      
      wx.hideLoading();
      wx.showToast({ title: '已加入打卡小组', icon: 'success' });
    } catch (err) {
      console.error('自动加入失败', err);
      wx.hideLoading();
      this.initAsOrganizerWithSelfBinding(currentOpenId, currentNickName);
    }
  },

  // 初始化为组织者
  initAsOrganizerWithSelfBinding: async function(currentOpenId, currentNickName) {
    const that = this;
    try {
      // 0. 同步更新角色为组织者（如果当前是参与人）
      const currentUser = wx.getStorageSync('currentUser');
      if (currentUser && currentUser.role !== 'organizer') {
        currentUser.role = 'organizer';
        wx.setStorageSync('currentUser', currentUser);
        
        // 同步到数据库
        await db.collection('users').where({ _openid: currentOpenId }).update({
          data: { role: 'organizer' }
        });
      }

      // 1. 检查是否已存在自绑定
      const bindingCheck = await db.collection('bindings').where({
        puncherOpenId: currentOpenId,
        supervisorOpenId: currentOpenId
      }).get();

      if (bindingCheck.data.length === 0) {
        await db.collection('bindings').add({
          data: {
            puncherOpenId: currentOpenId,
            supervisorOpenId: currentOpenId,
            createTime: db.serverDate()
          }
        });
      }

      this.setData({
        currentUserOpenId: currentOpenId,
        currentUserNickName: currentNickName,
        currentUserRole: 'organizer',
        supervisorNickName: currentNickName // 组织者自己就是组织者
      });

      // 2. 加载我作为组织者所管理的所有成员（包含我自己）
      await this.loadGroupParticipants(currentOpenId, currentOpenId);

      this.initDates();
      this.checkTodayStatus();
      this.queryCount();
    } catch (err) {
      console.error('初始化失败', err);
    }
  },

  // 加载小组内所有成员
  loadGroupParticipants: async function(supervisorOpenId, currentOpenId) {
    try {
      // 1. 查找所有绑定到该组织者的记录
      const bindingsRes = await db.collection('bindings').where({
        supervisorOpenId: supervisorOpenId
      }).get();

      const puncherOpenIds = bindingsRes.data.map(b => b.puncherOpenId);
      
      // 2. 获取这些成员的昵称
      const usersRes = await db.collection('users').where({
        _openid: _.in(puncherOpenIds)
      }).get();

      const participantList = usersRes.data.map(u => ({
        _openid: u._openid,
        nickName: u.nickName || '打卡人'
      }));

      // 优化排序：本人置顶，其余按昵称排序
      participantList.sort((a, b) => {
        if (a._openid === currentOpenId) return -1;
        if (b._openid === currentOpenId) return 1;
        return a.nickName.localeCompare(b.nickName);
      });

      this.setData({
        participantList,
        currentParticipantOpenId: currentOpenId,
        selectedParticipantIndex: 0 // 排序后本人必定在第一个
      });
    } catch (err) {
      console.error('加载成员列表失败', err);
    }
  },

  // 分享配置
  onShareAppMessage: function(res) {
    const currentOpenId = this.data.currentUserOpenId;
    return {
      title: '快来加入我的打卡小组吧！',
      path: `/pages/auth/auth?inviterOpenId=${currentOpenId}`
    };
  },

  // 打卡人切换
  onParticipantChange: function(e) {
    const newIndex = e.detail.value;
    const newParticipantOpenId = this.data.participantList[newIndex]._openid;
    this.setData({ 
      selectedParticipantIndex: newIndex,
      currentParticipantOpenId: newParticipantOpenId
    });
    this.checkTodayStatus();
    this.queryCount();
  },

});
