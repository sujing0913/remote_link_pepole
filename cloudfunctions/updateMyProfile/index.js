// cloudfunctions/updateMyProfile/index.js
// 更新当前用户 users 档案：nickName / avatarUrl / role / role_create_time
// 兼容：users 可能只有 _openid，没有 openid 字段
//
// 入参（event）：
// - nickName?: string
// - avatarUrl?: string
// - role?: 'parent' | 'child' | ''   （允许传空表示清空；但业务上通常不清空）
// - setRole?: boolean                （true 时才会更新 role/role_create_time，避免误覆盖）
// - setRoleCreateTime?: boolean      （默认 true：首次设置角色时写入时间；若 role_create_time 已存在则不覆盖）
//
// 返回：{ success, data: { updated }, message? }

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { upsertUserProfile, findUsersByOpenid, scoreUser } = require('./userUpsert');

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) return { success: false, message: '未获取到用户身份' };

  try {
    const {
      nickName,
      avatarUrl,
      role,
      setRole = false,
      setRoleCreateTime = true
    } = event || {};

    const now = db.serverDate();

    // 先查出当前 openid 的全部 users 记录，选出“最优主记录”用于 role_create_time 判断
    const users = await findUsersByOpenid(db, openid);
    let primary = users && users.length ? users[0] : null;
    if (users && users.length > 1) {
      for (const u of users) {
        if (scoreUser(u) > scoreUser(primary)) primary = u;
      }
    }

    const updateData = {
      // 统一补齐 openid（历史记录可能缺失）
      openid,
      // 如果历史没有 create_time，这里补齐（upsert 会写入）
      create_time: now
    };

    if (typeof nickName !== 'undefined') updateData.nickName = String(nickName);
    if (typeof avatarUrl !== 'undefined') updateData.avatarUrl = String(avatarUrl);

    // 只有显式 setRole 才允许更新 role，避免其它调用误改
    if (setRole) {
      updateData.role = role || '';

      // role_create_time 只在首次设置时写入（或为空时写入）
      if (setRoleCreateTime) {
        const hasRoleCreateTime = !!(primary && primary.role_create_time);
        if (!hasRoleCreateTime) {
          updateData.role_create_time = now;
        }
      }
    }

    const upsertRes = await upsertUserProfile(db, openid, updateData, { now, softDedup: true });

    return {
      success: true,
      data: {
        updated: 1,
        userId: upsertRes.userId,
        deduped: upsertRes.dedupedCount || 0,
        created: !!upsertRes.created
      }
    };
  } catch (err) {
    console.error(err);
    return { success: false, message: err.message || '未知错误' };
  }
};
