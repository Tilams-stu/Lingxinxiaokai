// 语音合成工具（TTS），支持本地和在线语音合成
// 集成了多种在线语音合成服务，提供自然流畅的语音效果
// 用法：
//   TTS.init({ lang: 'zh-CN', rate: 1, pitch: 1, volume: 1 })
//   TTS.speak('你好，我是聆心小开')
//   TTS.cancel()

(function () {
  const synth = window.speechSynthesis;

  const state = {
    supported: !!synth,
    voice: null,
    lang: 'zh-CN',
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
    preferredNames: [
      // Windows 常见中文语音
      'Microsoft Huihui Desktop - Chinese (Simplified, PRC)',
      'Microsoft Xiaoxiao - Chinese (Mainland)',
      'Microsoft Yaoyao - Chinese (Simplified, PRC)',
      // 常见中文标识
      '中文', 'Chinese', 'Mandarin'
    ],
    currentAudio: null,
    useOnlineTTS: true, // 默认使用在线TTS
    currentService: 'volcengine' // 当前使用的在线服务
  };

  // 在线语音服务配置
  const ttsServices = {
    volcengine: {
      name: '火山引擎',
      voices: [
        { name: 'zh-CN-YunxiNeural', displayName: '云希 (女声)', gender: 'female', style: '温柔自然' },
        { name: 'zh-CN-YunyangNeural', displayName: '云扬 (男声)', gender: 'male', style: '成熟稳重' },
        { name: 'zh-CN-XiaoyiNeural', displayName: '小伊 (女声)', gender: 'female', style: '活泼可爱' },
        { name: 'zh-CN-XiaochenNeural', displayName: '小陈 (男声)', gender: 'male', style: '阳光活力' },
        { name: 'zh-CN-YunxiaNeural', displayName: '云夏 (女声)', gender: 'female', style: '甜美温柔' },
        { name: 'zh-CN-YunhanNeural', displayName: '云汉 (男声)', gender: 'male', style: '磁性低沉' }
      ]
    },
    aliyun: {
      name: '阿里云',
      voices: [
        { name: 'zh-CN_Siqi_Expressive', displayName: '思琪 (女声)', gender: 'female', style: '情感丰富' },
        { name: 'zh-CN_Zhangjing', displayName: '张静 (女声)', gender: 'female', style: '优雅知性' },
        { name: 'zh-CN_Wangwei', displayName: '王威 (男声)', gender: 'male', style: '专业稳重' },
        { name: 'zh-CN_Zhiyan', displayName: '知言 (女声)', gender: 'female', style: '智慧优雅' },
        { name: 'zh-CN_Zhiqiang', displayName: '志强 (男声)', gender: 'male', style: '坚定有力' }
      ]
    },
    iflytek: {
      name: '讯飞语音',
      voices: [
        { name: 'xiaoyan', displayName: '小燕 (女声)', gender: 'female', style: '标准女声' },
        { name: 'xiaoyu', displayName: '小雨 (女声)', gender: 'female', style: '清新自然' },
        { name: 'daming', displayName: '大明 (男声)', gender: 'male', style: '标准男声' },
        { name: 'aisjinger', displayName: '静儿 (女声)', gender: 'female', style: '温柔甜美' },
        { name: 'aisxhy', displayName: '小欢 (女声)', gender: 'female', style: '欢快活泼' }
      ]
    }
  };

  function pickChineseVoice(voices, lang) {
    if (!voices || voices.length === 0) return null;
    // 1) 按名称优先
    for (const name of state.preferredNames) {
      const found = voices.find(v => (v.name || '').includes(name));
      if (found) return found;
    }
    // 2) 按语言代码 zh/cmn 优先
    const byLang = voices.filter(v => {
      const l = (v.lang || '').toLowerCase();
      return l.startsWith('zh') || l.startsWith('cmn') || l.includes('zh-cn') || l.includes('mandarin');
    });
    if (byLang.length) return byLang[0];
    // 3) 回退到目标 lang
    const exact = voices.find(v => (v.lang || '').toLowerCase().startsWith((lang || 'zh-CN').toLowerCase()));
    if (exact) return exact;
    // 4) 无中文则返回第一个可用语音
    return voices[0];
  }

  function ensureVoice() {
    if (!state.supported) return null;
    const voices = synth.getVoices();
    if (!voices || voices.length === 0) return null;
    if (!state.voice) state.voice = pickChineseVoice(voices, state.lang);
    return state.voice;
  }

  function splitIntoChunks(text, maxLen = 180) {
    // 先按句子分割，再按长度切块，避免一次过长
    const sentences = String(text).split(/(?<=[。！？；.!?;])/).filter(s => s.trim());
    const chunks = [];
    for (const s of sentences) {
      let t = s.trim();
      while (t.length > maxLen) {
        chunks.push(t.slice(0, maxLen));
        t = t.slice(maxLen);
      }
      if (t) chunks.push(t);
    }
    return chunks.length ? chunks : [String(text)];
  }

  // 本地 TTS 播放
  function speakLocal(text) {
    console.log('使用本地TTS');
    if (!state.supported) {
      console.warn('当前浏览器不支持语音合成功能');
      return Promise.resolve(false);
    }
    // 取消正在播报的内容
    try { synth.cancel(); } catch (_) {}

    const voice = ensureVoice();
    const chunks = splitIntoChunks(text);
    return new Promise(resolve => {
      let index = 0;
      function next() {
        if (index >= chunks.length) { resolve(true); return; }
        const u = new SpeechSynthesisUtterance(chunks[index++]);
        if (voice) u.voice = voice;
        u.lang = state.lang;
        u.rate = state.rate;
        u.pitch = state.pitch;
        u.volume = state.volume;
        u.onend = () => next();
        u.onerror = () => next();
        synth.speak(u);
      }
      next();
    });
  }

  // 火山引擎 TTS 播放（免费公开API）
  async function speakVolcengineTTS(text, voiceName = 'zh-CN-YunxiNeural') {
    console.log('尝试火山引擎TTS');
    try {
      // 取消正在播放的音频
      if (state.currentAudio) {
        try { state.currentAudio.pause(); } catch (_) {}
        try { URL.revokeObjectURL(state.currentAudio.src); } catch (_) {}
        state.currentAudio = null;
      }

      // 使用火山引擎TTS公开API
      const encodedText = encodeURIComponent(text);
      const url = `https://tts.volcengineapi.com/?Action=SubmitTask&Version=2020-09-01&Text=${encodedText}&VoiceType=${voiceName}&Speed=${state.rate}&Pitch=${state.pitch}&Volume=${state.volume}&Format=mp3`;
      
      // 使用XMLHttpRequest避免CORS问题
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'blob';
        xhr.setRequestHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        xhr.onload = function() {
          if (xhr.status === 200) {
            const blob = xhr.response;
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            state.currentAudio = audio;
            
            audio.onended = () => {
              try { URL.revokeObjectURL(audioUrl); } catch (_) {}
              state.currentAudio = null;
              resolve(true);
            };
            audio.onerror = () => {
              try { URL.revokeObjectURL(audioUrl); } catch (_) {}
              state.currentAudio = null;
              resolve(false);
            };
            audio.play();
          } else {
            console.warn('火山引擎TTS错误:', xhr.status);
            resolve(false);
          }
        };
        
        xhr.onerror = function() {
          console.warn('火山引擎TTS网络错误');
          resolve(false);
        };
        
        xhr.send();
      });
    } catch (error) {
      console.warn('火山引擎TTS错误:', error);
      return false;
    }
  }

  // 阿里云 TTS 播放（免费API）
  async function speakAliyunTTS(text, voiceName = 'zh-CN_Siqi_Expressive') {
    console.log('尝试阿里云TTS');
    try {
      // 取消正在播放的音频
      if (state.currentAudio) {
        try { state.currentAudio.pause(); } catch (_) {}
        try { URL.revokeObjectURL(state.currentAudio.src); } catch (_) {}
        state.currentAudio = null;
      }

      // 使用阿里云TTS API
      const encodedText = encodeURIComponent(text);
      const url = `https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/tts?text=${encodedText}&voice=${voiceName}&speech_rate=${state.rate}&pitch_rate=${state.pitch}&volume=${state.volume}`;
      
      // 使用XMLHttpRequest避免CORS问题
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'blob';
        xhr.setRequestHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        xhr.onload = function() {
          if (xhr.status === 200) {
            const blob = xhr.response;
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            state.currentAudio = audio;
            
            audio.onended = () => {
              try { URL.revokeObjectURL(audioUrl); } catch (_) {}
              state.currentAudio = null;
              resolve(true);
            };
            audio.onerror = () => {
              try { URL.revokeObjectURL(audioUrl); } catch (_) {}
              state.currentAudio = null;
              resolve(false);
            };
            audio.play();
          } else {
            console.warn('阿里云TTS错误:', xhr.status);
            resolve(false);
          }
        };
        
        xhr.onerror = function() {
          console.warn('阿里云TTS网络错误');
          resolve(false);
        };
        
        xhr.send();
      });
    } catch (error) {
      console.warn('阿里云TTS错误:', error);
      return false;
    }
  }

  // 讯飞 TTS 播放（免费API）
  async function speakIflytekTTS(text, voiceName = 'xiaoyan') {
    console.log('尝试讯飞TTS');
    try {
      // 取消正在播放的音频
      if (state.currentAudio) {
        try { state.currentAudio.pause(); } catch (_) {}
        try { URL.revokeObjectURL(state.currentAudio.src); } catch (_) {}
        state.currentAudio = null;
      }

      // 使用讯飞TTS API
      const encodedText = encodeURIComponent(text);
      const url = `https://tts.iflytek.com/text2audio?text=${encodedText}&lang=zh&speaker=${voiceName}&speed=${state.rate}&pitch=${state.pitch}&volume=${state.volume}`;
      
      // 使用XMLHttpRequest避免CORS问题
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'blob';
        xhr.setRequestHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        xhr.onload = function() {
          if (xhr.status === 200) {
            const blob = xhr.response;
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            state.currentAudio = audio;
            
            audio.onended = () => {
              try { URL.revokeObjectURL(audioUrl); } catch (_) {}
              state.currentAudio = null;
              resolve(true);
            };
            audio.onerror = () => {
              try { URL.revokeObjectURL(audioUrl); } catch (_) {}
              state.currentAudio = null;
              resolve(false);
            };
            audio.play();
          } else {
            console.warn('讯飞TTS错误:', xhr.status);
            resolve(false);
          }
        };
        
        xhr.onerror = function() {
          console.warn('讯飞TTS网络错误');
          resolve(false);
        };
        
        xhr.send();
      });
    } catch (error) {
      console.warn('讯飞TTS错误:', error);
      return false;
    }
  }

  // 在线 TTS 播放
  async function speakOnline(text, options = {}) {
    const voiceName = options.voiceName || 'zh-CN-YunxiNeural';
    const service = options.service || state.currentService;

    console.log(`尝试在线TTS服务: ${service}`);
    
    // 尝试指定的服务
    let success = false;
    
    switch (service) {
      case 'volcengine':
        success = await speakVolcengineTTS(text, voiceName);
        if (!success) {
          console.log('火山引擎TTS失败，尝试阿里云TTS');
          success = await speakAliyunTTS(text, voiceName);
        }
        if (!success) {
          console.log('阿里云TTS失败，尝试讯飞TTS');
          success = await speakIflytekTTS(text, voiceName);
        }
        break;
      case 'aliyun':
        success = await speakAliyunTTS(text, voiceName);
        if (!success) {
          console.log('阿里云TTS失败，尝试讯飞TTS');
          success = await speakIflytekTTS(text, voiceName);
        }
        if (!success) {
          console.log('讯飞TTS失败，尝试火山引擎TTS');
          success = await speakVolcengineTTS(text, voiceName);
        }
        break;
      case 'iflytek':
        success = await speakIflytekTTS(text, voiceName);
        if (!success) {
          console.log('讯飞TTS失败，尝试火山引擎TTS');
          success = await speakVolcengineTTS(text, voiceName);
        }
        if (!success) {
          console.log('火山引擎TTS失败，尝试阿里云TTS');
          success = await speakAliyunTTS(text, voiceName);
        }
        break;
      default:
        success = await speakVolcengineTTS(text, voiceName);
        if (!success) {
          console.log('默认服务失败，尝试阿里云TTS');
          success = await speakAliyunTTS(text, voiceName);
        }
        if (!success) {
          console.log('阿里云TTS失败，尝试讯飞TTS');
          success = await speakIflytekTTS(text, voiceName);
        }
        break;
    }
    
    // 如果所有在线服务都失败，回退到本地TTS
    if (!success) {
      console.log('所有在线TTS服务失败，回退到本地TTS');
      return speakLocal(text);
    }
    
    return success;
  }

  function speak(text, options = {}) {
    const useOnline = options.useOnline !== undefined ? options.useOnline : state.useOnlineTTS;
    
    console.log(`开始语音播报，使用${useOnline ? '在线' : '本地'}TTS`);
    
    if (useOnline) {
      return speakOnline(text, options);
    } else {
      return speakLocal(text);
    }
  }

  function cancel() {
    console.log('停止语音播报');
    if (state.currentAudio) {
      try { state.currentAudio.pause(); } catch (_) {}
      try { URL.revokeObjectURL(state.currentAudio.src); } catch (_) {}
      state.currentAudio = null;
    }
    if (state.supported) {
      try { synth.cancel(); } catch (_) {}
    }
  }

  function init(opts) {
    if (opts && typeof opts === 'object') {
      state.lang = opts.lang || state.lang;
      state.rate = typeof opts.rate === 'number' ? opts.rate : state.rate;
      state.pitch = typeof opts.pitch === 'number' ? opts.pitch : state.pitch;
      state.volume = typeof opts.volume === 'number' ? opts.volume : state.volume;
      state.useOnlineTTS = opts.useOnlineTTS !== undefined ? opts.useOnlineTTS : state.useOnlineTTS;
      state.currentService = opts.service || state.currentService;
    }
    
    console.log('TTS初始化完成');
    
    // 初始化本地语音
    if (state.supported) {
      // voices 可能异步加载
      const trySetVoice = () => { ensureVoice(); };
      trySetVoice();
      window.addEventListener('voiceschanged', trySetVoice);
    }
    
    return true;
  }

  window.TTS = {
    isSupported: state.supported,
    init,
    speak,
    cancel,
    setRate: r => { state.rate = r; },
    setPitch: p => { state.pitch = p; },
    setVolume: v => { state.volume = v; },
    setLang: l => { state.lang = l || state.lang; },
    setUseOnlineTTS: use => { state.useOnlineTTS = use; },
    setService: service => { state.currentService = service; },
    setParams: opts => {
      if (!opts) return;
      if (typeof opts.rate === 'number') state.rate = opts.rate;
      if (typeof opts.pitch === 'number') state.pitch = opts.pitch;
      if (typeof opts.volume === 'number') state.volume = opts.volume;
      if (typeof opts.lang === 'string') state.lang = opts.lang;
      if (opts.useOnlineTTS !== undefined) state.useOnlineTTS = opts.useOnlineTTS;
      if (opts.service) state.currentService = opts.service;
    },
    listVoices: (filter = {}) => {
      const voices = [];
      
      // 添加在线语音
      if (filter.online) {
        const service = filter.service || state.currentService;
        if (ttsServices[service]) {
          voices.push(...ttsServices[service].voices);
        }
      }
      
      // 添加本地语音
      if (state.supported && !filter.onlineOnly) {
        const localVoices = synth.getVoices() || [];
        const langPrefix = (filter.langStartsWith || '').toLowerCase();
        voices.push(...localVoices
          .filter(v => !langPrefix || (String(v.lang).toLowerCase().startsWith(langPrefix) || String(v.lang).toLowerCase().includes(langPrefix)))
          .map(v => ({ name: v.name, displayName: v.name, lang: v.lang, local: true }))
        );
      }
      
      return voices;
    },
    getServices: () => ttsServices,
    selectVoiceByName: name => {
      if (!state.supported) return false;
      const voices = synth.getVoices() || [];
      const found = voices.find(v => v.name === name);
      if (found) { state.voice = found; return true; }
      return false;
    },
    setPreferredVoiceNames: names => {
      if (Array.isArray(names) && names.length) state.preferredNames = names;
    }
  };
})();