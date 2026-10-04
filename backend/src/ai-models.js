export const AI_MODES=[{id:'default',label:'Current model (DeepSeek by default)'},{id:'economy',label:'Lower token rates — GLM 5.3 Flash'}];
export const modelForMode=mode=>mode==='economy'?'accounts/fireworks/models/glm-5p3-flash':process.env.FIREWORKS_MODEL||'accounts/fireworks/models/deepseek-v4p1-flash';
