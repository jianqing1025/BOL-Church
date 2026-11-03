# YouTube 推流：使用推流密钥

按用户选择，不接入 Google OAuth，不要求创建 Google Cloud 项目或 OAuth 客户端。

1. 在 YouTube Studio 的直播控制室创建／选择直播，复制推流密钥。
2. 在 OBS Church 的 Settings → Stream 中选择 YouTube - RTMPS，使用推流密钥连接；也可使用平台提供的服务器地址和密钥配置自定义 RTMP。
3. 点击 Start Streaming 时，OBS Church 根据当前日期和 Sources 中的讲台信息生成标题，并复制到剪贴板，例如 `2026-11-02 Live - Faith`。
4. 在 YouTube Studio 的标题栏粘贴此标题。

远端标题通过 YouTube Studio 手动填写；普通推流连接不会自动修改它。已撤除新增的 Google OAuth 配置脚本、远端自动改名请求和“更新标题失败就阻止开播”的流程。

教会内容的 Cloudflare 账号、D1／R2 同步和 OBS Online 不受此选择影响。
