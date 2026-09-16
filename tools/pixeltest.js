'use strict';

/*
 * 渲染自检 + 预览图导出。
 *
 * 不只是跑通，还要断言「画出来的东西是对的」：
 *   - 椭圆长宽比是否等于插件里的 BUBBLE_ASPECT
 *   - 椭圆是否超出画布
 *   - 白色气泡 / #203170 描边 / 深色文字 是否真的存在
 *   - 状态灯与气泡描边之间是否留有净空（早期版本会压线）
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

/** 造一个正常的余额状态 */
function okState(over) {
	return Object.assign({
		status: 'ok',
		balance: 11.12, granted: 0, toppedUp: 11.12, currency: 'CNY',
		isPeak: false, httpCode: '',
		ledger: { day: '2026-09-16', used: 1.77, last: 11.12 },
		timer: null
	}, over || {});
}

/** 造一个失败状态 */
function errState(status, code) {
	return {
		status: status,
		balance: null, granted: 0, toppedUp: 0, currency: 'CNY',
		isPeak: false, httpCode: code || '',
		ledger: { day: '', used: 0, last: null },
		timer: null
	};
}

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
	const COLORS = { ok: [34, 197, 94], loading: [245, 158, 11] };
	const rgb = COLORS[status] || [224, 67, 63];      /* 其余失败态都是红灯 */
	if (!geom) return null;

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
	const dotR = Math.max(3, Math.round(Math.min(W, H) * 0.022));
	/*
	 * 尺寸上限：灯芯直径约 1.24×dotR，抗锯齿后包围盒再宽一点。
	 * 失败态的文字用的是同一个红色（C_PEAK），若不限制尺寸，检测器会
	 * 挑到更"方正"的字形，测出与真实位置无关的净空。
	 */
	const maxBlob = Math.max(10, Math.round(dotR * 4));
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
		if (Math.max(bw, bh) > maxBlob) continue;       /* 太大 → 是文字，不是灯 */
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

	return {
		x: px, y: py,
		blobW: best.bw, blobH: best.bh, blobPx: best.n, fill: best.fill,
		dist: nearest,
		dotR: dotR,
		gap: nearest - dotR,       /* 灯外缘到描边的净空，负数即压线 */
		dy: py - geom.cy           /* 相对椭圆中心的垂直偏移，负数=偏上 */
	};
}

async function shot(file, label, w, hh, state, over) {
	const ctx = 'c';
	T.instances[ctx] = Object.assign({
		settings: Object.assign({}, T.DEFAULT_SETTINGS,
			{ ActionGeometry: { width: w, height: hh } }, over || {})
	}, state);

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
	if (stat.dark < 0.002 && state.status === 'ok') warn.push('没有文字');
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

	/* 状态灯不得压到气泡描边上 */
	const dot = await measureDot(h.captured, state.status, geom);
	let dotTxt = 'n/a';
	if (!dot) {
		warn.push('没能定位到状态灯');
	} else {
		dotTxt = '净空' + dot.gap.toFixed(1) + 'px';
		if (dot.gap < 2) warn.push('状态灯压到气泡边框（净空 ' + dot.gap.toFixed(1) + 'px）');
	}

	/* 文案断言：该出现的字必须真的画出来了 */
	const joined = texts.join(' | ');
	const expect = {
		ok: ['当前时间段为:', '¥', '今日已用'],
		nokey: ['未配置 API Key'],
		auth: ['API Key 无效'],
		net: ['网络不可用'],
		timeout: ['网络不可用'],
		parse: ['返回格式异常'],
		loading: ['连接中']
	}[state.status] || [];
	for (const e of expect) {
		if (joined.indexOf(e) === -1) warn.push('缺少文案「' + e + '」');
	}

	/* 赠送/充值行的文案随 granted 是否为 0 而变，两种都算合格 */
	if (state.status === 'ok' && (!over || over.showDetail !== false)) {
		if (joined.indexOf('赠送') === -1 && joined.indexOf('充值余额') === -1) {
			warn.push('缺少赠送/充值行');
		}
	}

	if (warn.length) failures++;
	console.log(
		file.padEnd(30) +
		String(w + 'x' + hh).padEnd(10) +
		'椭圆=' + (geom ? Math.round(geom.rx * 2) + 'x' + Math.round(geom.ry * 2) : 'n/a').padEnd(10) +
		dotTxt.padEnd(13) +
		(warn.length ? '✗ ' + warn.join(' / ') : '✓')
	);
}

(async function main() {
	fs.rmSync(OUT_DIR, { recursive: true, force: true });
	fs.mkdirSync(OUT_DIR, { recursive: true });

	/* 触发 willAppear 让鲸鱼图开始加载 */
	T.$AD[UUID].willAppear({ context: 'warmup', action: UUID, payload: { settings: Object.assign({}, T.DEFAULT_SETTINGS) } });
	await h.wait(800);

	console.log('=== 渲染自检 ===');
	await shot('preview-480x240-valley.png', '默认尺寸 谷时', 480, 240, okState());
	await shot('preview-480x240-peak.png', '默认尺寸 峰时', 480, 240, okState({ isPeak: true, balance: 123.45, granted: 20, toppedUp: 103.45 }));
	await shot('preview-320x160-valley.png', '320x160 谷时', 320, 160, okState());
	await shot('preview-320x160-peak.png', '320x160 峰时', 320, 160, okState({ isPeak: true }));
	await shot('preview-480x160.png', '480x160', 480, 160, okState());
	await shot('preview-240x120.png', '240x120', 240, 120, okState());
	await shot('preview-200x200.png', '方形 200x200', 200, 200, okState());
	await shot('preview-160x120.png', '小尺寸 160x120', 160, 120, okState());
	await shot('preview-nokey.png', '未配置 API Key', 480, 240, errState('nokey'));
	await shot('preview-auth.png', 'API Key 无效', 480, 240, errState('auth'));
	await shot('preview-offline.png', '网络不可用', 480, 240, errState('net'));

	console.log('');
	console.log(failures === 0
		? '全部通过，预览图已写入 ' + OUT_DIR
		: failures + ' 个用例有问题');
	process.exit(failures === 0 ? 0 : 1);
})();
