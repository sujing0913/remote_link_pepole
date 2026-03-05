const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    startDate: '',
    endDate: '',
    totalCount: 0,
    isTodayDone: false,
    loading: false,
    subjects: ['语文', '数学', '英语'],
    selectedSubjectIndex: 2, // 默认英语
    currentUserOpenId: '', // 当前登录用户的 openId
    currentDateStr: '', // 当前日期字符串
    // 本次打卡数据
    latestPunch: null,
    // AI 评分弹框数据
    showAIResultModal: false,
    aiResultHtml: '',
    aiScore: 0,
    aiScoreClass: 'score-low',
    aiRecognizedContent: '',
    aiTotalQuestions: 0,
    aiCorrectQuestions: 0,
    aiJudgment: '',
    aiSuggestion: '',
    aiCheckResults: [],
    fileType: '',
    fileID: '',
    recordId: '', // 当前打卡记录 ID
    // AI 评分加载动画数据
    showAILoading: false,
    currentAnimal: '🐱', // 当前动物头像
    animalTimer: null // 动物头像切换定时器
  },

  // 可爱的小动物头像列表
  animalAvatars: ['🐱', '🐶', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦆', '🦅', '🦉', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦗', '🕷️', '🦂'],

  onLoad: async function(options) {
    // 启用分享功能
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });

    try {
      wx.showLoading({ title: '初始化中...' });
      
      // 获取当前用户 OpenId
      const { result: user } = await wx.cloud.callFunction({ name: 'getUserInfo' });
      
      if (user && user.openId) {
        this.setData({
          currentUserOpenId: user.openId
        });
      }
      
      this.initDates();
      this.checkTodayStatus();
      this.queryCount();
    } catch (e) {
      console.error('初始化失败', e);
      this.initDates();
    } finally {
      wx.hideLoading();
    }
  },

  onShow: function() {
    this.checkTodayStatus();
    this.fetchLatestPunch();
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
      const currentUserOpenId = this.data.currentUserOpenId;

      const query = {
        createTime: _.gte(start).and(_.lte(end)),
        subject: subject,
        puncherOpenId: currentUserOpenId
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
    const currentUserOpenId = this.data.currentUserOpenId;

    try {
      const query = {
        createTime: _.gte(start).and(_.lte(end)),
        subject: subject,
        puncherOpenId: currentUserOpenId
      };

      const res = await db.collection('check_ins').where(query).count();

      this.setData({
        isTodayDone: res.total > 0
      });
    } catch (err) {
      console.error('检查今日状态失败', err);
    }
  },

  // 获取本次打卡记录（最新一条）
  fetchLatestPunch: async function() {
    try {
      const subject = this.data.subjects[this.data.selectedSubjectIndex];
      const currentUserOpenId = this.data.currentUserOpenId;

      const res = await db.collection('check_ins')
        .where({
          subject: subject,
          puncherOpenId: currentUserOpenId
        })
        .orderBy('createTime', 'desc')
        .limit(1)
        .get();

      if (res.data && res.data.length > 0) {
        const item = res.data[0];
        // 格式化时间
        const createTime = new Date(item.createTime);
        const timeStr = `${(createTime.getMonth() + 1).toString().padStart(2, '0')}-${createTime.getDate().toString().padStart(2, '0')} ${createTime.getHours().toString().padStart(2, '0')}:${createTime.getMinutes().toString().padStart(2, '0')}`;
        
        // 获取图片临时 URL
        let mediaUrl = item.mediaUrl;
        if (item.mediaType === 'image' && item.mediaUrl.startsWith('cloud://')) {
          try {
            const tempUrlRes = await wx.cloud.getTempFileURL({ fileList: [item.mediaUrl] });
            if (tempUrlRes.fileList && tempUrlRes.fileList.length > 0) {
              mediaUrl = tempUrlRes.fileList[0].tempFileURL;
            }
          } catch (e) {
            console.error('获取临时 URL 失败', e);
          }
        }

        this.setData({
          latestPunch: {
            ...item,
            timeStr: timeStr,
            mediaUrl: mediaUrl
          }
        });
      } else {
        this.setData({
          latestPunch: null
        });
      }
    } catch (err) {
      console.error('获取最新打卡记录失败', err);
    }
  },

  // 查看本次打卡的媒体文件
  viewLatestMedia: function() {
    const item = this.data.latestPunch;
    if (!item) return;

    if (item.mediaType === 'image') {
      wx.previewImage({
        urls: [item.mediaUrl],
        current: item.mediaUrl
      });
    } else if (item.mediaType === 'video') {
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

  // 查看最新打卡内容（显示实际打卡的照片或视频）
  viewLatestMediaOrTip: function() {
    const item = this.data.latestPunch;
    
    if (!item) {
      wx.showToast({ title: '今日还未打卡', icon: 'none' });
      return;
    }
    
    // 查看实际的媒体文件（照片或视频）
    if (item.mediaType === 'image') {
      wx.previewImage({
        urls: [item.mediaUrl],
        current: item.mediaUrl
      });
    } else if (item.mediaType === 'video') {
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

  // 查看本次打卡的建议
  viewLatestSuggestion: function() {
    const item = this.data.latestPunch;
    if (!item || !item.suggestion) return;

    wx.showModal({
      title: '💡 改进建议',
      content: item.suggestion,
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#07c160'
    });
  },

  // 查看本次打卡的建议或提示未打卡
  viewLatestSuggestionOrTip: function() {
    const item = this.data.latestPunch;
    if (!item) {
      wx.showToast({ title: '还未打卡', icon: 'none' });
      return;
    }
    if (!item.suggestion) {
      wx.showToast({ title: '暂无建议', icon: 'none' });
      return;
    }
    this.viewLatestSuggestion();
  },

  // 查看本次打卡的检查结果
  viewLatestCheckResult: function() {
    const item = this.data.latestPunch;
    if (!item || !item.checkResults || item.checkResults.length === 0) return;

    // 复用历史记录的检查结果弹框逻辑
    this.setData({
      score: item.score || 0,
      recognizedContent: item.recognizedContent || '',
      totalQuestions: item.totalQuestions || 0,
      correctQuestions: item.correctQuestions || 0,
      aiAnalysis: item.aiAnalysis || item.judgment || '',
      suggestion: item.suggestion || '',
      checkResults: item.checkResults || [],
      showCheckResultModal: true
    });
  },

  // 查看本次打卡的检查结果或提示未打卡
  viewLatestCheckResultOrTip: function() {
    const item = this.data.latestPunch;
    if (!item) {
      wx.showToast({ title: '还未打卡', icon: 'none' });
      return;
    }
    if (!item.checkResults || item.checkResults.length === 0) {
      wx.showToast({ title: '暂无检查结果', icon: 'none' });
      return;
    }
    this.viewLatestCheckResult();
  },

  // 关闭检查结果弹框
  closeCheckResultModal: function() {
    this.setData({
      showCheckResultModal: false
    });
  },

  goToHistory: function() {
    // 传递当前选中的科目索引到历史记录页面
    wx.navigateTo({
      url: '/pages/history/history?selectedSubjectIndex=' + this.data.selectedSubjectIndex
    });
  },

  // 跳转到我的页面
  goToMe: function() {
    wx.navigateTo({
      url: '/pages/me/me'
    });
  },

  // 跳转到工具箱页面
  goToToolbox: function() {
    wx.navigateTo({
      url: '/pages/toolbox/toolbox'
    });
  },

  // 跳转到单词本页面
  goToWordbook: function() {
    wx.navigateTo({
      url: '/pages/wordbook/wordbook'
    });
  },

  // 跳转到绑定监督人页面
  goToBind: function() {
    wx.navigateTo({
      url: '/pages/bind/bind'
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
    const currentUserOpenId = this.data.currentUserOpenId;
    
    db.collection('check_ins').add({
      data: {
        mediaUrl: fileID,
        mediaType: fileType,
        createTime: db.serverDate(),
        score: -1, // -1 表示未评分
        suggestion: '',
        subject: subject,
        puncherOpenId: currentUserOpenId
      },
      success: async res => {
        const recordId = res._id;

        // 先提示打卡成功
        wx.showToast({
          title: '打卡成功！',
          icon: 'success',
          duration: 1500
        });

        // 保存记录 ID，供后续 AI 评分使用
        that.setData({
          recordId: recordId
        });

        that.checkTodayStatus();
        that.queryCount();
        that.fetchLatestPunch();

        // 打卡成功后：若孩子已绑定家长，则通知所有绑定家长（订阅消息）
        // 注意：订阅消息授权需在家长端前置 requestSubscribeMessage
        try {
          await wx.cloud.callFunction({
            name: 'notifyParentOnPunch',
            data: { recordId }
          });
        } catch (e) {
          // 通知失败不影响打卡主流程
          console.warn('通知家长失败（忽略）', e);
        }

        // 不再自动调用 AI 评分，等待用户手动点击
      },
      fail: err => {
        wx.hideLoading();
        wx.showToast({ title: '保存失败', icon: 'error' });
        console.error('数据库保存失败', err);
      }
    });
  },

  // AI 评分调用函数（用户手动点击触发）
  onAIEvaluate: async function() {
    const that = this;
    const subject = this.data.subjects[this.data.selectedSubjectIndex];
    const currentUserOpenId = this.data.currentUserOpenId;
    
    // 获取当前日期范围（今天）
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    
    try {
      // 查询当前日期、当前科目的最新打卡记录
      const res = await db.collection('check_ins')
        .where({
          createTime: _.gte(start).and(_.lte(end)),
          subject: subject,
          puncherOpenId: currentUserOpenId
        })
        .orderBy('createTime', 'desc')
        .limit(1)
        .get();
      
      if (res.data.length === 0) {
        wx.showToast({ title: '今日还未打卡', icon: 'none' });
        return;
      }
      
      const record = res.data[0];
      
      if (record.mediaType !== 'image') {
        wx.showToast({ title: '仅支持图片评分', icon: 'none' });
        return;
      }
      
      // 调用 AI 评分，传入 fileID（云函数内部会转换为临时 URL）
      this.callAIEvaluate(record._id, subject, record.mediaType, record.mediaUrl);
    } catch (err) {
      console.error('获取打卡记录失败', err);
      wx.showToast({ title: '获取记录失败', icon: 'none' });
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
  "suggestion": "具体的学习建议",
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
        console.log('AI 分析 result:', aiRes.result);
        console.log('AI 分析 data:', aiRes.result ? aiRes.result.data : 'no data');
        
        // 检查返回结果
        if (aiRes.result && aiRes.result.success && aiRes.result.data) {
          const result = aiRes.result.data;
          console.log('解析后的 result 对象:', JSON.stringify(result));
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

  // 保存 AI 分析结果到数据库
  saveAIResultToDB: function(recordId, result, subject) {
    const score = result.score || 0;
    const suggestion = result.suggestion || '';
    const judgment = result.judgment || '';
    const recognizedContent = result.recognized_content || '';
    const totalQuestions = result.total_questions || 0;
    const correctQuestions = result.correct_questions || 0;
    const checkResults = result.check_results || [];

    db.collection('check_ins').doc(recordId).update({
      data: {
        score: score,
        suggestion: suggestion,
        aiAnalysis: judgment,
        recognizedContent: recognizedContent,
        totalQuestions: totalQuestions,
        correctQuestions: correctQuestions,
        checkResults: checkResults,
        analyzedAt: db.serverDate()
      },
      success: (res) => {
        console.log('AI 结果保存成功');
        // AI 评分成功后，更新首页和历史记录页面的数据
        this.fetchLatestPunch();
        // 通知历史记录页面刷新数据（如果已打开）
        this.notifyHistoryRefresh();
      },
      fail: (err) => {
        console.error('AI 结果保存失败', err);
      }
    });
  },

  // 通知历史记录页面刷新数据
  notifyHistoryRefresh: function() {
    // 获取所有页面实例
    const pages = getCurrentPages();
    // 查找历史记录页面
    const historyPage = pages.find(page => page.route === 'pages/history/history');
    if (historyPage && typeof historyPage.fetchRecords === 'function') {
      historyPage.fetchRecords();
    }
  },

  // 显示 AI 分析结果弹框（使用自定义模态框支持滚动）
  showAIResultModal: function(result, fileType, fileID, subject) {
    console.log('showAIResultModal result:', result);
    
    const that = this;
    
    // 豆包 AI 返回格式：{recognized_content: "识别内容", total_questions: 总题数，correct_questions: 正确题数，score: 得分，judgment: "判断结果", suggestion: "学习建议", check_results: [{question, user_answer, correct_answer, is_correct}]}
    const score = result.score || 0;
    const recognizedContent = result.recognized_content || '';
    const judgment = result.judgment || '';
    const suggestion = result.suggestion || '';
    const totalQuestions = result.total_questions || 0;
    const correctQuestions = result.correct_questions || 0;
    const checkResults = result.check_results || [];
    
    // 根据得分计算颜色（>=8 分绿色，>=6 分橙色，<6 分红色）
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
    
    // 设置数据到页面（使用原生数据绑定）
    that.setData({
      aiScore: score,
      aiScoreClass: scoreClass,
      aiRecognizedContent: recognizedContent,
      aiWordList: wordList,
      aiTotalQuestions: totalQuestions,
      aiCorrectQuestions: correctQuestions,
      aiJudgment: judgment,
      aiSuggestion: suggestion,
      aiCheckResults: checkResults,
      showAIResultModal: true,
      fileType: fileType,
      fileID: fileID
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
            correct: parts[1].trim(), // 暂时假设用户写的是正确的
            isCorrect: true
          });
        }
      });
    }
    
    return wordList;
  },
  
  // 关闭 AI 评分结果弹框
  closeAIResultModal: function() {
    this.setData({
      showAIResultModal: false
    });
  },
  
  // 查看原图
  viewOriginalImage: function() {
    const that = this;
    wx.previewImage({
      urls: [that.data.fileID],
      current: that.data.fileID
    });
    // 预览后关闭弹框并跳转到历史记录
    setTimeout(() => {
      that.closeAIResultModal();
      wx.navigateTo({
        url: '/pages/history/history'
      });
    }, 500);
  },
  
  // 查看记录
  goToHistoryFromModal: function() {
    this.closeAIResultModal();
    // 传递当前选中的科目索引到历史记录页面
    wx.navigateTo({
      url: '/pages/history/history?selectedSubjectIndex=' + this.data.selectedSubjectIndex
    });
  },

  // 科目选择
  onSubjectChange: function(e) {
    this.setData({ selectedSubjectIndex: e.detail.value });
    this.checkTodayStatus();
    this.queryCount();
    this.fetchLatestPunch();
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
  }
});
