// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  
  try {
    // 注意：chooseMessageFile 是小程序端 API，不能在云函数中直接调用
    // 云函数主要用于处理文件上传后的逻辑，如保存到数据库、生成临时链接等
    
    // 返回当前用户 openid 和云函数环境信息
    return {
      success: true,
      openid: wxContext.OPENID,
      unionid: wxContext.UNIONID,
      env: wxContext.ENV,
      message: '云函数已就绪，请在小程序端调用 wx.chooseMessageFile 选择文件',
      tips: {
        step1: '在小程序端调用 wx.chooseMessageFile 选择聊天中的文件',
        step2: '获取到 tempFilePath 后调用 wx.cloud.uploadFile 上传到云存储',
        step3: '将 fileID 保存到数据库 tasks 集合中'
      }
    };
  } catch (err) {
    console.error('云函数执行失败', err);
    return {
      success: false,
      errMsg: err.message,
      errCode: err.code
    };
  }
};
