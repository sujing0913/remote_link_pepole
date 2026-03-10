Page({
  data: {
    recordId: '',
    currentScore: 0,
    currentSuggestion: '',
    currentAnalysis: '',
    score: 0,
    suggestion: '',
    analysis: ''
  },

  onLoad: function(options) {
    const recordId = options.recordId;
    const currentScore = options.currentScore ? parseInt(options.currentScore) : 0;
    const currentSuggestion = decodeURIComponent(options.currentSuggestion || '');
    const currentAnalysis = decodeURIComponent(options.currentAnalysis || '');

    this.setData({
      recordId: recordId,
      currentScore: currentScore,
      currentSuggestion: currentSuggestion,
      currentAnalysis: currentAnalysis,
      score: currentScore,
      suggestion: currentSuggestion,
      analysis: currentAnalysis
    });
  },

  // 评分输入
  onScoreInput: function(e) {
    const score = parseInt(e.detail.value) || 0;
    // 限制评分范围 0-10
    const clampedScore = Math.max(0, Math.min(10, score));
    this.setData({
      score: clampedScore
    });
  },

  // 建议输入
  onSuggestionInput: function(e) {
    this.setData({
      suggestion: e.detail.value
    });
  },

  // 分析输入
  onAnalysisInput: function(e) {
    this.setData({
      analysis: e.detail.value
    });
  },

  // 保存修改
  onSave: async function() {
    const { recordId, score, suggestion, analysis } = this.data;

    if (!recordId) {
      wx.showToast({
        title: '记录ID错误',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({ title: '保存中...' });

    try {
      const db = wx.cloud.database();
      
      const result = await db.collection('check_ins').doc(recordId).update({
        data: {
          score: parseInt(score),
          suggestion: suggestion,
          aiAnalysis: analysis,
          manualEdited: true,
          editedAt: db.serverDate()
        }
      });

      if (result.stats.updated > 0) {
        wx.showToast({ 
          title: '保存成功', 
          icon: 'success' 
        });

        // 返回上一页并刷新数据
        setTimeout(() => {
          wx.navigateBack({
            delta: 1
          });
        }, 1000);
      } else {
        throw new Error('更新失败');
      }
    } catch (error) {
      console.error('保存失败', error);
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 取消编辑
  onCancel: function() {
    wx.navigateBack({
      delta: 1
    });
  }
})
