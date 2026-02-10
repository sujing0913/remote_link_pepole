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
    participantList: [], // 参与人列表（包含自己）
    selectedParticipantIndex: 0,
    currentParticipantOpenId: '', // 当前选中的参与人openId
    currentUserOpenId: '', // 当前登录用户的openId
    currentUserNickName: '', // 当前登录用户的昵称
    currentUserRole: 'participant', // 当前登录用户的角色
    currentDateStr: '', // 当前日期字符串
    supervisorNickName: '' // 组织人昵称（仅对参与人显示）
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
    if (options.inviterOpenId) {
      // 场景2: 从邀请链接进入，成为参与人
      this.handleInvitationAsParticipant(options.inviterOpenId, currentOpenId, currentNickName);
    } else {
      // 场景1: 直接进入，默认成为组织者（自绑定）
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
    const openid = wx.getStorageSync('openid') || this.data.currentParticipantOpenId;
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


  // 处理邀请：作为参与人加入
  handleInvitationAsParticipant: async function(inviterOpenId, currentOpenId, currentNickName) {
    const that = this;
    try {
      // 获取邀请者（未来的组织者）信息
      const organizerRes = await db.collection('users').doc(inviterOpenId).get();
      let organizerNickName = '未知用户';
      
      // 优先使用数据库中的微信昵称
      if (organizerRes.data && organizerRes.data.nickName) {
        // 检查是否是默认昵称（以"用户"开头）
        if (organizerRes.data.nickName.startsWith('用户')) {
          // 如果是默认昵称，尝试从缓存中获取真实的微信昵称
          const allUsers = wx.getStorageSync('allUsers') || {};
          if (allUsers[inviterOpenId] && allUsers[inviterOpenId].nickName) {
            organizerNickName = allUsers[inviterOpenId].nickName;
          } else {
            organizerNickName = '未知用户';
          }
        } else {
          // 使用真实的微信昵称
          organizerNickName = organizerRes.data.nickName;
        }
      } else {
        // 如果数据库中没有昵称，尝试从缓存中获取
        const allUsers = wx.getStorageSync('allUsers') || {};
        if (allUsers[inviterOpenId]) {
          organizerNickName = allUsers[inviterOpenId].nickName;
        }
      }

      // 弹出确认框
      wx.showModal({
        title: '加入打卡组',
        content: `是否同意加入 ${organizerNickName} 的学习打卡组？`,
        success: async (modalRes) => {
          if (modalRes.confirm) {
            wx.showLoading({ title: '处理中...' });
            try {
              // 1. 保存当前用户信息
              await db.collection('users').doc(currentOpenId).set({
                data: {
                  _openid: currentOpenId,
                  nickName: currentNickName,
                  avatarUrl: '' // 可以补充头像
                },
                upsert: true
              });

              // 2. 创建绑定关系
              await db.collection('bindings').add({
                data: {
                  puncherOpenId: currentOpenId,
                  supervisorOpenId: inviterOpenId
                }
              });

              wx.hideLoading();
              wx.showToast({ title: '已成功加入！', icon: 'success' });
              
      // 3. 初始化页面，参与人列表包含自己
      const participantList = [{ _openid: currentOpenId, nickName: '我' }];
      that.setData({
        participantList,
        selectedParticipantIndex: 0,
        currentParticipantOpenId: currentOpenId,
        currentUserOpenId: currentOpenId,
        currentUserNickName: currentNickName,
        currentUserRole: 'participant', // 作为参与人加入
        supervisorNickName: organizerNickName // 设置组织人昵称
      });
      this.initDates();
      this.checkTodayStatus();
      this.queryCount();
            } catch (err) {
              console.error('处理邀请失败', err);
              wx.hideLoading();
              wx.showToast({ title: '操作失败', icon: 'error' });
            }
          } else {
            // 用户拒绝，回退到默认流程（自绑定）
            this.initAsOrganizerWithSelfBinding(currentOpenId, currentNickName);
          }
        }
      });
    } catch (err) {
      console.error('处理邀请时出错', err);
      wx.showToast({ title: '操作失败', icon: 'error' });
      this.initAsOrganizerWithSelfBinding(currentOpenId, currentNickName);
    }
  },

  // 初始化为组织者（自绑定）
  initAsOrganizerWithSelfBinding: async function(currentOpenId, currentNickName) {
    const that = this;
    wx.showLoading({ title: '初始化中...' });
    
    // 弹出提示
    wx.showModal({
      title: '提示',
      content: '您将默认成为组织者，可以邀请他人加入您的打卡组。',
      showCancel: false,
      confirmText: '好的'
    });

    try {
      // 1. 保存用户信息
      await db.collection('users').doc(currentOpenId).set({
        data: {
          _openid: currentOpenId,
          nickName: currentNickName,
          avatarUrl: ''
        },
        upsert: true
      });

      // 2. 创建自绑定关系
      await db.collection('bindings').add({
        data: {
          puncherOpenId: currentOpenId,
          supervisorOpenId: currentOpenId
        }
      });

      // 3. 初始化页面，参与人列表只有自己
      const participantList = [{ _openid: currentOpenId, nickName: '我' }];
      that.setData({
        participantList,
        selectedParticipantIndex: 0,
        currentParticipantOpenId: currentOpenId,
        currentUserOpenId: currentOpenId,
        currentUserNickName: currentNickName,
        currentUserRole: 'organizer' // 自绑定时，角色为组织者
      });

      this.initDates();
      this.checkTodayStatus();
      this.queryCount();
    } catch (err) {
      console.error('自绑定初始化失败', err);
      wx.showToast({ title: '初始化失败', icon: 'error' });
    } finally {
      wx.hideLoading();
    }
  },

  // 开始直接邀请流程
  startDirectInvite: function() {
    const that = this;
    const currentOrganizer = this.data.currentUserRole === 'organizer' ? '我' : '组织者';
    
    // 先检查是否已有组织者
    if (this.data.currentUserRole !== 'organizer') {
      wx.showModal({
        title: '提示',
        content: `当前组织者为 ${currentOrganizer}，重新邀请将覆盖现有绑定，是否继续？`,
        success: (res) => {
          if (res.confirm) {
            that.performShareToFriend();
          }
        }
      });
    } else {
      that.performShareToFriend();
    }
  },

  // 执行分享到私聊
  performShareToFriend: function() {
    const currentOpenId = this.data.currentUserOpenId;
    wx.shareMessageToFriend({
      title: '邀请您加入我的学习打卡组',
      path: `/pages/index/index?inviterOpenId=${currentOpenId}`,
      imageUrl: '/images/share-icon.png',
      success: (res) => {
        console.log('分享成功', res);
        // 分享成功后可以给用户一个轻量级的反馈
        wx.showToast({ title: '已发送邀请', icon: 'success' });
      },
      fail: (err) => {
        console.error('分享失败', err);
        wx.showToast({ title: '分享失败，请重试', icon: 'error' });
      }
    });
  },

  // 分享配置
  onShareAppMessage: function(res) {
    // 获取当前用户的真实 openid
    const currentOpenId = this.data.currentUserOpenId;
    
    // 判断是群聊分享还是私聊分享
    if (res.shareTickets && res.shareTickets.length > 0) {
      // 群聊分享
      return {
        title: '欢迎加入我们的学习打卡群！',
        path: `/pages/index/index`,
        imageUrl: '/images/share-icon.png',
        shareTicket: res.shareTickets[0]
      };
    } else {
      // 私聊分享
      return {
        title: '邀请您加入我的学习打卡组',
        path: `/pages/index/index?inviterOpenId=${currentOpenId}`,
        imageUrl: '/images/share-icon.png'
      };
    }
  },

  // 参与人切换
  onParticipantChange: function(e) {
    const newIndex = e.detail.value;
    const newParticipantOpenId = this.data.participantList[newIndex]._openid;
    this.setData({ 
      selectedParticipantIndex: newIndex,
      currentParticipantOpenId: newParticipantOpenId,
      currentParticipantNickName: this.data.participantList[newIndex].nickName
    });
    this.checkTodayStatus();
    this.queryCount();
  },

  // 申请退出组织者
  requestExit: function() {
    const that = this;
    const currentParticipant = this.data.participantList[this.data.selectedParticipantIndex];
    
    wx.showModal({
      title: '申请退出',
      content: `确定要向 ${currentParticipant.nickName} 申请退出打卡组吗？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '提交申请中...' });
          try {
            // 1. 找到当前的 binding 记录
            const bindingRes = await db.collection('bindings')
              .where({
                puncherOpenId: that.data.currentParticipantOpenId,
                supervisorOpenId: currentParticipant._openid
              })
              .get();

            if (bindingRes.data.length > 0) {
              const bindingId = bindingRes.data[0]._id;
              // 2. 更新状态为 pending_leave
              await db.collection('bindings').doc(bindingId).update({
                data: { status: 'pending_leave' }
              });

              // 3. 这里可以调用一个云函数给组织者发送通知
              // await wx.cloud.callFunction({ name: 'sendExitRequestNotification', ... });

              wx.hideLoading();
              wx.showToast({ title: '退出申请已提交，请等待组织者审核。', icon: 'success' });
            } else {
              throw new Error('未找到绑定关系');
            }
          } catch (err) {
            console.error('提交退出申请失败', err);
            wx.hideLoading();
            wx.showToast({ title: '操作失败', icon: 'error' });
          }
        }
      }
    });
  },

  // 退出登录
  onLogout: function() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          // 清除本地存储的会话
          wx.removeStorageSync('sessionExpiry');
          wx.removeStorageSync('currentUser');
          // 重新进入小程序
          wx.reLaunch({ url: '/pages/index/index' });
        }
      }
    });
  }
});
