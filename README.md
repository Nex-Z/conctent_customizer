# Content Customizer

一个 Chrome 扩展（Manifest V3），可在浏览任意网页时**实时替换文本、图片、样式**，适用于演示、调试或个性化定制场景。

---

## ✨ 功能特性

| 能力 | 说明 |
| --- | --- |
| **文本替换** | 支持正文、按钮、链接及 `placeholder` / `title` / `aria-*` / `value` 等属性 |
| **图片替换** | 匹配 `<img>` 的 `src` / `srcset`，以及行内 `background-image` |
| **CSS 样式覆盖** | 通过选择器注入自定义样式 |
| **多种匹配模式** | 精确、包含、通配符 (`*`) 、正则表达式，支持大小写控制 |
| **首屏无闪烁** | 命中规则时隐藏原内容，替换完成后再展示（300ms 兜底） |
| **跨设备同步** | 可选使用 `chrome.storage.sync` 在多设备间共享规则 |
| **导入/导出** | 通过 JSON 文件备份和迁移规则 |

---

## 🎯 使用场景

- **产品演示**：临时替换页面中的公司名称、Logo、敏感数据，快速生成演示素材
- **UI 调试**：修改文案、图片，验证不同内容长度或样式的显示效果
- **隐私保护**：浏览时自动遮盖个人信息、账号 ID 等敏感内容
- **本地化测试**：模拟多语言环境，检查翻译后的布局兼容性
- **竞品分析**：替换竞品页面元素，对比自有产品的视觉效果

---

## 🚀 安装

1. **克隆仓库**
   ```bash
   git clone https://github.com/Nex-Z/conctent_customizer
   ```
2. **加载扩展**  
   打开 `chrome://extensions/` → 开启 **开发者模式** → **加载已解压的扩展程序** → 选择仓库根目录

> 本项目无需构建，修改代码后点击扩展页"重新加载"即可生效。

---

## 📖 使用指南

- **Popup**：点击工具栏图标，查看当前页面已匹配的规则，快速启用/禁用
- **Options**：点击"规则设置"进入管理页面，创建、编辑、导入/导出规则
- **快速创建**：在 Popup 中点击"快速创建"，自动预填当前 URL

---

## 📁 项目结构

```
├── manifest.json           # Chrome MV3 配置
├── background.js           # Service Worker：规则存储与消息分发
├── contentScript.js        # 内容脚本：DOM 替换核心逻辑
├── popup.html / popup.js   # 弹出面板：当前页规则状态
├── options.html / options.js # 规则管理页
├── shared/
│   └── ruleMatcher.js      # URL 匹配与规则处理工具
├── styles/
│   ├── popup.css
│   └── options.css
└── icons/                  # 扩展图标
```

---

## 🛠 开发提示

- **调试脚本**：在目标页面的 DevTools → Sources → Content scripts 中查看日志和断点
- **存储**：规则默认存储于 `chrome.storage.local`，可在设置中切换至 `sync`
- **性能考量**：
  - `run_at: document_start` + 首屏隐藏策略防止闪烁
  - `MutationObserver` 100ms 去抖，批量更新 DOM
  - `WeakMap` 记录原值，支持禁用规则后回滚

---

## 📄 许可证

本项目基于 [MIT License](./LICENSE) 开源。欢迎提交 Issue / PR！