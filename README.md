# DSH Monitor · 鲸鱼娘余额气泡

> 一个 [MiraBox Craft](https://mirabox.net/) 副屏控件（`mPanelPlugin`）：把 DeepSeek 的**余额 / 今日消耗 / 本轮花费**画成一只鲸鱼娘，配上横向椭圆气泡，常驻在你的机箱小屏上。

![预览](preview/preview-480x240-valley.png)

---

## 特性

- 🐋 **鲸鱼娘 + 椭圆气泡** —— 气泡为横向扁椭圆，蓝色描边（`#203170`），尖角指向鲸鱼
- 💰 **实时余额**：大字号主视觉，一眼看清
- 📊 **今日已用 / 本轮花费**：含本轮 token 数
- 🕐 **峰谷标识**：文案默认玩「梁文峰 / 梁文谷」的梗，可在设置里切换为「高峰时段 / 空闲时段」
- 🔌 **端口自动探测**：DSH 监听端口不固定（3080 / 3081 / …），控件会按候选列表自动找到并缓存
- 🔑 **不存 API Key**：数据取自本机 DSH 的本地接口，插件里没有任何密钥
- 📐 **尺寸自适应**：宽高比变化时自动在「左右排布」和「上下排布」之间切换；椭圆按目标比例取最大内接
- 🧩 **拥挤时自动精简**：椭圆被压扁、行高不足时，两条明细自动并为一行，优先保证字号可读
- 🟢 **状态可见**：DSH 未运行时明确显示「DSH 未运行」，而不是一块不知道坏没坏的屏

## 预览

| 默认尺寸 480×240（谷时） | 默认尺寸 480×240（峰时） |
|---|---|
| ![谷时](preview/preview-480x240-valley.png) | ![峰时](preview/preview-480x240-peak.png) |

| 320×160 | 480×160 | 方形 200×200 |
|---|---|---|
| ![320x160](preview/preview-320x160-valley.png) | ![480x160](preview/preview-480x160.png) | ![200x200](preview/preview-200x200.png) |

| 小尺寸 160×120 | DSH 未运行 |
|---|---|
| ![160x120](preview/preview-160x120.png) | ![offline](preview/preview-offline.png) |

> 以上预览图全部由 `node tools/pixeltest.js` 用插件**真实绘制代码**离线渲染生成，不是手工画的示意图。

## 前置依赖

这个控件**本身不直接调用 DeepSeek API**，而是复用本机 DSH 已经算好的结果。因此需要：

| 依赖 | 说明 |
|---|---|
| **MiraBox Craft** | 副屏软件本体（Windows）。开发环境为 `2.x`，D5 竖屏 |
| **DSH（DeepSeek Harness）** | Web 服务需处于运行状态 |
| **[dsh-whale-widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)** | 提供 `/dsh-whale/*` 本地接口，本控件的唯一数据源 |

安装 `dsh-whale-widget`：

```powershell
dsh plugin --profile web add github:MeteorNOX/DeepSeek-Balance-Whale-Widget
```

**用到的接口**：

| 接口 | 用途 |
|---|---|
| `http://127.0.0.1:<port>/dsh-whale/balance.json` | 余额、今日消耗、峰谷状态 |
| `http://127.0.0.1:<port>/dsh-whale/last-turn.json` | 上一轮花费与 token 数 |

端口按 `3080 → 3081 → 3082 → 3090` 顺序探测，第一个响应的会被记住并优先复用。

> 💡 为什么这样做：插件目录里的 JS 是**明文**，不该存放 DeepSeek API Key；而且峰谷计价与记账逻辑复用 DSH 侧已算好的结果，不会出现两套算法对不上的情况。

## 安装

### 方式一：手动复制

1. 下载本仓库（或 [Release](../../releases) 里的 zip）
2. 把 `com.hamiy.dshmonitor.mPanelPlugin` 整个文件夹放进：

   ```
   %APPDATA%\HotSpot\MiraBox Craft\plugins\
   ```

   最终路径应为：

   ```
   C:\Users\<你的用户名>\AppData\Roaming\HotSpot\MiraBox Craft\plugins\com.hamiy.dshmonitor.mPanelPlugin\manifest.json
   ```

3. **完全退出** MiraBox Craft（注意是托盘右键退出，不是关窗口）
4. 重新打开，在组件列表找到分类 **DSH** → 控件 **DSH Monitor**，拖到画布上

> ⚠️ 修改插件代码后**必须重启** MiraBox Craft。QtWebEngine 会缓存插件页面，仅替换文件不会生效。

## 配置

右键画布上的控件 → 设置：

| 选项 | 默认 | 说明 |
|---|---|---|
| 峰谷文案 | 梁文峰 / 梁文谷 | 可切换为「高峰时段 / 空闲时段」或「!?峰峰?! / !?谷谷?!」 |
| 刷新间隔 | 30 秒 | 最小 5 秒 |
| 今日消耗 | 开 | 是否显示今日已用 |
| 本轮花费 | 开 | 是否显示本轮花费与 token |

**交互**：点一下控件可立即刷新，不必等刷新周期。

## 工作原理

MiraBox Craft 使用 **StreamDock 插件协议**（文档：[sdk.key123.vip](https://sdk.key123.vip/)）。一个控件由三部分组成：

```
com.hamiy.dshmonitor.mPanelPlugin/
├── manifest.json              声明控件（UUID / 图标 / 默认配置 / 控制器）
├── plugin/
│   ├── index.html             入口页（manifest 的 CodePath）
│   ├── sdk.js                 与主程序的 WebSocket 通信层 + 画布工具
│   └── index.js               数据获取 + 绘制逻辑
├── propertyInspector/
│   └── index.html             右键设置面板
└── static/
    ├── icon.png               控件图标
    └── whale.png              鲸鱼娘立绘
```

主程序加载 `plugin/index.html` 后会调用全局函数：

```js
connectElgatoStreamDeckSocket(port, pluginUUID, registerEvent, info)
```

插件据此建立到 `ws://127.0.0.1:<port>` 的 WebSocket 并注册，之后：

| 方向 | 事件 |
|---|---|
| 主程序 → 插件 | `willAppear`（拖入画布）、`willDisappear`、`didReceiveSettings`、`keyUp`（点击） |
| 插件 → 主程序 | `setImage`（显示图像）、`setTitle`（显示文字）、`setSettings`（存配置） |

所以「显示任意内容」的本质就是：**定时算出想显示的画面 → 画成 PNG → `setImage` 推给屏幕**。

几个实现细节：

- **椭圆里的排版**：椭圆的可用宽度随高度变化（中间最宽、上下收窄），因此逐行按该行高度反算宽度（`halfW = rx·√(1−(dy/ry)²)`），而不是套用外接矩形——否则四角的字会被椭圆切掉。
- **尖角与椭圆合成单条路径**：若先画椭圆再补三角形，接缝处会留下一条横穿尖角根部的描边线。这里让 `ctx.ellipse()` 绕整圈时留出缺口，直接 `lineTo` 到尖角顶点再闭合，做到一次填充、一次描边。
- **鲸鱼图本地打包**：立绘随插件分发，所以 **DSH 没运行时鲸鱼照样显示**，只是气泡里写「DSH 未运行」。

## 本地开发

插件代码是纯浏览器 JS，可以用 Node 离线驱动真实的绘制逻辑，改完先本地验证再装进软件，省去反复重启。

**准备**（`@napi-rs/canvas` 不随本仓库分发）：

```powershell
cd tools
npm i @napi-rs/canvas
```

或者直接复用 MiraBox Craft 自带的那份，设置环境变量即可：

```powershell
$env:NAPI_CANVAS="C:\Program Files\MiraBoxCraft\defaultPlugins\com.hotspot.streamdock.system.monitor.text.mPanelPlugin\plugin\node_modules\@napi-rs\canvas"
```

**跑测试**：

```powershell
node tools/smoketest.js   # 尺寸×状态矩阵冒烟，断言不抛异常
node tools/pixeltest.js   # 真实渲染 + 像素自检，并重新生成 preview/
```

`tools/harness.js` 把插件加载进 VM 沙箱，用桩件补齐 `document` / `Image` / `XMLHttpRequest` / `WebSocket`，并拦截三个调用以便断言：

| 拦截 | 用途 |
|---|---|
| `ctx.ellipse()` | 读插件算出的椭圆半径，验证长宽比 |
| `ctx.fillText()` | 读真正画出去的字符串，验证排版取舍 |
| `WebSocket.send()` | 截获 `setImage` 的 dataURL，拿到最终画面做像素统计 |

## 素材来源与许可

### 本项目代码

以 **MIT License** 开源，详见 [LICENSE](LICENSE)。

### 第三方素材

| 文件 / 内容 | 来源 | 许可 |
|---|---|---|
| `static/whale.png`（鲸鱼娘立绘） | [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget) 的 `assets/DSniang1.png` | MIT，© 2026 MeteorNOX |
| 峰谷文案「梁文峰 / 梁文谷」、配色 `#e0433f` / `#2fa24c` / `#203170` | 同上项目的文案与配色 | MIT，© 2026 MeteorNOX |
| 插件协议与 SDK 约定 | [StreamDock Plugin SDK](https://sdk.key123.vip/) | 归各自权利人 |
| `static/icon.png` | 本项目自制 | 同本项目 |

**鲸鱼娘立绘不是本项目原创**，是从上述 MIT 项目复制而来，版权归原作者 MeteorNOX 所有。完整许可证原文见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

如果你想换成自己的立绘：替换 `static/whale.png` 即可（建议方形、带透明通道，绘制时会等比缩放填充鲸鱼区域）。

### 免责声明

本项目为个人作品，与 DeepSeek、MiraBox（妙联宝）官方均无关联，未获其背书。「DeepSeek」「MiraBox」等名称与商标归各自权利人所有。

## 已知限制

- **仅在有 DSH + dsh-whale-widget 的机器上有数据**。DSH 未运行时控件会显示「DSH 未运行」而非空白。
- **依赖 `dsh-whale-widget` 的接口路径**（`/dsh-whale/balance.json`、`/dsh-whale/last-turn.json`）。若上游改了路径，本控件会失效，需要同步修改 `plugin/index.js` 里的 `PATH_BALANCE` / `PATH_TURN`。
- **仅在 Windows + D5 竖屏上实测**。插件代码本身与平台无关，但安装路径是 Windows 的。
- 跨源请求依赖 QtWebEngine 允许 `file://` 页面访问 `http://127.0.0.1`。这一点在本机验证可用（MiraBox Craft 自带插件也这么做）。

## 更新日志

### 2.4.0
- 默认控件尺寸放大一倍：320×160 → 480×240

### 2.3.0
- 椭圆长宽比 1.6 → 2.0，明显更扁更宽
- 鲸鱼宽度占比调整，把省下的宽度让给气泡
- 新增：椭圆压扁导致行高不足时，两条明细自动合并为一行

### 2.2.0
- 椭圆引入目标长宽比，不再简单铺满外接框（此前气泡接近正圆）
- 新增自检：拦截 `ctx.ellipse()` 验证椭圆真实形状

### 2.1.0
- 气泡改为椭圆 + 蓝色描边 `#203170`
- 修复：`roundRect()` 无条件 `ctx.stroke()` 导致每个圆角矩形被描了一圈默认黑边
- 修复：属性面板 `setSettings` 整体替换会冲掉 `ActionGeometry`（控件尺寸）

### 2.0.0
- 改为鲸鱼娘 + 气泡样式，峰谷文案改为「梁文峰 / 梁文谷」
- 鲸鱼立绘随插件本地打包

### 1.0.0
- 首个可用版本：余额 / 今日消耗 / 本轮花费，端口自动探测
