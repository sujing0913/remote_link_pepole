const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { encryptedData, iv } = event;
  const wxContext = cloud.getWXContext();

  try {
    // 解密手机号
    const result = cloud.getOpenData({
      list: [
        {
          encryptedData,
          iv,
          cloudID: wxContext.cloudID,
        },
      ],
    });

    const phoneNumber = result.list[0].data.phoneNumber;

    // 将手机号保存到 users 集合
    await db.collection('users').doc(wxContext.OPENID).set({
      data: {
        _openid: wxContext.OPENID,
        nickName: 'Unknown', // 实际应用中应从用户信息获取
        phoneNumber: phoneNumber,
        role: 'supervisor' // 假设生成邀请码的都是监管人
      },
      upsert: true
    });

    return {
      success: true,
      phoneNumber: phoneNumber
    };
  } catch (err) {
    console.error('解密失败', err);
    return {
      success: false,
      error: err.message
    };
  }
};
