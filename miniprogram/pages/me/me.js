const app = getApp();

Page({
  data: {
    userInfo: {},
    openid: '',
    asParent: false,
    asChild: false,
    roleText: '普通用户',
    children: [],
    parents: [],
    // 通知红点
    unreadCount: 0,
    // 家长档案展示
    parentProfile: {
      role: '',
      bind_code: '',
      bind_code_create_time: '',
      nickName: '' // 家长自定义昵称（默认空，可编辑）
    },
    editingNickName: false,
    nickNameDraft: '',
    // 家长端：批量解绑
    selectedChildOpenIds: []
  },

  onLoad() {
    this.refresh();
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    try {
      await this.ensureLogin();
      await this.loadBindings();
      // 拉取用户档案（包含 nickName / role / bind_code 等），保证退出再进入也能显示最新昵称
      await this.loadMyProfile();
      // 兼容旧逻辑：如果没有 users 档案但已生成过绑定码，也能兜底展示
      await this.loadParentProfileIfNeeded();
      // 未读通知数（仅家长需要，但这里即使普通用户调用也只会返回0/或失败，不影响使用）
      await this.loadUnreadCount();
    } catch (e) {
      console.error(e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async loadMyProfile() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getMyProfile',
        data: {}
      });
      const rr = (res && res.result) || {};
      if (!rr.success) return;

      const p = rr.data || {};
      const role = p.role || '';
      const bindCode = p.bind_code || '';
      const bindCodeCreateTime = this.formatBindTime(p.bind_code_create_time) || '';
      const nickName = p.nickName || '';

      // 根据档案推断身份：角色互斥（child 与 parent 不能同时成立）
      // 优先级：role 字段 > bind_code（有绑定码视为家长） > 绑定关系推断
      let asParent = this.data.asParent;
      let asChild = this.data.asChild;
      let roleText = this.data.roleText || '普通用户';

      if (role === 'child') {
        asChild = true;
        asParent = false;
        roleText = '孩子';
      } else if (role === 'parent' || bindCode) {
        asParent = true;
        asChild = false;
        roleText = '家长';
      } else if (!asParent && !asChild) {
        roleText = '普通用户';
      } else if (asChild) {
        asParent = false;
        roleText = '孩子';
      } else if (asParent) {
        asChild = false;
        roleText = '家长';
      }

      // 孩子端：强制不展示绑定码（即便历史数据里意外残留 bind_code，也不展示）
      const visibleBindCode = asParent ? bindCode : '';
      const visibleBindCodeCreateTime = asParent ? bindCodeCreateTime : '';

      this.setData({
        asParent,
        asChild,
        roleText,
        parentProfile: {
          ...(this.data.parentProfile || {}),
          // parentProfile 仅用于家长档案展示：孩子身份时不回填绑定码，避免前端误展示
          role: asParent
            ? 'parent'
            : (this.data.parentProfile && this.data.parentProfile.role) || '',
          bind_code: visibleBindCode || (this.data.parentProfile && this.data.parentProfile.bind_code) || '',
          bind_code_create_time:
            visibleBindCodeCreateTime ||
            (this.data.parentProfile && this.data.parentProfile.bind_code_create_time) ||
            '',
          nickName: asParent ? nickName : (this.data.parentProfile && this.data.parentProfile.nickName) || ''
        }
      });

      // 同步缓存 userInfo.nickName，供顶部卡片/其它页面复用
      if (nickName) {
        const cachedUserInfo = wx.getStorageSync('userInfo') || {};
        wx.setStorageSync('userInfo', { ...cachedUserInfo, nickName });
        this.setData({
          userInfo: {
            ...(this.data.userInfo || {}),
            nickName
          }
        });
      }
    } catch (e) {
      console.warn('loadMyProfile ignored:', e);
    }
  },

  ensureLogin() {
    // 项目里一般在 app.js 启动时会拿 openid 并缓存
    // 这里做一个兜底：如果缓存里没有 openid，则调 getUserInfo 云函数获取
    return new Promise((resolve, reject) => {
      const cachedOpenid = wx.getStorageSync('openid');
      const cachedUserInfo = wx.getStorageSync('userInfo');

      if (cachedOpenid) {
        this.setData({
          openid: cachedOpenid,
          userInfo: cachedUserInfo || {}
        });
        resolve();
        return;
      }

      wx.cloud.callFunction({
        name: 'getUserInfo',
        data: {}
      })
        .then((res) => {
          // 兼容 getUserInfo 返回字段：openId（本项目现有云函数）/ openid（部分旧实现）
          const r = (res && res.result) || {};
          const openid = r.openId || r.openid || r.openID || '';
          // 兼容用户信息字段：nickName/avatarUrl 或 userInfo
          const userInfo =
            r.userInfo ||
            {
              nickName: r.nickName,
              avatarUrl: r.avatarUrl
            };

          if (!openid) throw new Error('未获取到 openid');

          wx.setStorageSync('openid', openid);
          if (userInfo) wx.setStorageSync('userInfo', userInfo);

          this.setData({
            openid,
            userInfo: userInfo || {}
          });
          resolve();
        })
        .catch(reject);
    });
  },

  // 绑定日期格式化：YYYY-MM-DD HH:mm
  formatBindTime(t) {
    if (!t) return '';
    let d = null;

    // 云数据库 Date 可能以对象形式返回：{ $date: ... } 或直接是时间戳/字符串
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
    const Y = d.getFullYear();
    const M = pad(d.getMonth() + 1);
    const D = pad(d.getDate());
    const h = pad(d.getHours());
    const m = pad(d.getMinutes());
    return `${Y}-${M}-${D} ${h}:${m}`;
  },

  async loadBindings() {
    const res = await wx.cloud.callFunction({
      name: 'getMyBindings',
      data: {}
    });

    const rr = res.result || {};
    if (!rr.success) {
      throw new Error(rr.message || '获取绑定关系失败');
    }

    const data = rr.data || {};
    const asParentList = data.asParent || [];
    const asChildList = data.asChild || [];

    // 角色互斥：如同时存在（理论上不应出现，但历史数据可能存在），按“家长优先”兜底
    let asParent = asParentList.length > 0;
    let asChild = asChildList.length > 0;

    if (asParent && asChild) {
      asChild = false;
    }

    let roleText = '普通用户';
    if (asParent) roleText = '家长';
    else if (asChild) roleText = '孩子';

    const displayName = (name, openid) => {
      const n = (name || '').trim();
      if (n) return n;
      const tail = String(openid || '').slice(-4);
      return `user${tail || ''}`;
    };

    // 页面展示结构（name 已在云函数端优先 nickName/name；这里再兜底一次）
    const children = asParentList.map((c) => ({
      child_openid: c.openid,
      childName: displayName(c.name, c.openid),
      bind_time: this.formatBindTime(c.bind_time) || ''
    }));

    const parents = asChildList.map((p) => ({
      parent_openid: p.openid,
      parentName: displayName(p.name, p.openid),
      bind_time: this.formatBindTime(p.bind_time) || ''
    }));

    this.setData({
      asParent,
      asChild,
      roleText,
      children,
      parents,
      selectedChildOpenIds: [] // 刷新后清空勾选
    });
  },

  async loadUnreadCount() {
    // 站内通知：未读数（家长端红点）
    // 注意：普通用户/孩子也可调用，但 notifications 按 parent_openid 查，不会有数据
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUnreadCount',
        data: {}
      });
      const rr = (res && res.result) || {};
      if (!rr.success) return;

      this.setData({ unreadCount: rr.unread || 0 });
    } catch (e) {
      // ignore
    }
  },

  async loadParentProfileIfNeeded() {
    // 仅用于“家长档案卡片”的兜底展示：绑定码等信息
    // 重要：孩子身份绝不调用/展示绑定码（避免 ensureParentBindCode 创建家长码，导致身份/展示混乱）
    if (!this.data.asParent) return;

    try {
      const res = await wx.cloud.callFunction({
        name: 'ensureParentBindCode',
        data: {}
      });
      const rr = res.result || {};
      if (!rr.success) return;

      const bindCode = rr.bind_code || '';
      const bindCodeCreateTime = this.formatBindTime(rr.bind_code_create_time) || '';

      if (bindCode) {
        this.setData({
          parentProfile: {
            ...(this.data.parentProfile || {}),
            role: 'parent',
            bind_code: bindCode,
            bind_code_create_time: bindCodeCreateTime,
            nickName: (this.data.parentProfile && this.data.parentProfile.nickName) || ''
          }
        });

        // 如果当前已经被判定为家长，则同步 asParent=true（不改 roleText）
        if (this.data.asParent) {
          this.setData({ asParent: true });
        }
      }
    } catch (e) {
      // ignore：不影响页面其它功能
      console.warn('loadParentProfileIfNeeded ignored:', e);
    }
  },

  onEditNickName() {
    const currentNickName = this.data.asParent
      ? ((this.data.parentProfile && this.data.parentProfile.nickName) ||
          (this.data.userInfo && this.data.userInfo.nickName) ||
          '')
      : ((this.data.userInfo && this.data.userInfo.nickName) || '');

    this.setData({
      editingNickName: true,
      nickNameDraft: currentNickName
    });
  },

  onNickNameInput(e) {
    this.setData({ nickNameDraft: e.detail.value || '' });
  },

  async onSaveNickName() {
    const nickName = (this.data.nickNameDraft || '').trim();
    // 允许保存空（即清空）
    try {
      wx.showLoading({ title: '保存中...' });

      // 统一走云函数，避免直连数据库权限/where 兼容问题；同时保证退出再进能从 users 里读到最新 nickName
      const resp = await wx.cloud.callFunction({
        name: 'updateMyProfile',
        data: { nickName }
      });
      const rr = (resp && resp.result) || {};
      if (!rr.success) throw new Error(rr.message || '保存失败');

      // 立即同步本页展示 + 本地缓存，保证“保存后立刻更新”与“退出再进入仍显示最新昵称”
      const cachedUserInfo = wx.getStorageSync('userInfo') || {};
      wx.setStorageSync('userInfo', { ...cachedUserInfo, nickName });

      this.setData({
        editingNickName: false,
        userInfo: {
          ...(this.data.userInfo || {}),
          nickName
        },
        parentProfile: {
          ...(this.data.parentProfile || {}),
          nickName
        }
      });

      // 关键：如果我是孩子（或普通用户）且我绑定了家长，则我改名后家长端需要看到最新昵称：
      // 1) 本页若当前是家长视角：刷新绑定孩子列表
      // 2) 即便当前不是家长，也尝试刷新 bindings（不影响孩子端 parents 列表展示）
      try {
        await this.loadBindings();
      } catch (e) {
        // ignore
      }

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

  // 勾选/取消勾选孩子（checkbox-group）
  onSelectChildren(e) {
    const values = (e.detail && e.detail.value) || [];
    this.setData({ selectedChildOpenIds: values });
  },

  // 批量解绑（家长端）
  async onBatchUnbind() {
    const ids = this.data.selectedChildOpenIds || [];
    if (!ids.length) {
      wx.showToast({ title: '请先勾选要解绑的孩子', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认解绑',
      content: `确认解绑已选中的 ${ids.length} 个孩子？解绑后，他们打卡将不再通知你。`,
      confirmText: '解绑',
      confirmColor: '#ff4d4f',
      success: async (r) => {
        if (!r.confirm) return;

        try {
          wx.showLoading({ title: '解绑中...' });

          // 逐个解绑（最简单可靠；后续可优化为云函数批量）
          for (const childOpenId of ids) {
            const resp = await wx.cloud.callFunction({
              name: 'unbindChild',
              data: { childOpenId }
            });
            const rr = resp.result || {};
            if (!rr.success) {
              throw new Error(rr.message || '解绑失败');
            }
          }

          wx.showToast({ title: '解绑成功', icon: 'success' });
          await this.loadBindings();
        } catch (err) {
          console.error(err);
          wx.showToast({ title: err.message || '解绑失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  // 仍保留单个解绑入口（可选：列表行内按钮）
  onGoNotifications() {
    wx.navigateTo({ url: '/pages/notifications/notifications' });
  },

  onUnbindChild(e) {
    const childOpenId = e.currentTarget.dataset.childopenid;
    if (!childOpenId) return;
    this.setData({ selectedChildOpenIds: [childOpenId] }, () => this.onBatchUnbind());
  },

  // 跳转绑定监督人页面
  onGoBind() {
    wx.navigateTo({ url: '/pages/bind/bind' });
  },

  // 跳转到任务安排页面，为孩子安排任务
  onAssignTask(e) {
    const child = e.currentTarget.dataset.child;
    if (!child || !child.child_openid) {
      wx.showToast({ title: '孩子信息无效', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/assignTask/assignTask?childOpenId=' + child.child_openid + '&childName=' + encodeURIComponent(child.childName || '')
    });
  }
});
