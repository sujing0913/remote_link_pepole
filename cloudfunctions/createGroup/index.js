const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 云函数入口
exports.main = async (event, context) => {
  const { OPENID: supervisorOpenId } = cloud.getWXContext();
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

    // 2. 检查该群是否已存在
    const existingGroup = await db.collection('groups').where({
      _id: openGId
    }).get();

    if (existingGroup.data.length > 0) {
      return { 
        success: true, 
        message: '群组已存在',
        groupId: openGId
      };
    }

    // 3. 创建新的群组记录
    await db.collection('groups').doc(openGId).set({
      data: {
        _id: openGId,
        supervisorOpenId: supervisorOpenId,
        groupName: '学习打卡群', // 可以通过其他方式获取真实群名
        notifyToGroup: true, // 默认开启群通知
        createTime: db.serverDate()
      }
    });

    return { 
      success: true, 
      message: '群组创建成功',
      groupId: openGId
    };

  } catch (err) {
    console.error('创建群组失败:', err);
    return { success: false, message: '创建群组失败，请稍后重试' };
  }
};
