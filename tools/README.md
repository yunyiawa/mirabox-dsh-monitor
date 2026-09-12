# 开发工具

在**不打开 MiraBox Craft** 的前提下，用 Node 离线驱动插件的真实绘制逻辑。改完样式先跑一遍，省去反复重启软件。

## 准备

`@napi-rs/canvas` 不在仓库内，需自行提供（任选其一）：

```powershell
# 方式一：本地安装
npm i @napi-rs/canvas

# 方式二：复用 MiraBox Craft 自带的那份
$env:NAPI_CANVAS="C:\Program Files\MiraBoxCraft\defaultPlugins\com.hotspot.streamdock.system.monitor.text.mPanelPlugin\plugin\node_modules\@napi-rs\canvas"

# 方式三：只指定 MiraBox Craft 安装目录，脚本自行定位
$env:MIRABOX_DIR="C:\Program Files\MiraBoxCraft"
```

## 用法

```powershell
node tools/smoketest.js   # 尺寸×状态矩阵冒烟，断言不抛异常（49 个用例）
node tools/pixeltest.js   # 真实渲染 + 像素自检，并重新生成 preview/
```

两个脚本都是全通过退出码 0，有失败退出码 1，可直接接进 CI。

## 文件

| 文件 | 作用 |
|---|---|
| `harness.js` | 把插件加载进 VM 沙箱，桩件补齐浏览器 API，并插桩供断言 |
| `smoketest.js` | 遍历尺寸×状态组合，抓运行时错误 |
| `pixeltest.js` | 渲染真实画面、做像素统计、导出预览图 |

## harness 的插桩点

插件是为 QtWebEngine 写的（依赖 `document` / `Image` / `XMLHttpRequest` / `WebSocket`），`harness.js` 用最小桩件补齐后，额外拦截三处调用，使「画得对不对」可以被断言，而不只是「有没有报错」：

| 拦截 | 得到的断言依据 |
|---|---|
| `ctx.ellipse()` | 插件算出的椭圆半径 → 验证长宽比与是否越界 |
| `ctx.fillText()` | 真正画出去的字符串 → 验证排版取舍（如明细行是否合并） |
| `WebSocket.send()` | `setImage` 的 dataURL → 拿到最终画面做像素统计 |

## 增加用例

`pixeltest.js` 里的文件名即 `preview/` 下的产物名，新增用例会直接多出一张预览图。
`smoketest.js` 里 `sizes` / `states` / `edge` 三个数组即为用例来源。
