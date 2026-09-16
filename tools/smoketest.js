'use strict';

/*
 * 冒烟测试：遍历「尺寸 × 状态」组合跑一遍绘制逻辑，只断言不抛异常。
 *
 * 目的是在装进 MiraBox Craft 之前先抓运行时错误（变量名写错、
 * 某条分支在特定尺寸下除零、椭圆半径越界之类）。
 *
 * v3 起数据直接来自 DeepSeek 官方接口，因此这里把各种失败态
 * （未配置 Key / Key 无效 / 网络不可用 / 超时 / HTTP 错误 / 返回异常）
 * 也一并覆盖——它们各自走不同的文案分支，最容易漏测。
 *
 * 用法: node tools/smoketest.js
 */

const { loadPlugin } = require('./harness');

const h = loadPlugin();
const T = h.api;
const UUID = T.ACTION_UUID;

/** 造一个正常的余额状态 */
function okState(over) {
	return Object.assign({
		status: 'ok',
		balance: 11.12,
		granted: 0,
		toppedUp: 11.12,
		currency: 'CNY',
		isPeak: false,
		httpCode: '',
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

function settings(over) {
	return Object.assign({}, T.DEFAULT_SETTINGS, over || {});
}

function run(label, w, hh, state, over) {
	const ctx = 'c-' + label;
	const s = settings(Object.assign({ ActionGeometry: { width: w, height: hh } }, over || {}));
	T.instances[ctx] = Object.assign({ settings: s }, state);
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
	await h.wait(700);

	let pass = 0, total = 0;

	console.log('=== 尺寸 × 状态 矩阵 ===');
	const sizes = [
		[480, 240], [320, 160], [240, 120], [400, 200], [200, 200],
		[160, 240], [128, 128], [480, 160], [180, 300], [600, 200]
	];
	const states = [
		['正常-谷时', okState()],
		['正常-峰时', okState({ isPeak: true, balance: 123.45, granted: 20, toppedUp: 103.45 })],
		['加载中', errState('loading')],
		['未配置Key', errState('nokey')],
		['Key无效', errState('auth')],
		['网络不可用', errState('net')],
		['请求超时', errState('timeout')],
		['HTTP错误', errState('http', 500)],
		['返回异常', errState('parse')]
	];

	for (const [w, hh] of sizes) {
		for (const [sl, state] of states) {
			total++;
			if (run(w + 'x' + hh + ' ' + sl, w, hh, state)) pass++;
		}
	}

	console.log('');
	console.log('=== 极端情况 ===');
	const zero = okState({ balance: 0, granted: 0, toppedUp: 0, ledger: { day: 'x', used: 0, last: 0 } });
	const edge = [
		['超小 64x64', 64, 64, okState(), {}],
		['超扁 600x60', 600, 60, okState(), {}],
		['超高 60x600', 60, 600, okState(), {}],
		['巨大金额', 480, 240, okState({ balance: 999999.99, toppedUp: 999999.99, ledger: { day: 'x', used: 88888.88, last: 999999.99 } }), {}],
		['余额为零', 480, 240, zero, {}],
		['赠送大于充值', 480, 240, okState({ granted: 50, toppedUp: 10, balance: 60 }), {}],
		['关闭今日已用', 480, 240, okState(), { showToday: false }],
		['关闭赠送充值', 480, 240, okState(), { showDetail: false }],
		['全部明细关闭', 480, 240, okState(), { showToday: false, showDetail: false }],
		['记账未初始化', 480, 240, okState({ ledger: { day: '', used: 0, last: null } }), {}]
	];
	for (const [label, w, hh, state, over] of edge) {
		total++;
		if (run(label, w, hh, state, over)) pass++;
	}

	console.log('');
	console.log('结果: ' + pass + '/' + total + ' 通过');
	process.exit(pass === total ? 0 : 1);
})();
