const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 豆包 AI 多模态云函数
 * 使用豆包 Vision 模型识别图片内容，分析学习打卡任务
 * 
 * 输入参数:
 * - fileID: 云存储文件 ID (推荐)
 * - imgUrl: 图片 URL (可选，与 fileID 二选一)
 * - userPrompt: 用户自定义提示词 (可选)
 */
exports.main = async (event, context) => {
  console.log('===== 豆包 AI 云函数被调用 =====');
  console.log('输入参数:', JSON.stringify({
    fileID: event.fileID,
    imgUrl: event.imgUrl ? 'provided' : 'not provided',
    userPrompt: event.userPrompt || 'default'
  }));

  const { fileID, imgUrl: inputImgUrl, userPrompt } = event;

  // 参数校验
  if (!fileID && !inputImgUrl) {
    console.error('缺少文件 ID 或图片 URL');
    return {
      success: false,
      error: '缺少必要参数：需要提供 fileID 或 imgUrl',
      errorCode: 'MISSING_INPUT'
    };
  }

  let imageUrl = inputImgUrl;

  try {
    // 1. 如果提供的是 fileID，转换为临时 URL
    if (fileID && !inputImgUrl) {
      console.log('正在从 fileID 获取临时 URL...');
      const tempUrlResult = await cloud.getTempFileURL({ fileList: [fileID] });

      if (!tempUrlResult.fileList || !tempUrlResult.fileList[0]) {
        console.error('获取文件 URL 失败');
        return {
          success: false,
          error: '获取文件 URL 失败',
          errorCode: 'GET_TEMP_URL_FAILED'
        };
      }

      imageUrl = tempUrlResult.fileList[0].tempFileURL;
      console.log('获取到临时 URL:', imageUrl.substring(0, 50) + '...');
    }

    // 2. 构建提示词
    const defaultPrompt = `你是一位严格的老师，请识别图片中的学习打卡内容。请按以下 JSON 格式回复：
{
  "recognized_content": "识别到的打卡内容（如：1+1=3, 2+2=4, 3+3=7）",
  "total_questions": 题目总数量（数字，如 5）,
  "correct_questions": 正确题目数量（数字，如 3）,
  "score": 得分（数字，计算公式：correct_questions/total_questions*10，保留整数）,
  "judgment": "对打卡内容进行判断（如：共 5 道题，正确 3 道，错误 2 道，需要加强练习）",
  "suggestion": "具体的学习建议",
  "check_results": [
    {"question": "1+1=3", "correct_answer": "1+1=2", "is_correct": false},
    {"question": "2+2=4", "correct_answer": "2+2=4", "is_correct": true},
    {"question": "3+3=7", "correct_answer": "3+3=6", "is_correct": false}
  ]
}

注意：
1. 请仔细识别图片中的每一道题目
2. 准确判断每道题的对错
3. score = Math.round(correct_questions / total_questions * 10)
4. 如果只有 1 道题，正确得 10 分，错误得 0 分
5. check_results 数组包含每道题的详细检查结果`;
    const prompt = userPrompt || defaultPrompt;

    // 3. 调用豆包 API (使用新的 Responses API)
    console.log('正在调用豆包 API...');
    const apiKey = process.env.ARK_API_KEY || process.env.DOUBAO_API_KEY;
    const baseUrl = process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
    const model = process.env.DOUBAO_MODEL || 'ep-20260226160039-fv5qm';

    console.log('API 配置:', {
      baseUrl: baseUrl,
      model: model,
      apiKeyProvided: !!apiKey
    });

    // 创建 HTTPS Agent，禁用证书验证以解决 SSL 问题
    const https = require('https');
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });

    const response = await axios.post(
      `${baseUrl}/responses`,
      {
        model: model,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_image",
                image_url: imageUrl
              },
              {
                type: "input_text",
                text: prompt
              }
            ]
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        httpsAgent: httpsAgent,
        timeout: 30000 // 30 秒超时
      }
    );

    console.log('豆包 API 响应状态:', response.status);
    console.log('豆包 API 响应数据:', JSON.stringify(response.data));

    // 4. 解析 AI 返回的结果
    // 新的 Responses API 返回格式：
    // response.data.output 是一个数组，包含 reasoning 和 message 两种类型
    // 我们需要从 type 为 "message" 的元素中获取 content[0].text
    let aiMessage = '';
    
    console.log('响应 output 数组:', JSON.stringify(response.data.output));
    
    if (response.data && response.data.output && Array.isArray(response.data.output)) {
      // 查找 type 为 "message" 的元素
      const messageElement = response.data.output.find(item => item.type === 'message');
      if (messageElement && messageElement.content && Array.isArray(messageElement.content)) {
        const textContent = messageElement.content.find(item => item.type === 'output_text');
        if (textContent && textContent.text) {
          aiMessage = textContent.text;
        }
      }
      
      // 如果没有找到 output_text，尝试从 reasoning 的 summary 中提取
      if (!aiMessage) {
        const reasoningElement = response.data.output.find(item => item.type === 'reasoning');
        if (reasoningElement && reasoningElement.summary && Array.isArray(reasoningElement.summary)) {
          const summaryText = reasoningElement.summary.find(item => item.type === 'summary_text');
          if (summaryText && summaryText.text) {
            console.log('从 reasoning summary 中提取内容');
            // 从推理内容中尝试提取 JSON
            const jsonMatch = summaryText.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              aiMessage = jsonMatch[0];
            }
          }
        }
      }
    }
    
    // 兼容旧的 API 格式
    if (!aiMessage && response.data && response.data.choices && response.data.choices[0]) {
      aiMessage = response.data.choices[0].message.content;
    }
    
    console.log('AI 回复内容:', aiMessage);

    let result;
    try {
      // 尝试直接解析 JSON
      result = JSON.parse(aiMessage);
      
      // 检查是否有嵌套的 JSON 字符串（recognized_content 字段可能包含完整 JSON）
      // 这种情况发生在 AI 把整个 JSON 作为字符串返回到 recognized_content 字段
      if (result.recognized_content && typeof result.recognized_content === 'string') {
        const nestedJsonMatch = result.recognized_content.match(/\{[\s\S]*\}/);
        if (nestedJsonMatch) {
          try {
            const nestedResult = JSON.parse(nestedJsonMatch[0]);
            console.log('检测到嵌套 JSON，使用嵌套的数据');
            // 合并数据，优先使用嵌套 JSON 中的值
            result = {
              ...nestedResult,
              // 保留原始识别内容
              raw_recognized_content: result.recognized_content
            };
          } catch (nestedError) {
            console.log('嵌套 JSON 解析失败，继续使用原数据');
          }
        }
      }
    } catch (parseError) {
      console.error('直接解析 JSON 失败，尝试提取 JSON 内容:', parseError);
      // 尝试从文本中提取 JSON 部分
      const jsonMatch = aiMessage.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0]);
          console.log('从文本中提取并解析 JSON 成功');
        } catch (extractError) {
          console.error('提取后解析仍失败:', extractError);
          result = {
            is_correct: false,
            analysis: 'AI 返回的数据格式有误，原始内容：' + aiMessage.substring(0, 500) + '...',
            suggestion: '请重试或联系管理员',
            score: 0,
            total_questions: 0,
            correct_questions: 0,
            recognized_content: aiMessage.substring(0, 200),
            check_results: []
          };
        }
      } else {
        result = {
          is_correct: false,
          analysis: 'AI 返回的数据格式有误，原始内容：' + aiMessage.substring(0, 500) + '...',
          suggestion: '请重试或联系管理员',
          score: 0,
          total_questions: 0,
          correct_questions: 0,
          recognized_content: aiMessage.substring(0, 200),
          check_results: []
        };
      }
    }

    // 5. 返回结果给小程序前端
    return {
      success: true,
      code: 0,
      data: result,
      message: 'success',
      usage: response.data.usage || {}
    };

  } catch (err) {
    console.error('===== 云函数调用失败 =====');
    console.error('错误类型:', err.name);
    console.error('错误:', err.message);

    // 错误分类处理
    let errorCode = 'AI_FAILED';
    let errorMessage = 'AI 识别失败：' + err.message;

    if (err.response) {
      // API 返回了错误响应
      console.error('API 错误响应:', err.response.status, err.response.data);
      switch (err.response.status) {
        case 400:
          errorCode = 'INVALID_REQUEST';
          errorMessage = '请求参数错误';
          break;
        case 401:
          errorCode = 'UNAUTHORIZED';
          errorMessage = 'API Key 无效或已过期';
          break;
        case 403:
          errorCode = 'FORBIDDEN';
          errorMessage = '权限不足，请检查 API Key 权限';
          break;
        case 429:
          errorCode = 'RATE_LIMITED';
          errorMessage = '请求过于频繁，请稍后重试';
          break;
        case 500:
          errorCode = 'SERVER_ERROR';
          errorMessage = '服务器内部错误';
          break;
        default:
          errorMessage = `API 调用失败 (状态码：${err.response.status})`;
      }
    } else if (err.code === 'ECONNABORTED') {
      errorCode = 'TIMEOUT';
      errorMessage = '请求超时，请检查网络连接';
    }

    return {
      success: false,
      error: errorMessage,
      errorCode: errorCode,
      rawError: {
        name: err.name,
        message: err.message
      }
    };
  }
};

/**
 * 下载图片并返回 Buffer
 * @param {string} url - 图片 URL
 * @returns {Promise<Buffer>} 图片 Buffer
 */
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    
    const https = require('https');
    const http = require('http');
    
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`下载图片失败，状态码：${res.statusCode}`));
        return;
      }
      
      res.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      res.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      
      res.on('error', (err) => {
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}
