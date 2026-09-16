# DSH Monitor · Whale-Girl Balance Bubble

> A [MiraBox Craft](https://mirabox.net/) secondary-screen widget (`mPanelPlugin`) that draws your DeepSeek **balance / today's usage / granted & topped-up balance** as a whale-girl with a wide elliptical speech bubble.
>
> **Calls the official DeepSeek balance API directly — no DSH required.**

![Preview](preview/preview-480x240-valley.png)

[中文说明 (Chinese)](README.md)

---

## Features

- 🐋 **Whale-girl + elliptical bubble** — wide flat ellipse, blue outline (`#203170`), tail pointing at the whale
- 💰 **Live balance** as the primary visual
- 📊 **Today's usage** — tracked locally from balance decreases
- 🎁 **Granted / topped-up balance** — provided directly by the official API
- 🕐 **Peak/off-peak badge** — defaults to a Chinese pun («梁文峰 / 梁文谷», after DeepSeek's founder); switchable to plain wording
- 🔌 **Zero middleware** — talks only to `api.deepseek.com`, with no DSH or local service in between
- 📐 **Size-adaptive** — switches between side-by-side and stacked layouts based on aspect ratio; the ellipse takes the largest inscribed shape at a fixed target ratio
- 🧩 **Explicit error states** — missing key / invalid key / network failure / bad response each get their own message; nothing fails silently
- 🟢 **Status dot** — green = ok, amber = querying, red = failed


## Preview

| 480×240, off-peak (default) | 480×240, peak |
|---|---|
| ![off-peak](preview/preview-480x240-valley.png) | ![peak](preview/preview-480x240-peak.png) |

| 320×160 | 480×160 | Square 200×200 |
|---|---|---|
| ![320x160](preview/preview-320x160-valley.png) | ![480x160](preview/preview-480x160.png) | ![200x200](preview/preview-200x200.png) |

| Small 160×120 | Missing API key | Invalid API key | Network unavailable |
|---|---|---|---|
| ![160x120](preview/preview-160x120.png) | ![nokey](preview/preview-nokey.png) | ![auth](preview/preview-auth.png) | ![offline](preview/preview-offline.png) |

> All previews above are rendered offline by `node tools/pixeltest.js` using the plugin's **real drawing code** — they are not hand-made mockups.

## Requirements

| Requirement | Notes |
|---|---|
| **MiraBox Craft** | The secondary-screen software (Windows). Developed against 2.x, D5 in vertical orientation |
| **A DeepSeek API key** | Created at [platform.deepseek.com](https://platform.deepseek.com/api_keys) |

That's it — no DSH, no local service, no intermediate plugin.

### ⚠️ About API key storage

The key you enter in the settings panel is **stored in plaintext** alongside the other widget settings, inside MiraBox Craft's theme config (`%APPDATA%\HotSpot\MiraBox Craft\profiles\*.mPanelTheme\manifest.json`). That is how MiraBox Craft persists plugin settings; the plugin cannot encrypt it.

Therefore:

- Create a **dedicated key** for this widget so you can revoke it independently
- **Do not** reuse that key anywhere outside this machine
- Judge for yourself if the machine is shared

> Versions 2.x stored no key because they reused DSH's local endpoint. v3 trades that away to drop the DSH dependency — you should know the tradeoff.


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
5. **Right-click the widget → Settings → paste your DeepSeek API key → click "Test connection"**

> ⚠️ After editing plugin code you **must restart** MiraBox Craft. QtWebEngine caches the plugin page, so replacing files alone has no effect.

## Configuration

Right-click the widget on the canvas → Settings:

| Option | Default | Notes |
|---|---|---|
| **API key** | empty | DeepSeek API key, created at [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| Peak wording | 梁文峰 / 梁文谷 | Switchable to 高峰时段 / 空闲时段 or !?峰峰?! / !?谷谷?! |
| Refresh interval | 60 s | Minimum 10 s |
| Today's usage | on | Show/hide |
| Granted / topped-up | on | Show/hide |

The **"Test connection"** button in the panel calls the API directly and reports the result, independent of widget state — handy for troubleshooting.

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

### Data source

Every *refresh interval* seconds the plugin requests:

```
GET https://api.deepseek.com/user/balance
Authorization: Bearer <API key>
```

which returns:

```json
{
  "is_available": true,
  "balance_infos": [
    { "currency": "CNY", "total_balance": "11.12",
      "granted_balance": "0.00", "topped_up_balance": "11.12" }
  ]
}
```

The official endpoint returns only the **current balance** — no usage history — so two values are derived locally:

- **Today's usage**: the sum of balance *decreases*. Top-ups do not corrupt it (only decreases are accumulated). It resets at midnight **Beijing time**.
- **Peak / off-peak**: determined locally from the official schedule — weekdays `09:00–12:00` and `14:00–18:00` are peak, everything else is off-peak; **weekends are off-peak all day** (since 2026-08-23).

### Implementation notes

- **Text inside an ellipse**: available width varies with height (widest in the middle). Each row's width is computed from its vertical position (`halfW = rx·√(1−(dy/ry)²)`) rather than assumed from the bounding box — otherwise corner text gets clipped by the ellipse.
- **Tail merged into one path**: drawing the ellipse and then a separate triangle would leave a stroke line across the tail's base. Instead `ctx.ellipse()` sweeps around leaving a gap, then `lineTo` the tail tip and closes — one fill, one stroke, seamless outline.
- **Status dot placement**: derived from the ellipse's parametric equation `(rx·cosθ, ry·sinθ)` and then pulled inward along that direction, guaranteeing clearance from the outline. An earlier version pinned it at `-45° / 0.94 of the radius`, which produced *negative* clearance once the ellipse was flattened — the dot sat on top of the border.
- **Whale art ships with the plugin**, so the character still renders offline; only the bubble text changes to the error reason.

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
| Peak/off-peak schedule rule | Same project (consistent with DeepSeek's official pricing page) | MIT, © 2026 MeteorNOX |
| Plugin protocol / SDK conventions | [StreamDock Plugin SDK](https://sdk.key123.vip/) | Respective owners |
| `static/icon.png` | Original to this project | Same as this project |

**The whale-girl artwork is not original to this project.** It was copied from the MIT-licensed project above and remains © MeteorNOX. The full upstream license text is reproduced in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

To use your own artwork, replace `static/whale.png` (square, with alpha recommended; it is scaled to fill the whale area).

### Disclaimer

This is a personal project. It is **not affiliated with, sponsored by, or endorsed by** DeepSeek or MiraBox. "DeepSeek", "MiraBox" and related names are trademarks of their respective owners.

## Known limitations

- **"Today's usage" only counts while the widget is running.** Consumption that happens while it is not running cannot be seen — the official API exposes no usage history. This is a fundamental limitation, not a bug.
- **No "last-turn cost".** That requires DSH session events, and v3 removed the DSH dependency, so the row is gone. It was replaced by granted / topped-up balance, which the API provides directly.
- **Cross-origin**: the plugin page is `file://` and calls `https://api.deepseek.com`. MiraBox Craft's own plugins fetch third-party APIs from `file://` pages, and this works in practice. If it were ever blocked, the failure surfaces explicitly as "网络不可用" (network unavailable) rather than silently.
- **Only tested on Windows with a D5 in vertical orientation.** The plugin code itself is platform-neutral; the install path is Windows-specific.

## Changelog

### 3.0.0
- **Now calls the official DeepSeek balance API directly — the DSH dependency is gone.** This was forced by `dsh-whale-widget` 0.3.0, which wrapped every local route in DSH's trust fence (`conn.requestRejection`), returning 401 to any request without a browser session and thereby breaking the widget
- Added an API key setting and a "Test connection" button
- Added distinct error states: missing key / invalid key / network failure / timeout / HTTP error / malformed response
- "Today's usage" is now tracked locally (accumulating balance decreases, resetting at midnight Beijing time)
- "Last-turn cost" removed (needs DSH session events); replaced by **granted / topped-up balance** from the official API
- Smoke tests expanded from 49 to 100 cases, covering every failure state

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
