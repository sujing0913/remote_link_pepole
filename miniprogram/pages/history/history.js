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
    dateRange: [], // 日期选项列表
    selectedDateIndex: 0, // 当前选中的日期索引
    subjectRange: ['语文', '数学', '英语', '减肥', '生活', '健身', '其他'], // 与首页保持一致
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
    checkResults: [],
    // AI 评分弹框数据
    showAIResultModal: false,
    aiScore: 0,
    aiScoreClass: 'score-low',
    aiRecognizedContent: '',
    aiWordList: [],
    aiTotalQuestions: 0,
    aiCorrectQuestions: 0,
    aiJudgment: '',
    aiCheckResults: [],
    fileType: '',
    fileID: '',
    // AI 评分加载动画数据
    showAILoading: false,
    currentAnimal: '🐱',
    animalTimer: null,

    // 评分选择弹框数据
    showRatingChoice: false,
    currentRatingItem: null,

    // 人工评价弹框数据
    showManualRatingModal: false,
    manualRatingScore: '',
    manualRatingEvaluation: ''
  },

  // 可爱的小动物头像列表
  animalAvatars: ['🐱', '🐶', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦆', '🦅', '🦉', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦗', '🕷️', '🦂'],

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

      this.generateDateRange();
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

  // 生成日期范围选项（最近 12 个月 + 全部时间）
  generateDateRange() {
    const now = new Date();
    const dateOptions = [];
    
    // 添加"全部"选项
    dateOptions.push('全部');
    
    // 添加最近 12 个月选项，格式：2026-03
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      dateOptions.push(`${year}-${month}`);
    }
    
    this.setData({
      dateRange: dateOptions,
      selectedDateIndex: 0 // 默认选中"全部时间"
    });
  },

  // 日期选择变化
  onDateChange(e) {
    this.setData({ selectedDateIndex: parseInt(e.detail.value) });
    this.fetchRecords();
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
      const dateIndex = this.data.selectedDateIndex;
      const dateStr = this.data.dateRange[dateIndex];
      const selectedSubject = this.data.subjectRange[this.data.selectedSubjectIndex];
      const isParent = this.data.isParent;
      const selectedChildIndex = this.data.selectedChildIndex;
      const childOptions = this.data.childOptions;

      console.log('fetchRecords - 日期选项:', dateStr);
      console.log('fetchRecords - 科目:', selectedSubject);
      console.log('fetchRecords - 是否家长:', isParent);
      console.log('fetchRecords - 选中孩子索引:', selectedChildIndex);
      console.log('fetchRecords - 孩子选项:', childOptions);

      let startTime, endTime;
      if (dateIndex === 0) {
        // 全部时间 - 不限制时间范围
        startTime = new Date(2023, 0, 1);
        endTime = new Date();
      } else {
        // 解析年月，如 "2026-03"
        const parts = dateStr.split('-');
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        // 注意：月份从 0 开始，所以 month-1 是当月第一天
        // endTime 是下个月第一天，这样能包含当月所有日期
        startTime = new Date(year, month - 1, 1);
        endTime = new Date(year, month, 1, 0, 0, 0);
        this.setData({ currentYear: year });
      }

      console.log('fetchRecords - 时间范围:', startTime.toISOString(), 'to', endTime.toISOString());

      // 构建查询条件：日期 + 科目 + (家长端可按孩子过滤)
      // 规则：
      // - 家长：可选某个孩子 openid，列表只显示该孩子的打卡
      // - 家长未绑定孩子：下拉为"无"，列表为空提示（由 wxml 处理）
      // - 孩子/普通用户：只看自己的打卡（currentUserOpenId）
      let targetOpenId = this.data.currentUserOpenId;

      if (isParent) {
        const opt = childOptions[selectedChildIndex] || { openid: '' };
        console.log('fetchRecords - 家长模式，选中孩子选项:', opt);
        if (opt.openid) {
          targetOpenId = opt.openid;
        } else {
          // 选"无" => 显示当前用户自己的打卡记录
          targetOpenId = this.data.currentUserOpenId;
        }
      }

      console.log('fetchRecords - 查询的 openid:', targetOpenId);

      const query = {
        createTime: _.gte(startTime).and(_.lte(endTime)),
        puncherOpenId: targetOpenId,
        subject: selectedSubject
      };

      console.log('fetchRecords - 查询条件:', JSON.stringify(query));

      const res = await db.collection('check_ins')
        .where(query)
        .orderBy('createTime', 'desc')
        .get();

      console.log('fetchRecords - 查询结果数量:', res.data.length);

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
  },

  // 显示评分弹框（选择 AI 自动评分或手动评分）
  showRatingModal: function(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) {
      wx.showToast({ title: '记录数据异常', icon: 'none' });
      return;
    }
    
    // 检查是否有媒体内容
    if (!item.mediaUrl) {
      wx.showModal({
        title: '提示',
        content: '该记录没有媒体内容，无法进行 AI 评分，是否进行手动评分？',
        confirmText: '手动评分',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.setData({
              currentRatingItem: item,
              showManualRatingModal: true,
              manualRatingScore: item.score !== -1 ? item.score : '',
              manualRatingEvaluation: item.aiAnalysis || ''
            });
          }
        }
      });
      return;
    }
    
    // 检查是否为图片（AI 仅支持图片）
    if (item.mediaType !== 'image') {
      wx.showModal({
        title: '提示',
        content: '该记录为视频，无法进行 AI 评分，是否进行手动评分？',
        confirmText: '手动评分',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.setData({
              currentRatingItem: item,
              showManualRatingModal: true,
              manualRatingScore: item.score !== -1 ? item.score : '',
              manualRatingEvaluation: item.aiAnalysis || ''
            });
          }
        }
      });
      return;
    }
    
    // 保存当前记录并显示选择弹框
    this.setData({
      currentRatingItem: item,
      showRatingChoice: true
    });
  },

  // 关闭评分弹框
  closeRatingModal: function() {
    this.setData({
      showRatingChoice: false,
      currentRatingItem: null
    });
  },

  // 选择AI自动评价
  onAIAssessment: async function() {
    const item = this.data.currentRatingItem;
    if (!item) {
      wx.showToast({ title: '记录不存在', icon: 'none' });
      return;
    }

    this.setData({
      showRatingChoice: false
    });

    if (!item.mediaUrl) {
      wx.showToast({ title: '该记录无媒体内容', icon: 'none' });
      return;
    }

    if (item.mediaType !== 'image') {
      wx.showToast({ title: '仅支持图片AI分析', icon: 'none' });
      return;
    }

    // 调用 AI 评分
    this.callAIEvaluate(item._id, item.subject, item.mediaType, item.mediaUrl);
  },

  // 选择人工评价
  onManualAssessment: function() {
    const item = this.data.currentRatingItem;
    if (!item) {
      wx.showToast({ title: '记录不存在', icon: 'none' });
      return;
    }

    this.setData({
      showRatingChoice: false,
      showManualRatingModal: true,
      manualRatingScore: item.score !== -1 ? item.score : '',
      manualRatingEvaluation: item.aiAnalysis || ''
    });
  },

  // 关闭人工评价弹框
  closeManualRatingModal: function() {
    this.setData({
      showManualRatingModal: false,
      manualRatingScore: '',
      manualRatingEvaluation: ''
    });
  },

  // 阻止弹框内容点击事件冒泡
  stopManualModalTap: function() {
    // 空函数，阻止事件冒泡
  },

  // 阻止 AI 评分弹框内容点击事件冒泡
  stopPropagation: function() {
    // 空函数，阻止事件冒泡
  },

  // 人工评价输入事件
  onManualScoreInput: function(e) {
    const score = parseInt(e.detail.value) || '';
    this.setData({
      manualRatingScore: score
    });
  },

  onManualEvaluationInput: function(e) {
    this.setData({
      manualRatingEvaluation: e.detail.value
    });
  },

  // 保存人工评价
  saveManualRating: async function() {
    const item = this.data.currentRatingItem;
    const { manualRatingScore, manualRatingEvaluation, manualRatingSuggestion } = this.data;

    console.log('saveManualRating - item:', item);
    console.log('saveManualRating - score:', manualRatingScore);
    console.log('saveManualRating - evaluation:', manualRatingEvaluation);

    if (!item || !item._id) {
      wx.showToast({ title: '记录不存在', icon: 'none' });
      return;
    }

    // 验证得分
    if (manualRatingScore === '' || manualRatingScore === undefined || manualRatingScore === null) {
      wx.showToast({ title: '请输入得分', icon: 'none' });
      return;
    }

    const scoreNum = parseInt(manualRatingScore);
    if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 10) {
      wx.showToast({ title: '得分应在 0-10 之间', icon: 'none' });
      return;
    }

    try {
      // 使用云函数更新打卡记录，确保权限校验和数据库同步
      const result = await wx.cloud.callFunction({
        name: 'updateCheckIn',
        data: {
          recordId: item._id,
          score: scoreNum,
          aiAnalysis: manualRatingEvaluation || '',
          manualEdited: true
        }
      });

      console.log('saveManualRating - result:', result);

      if (result.result && result.result.success) {
        wx.showToast({ title: '评分保存成功', icon: 'success' });
        this.setData({
          showManualRatingModal: false,
          manualRatingScore: '',
          manualRatingEvaluation: '',
          currentRatingItem: null
        });
        // 刷新记录列表
        this.fetchRecords();
      } else {
        console.error('保存失败 - result:', result);
        wx.showToast({ 
          title: '保存失败：' + (result.result ? result.result.message : '未知错误'), 
          icon: 'error' 
        });
      }
    } catch (error) {
      console.error('保存人工评价失败', error);
      wx.showToast({ title: '保存失败：' + (error.errMsg || error.message || '未知错误'), icon: 'error' });
    }
  },

  // 对当前记录进行AI评分（家长对孩子记录的AI分析）
  onAIEvaluateForRecord: async function(e) {
    const item = e.currentTarget.dataset.item;
    
    if (!item) {
      wx.showToast({ title: '记录不存在', icon: 'none' });
      return;
    }

    // 检查是否为家长查看孩子的记录
    if (this.data.isParent && this.data.selectedChildIndex != 0) {
      // 家长对孩子的记录进行AI评分
      if (!item.mediaUrl) {
        wx.showToast({ title: '该记录无媒体内容', icon: 'none' });
        return;
      }

      if (item.mediaType !== 'image') {
        wx.showToast({ title: '仅支持图片AI分析', icon: 'none' });
        return;
      }

      // 调用 AI 评分
      this.callAIEvaluate(item._id, item.subject, item.mediaType, item.mediaUrl);
    } else {
      // 普通用户的AI评分逻辑
      if (!item.mediaUrl) {
        wx.showToast({ title: '该记录无媒体内容', icon: 'none' });
        return;
      }

      if (item.mediaType !== 'image') {
        wx.showToast({ title: '仅支持图片AI分析', icon: 'none' });
        return;
      }

      // 调用 AI 评分
      this.callAIEvaluate(item._id, item.subject, item.mediaType, item.mediaUrl);
    }
  },

  // 处理得分编辑
  onScoreEdit: async function(e) {
    const { recordId, field } = e.currentTarget.dataset;
    const newValue = e.detail.value;
    
    if (!recordId) return;
    
    // 验证得分范围
    const score = parseInt(newValue);
    if (isNaN(score) || score < 0 || score > 10) {
      wx.showToast({ title: '得分应在 0-10 之间', icon: 'none' });
      return;
    }
    
    try {
      // 使用云函数更新打卡记录
      const result = await wx.cloud.callFunction({
        name: 'updateCheckIn',
        data: {
          recordId: recordId,
          score: score,
          manualEdited: true
        }
      });

      if (result.result && result.result.success) {
        wx.showToast({ title: '得分已更新', icon: 'success', duration: 1000 });
        // 刷新记录列表
        this.fetchRecords();
      } else {
        wx.showToast({ 
          title: '更新失败：' + (result.result ? result.result.message : '未知错误'), 
          icon: 'error' 
        });
      }
    } catch (error) {
      console.error('更新得分失败', error);
      wx.showToast({ title: '更新失败', icon: 'error' });
    }
  },

  // 处理文本编辑（评价、建议等）
  onTextEdit: async function(e) {
    const { recordId, field } = e.currentTarget.dataset;
    const newValue = e.detail.value;
    
    if (!recordId) return;
    
    try {
      // 使用云函数更新打卡记录
      const updateData = {
        recordId: recordId,
        manualEdited: true
      };
      
      // 根据字段名传递不同的数据
      if (field === 'score') {
        updateData.score = parseInt(newValue) || 0;
      } else if (field === 'aiAnalysis') {
        updateData.aiAnalysis = newValue || '';
      }
      
      const result = await wx.cloud.callFunction({
        name: 'updateCheckIn',
        data: updateData
      });

      if (result.result && result.result.success) {
        wx.showToast({ title: '已更新', icon: 'success', duration: 1000 });
        // 刷新记录列表
        this.fetchRecords();
      } else {
        wx.showToast({ 
          title: '更新失败：' + (result.result ? result.result.message : '未知错误'), 
          icon: 'error' 
        });
      }
    } catch (error) {
      console.error('更新文本失败', error);
      wx.showToast({ title: '更新失败', icon: 'error' });
    }
  },

  // AI 评分调用函数
  callAIEvaluate: function(recordId, subject, fileType, fileID) {
    const that = this;
    
    // 显示加载动画
    that.showAILoadingAnim();
    
    // 直接调用 doubaoAI 云函数进行图片识别和分析
    wx.cloud.callFunction({
      name: 'doubaoAI',
      data: {
        fileID: fileID,
        userPrompt: `你是一位严格的${subject}老师，请识别图片中的学习打卡内容。请按以下 JSON 格式回复（只返回 JSON，不要其他文字）：
{
  "recognized_content": "识别到的打卡内容（如：1+1=3, 2+2=4, 3+3=7）",
  "total_questions": 题目总数量（数字，如 5）,
  "correct_questions": 正确题目数量（数字，如 3）,
  "score": 得分（数字，计算公式：correct_questions/total_questions*10，保留整数）,
  "judgment": "对打卡内容进行判断（如：共 5 道题，正确 3 道，错误 2 道，需要加强练习）",
  "check_results": [
    {"question": "第 1 题题目内容", "user_answer": "用户写的答案", "correct_answer": "正确答案", "is_correct": false},
    {"question": "第 2 题题目内容", "user_answer": "用户写的答案", "correct_answer": "正确答案", "is_correct": true}
  ]
}

注意：
1. 请仔细识别图片中的每一道题目
2. 准确判断每道题的对错
3. score = Math.round(correct_questions / total_questions * 10)
4. 如果只有 1 道题，正确得 10 分，错误得 0 分
5. check_results 必须包含每道题的详细信息：question(题目)、user_answer(用户答案)、correct_answer(正确答案)、is_correct(是否正确)`
      },
      timeout: 60000, // 60 秒超时
      success: (aiRes) => {
        that.hideAILoadingAnim();
        console.log('AI 分析完成:', aiRes);
        
        // 检查返回结果
        if (aiRes.result && aiRes.result.success && aiRes.result.data) {
          const result = aiRes.result.data;
          // 保存 AI 结果到数据库
          that.saveAIResultToDB(recordId, result, subject);
          // 显示分析结果弹框
          that.showAIResultModal(result, fileType, fileID, subject);
        } else {
          // AI 分析失败
          console.log('AI 分析失败:', aiRes.result);
          wx.showToast({
            title: 'AI 分析失败，请重试',
            icon: 'none',
            duration: 2000
          });
        }
      },
      fail: (aiErr) => {
        that.hideAILoadingAnim();
        console.error('AI 分析失败:', aiErr);
        wx.showToast({
          title: 'AI 分析失败：' + (aiErr.errMsg || '未知错误'),
          icon: 'none',
          duration: 2000
        });
      }
    });
  },

  // 保存 AI 分析结果到数据库（使用云函数 updateCheckIn）
  saveAIResultToDB: async function(recordId, result, subject) {
    const score = result.score || 0;
    const judgment = result.judgment || '';
    const recognizedContent = result.recognized_content || '';
    const totalQuestions = result.total_questions || 0;
    const correctQuestions = result.correct_questions || 0;
    const checkResults = result.check_results || [];

    try {
      const cloudResult = await wx.cloud.callFunction({
        name: 'updateCheckIn',
        data: {
          recordId: recordId,
          score: score,
          aiAnalysis: judgment,
          recognizedContent: recognizedContent,
          totalQuestions: totalQuestions,
          correctQuestions: correctQuestions,
          checkResults: checkResults,
          manualEdited: false
        }
      });

      if (cloudResult.result && cloudResult.result.success) {
        console.log('AI 结果保存成功');
        // 刷新记录列表
        this.fetchRecords();
      } else {
        console.error('AI 结果保存失败', cloudResult.result);
      }
    } catch (err) {
      console.error('AI 结果保存失败', err);
    }
  },

  // 显示 AI 分析结果弹框
  showAIResultModal: function(result, fileType, fileID, subject) {
    const that = this;
    
    const score = result.score || 0;
    const recognizedContent = result.recognized_content || '';
    const judgment = result.judgment || '';
    const totalQuestions = result.total_questions || 0;
    const correctQuestions = result.correct_questions || 0;
    const checkResults = result.check_results || [];
    
    // 根据得分计算颜色
    let scoreClass = 'score-low';
    if (score >= 8) {
      scoreClass = 'score-high';
    } else if (score >= 6) {
      scoreClass = 'score-mid';
    }
    
    // 解析英语单词打卡内容（汉译英格式）
    let wordList = [];
    if (subject === '英语' && recognizedContent) {
      wordList = this.parseWordList(recognizedContent, checkResults);
    }
    
    // 设置数据到页面
    that.setData({
      aiScore: score,
      aiScoreClass: scoreClass,
      aiRecognizedContent: recognizedContent,
      aiWordList: wordList,
      aiTotalQuestions: totalQuestions,
      aiCorrectQuestions: correctQuestions,
      aiJudgment: judgment,
      aiCheckResults: checkResults,
      showAIResultModal: true,
      fileType: fileType,
      fileID: fileID
    });
  },

  // 显示 AI 加载动画
  showAILoadingAnim: function() {
    const that = this;
    
    // 随机选择一个小动物
    const randomAnimal = this.animalAvatars[Math.floor(Math.random() * this.animalAvatars.length)];
    
    this.setData({
      showAILoading: true,
      currentAnimal: randomAnimal
    });
    
    // 每 0.8 秒切换一个小动物
    const timer = setInterval(() => {
      const newAnimal = this.animalAvatars[Math.floor(Math.random() * this.animalAvatars.length)];
      that.setData({
        currentAnimal: newAnimal
      });
    }, 800);
    
    this.setData({
      animalTimer: timer
    });
  },

  // 隐藏 AI 加载动画
  hideAILoadingAnim: function() {
    if (this.data.animalTimer) {
      clearInterval(this.data.animalTimer);
      this.setData({
        animalTimer: null
      });
    }
    
    this.setData({
      showAILoading: false
    });
  },

  // 查看原图
  viewOriginalImage: function() {
    const that = this;
    wx.previewImage({
      urls: [that.data.fileID],
      current: that.data.fileID
    });
  },

  // 保存 AI 分析结果到评价列
  saveAIResult: async function() {
    const item = this.data.currentRatingItem;
    if (!item || !item._id) {
      wx.showToast({ title: '记录不存在', icon: 'none' });
      return;
    }

    const { aiJudgment, aiScore } = this.data;

    // 验证得分
    if (aiScore === undefined || aiScore === null || aiScore === '') {
      wx.showToast({ title: '缺少得分', icon: 'none' });
      return;
    }

    try {
      // 使用云函数更新打卡记录，将 AI 分析结果保存到 aiAnalysis 字段（评价列）
      const result = await wx.cloud.callFunction({
        name: 'updateCheckIn',
        data: {
          recordId: item._id,
          score: aiScore,
          aiAnalysis: aiJudgment || '',
          manualEdited: true
        }
      });

      console.log('saveAIResult - result:', result);

      if (result.result && result.result.success) {
        wx.showToast({ title: '评价已保存', icon: 'success' });
        this.setData({
          showAIResultModal: false,
          currentRatingItem: null
        });
        // 刷新记录列表
        this.fetchRecords();
      } else {
        console.error('保存失败 - result:', result);
        wx.showToast({ 
          title: '保存失败：' + (result.result ? result.result.message : '未知错误'), 
          icon: 'error' 
        });
      }
    } catch (error) {
      console.error('保存 AI 结果失败', error);
      wx.showToast({ title: '保存失败：' + (error.errMsg || error.message || '未知错误'), icon: 'error' });
    }
  },

  // 关闭 AI 分析结果弹框（自动保存后关闭）
  closeAIResultModal: async function() {
    const item = this.data.currentRatingItem;
    
    // 如果有当前记录且 AI 分析结果存在，则自动保存
    if (item && item._id && this.data.aiJudgment) {
      const { aiJudgment, aiScore } = this.data;
      
      // 验证得分
      if (aiScore !== undefined && aiScore !== null && aiScore !== '') {
        try {
          // 使用云函数更新打卡记录，将 AI 分析结果保存到 aiAnalysis 字段（评价列）
          const result = await wx.cloud.callFunction({
            name: 'updateCheckIn',
            data: {
              recordId: item._id,
              score: aiScore,
              aiAnalysis: aiJudgment || '',
              manualEdited: true
            }
          });

          console.log('closeAIResultModal - auto save result:', result);

          if (result.result && result.result.success) {
            console.log('关闭弹框时自动保存成功');
          }
        } catch (error) {
          console.error('自动保存失败', error);
        }
      }
    }
    
    this.setData({
      showAIResultModal: false,
      currentRatingItem: null
    });
    // 刷新记录列表，确保显示最新的评价内容
    this.fetchRecords();
  }
});
