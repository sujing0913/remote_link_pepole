App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-5g6naqzse4d739d0', // 请在此处填入您在微信开发者工具中创建的真实云环境ID
        traceUser: true,
      });
    }
    this.globalData = {};
  }
});
