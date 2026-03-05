const db = wx.cloud.database();

Page({
  data: {
    // role: 'parent' | 'child' | ''（未设置）
    // 注意：此 role 表示“用户档案中已设置的角色”；页面 tabs 的临时选择使用 roleTab
    role: '',
    roleCreateTimeText: '未设置',
    nickName: '',
    editingNickName: false,
    nickNameDraft: '',
    // tabs 当前选择（默认：未设置时给孩子；已设置则跟随 role）
    roleTab: 'child', // child | parent
    // 孩子角色时禁止选择“我是家长”（置灰）
    disableParentTab: false,
    bindCode: '',
    inputCode: '',
    submitting: false,
    // 家长端：绑定的孩子列表（仅 roleTab=parent 时显示）
    children: [],
    // 孩子端：当前绑定的家长数量（用于解除禁用逻辑）
    parentCount: 0
  },

  onLoad: async function() {
    await this.refreshProfile();
  },

  onShow: async function() {
    await this.refreshProfile();
  },

  selectParent: async function() {
    // 孩子角色（且仍绑定着家长）时，不允许选择家长
    if (this.data.disableParentTab) {
      wx.showToast({ title: '已选择孩子角色，解绑后才可切换为家长', icon: 'none' });
      return;
    }

    // 切到家长：记录角色（首次写入 role_create_time），并生成/展示绑定码，加载孩子列表
    await this.setRoleIfNeeded('parent');
    this.setData({ roleTab: 'parent' });
    await this.ensureParentCode();
    await this.loadChildrenIfParent();
  },

  selectChild: async function() {
    // 切到孩子：记录角色（首次写入 role_create_time）
    await this.setRoleIfNeeded('child');
    this.setData({ roleTab: 'child', children: [] });
  },

  async refreshProfile() {
    try {
      // 1) 读取档案
      const res = await wx.cloud.callFunction({ name: 'getMyProfile', data: {} });
      const rr = res.result || {};
      if (!rr.success) throw new Error(rr.message || '获取档案失败');

      const d = rr.data || {};
      const openid = (wx.getStorageSync('openid') || d.openid || '').toString();

      // 2) role/role_create_time 默认值
      const role = d.role || '';
      const roleCreateTimeText = this.formatTimeText(d.role_create_time) || '未设置';

      // 3) nickName 默认：若 users.nickName 空，则显示 openid 后4位
      const defaultNick = openid ? `用户${openid.slice(-4)}` : '用户----';
      const nickName = (d.nickName || '').trim() || defaultNick;

      // 4) 绑定关系：用于控制“孩子角色禁止选家长；解绑后恢复”
      //    - role=child 且 asChild(绑定了至少一个家长) => 禁用家长tab
      //    - 解绑后 parentCount=0 => 解除禁用（允许选家长）
      let parentCount = 0;
      try {
        const br = await wx.cloud.callFunction({ name: 'getMyBindings', data: {} });
        const brr = br.result || {};
        if (brr.success) {
          const asChildList = (brr.data && brr.data.asChild) || [];
          parentCount = asChildList.length;
        }
      } catch (e) {
        // ignore
      }

      // 若已绑定家长（parentCount>0），无论 role 是否已落库，都视为孩子侧行为：禁用家长tab
      // 用于覆盖“解绑后恢复”：解绑使 parentCount=0，禁用自动解除
      const disableParentTab = parentCount > 0;

      // tabs 默认：若禁用则强制 child；否则优先跟随 role（未设置时仍默认 child）
      const roleTab = disableParentTab ? 'child' : role || 'child';

      this.setData({
        role,
        roleCreateTimeText,
        nickName,
        roleTab,
        disableParentTab,
        parentCount
      });

      // 5) 若当前 tab 是家长（且未禁用），则确保绑定码和孩子列表
      if (roleTab === 'parent' && !disableParentTab) {
        await this.ensureParentCode();
        await this.loadChildrenIfParent();
      } else {
        this.setData({ children: [] });
      }
    } catch (e) {
      console.error(e);
      // 失败也给一个兜底展示
      const openid = (wx.getStorageSync('openid') || '').toString();
      const defaultNick = openid ? `用户${openid.slice(-4)}` : '用户----';
      this.setData({
        role: '',
        roleCreateTimeText: '未设置',
        nickName: defaultNick,
        roleTab: 'child',
        children: []
      });
    }
  },

  formatTimeText(t) {
    if (!t) return '';
    let d = null;
    if (typeof t === 'object') {
      if (t instanceof Date) d = t;
      else if (t.$date) d = new Date(t.$date);
      else if (t.date) d = new Date(t.date);
      else if (t.seconds) d = new Date(t.seconds * 1000);
      else d = new Date(String(t));
    } else {
      d = new Date(t);
    }
    if (!d || isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  },

  async setRoleIfNeeded(role) {
    // 若 users.role 未设置，则写入 role + role_create_time（只写一次）
    try {
      const currentRole = this.data.role || '';
      if (currentRole) return;

      const res = await wx.cloud.callFunction({
        name: 'updateMyProfile',
        data: { setRole: true, role }
      });
      const rr = res.result || {};
      if (!rr.success) throw new Error(rr.message || '设置角色失败');

      // 重新拉取档案（拿到 role_create_time）
      await this.refreshProfile();
    } catch (e) {
      console.warn('setRoleIfNeeded ignored:', e);
    }
  },

  ensureParentCode: async function() {
    wx.showLoading({ title: '生成中...' });
    try {
      const res = await wx.cloud.callFunction({ name: 'ensureParentBindCode' });
      if (res.result && res.result.success) {
        this.setData({ bindCode: res.result.bind_code || '' });
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '生成失败', icon: 'none' });
      }
    } catch (e) {
      console.error(e);
      wx.showToast({ title: '生成失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onEditNickName() {
    this.setData({ editingNickName: true, nickNameDraft: this.data.nickName || '' });
  },

  onNickNameInput(e) {
    this.setData({ nickNameDraft: e.detail.value || '' });
  },

  async onSaveNickName() {
    const nickName = (this.data.nickNameDraft || '').trim();
    try {
      wx.showLoading({ title: '保存中...' });
      const res = await wx.cloud.callFunction({
        name: 'updateMyProfile',
        data: { nickName }
      });
      const rr = res.result || {};
      if (!rr.success) throw new Error(rr.message || '保存失败');
      this.setData({ nickName, editingNickName: false, nickNameDraft: '' });
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (e) {
      console.error(e);
      wx.showToast({ title: e.message || '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onCancelNickName() {
    this.setData({ editingNickName: false, nickNameDraft: '' });
  },

  async loadChildrenIfParent() {
    if (this.data.roleTab !== 'parent') return;
    try {
      const res = await wx.cloud.callFunction({ name: 'getMyBindings', data: {} });
      const rr = res.result || {};
      if (!rr.success) throw new Error(rr.message || '获取绑定关系失败');
      const asParentList = (rr.data && rr.data.asParent) || [];
      const children = asParentList.map((c) => ({
        child_openid: c.openid,
        childName: c.name || '未命名孩子',
        bind_time: this.formatTimeText(c.bind_time) || ''
      }));
      this.setData({ children });
    } catch (e) {
      console.warn('loadChildrenIfParent ignored:', e);
      this.setData({ children: [] });
    }
  },

  async onUnbindChild(e) {
    const childOpenId = e.currentTarget.dataset.childopenid;
    if (!childOpenId) return;

    wx.showModal({
      title: '确认解绑',
      content: '解绑后，该孩子打卡将不再通知你，确认继续？',
      confirmText: '解绑',
      confirmColor: '#ff4d4f',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          wx.showLoading({ title: '解绑中...' });
          const resp = await wx.cloud.callFunction({
            name: 'unbindChild',
            data: { childOpenId }
          });
          const r2 = resp.result || {};
          if (!r2.success) throw new Error(r2.message || '解绑失败');
          wx.showToast({ title: '解绑成功', icon: 'success' });
          await this.loadChildrenIfParent();
          // 解绑孩子后不会影响本人的孩子身份禁用逻辑（这是家长解绑孩子场景）
          // 这里不改 disableParentTab
        } catch (err) {
          console.error(err);
          wx.showToast({ title: err.message || '解绑失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  copyCode: function() {
    if (!this.data.bindCode) return;
    wx.setClipboardData({
      data: this.data.bindCode
    });
  },

  onInputCode: function(e) {
    const v = String(e.detail.value || '').replace(/\D/g, '').slice(0, 6);
    this.setData({ inputCode: v });
  },

  submitBind: async function() {
    const bindCode = String(this.data.inputCode || '').trim();
    if (!/^\d{6}$/.test(bindCode)) {
      wx.showToast({ title: '请输入6位数字绑定码', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '绑定中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'bindToParent',
        data: { bindCode }
      });

      if (res.result && res.result.success) {
        // 绑定成功后，若未设置角色，这里也尝试写为 child（只写一次）
        await this.setRoleIfNeeded('child');

        wx.showToast({ title: '绑定成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack({ delta: 1 });
        }, 800);
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '绑定失败', icon: 'none' });
      }
    } catch (e) {
      console.error(e);
      wx.showToast({ title: '绑定失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ submitting: false });
    }
  }
});
