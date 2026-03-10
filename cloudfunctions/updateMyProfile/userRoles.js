/**
 * 用户角色定义
 */
const ROLE = {
  NORMAL: 'normal',
  PARENT: 'parent',
  CHILD: 'child'
};

const ROLE_DESCRIPTION = {
  [ROLE.NORMAL]: '普通用户',
  [ROLE.PARENT]: '家长',
  [ROLE.CHILD]: '孩子'
};

const ROLE_ICON = {
  [ROLE.NORMAL]: '👤',
  [ROLE.PARENT]: '👨‍👩‍👧',
  [ROLE.CHILD]: '👶'
};

const ROLE_PERMISSIONS = {
  [ROLE.NORMAL]: {
    canBindAsParent: true,
    canBindAsChild: true,
    canGenerateBindCode: true,
    hasBindCode: false
  },
  [ROLE.PARENT]: {
    canBindAsParent: true,
    canBindAsChild: false,
    canGenerateBindCode: true,
    hasBindCode: true
  },
  [ROLE.CHILD]: {
    canBindAsParent: false,
    canBindAsChild: true,
    canGenerateBindCode: false,
    hasBindCode: false
  }
};

function getRoleInfo(role) {
  const normalizedRole = role || ROLE.NORMAL;
  return {
    role: normalizedRole,
    description: ROLE_DESCRIPTION[normalizedRole] || ROLE_DESCRIPTION[ROLE.NORMAL],
    icon: ROLE_ICON[normalizedRole] || ROLE_ICON[ROLE.NORMAL],
    permissions: ROLE_PERMISSIONS[normalizedRole] || ROLE_PERMISSIONS[ROLE.NORMAL]
  };
}

function isValidRole(role) {
  return Object.values(ROLE).includes(role);
}

function getRoleByDescription(description) {
  for (const [role, desc] of Object.entries(ROLE_DESCRIPTION)) {
    if (desc === description) return role;
  }
  return ROLE.NORMAL;
}

function canGenerateBindCode(role) {
  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[ROLE.NORMAL];
  return permissions.canGenerateBindCode;
}

function canBindAsParent(role, parentCount = 0) {
  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[ROLE.NORMAL];
  if (!permissions.canBindAsParent) {
    return { allowed: false, reason: '当前角色不能绑定为家长' };
  }
  if (role === ROLE.CHILD && parentCount > 0) {
    return { allowed: false, reason: '已绑定家长，无法切换为家长角色' };
  }
  return { allowed: true, reason: '' };
}

function canBindAsChild(role) {
  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[ROLE.NORMAL];
  if (!permissions.canBindAsChild) {
    return { allowed: false, reason: '当前角色不能绑定为孩子' };
  }
  return { allowed: true, reason: '' };
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
