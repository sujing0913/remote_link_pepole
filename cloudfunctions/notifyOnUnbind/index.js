// cloudfunctions/notifyOnUnbind/index.js
// 解绑通知（订阅消息）
// 入参：toOpenId, fromOpenId, childOpenId
// 说明：需要你在小程序后台配置订阅消息模板，并把 templateId 填入环境变量或这里的常量。
// 目前做最小可用：如果没有配置 templateId，则直接返回 success=true（不报错，避免影响主流程）。

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const TEMPLATE_ID = process.env.UNBIND_TEMPLATE_ID || ''; // 建议在云函数环境变量配置

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const operatorOpenId = wxContext.OPENID;

  const { toOpenId, fromOpenId, childOpenId } = event || {};
  if (!toOpenId) return { success: false, message: '缺少 toOpenId' };

  try {
    if (!TEMPLATE_ID) {
      // 未配置模板 ID，直接跳过（最简上线策略）
      return { success: true, skipped: true, message: '未配置 UNBIND_TEMPLATE_ID，已跳过发送' };
    }

    // 尝试获取昵称
    const [fromUser, childUser] = await Promise.all([
      fromOpenId
        ? db.collection('users').where({ openid: fromOpenId }).limit(1).get()
        : Promise.resolve({ data: [] }),
      childOpenId
        ? db.collection('users').where({ openid: childOpenId }).limit(1).get()
        : Promise.resolve({ data: [] })
    ]);

    const fromName = (fromUser.data[0] && (fromUser.data[0].name || fromUser.data[0].nickName)) || '对方';
    const childName = (childUser.data[0] && (childUser.data[0].name || childUser.data[0].nickName)) || '孩子';

    // 订阅消息：需要确保接收方此前已授权对应模板（前端 requestSubscribeMessage）
    const sendRes = await cloud.openapi.subscribeMessage.send({
      touser: toOpenId,
      templateId: TEMPLATE_ID,
      miniprogramState: 'formal',
      page: 'pages/me/me',
      data: {
        thing1: { value: `${fromName}已解绑绑定关系` }, // 具体字段名需与你的模板匹配
        thing2: { value: `涉及：${childName}` }
      }
    });

    return { success: true, sendRes };
  } catch (err) {
    console.error('notifyOnUnbind error:', err);
    // 通知失败不影响主流程
    return { success: true, failed: true, message: err.message || err.errMsg || '发送失败' };
  }
};
