/**
 * 用户角色定义
 * 
 * 三种角色：
 * 1. normal - 普通用户：未绑定关系的独立用户
 * 2. parent - 家长：有绑定码，可绑定多个孩子
 * 3. child - 孩子：通过绑定码绑定到家长
 */

// 角色枚举
const ROLE = {
  NORMAL: 'normal',   // 普通用户
  PARENT: 'parent',   // 家长
  CHILD: 'child'      // 孩子
};

// 角色描述
const ROLE_DESCRIPTION = {
  [ROLE.NORMAL]: '普通用户',
  [ROLE.PARENT]: '家长',
  [ROLE.CHILD]: '孩子'
};

// 角色图标
const ROLE_ICON = {
  [ROLE.NORMAL]: '👤',
  [ROLE.PARENT]: '👨‍👩‍👧',
  [ROLE.CHILD]: '👶'
};

// 角色权限配置
const ROLE_PERMISSIONS = {
  [ROLE.NORMAL]: {
    canBindAsParent: true,    // 可以成为家长
    canBindAsChild: true,     // 可以成为孩子
    canGenerateBindCode: true, // 可以生成绑定码
    hasBindCode: false        // 默认没有绑定码
  },
  [ROLE.PARENT]: {
    canBindAsParent: true,
    canBindAsChild: false,    // 家长不能成为孩子
    canGenerateBindCode: true,
    hasBindCode: true
  },
  [ROLE.CHILD]: {
    canBindAsParent: false,   // 孩子不能成为家长（除非解绑）
    canBindAsChild: true,
    canGenerateBindCode: false, // 孩子不能生成绑定码
    hasBindCode: false
  }
};

/**
 * 获取角色信息
 * @param {string} role - 角色标识
 * @returns {object} 角色信息对象
 */
function getRoleInfo(role) {
  const normalizedRole = role || ROLE.NORMAL;
  return {
    role: normalizedRole,
    description: ROLE_DESCRIPTION[normalizedRole] || ROLE_DESCRIPTION[ROLE.NORMAL],
    icon: ROLE_ICON[normalizedRole] || ROLE_ICON[ROLE.NORMAL],
    permissions: ROLE_PERMISSIONS[normalizedRole] || ROLE_PERMISSIONS[ROLE.NORMAL]
  };
}

/**
 * 验证角色是否有效
 * @param {string} role - 角色标识
 * @returns {boolean} 是否有效
 */
function isValidRole(role) {
  return Object.values(ROLE).includes(role);
}

/**
 * 根据描述获取角色
 * @param {string} description - 角色描述
 * @returns {string} 角色标识
 */
function getRoleByDescription(description) {
  for (const [role, desc] of Object.entries(ROLE_DESCRIPTION)) {
    if (desc === description) return role;
  }
  return ROLE.NORMAL;
}

/**
 * 检查角色是否可以生成绑定码
 * @param {string} role - 角色标识
 * @returns {boolean} 是否可以生成
 */
function canGenerateBindCode(role) {
  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[ROLE.NORMAL];
  return permissions.canGenerateBindCode;
}

/**
 * 检查角色是否可以绑定为家长
 * @param {string} role - 当前角色
 * @param {number} parentCount - 当前绑定的家长数量
 * @returns {object} { allowed: boolean, reason: string }
 */
function canBindAsParent(role, parentCount = 0) {
  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[ROLE.NORMAL];
  
  if (!permissions.canBindAsParent) {
    return {
      allowed: false,
      reason: '当前角色不能绑定为家长'
    };
  }
  
  // 如果孩子角色且已绑定家长，则不允许
  if (role === ROLE.CHILD && parentCount > 0) {
    return {
      allowed: false,
      reason: '已绑定家长，无法切换为家长角色'
    };
  }
  
  return {
    allowed: true,
    reason: ''
  };
}

/**
 * 检查角色是否可以绑定为孩子
 * @param {string} role - 当前角色
 * @returns {object} { allowed: boolean, reason: string }
 */
function canBindAsChild(role) {
  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[ROLE.NORMAL];
  
  if (!permissions.canBindAsChild) {
    return {
      allowed: false,
      reason: '当前角色不能绑定为孩子'
    };
  }
  
  return {
    allowed: true,
    reason: ''
  };
}

module.exports = {
  ROLE,
  ROLE_DESCRIPTION,
  ROLE_ICON,
  ROLE_PERMISSIONS,
  getRoleInfo,
  isValidRole,
  getRoleByDescription,
  canGenerateBindCode,
  canBindAsParent,
  canBindAsChild
};
