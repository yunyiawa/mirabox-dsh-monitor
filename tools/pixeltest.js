'use strict';

/*
 * 渲染自检 + 预览图导出。
 *
 * 不只是跑通，还要断言「画出来的东西是对的」：
 *   - 椭圆长宽比是否等于插件里的 BUBBLE_ASPECT
 *   - 椭圆是否超出画布
 *   - 白色气泡 / #203170 描边 / 深色文字 是否真的存在
 *   - 扁平椭圆下明细行是否正确合并（否则字号会不可读）
 *
 * 同时把每个用例的真实输出写成 PNG，产物即仓库 preview/ 里的预览图。
 *
 * 用法: node tools/pixeltest.js
 */

const fs = require('fs');
const path = require('path');
const { loadPlugin, dataUrlToBuffer, ROOT } = require('./harness');

const OUT_DIR = path.join(ROOT, 'preview');

/* 描边目标色 #203170 */
const OUTLINE_RGB = [32, 49, 112];
const OUTLINE_TOL = 26;

const h = loadPlugin();
const T = h.api;
const UUID = T.ACTION_UUID;

const BAL = { ok: true, totalBalance: 5.81, currency: 'CNY', isPeak: false, todayUsage: 1.24 };
const BAL_PEAK = { ok: true, totalBalance: 123.45, currency: 'CNY', isPeak: true, todayUsage: 98.76 };
const TURN = { ok: true, amount: 0.5253038999999998, tokens: 3290229 };

/** 统计一张 PNG 的像素特征 */
async function analyze(dataUrl) {
	const img = await h.loadImage(dataUrlToBuffer(dataUrl));
	const c = h.createCanvas(img.width, img.height);
	const ctx = c.getContext('2d');
	ctx.drawImage(img, 0, 0);
	const d = ctx.getImageData(0, 0, img.width, img.height).data;

	const total = img.width * img.height;
	let opaque = 0, nearWhite = 0, dark = 0, colored = 0, outline = 0;
	for (let i = 0; i < d.length; i += 4) {
		const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
		if (a < 16) continue;
		opaque++;
		const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
		if (mn > 225) nearWhite++;
		else if (mx < 110) dark++;
		if (mx - mn > 50) colored++;
		if (Math.abs(r - OUTLINE_RGB[0]) <= OUTLINE_TOL &&
			Math.abs(g - OUTLINE_RGB[1]) <= OUTLINE_TOL &&
			Math.abs(b - OUTLINE_RGB[2]) <= OUTLINE_TOL) outline++;
	}
	return {
		w: img.width, h: img.height,
		opaque: opaque / total,
		nearWhite: nearWhite / total,
		dark: dark / total,
		colored: colored / total,
		outline: outline / total
	};
}

let failures = 0;

/*
 * 定位状态灯并测量它到气泡描边的净空。
 * 状态灯是唯一使用状态色的元素，按颜色即可从渲染结果里反解出它的圆心，
 * 再用椭圆参数方程采样求最近边界距离——这样「灯有没有压到边框上」
 * 就成了可断言的事实，而不是靠肉眼判断。
 */
async function measureDot(dataUrl, status, geom) {
	const COLORS = { ok: [34, 197, 94], error: [224, 67, 63], loading: [245, 158, 11] };
	const rgb = COLORS[status];
	if (!rgb || !geom) return null;

	const img = await h.loadImage(dataUrlToBuffer(dataUrl));
	const W = img.width, H = img.height;
	const c = h.createCanvas(W, H);
	const ctx = c.getContext('2d');
	ctx.drawImage(img, 0, 0);
	const d = ctx.getImageData(0, 0, W, H).data;

	/* 收集状态色像素 */
	const mask = new Uint8Array(W * H);
	for (let i = 0; i < d.length; i += 4) {
		if (d[i + 3] < 128) continue;
		if (Math.abs(d[i] - rgb[0]) <= 30 &&
			Math.abs(d[i + 1] - rgb[1]) <= 30 &&
			Math.abs(d[i + 2] - rgb[2]) <= 30) {
			mask[i / 4] = 1;
		}
	}

	/*
	 * 连通域聚类后挑「最像实心圆」的一块。
	 * 不能直接对全部同色像素求质心：谷时文案「梁文谷」用的绿色与状态灯同色系，
	 * 其抗锯齿边缘会被一并算进去，把质心拉偏（实测会差出 10px 以上）。
	 * 实心圆的 填充率×方正度 接近 0.785，细笔画文字远低于此，据此可区分。
	 */
	const seen = new Uint8Array(W * H);
	let best = null;
	for (let s = 0; s < mask.length; s++) {
		if (!mask[s] || seen[s]) continue;
		const stack = [s];
		seen[s] = 1;
		let n = 0, sx = 0, sy = 0, minX = W, maxX = -1, minY = H, maxY = -1;
		while (stack.length) {
			const p = stack.pop();
			const px = p % W, py = (p / W) | 0;
			n++; sx += px; sy += py;
			if (px < minX) minX = px;
			if (px > maxX) maxX = px;
			if (py < minY) minY = py;
			if (py > maxY) maxY = py;
			for (let oy = -1; oy <= 1; oy++) {
				for (let ox = -1; ox <= 1; ox++) {
					const nx = px + ox, ny = py + oy;
					if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
					const q = ny * W + nx;
					if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
				}
			}
		}
		const bw = maxX - minX + 1, bh = maxY - minY + 1;
		const fill = n / (bw * bh);
		const squareness = Math.min(bw, bh) / Math.max(bw, bh);
		const score = fill * squareness;
		if (n >= 3 && (!best || score > best.score)) {
			best = { score, n, x: sx / n, y: sy / n, bw, bh, fill };
		}
	}
	if (!best) return null;

	const px = best.x, py = best.y;

	/* 采样求圆心到椭圆边界的最近距离 */
	let nearest = Infinity;
	for (let i = 0; i < 1440; i++) {
		const t = i * Math.PI / 720;
		const ex = geom.cx + geom.rx * Math.cos(t);
		const ey = geom.cy + geom.ry * Math.sin(t);
		const dd = Math.hypot(ex - px, ey - py);
		if (dd < nearest) nearest = dd;
	}

	const dotR = Math.max(3, Math.round(Math.min(W, H) * 0.022));
	return {
		x: px, y: py,
		blobW: best.bw, blobH: best.bh, blobPx: best.n, fill: best.fill,
		dist: nearest,
		dotR: dotR,
		gap: nearest - dotR,       /* 灯外缘到描边的净空，负数即压线 */
		dy: py - geom.cy           /* 相对椭圆中心的垂直偏移，负数=偏上 */
	};
}

async function shot(file, label, w, hh, status, balance, turn, over) {
	const ctx = 'c';
	T.instances[ctx] = {
		settings: Object.assign({}, T.DEFAULT_SETTINGS,
			{ ActionGeometry: { width: w, height: hh } }, over || {}),
		status, balance, turn, timer: null
	};

	h.reset();
	T.render(ctx);
	const geom = h.ellipseCalls[0] || null;
	const texts = h.drawnTexts.slice();
	delete T.instances[ctx];

	const warn = [];
	if (!h.captured) {
		console.log(file.padEnd(30) + '  ✗ 没有产生图像');
		failures++;
		return;
	}

	const stat = await analyze(h.captured);
	fs.writeFileSync(path.join(OUT_DIR, file), dataUrlToBuffer(h.captured));

	if (stat.opaque < 0.30) warn.push('画面过空');
	if (stat.nearWhite < 0.05) warn.push('没有白色气泡');
	if (stat.colored < 0.005) warn.push('没有鲸鱼/彩色内容');
	if (stat.dark < 0.002 && status === 'ok') warn.push('没有文字');
	if (stat.outline < 0.002) warn.push('没有 #203170 描边');

	if (!geom) {
		warn.push('没有绘制椭圆');
	} else {
		const a = geom.rx / geom.ry;
		if (Math.abs(a - T.BUBBLE_ASPECT) > 0.03) {
			warn.push('椭圆比例 ' + a.toFixed(2) + ' != ' + T.BUBBLE_ASPECT);
		}
		if (2 * geom.rx > w + 1 || 2 * geom.ry > hh + 1) warn.push('椭圆超出画布');
	}

	let layout = '';
	if (status === 'ok') {
		const merged = texts.some((t) => t.indexOf('·') >= 0 && t.indexOf('今日') >= 0);
		const separate = texts.some((t) => t.indexOf('今日已用') >= 0);
		layout = merged ? '明细合并' : (separate ? '明细两行' : '明细缺失');
		if (merged && separate) warn.push('明细行重复绘制');
	}

	/* 状态灯不得压到气泡描边上 */
	const dot = await measureDot(h.captured, status, geom);
	let dotTxt = 'n/a';
	if (!dot) {
		warn.push('没能定位到状态灯');
	} else {
		dotTxt = '净空' + dot.gap.toFixed(1) + 'px';
		if (dot.gap < 2) warn.push('状态灯压到气泡边框（净空 ' + dot.gap.toFixed(1) + 'px）');
	}

	if (warn.length) failures++;
	console.log(
		file.padEnd(30) +
		String(w + 'x' + hh).padEnd(10) +
		'椭圆=' + (geom ? Math.round(geom.rx * 2) + 'x' + Math.round(geom.ry * 2) : 'n/a').padEnd(10) +
		'比例=' + (geom ? (geom.rx / geom.ry).toFixed(2) : 'n/a').padEnd(6) +
		layout.padEnd(10) +
		dotTxt.padEnd(13) +
		(warn.length ? '✗ ' + warn.join(' / ') : '✓')
	);
}

(async function main() {
	fs.mkdirSync(OUT_DIR, { recursive: true });

	/* 触发 willAppear 让鲸鱼图开始加载 */
	T.$AD[UUID].willAppear({ context: 'warmup', action: UUID, payload: { settings: Object.assign({}, T.DEFAULT_SETTINGS) } });
	await h.wait(800);

	console.log('=== 渲染自检 ===');
	await shot('preview-480x240-valley.png', '默认尺寸 谷时', 480, 240, 'ok', BAL, TURN);
	await shot('preview-480x240-peak.png', '默认尺寸 峰时', 480, 240, 'ok', BAL_PEAK, TURN);
	await shot('preview-320x160-valley.png', '320x160 谷时', 320, 160, 'ok', BAL, TURN);
	await shot('preview-320x160-peak.png', '320x160 峰时', 320, 160, 'ok', BAL_PEAK, TURN);
	await shot('preview-480x160.png', '480x160', 480, 160, 'ok', BAL, TURN);
	await shot('preview-240x120.png', '240x120', 240, 120, 'ok', BAL, TURN);
	await shot('preview-200x200.png', '方形 200x200', 200, 200, 'ok', BAL, TURN);
	await shot('preview-160x120.png', '小尺寸 160x120', 160, 120, 'ok', BAL, TURN);
	await shot('preview-offline.png', 'DSH 未运行', 480, 240, 'error', null, null);

	console.log('');
	console.log(failures === 0
		? '全部通过，预览图已写入 ' + OUT_DIR
		: failures + ' 个用例有问题');
	process.exit(failures === 0 ? 0 : 1);
})();
