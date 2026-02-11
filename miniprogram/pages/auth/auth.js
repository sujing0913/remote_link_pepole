const db = wx.cloud.database();

Page({
  data: {
    inviterOpenId: '',
    avatarUrl: '',
    nickName: ''
  },

  onLoad: function(options) {
    this.setData({ inviterOpenId: options.inviterOpenId || '' });
  },

  onChooseAvatar: function(e) {
    const { avatarUrl } = e.detail;
    this.setData({ avatarUrl });
  },

  onNicknameInput: function(e) {
    this.setData({ nickName: e.detail.value });
  },

  onNicknameBlur: function(e) {
    this.setData({ nickName: e.detail.value });
  },

  onLoginClick: async function() {
    const { avatarUrl, nickName } = this.data;
    
    if (!nickName || nickName === '微信用户') {
      wx.showToast({ title: '请完善真实昵称', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '资料上传中...', mask: true });

    let finalAvatarUrl = avatarUrl;
    // 如果选择了头像且是临时路径，则上传到云存储
    if (avatarUrl && (avatarUrl.startsWith('http://tmp/') || avatarUrl.startsWith('wxfile://') || avatarUrl.startsWith('http://usr/'))) {
      try {
        const suffix = /\.[^\.]+$/.exec(avatarUrl)[0] || '.png';
        const cloudPath = `avatars/${Date.now()}-${Math.floor(Math.random() * 1000)}${suffix}`;
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: avatarUrl
        });
        finalAvatarUrl = uploadRes.fileID;
      } catch (uploadErr) {
        console.error('头像上传失败', uploadErr);
      }
    }

    this.doLogin({
      nickName: nickName,
      avatarUrl: finalAvatarUrl
    });
  },

  doLogin: function(userInfo) {
    const that = this;
    wx.showLoading({ title: '登录中...', mask: true });

    wx.cloud.callFunction({
      name: 'getUserInfo',
      success: (cloudRes) => {
        const userData = cloudRes.result;
        const openId = userData.openId;
        const role = userData.role;
        
        wx.setStorageSync('currentUser', {
          openId: openId,
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          role: role
        });
        
        wx.cloud.callFunction({
          name: 'updateUserInfo',
          data: {
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl
          }
        }).catch(err => {
          console.error('更新用户信息失败', err);
        });
        
        if (that.data.inviterOpenId) {
          db.collection('users').doc(that.data.inviterOpenId).get().then(res => {
            if (res.data) {
              const allUsers = wx.getStorageSync('allUsers') || {};
              allUsers[that.data.inviterOpenId] = {
                nickName: res.data.nickName || '未知用户',
                avatarUrl: res.data.avatarUrl || ''
              };
              wx.setStorageSync('allUsers', allUsers);
            }
          }).catch(err => {
            console.error('获取组织者信息失败', err);
          });
        }
        
        wx.hideLoading();
        const targetUrl = that.data.inviterOpenId 
          ? `/pages/index/index?inviterOpenId=${that.data.inviterOpenId}`
          : '/pages/index/index';
        
        wx.reLaunch({ url: targetUrl });
      },
      fail: (cloudErr) => {
        wx.hideLoading();
        console.error('云函数 getUserInfo 调用失败', cloudErr);
        wx.showModal({
          title: '服务器登录失败',
          content: '请检查网络或云环境配置。',
          showCancel: false
        });
      }
    });
  }
});
