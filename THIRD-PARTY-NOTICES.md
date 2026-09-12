# 第三方素材与许可

本仓库包含**非原创**的第三方素材。为遵守其许可证要求，在此逐项列明来源与许可，并附许可证原文。

---

## 1. 鲸鱼娘立绘（`static/whale.png`）

- **来源项目**：`dsh-whale-widget`（DeepSeek Balance Whale Widget）
- **仓库地址**：https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget
- **原始文件**：`assets/DSniang1.png`（610×610，32bpp ARGB）
- **本项目中的路径**：`com.hamiy.dshmonitor.mPanelPlugin/static/whale.png`
- **版权**：Copyright (c) 2026 MeteorNOX
- **许可**：MIT License

该立绘**不是本项目的原创作品**，是从上述 MIT 项目复制而来。原始文件未作修改，仅重命名以便于本项目内部引用。

## 2. 峰谷文案与配色

以下内容参考了同一项目的实现：

| 内容 | 本项目中的位置 | 说明 |
|---|---|---|
| 文案「梁文峰」/「梁文谷」 | `plugin/index.js` → `periodText()` | 该项目 `peakMode === 'liangwen'` 时的文案 |
| 文案「!?峰峰?!」/「!?谷谷?!」 | `plugin/index.js` → `periodText()` | 对应 `peakMode === 'qiangqiang'` |
| 配色 `#e0433f`（峰） | `plugin/index.js` → `C_PEAK` | 该项目峰时段文字色 |
| 配色 `#2fa24c`（谷） | `plugin/index.js` → `C_OFF` | 该项目谷时段文字色 |
| 配色 `#203170`（藏青） | `plugin/index.js` → `C_INK` / `C_OUTLINE` | 该项目气泡主文字色 |

- **版权**：Copyright (c) 2026 MeteorNOX
- **许可**：MIT License

## 3. 插件协议与 SDK

本插件遵循 **StreamDock 插件协议**，包括 `manifest.json` 的结构、`connectElgatoStreamDeckSocket` 引导函数、以及 `setImage` / `setTitle` / `setSettings` 等事件约定。

- **文档**：https://sdk.key123.vip/
- **归属**：相关协议、SDK 文档与 MiraBox Craft 软件的权利归各自权利人所有。本项目仅**实现了**该协议，未复制其代码。

## 4. 仅供开发使用、未随仓库分发的依赖

`tools/` 下的测试脚本需要 `@napi-rs/canvas`（用于在 Node 中提供 Canvas 2D 实现）。该依赖**不包含在本仓库中**，需由使用者自行安装。其许可证归其作者所有。

---

## 上游项目 MIT 许可证原文

以下为 `dsh-whale-widget` 项目的 LICENSE 全文，其要求「在软件的所有副本或实质性部分中，均应包含上述版权声明与本许可声明」。本项目据此在此完整转载。

```
MIT License

Copyright (c) 2026 MeteorNOX

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 商标声明

「DeepSeek」为杭州深度求索人工智能基础技术研究有限公司的商标；「MiraBox」「妙联宝」为相应权利人的商标。本项目为个人作品，与上述公司**均无关联**，未获其赞助或背书。相关名称仅用于说明用途。
