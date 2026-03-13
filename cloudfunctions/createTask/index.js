const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { 
    parentId, 
    childOpenId, 
    childName, 
    subject, 
    content, 
    mediaType, 
    mediaUrl, 
    deadline 
  } = event || {}
  
  try {
    // 验证必填参数
    if (!childOpenId) {
      return {
        success: false,
        errMsg: '孩子信息不能为空'
      }
    }
    
    if (!content && !mediaUrl) {
      return {
        success: false,
        errMsg: '任务内容或媒体文件不能为空'
      }
    }
    
    // 创建任务记录
    const taskData = {
      parentId: parentId || wxContext.OPENID,
      childOpenId: childOpenId,
      childName: childName || '未知',
      subject: subject || '其他',
      content: content || '',
      mediaType: mediaType || '',
      mediaUrl: mediaUrl || '',
      deadline: deadline ? new Date(deadline) : null,
      status: 'pending',
      createTime: db.serverDate(),
      completedAt: null,
      createdBy: wxContext.OPENID,
      updatedBy: wxContext.OPENID,
      updatedAt: db.serverDate()
    }
    
    const result = await db.collection('tasks').add({
      data: taskData
    })
    
    return {
      success: true,
      taskId: result._id,
      message: '任务创建成功'
    }
  } catch (err) {
    console.error('创建任务失败', err)
    return {
      success: false,
      errMsg: err.message
    }
  }
}
