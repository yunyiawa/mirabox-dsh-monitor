# 第三方素材与许可范围

本仓库包含**非原创**的第三方内容。这里逐项说明来源与许可范围，并附上游 MIT 许可证原文。

> ⚠️ **先说结论**：本项目**代码**是 MIT；但 `static/whale.png`（鲸鱼娘立绘）**不是 MIT 素材**，请勿当作 MIT 内容再分发。

---

## 一、许可范围总览

| 范围 | 许可 |
|---|---|
| 本项目自身代码（`plugin/`、`propertyInspector/`、`manifest.json`、`tools/`、文档） | **MIT**，见 [LICENSE](LICENSE) |
| `static/whale.png`（鲸鱼娘立绘） | **不适用 MIT** —— 第三方美术素材，见第二节 |
| 从上游代码借鉴的文案、配色、峰谷规则 | **MIT**（© 2026 MeteorNOX），见第三节 |
| 插件协议 / SDK 约定 | 归各自权利人，见第四节 |

---

## 二、鲸鱼娘立绘（`static/whale.png`）—— 非 MIT

| 项目 | 说明 |
|---|---|
| 来源 | `dsh-whale-widget`：https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget |
| 原始文件 | `assets/DSniang1.png`（610×610，32bpp ARGB） |
| 本仓库路径 | `com.hamiy.dshmonitor.mPanelPlugin/static/whale.png` |
| 文件改动 | **无**。仅重命名，SHA256 与上游一致 |
| 许可 | **不在上游 MIT 覆盖范围内** |

### 上游对素材的声明

上游仓库自 **0.3.5** 起在 `PROVENANCE.md` 与 README 中明确声明（原文摘录）：

> `assets/` 目录下的**美术素材**（图片 / 动图 / 音效）**不在 MIT 覆盖范围内**，按说明「原样提供」。
>
> ……由维护者提供或使用 AI 工具生成，按 **as-is** 随插件分发，仅用于运行本插件；**不授予再许可**，也不声明为原创作品。
>
> `DSniang1.png`（鲸鱼本体）：**AI 工具生成**的图像，经人工挑选与裁切。生成工具与原始出处**已不可考**（文件内元数据已被剥离）。

> 📌 上游在 0.3.0 及更早版本的 README 中只写了「本项目基于 MIT License 开源」，**没有**这条素材例外说明。本仓库初版据此标注为 MIT。上游补充声明后，此处已按新口径更正。

### 本仓库的处理方式

本仓库**不声称对该图片拥有任何权利**，也**不将其纳入本项目的 MIT 授权**。它仅作为运行本控件所必需的资源随包分发，与上游自己的分发方式一致。

- 若你是图片的权利人并希望我们移除：请在本仓库[开一条 issue](../../issues) 说明**文件名**与**依据**，我们会在核实后**立即替换或移除**，不附加其它条件。
- 若你不希望依赖该素材：用你自己的图片替换 `static/whale.png` 即可（建议方形、带透明通道）。删掉该文件不会导致控件崩溃，只会显示一个占位圆圈。

---

## 三、从上游代码借鉴的内容 —— MIT

以下内容取自上游项目**代码**（属 MIT 范围），并非美术素材：

| 内容 | 本仓库位置 | 上游对应 |
|---|---|---|
| 文案「梁文峰」/「梁文谷」 | `plugin/index.js` → `periodText()` | `peakMode === 'liangwen'` |
| 文案「!?峰峰?!」/「!?谷谷?!」 | `plugin/index.js` → `periodText()` | `peakMode === 'qiangqiang'` |
| 配色 `#e0433f`（峰） | `plugin/index.js` → `C_PEAK` | 峰时段文字色 |
| 配色 `#2fa24c`（谷） | `plugin/index.js` → `C_OFF` | 谷时段文字色 |
| 配色 `#203170`（藏青） | `plugin/index.js` → `C_INK` / `C_OUTLINE` | 气泡主文字色 |
| 峰谷时段规则（工作日 9–12 / 14–18 为高峰，周末全天谷价） | `plugin/index.js` → `PEAK_HOURS` / `isPeakTime()` | `isPeakTime()`，与 DeepSeek 官方定价页一致 |

- **版权**：Copyright (c) 2026 MeteorNOX
- **许可**：MIT License（原文见第六节）

---

## 四、插件协议与 SDK

本插件遵循 **StreamDock 插件协议**：`manifest.json` 结构、`connectElgatoStreamDeckSocket` 引导函数、`setImage` / `setTitle` / `setSettings` 等事件约定。

- **文档**：https://sdk.key123.vip/
- **归属**：相关协议、SDK 文档与 MiraBox Craft 软件的权利归各自权利人所有。本项目仅**实现**该协议，未复制其代码。

---

## 五、仅供开发使用、不随仓库分发的依赖

`tools/` 下的测试脚本需要 `@napi-rs/canvas`（在 Node 中提供 Canvas 2D 实现）。该依赖**不含在本仓库中**，需使用者自行安装，其许可归其作者所有。

---

## 六、上游 MIT 许可证原文

以下为 `dsh-whale-widget` 项目的 LICENSE 全文（**仅覆盖其代码**，不含 `assets/`）。

其要求「在软件的所有副本或实质性部分中，均应包含上述版权声明与本许可声明」。本仓库在第三节中借鉴了其代码内容，故在此完整转载。

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

## 七、商标声明

「DeepSeek」为杭州深度求索人工智能基础技术研究有限公司的商标；「MiraBox」「妙联宝」为相应权利人的商标。本项目为个人作品，与上述公司**均无关联**，未获其赞助或背书。相关名称仅用于说明用途。
