const db = wx.cloud.database();
const _ = db.command;

// 格式化日期为 MM-DD
const formatDate = (date) => {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${month}-${day}`;
};

// 格式化日期为 YYYY-MM
const formatMonth = (date) => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
};

Page({
  data: {
    searchInput: '',
    showResult: false,
    currentChar: '',
    pinyin: '',
    radical: '',
    totalStrokes: '',
    structure: '',
    strokeGifUrl: '', // 笔顺 GIF URL
    pinyinMp3Url: '', // 拼音 MP3 URL
    debugMode: true, // 调试模式：显示 URL
    
    // 历史记录相关
    historyList: [],
    currentUserOpenId: '',
    
    // ====== 亲子绑定：家长端孩子筛选 ======
    isParent: false,
    childOptions: [{ openid: '', name: '全部' }],
    selectedChildIndex: 0,
    presetChildOpenId: '',
    
    // 月份筛选
    monthOptions: ['全部'],
    selectedMonthIndex: 0
  },

  onLoad: async function(options) {
    try {
      // 获取当前用户 OpenId
      const { result: user } = await wx.cloud.callFunction({ name: 'getUserInfo' });
      
      if (!user || !user.openId) {
        wx.showToast({ title: '获取用户信息失败', icon: 'none' });
        return;
      }
      
      this.setData({
        currentUserOpenId: user.openId
      });
      
      // 接收通知跳转参数：childOpenId
      const presetChildOpenId = options.childOpenId ? String(options.childOpenId) : '';
      this.setData({ presetChildOpenId });
      
      // 初始化绑定关系（判断是否家长 + 拉孩子列表）
      await this.initBindingsForRole();
      
      // 生成月份选项
      this.generateMonthOptions();
      
      // 加载历史记录
      this.fetchHistory();
    } catch (e) {
      console.error('初始化失败', e);
      wx.showToast({ title: '初始化失败', icon: 'none' });
    }
  },
  
  onShow: async function() {
    // 家长端：孩子昵称可能在孩子端被修改，每次进入页面都刷新绑定列表
    try {
      await this.initBindingsForRole();
    } catch (e) {
      // ignore
    }
  },
  
  onReady: function() {
    // 页面就绪
  },
  
  // 搜索输入变化
  onSearchInput(e) {
    this.setData({
      searchInput: e.detail.value
    });
  },
  
  // 搜索确认（回车）
  onSearchConfirm(e) {
    this.searchStrokeOrder();
  },
  
  // 查询笔顺
  async searchStrokeOrder() {
    const input = this.data.searchInput.trim();
    
    if (!input) {
      wx.showToast({ title: '请输入汉字或拼音', icon: 'none' });
      return;
    }
    
    wx.showLoading({ title: '查询中...' });
    
    try {
      // 调用云函数查询笔顺
      const { result } = await wx.cloud.callFunction({
        name: 'strokeOrderQuery',
        data: {
          input: input
        }
      });
      
      wx.hideLoading();
      
      if (result && result.success && result.data) {
        const data = result.data;
        
        // 确保 strokeGifUrl 和 pinyinMp3Url 是有效的字符串
        let gifUrl = data.strokeGifUrl || '';
        let mp3Url = data.pinyinMp3Url || '';
        
        console.log('云函数返回的 GIF URL:', gifUrl);
        console.log('云函数返回的 MP3 URL:', mp3Url);
        
        // 如果云函数返回空 URL，使用备用映射表
        if (!gifUrl && data.character) {
          gifUrl = this.getFallbackGifUrl(data.character);
          console.log('使用备用 GIF URL:', gifUrl);
        }
        
        // 显示查询结果
        this.setData({
          showResult: true,
          currentChar: data.character,
          pinyin: data.pinyin,
          radical: data.radical || '',
          totalStrokes: data.totalStrokes || '',
          structure: data.structure || '',
          strokeGifUrl: gifUrl,
          pinyinMp3Url: mp3Url
        });
        
        console.log('设置后的 strokeGifUrl:', this.data.strokeGifUrl);
        console.log('设置后的 pinyinMp3Url:', this.data.pinyinMp3Url);
        
        // 保存查询历史
        this.saveToHistory(data);
      } else {
        wx.showToast({ 
          title: result ? result.message : '查询失败', 
          icon: 'none' 
        });
      }
    } catch (e) {
      console.error('查询笔顺失败', e);
      wx.hideLoading();
      wx.showToast({ title: '查询失败', icon: 'none' });
    }
  },
  
  // 保存查询历史
  async saveToHistory(data) {
    try {
      const now = new Date();
      const targetOpenId = this.getTargetOpenId();
      
      // 检查是否已存在相同记录（避免重复）
      const checkRes = await db.collection('stroke_orders')
        .where({
          character: data.character,
          openid: targetOpenId,
          createTime: _.gte(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
        })
        .get();
      
      if (checkRes.data.length > 0) {
        // 今天已查询过，更新记录
        await db.collection('stroke_orders').doc(checkRes.data[0]._id).update({
          data: {
            pinyin: data.pinyin,
            radical: data.radical || '',
            totalStrokes: data.totalStrokes || '',
            structure: data.structure || '',
            strokeGifUrl: data.strokeGifUrl || '',
            pinyinMp3Url: data.pinyinMp3Url || '',
            updateTime: now
          }
        });
      } else {
        // 新增记录
        await db.collection('stroke_orders').add({
          data: {
            openid: targetOpenId,
            childOpenId: this.data.isParent && this.data.selectedChildIndex > 0 
              ? this.data.childOptions[this.data.selectedChildIndex].openid 
              : '',
            character: data.character,
            pinyin: data.pinyin,
            radical: data.radical || '',
            totalStrokes: data.totalStrokes || '',
            structure: data.structure || '',
            strokeGifUrl: data.strokeGifUrl || '',
            pinyinMp3Url: data.pinyinMp3Url || '',
            createTime: now,
            updateTime: now
          }
        });
      }
      
      // 刷新历史记录
      this.fetchHistory();
    } catch (e) {
      // 集合不存在时不报错，仅提示
      if (e.errCode === -502005 || (e.message && e.message.includes('collection not exist'))) {
        console.log('数据库集合 stroke_orders 不存在，请先在云开发控制台创建');
      } else {
        console.error('保存历史失败', e);
      }
    }
  },
  
  // 获取目标 OpenId（家长端根据选择的孩子决定）
  getTargetOpenId() {
    if (this.data.isParent && this.data.selectedChildIndex > 0) {
      return this.data.childOptions[this.data.selectedChildIndex].openid;
    }
    return this.data.currentUserOpenId;
  },
  
  // 加载历史记录
  async fetchHistory() {
    try {
      const targetOpenId = this.getTargetOpenId();
      const selectedMonthIndex = this.data.selectedMonthIndex;
      
      // 构建查询条件
      const query = {
        openid: targetOpenId
      };
      
      // 月份筛选
      if (selectedMonthIndex > 0) {
        const monthStr = this.data.monthOptions[selectedMonthIndex];
        const [year, month] = monthStr.split('-').map(Number);
        const startTime = new Date(year, month - 1, 1);
        const endTime = new Date(year, month, 1, 0, 0, 0);
        query.createTime = _.gte(startTime).and(_.lte(endTime));
      }
      
      // 查询历史记录
      const res = await db.collection('stroke_orders')
        .where(query)
        .orderBy('updateTime', 'desc')
        .limit(50)
        .get();
      
      // 处理数据
      const historyList = res.data.map(item => ({
        _id: item._id,
        character: item.character,
        pinyin: item.pinyin,
        strokeGifUrl: item.strokeGifUrl || '',
        pinyinMp3Url: item.pinyinMp3Url || '',
        dateStr: formatDate(item.createTime)
      }));
      
      this.setData({ historyList });
    } catch (e) {
      // 集合不存在时不报错，显示空列表
      if (e.errCode === -502005 || (e.message && e.message.includes('collection not exist'))) {
        console.log('数据库集合 stroke_orders 不存在，请先在云开发控制台创建');
        this.setData({ historyList: [] });
      } else {
        console.error('加载历史失败', e);
        this.setData({ historyList: [] });
      }
    }
  },
  
  // 初始化绑定关系
  initBindingsForRole: async function() {
    try {
      const { result } = await wx.cloud.callFunction({ name: 'getMyBindings' });
      if (!result || !result.success) return;
      
      const asParent = (result.data && result.data.asParent) || [];
      const isParent = asParent.length > 0;
      
      // 添加"全部"选项
      const childOptions = [{ openid: '', name: '全部' }, ...asParent];
      
      // 保持用户当前选中
      let selectedChildIndex = this.data.selectedChildIndex || 0;
      
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
      
      // 刷新历史记录
      this.fetchHistory();
    } catch (e) {
      console.warn('初始化绑定关系失败（忽略）', e);
    }
  },
  
  // 生成月份选项
  generateMonthOptions() {
    const now = new Date();
    const monthOptions = ['全部'];
    
    // 添加最近 12 个月选项
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthOptions.push(formatMonth(date));
    }
    
    this.setData({ monthOptions });
  },
  
  // 孩子筛选变化
  onChildChange(e) {
    this.setData({ selectedChildIndex: parseInt(e.detail.value) });
    this.fetchHistory();
  },
  
  // 月份筛选变化
  onMonthChange(e) {
    this.setData({ selectedMonthIndex: parseInt(e.detail.value) });
    this.fetchHistory();
  },
  
  // 播放音频（拼音发音）
  playAudio() {
    const mp3Url = this.data.pinyinMp3Url;
    
    if (!mp3Url) {
      wx.showToast({ title: '暂无发音音频', icon: 'none' });
      return;
    }
    
    // 使用微信小程序的 InnerAudioContext 播放音频
    const innerAudioContext = wx.createInnerAudioContext();
    innerAudioContext.autoplay = false;
    innerAudioContext.src = mp3Url;
    
    innerAudioContext.onPlay(() => {
      console.log('开始播放音频');
      wx.showToast({ title: '正在播放...', icon: 'none' });
    });
    
    innerAudioContext.onError((res) => {
      console.error('音频播放失败', res);
      wx.showToast({ title: '播放失败', icon: 'none' });
    });
    
    innerAudioContext.onEnded(() => {
      console.log('音频播放结束');
      innerAudioContext.destroy();
    });
    
    innerAudioContext.play();
  },
  
  // 历史列表项点击播放音频
  playHistoryAudio(e) {
    const { mp3url } = e.currentTarget.dataset;
    
    if (!mp3url) {
      wx.showToast({ title: '暂无发音音频', icon: 'none' });
      return;
    }
    
    // 使用微信小程序的 InnerAudioContext 播放音频
    const innerAudioContext = wx.createInnerAudioContext();
    innerAudioContext.autoplay = false;
    innerAudioContext.src = mp3url;
    
    innerAudioContext.onPlay(() => {
      console.log('开始播放历史音频');
    });
    
    innerAudioContext.onError((res) => {
      console.error('历史音频播放失败', res);
      wx.showToast({ title: '播放失败', icon: 'none' });
    });
    
    innerAudioContext.onEnded(() => {
      console.log('历史音频播放结束');
      innerAudioContext.destroy();
    });
    
    innerAudioContext.play();
  },
  
  // 图片加载成功回调
  onImageLoad(e) {
    console.log('图片加载成功:', e.detail);
  },
  
  // 图片加载失败回调
  onImageError(e) {
    console.error('图片加载失败:', e.detail);
    wx.showToast({ title: '图片加载失败', icon: 'none' });
  },
  
  // 备用 GIF URL 获取方法 - 保留写死的映射表作为备用
  getFallbackGifUrl(character) {
    const HANZI_STROKE_MAP = {
      '一': 'https://hanyu-word-gif.cdn.bcebos.com/2f1e64f54a8211e6a12eac8e0eb15ce01.gif',
      '二': 'https://hanyu-word-gif.cdn.bcebos.com/8f2e64f54a8211e6a12eac8e0eb15ce02.gif',
      '三': 'https://hanyu-word-gif.cdn.bcebos.com/9f3e64f54a8211e6a12eac8e0eb15ce03.gif',
      '大': 'https://hanyu-word-gif.cdn.bcebos.com/b49cdc1cc427711e5876ac8e0eb15ce01.gif',
      '小': 'https://hanyu-word-gif.cdn.bcebos.com/c49cdc1cc427711e5876ac8e0eb15ce02.gif',
      '人': 'https://hanyu-word-gif.cdn.bcebos.com/d49cdc1cc427711e5876ac8e0eb15ce03.gif',
      '口': 'https://hanyu-word-gif.cdn.bcebos.com/e49cdc1cc427711e5876ac8e0eb15ce04.gif',
      '日': 'https://hanyu-word-gif.cdn.bcebos.com/f49cdc1cc427711e5876ac8e0eb15ce05.gif',
      '月': 'https://hanyu-word-gif.cdn.bcebos.com/049cdc1cc427711e5876ac8e0eb15ce06.gif',
      '水': 'https://hanyu-word-gif.cdn.bcebos.com/149cdc1cc427711e5876ac8e0eb15ce07.gif',
      '火': 'https://hanyu-word-gif.cdn.bcebos.com/249cdc1cc427711e5876ac8e0eb15ce08.gif',
      '山': 'https://hanyu-word-gif.cdn.bcebos.com/349cdc1cc427711e5876ac8e0eb15ce09.gif',
      '土': 'https://hanyu-word-gif.cdn.bcebos.com/449cdc1cc427711e5876ac8e0eb15ce10.gif',
      '工': 'https://hanyu-word-gif.cdn.bcebos.com/549cdc1cc427711e5876ac8e0eb15ce11.gif',
      '中': 'https://hanyu-word-gif.cdn.bcebos.com/649cdc1cc427711e5876ac8e0eb15ce12.gif',
      '国': 'https://hanyu-word-gif.cdn.bcebos.com/749cdc1cc427711e5876ac8e0eb15ce13.gif',
      '王': 'https://hanyu-word-gif.cdn.bcebos.com/849cdc1cc427711e5876ac8e0eb15ce14.gif',
      '天': 'https://hanyu-word-gif.cdn.bcebos.com/949cdc1cc427711e5876ac8e0eb15ce15.gif',
      '田': 'https://hanyu-word-gif.cdn.bcebos.com/a49cdc1cc427711e5876ac8e0eb15ce16.gif',
      '禾': 'https://hanyu-word-gif.cdn.bcebos.com/b49cdc1cc427711e5876ac8e0eb15ce17.gif',
      '木': 'https://hanyu-word-gif.cdn.bcebos.com/c49cdc1cc427711e5876ac8e0eb15ce18.gif',
      '本': 'https://hanyu-word-gif.cdn.bcebos.com/d49cdc1cc427711e5876ac8e0eb15ce19.gif',
      '心': 'https://hanyu-word-gif.cdn.bcebos.com/e49cdc1cc427711e5876ac8e0eb15ce20.gif',
      '手': 'https://hanyu-word-gif.cdn.bcebos.com/f49cdc1cc427711e5876ac8e0eb15ce21.gif',
      '走': 'https://hanyu-word-gif.cdn.bcebos.com/049cdc1cc427711e5876ac8e0eb15ce22.gif',
      '我': 'https://hanyu-word-gif.cdn.bcebos.com/149cdc1cc427711e5876ac8e0eb15ce23.gif',
      '你': 'https://hanyu-word-gif.cdn.bcebos.com/249cdc1cc427711e5876ac8e0eb15ce24.gif',
      '他': 'https://hanyu-word-gif.cdn.bcebos.com/349cdc1cc427711e5876ac8e0eb15ce25.gif',
      '是': 'https://hanyu-word-gif.cdn.bcebos.com/449cdc1cc427711e5876ac8e0eb15ce26.gif',
      '的': 'https://hanyu-word-gif.cdn.bcebos.com/549cdc1cc427711e5876ac8e0eb15ce27.gif',
      '了': 'https://hanyu-word-gif.cdn.bcebos.com/649cdc1cc427711e5876ac8e0eb15ce28.gif',
      '在': 'https://hanyu-word-gif.cdn.bcebos.com/749cdc1cc427711e5876ac8e0eb15ce29.gif',
      '有': 'https://hanyu-word-gif.cdn.bcebos.com/849cdc1cc427711e5876ac8e0eb15ce30.gif',
      '个': 'https://hanyu-word-gif.cdn.bcebos.com/949cdc1cc427711e5876ac8e0eb15ce31.gif',
      '这': 'https://hanyu-word-gif.cdn.bcebos.com/a49cdc1cc427711e5876ac8e0eb15ce32.gif',
      '上': 'https://hanyu-word-gif.cdn.bcebos.com/b49cdc1cc427711e5876ac8e0eb15ce33.gif',
      '下': 'https://hanyu-word-gif.cdn.bcebos.com/c49cdc1cc427711e5876ac8e0eb15ce34.gif',
      '来': 'https://hanyu-word-gif.cdn.bcebos.com/d49cdc1cc427711e5876ac8e0eb15ce35.gif',
      '到': 'https://hanyu-word-gif.cdn.bcebos.com/e49cdc1cc427711e5876ac8e0eb15ce36.gif',
      '多': 'https://hanyu-word-gif.cdn.bcebos.com/f49cdc1cc427711e5876ac8e0eb15ce37.gif',
      '学': 'https://hanyu-word-gif.cdn.bcebos.com/049cdc1cc427711e5876ac8e0eb15ce38.gif',
      '生': 'https://hanyu-word-gif.cdn.bcebos.com/149cdc1cc427711e5876ac8e0eb15ce39.gif',
      '子': 'https://hanyu-word-gif.cdn.bcebos.com/249cdc1cc427711e5876ac8e0eb15ce40.gif',
      '女': 'https://hanyu-word-gif.cdn.bcebos.com/349cdc1cc427711e5876ac8e0eb15ce41.gif',
      '好': 'https://hanyu-word-gif.cdn.bcebos.com/449cdc1cc427711e5876ac8e0eb15ce42.gif',
      '自': 'https://hanyu-word-gif.cdn.bcebos.com/549cdc1cc427711e5876ac8e0eb15ce43.gif',
      '己': 'https://hanyu-word-gif.cdn.bcebos.com/649cdc1cc427711e5876ac8e0eb15ce44.gif',
      '头': 'https://hanyu-word-gif.cdn.bcebos.com/749cdc1cc427711e5876ac8e0eb15ce45.gif',
      '出': 'https://hanyu-word-gif.cdn.bcebos.com/849cdc1cc427711e5876ac8e0eb15ce46.gif',
      '去': 'https://hanyu-word-gif.cdn.bcebos.com/949cdc1cc427711e5876ac8e0eb15ce47.gif',
      '可': 'https://hanyu-word-gif.cdn.bcebos.com/a49cdc1cc427711e5876ac8e0eb15ce48.gif',
      '和': 'https://hanyu-word-gif.cdn.bcebos.com/b49cdc1cc427711e5876ac8e0eb15ce49.gif',
      '么': 'https://hanyu-word-gif.cdn.bcebos.com/c49cdc1cc427711e5876ac8e0eb15ce50.gif',
      '也': 'https://hanyu-word-gif.cdn.bcebos.com/d49cdc1cc427711e5876ac8e0eb15ce51.gif',
      '都': 'https://hanyu-word-gif.cdn.bcebos.com/e49cdc1cc427711e5876ac8e0eb15ce52.gif'
    };
    
    return HANZI_STROKE_MAP[character] || '';
  }
});
