const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    currentYear: new Date().getFullYear(),
    yearlyTotal: 0,
    excellentCount: 0,
    groupedRecords: [], // { month: '2023-10', records: [], collapsed: false }
    // 新增筛选数据
    userRole: '',
    participantList: [],
    selectedParticipantIndex: 0,
    yearMonthRange: [[], []],
    selectedYearMonth: [0, 0]
  },

  onLoad: async function() {
    // 从缓存中获取当前用户信息
    const currentUser = wx.getStorageSync('currentUser');
    
    // 如果没有缓存，说明未授权，跳转回授权页
    if (!currentUser) {
      wx.reLaunch({ url: '/pages/auth/auth' });
      return;
    }

    this.setData({
      userRole: currentUser.role
    });

    if (currentUser.role === 'organizer') {
      await this.loadParticipantList(currentUser.openId);
    }

    this.generateYearMonthRange();
    this.fetchRecords();
  },

  async loadParticipantList(organizerOpenId) {
    const that = this;
    try {
      const bindingRes = await db.collection('bindings')
        .where({ supervisorOpenId: organizerOpenId })
        .get();
      
      const participantOpenIds = bindingRes.data.map(item => item.puncherOpenId);
      const userPromises = participantOpenIds.map(id => 
        db.collection('users').where({ _openid: id }).get()
      );
      const participantLists = await Promise.all(userPromises);
      const participantList = [{ nickName: '全部' }, ...participantLists.flatMap(res => res.data)];

      that.setData({ participantList });
    } catch (err) {
      console.error('加载参与人列表失败', err);
    }
  },

  generateYearMonthRange() {
    const currentYear = new Date().getFullYear();
    const startYear = 2023; // 可根据需求调整起始年份
    const years = [];
    for (let y = startYear; y <= currentYear; y++) {
      years.push(y.toString());
    }
    const months = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));
    
    this.setData({
      yearMonthRange: [years, months],
      selectedYearMonth: [years.length - 1, new Date().getMonth()] // 默认选中当前年月
    });
  },

  fetchRecords: async function() {
    wx.showLoading({ title: '加载中...' });
    try {
      const [selectedYear, selectedMonth] = this.data.selectedYearMonth;
      const year = parseInt(this.data.yearMonthRange[0][selectedYear]);
      const month = parseInt(this.data.yearMonthRange[1][selectedMonth]);

      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59);

      const query = {
        createTime: _.gte(startOfMonth).and(_.lte(endOfMonth))
      };

      // 如果是组织者且未选择“全部”
      if (this.data.userRole === 'organizer' && this.data.selectedParticipantIndex > 0) {
        query.puncherOpenId = this.data.participantList[this.data.selectedParticipantIndex]._openid;
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
    let excellentCount = 0;
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

      // 计算评价
      let evalText = '未评分';
      let evalStatus = 'none';
      if (item.score !== -1) {
        if (item.score >= 9) {
          evalText = '优秀';
          evalStatus = 'excellent';
          excellentCount++;
        } else if (item.score >= 6) {
          evalText = '良好';
          evalStatus = 'good';
        } else {
          evalText = '待改进';
          evalStatus = 'improve';
        }
      }

      // 获取参与人昵称
      let participantNickName = '未知';
      if (item.puncherOpenId) {
        // 尝试从已有的participantList中查找
        const foundParticipant = this.data.participantList.find(p => p._openid === item.puncherOpenId);
        if (foundParticipant) {
          participantNickName = foundParticipant.nickName;
        }
      }

      const processedItem = {
        ...item,
        dateStr,
        timeStr,
        participantNickName,
        evalText,
        evalStatus
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

    this.setData({
      yearlyTotal,
      excellentCount,
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
