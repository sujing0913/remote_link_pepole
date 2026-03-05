Page({
  data: {},

  onLoad: function(options) {},

  // 跳转到扫描单词页面
  goToScanWord: function() {
    wx.navigateTo({
      url: '/pages/scanWord/scanWord'
    });
  },

  // 跳转到单词本页面
  goToWordbook: function() {
    wx.navigateTo({
      url: '/pages/wordbook/wordbook'
    });
  }
});
