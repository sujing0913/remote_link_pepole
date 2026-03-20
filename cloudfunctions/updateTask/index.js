// cloudfunctions/updateTask/index.js
// 更新任务：用于修改任务周期等
// 入参：{ taskId, startDate?, endDate?, deadline? }

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;

  if (!openId) {
    return { success: false, message: '未获取到用户身份' };
  }

  const { 
    taskId, 
    startDate, 
    endDate,
    deadline
  } = event || {};

  if (!taskId) {
    return { success: false, message: '缺少任务 ID' };
  }

  try {
    // 先检查该记录是否存在，以及当前用户是否有权限更新
    // 规则：
    // 1. 任务是自己的 (parentId === openId)
    // 2. 或者是家长 - 孩子的记录（通过 binds 表校验）
    const task = await db.collection('tasks').doc(taskId).get();
    if (!task || !task.data) {
      return { success: false, message: '任务不存在' };
    }

    const taskData = task.data;
    const parentId = taskData.parentId;
    const childOpenId = taskData.childOpenId;

    // 检查是否是自己的任务（家长创建的）
    let canUpdate = (parentId === openId);

    // 如果不是自己的任务，检查是否是家长 - 孩子关系
    if (!canUpdate && childOpenId) {
      const binding = await db.collection('binds').where({
        parent_openid: openId,
        child_openid: childOpenId,
        status: 1
      }).limit(1).get();

      if (binding.data && binding.data.length > 0) {
        canUpdate = true;
      }
    }

    if (!canUpdate) {
      return { success: false, message: '无权限更新该任务' };
    }

    // 执行更新
    const updateData = {
      editedAt: db.serverDate()
    };

    // 如果传入了 startDate，则更新 startDate
    if (startDate !== undefined) {
      if (startDate === null || startDate === '') {
        updateData.startDate = db.command.remove();
      } else {
        updateData.startDate = new Date(startDate);
      }
    }

    // 如果传入了 endDate，则更新 endDate
    if (endDate !== undefined) {
      if (endDate === null || endDate === '') {
        updateData.endDate = db.command.remove();
      } else {
        updateData.endDate = new Date(endDate);
      }
    }

    // 如果传入了 deadline，则更新 deadline
    if (deadline !== undefined) {
      if (deadline === null || deadline === '') {
        updateData.deadline = db.command.remove();
      } else {
        updateData.deadline = new Date(deadline);
      }
    }

    const result = await db.collection('tasks').doc(taskId).update({
      data: updateData
    });

    return {
      success: true,
      message: '更新成功',
      updated: 1,
      taskId: taskId
    };
  } catch (err) {
    console.error('updateTask error:', err);
    return { success: false, message: err.message || '更新失败' };
  }
};
