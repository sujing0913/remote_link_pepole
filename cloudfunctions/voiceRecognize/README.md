# 语音识别云函数（暂未启用）

## 说明

此云函数用于语音识别功能，目前暂未接入实际的语音识别 API。

## 后续扩展方案

### 方案 1：腾讯云语音识别
1. 在腾讯云控制台开通语音识别服务
2. 获取 SecretId 和 SecretKey
3. 安装 SDK: `npm install tencentcloud-sdk-nodejs`
4. 调用 SentenceRecognition API

### 方案 2：百度语音识别
1. 在百度智能云创建应用
2. 获取 API Key 和 Secret Key
3. 调用百度语音识别 API

### 方案 3：微信小程序自带能力
1. 使用 wx.getRecorderManager() 录音
2. 使用 wx.createVoiceManager() 或第三方插件

## 当前状态

- ✅ 云函数框架已创建
- ⏸️ 语音识别 API 待接入
- ✅ 前端已移除语音输入入口（保留扩展能力）

## 部署说明

如需启用语音识别功能，请：
1. 选择合适的语音识别服务提供商
2. 配置 API 密钥
3. 更新 index.js 中的识别逻辑
4. 重新上传并部署云函数
