'use strict';

/*
 * 冒烟测试：遍历「尺寸 × 状态」组合跑一遍绘制逻辑，只断言不抛异常。
 *
 * 目的是在装进 MiraBox Craft 之前先抓运行时错误（比如变量名写错、
 * 某条分支在某些尺寸下除零、椭圆半径越界之类）。
 *
 * 用法: node tools/smoketest.js
 */

const { loadPlugin } = require('./harness');

const h = loadPlugin();
const T = h.api;
const UUID = T.ACTION_UUID;

const BAL = {
	ok: true, totalBalance: 5.81, currency: 'CNY',
	updatedAt: '2026-09-12T17:49:19Z', isPeak: false, todayUsage: 1.24, usageMode: 'ledger'
};
const BAL_PEAK = Object.assign({}, BAL, { isPeak: true, totalBalance: 123.45, todayUsage: 98.76 });
const TURN = { ok: true, seq: 7, turn: 2, amount: 0.5253038999999998, tokens: 3290229 };

function settings(over) {
	return Object.assign({}, T.DEFAULT_SETTINGS, over || {});
}

function run(label, w, hh, status, balance, turn, over) {
	const ctx = 'c-' + label;
	T.instances[ctx] = {
		settings: settings(Object.assign({ ActionGeometry: { width: w, height: hh } }, over || {})),
		status, balance, turn, timer: null
	};
	try {
		T.render(ctx);
	} catch (e) {
		console.log('  FAIL  ' + label + '  -> ' + e.message);
		return false;
	}
	delete T.instances[ctx];
	console.log('  ok    ' + label);
	return true;
}

(async function main() {
	/* 触发一次 willAppear，让鲸鱼图开始加载 */
	try {
		T.$AD[UUID].willAppear({
			context: 'warmup', action: UUID,
			payload: { settings: settings() }
		});
	} catch (e) {
		console.log('  willAppear FAIL: ' + e.message);
	}
	await h.wait(600);

	let pass = 0, total = 0;

	console.log('=== 尺寸 × 状态 矩阵 ===');
	const sizes = [
		[480, 240], [320, 160], [240, 120], [400, 200], [200, 200],
		[160, 240], [128, 128], [480, 160], [180, 300], [600, 200]
	];
	const states = [
		['正常-谷时', 'ok', BAL, TURN],
		['正常-峰时', 'ok', BAL_PEAK, TURN],
		['DSH未运行', 'error', null, null],
		['连接中', 'loading', null, null]
	];

	for (const [w, hh] of sizes) {
		for (const [sl, status, bal, turn] of states) {
			total++;
			if (run(w + 'x' + hh + ' ' + sl, w, hh, status, bal, turn)) pass++;
		}
	}

	console.log('');
	console.log('=== 极端情况 ===');
	const edge = [
		['超小 64x64', 64, 64, 'ok', BAL, TURN, {}],
		['超扁 600x60', 600, 60, 'ok', BAL, TURN, {}],
		['超高 60x600', 60, 600, 'ok', BAL, TURN, {}],
		['巨大金额', 480, 240, 'ok', Object.assign({}, BAL, { totalBalance: 999999.99, todayUsage: 88888.88 }), TURN, {}],
		['没有本轮数据', 480, 240, 'ok', BAL, null, {}],
		['关闭全部明细', 480, 240, 'ok', BAL, TURN, { showToday: false, showTurn: false }],
		['只开今日', 480, 240, 'ok', BAL, TURN, { showTurn: false }],
		['只开本轮', 480, 240, 'ok', BAL, TURN, { showToday: false }],
		['零余额', 480, 240, 'ok', Object.assign({}, BAL, { totalBalance: 0, todayUsage: 0 }), TURN, {}]
	];
	for (const [label, w, hh, status, bal, turn, over] of edge) {
		total++;
		if (run(label, w, hh, status, bal, turn, over)) pass++;
	}

	console.log('');
	console.log('结果: ' + pass + '/' + total + ' 通过');
	process.exit(pass === total ? 0 : 1);
})();
