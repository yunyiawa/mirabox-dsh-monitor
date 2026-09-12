'use strict';

/*
 * 测试用最小 harness：把 MiraBox Craft 插件加载进 Node 的 VM 沙箱里跑。
 *
 * 插件本身是为 QtWebEngine 写的（依赖 document / Image / XMLHttpRequest / WebSocket），
 * 这里用最小桩件把这些补齐，并用 @napi-rs/canvas 提供真实的 Canvas 2D 实现，
 * 于是可以在不打开 MiraBox Craft 的情况下真实执行插件的绘制逻辑。
 *
 * 顺带做了两处插桩，供测试断言用：
 *   - 拦截 ctx.ellipse()   -> 读插件算出的椭圆半径（验证形状）
 *   - 拦截 ctx.fillText()  -> 读真正画出去的字符串（验证排版取舍）
 *   - 拦截 WebSocket.send() -> 截获 setImage 的 dataURL（拿到最终画面）
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN_CODE_DIR = path.join(ROOT, 'com.hamiy.dshmonitor.mPanelPlugin', 'plugin');

/**
 * @napi-rs/canvas 不随本仓库分发，需要从外部提供。
 * 查找顺序：NAPI_CANVAS 环境变量 -> 已安装的 node_modules -> MiraBox Craft 自带的那份。
 */
function resolveCanvas() {
	const candidates = [];
	if (process.env.NAPI_CANVAS) candidates.push(process.env.NAPI_CANVAS);
	candidates.push('@napi-rs/canvas');
	if (process.env.MIRABOX_DIR) {
		candidates.push(path.join(process.env.MIRABOX_DIR,
			'defaultPlugins', 'com.hotspot.streamdock.system.monitor.text.mPanelPlugin',
			'plugin', 'node_modules', '@napi-rs', 'canvas'));
	}
	candidates.push(path.join('C:/Program Files/MiraBoxCraft',
		'defaultPlugins', 'com.hotspot.streamdock.system.monitor.text.mPanelPlugin',
		'plugin', 'node_modules', '@napi-rs', 'canvas'));

	for (const c of candidates) {
		try {
			return require(c);
		} catch (e) { /* 试下一个 */ }
	}
	throw new Error(
		'找不到 @napi-rs/canvas。\n' +
		'请任选其一：\n' +
		'  1) 设置环境变量 NAPI_CANVAS 指向该包目录\n' +
		'  2) 在本目录执行 npm i @napi-rs/canvas\n' +
		'  3) 设置 MIRABOX_DIR 指向 MiraBox Craft 安装目录'
	);
}

/**
 * 加载插件，返回可驱动它的句柄。
 */
function loadPlugin() {
	const { createCanvas, loadImage } = resolveCanvas();

	const ellipseCalls = [];
	const drawnTexts = [];
	let captured = null;

	/* 把 @napi-rs 的 Image 包一层，让插件里 `new Image(); img.src=...` 的写法可用 */
	class FakeImage {
		constructor() {
			this.__real = null;
			this.onload = null;
			this.onerror = null;
		}
		set src(v) {
			loadImage(path.resolve(PLUGIN_CODE_DIR, v)).then((img) => {
				this.__real = img;
				if (this.onload) this.onload();
			}).catch((e) => {
				if (this.onerror) this.onerror(e);
			});
		}
		get width() { return this.__real ? this.__real.width : 0; }
		get height() { return this.__real ? this.__real.height : 0; }
	}

	function makeCanvas(w, h) {
		const c = createCanvas(w || 1, h || 1);
		const ctx = c.getContext('2d');

		const origDraw = ctx.drawImage.bind(ctx);
		ctx.drawImage = function (img) {
			const real = img && img.__real ? img.__real : img;
			if (!real) return;
			return origDraw.apply(null, [real].concat(Array.prototype.slice.call(arguments, 1)));
		};

		const origEllipse = ctx.ellipse.bind(ctx);
		ctx.ellipse = function (x, y, rx, ry, rot, a0, a1, ccw) {
			ellipseCalls.push({ cx: x, cy: y, rx: rx, ry: ry });
			return origEllipse(x, y, rx, ry, rot, a0, a1, ccw);
		};

		const origFillText = ctx.fillText.bind(ctx);
		ctx.fillText = function (text) {
			drawnTexts.push(String(text));
			return origFillText.apply(null, arguments);
		};

		return c;
	}

	const sandbox = {
		console,
		document: {
			createElement(tag) {
				if (tag === 'canvas') return makeCanvas(1, 1);
				throw new Error('unexpected createElement: ' + tag);
			}
		},
		Image: FakeImage,
		/* 测试不联网：请求直接失败，插件会走降级分支 */
		XMLHttpRequest: function () {
			this.open = function () { };
			this.send = function () { };
		},
		WebSocket: function () { },
		setInterval: () => 0,
		clearInterval: () => { },
		setTimeout: (fn) => { fn(); return 0; },
		Date, Math, JSON, parseInt, parseFloat, isNaN,
		Number, String, Boolean, Object, Array, Error, Promise
	};
	sandbox.globalThis = sandbox;

	const src = ['sdk.js', 'index.js']
		.map((f) => fs.readFileSync(path.join(PLUGIN_CODE_DIR, f), 'utf8'))
		.join('\n')
		+ '\nglobalThis.__t = { $AD, instances, render, DEFAULT_SETTINGS, ACTION_UUID, BUBBLE_ASPECT,'
		+ ' setWs: (w) => { websocket = w; } };';

	vm.createContext(sandbox);
	vm.runInContext(src, sandbox, { filename: 'plugin-bundle.js' });

	const api = sandbox.__t;

	/* 让 $SD.setImage 把结果交给我们 */
	api.setWs({
		send: (s) => {
			try {
				const m = JSON.parse(s);
				if (m.event === 'setImage') captured = m.payload.image;
			} catch (e) { /* 忽略非 JSON */ }
		}
	});

	return {
		api,
		ellipseCalls,
		drawnTexts,
		/** 最近一次渲染产出的 PNG dataURL */
		get captured() { return captured; },
		/** 每次用例前清空插桩状态 */
		reset() {
			ellipseCalls.length = 0;
			drawnTexts.length = 0;
			captured = null;
		},
		loadImage,
		createCanvas,
		wait: (ms) => new Promise((r) => setTimeout(r, ms))
	};
}

/** 把 dataURL 解成 PNG Buffer */
function dataUrlToBuffer(dataUrl) {
	return Buffer.from(dataUrl.split(',')[1], 'base64');
}

module.exports = { loadPlugin, dataUrlToBuffer, resolveCanvas, ROOT, PLUGIN_CODE_DIR };
