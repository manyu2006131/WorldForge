# 世界工坊 WorldForge

适用于 Windows 和 iOS 的离线世界设定工具。地图、人物档案和关系图保存在同一个本地项目中。

- **地图**支持底图、画笔、直线、矩形、圆、多边形、图层及 PNG 导出。图钉可记录地点笔记、绑定人物，以及跳转到第二级地图。
- **人物**支持档案、搜索、多张图片、封面和地点回跳。**关系图**支持命名连线、节点拖动、自动布局和聚焦，双击或双点节点可以打开档案。
- 支持撤销、重做、带图片的项目 JSON 导入导出、示例项目。更改后约三秒自动保存，保留最近 20 份备份，可在应用内恢复。
- Windows 项目保存在选择的目录。iOS 项目保存在 App 沙盒，可通过系统分享把项目 JSON 导出到「文件」，并在另一台设备上导入。

## Windows

从 [GitHub Releases](https://github.com/manyu2006131/WorldForge/releases) 下载 `WorldForge-Windows.exe` 后双击打开。Windows x64 便携版无需安装或联网。第一次建项目时选择可写入的空文件夹。

开发环境需要 Node.js 22 或更新版本。运行 `npm ci` 后，`npm run dev` 启动开发版，`npm run dist:win` 构建便携版。构建缓存和产物可通过仓库中的批处理保存在项目目录。

## iPhone 和 iPad

应用名为「傅里叶大帝的专属游戏制作工具箱」，最低系统为 iOS 16。IPA 通过 GitHub Actions 的 macOS 环境编译。公开发布的 `WorldForge-iOS-unsigned.ipa` 需要签名后才可安装。

已有 Apple 签名配置的 Mac 可执行 `npm ci`，安装 XcodeGen 后运行 `WORLDFORGE_EXPORT_OPTIONS=/绝对路径/ExportOptions.plist npm run dist:ios` 导出签名 IPA。也可以从运行脚本后生成的 `ios/WorldForge.xcodeproj` 进入 Xcode，选择签名团队，再归档和导出。实际签名方式和设备配置由 Apple 签名团队决定。
