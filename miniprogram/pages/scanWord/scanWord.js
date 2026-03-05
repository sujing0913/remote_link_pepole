const app = getApp();

Page({
  data: {
    hasScanned: false,
    isLoading: false,
    imageUrl: '',
    tempFilePath: '',
    fileID: '',
    wordData: null,
    audioContext: null
  },

  onLoad: function(options) {
    // 创建内部音频上下文
    this.data.audioContext = wx.createInnerAudioContext();
    this.data.audioContext.onError((res) => {
      console.error('音频播放失败', res);
      wx.showToast({ title: '播放失败', icon: 'none' });
    });
  },

  onUnload: function() {
    // 销毁音频上下文
    if (this.data.audioContext) {
      this.data.audioContext.destroy();
    }
  },

  // 选择图片
  chooseImage: function() {
    const that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        that.setData({
          tempFilePath: tempFilePath,
          imageUrl: tempFilePath,
          hasScanned: true,
          wordData: null
        });
        // 上传图片并识别
        that.uploadAndRecognize(tempFilePath);
      },
      fail: (err) => {
        console.error('选择图片失败', err);
      }
    });
  },

  // 上传图片并识别
  uploadAndRecognize: function(tempFilePath) {
    const that = this;
    this.setData({ isLoading: true });

    const suffix = /\.[^\.]+$/.exec(tempFilePath)[0];
    const cloudPath = `scanWord/${Date.now()}-${Math.floor(Math.random() * 1000)}${suffix}`;

    // 上传到云存储
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: tempFilePath,
      success: (uploadRes) => {
        that.fileID = uploadRes.fileID;
        // 调用 AI 识别
        that.callAIRecognize(uploadRes.fileID);
      },
      fail: (err) => {
        that.setData({ isLoading: false });
        wx.showToast({ title: '上传失败', icon: 'error' });
        console.error('上传失败', err);
      }
    });
  },

  // 调用 AI 识别单词
  callAIRecognize: function(fileID) {
    const that = this;
    
    wx.cloud.callFunction({
      name: 'doubaoAI',
      data: {
        fileID: fileID,
        userPrompt: `你是一位专业的英语单词识别助手。请识别图片中的英语单词，并按以下 JSON 格式返回（只返回 JSON，不要其他文字）：
{
  "word": "识别到的单词",
  "phonetic": "音标（不含斜杠）",
  "meaning": "中文意思",
  "sentences": [
    {"en": "英文例句 1", "cn": "中文翻译 1"},
    {"en": "英文例句 2", "cn": "中文翻译 2"}
  ],
  "memoryTips": "记忆技巧或口诀"
}

注意：
1. 如果图片中有多个单词，只识别最明显的一个
2. 音标使用国际音标，不包含斜杠
3. 提供 2-3 个常用例句
4. 记忆技巧可以是词根词缀、谐音、联想等方法`
      },
      timeout: 60000,
      success: (aiRes) => {
        that.setData({ isLoading: false });
        console.log('AI 识别结果:', aiRes);
        
        if (aiRes.result && aiRes.result.success && aiRes.result.data) {
          const wordData = aiRes.result.data;
          that.setData({
            wordData: wordData
          });
          // 自动播放读音
          setTimeout(() => {
            that.playAudio();
          }, 500);
        } else {
          wx.showToast({ title: '识别失败，请重试', icon: 'none' });
        }
      },
      fail: (err) => {
        that.setData({ isLoading: false });
        console.error('AI 识别失败', err);
        wx.showToast({ title: '识别失败：' + (err.errMsg || '未知错误'), icon: 'none' });
      }
    });
  },

  // 播放音频
  playAudio: function() {
    const that = this;
    const word = this.data.wordData?.word;
    
    if (!word) {
      wx.showToast({ title: '无单词可播放', icon: 'none' });
      return;
    }

    // 使用有道词典的发音 API
    const audioUrl = `https://dict.youdao.com/dictvoice?audio=${word}&type=1`;
    
    this.data.audioContext.src = audioUrl;
    this.data.audioContext.play();
    
    wx.showToast({ title: '正在播放...', icon: 'none' });
  },

  // 重新扫描
  resetScan: function() {
    this.setData({
      hasScanned: false,
      isLoading: false,
      imageUrl: '',
      tempFilePath: '',
      fileID: '',
      wordData: null
    });
  }
});
