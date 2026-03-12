const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { upsertUserProfile } = require('./userUpsert');
const { getRoleInfo, ROLE } = require('./userRoles');

// 云函数入口：静默登录 + users 档案补齐（upsert）
// 关键约束：以云开发系统字段 _openid 作为唯一键
// 补齐策略：
// - 必写/尽量补齐：openid(冗余字段)、_openid、nickName、avatarUrl、role(不强制)、create_time、update_time
// - 不在登录时生成 bind_code（避免破坏"用户不点我是家长也生成码"的规则）
// 
// 返回增强的角色信息，包含角色描述、图标和权限
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;

  if (!openId) {
    return { success: false, message: '未获取到用户身份' };
  }

  const now = db.serverDate();

  // 前端若传了 userInfo（如 getUserProfile 获取），可带上；没传也不影响 upsert
  const userInfo = (event && event.userInfo) || {};
  const nickName = userInfo.nickName;
  const avatarUrl = userInfo.avatarUrl;

  try {
    const patch = {
      role: '',
      create_time: now
    };
    if (typeof nickName === 'string') patch.nickName = nickName;
    if (typeof avatarUrl === 'string') patch.avatarUrl = avatarUrl;

    const upsertRes = await upsertUserProfile(db, openId, patch, { now, softDedup: true });

    // 获取角色信息（包含描述、图标、权限）
    const roleInfo = getRoleInfo(upsertRes.user.role);

    return {
      success: true,
      openId: openId,
      openid: openId,
      _openid: openId,
      nickName: upsertRes.user.nickName,
      avatarUrl: upsertRes.user.avatarUrl,
      role: upsertRes.user.role || ROLE.NORMAL,
      // 增强的角色信息
      roleInfo: roleInfo,
      roleDescription: roleInfo.description,
      roleIcon: roleInfo.icon,
      rolePermissions: roleInfo.permissions,
      // 其他用户信息
      bindCode: upsertRes.user.bind_code || null,
      hasBindCode: !!upsertRes.user.bind_code,
      userId: upsertRes.userId,
      createTime: upsertRes.user.create_time,
      updateTime: upsertRes.user.update_time,
      roleUpdateTime: upsertRes.user.role_update_time,
      // 打卡圈公开设置
      punchCirclePublic: upsertRes.user.punchCirclePublic || false
    };
  } catch (err) {
    console.error('getUserInfo failed:', err);
    // 即使失败，也至少把 openid 返回给前端（不阻断业务）
    return { success: true, openId: openId, openid: openId };
  }
};
