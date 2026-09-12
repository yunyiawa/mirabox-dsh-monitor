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

	if (warn.length) failures++;
	console.log(
		file.padEnd(30) +
		String(w + 'x' + hh).padEnd(10) +
		'椭圆=' + (geom ? Math.round(geom.rx * 2) + 'x' + Math.round(geom.ry * 2) : 'n/a').padEnd(10) +
		'比例=' + (geom ? (geom.rx / geom.ry).toFixed(2) : 'n/a').padEnd(6) +
		layout.padEnd(10) +
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
