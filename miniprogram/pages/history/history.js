const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    currentYear: new Date().getFullYear(),
    yearlyTotal: 0,
    totalScore: 0,
    flowerCount: 0,
    trophyCount: 0,
    records: [], // 扁平数组，用于表格显示
    monthGroups: [], // 按月分组的数据
    currentUserOpenId: '',
    yearMonthRange: [[], []],
    selectedYearMonth: [0, 0],
    subjectRange: ['语文', '数学', '英语'], // 与首页保持一致
    selectedSubjectIndex: 2, // 默认选中英语（与首页一致）

    // ====== 亲子绑定：家长端孩子筛选 ======
    isParent: false,
    childOptions: [{ openid: '', name: '无' }], // 下拉列表（含“无”）
    selectedChildIndex: 0, // 默认“无”
    // 若从通知/分享跳转带 childOpenId，则优先选中该孩子
    presetChildOpenId: '',

    showCheckResultModal: false,
    // 检查结果弹框数据
    score: 0,
    scoreClass: 'score-low',
    recognizedContent: '',
    wordList: [],
    totalQuestions: 0,
    correctQuestions: 0,
    aiAnalysis: '',
    suggestion: '',
    checkResults: []
  },

  onLoad: async function(options) {
    try {
      // 获取当前用户 OpenId
      const { result: user } = await wx.cloud.callFunction({ name: 'getUserInfo' });

      if (!user || !user.openId) {
        wx.showToast({ title: '获取用户信息失败', icon: 'none' });
        return;
      }

      // 接收通知跳转参数：childOpenId / recordId（目前仅用于未来扩展定位某条记录）
      const presetChildOpenId = options.childOpenId ? String(options.childOpenId) : '';
      const recordId = options.recordId ? String(options.recordId) : '';

      if (recordId) {
        // 预留：如后续要高亮某条记录，可在这里保存并在 processRecords 后滚动定位
        this._presetRecordId = recordId;
      }

      this.setData({
        currentUserOpenId: user.openId,
        presetChildOpenId
      });

      // 接收首页传递的科目索引参数
      if (options.selectedSubjectIndex !== undefined) {
        const subjectIndex = parseInt(options.selectedSubjectIndex);
        this.setData({
          selectedSubjectIndex: subjectIndex
        });
      }

      // 初始化绑定关系（判断是否家长 + 拉孩子列表）
      await this.initBindingsForRole();

      this.generateYearMonthRange();
      this.fetchRecords();
    } catch (e) {
      console.error('初始化失败', e);
      wx.showToast({ title: '初始化失败', icon: 'none' });
    }
  },

  onShow: async function() {
    // 家长端：孩子昵称可能在孩子端被修改。每次进入页面都刷新绑定列表，保证筛选项名称最新。
    try {
      await this.initBindingsForRole();
    } catch (e) {
      // ignore
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

  onSubjectChange(e) {
    this.setData({ selectedSubjectIndex: parseInt(e.detail.value) });
    this.fetchRecords();
  },

  // 初始化绑定关系：根据是否有“作为家长的绑定孩子”来识别家长身份
  initBindingsForRole: async function() {
    try {
      const { result } = await wx.cloud.callFunction({ name: 'getMyBindings' });
      if (!result || !result.success) return;

      const asParent = (result.data && result.data.asParent) || [];
      const isParent = asParent.length > 0;

      const childOptions = [{ openid: '', name: '无' }, ...asParent];

      // 保持用户当前选中（或通知预设）
      let selectedChildIndex = this.data.selectedChildIndex || 0;

      // 1) 通知跳转带 childOpenId => 优先选中该孩子
      // 2) 如果当前选中项 openid 在新列表中仍存在 => 保持不变
      // 3) 否则如果家长已绑定孩子 => 默认选中第一个孩子（避免停在“无”导致看起来没记录）
      // 4) 否则 => 选“无”
      const preset = this.data.presetChildOpenId;
      if (preset) {
        const idx = childOptions.findIndex((i) => i.openid === preset);
        if (idx >= 0) selectedChildIndex = idx;
      } else {
        const cur = (this.data.childOptions && this.data.childOptions[selectedChildIndex]) || { openid: '' };
        if (cur.openid) {
          const stillIdx = childOptions.findIndex((i) => i.openid === cur.openid);
          if (stillIdx >= 0) selectedChildIndex = stillIdx;
          else if (isParent && childOptions.length > 1) selectedChildIndex = 1;
          else selectedChildIndex = 0;
        } else {
          if (isParent && childOptions.length > 1) selectedChildIndex = 1;
          else selectedChildIndex = 0;
        }
      }

      this.setData({
        isParent,
        childOptions,
        selectedChildIndex
      });
    } catch (e) {
      console.warn('初始化绑定关系失败（忽略）', e);
    }
  },

  // 家长端切换孩子筛选
  onChildChange: function(e) {
    this.setData({ selectedChildIndex: parseInt(e.detail.value) });
    this.fetchRecords();
  },

  fetchRecords: async function() {
    wx.showLoading({ title: '加载中...' });
    try {
      const [yearIdx, monthIdx] = this.data.selectedYearMonth;
      const year = parseInt(this.data.yearMonthRange[0][yearIdx]);
      const monthStr = this.data.yearMonthRange[1][monthIdx];
      const selectedSubject = this.data.subjectRange[this.data.selectedSubjectIndex];

      let startTime, endTime;
      if (monthStr === '全部') {
        startTime = new Date(year, 0, 1);
        endTime = new Date(year, 11, 31, 23, 59, 59);
      } else {
        const month = parseInt(monthStr);
        startTime = new Date(year, month - 1, 1);
        endTime = new Date(year, month, 0, 23, 59, 59);
      }

      // 构建查询条件：日期 + 科目 + (家长端可按孩子过滤)
      // 规则：
      // - 家长：可选某个孩子 openid，列表只显示该孩子的打卡
      // - 家长未绑定孩子：下拉为“无”，列表为空提示（由 wxml 处理）
      // - 孩子/普通用户：只看自己的打卡（currentUserOpenId）
      let targetOpenId = this.data.currentUserOpenId;

      if (this.data.isParent) {
        const opt = this.data.childOptions[this.data.selectedChildIndex] || { openid: '' };
        if (opt.openid) {
          targetOpenId = opt.openid;
        } else {
          // 选“无” => 家长端不展示任何记录
          this.processRecords([]);
          wx.hideLoading();
          return;
        }
      }

      const query = {
        createTime: _.gte(startTime).and(_.lte(endTime)),
        puncherOpenId: targetOpenId,
        subject: selectedSubject
      };

      this.setData({
        currentYear: year
      });

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
    const dailyScores = {}; // 用于存储每天的最高分 { 'YYYY-MM-DD': maxScore }

    // 今日（本地时区）用于标注
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;

    const processedRecords = records.map(item => {
      const date = new Date(item.createTime);
      const y = date.getFullYear();
      const m = (date.getMonth() + 1).toString().padStart(2, '0');
      const d = date.getDate().toString().padStart(2, '0');
      const hh = date.getHours().toString().padStart(2, '0');
      const mm = date.getMinutes().toString().padStart(2, '0');
      
      const dateStr = `${m}-${d}`;
      const timeStr = `${hh}:${mm}`;
      const dateTimeStr = `${m}-${d}/${hh}:${mm}`; // 合并日期和时间
      const dayKey = `${y}-${m}-${d}`; // 用于按天去重
      const monthKey = `${y}-${m}`; // 用于按月分组
      const isToday = dayKey === todayKey;

      // 计算总分（同一天的分数只加一次，选择得分最高的一次）
      if (item.score !== -1 && typeof item.score === 'number') {
        if (!dailyScores[dayKey] || item.score > dailyScores[dayKey]) {
          dailyScores[dayKey] = item.score;
        }
      }

      return {
        ...item,
        dateTimeStr,
        monthKey,
        isToday
      };
    });

    // 计算总分：将每天的最高分相加
    totalScore = Object.values(dailyScores).reduce((sum, score) => sum + score, 0);

    // 计算奖杯和小红花
    // 每 100 分一个奖杯，每 10 分一朵小红花
    const trophyCount = Math.floor(totalScore / 100);
    const flowerCount = Math.floor((totalScore % 100) / 10);

    // 按月分组
    const monthGroupsMap = {};
    processedRecords.forEach(item => {
      if (!monthGroupsMap[item.monthKey]) {
        const [year, month] = item.monthKey.split('-');
        monthGroupsMap[item.monthKey] = {
          monthKey: item.monthKey,
          monthName: `${year}年${parseInt(month)}月`,
          records: [],
          count: 0,
          totalScore: 0,
          expanded: true // 默认展开
        };
      }
      monthGroupsMap[item.monthKey].records.push(item);
      monthGroupsMap[item.monthKey].count++;
      // 累加该月的分数（按每天最高分计算）
      const dayKey = item.monthKey + '-' + item.dateTimeStr.split('/')[0];
      if (item.score !== -1 && typeof item.score === 'number') {
        if (!monthGroupsMap[item.monthKey].dayScores) {
          monthGroupsMap[item.monthKey].dayScores = {};
        }
        if (!monthGroupsMap[item.monthKey].dayScores[dayKey] || item.score > monthGroupsMap[item.monthKey].dayScores[dayKey]) {
          monthGroupsMap[item.monthKey].dayScores[dayKey] = item.score;
        }
      }
    });

    // 计算每月总分
    const monthGroups = Object.values(monthGroupsMap).map(group => {
      group.totalScore = Object.values(group.dayScores || {}).reduce((sum, score) => sum + score, 0);
      delete group.dayScores; // 删除临时数据
      return group;
    });

    // 按月份降序排序
    monthGroups.sort((a, b) => b.monthKey.localeCompare(a.monthKey));

    this.setData({
      yearlyTotal,
      totalScore,
      trophyCount,
      flowerCount,
      records: processedRecords,
      monthGroups
    });
  },

  // 切换月份展开/折叠状态
  toggleMonth: function(e) {
    const monthKey = e.currentTarget.dataset.monthKey;
    const monthGroups = this.data.monthGroups.map(group => {
      if (group.monthKey === monthKey) {
        return { ...group, expanded: !group.expanded };
      }
      return group;
    });
    this.setData({ monthGroups });
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
  },

  // 查看建议
  viewSuggestion: function(e) {
    const item = e.currentTarget.dataset.item;
    
    if (!item || !item.suggestion) return;
    
    const that = this;
    const suggestionText = item.suggestion;
    
    wx.showModal({
      title: '💡 改进建议',
      content: suggestionText,
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#07c160'
    });
  },

  // 查看检查结果
  viewCheckResult: function(e) {
    const item = e.currentTarget.dataset.item;
    
    if (!item) return;
    
    console.log('查看检查结果的 item:', JSON.stringify(item));
    
    // 兼容两种字段命名格式（驼峰和下划线）
    const checkResults = item.checkResults || item.check_results || [];
    const totalQuestions = item.totalQuestions || item.total_questions || (checkResults.length > 0 ? checkResults.length : 0);
    const correctQuestions = item.correctQuestions || item.correct_questions || (checkResults.length > 0 ? checkResults.filter(r => r.is_correct).length : 0);
    const recognizedContent = item.recognizedContent || item.recognized_content || '';
    const aiAnalysis = item.aiAnalysis || item.judgment || '';
    const suggestion = item.suggestion || '';
    const score = item.score !== undefined && item.score !== -1 ? item.score : 0;
    
    // 根据得分计算颜色
    let scoreClass = 'score-low';
    if (score >= 8) {
      scoreClass = 'score-high';
    } else if (score >= 6) {
      scoreClass = 'score-mid';
    }
    
    // 解析英语单词列表（汉译英格式）
    let wordList = [];
    if (item.subject === '英语' && recognizedContent) {
      wordList = this.parseWordList(recognizedContent, checkResults);
    }
    
    // 设置数据到页面（使用原生数据绑定）
    this.setData({
      score: score,
      scoreClass: scoreClass,
      recognizedContent: recognizedContent,
      wordList: wordList,
      totalQuestions: totalQuestions,
      correctQuestions: correctQuestions,
      aiAnalysis: aiAnalysis,
      suggestion: suggestion,
      checkResults: checkResults,
      showCheckResultModal: true
    });
  },

  // 解析英语单词列表（从识别内容中提取汉译英格式）
  parseWordList: function(recognizedContent, checkResults) {
    const wordList = [];
    
    // 尝试从 checkResults 中提取单词信息
    if (checkResults && checkResults.length > 0) {
      checkResults.forEach(item => {
        // 从 question 中提取中文（格式：汉译英：老师）
        let cn = '';
        if (item.question && item.question.includes('汉译英：')) {
          cn = item.question.replace('汉译英：', '').trim();
        } else {
          cn = item.question || '';
        }
        
        wordList.push({
          cn: cn,
          en: item.user_answer || '',
          correct: item.correct_answer || '',
          isCorrect: item.is_correct || false
        });
      });
    }
    
    // 如果 checkResults 为空，尝试从 recognizedContent 中解析
    // 格式如：老师-teacher, 苹果-peay, 头发-hand
    if (wordList.length === 0 && recognizedContent) {
      const pairs = recognizedContent.split(/[,,]/);
      pairs.forEach(pair => {
        const parts = pair.trim().split(/[-]/);
        if (parts.length >= 2) {
          wordList.push({
            cn: parts[0].trim(),
            en: parts[1].trim(),
            correct: parts[1].trim(),
            isCorrect: true
          });
        }
      });
    }
    
    return wordList;
  },

  // 关闭检查结果弹框
  closeCheckResultModal: function() {
    this.setData({
      showCheckResultModal: false
    });
  },

  // 关闭 AI 分析结果弹框
  closeAIResultModal: function() {
    this.setData({
      showAIResultModal: false
    });
  }
});
