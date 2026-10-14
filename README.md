# DeepSeek Harness Chat Switcher

[English](README.en.md) · 中文

为 **Windows 版 DeepSeek Harness** 添加可随时切换的“工作 / 聊天”入口，以及独立的工作授权窗口。

这是社区补丁，非 DeepSeek 官方产品。只发布补丁源码，不分发原应用或修改后的 `app.asar`。

## 功能

- 顶部“工作 / 聊天”按钮；`Ctrl+Shift+1` 返回工作，`Ctrl+Shift+2` 进入聊天。
- 在应用内打开 [DeepSeek 官网聊天](https://chat.deepseek.com/)，切换时保留页面。
- 工作页显示后延迟 750ms 在后台预加载聊天，减少首次点击的启动等待；预加载不切换模式、不抢焦点、不发送聊天消息。
- 内置聊天、工作授权窗口、外部浏览器分别保存登录。
- 修复 Windows 标题栏拖动区域拦截按钮鼠标点击的问题。
- 官网聊天不调用 Harness API；切换不会自动停止正在运行的工作任务。
- 安装前版本校验、原文件备份、校验和保护、可回滚安装。

## 适用版本

仅支持已测试的 **Windows / `@deepseek-ai/dsh-desktop` `0.2.0-rc.2`**，构建提交为 `04f392c9ddd144fa426da2045178797da6db6c11`。详细条件见 [compatibility.json](compatibility.json)。

安装器会拒绝不匹配的版本或已变化的源码结构。当前不支持 macOS / Linux。
应用升级可能覆盖补丁；升级后不要用旧备份覆盖新版应用，应等待兼容版本。
更新本项目补丁时，先使用原版本的恢复命令，再安装新版本。

## 安装

需要已安装的兼容版 DeepSeek Harness，以及 Node.js 20 或更高版本。无需 `npm install`，工具只使用 Node.js 内置模块。

1. 下载本仓库源码 ZIP 并解压，或克隆仓库。
2. 从系统托盘**完全退出** DeepSeek Harness，关闭窗口不等于退出程序。
3. 在源码目录运行，替换安装路径为你的实际目录：

```powershell
node scripts/patch.mjs --app-dir "D:\Apps\DeepSeek Harness" --dry-run
node scripts/patch.mjs --app-dir "D:\Apps\DeepSeek Harness"
```

`--dry-run` 只检查兼容性，不修改程序。正式安装会在应用的 `resources` 目录保存：

- `app.asar.chat-switcher.backup`：原程序包。
- `app.asar.chat-switcher.json`：恢复所需的版本及校验和。

然后正常启动 Harness。不要将这两个文件或任何 `app.asar` 上传到仓库。

**已手动打过补丁的用户**：本安装器不会直接覆盖未知补丁。请先用之前的原版备份恢复同一兼容版本，再运行预检；不要覆盖已升级的版本。

## 登录与使用

聊天直接使用官网，需要官网账号；网站自己的额度、服务限制和条款仍适用。“不调用 Harness API”不表示模型处理不使用 token。

工作授权通过单独窗口执行原有官方 PKCE 流程。聊天使用 `persist:dsh-web-chat`，工作授权窗口使用 `persist:dsh-work-login`。工作账号 grant 仍由原有 Harness 后端管理。
外部浏览器登录不会自动同步到内置页面。
预加载会提前访问官网，并增加一个聊天渲染进程的内存占用。聊天页关闭默认后台节流，以便完成隐藏页面的加载并减少重新显示时的等待；网络或官网服务慢时仍可能需要等待。

Cookie 隔离解决客户端的存储混用，**不能绕过服务端的账号限制、会话撤销或授权过期**。已经失效的工作授权需要重新登录。Google / Apple 等外部身份提供商的完整回调流程未验证；目前实机验证的是手动官方工作授权和官网聊天登录。

切换模式保留工作页面，后台工作任务仍可能继续调用 API。需要停止工作时，应先在工作页停止任务。

## 恢复原版

完全退出应用，再运行：

```powershell
node scripts/restore.mjs --app-dir "D:\Apps\DeepSeek Harness"
```

只有当前程序包仍匹配安装后的校验和，才会恢复备份。恢复不清除账号、Cookie 或工作数据。

## 测试

```powershell
npm test
```

自动检查包括 ASAR 内容完整性、版本拒绝、安装/回滚、升级后的恢复保护、会话隔离、授权回调范围、切换、快捷键及关闭清理。

实机验证范围：Windows 上的顶部按钮真实鼠标点击、官网页面加载、工作授权、两边同时登录、切换保留、工作授权重启后保存。自动化测试不登录账号、不发送消息、不调用模型 API。

## 许可与贡献

本项目采用 [MIT](LICENSE) 许可证。上游致谢和许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
欢迎提交问题或 PR；请提供应用版本和复现步骤，**不要上传账号信息、Cookie、授权 URL、token、完整日志或应用程序包**。安全问题见 [SECURITY.md](SECURITY.md)。
