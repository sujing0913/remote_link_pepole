const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { action, activityId, targetState, content } = event;
  try {
    if (action === 'create') {
      const res = await cloud.openapi.updatableMessage.createActivityId();
      return { success: true, activityId: res.activityId };
    } else if (action === 'update') {
      await cloud.openapi.updatableMessage.setUpdatableMsg({
        activityId,
        targetState: targetState || 1,
        templateInfo: {
          parameterList: [
            { name: 'member_count', value: content || '有人打卡啦' },
            { name: 'room_limit', value: '任务进行中' }
          ]
        }
      });
      return { success: true };
    }
  } catch (err) {
    console.error(err);
    return { success: false, error: err };
  }
};
