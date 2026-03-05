Page({
  data: {
    loading: false,
    list: []
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'getMyNotifications',
        data: { page: 1, pageSize: 50 }
      });

      const list = res?.result?.list || [];
      this.setData({ list });
    } catch (e) {
      console.error(e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${mi}`;
  },

  async onTapItem(e) {
    const id = e.currentTarget.dataset.id;
    const childOpenId = e.currentTarget.dataset.child;
    const recordId = e.currentTarget.dataset.record;

    // 先标记已读（失败也不阻断跳转）
    if (id) {
      wx.cloud
        .callFunction({
          name: 'markNotificationRead',
          data: { notificationId: id }
        })
        .catch(err => console.warn('markNotificationRead failed', err));
    }

    // 跳转历史记录并自动筛选孩子
    const params = [];
    if (childOpenId) params.push(`childOpenId=${encodeURIComponent(childOpenId)}`);
    if (recordId) params.push(`recordId=${encodeURIComponent(recordId)}`);

    const url = `/pages/history/history${params.length ? `?${params.join('&')}` : ''}`;
    wx.navigateTo({ url });
  }
});
