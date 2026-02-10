const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 云函数入口
exports.main = async (event, context) => {
  const { OPENID: inviterOpenId } = cloud.getWXContext();
  const { inviteePhoneNumber } = event;

  try {
    // 1. 验证邀请者身份
    const inviterRes = await db.collection('users').doc(inviterOpenId).get();
    if (!inviterRes.data) {
      return { success: false, message: '邀请者信息不存在' };
    }
    const inviterNickName = inviterRes.data.nickName;

    // 2. 根据手机号查找被邀请人
    const inviteeRes = await db.collection('users').where({
      phoneNumber: inviteePhoneNumber
    }).get();

    if (inviteeRes.data.length === 0) {
      return { success: false, message: '未找到该手机号对应的用户，请确认对方已使用此手机号登录小程序' };
    }

    const inviteeOpenId = inviteeRes.data[0]._openid;
    const inviteeNickName = inviteeRes.data[0].nickName;

    // 3. 检查是否已经存在绑定关系
    const existingBinding = await db.collection('bindings').where({
      puncherOpenId: inviterOpenId,
      supervisorOpenId: inviteeOpenId
    }).get();

    if (existingBinding.data.length > 0) {
      return { success: false, message: '您已邀请过该用户' };
    }

    // 4. 发送订阅消息
    // 注意：这里需要先获取用户的订阅授权，此处为简化，假设已获得
    const templateId = 'YOUR_SUBSCRIPTION_TEMPLATE_ID'; // 需要替换为真实的模板ID
    const page = `pages/index/index?inviterOpenId=${inviterOpenId}`;
    const data = {
      thing1: { value: `${inviterNickName} 邀请您成为其学习监管人` },
      thing2: { value: '点击查看详情并接受邀请' }
    };

    try {
      await cloud.openapi.subscribeMessage.send({
        touser: inviteeOpenId,
        templateId,
        page,
        data
      });
    } catch (msgErr) {
      console.error('消息发送失败:', msgErr);
      // 即使消息发送失败，也可以选择创建绑定关系，让用户通过其他方式得知
    }

    // 5. （可选）创建一个待处理的邀请记录
    await db.collection('invitations').add({
      data: {
        inviterOpenId,
        inviteeOpenId,
        status: 'pending', // pending, accepted, rejected
        createTime: db.serverDate()
      }
    });

    return { 
      success: true, 
      message: `邀请已发送给 ${inviteeNickName}，请等待对方确认。`,
      inviteeNickName
    };

  } catch (err) {
    console.error('邀请流程出错:', err);
    return { success: false, message: '邀请发送失败，请稍后重试' };
  }
};
