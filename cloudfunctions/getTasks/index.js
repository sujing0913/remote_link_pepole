const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { childOpenId, subject, year, month, limit = 100 } = event || {}
  
  try {
    // 构建查询条件
    const query = {}
    
    if (childOpenId) {
      query.childOpenId = childOpenId
    }
    
    if (subject) {
      query.subject = subject
    }
    
    // 按年月筛选
    if (year && month) {
      const startDate = new Date(`${year}-${month}-01 00:00:00`)
      const endDate = new Date(startDate)
      endDate.setMonth(endDate.getMonth() + 1)
      query.createTime = {
        $gte: startDate,
        $lt: endDate
      }
    } else if (year) {
      const startDate = new Date(`${year}-01-01 00:00:00`)
      const endDate = new Date(`${parseInt(year) + 1}-01-01 00:00:00`)
      query.createTime = {
        $gte: startDate,
        $lt: endDate
      }
    }
    
    // 查询任务列表，按创建时间倒序
    const res = await db.collection('tasks')
      .where(query)
      .orderBy('createTime', 'desc')
      .limit(limit)
      .get()
    
    // 处理任务数据，格式化日期
    const tasks = res.data.map(task => {
      // 格式化创建日期
      const createTime = task.createTime
      let createDate = ''
      if (createTime instanceof Date) {
        const date = createTime
        createDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      } else if (createTime && createTime.$date) {
        const date = new Date(createTime.$date)
        createDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      }
      
      // 格式化完成日期
      let completedDate = ''
      let completedAt = null
      if (task.completedAt) {
        if (task.completedAt instanceof Date) {
          const date = task.completedAt
          completedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
          completedAt = task.completedAt
        } else if (task.completedAt.$date) {
          const date = new Date(task.completedAt.$date)
          completedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
          completedAt = task.completedAt
        }
      }
      
      // 格式化截止日期（兼容老字段 deadline）
      let deadline = ''
      if (task.deadline) {
        if (task.deadline instanceof Date) {
          const date = task.deadline
          deadline = `${date.getMonth() + 1}/${date.getDate()}`
        } else if (task.deadline.$date) {
          const date = new Date(task.deadline.$date)
          deadline = `${date.getMonth() + 1}/${date.getDate()}`
        }
      }
      
      // 格式化开始日期和结束日期（任务周期）
      let startDate = ''
      let endDate = ''
      let periodText = ''
      
      // 处理开始日期
      if (task.startDate) {
        if (task.startDate instanceof Date) {
          const date = task.startDate
          startDate = `${date.getMonth() + 1}/${date.getDate()}`
        } else if (task.startDate.$date) {
          const date = new Date(task.startDate.$date)
          startDate = `${date.getMonth() + 1}/${date.getDate()}`
        }
      }
      
      // 处理结束日期
      if (task.endDate) {
        if (task.endDate instanceof Date) {
          const date = task.endDate
          endDate = `${date.getMonth() + 1}/${date.getDate()}`
        } else if (task.endDate.$date) {
          const date = new Date(task.endDate.$date)
          endDate = `${date.getMonth() + 1}/${date.getDate()}`
        }
      }
      
      // 兼容老数据：如果只有 deadline，则开始日期=结束日期=deadline
      if (!startDate && !endDate && deadline) {
        startDate = deadline
        endDate = deadline
      }
      
      // 构建周期显示文本
      if (startDate && endDate) {
        periodText = `${startDate} ~ ${endDate}`
      } else if (startDate) {
        periodText = `从 ${startDate}`
      } else if (endDate) {
        periodText = `至 ${endDate}`
      }
      
      let statusText = '待完成'
      let statusClass = 'status-pending'
      if (task.status === 'completed') {
        statusText = '已完成'
        statusClass = 'status-completed'
      } else if (task.status === 'in_progress') {
        statusText = '进行中'
        statusClass = 'status-in-progress'
      }
      
      return {
        ...task,
        createDate,
        completedDate,
        completedAt,
        deadline,
        startDate,
        endDate,
        periodText,
        hasMedia: !!task.mediaUrl,
        statusText,
        statusClass
      }
    })
    
    return {
      success: true,
      data: tasks,
      count: tasks.length
    }
  } catch (err) {
    console.error('获取任务列表失败', err)
    return {
      success: false,
      errMsg: err.message,
      data: []
    }
  }
}
