const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 云函数入口
exports.main = async (event, context) => {
  const { OPENID: puncherOpenId } = cloud.getWXContext();
  const { shareTicket } = event;

  if (!shareTicket) {
    return { success: false, message: '缺少 shareTicket' };
  }

  try {
    // 1. 通过 shareTicket 获取群的 openGId
    const groupInfo = await cloud.openapi.getShareInfo({
      shareTicket: shareTicket
    });

    const openGId = groupInfo.openGId;
    if (!openGId) {
      return { success: false, message: '无法获取群ID' };
    }

    // 2. 检查该群是否存在
    const groupRes = await db.collection('groups').doc(openGId).get();
    if (!groupRes.data) {
      return { success: false, message: '该群组尚未由群主激活，请联系群主在群聊中打开小程序。' };
    }

    // 3. 检查用户是否已加入
    const existingBinding = await db.collection('bindings').where({
      puncherOpenId: puncherOpenId,
      groupId: openGId
    }).get();

    if (existingBinding.data.length > 0) {
      return { 
        success: true, 
        message: '您已加入该群组',
        groupId: openGId,
        supervisorOpenId: groupRes.data.supervisorOpenId
      };
    }

    // 4. 创建新的绑定关系
    await db.collection('bindings').add({
      data: {
        puncherOpenId: puncherOpenId,
        supervisorOpenId: groupRes.data.supervisorOpenId, // 从群信息中获取监管人
        groupId: openGId,
        createTime: db.serverDate()
      }
    });

    return { 
      success: true, 
      message: '成功加入群组',
      groupId: openGId
    };

  } catch (err) {
    console.error('加入群组失败:', err);
    return { success: false, message: '加入群组失败，请稍后重试' };
  }
};
