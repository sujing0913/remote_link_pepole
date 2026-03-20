const db = wx.cloud.database();

Page({
  data: {
    // 角色相关
    currentUserOpenId: '',
    asParent: false,
    asChild: false,
    roleText: '普通用户',
    // 孩子列表（家长端用）
    children: [],
    selectedChildIndex: -1,
    selectedChild: null,

    // 孩子过滤选项（家长端：自己 + 孩子列表）
    childFilterOptions: ['自己'],
    childFilterIndex: 0,

    // filter
    monthFilterOptions: ['全部'],
    monthFilterIndex: 0,

    rememberFilterOptions: ['全部', '否', '是'],
    rememberFilterIndex: 1, // 默认选中"否"，显示没有记住的单词

    rememberOptions: ['否', '是'],

    // 统计数据
    totalCount: 0,
    rememberedCount: 0,
    forgotCount: 0,

    // list
    rawList: [],
    groupedList: [],
    collapsedMonths: {},

    // add modal
    showAddModal: false,
    inputText: '',
    aiLoading: false,
    aiPreview: null,

    // audio
    innerAudioContext: null
  },

  onLoad: async function(options) {
    try {
      wx.showLoading({ title: '初始化中...' });
      
      // 获取当前用户信息
      const { result: user } = await wx.cloud.callFunction({ name: 'getUserInfo' });
      
      if (user && user.openId) {
        this.setData({
          currentUserOpenId: user.openId
        });
      }
      
      // 获取用户角色和绑定关系
      await this.loadUserRoles();
      
      this._ensureAudio();
      
      // 默认加载当前用户自己创建的单词
      await this.loadList();
    } catch (e) {
      console.error('初始化失败', e);
    } finally {
      wx.hideLoading();
    }
  },

  onShow() {
    this.loadList();
  },

  onUnload() {
    if (this.data.innerAudioContext) {
      this.data.innerAudioContext.destroy();
    }
  },

  // 获取用户角色和绑定关系
  async loadUserRoles() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getMyBindings',
        data: {}
      });

      const rr = res.result || {};
      if (!rr.success) return;

      const data = rr.data || {};
      const asParentList = data.asParent || [];
      const asChildList = data.asChild || [];

      // 角色互斥
      let asParent = asParentList.length > 0;
      let asChild = asChildList.length > 0;

      if (asParent && asChild) {
        asChild = false;
      }

      let roleText = '普通用户';
      if (asParent) roleText = '家长';
      else if (asChild) roleText = '孩子';

      // 家长端：处理孩子列表（添加"自己"选项）
      const children = asParentList.map((c) => ({
        child_openid: c.openid,
        childName: c.name || `user${String(c.openid || '').slice(-4)}`,
        bind_time: this.formatBindTime(c.bind_time) || ''
      }));

      // 构建孩子过滤选项：自己 + 孩子列表
      const childFilterOptions = ['自己', ...children.map(c => c.childName)];

      this.setData({
        asParent,
        asChild,
        roleText,
        children,
        childFilterOptions,
        childFilterIndex: 0, // 默认选中"自己"
        selectedChildIndex: -1, // -1 表示选择"自己"
        selectedChild: null // null 表示选择"自己"
      });
    } catch (e) {
      console.warn('loadUserRoles ignored:', e);
    }
  },

  // 格式化绑定时间
  formatBindTime(t) {
    if (!t) return '';
    let d = null;
    if (typeof t === 'object') {
      if (t.$date) d = new Date(t.$date);
      else if (t.date) d = new Date(t.date);
      else if (t.seconds) d = new Date(t.seconds * 1000);
      else d = new Date(String(t));
    } else {
      d = new Date(t);
    }
    if (!d || isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },

  // 孩子选择变化（支持"自己"选项）
  onChildChange: function(e) {
    const index = e.detail.value;
    // index=0 表示"自己"，index>0 表示选择对应的孩子
    this.setData({
      childFilterIndex: index,
      selectedChildIndex: index > 0 ? index - 1 : -1,
      selectedChild: index > 0 ? this.data.children[index - 1] : null
    }, () => {
      this.loadList();
    });
  },

  _ensureAudio() {
    if (this.data.innerAudioContext) return;
    const ctx = wx.createInnerAudioContext();
    ctx.obeyMuteSwitch = false;
    ctx.onError((res) => {
      console.error('音频播放失败', res);
      wx.showToast({ title: '播放失败', icon: 'none' });
    });
    this.setData({ innerAudioContext: ctx });
  },

  playPreviewAudio() {
    const url = this.data.aiPreview && this.data.aiPreview.pronunciationUrl;
    if (!url) {
      wx.showToast({ title: '暂无读音', icon: 'none' });
      return;
    }
    this._ensureAudio();
    const ctx = this.data.innerAudioContext;
    try {
      ctx.stop();
      ctx.src = url;
      ctx.play();
      wx.showToast({ title: '正在播放...', icon: 'none' });
    } catch (err) {
      console.error('playPreviewAudio error', err);
      wx.showToast({ title: '播放失败', icon: 'none' });
    }
  },

  async loadList() {
    wx.showLoading({ title: '加载中...' });
    try {
      // 构建查询条件
      let query = {};
      
      // 根据角色和孩子选择构建不同的查询条件
      if (this.data.asParent) {
        // 家长角色：根据选择查询
        if (this.data.selectedChild) {
          // 选择了特定孩子
          query = {
            childOpenId: this.data.selectedChild.child_openid
          };
        } else {
          // 选择"自己"，查询当前用户的单词
          query = {
            childOpenId: this.data.currentUserOpenId
          };
        }
      } else if (this.data.asChild) {
        // 孩子角色：查询自己的单词
        query = {
          childOpenId: this.data.currentUserOpenId
        };
      } else {
        // 普通用户：查询自己的单词
        query = {
          childOpenId: this.data.currentUserOpenId
        };
      }
      
      console.log('[wordbook] loadList query=', query);
      
      const res = await db
        .collection('wordbook')
        .where(query)
        .orderBy('createTime', 'desc')
        .get();

      console.log('[wordbook] loadList raw res.data=', res.data);

      const list = (res.data || []).map((it) => {
        const remember = !!it.remembered;
        return {
          ...it,
          remembered: remember,
          rememberIndex: remember ? 1 : 0,
          createMonth: this._getMonthStr(it.createTime),
          ownerName: it.childName || '未知用户'
        };
      });

      console.log('[wordbook] loadList mapped list=', list);

      // 动态生成"年月"筛选项（从数据里提取 createMonth）
      const months = Array.from(new Set(list.map((x) => x.createMonth).filter(Boolean))).sort((a, b) => (a < b ? 1 : -1));
      const monthFilterOptions = ['全部', ...months];

      // 如果当前选中的月份在新 options 中不存在，则重置为"全部"
      let monthFilterIndex = this.data.monthFilterIndex || 0;
      const selectedMonth = this.data.monthFilterOptions && this.data.monthFilterOptions[monthFilterIndex];
      if (selectedMonth && selectedMonth !== '全部' && !monthFilterOptions.includes(selectedMonth)) {
        monthFilterIndex = 0;
      }

      // 计算统计数据（基于原始数据，不受过滤影响）
      const totalCount = list.length;
      const rememberedCount = list.filter(x => x.remembered).length;
      const forgotCount = totalCount - rememberedCount;

      this.setData({
        rawList: list,
        monthFilterOptions,
        monthFilterIndex,
        totalCount,
        rememberedCount,
        forgotCount
      });
      this.applyFilterAndGroup();
    } catch (e) {
      console.error('loadList failed', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  _getMonthStr(dateLike) {
    // dateLike could be Date / string / number / serverDate object
    try {
      const d = new Date(dateLike);
      if (Number.isNaN(d.getTime())) return '未知月份';
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    } catch (e) {
      return '未知月份';
    }
  },

  applyFilterAndGroup() {
    const { rawList, rememberFilterIndex, monthFilterIndex, monthFilterOptions } = this.data;

    let filtered = rawList;

    // 年月过滤（全部/指定月份）
    const month = (monthFilterOptions && monthFilterOptions[monthFilterIndex]) || '全部';
    if (month && month !== '全部') {
      filtered = filtered.filter((x) => x.createMonth === month);
    }
    
    // 是否记会过滤（默认显示"否"，即没有记住的单词）
    if (rememberFilterIndex === 1) {
      filtered = filtered.filter((x) => !x.remembered);
    } else if (rememberFilterIndex === 2) {
      filtered = filtered.filter((x) => x.remembered);
    }

    const map = new Map();
    filtered.forEach((it) => {
      const month = it.createMonth || '未知月份';
      if (!map.has(month)) map.set(month, []);
      map.get(month).push(it);
    });

    const groupedList = Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([month, items]) => ({
        month,
        items
      }));

    // 初始化/对齐折叠状态：默认展开（collapsed=false）
    const collapsedMonths = { ...(this.data.collapsedMonths || {}) };
    groupedList.forEach((g) => {
      if (collapsedMonths[g.month] === undefined) collapsedMonths[g.month] = false;
    });

    this.setData({ groupedList, collapsedMonths });
  },

  onMonthFilterChange(e) {
    this.setData({ monthFilterIndex: Number(e.detail.value) });
    this.applyFilterAndGroup();
  },

  onRememberFilterChange(e) {
    this.setData({ rememberFilterIndex: Number(e.detail.value) });
    this.applyFilterAndGroup();
  },

  openAddModal() {
    this.setData({
      showAddModal: true,
      inputText: '',
      aiLoading: false,
      aiPreview: null
    });
  },

  closeAddModal() {
    this.setData({
      showAddModal: false,
      aiLoading: false
    });
  },

  stopPropagation() {},

  onInputText(e) {
    this.setData({ inputText: e.detail.value });
  },

  async onAIAnalyze() {
    const text = (this.data.inputText || '').trim();
    if (!text) {
      wx.showToast({ title: '请先输入单词', icon: 'none' });
      return;
    }

    // 对齐 scanWord：点击后进入 loading，成功后展示"识别结果卡片"
    this.setData({ aiLoading: true, aiPreview: null });

    try {
      const res = await wx.cloud.callFunction({
        // 直接调用 doubaoAI，避免 wordAnalyze 内部 callFunction 超时链路
        name: 'doubaoAI',
        data: {
          text,
          userPrompt: `你是一位专业的英语单词识别助手。请识别用户输入中的英语单词，并按以下 JSON 格式返回（只返回 JSON，不要其他文字）：
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
1. 如果输入中有多个单词，只识别最明显的一个
2. 音标使用国际音标，不包含斜杠
3. 提供 2-3 个常用例句
4. 记忆技巧可以是词根词缀、谐音、联想等方法
用户输入：${text}`
        }
      });

      console.log('[wordbook] doubaoAI raw res:', res);

      this.setData({ aiLoading: false });

      // doubaoAI 返回：{success, data, message}
      if (!res.result || !res.result.data) {
        wx.showToast({ title: (res.result && (res.result.message || res.result.error)) || '识别失败，请重试', icon: 'none' });
        return;
      }

      const data = res.result.data || {};
      if (!data.word) {
        wx.showToast({ title: (res.result && res.result.message) || '未识别出单词', icon: 'none' });
        return;
      }

      // 保持与 scanWord 一致的字段：word/phonetic/meaning/sentences/memoryTips
      // 读音地址：doubaoAI 不负责生成，前端直接用有道 dictvoice 拼接即可播放
      const pronunciationUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(data.word)}&type=1`;

      this.setData({
        aiPreview: {
          word: data.word,
          phonetic: data.phonetic || '',
          meaning: data.meaning || '',
          sentences: Array.isArray(data.sentences) ? data.sentences : [],
          memoryTips: data.memoryTips || '',
          pronunciationUrl
        }
      });

      // 自动播放读音（对齐 scanWord）
      setTimeout(() => {
        this.playPreviewAudio();
      }, 500);
    } catch (e) {
      console.error('onAIAnalyze error', e);
      this.setData({ aiLoading: false });
      wx.showToast({ title: '识别失败：' + (e.errMsg || '未知错误'), icon: 'none' });
    }
  },

  async confirmAdd() {
    const p = this.data.aiPreview;
    if (!p || !p.word) {
      wx.showToast({ title: '请先完成 AI 分析', icon: 'none' });
      return;
    }

    // 防重复点击
    if (this._adding) return;
    this._adding = true;

    wx.showLoading({ title: '添加中...' });

    try {
      const word = String(p.word || '').trim().toLowerCase();
      if (!word) {
        wx.showToast({ title: '单词无效', icon: 'none' });
        return;
      }

      // 获取当前用户信息（用于设置单词所有者）
      // 始终添加到当前用户自己名下，不与过滤项的孩子绑定
      let childOpenId = this.data.currentUserOpenId;
      let childName = this.data.userInfo?.nickName || '用户';

      // 简单去重：同单词存在则不重复添加（也可改为更新）
      const existed = await db.collection('wordbook').where({ 
        word,
        childOpenId 
      }).limit(1).get();
      if (existed.data && existed.data.length > 0) {
        wx.showToast({ title: '已存在该单词', icon: 'none' });
        return;
      }

      const addRes = await db.collection('wordbook').add({
        data: {
          word,
          pronunciationUrl: p.pronunciationUrl || '',
          phonetic: p.phonetic || '',
          meaning: p.meaning || '',
          // 兼容老字段：example 可能不存在，但不影响
          example: p.example || '',
          sentences: Array.isArray(p.sentences) ? p.sentences : [],
          memoryTips: p.memoryTips || '',
          remembered: false,
          remark: '',
          childOpenId,
          childName,
          createTime: db.serverDate()
        }
      });

      console.log('[wordbook] add wordbook ok, _id=', addRes && addRes._id);

      this.closeAddModal();
      wx.showToast({ title: '添加成功', icon: 'success' });

      // 重新拉取列表，确保按月分组/过滤正确
      await this.loadList();
    } catch (e) {
      console.error('confirmAdd error', e);
      wx.showToast({ title: '添加失败：' + ((e && e.errMsg) || '未知错误'), icon: 'none' });
    } finally {
      wx.hideLoading();
      this._adding = false;
    }
  },

  async onRememberChange(e) {
    const id = e.currentTarget.dataset.id;
    const idx = Number(e.detail.value); // 0 否，1 是
    const remembered = idx === 1;

    console.log('[wordbook] onRememberChange id=', id, 'remembered=', remembered);

    try {
      // 同步到数据库
      const updateRes = await db.collection('wordbook').doc(id).update({
        data: { remembered }
      });
      
      console.log('[wordbook] onRememberChange updateRes=', updateRes);

      // 重新加载列表确保数据一致性
      await this.loadList();
      
      wx.showToast({ title: '已更新', icon: 'success', duration: 1000 });
    } catch (e2) {
      console.error('onRememberChange error', e2);
      wx.showToast({ title: '更新失败：' + (e2.errMsg || '未知错误'), icon: 'none' });
    }
  },

  async onRemarkBlur(e) {
    const id = e.currentTarget.dataset.id;
    const remark = (e.detail.value || '').trim();

    try {
      // 同步到数据库
      await db.collection('wordbook').doc(id).update({
        data: { remark }
      });

      // 更新本地列表
      const rawList = this.data.rawList.map((x) => {
        if (x._id !== id) return x;
        return { ...x, remark };
      });
      this.setData({ rawList });
      this.applyFilterAndGroup();
    } catch (e2) {
      console.error('onRemarkBlur error', e2);
      wx.showToast({ title: '保存备注失败', icon: 'none' });
    }
  },

  toggleMonth(e) {
    const month = e.currentTarget.dataset.month;
    const collapsedMonths = { ...(this.data.collapsedMonths || {}) };
    collapsedMonths[month] = !collapsedMonths[month];
    this.setData({ collapsedMonths });
  },

  playPronunciation(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.rawList.find((x) => x._id === id);
    if (!item || !item.pronunciationUrl) {
      wx.showToast({ title: '暂无读音', icon: 'none' });
      return;
    }

    this._ensureAudio();

    const ctx = this.data.innerAudioContext;
    try {
      ctx.stop();
      ctx.src = item.pronunciationUrl;
      ctx.play();
    } catch (err) {
      console.error('playPronunciation error', err);
      wx.showToast({ title: '播放失败', icon: 'none' });
    }
  }
});
