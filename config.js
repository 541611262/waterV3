// 部署配置
// - cloudbaseEnv 留空：单机模式，数据只保存在当前浏览器中
// - 填写腾讯云开发环境 ID：云端模式，同事用各自账号登录，数据保存在云数据库（部署步骤见 DEPLOY.md）
// 环境 ID 会出现在网页代码中，这是正常的；数据安全由云端的登录和安全规则保证，不依赖于隐藏环境 ID
window.APP_CONFIG = {
    cloudbaseEnv: 'water-storage-d0ggf2m9faaadb034',
    cloudbaseRegion: 'ap-shanghai'
};
