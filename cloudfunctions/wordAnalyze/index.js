/**
 * 云函数：wordAnalyze
 * 输入：{ text: string }
 * 输出：
 * {
 *   success: boolean,
 *   data: {
 *     word: string,
 *     phonetic: string,
 *     meaning: string,
 *     sentences: Array<{en:string, cn:string}>,
 *     memoryTips: string,
 *     pronunciationUrl: string
 *   },
 *   message?: string
 * }
 *
 * 目标：复用 scanWord 页面里调用 doubaoAI 的那套提示词与返回结构（JSON）
 * - 不走图片识别，只基于 text 识别单词
 * - pronunciationUrl 仍使用有道 dictvoice，前端可直接播放
 */

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function pickWord(text) {
  const t = String(text || '').trim();
  const m = t.match(/[A-Za-z]+(?:-[A-Za-z]+)*/);
  return m ? m[0].toLowerCase() : '';
}

function buildPronunciationUrl(word) {
  if (!word) return '';
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=1`;
}

function safeParseJSON(maybe) {
  if (!maybe) return null;
  if (typeof maybe === 'object') return maybe;
  try {
    return JSON.parse(maybe);
  } catch (e) {
    return null;
  }
}

exports.main = async (event) => {
  console.log('wordAnalyze input event:', JSON.stringify(event || {}));
  const text = (event && event.text) || '';
  const fallbackWord = pickWord(text);

  const fallback = {
    word: fallbackWord,
    phonetic: '',
    meaning: '',
    sentences: [],
    memoryTips: '',
    pronunciationUrl: buildPronunciationUrl(fallbackWord)
  };

  if (!String(text || '').trim()) {
    return { success: false, message: '请输入单词', data: fallback };
  }

  try {
    const userPrompt = `你是一位专业的英语单词识别助手。请识别用户输入中的英语单词，并按以下 JSON 格式返回（只返回 JSON，不要其他文字）：
{
  "word": "识别到的单词",
  "phonetic": "音标（不含斜杠）",
  "meaning": "中文意思",
  "sentences": [
    {"en": "英文例句 1", "cn": "中文翻译 1"},
    {"en": "英文例句 2", "cn": "中文翻译 2"}
  ],
  "memoryTips": "记忆技巧或口诀"
}

注意：
1. 如果输入中有多个单词，只识别最明显的一个
2. 音标使用国际音标，不包含斜杠
3. 提供 2-3 个常用例句
4. 记忆技巧可以是词根词缀、谐音、联想等方法
用户输入：${text}`;

    const aiRes = await cloud.callFunction({
      name: 'doubaoAI',
      // 增加超时：避免 callFunction 默认超时导致 ESOCKETTIMEDOUT
      config: { timeout: 60000 },
      data: {
        text,
        userPrompt
      }
    });

    console.log('doubaoAI raw result:', JSON.stringify(aiRes && aiRes.result));

    const result = aiRes && aiRes.result;

    // doubaoAI 规范返回：{success, data: object}
    let payload = (result && result.data) || null;
    if (!payload && result && result.raw && result.raw.output) payload = result.raw.output;
    if (!payload) payload = result;

    const parsed = safeParseJSON(payload) || (typeof payload === 'object' ? payload : null) || {};

    // 有些模型可能返回 word 字段在更深层；做一次兜底提取
    const word = (parsed.word ? String(parsed.word).trim().toLowerCase() : fallbackWord) || '';
    const pronunciationUrl = buildPronunciationUrl(word);

    if (!word) {
      return { success: false, message: '未识别出单词', data: fallback };
    }

    return {
      success: true,
      data: {
        word,
        phonetic: parsed.phonetic ? String(parsed.phonetic).trim() : '',
        meaning: parsed.meaning ? String(parsed.meaning).trim() : '',
        sentences: Array.isArray(parsed.sentences) ? parsed.sentences : [],
        memoryTips: parsed.memoryTips ? String(parsed.memoryTips).trim() : '',
        pronunciationUrl
      }
    };
  } catch (e) {
    console.error('wordAnalyze error', e);

    if (!fallback.word) {
      return {
        success: false,
        message: '未识别出单词，请输入英文单词',
        data: fallback
      };
    }

    return {
      success: true,
      data: fallback,
      message: 'AI 暂不可用，已使用基础识别'
    };
  }
};
