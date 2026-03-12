// cloudfunctions/updateCheckIn/index.js
// 更新打卡记录：用于手动评分/AI 评分保存
// 入参：{ recordId, score?, aiAnalysis?, recognizedContent?, totalQuestions?, correctQuestions?, checkResults?, manualEdited? }

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
    recordId, 
    score, 
    aiAnalysis, 
    recognizedContent, 
    totalQuestions, 
    correctQuestions, 
    checkResults,
    manualEdited = true 
  } = event || {};

  if (!recordId) {
    return { success: false, message: '缺少记录 ID' };
  }

  // 验证得分（如果传入了 score 参数）
  if (score !== undefined && score !== null && score !== '') {
    const scoreNum = parseInt(score);
    if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 10) {
      return { success: false, message: '得分应在 0-10 之间' };
    }
  }

  try {
    // 先检查该记录是否存在，以及当前用户是否有权限更新
    // 规则：
    // 1. 记录是自己的 (puncherOpenId === openId)
    // 2. 或者是家长 - 孩子的记录（通过 binds 表校验）
    const record = await db.collection('check_ins').doc(recordId).get();
    if (!record || !record.data) {
      return { success: false, message: '记录不存在' };
    }

    const recordData = record.data;
    const puncherOpenId = recordData.puncherOpenId || recordData.puncher_openid;

    // 检查是否是自己的记录
    let canUpdate = (puncherOpenId === openId);

    // 如果不是自己的记录，检查是否是家长 - 孩子关系
    if (!canUpdate) {
      const binding = await db.collection('binds').where({
        parent_openid: openId,
        child_openid: puncherOpenId,
        status: 1
      }).limit(1).get();

      if (binding.data && binding.data.length > 0) {
        canUpdate = true;
      }
    }

    if (!canUpdate) {
      return { success: false, message: '无权限更新该记录' };
    }

    // 执行更新
    const updateData = {
      manualEdited: manualEdited,
      editedAt: db.serverDate()
    };

    // 如果传入了 score，则更新 score
    if (score !== undefined && score !== null && score !== '') {
      updateData.score = parseInt(score);
    }

    // 如果传入了 aiAnalysis，则更新 aiAnalysis（评价列）
    if (aiAnalysis !== undefined) {
      updateData.aiAnalysis = aiAnalysis || '';
    }

    // 如果传入了 recognizedContent，则更新 recognizedContent
    if (recognizedContent !== undefined) {
      updateData.recognizedContent = recognizedContent || '';
    }

    // 如果传入了 totalQuestions，则更新 totalQuestions
    if (totalQuestions !== undefined) {
      updateData.totalQuestions = totalQuestions || 0;
    }

    // 如果传入了 correctQuestions，则更新 correctQuestions
    if (correctQuestions !== undefined) {
      updateData.correctQuestions = correctQuestions || 0;
    }

    // 如果传入了 checkResults，则更新 checkResults
    if (checkResults !== undefined) {
      updateData.checkResults = checkResults || [];
    }

    const result = await db.collection('check_ins').doc(recordId).update({
      data: updateData
    });

    return {
      success: true,
      message: '更新成功',
      updated: 1,
      recordId: recordId
    };
  } catch (err) {
    console.error('updateCheckIn error:', err);
    return { success: false, message: err.message || '更新失败' };
  }
};
