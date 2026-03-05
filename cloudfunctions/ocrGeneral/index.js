const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 通用 OCR 识别云函数
 * 支持识别图片中的文字内容，返回完整文本和结构化数据
 * 
 * 输入参数:
 * - fileID: 云存储文件 ID (推荐)
 * - imgUrl: 图片 URL (可选，与 fileID 二选一)
 * - detectType: 识别类型，可选值：'basic'(默认), 'accurate'(高精度)
 * - returnWords: 是否返回逐行识别结果，默认 true
 */
exports.main = async (event, context) => {
  console.log('===== OCR 云函数被调用 =====');
  console.log('输入参数:', JSON.stringify({
    fileID: event.fileID,
    imgUrl: event.imgUrl ? 'provided' : 'not provided',
    detectType: event.detectType || 'basic',
    returnWords: event.returnWords !== false
  }));
  
  const { fileID, imgUrl: inputImgUrl, detectType = 'basic', returnWords = true } = event;
  
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
    // 如果提供的是 fileID，转换为临时 URL
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
    
    // 调用微信 OCR 接口 - 使用 comm 通用印刷体识别接口
    console.log('正在调用微信 OCR 接口 (ocr.comm)...');
    console.log('识别类型:', detectType);
    
    const ocrResult = await cloud.openapi.ocr.comm({
      imgUrl: imageUrl,
      // 可选参数：识别类型 'NORMAL'(默认) 或 'ACCURATE'(高精度)
      detectType: detectType === 'accurate' ? 'ACCURATE' : 'NORMAL',
      // 是否返回逐行识别结果
      returnWords: returnWords
    });
    
    console.log('微信 OCR 响应:', JSON.stringify(ocrResult));
    
    // 处理返回结果
    return processOcrResult(ocrResult);
    
  } catch (err) {
    console.error('===== OCR 识别失败 =====');
    console.error('错误类型:', err.name);
    console.error('错误:', err.message);
    console.error('错误码:', err.errCode);
    console.error('错误信息:', err.errMsg);
    
    // 错误分类处理
    let errorCode = 'OCR_FAILED';
    let errorMessage = 'OCR 识别失败：' + err.message;
    
    if (err.errCode) {
      switch (err.errCode) {
        case 400:
          errorCode = 'INVALID_IMAGE';
          errorMessage = '图片格式或大小不符合要求';
          break;
        case 413:
          errorCode = 'IMAGE_TOO_LARGE';
          errorMessage = '图片大小超过限制';
          break;
        case 415:
          errorCode = 'UNSUPPORTED_FORMAT';
          errorMessage = '不支持的图片格式';
          break;
        case 430:
          errorCode = 'ACCESS_DENIED';
          errorMessage = '权限不足，请检查云函数权限';
          break;
        case 434:
          errorCode = 'RATE_LIMITED';
          errorMessage = '请求过于频繁，请稍后重试';
          break;
        default:
          errorMessage = `OCR 识别失败 (错误码：${err.errCode})`;
      }
    }
    
    return {
      success: false,
      error: errorMessage,
      errorCode: errorCode,
      rawError: {
        name: err.name,
        message: err.message,
        errCode: err.errCode,
        errMsg: err.errMsg
      }
    };
  }
};

/**
 * 处理 OCR 识别结果
 * @param {Object} ocrResult - 微信 OCR 返回的原始结果
 * @returns {Object} 处理后的结果
 */
function processOcrResult(ocrResult) {
  console.log('处理 OCR 结果...');
  
  // 情况 1: 返回的是 result 数组 (标准格式)
  if (ocrResult.result && Array.isArray(ocrResult.result)) {
    const items = ocrResult.result;
    
    // 提取所有识别到的文字
    const fullText = items
      .map(item => item.text || '')
      .filter(t => t.trim())
      .join('\n');
    
    // 计算置信度平均值
    const avgConfidence = items.length > 0
      ? items.reduce((sum, item) => sum + (item.confidence || 0), 0) / items.length
      : 0;
    
    console.log('识别到', items.length, '行文字');
    console.log('完整识别文字:', fullText.substring(0, 100) + (fullText.length > 100 ? '...' : ''));
    
    return {
      success: true,
      fullText: fullText,
      items: items,
      count: items.length,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      rawResult: ocrResult
    };
  }
  
  // 情况 2: 返回的是 text 字符串
  if (ocrResult.text) {
    console.log('使用 text 字段:', ocrResult.text.substring(0, 100) + '...');
    return {
      success: true,
      fullText: ocrResult.text,
      items: [{ text: ocrResult.text, confidence: 1.0 }],
      count: 1,
      avgConfidence: 1.0,
      rawResult: ocrResult
    };
  }
  
  // 情况 3: 未识别到文字
  console.log('OCR 未识别到文字');
  return {
    success: true,
    fullText: '',
    items: [],
    count: 0,
    avgConfidence: 0,
    message: '图片中未识别到文字',
    rawResult: ocrResult
  };
}
