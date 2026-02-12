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
    currentDateStr: '', // 当前日期字符串
    teamId: '', // 团队ID
    teamName: '', // 团队名称
    
    // 编辑弹窗相关
    showProfileModal: false,
    isProfileInitial: true, // 是否为初始未修改状态
    tempAvatarUrl: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0',
    tempNickName: '',
    tempTeamName: '',
    
    activityId: '' // 动态消息ID
  },

  onLoad: async function(options) {
    // 启用分享功能
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });

    // 优先处理加入团队逻辑（如果带了 teamId 参数）
    const targetTeamId = options.teamId || options.inviterOpenId; // 兼容旧版参数名

    try {
      wx.showLoading({ title: '初始化中...' });
      const { result: user } = await wx.cloud.callFunction({ name: 'getUserInfo' });
      
      if (user && user.openId) {
        let finalTeamId = user.teamId;
        let finalTeamName = user.teamName;

        // 如果是通过邀请进入且团队ID不同，则自动加入新团队 (改用云函数以规避权限问题)
        if (targetTeamId && targetTeamId !== user.teamId) {
          // 获取新团队的名称
          const teamInfo = await db.collection('users').where({ _openid: targetTeamId }).get();
          if (teamInfo.data.length > 0) {
            finalTeamName = teamInfo.data[0].teamName;
          }
          finalTeamId = targetTeamId;

          await wx.cloud.callFunction({
            name: 'registerUser',
            data: { 
              teamId: finalTeamId,
              teamName: finalTeamName
            }
          });
          wx.showToast({ title: '已加入新团队', icon: 'success' });
        }

        const userInfo = { ...user, teamId: finalTeamId, teamName: finalTeamName };
        wx.setStorageSync('currentUser', userInfo);

        // 判断是否为初始状态 (基于 isProfileSet 字段)
        const isInitial = !user.isProfileSet;

        this.setData({
          isRegistered: true,
          isProfileInitial: isInitial,
          currentUserOpenId: user.openId,
          currentUserNickName: user.nickName,
          teamId: finalTeamId,
          teamName: finalTeamName,
          tempAvatarUrl: user.avatarUrl || this.data.tempAvatarUrl,
          tempNickName: user.nickName,
          tempTeamName: finalTeamName
        });

        this.initDates();
        await this.loadTeamMembers(finalTeamId);
        this.fetchActivityId();
        this.checkTodayStatus();
        this.queryCount();
      }
    } catch (e) {
      console.error('初始化失败', e);
      this.initDates();
    } finally {
      wx.hideLoading();
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
        wx.showToast({ title: '打卡完成并通知队长', icon: 'success' });
        
        // 调用云函数发送通知
        try {
          await wx.cloud.callFunction({
            name: 'sendNotification',
            data: { puncherOpenId: openid, mediaUrl: fileID, subject }
          });
          
          // 更新动态消息卡片内容
          if (that.data.activityId) {
            const countRes = await db.collection('check_ins').where({
              createTime: _.gte(new Date(new Date().setHours(0,0,0,0))),
              puncherOpenId: openid
            }).count();
            
            await wx.cloud.callFunction({
              name: 'manageDynamicMsg',
              data: {
                action: 'update',
                activityId: that.data.activityId,
                content: `今日已打卡：${countRes.total}人，最新：${currentUser.nickName}`
              }
            });
          }
        } catch (notifyErr) {
          console.warn('通知同步失败，但打卡成功', notifyErr);
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



  // 编辑资料交互
  showProfileModal: function() {
    this.setData({
      showProfileModal: true,
      tempNickName: this.data.currentUserNickName,
      tempTeamName: this.data.teamName
    });
  },

  hideProfileModal: function() {
    this.setData({ showProfileModal: false });
  },

  onChooseAvatar: function(e) {
    this.setData({ tempAvatarUrl: e.detail.avatarUrl });
  },

  onNicknameBlur: function(e) {
    this.setData({ tempNickName: e.detail.value });
  },

  onTeamNameInput: function(e) {
    this.setData({ tempTeamName: e.detail.value });
  },

  saveProfile: async function() {
    const { tempAvatarUrl, tempNickName, tempTeamName, currentUserOpenId, teamId, isProfileInitial } = this.data;
    const defaultAvatar = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0';

    if (!tempNickName) return wx.showToast({ title: '请输入昵称', icon: 'none' });
    if (!tempTeamName) return wx.showToast({ title: '请输入团队名', icon: 'none' });

    wx.showLoading({ title: isProfileInitial ? '注册中...' : '保存中...', mask: true });
    try {
      let finalAvatarUrl = tempAvatarUrl;
      // 1. 如果修改了头像且不是默认头像，上传
      if (tempAvatarUrl !== defaultAvatar && !tempAvatarUrl.startsWith('cloud://')) {
        const suffixMatch = /\.[^\.]+$/.exec(tempAvatarUrl);
        const suffix = suffixMatch ? suffixMatch[0] : '.png';
        const cloudPath = `avatars/${Date.now()}-${Math.floor(Math.random() * 1000)}${suffix}`;
        const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: tempAvatarUrl });
        finalAvatarUrl = uploadRes.fileID;
      }

      // 2. 更新用户信息 (改用云函数以规避真机权限问题)
      const regRes = await wx.cloud.callFunction({
        name: 'registerUser',
        data: {
          nickName: tempNickName,
          avatarUrl: finalAvatarUrl,
          teamName: tempTeamName,
          teamId: teamId
        }
      });

      if (!regRes.result || !regRes.result.success) {
        throw new Error(regRes.result ? regRes.result.message : '云函数调用失败');
      }

      // 3. 如果团队名变了，同步更新整个团队
      if (tempTeamName !== this.data.teamName) {
        await wx.cloud.callFunction({
          name: 'registerUser',
          data: { action: 'updateTeamName', teamId, teamName: tempTeamName }
        });
      }

      // 4. 更新本地状态和缓存
      const userInfo = {
        openId: currentUserOpenId,
        nickName: tempNickName,
        avatarUrl: finalAvatarUrl,
        teamId: teamId,
        teamName: tempTeamName
      };
      wx.setStorageSync('currentUser', userInfo);

      // 先隐藏加载，再弹出提示，避免提示被隐藏
      wx.hideLoading();
      
      this.setData({
        currentUserNickName: tempNickName,
        teamName: tempTeamName,
        isProfileInitial: false,
        showProfileModal: false
      });

      // 触发数据刷新
      await this.loadTeamMembers(teamId);
      this.checkTodayStatus();
      this.queryCount();

      wx.showToast({ 
        title: isProfileInitial ? '注册成功' : '保存成功', 
        icon: 'success',
        duration: 2000
      });
    } catch (e) {
      wx.hideLoading();
      console.error(e);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // 加载同团队所有成员
  loadTeamMembers: async function(teamId) {
    try {
      const res = await db.collection('users').where({
        teamId: teamId
      }).get();

      const participantList = res.data.map(u => ({
        _openid: u._openid,
        nickName: u.nickName || '打卡人'
      }));

      // 排序：本人置顶
      const myOpenId = this.data.currentUserOpenId;
      participantList.sort((a, b) => {
        if (a._openid === myOpenId) return -1;
        if (b._openid === myOpenId) return 1;
        return 0;
      });

      this.setData({
        participantList,
        currentParticipantOpenId: myOpenId,
        selectedParticipantIndex: 0
      });
    } catch (err) {
      console.error('加载成员失败', err);
    }
  },



  // 获取/创建动态消息 ID
  fetchActivityId: async function() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDynamicMsg',
        data: { action: 'create' }
      });
      if (res.result.success) {
        this.setData({ activityId: res.result.activityId });
      }
    } catch (err) {
      console.error('获取动态消息ID失败', err);
    }
  },

  // 分享配置
  onShareAppMessage: function(res) {
    const teamId = this.data.teamId;
    const teamName = this.data.teamName || '学习打卡';
    const activityId = this.data.activityId;

    return {
      title: `快来加入 [${teamName}] 团队吧！`,
      path: `/pages/index/index?teamId=${teamId}`,
      isUpdatableMessage: true,
      templateId: 'ZTWzbhWfZxCTXBPLJFKLbmZ89F1b_6tcfUlhEPmFpyA',
      activityId: activityId
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
