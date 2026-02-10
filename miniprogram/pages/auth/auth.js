const db = wx.cloud.database();

Page({
  data: {},

  onLoad: function(options) {
    // 保存邀请参数（如果有的话）
    this.setData({ inviterOpenId: options.inviterOpenId });
  },

  // 用户点击授权按钮
  onAuthClick: function() {
    const that = this;
    
    // 先显示提示信息
    wx.showToast({
      title: '需要授权才能登录',
      icon: 'none',
      duration: 2000
    });
    
    // 短暂延迟后调用 wx.getUserProfile 获取用户信息
    setTimeout(() => {
      wx.getUserProfile({
        desc: '用于完善用户资料，显示在打卡记录中', // 明确告知用户用途
        success: (profileRes) => {
          const userInfo = profileRes.userInfo;
          
          // 调用云函数获取 openId
          wx.cloud.callFunction({
            name: 'getUserInfo',
            success: (cloudRes) => {
              const userData = cloudRes.result;
              const openId = userData.openId;
              const currentNickName = userData.nickName || userInfo.nickName;
              const avatarUrl = userData.avatarUrl || userInfo.avatarUrl;
              const role = userData.role;
              
              // 保存用户信息到缓存
              wx.setStorageSync('currentUser', {
                openId: openId,
                nickName: userInfo.nickName, // 使用真实的微信昵称
                avatarUrl: userInfo.avatarUrl, // 使用真实的微信头像
                role: role
              });
              
              // 调用云函数更新用户信息（使用真实的微信昵称和头像）
              wx.cloud.callFunction({
                name: 'updateUserInfo',
                data: {
                  nickName: userInfo.nickName,
                  avatarUrl: userInfo.avatarUrl
                }
              }).catch(err => {
                console.error('更新用户信息失败', err);
              });
              
              // 如果是通过邀请链接进入，同时保存组织人信息
              if (that.data.inviterOpenId) {
                // 获取组织人信息并保存到缓存
                db.collection('users').doc(that.data.inviterOpenId).get({
                  success: (res) => {
                    if (res.data) {
                      // 更新组织人信息（如果需要）
                      const allUsers = wx.getStorageSync('allUsers') || {};
                      allUsers[that.data.inviterOpenId] = {
                        nickName: res.data.nickName || '未知用户',
                        avatarUrl: res.data.avatarUrl || ''
                      };
                      wx.setStorageSync('allUsers', allUsers);
                    }
                  },
                  fail: (err) => {
                    console.error('获取组织人信息失败', err);
                  }
                });
              }
              
              // 检查是否是通过邀请链接进入
              if (that.data.inviterOpenId) {
                // 跳转到首页并传递邀请参数
                wx.reLaunch({
                  url: `/pages/index/index?inviterOpenId=${that.data.inviterOpenId}`
                });
              } else {
                // 直接跳转到首页
                wx.reLaunch({
                  url: '/pages/index/index'
                });
              }
            },
            fail: (cloudErr) => {
              console.error('获取用户信息失败', cloudErr);
              wx.showToast({ title: '获取用户信息失败', icon: 'error' });
            }
          });
        },
        fail: (err) => {
          // 用户拒绝授权
          console.error('用户拒绝授权', err);
          wx.showToast({ title: '需要授权才能使用', icon: 'none' });
        }
      });
    }, 500); // 500ms 延迟，让用户看到提示
  }
});
