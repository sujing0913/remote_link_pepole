// cloudfunctions/getMyProfile/index.js
// 读取当前用户 users 档案（兼容：线上可能只有 _openid，没有 openid 字段）
// 返回：role、role_create_time、nickName、avatarUrl、bind_code、bind_code_create_time、create_time、update_time
//
// 注意：_openid 是云开发系统字段，无法在控制台字段列表里手动看到，但每条记录实际存在
// 本函数会优先按 _openid 查，查不到再按 openid 字段兜底（兼容历史）

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { success: false, message: '未获取到用户身份' };
  }

  try {
    const res = await db
      .collection('users')
      .where(_.or([{ _openid: openid }, { openid }]))
      .limit(1)
      .get();

    if (!res.data || res.data.length === 0) {
      return {
        success: true,
        data: {
          openid,
          role: '',
          role_create_time: null,
          nickName: '',
          avatarUrl: '',
          bind_code: '',
          bind_code_create_time: null,
          create_time: null,
          update_time: null
        }
      };
    }

    const user = res.data[0];

    return {
      success: true,
      data: {
        openid: user.openid || openid,
        role: user.role || '',
        role_create_time: user.role_create_time || null,
        nickName: user.nickName || '',
        avatarUrl: user.avatarUrl || '',
        bind_code: user.bind_code || '',
        bind_code_create_time: user.bind_code_create_time || null,
        create_time: user.create_time || null,
        update_time: user.update_time || null
      }
    };
  } catch (err) {
    console.error(err);
    return { success: false, message: err.message || '未知错误' };
  }
};
