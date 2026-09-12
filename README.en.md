# DSH Monitor · Whale-Girl Balance Bubble

> A [MiraBox Craft](https://mirabox.net/) secondary-screen widget (`mPanelPlugin`) that draws your DeepSeek **balance / today's spend / last-turn cost** as a whale-girl with a wide elliptical speech bubble.

![Preview](preview/preview-480x240-valley.png)

[中文说明 (Chinese)](README.md)

---

## Features

- 🐋 **Whale-girl + elliptical bubble** — wide flat ellipse, blue outline (`#203170`), tail pointing at the whale
- 💰 **Live balance** as the primary visual
- 📊 **Today's usage / last-turn cost**, including token count
- 🕐 **Peak/off-peak badge** — defaults to a Chinese pun («梁文峰 / 梁文谷», after DeepSeek's founder); switchable to plain wording
- 🔌 **Automatic port detection** — DSH's listening port is not fixed (3080 / 3081 / …); the widget probes a candidate list and caches the one that answers
- 🔑 **No API key stored** — data comes from DSH's local HTTP endpoint; the plugin holds no secrets
- 📐 **Size-adaptive** — switches between side-by-side and stacked layouts based on aspect ratio; the ellipse takes the largest inscribed shape at a fixed target ratio
- 🧩 **Auto-simplifies when cramped** — if the ellipse is squashed and rows would be too short, the two detail lines merge into one to keep text legible
- 🟢 **Explicit states** — shows "DSH 未运行" (DSH not running) instead of a blank card

## Preview

| 480×240, off-peak (default) | 480×240, peak |
|---|---|
| ![off-peak](preview/preview-480x240-valley.png) | ![peak](preview/preview-480x240-peak.png) |

| 320×160 | 480×160 | Square 200×200 |
|---|---|---|
| ![320x160](preview/preview-320x160-valley.png) | ![480x160](preview/preview-480x160.png) | ![200x200](preview/preview-200x200.png) |

| Small 160×120 | DSH not running |
|---|---|
| ![160x120](preview/preview-160x120.png) | ![offline](preview/preview-offline.png) |

> All previews above are rendered offline by `node tools/pixeltest.js` using the plugin's **real drawing code** — they are not hand-made mockups.

## Requirements

This widget does **not** call the DeepSeek API directly. It reuses results already computed by DSH on the same machine. You need:

| Requirement | Notes |
|---|---|
| **MiraBox Craft** | The secondary-screen software (Windows). Developed against 2.x, D5 in vertical orientation |
| **DSH (DeepSeek Harness)** | Its web server must be running |
| **[dsh-whale-widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)** | Provides the `/dsh-whale/*` local endpoints — the widget's only data source |

Install the data provider:

```powershell
dsh plugin --profile web add github:MeteorNOX/DeepSeek-Balance-Whale-Widget
```

**Endpoints used:**

| Endpoint | Purpose |
|---|---|
| `http://127.0.0.1:<port>/dsh-whale/balance.json` | Balance, today's usage, peak/off-peak flag |
| `http://127.0.0.1:<port>/dsh-whale/last-turn.json` | Last turn's cost and token count |

Ports are probed in the order `3080 → 3081 → 3082 → 3090`; the first to respond is cached and preferred.

> 💡 Rationale: plugin JS ships as **plain text**, so embedding a DeepSeek API key would be unsafe. Reusing DSH's computed values also avoids two divergent implementations of peak/off-peak pricing.

## Installation

1. Download this repository (or the zip from [Releases](../../releases))
2. Copy the whole `com.hamiy.dshmonitor.mPanelPlugin` folder into:

   ```
   %APPDATA%\HotSpot\MiraBox Craft\plugins\
   ```

   The final path should be:

   ```
   C:\Users\<you>\AppData\Roaming\HotSpot\MiraBox Craft\plugins\com.hamiy.dshmonitor.mPanelPlugin\manifest.json
   ```

3. **Fully quit** MiraBox Craft (right-click the tray icon → Exit — closing the window is not enough)
4. Reopen it, find category **DSH** → widget **DSH Monitor**, and drag it onto your canvas

> ⚠️ After editing plugin code you **must restart** MiraBox Craft. QtWebEngine caches the plugin page, so replacing files alone has no effect.

## Configuration

Right-click the widget on the canvas → Settings:

| Option | Default | Notes |
|---|---|---|
| Peak wording | 梁文峰 / 梁文谷 | Switchable to 高峰时段 / 空闲时段 or !?峰峰?! / !?谷谷?! |
| Refresh interval | 30 s | Minimum 5 s |
| Today's usage | on | Show/hide |
| Last-turn cost | on | Show/hide cost and token count |

**Interaction:** click the widget to refresh immediately.

## How it works

MiraBox Craft uses the **StreamDock plugin protocol** (docs: [sdk.key123.vip](https://sdk.key123.vip/)). A widget consists of:

```
com.hamiy.dshmonitor.mPanelPlugin/
├── manifest.json              declares the action (UUID / icon / defaults / controller)
├── plugin/
│   ├── index.html             entry page (the manifest's CodePath)
│   ├── sdk.js                 WebSocket layer + canvas helpers
│   └── index.js               data fetching + drawing
├── propertyInspector/
│   └── index.html             settings panel
└── static/
    ├── icon.png
    └── whale.png
```

After loading `plugin/index.html`, the host calls a global function:

```js
connectElgatoStreamDeckSocket(port, pluginUUID, registerEvent, info)
```

The plugin connects to `ws://127.0.0.1:<port>`, registers, and then exchanges events:

| Direction | Events |
|---|---|
| host → plugin | `willAppear`, `willDisappear`, `didReceiveSettings`, `keyUp` |
| plugin → host | `setImage`, `setTitle`, `setSettings` |

So "displaying anything" reduces to: **compute the frame periodically → render to a PNG → push it with `setImage`**.

Implementation notes:

- **Text inside an ellipse**: available width varies with height (widest in the middle). Each row's width is computed from its vertical position (`halfW = rx·√(1−(dy/ry)²)`) rather than assumed from the bounding box — otherwise corner text gets clipped by the ellipse.
- **Tail merged into one path**: drawing the ellipse and then a separate triangle would leave a stroke line across the tail's base. Instead `ctx.ellipse()` sweeps around leaving a gap, then `lineTo` the tail tip and closes — one fill, one stroke, seamless outline.
- **Whale art ships with the plugin**, so the character still renders when DSH is down; only the bubble text changes to "DSH 未运行".

## Development

The plugin is plain browser JS, so its real drawing logic can be driven offline from Node — useful for verifying changes without restarting the app repeatedly.

**Setup** (`@napi-rs/canvas` is not bundled):

```powershell
cd tools
npm i @napi-rs/canvas
```

Or reuse the copy shipped inside MiraBox Craft:

```powershell
$env:NAPI_CANVAS="C:\Program Files\MiraBoxCraft\defaultPlugins\com.hotspot.streamdock.system.monitor.text.mPanelPlugin\plugin\node_modules\@napi-rs\canvas"
```

**Run:**

```powershell
node tools/smoketest.js   # size × state matrix, asserts nothing throws
node tools/pixeltest.js   # real rendering + pixel assertions, regenerates preview/
```

`tools/harness.js` loads the plugin into a VM sandbox with stubs for `document` / `Image` / `XMLHttpRequest` / `WebSocket`, and intercepts three calls so correctness — not just "no exception" — can be asserted:

| Intercepted | Assertion it enables |
|---|---|
| `ctx.ellipse()` | The ellipse radii the plugin computed → aspect ratio and bounds |
| `ctx.fillText()` | The exact strings drawn → layout decisions such as row merging |
| `WebSocket.send()` | The `setImage` data URL → final frame for pixel analysis |

See [`tools/README.md`](tools/README.md).

## Assets & License

### This project

Released under the **MIT License** — see [LICENSE](LICENSE).

### Third-party assets

| File / content | Source | License |
|---|---|---|
| `static/whale.png` (whale-girl art) | `assets/DSniang1.png` from [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget) | MIT, © 2026 MeteorNOX |
| Peak wording and colours `#e0433f` / `#2fa24c` / `#203170` | Same project | MIT, © 2026 MeteorNOX |
| Plugin protocol / SDK conventions | [StreamDock Plugin SDK](https://sdk.key123.vip/) | Respective owners |
| `static/icon.png` | Original to this project | Same as this project |

**The whale-girl artwork is not original to this project.** It was copied from the MIT-licensed project above and remains © MeteorNOX. The full upstream license text is reproduced in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

To use your own artwork, replace `static/whale.png` (square, with alpha recommended; it is scaled to fill the whale area).

### Disclaimer

This is a personal project. It is **not affiliated with, sponsored by, or endorsed by** DeepSeek or MiraBox. "DeepSeek", "MiraBox" and related names are trademarks of their respective owners.

## Known limitations

- **Data requires DSH + dsh-whale-widget** on the same machine. Without DSH running, the widget shows "DSH 未运行" rather than going blank.
- **Depends on the upstream endpoint paths** (`/dsh-whale/balance.json`, `/dsh-whale/last-turn.json`). If upstream changes them, update `PATH_BALANCE` / `PATH_TURN` in `plugin/index.js`.
- **Only tested on Windows with a D5 in vertical orientation.** The plugin code itself is platform-neutral; the install path is Windows-specific.
- Cross-origin requests rely on QtWebEngine allowing a `file://` page to reach `http://127.0.0.1`. Verified working locally (MiraBox Craft's own plugins do the same).

## Changelog

### 2.4.1
- **Fixed: the status dot was overlapping the bubble outline.** Its position was pinned at -45° / 0.94 of the radius, which left negative clearance once the ellipse was flattened (measured +0.5px at 480×240 and −0.2px at 240×120, i.e. actual overlap)
- The dot is now placed via the ellipse's parametric equation and pulled inward along that direction, keeping roughly 3–5.5px of clearance at any size or aspect ratio
- New self-check: locate the dot in the rendered output, measure its real clearance to the outline, and assert it never touches

### 2.4.0
- Doubled the default widget size: 320×160 → 480×240

### 2.3.0
- Ellipse aspect ratio 1.6 → 2.0 (noticeably wider)
- Reduced the whale's width share to give the bubble more room
- Added: detail rows merge into one line when the ellipse is too flat for four rows

### 2.2.0
- Ellipse now targets an aspect ratio instead of filling its bounding box (previously nearly circular)
- Added self-check intercepting `ctx.ellipse()` to verify the real shape

### 2.1.0
- Bubble changed to an ellipse with a `#203170` outline
- Fixed: `roundRect()` called `ctx.stroke()` unconditionally, drawing an unwanted default black border
- Fixed: the settings panel replaced settings wholesale, wiping `ActionGeometry` (widget size)

### 2.0.0
- Redesigned as whale-girl + speech bubble; peak wording became «梁文峰 / 梁文谷»
- Whale artwork now ships with the plugin

### 1.0.0
- First working release: balance / today's usage / last-turn cost, with automatic port detection
