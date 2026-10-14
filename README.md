# DeepSeek Harness Chat Switcher

[English](README.en.md) · 中文

Windows 版 DeepSeek Harness 的聊天与工作模式插件。顶部用单个“工作 ▾ / 聊天 ▾”下拉按钮选择模式，菜单包含图标、说明和当前选项标记。

这是社区项目，采用 Harness 官方 Cordis 插件机制，可在侧栏“插件”页启用、停用。**为了保存官网聊天登录和页面，仍需配套安装桌面桥接层（修改 `app.asar`）**；只安装插件包无法使用。仓库不分发原应用或修改后的应用包。

## 功能

- 单个模式下拉菜单；`Ctrl+Shift+1` 返回工作，`Ctrl+Shift+2` 进入聊天。
- 内置 [DeepSeek 官网聊天](https://chat.deepseek.com/)，切换保留页面和独立登录。
- 工作页显示后延迟 750ms 在后台预加载，不抢焦点、不发送消息。
- 插件停用后隐藏入口、返回工作页，并恢复聊天后台节流；重新启用保留聊天页面。
- 工作授权使用独立窗口，保留原有官方 PKCE 和 grant 流程。
- 安装前版本校验、备份、校验和保护及可回滚安装。

聊天入口不调用 Harness API。官网服务自己的额度和规则仍适用；模型处理仍使用 token。切换不会停止后台工作任务，需要停止时先在工作页停止任务。

## 适用版本

桌面桥接层只支持已测试的 **Windows / `@deepseek-ai/dsh-desktop` `0.2.0-rc.2`**，构建提交 `04f392c9ddd144fa426da2045178797da6db6c11`，详见 [compatibility.json](compatibility.json)。不支持 macOS/Linux。

应用升级可能覆盖桥接层；不要把旧备份恢复到已升级的应用。升级本项目时，先使用原安装版本的恢复工具，再安装新桥接层。

## 安装

需要兼容版 Harness 和 Node.js 20+。本项目没有 npm 依赖，也没有安装脚本。

1. 下载并解压源码，或克隆仓库，保留这个目录（本地插件使用链接）。
2. 从系统托盘完全退出 Harness。
3. 在源码目录安装桌面桥接层，替换下面示例路径：

```powershell
node scripts/patch.mjs --app-dir "D:\Apps\DeepSeek Harness" --dry-run
node scripts/patch.mjs --app-dir "D:\Apps\DeepSeek Harness"
```

`--dry-run` 不修改程序。正式安装在 `resources` 保存 `app.asar.chat-switcher.backup` 和 `app.asar.chat-switcher.json`。不要上传这些文件。

已经手动打过旧补丁的用户，需先恢复**同一版本**的原始备份；安装器会拒绝覆盖未知补丁。

4. 使用 Harness 官方 CLI 注册本地插件：

```powershell
$pluginDirectory = (Get-Location).Path.Replace('\', '/')
& "D:\Apps\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add "link:$pluginDirectory"
```

也可用已配置的 `dsh plugin --profile desktop add "link:$pluginDirectory"`。CLI 会把插件包加入 desktop profile 的依赖和 bundle 列表。

5. 启动 Harness。顶部出现“工作 ▾”，点击选择“聊天”。管理开关在**左侧栏“插件”→ 已安装 → deepseek-harness-chat-switcher**；Settings 中的插件列表主要用于查看。

插件包中的 `cordis.patch.yml` 插入 `chat-modes` Loader 条目，`lib/client.js` 随官方插件生命周期激活/停用桌面桥接层。网页没有 Electron API 或 Harness preload；桥接接口仅暴露给受信任的主工作页面。

## 登录与性能

聊天会话使用 `persist:dsh-web-chat`；工作授权窗口使用 `persist:dsh-work-login`。外部浏览器登录不会自动同步到内置页面。Cookie 隔离不能绕过服务端会话撤销或授权过期，失效后仍需正常重新登录。

预加载提前访问官网，额外占用一个渲染进程。启用时关闭聊天后台节流，以减少首次加载和恢复等待；网络及官网服务延迟仍可能影响加载。停用插件不会清除 cookies 或工作数据。

Google/Apple 等第三方身份提供商的完整回调流程尚未验证。已验证的是官方工作授权和官网聊天登录。

## 卸载与恢复

仅隐藏功能：在侧栏“插件”页关闭开关。

完整卸载：先在插件页卸载插件包，完全退出 Harness，再运行：

```powershell
node scripts/restore.mjs --app-dir "D:\Apps\DeepSeek Harness"
```

恢复器会校验当前包和备份，拒绝覆盖应用后续更新。恢复不会删除账号、cookies 或工作数据。

## 测试与许可

```powershell
npm test
```

自动测试覆盖 ASAR 完整性、安装/恢复保护、插件注册和生命周期、IPC 来源校验、下拉菜单布局、会话隔离、授权回调范围、预加载和快捷键。不自动登录或发送模型请求。

[MIT](LICENSE)。上游致谢见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。问题报告不要附账号、token、授权 URL、cookies、完整日志或应用包；安全问题见 [SECURITY.md](SECURITY.md)。
