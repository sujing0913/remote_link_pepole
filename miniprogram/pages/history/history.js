const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    currentYear: new Date().getFullYear(),
    yearlyTotal: 0,
    totalScore: 0,
    flowerCount: 0,
    trophyCount: 0,
    groupedRecords: [], // { month: '2023-10', records: [], collapsed: false }
    // 新增筛选数据
    currentUser: null,
    userRole: '',
    participantList: [],
    selectedParticipantIndex: 0,
    yearMonthRange: [[], []],
    selectedYearMonth: [0, 0]
  },

  onLoad: async function() {
    // 从缓存中获取当前用户信息
    let currentUser = wx.getStorageSync('currentUser');
    
    // 如果没有缓存，跳转回首页初始化
    if (!currentUser) {
      wx.reLaunch({ url: '/pages/index/index' });
      return;
    }

    // 刷新用户信息，确保团队信息最新
    try {
      const userRes = await db.collection('users').where({ _openid: currentUser.openId }).get();
      if (userRes.data.length > 0) {
        const latestInfo = userRes.data[0];
        currentUser.teamId = latestInfo.teamId;
        currentUser.teamName = latestInfo.teamName;
        currentUser.nickName = latestInfo.nickName;
        wx.setStorageSync('currentUser', currentUser);
      }
    } catch (e) {
      console.error('刷新用户信息失败', e);
    }

    this.setData({
      currentUser: currentUser,
      userRole: currentUser.role
    });

    // 加载同团队成员
    await this.loadParticipantList(currentUser.teamId);

    this.generateYearMonthRange();
    this.fetchRecords();
  },

  async loadParticipantList(teamId) {
    const that = this;
    try {
      // 根据 teamId 查询所有成员
      const userRes = await db.collection('users').where({ teamId: teamId }).get();
      
      const participantList = [
        { nickName: '全部队友' },
        ...userRes.data
      ];

      that.setData({ 
        participantList,
        selectedParticipantIndex: 0
      });
    } catch (err) {
      console.error('加载队友列表失败', err);
    }
  },

  generateYearMonthRange() {
    const currentYear = new Date().getFullYear();
    const startYear = 2023; // 可根据需求调整起始年份
    const years = [];
    for (let y = startYear; y <= currentYear; y++) {
      years.push(y.toString());
    }
    const months = ['全部', ...Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'))];
    
    this.setData({
      yearMonthRange: [years, months],
      selectedYearMonth: [years.length - 1, new Date().getMonth() + 1] // 默认选中当前年份和当前月份
    });
  },

  fetchRecords: async function() {
    wx.showLoading({ title: '加载中...' });
    try {
      const [yearIdx, monthIdx] = this.data.selectedYearMonth;
      const year = parseInt(this.data.yearMonthRange[0][yearIdx]);
      const monthStr = this.data.yearMonthRange[1][monthIdx];

      let startTime, endTime;
      if (monthStr === '全部') {
        startTime = new Date(year, 0, 1);
        endTime = new Date(year, 11, 31, 23, 59, 59);
      } else {
        const month = parseInt(monthStr);
        startTime = new Date(year, month - 1, 1);
        endTime = new Date(year, month, 0, 23, 59, 59);
      }

      const query = {
        createTime: _.gte(startTime).and(_.lte(endTime))
      };

      this.setData({
        currentYear: year
      });

      // 基于团队隔离查询
      if (this.data.selectedParticipantIndex > 0) {
        // 选中特定队员
        query.puncherOpenId = this.data.participantList[this.data.selectedParticipantIndex]._openid;
      } else {
        // 全部队友：查询该团队下所有人的记录
        const allTeamOpenIds = this.data.participantList
          .filter(p => p._openid)
          .map(p => p._openid);
        
        if (allTeamOpenIds.length > 0) {
          query.puncherOpenId = _.in(allTeamOpenIds);
        } else {
          query.puncherOpenId = this.data.currentUser.openId;
        }
      }

      const res = await db.collection('check_ins')
        .where(query)
        .orderBy('createTime', 'desc')
        .get();

      this.processRecords(res.data);
    } catch (err) {
      console.error('获取记录失败', err);
      wx.showToast({ title: '加载失败', icon: 'error' });
    } finally {
      wx.hideLoading();
    }
  },

  processRecords: function(records) {
    let yearlyTotal = records.length;
    let totalScore = 0;
    const groups = {};

    const formattedRecords = records.map(item => {
      const date = new Date(item.createTime);
      const y = date.getFullYear();
      const m = (date.getMonth() + 1).toString().padStart(2, '0');
      const d = date.getDate().toString().padStart(2, '0');
      const hh = date.getHours().toString().padStart(2, '0');
      const mm = date.getMinutes().toString().padStart(2, '0');
      
      const monthKey = `${y}年${m}月`;
      const dateStr = `${m}-${d}`;
      const timeStr = `${hh}:${mm}`;

      if (item.score !== -1) {
        totalScore += item.score;
      }

      // 获取打卡人昵称
      let participantNickName = '未知';
      const pList = this.data.participantList || [];
      const curUser = this.data.currentUser;

      // 更加鲁棒的匹配函数
      const matchName = (id) => {
        if (!id) return null;
        // 1. 在打卡人列表中找 (支持 _openid 和 openId 两种命名)
        const found = pList.find(p => p._openid === id || p.openId === id);
        if (found) return found.nickName;
        // 2. 检查是否是当前登录用户本人
        if (curUser && (id === curUser.openId || id === curUser._openid)) {
          return curUser.nickName;
        }
        return null;
      };

      // 尝试通过多种可能存在的 ID 字段进行匹配
      participantNickName = matchName(item.puncherOpenId) || matchName(item._openid) || '未知';

      const processedItem = {
        ...item,
        dateStr,
        timeStr,
        participantNickName
      };

      if (!groups[monthKey]) {
        groups[monthKey] = [];
      }
      groups[monthKey].push(processedItem);

      return processedItem;
    });

    const groupedRecords = Object.keys(groups).map(month => ({
      month,
      records: groups[month],
      collapsed: false
    }));

    // 计算奖杯和小红花
    // 每100分一个奖杯，每10分一朵小红花
    const trophyCount = Math.floor(totalScore / 100);
    const flowerCount = Math.floor((totalScore % 100) / 10);

    this.setData({
      yearlyTotal,
      totalScore,
      trophyCount,
      flowerCount,
      groupedRecords
    });
  },

  toggleMonth: function(e) {
    const month = e.currentTarget.dataset.month;
    const groupedRecords = this.data.groupedRecords.map(group => {
      if (group.month === month) {
        return { ...group, collapsed: !group.collapsed };
      }
      return group;
    });
    this.setData({ groupedRecords });
  },

  onParticipantFilterChange(e) {
    this.setData({ selectedParticipantIndex: e.detail.value });
    this.fetchRecords();
  },

  onYearMonthChange(e) {
    this.setData({ selectedYearMonth: e.detail.value });
    this.fetchRecords();
  },

  // 组织者评分失去焦点
  onScoreBlur: async function(e) {
    const id = e.currentTarget.dataset.id;
    let score = e.detail.value;
    
    if (score === '') {
      score = -1;
    } else {
      score = parseInt(score);
      if (isNaN(score)) {
        score = -1;
      } else {
        // 限制在 0-10 分
        if (score < 0) score = 0;
        if (score > 10) score = 10;
      }
    }

    try {
      await wx.cloud.callFunction({
        name: 'registerUser',
        data: {
          action: 'updateCheckIn',
          checkInId: id,
          score: score
        }
      });
      // 静默更新本地数据统计，或者重新拉取数据
      this.fetchRecords();
    } catch (err) {
      console.error('评分更新失败', err);
      wx.showToast({ title: '更新失败', icon: 'error' });
    }
  },

  // 组织者建议失去焦点
  onSuggestBlur: async function(e) {
    const id = e.currentTarget.dataset.id;
    const suggestion = e.detail.value;

    try {
      await wx.cloud.callFunction({
        name: 'registerUser',
        data: {
          action: 'updateCheckIn',
          checkInId: id,
          suggestion: suggestion
        }
      });
      // 无需全量更新，仅更新本地展示
      // 但为了保证统计（如果建议影响统计的话，目前不影响）也可以fetch
      this.fetchRecords();
    } catch (err) {
      console.error('建议更新失败', err);
      wx.showToast({ title: '更新失败', icon: 'error' });
    }
  },

  viewMedia: function(e) {
    const item = e.currentTarget.dataset.item;
    if (item.mediaType === 'image') {
      wx.previewImage({
        urls: [item.mediaUrl],
        current: item.mediaUrl
      });
    } else if (item.mediaType === 'video') {
      // 视频播放通常需要一个专门的页面或组件，这里简单使用预览（如果支持）或提示
      // 微信小程序中视频可以使用 wx.previewMedia (基础库 2.12.0+)
      if (wx.previewMedia) {
        wx.previewMedia({
          sources: [{
            url: item.mediaUrl,
            type: 'video'
          }]
        });
      } else {
        wx.showToast({ title: '请升级微信查看视频', icon: 'none' });
      }
    }
  }
});
