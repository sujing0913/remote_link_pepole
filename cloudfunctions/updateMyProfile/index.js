// cloudfunctions/updateMyProfile/index.js
// 更新当前用户 users 档案：nickName / avatarUrl / role
// 支持角色切换校验和绑定状态检查
//
// 数据集合：users、binds
// 入参（event）：
// - nickName?: string
// - avatarUrl?: string
// - role?: 'parent' | 'child' | 'normal' | ''
// - setRole?: boolean                （true 时才允许更新 role）
// - forceUpdateRole?: boolean        （true 时跳过绑定状态校验，强制更新）
//
// 返回：{ success, data: { user, roleInfo }, message? }

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { upsertUserProfile, findUsersByOpenid, scoreUser, normalizeRole } = require('./userUpsert');
const { ROLE, getRoleInfo, canBindAsParent, canBindAsChild } = require('./userRoles');

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
      forceUpdateRole = false
    } = event || {};

    const now = db.serverDate();

    // 先查出当前 openid 的全部 users 记录，选出"最优主记录"
    const users = await findUsersByOpenid(db, openid);
    let primary = users && users.length ? users[0] : null;
    if (users && users.length > 1) {
      for (const u of users) {
        if (scoreUser(u) > scoreUser(primary)) primary = u;
      }
    }

    const currentRole = normalizeRole(primary ? primary.role : ROLE.NORMAL);
    const updateData = {
      openid,
      _openid: openid,
      create_time: now
    };

    // 更新昵称和头像
    if (typeof nickName !== 'undefined') {
      updateData.nickName = String(nickName);
    }
    if (typeof avatarUrl !== 'undefined') {
      updateData.avatarUrl = String(avatarUrl);
    }

    // 角色更新逻辑
    if (setRole) {
      const newRole = normalizeRole(role);

      // 如果角色没有变化，直接返回
      if (currentRole === newRole) {
        return {
          success: true,
          message: '角色未变更',
          data: {
            user: primary,
            role: currentRole,
            roleInfo: getRoleInfo(currentRole),
            updated: 0
          }
        };
      }

      // 除非强制更新，否则进行绑定状态校验
      if (!forceUpdateRole) {
        // 获取绑定统计
        const asParentCount = await db
          .collection('binds')
          .where({ parent_openid: openid, status: 1 })
          .count();

        const asChildCount = await db
          .collection('binds')
          .where({ child_openid: openid, status: 1 })
          .count();

        // 校验规则 1: 孩子角色且有家长绑定时，不能切换为其他角色
        if (currentRole === ROLE.CHILD && (asChildCount.total || 0) > 0) {
          if (newRole !== ROLE.CHILD) {
            return {
              success: false,
              message: '当前已绑定家长，无法切换角色。请先解绑。',
              currentRole: currentRole,
              currentRoleInfo: getRoleInfo(currentRole),
              bindingStatus: {
                asParentCount: asParentCount.total || 0,
                asChildCount: asChildCount.total || 0
              }
            };
          }
        }

        // 校验规则 2: 家长角色且有孩子绑定时，不能切换为孩子
        if (currentRole === ROLE.PARENT && (asParentCount.total || 0) > 0) {
          if (newRole === ROLE.CHILD) {
            return {
              success: false,
              message: '当前已绑定孩子，无法切换为孩子角色。',
              currentRole: currentRole,
              currentRoleInfo: getRoleInfo(currentRole),
              bindingStatus: {
                asParentCount: asParentCount.total || 0,
                asChildCount: asChildCount.total || 0
              }
            };
          }
        }

        // 校验规则 3: 切换到家长角色时，确保可以成为家长
        const canBeParent = canBindAsParent(currentRole, asChildCount.total || 0);
        if (!canBeParent.allowed && newRole === ROLE.PARENT) {
          return {
            success: false,
            message: canBeParent.reason,
            currentRole: currentRole,
            currentRoleInfo: getRoleInfo(currentRole)
          };
        }
      }

      // 执行角色更新
      updateData.role = newRole;
      updateData.role_update_time = now;

      // 如果切换到普通用户，清空绑定码
      if (newRole === ROLE.NORMAL && primary && primary.bind_code) {
        updateData.bind_code = null;
        updateData.bind_code_update_time = null;
      }
    }

    // 执行 upsert
    const upsertRes = await upsertUserProfile(db, openid, updateData, { 
      now, 
      softDedup: true,
      skipRoleNormalize: true // 已经在上层标准化过了
    });

    // 获取更新后的用户信息
    const updatedUsers = await findUsersByOpenid(db, openid);
    const updatedUser = updatedUsers && updatedUsers.length ? updatedUsers[0] : null;
    const finalRole = normalizeRole(updatedUser ? updatedUser.role : currentRole);

    return {
      success: true,
      message: '更新成功',
      data: {
        user: updatedUser,
        role: finalRole,
        roleInfo: getRoleInfo(finalRole),
        updated: 1,
        userId: upsertRes.userId,
        deduped: upsertRes.dedupedCount || 0,
        created: !!upsertRes.created
      }
    };
  } catch (err) {
    console.error('updateMyProfile error:', err);
    return { success: false, message: err.message || '未知错误' };
  }
};
