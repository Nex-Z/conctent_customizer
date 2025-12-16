# Content Customizer

一个基于 Chrome Manifest V3 的网页内容定制扩展。通过自定义规则，你可以在浏览任意站点时实时替换文本、链接锚点、表单 placeholder/title、图片 `src` 以及行内 `background-image`，获得统一的演示或调试体验。

## ✨ 功能亮点

- **规则化管理**：在 Options 页面批量查看、折叠/展开、导入/导出规则。
- **多维替换**：
  - 文本 + 属性：正文、按钮、链接文字，以及 `placeholder/title/aria/value` 等属性全部覆盖。
  - 图片：支持 `<img>` `src`/`srcset`，以及 `style="background-image:url(...)"` 等行内背景图。
- **灵活匹配**：精确/通配/正则模式，支持大小写控制与首屏处理策略（隐藏原文/仅预编译/关闭）。
- **首屏无闪烁**：命中规则时会短暂隐藏页面，待替换完成后再展示，300 ms 兜底防止白屏。
- **实时控制**：Popup 快速查看当前 URL 的匹配规则，支持逐条或一键启停。

## 🚀 安装与使用

1. 克隆或下载本仓库：
   ```bash
   git clone https://github.com/your/repo.git content-customizer
   ```
2. 打开 Chrome → 地址栏输入 `chrome://extensions/`，右上角开启 **开发者模式**。
3. 点击 **加载已解压的扩展程序**，选择仓库根目录。
4. 通过工具栏图标弹出的 Popup 控制当前页面规则；在 Options 页面创建/管理规则。

> **注**：本项目无需额外构建步骤，修改文件后在扩展页点击“重新加载”即可生效。

## 🧱 项目结构

```
├── background.js          # Service worker：规则存储、消息中转
├── contentScript.js       # DOM 文本/图片/属性/背景替换核心逻辑
├── manifest.json          # Chrome MV3 配置
├── options.html/.js/.css  # 规则管理（折叠面板、表单）
├── popup.html/.js/.css    # 当前页面规则状态/快速操作
├── shared/ruleMatcher.js  # URL & 规则匹配工具
├── prd.md                 # 产品需求文档
└── README.md              # 说明文档（本文件）
```

## 🧰 开发提示

- **调试 content script**：在目标页面打开 DevTools（Sources → Content scripts），即可查看 `contentScript.js` 日志、断点。
- **规则存储**：使用 `chrome.storage.local`，导入/导出 JSON 时会保留 `preloadMode`、替换条目、正则等信息。
- **性能关注点**：
  - 确保 `run_at: document_start`，配合首屏隐藏防止闪烁。
  - MutationObserver 已做 100 ms 去抖，若需扩展请保持批量写 DOM。
  - 所有替换都会记录原值，通过 WeakMap 在禁用/切换规则时恢复。

## 📄 许可证

项目尚未指定具体开源协议，如需商用或二次分发请先与作者确认。欢迎 Issue/PR 反馈与共建。+
