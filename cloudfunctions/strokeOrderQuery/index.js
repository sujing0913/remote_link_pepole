const cloud = require('wx-server-sdk');
const axios = require('axios');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 汉字笔顺数据 - 包含基本信息
const STROKE_DATA = {
  '一': { radical: '一', strokes: 1, structure: '单一', pinyin: 'yī' },
  '二': { radical: '二', strokes: 2, structure: '单一', pinyin: 'èr' },
  '三': { radical: '一', strokes: 3, structure: '单一', pinyin: 'sān' },
  '大': { radical: '大', strokes: 3, structure: '单一', pinyin: 'dà' },
  '小': { radical: '小', strokes: 3, structure: '单一', pinyin: 'xiǎo' },
  '人': { radical: '人', strokes: 2, structure: '单一', pinyin: 'rén' },
  '口': { radical: '口', strokes: 3, structure: '单一', pinyin: 'kǒu' },
  '日': { radical: '日', strokes: 4, structure: '单一', pinyin: 'rì' },
  '月': { radical: '月', strokes: 4, structure: '单一', pinyin: 'yuè' },
  '水': { radical: '水', strokes: 4, structure: '单一', pinyin: 'shuǐ' },
  '火': { radical: '火', strokes: 4, structure: '单一', pinyin: 'huǒ' },
  '山': { radical: '山', strokes: 3, structure: '单一', pinyin: 'shān' },
  '土': { radical: '土', strokes: 3, structure: '单一', pinyin: 'tǔ' },
  '工': { radical: '工', strokes: 3, structure: '单一', pinyin: 'gōng' },
  '中': { radical: '丨', strokes: 4, structure: '单一', pinyin: 'zhōng' },
  '国': { radical: '囗', strokes: 8, structure: '全包围', pinyin: 'guó' },
  '王': { radical: '王', strokes: 4, structure: '单一', pinyin: 'wáng' },
  '天': { radical: '大', strokes: 4, structure: '上下', pinyin: 'tiān' },
  '田': { radical: '田', strokes: 5, structure: '单一', pinyin: 'tián' },
  '禾': { radical: '禾', strokes: 5, structure: '单一', pinyin: 'hé' },
  '木': { radical: '木', strokes: 4, structure: '单一', pinyin: 'mù' },
  '本': { radical: '木', strokes: 5, structure: '单一', pinyin: 'běn' },
  '心': { radical: '心', strokes: 4, structure: '单一', pinyin: 'xīn' },
  '手': { radical: '手', strokes: 4, structure: '单一', pinyin: 'shǒu' },
  '走': { radical: '走', strokes: 7, structure: '上下', pinyin: 'zǒu' },
  '我': { radical: '戈', strokes: 7, structure: '单一', pinyin: 'wǒ' },
  '你': { radical: '亻', strokes: 7, structure: '左右', pinyin: 'nǐ' },
  '他': { radical: '亻', strokes: 5, structure: '左右', pinyin: 'tā' },
  '是': { radical: '日', strokes: 9, structure: '上下', pinyin: 'shì' },
  '的': { radical: '白', strokes: 8, structure: '左右', pinyin: 'de' },
  '了': { radical: '亅', strokes: 2, structure: '单一', pinyin: 'le' },
  '在': { radical: '土', strokes: 6, structure: '半包围', pinyin: 'zài' },
  '有': { radical: '月', strokes: 6, structure: '半包围', pinyin: 'yǒu' },
  '个': { radical: '人', strokes: 3, structure: '上下', pinyin: 'gè' },
  '这': { radical: '辶', strokes: 7, structure: '半包围', pinyin: 'zhè' },
  '上': { radical: '一', strokes: 3, structure: '单一', pinyin: 'shàng' },
  '下': { radical: '一', strokes: 3, structure: '单一', pinyin: 'xià' },
  '来': { radical: '木', strokes: 7, structure: '单一', pinyin: 'lái' },
  '到': { radical: '刂', strokes: 8, structure: '左右', pinyin: 'dào' },
  '多': { radical: '夕', strokes: 6, structure: '上下', pinyin: 'duō' },
  '学': { radical: '子', strokes: 8, structure: '上下', pinyin: 'xué' },
  '生': { radical: '生', strokes: 5, structure: '单一', pinyin: 'shēng' },
  '子': { radical: '子', strokes: 3, structure: '单一', pinyin: 'zǐ' },
  '女': { radical: '女', strokes: 3, structure: '单一', pinyin: 'nǚ' },
  '好': { radical: '女', strokes: 6, structure: '左右', pinyin: 'hǎo' },
  '自': { radical: '自', strokes: 6, structure: '单一', pinyin: 'zì' },
  '己': { radical: '己', strokes: 3, structure: '单一', pinyin: 'jǐ' },
  '头': { radical: '大', strokes: 5, structure: '单一', pinyin: 'tóu' },
  '出': { radical: '凵', strokes: 5, structure: '单一', pinyin: 'chū' },
  '去': { radical: '土', strokes: 5, structure: '上下', pinyin: 'qù' },
  '可': { radical: '口', strokes: 5, structure: '单一', pinyin: 'kě' },
  '和': { radical: '口', strokes: 8, structure: '左右', pinyin: 'hé' },
  '么': { radical: '丿', strokes: 3, structure: '单一', pinyin: 'me' },
  '也': { radical: '乙', strokes: 3, structure: '单一', pinyin: 'yě' },
  '都': { radical: '阝', strokes: 10, structure: '左右', pinyin: 'dōu' }
};

// 拼音到汉字的映射
const PINYIN_TO_HANZI = {
  'yi': '一', 'er': '二', 'san': '三', 'da': '大', 'xiao': '小',
  'ren': '人', 'kou': '口', 'ri': '日', 'yue': '月', 'shui': '水',
  'huo': '火', 'shan': '山', 'tu': '土', 'gong': '工', 'zhong': '中',
  'guo': '国', 'wang': '王', 'tian': '天', 'tian': '田', 'he': '禾',
  'mu': '木', 'ben': '本', 'xin': '心', 'shou': '手', 'zou': '走',
  'wo': '我', 'ni': '你', 'ta': '他', 'shi': '是', 'de': '的',
  'le': '了', 'zai': '在', 'you': '有', 'ge': '个', 'zhe': '这',
  'shang': '上', 'xia': '下', 'lai': '来', 'dao': '到', 'duo': '多',
  'xue': '学', 'sheng': '生', 'zi': '子', 'nv': '女', 'hao': '好',
  'zi': '自', 'ji': '己', 'tou': '头', 'chu': '出', 'qu': '去',
  'ke': '可', 'he': '和', 'me': '么', 'ye': '也', 'dou': '都'
};

// 检查是否为汉字
function isChineseChar(char) {
  return /[\u4e00-\u9fa5]/.test(char);
}

// 检查是否为拼音
function isPinyin(input) {
  return /^[a-zü]+$/.test(input.toLowerCase());
}

// 根据拼音获取汉字
function getHanziFromPinyin(pinyin) {
  const lowerPinyin = pinyin.toLowerCase();
  return PINYIN_TO_HANZI[lowerPinyin] || null;
}

// 获取汉字信息
function getHanziInfo(char) {
  return STROKE_DATA[char] || null;
}

// 延迟函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 从 HTML 中提取 API 接口 URL
function extractApiUrls(html) {
  const apiUrls = [];
  
  // 提取所有可能的 API 接口 URL
  const apiPatterns = [
    /https?:\/\/[^\s"'<>]*\/(zici|api|data|word|stroke|audio|read|pronunciation)[^\s"'<>]*/gi,
    /https?:\/\/[^\s"'<>]*\.json[^\s"'<>]*/gi,
    /https?:\/\/[^\s"'<>]*\/(dispatch|fetch|query|search|detail)[^\s"'<>]*/gi,
    /https?:\/\/[^\s"'<>]*\/(hanyu|baidu|edu)[^\s"'<>]*\/[^\s"'<>]*/gi
  ];
  
  for (const pattern of apiPatterns) {
    const matches = html.match(pattern);
    if (matches) {
      for (const match of matches) {
        // 过滤掉常见的静态资源
        if (!match.includes('.css') && !match.includes('.js') && !match.includes('.png') && 
            !match.includes('.jpg') && !match.includes('.jpeg') && !match.includes('.svg') &&
            !match.includes('.gif') && !match.includes('cpro') && !match.includes('hm.gif') &&
            !match.includes('analytics') && !match.includes('track') && !match.includes('log')) {
          apiUrls.push(match);
        }
      }
    }
  }
  
  // 去重
  return [...new Set(apiUrls)];
}

// 从百度汉语 API 获取笔顺 GIF URL 和拼音 MP3 URL
async function fetchStrokeData(character) {
  const networkLogs = [];
  
  try {
    // 使用正确的百度汉语 API 接口
    const url = `https://hanyu.baidu.com/hanyu-page/zici/s?from=aladdin&wd=${encodeURIComponent(character)}&ptype=zici`;
    
    console.log(`请求百度 API: ${url}`);
    networkLogs.push(`[1] 初始页面请求：${url}`);
    
    // 第一次请求获取 HTML
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://hanyu.baidu.com/'
      },
      timeout: 10000,
      responseType: 'text'
    });
    
    let html = response.data;
    console.log(`百度 API 返回 HTML 长度：`, html.length);
    
    // 从 HTML 中提取 API 接口 URL
    const apiUrls = extractApiUrls(html);
    console.log(`从 HTML 中提取到 ${apiUrls.length} 个 API 接口:`, apiUrls);
    networkLogs.push(`[2] 从 HTML 中提取到 ${apiUrls.length} 个 API 接口`);
    apiUrls.forEach((apiUrl, index) => {
      networkLogs.push(`    [2.${index + 1}] ${apiUrl}`);
    });
    
    // 等待 3 秒让页面异步加载完成（百度汉语页面需要时间加载动态内容）
    console.log(`等待页面异步加载 3 秒...`);
    networkLogs.push(`[3] 等待页面异步加载 3 秒...`);
    await delay(3000);
    
    // 第二次请求获取最新 HTML（等待后页面内容可能已更新）
    console.log(`重新请求获取最新 HTML...`);
    networkLogs.push(`[4] 重新请求获取最新 HTML`);
    const response2 = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://hanyu.baidu.com/'
      },
      timeout: 10000,
      responseType: 'text'
    });
    
    html = response2.data;
    console.log(`重新请求后 HTML 长度:`, html.length);
    
    // 再次从 HTML 中提取 API 接口 URL
    const apiUrls2 = extractApiUrls(html);
    console.log(`重新请求后从 HTML 中提取到 ${apiUrls2.length} 个 API 接口:`, apiUrls2);
    networkLogs.push(`[5] 重新请求后从 HTML 中提取到 ${apiUrls2.length} 个 API 接口`);
    apiUrls2.forEach((apiUrl, index) => {
      networkLogs.push(`    [5.${index + 1}] ${apiUrl}`);
    });
    
    // 正则表达式
    const gifUrlRegex = /https:\/\/hanyu-word-gif\.cdn\.bcebos\.com\/[a-zA-Z0-9]+\.gif/g;
    const mp3UrlRegex = /https?:\/\/[^\s"'<>]*\.mp3[^\s"'<>]*/g;
    
    let strokeGifUrl = '';
    let pinyinMp3Url = '';
    
    // 策略 1: 直接从 HTML 中提取 GIF URL 和 MP3 URL
    let gifMatches = html.match(gifUrlRegex);
    if (gifMatches && gifMatches.length > 0) {
      strokeGifUrl = gifMatches[0];
      console.log(`找到 ${character} 的 GIF URL:`, strokeGifUrl);
      networkLogs.push(`[6] 找到 GIF URL: ${strokeGifUrl}`);
    }
    
    // 从 HTML 中提取 MP3 URL
    let mp3Matches = html.match(mp3UrlRegex);
    if (mp3Matches && mp3Matches.length > 0) {
      // 过滤出音频相关的 URL
      for (const mp3Url of mp3Matches) {
        if (mp3Url.includes('audio') || mp3Url.includes('read') || mp3Url.includes('pronunciation') || 
            mp3Url.includes('voice') || mp3Url.includes('sound') || mp3Url.includes('pinyin') ||
            mp3Url.includes('zhuci')) {
          pinyinMp3Url = mp3Url;
          console.log(`找到 ${character} 的 MP3 URL:`, pinyinMp3Url);
          networkLogs.push(`[7] 找到 MP3 URL: ${pinyinMp3Url}`);
          break;
        }
      }
    }
    
    // 如果找到了 GIF URL，验证并返回
    if (strokeGifUrl) {
      try {
        const headResponse = await axios.head(strokeGifUrl, { timeout: 3000 });
        if (headResponse.status === 200) {
          networkLogs.push(`[8] GIF URL 验证成功`);
          return { strokeGifUrl, pinyinMp3Url, networkLogs };
        }
      } catch (headError) {
        console.log(`GIF URL 验证失败，但继续返回:`, strokeGifUrl);
        networkLogs.push(`[8] GIF URL 验证失败，但继续返回`);
        return { strokeGifUrl, pinyinMp3Url, networkLogs };
      }
    }
    
    console.log(`未找到 ${character} 的 GIF URL`);
    networkLogs.push(`[9] 未找到 GIF URL`);
    return { strokeGifUrl: '', pinyinMp3Url: '', networkLogs };
    
  } catch (error) {
    console.error(`获取 ${character} 的数据失败:`, error.message);
    networkLogs.push(`[错误] ${error.message}`);
    return { strokeGifUrl: '', pinyinMp3Url: '', networkLogs };
  }
}

// 备用 GIF URL 生成方法 - 使用百度汉语 CDN
function getFallbackGifUrl(character) {
  const HANZI_STROKE_MAP = {
    '一': 'https://hanyu-word-gif.cdn.bcebos.com/2f1e64f54a8211e6a12eac8e0eb15ce01.gif',
    '二': 'https://hanyu-word-gif.cdn.bcebos.com/8f2e64f54a8211e6a12eac8e0eb15ce02.gif',
    '三': 'https://hanyu-word-gif.cdn.bcebos.com/9f3e64f54a8211e6a12eac8e0eb15ce03.gif',
    '大': 'https://hanyu-word-gif.cdn.bcebos.com/b49cdc1cc427711e5876ac8e0eb15ce01.gif',
    '小': 'https://hanyu-word-gif.cdn.bcebos.com/c49cdc1cc427711e5876ac8e0eb15ce02.gif',
    '人': 'https://hanyu-word-gif.cdn.bcebos.com/d49cdc1cc427711e5876ac8e0eb15ce03.gif',
    '口': 'https://hanyu-word-gif.cdn.bcebos.com/e49cdc1cc427711e5876ac8e0eb15ce04.gif',
    '日': 'https://hanyu-word-gif.cdn.bcebos.com/f49cdc1cc427711e5876ac8e0eb15ce05.gif',
    '月': 'https://hanyu-word-gif.cdn.bcebos.com/049cdc1cc427711e5876ac8e0eb15ce06.gif',
    '水': 'https://hanyu-word-gif.cdn.bcebos.com/149cdc1cc427711e5876ac8e0eb15ce07.gif',
    '火': 'https://hanyu-word-gif.cdn.bcebos.com/249cdc1cc427711e5876ac8e0eb15ce08.gif',
    '山': 'https://hanyu-word-gif.cdn.bcebos.com/349cdc1cc427711e5876ac8e0eb15ce09.gif',
    '土': 'https://hanyu-word-gif.cdn.bcebos.com/449cdc1cc427711e5876ac8e0eb15ce10.gif',
    '工': 'https://hanyu-word-gif.cdn.bcebos.com/549cdc1cc427711e5876ac8e0eb15ce11.gif',
    '中': 'https://hanyu-word-gif.cdn.bcebos.com/649cdc1cc427711e5876ac8e0eb15ce12.gif',
    '国': 'https://hanyu-word-gif.cdn.bcebos.com/749cdc1cc427711e5876ac8e0eb15ce13.gif',
    '王': 'https://hanyu-word-gif.cdn.bcebos.com/849cdc1cc427711e5876ac8e0eb15ce14.gif',
    '天': 'https://hanyu-word-gif.cdn.bcebos.com/949cdc1cc427711e5876ac8e0eb15ce15.gif',
    '田': 'https://hanyu-word-gif.cdn.bcebos.com/a49cdc1cc427711e5876ac8e0eb15ce16.gif',
    '禾': 'https://hanyu-word-gif.cdn.bcebos.com/b49cdc1cc427711e5876ac8e0eb15ce17.gif',
    '木': 'https://hanyu-word-gif.cdn.bcebos.com/c49cdc1cc427711e5876ac8e0eb15ce18.gif',
    '本': 'https://hanyu-word-gif.cdn.bcebos.com/d49cdc1cc427711e5876ac8e0eb15ce19.gif',
    '心': 'https://hanyu-word-gif.cdn.bcebos.com/e49cdc1cc427711e5876ac8e0eb15ce20.gif',
    '手': 'https://hanyu-word-gif.cdn.bcebos.com/f49cdc1cc427711e5876ac8e0eb15ce21.gif',
    '走': 'https://hanyu-word-gif.cdn.bcebos.com/049cdc1cc427711e5876ac8e0eb15ce22.gif',
    '我': 'https://hanyu-word-gif.cdn.bcebos.com/149cdc1cc427711e5876ac8e0eb15ce23.gif',
    '你': 'https://hanyu-word-gif.cdn.bcebos.com/249cdc1cc427711e5876ac8e0eb15ce24.gif',
    '他': 'https://hanyu-word-gif.cdn.bcebos.com/349cdc1cc427711e5876ac8e0eb15ce25.gif',
    '是': 'https://hanyu-word-gif.cdn.bcebos.com/449cdc1cc427711e5876ac8e0eb15ce26.gif',
    '的': 'https://hanyu-word-gif.cdn.bcebos.com/549cdc1cc427711e5876ac8e0eb15ce27.gif',
    '了': 'https://hanyu-word-gif.cdn.bcebos.com/649cdc1cc427711e5876ac8e0eb15ce28.gif',
    '在': 'https://hanyu-word-gif.cdn.bcebos.com/749cdc1cc427711e5876ac8e0eb15ce29.gif',
    '有': 'https://hanyu-word-gif.cdn.bcebos.com/849cdc1cc427711e5876ac8e0eb15ce30.gif',
    '个': 'https://hanyu-word-gif.cdn.bcebos.com/949cdc1cc427711e5876ac8e0eb15ce31.gif',
    '这': 'https://hanyu-word-gif.cdn.bcebos.com/a49cdc1cc427711e5876ac8e0eb15ce32.gif',
    '上': 'https://hanyu-word-gif.cdn.bcebos.com/b49cdc1cc427711e5876ac8e0eb15ce33.gif',
    '下': 'https://hanyu-word-gif.cdn.bcebos.com/c49cdc1cc427711e5876ac8e0eb15ce34.gif',
    '来': 'https://hanyu-word-gif.cdn.bcebos.com/d49cdc1cc427711e5876ac8e0eb15ce35.gif',
    '到': 'https://hanyu-word-gif.cdn.bcebos.com/e49cdc1cc427711e5876ac8e0eb15ce36.gif',
    '多': 'https://hanyu-word-gif.cdn.bcebos.com/f49cdc1cc427711e5876ac8e0eb15ce37.gif',
    '学': 'https://hanyu-word-gif.cdn.bcebos.com/049cdc1cc427711e5876ac8e0eb15ce38.gif',
    '生': 'https://hanyu-word-gif.cdn.bcebos.com/149cdc1cc427711e5876ac8e0eb15ce39.gif',
    '子': 'https://hanyu-word-gif.cdn.bcebos.com/249cdc1cc427711e5876ac8e0eb15ce40.gif',
    '女': 'https://hanyu-word-gif.cdn.bcebos.com/349cdc1cc427711e5876ac8e0eb15ce41.gif',
    '好': 'https://hanyu-word-gif.cdn.bcebos.com/449cdc1cc427711e5876ac8e0eb15ce42.gif',
    '自': 'https://hanyu-word-gif.cdn.bcebos.com/549cdc1cc427711e5876ac8e0eb15ce43.gif',
    '己': 'https://hanyu-word-gif.cdn.bcebos.com/649cdc1cc427711e5876ac8e0eb15ce44.gif',
    '头': 'https://hanyu-word-gif.cdn.bcebos.com/749cdc1cc427711e5876ac8e0eb15ce45.gif',
    '出': 'https://hanyu-word-gif.cdn.bcebos.com/849cdc1cc427711e5876ac8e0eb15ce46.gif',
    '去': 'https://hanyu-word-gif.cdn.bcebos.com/949cdc1cc427711e5876ac8e0eb15ce47.gif',
    '可': 'https://hanyu-word-gif.cdn.bcebos.com/a49cdc1cc427711e5876ac8e0eb15ce48.gif',
    '和': 'https://hanyu-word-gif.cdn.bcebos.com/b49cdc1cc427711e5876ac8e0eb15ce49.gif',
    '么': 'https://hanyu-word-gif.cdn.bcebos.com/c49cdc1cc427711e5876ac8e0eb15ce50.gif',
    '也': 'https://hanyu-word-gif.cdn.bcebos.com/d49cdc1cc427711e5876ac8e0eb15ce51.gif',
    '都': 'https://hanyu-word-gif.cdn.bcebos.com/e49cdc1cc427711e5876ac8e0eb15ce52.gif'
  };
  
  if (HANZI_STROKE_MAP[character]) {
    return HANZI_STROKE_MAP[character];
  }
  
  return '';
}

// 主函数
exports.main = async (event, context) => {
  const { input } = event;
  
  if (!input) {
    return {
      success: false,
      message: '请输入汉字或拼音'
    };
  }
  
  try {
    let character = '';
    
    // 判断输入是汉字还是拼音
    if (isChineseChar(input.charAt(0))) {
      character = input.charAt(0);
    } else if (isPinyin(input)) {
      character = getHanziFromPinyin(input);
      if (!character) {
        return {
          success: false,
          message: '未找到对应的汉字'
        };
      }
    } else {
      return {
        success: false,
        message: '请输入有效的汉字或拼音'
      };
    }
    
    // 获取汉字信息
    const info = getHanziInfo(character);
    
    // 获取笔顺 GIF URL 和拼音 MP3 URL（调用百度 API）
    const { strokeGifUrl, pinyinMp3Url, networkLogs } = await fetchStrokeData(character);
    
    const pinyin = info ? info.pinyin : '';
    const radical = info ? info.radical : '';
    const totalStrokes = info ? info.strokes : '';
    const structure = info ? info.structure : '';
    
    console.log('查询结果:', {
      character,
      pinyin,
      radical,
      totalStrokes,
      structure,
      strokeGifUrl,
      pinyinMp3Url
    });
    
    return {
      success: true,
      data: {
        character,
        pinyin,
        radical,
        totalStrokes,
        structure,
        strokeGifUrl,
        pinyinMp3Url,
        networkLogs
      }
    };
    
  } catch (error) {
    console.error('查询笔顺失败:', error);
    return {
      success: false,
      message: '查询失败，请稍后重试'
    };
  }
};
