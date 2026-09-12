/*
 * DSH Monitor —— 鲸鱼娘 + 气泡样式
 *
 * 数据来源：本机 DSH Web 服务的 dsh-whale 接口（由 dsh-whale-widget 插件提供）
 *   /dsh-whale/balance.json   -> 余额、今日消耗、峰谷
 *   /dsh-whale/last-turn.json -> 上一轮对话的花费与 token
 *
 * 这样不需要在本插件里保存 DeepSeek API Key，峰谷计价直接复用 DSH 侧结果。
 * DSH 端口不固定（实测见过 3080 / 3081），因此按候选列表自动探测并缓存。
 *
 * 视觉：左侧鲸鱼娘本体，右侧白色气泡；峰谷文案默认玩梁文锋的梗。
 */

const ACTION_UUID = "com.hamiy.dshmonitor.action1";

/* DSH 候选端口，按顺序探测 */
const DSH_PORTS = [3080, 3081, 3082, 3090];
const PATH_BALANCE = "/dsh-whale/balance.json";
const PATH_TURN = "/dsh-whale/last-turn.json";

/* 配色，跟原版小鲸鱼保持一致 */
const C_PEAK = "#e0433f";      /* 峰：红 */
const C_OFF = "#2fa24c";       /* 谷：绿 */
const C_INK = "#203170";       /* 主文字：藏青 */
const C_SUB = "#64748b";       /* 次要文字 */
const C_BUBBLE = "#ffffff";
const C_OUTLINE = "#203170";   /* 气泡描边：与主文字同色 */

/* 气泡椭圆的目标长宽比（rx/ry）。越大越扁，1.0 就是正圆 */
const BUBBLE_ASPECT = 2.0;

/* 每个控件实例的状态，key = context */
const instances = {};

/* 探测成功后缓存，优先复用 */
let activePort = null;

/* 鲸鱼本体：预加载一次，全实例共用 */
let whaleImg = null;
let whaleReady = false;

const DEFAULT_SETTINGS = {
	ActionGeometry: { width: 320, height: 160 },
	refreshSec: 30,
	periodMode: "liangwen",
	showToday: true,
	showTurn: true,
	fontFamily: "Microsoft YaHei"
};

/* ---------------- 数据获取 ---------------- */

function xhrJSON(url, timeoutMs, onOk, onErr) {
	try {
		const x = new XMLHttpRequest();
		x.open("GET", url, true);
		x.timeout = timeoutMs;
		x.onreadystatechange = function () {
			if (x.readyState !== 4) return;
			if (x.status >= 200 && x.status < 300) {
				try {
					onOk(JSON.parse(x.responseText));
				} catch (e) {
					onErr("json");
				}
			} else {
				onErr("http" + x.status);
			}
		};
		x.ontimeout = function () { onErr("timeout"); };
		x.onerror = function () { onErr("net"); };
		x.send();
	} catch (e) {
		onErr("xhr");
	}
}

function fetchFromAnyPort(path, done) {
	const order = activePort
		? [activePort].concat(DSH_PORTS.filter(function (p) { return p !== activePort; }))
		: DSH_PORTS.slice();

	let i = 0;
	function next() {
		if (i >= order.length) {
			done(new Error("no-dsh"), null);
			return;
		}
		const port = order[i++];
		xhrJSON("http://127.0.0.1:" + port + path, 4000, function (json) {
			activePort = port;
			done(null, json);
		}, next);
	}
	next();
}

/* ---------------- 格式化 ---------------- */

function money(v, digits) {
	if (v === null || v === undefined || isNaN(v)) return "--";
	return Number(v).toFixed(digits === undefined ? 2 : digits);
}

function tokens(v) {
	if (!v && v !== 0) return "--";
	if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
	if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
	return String(v);
}

/* 峰谷文案 */
function periodText(isPeak, mode) {
	if (mode === "plain") return isPeak ? "高峰时段" : "空闲时段";
	if (mode === "qiangqiang") return isPeak ? "!?峰峰?!" : "!?谷谷?!";
	return isPeak ? "梁文峰" : "梁文谷";   /* liangwen，默认 */
}

/* ---------------- 鲸鱼本体加载 ---------------- */

function loadWhale() {
	if (whaleImg) return;
	whaleImg = new Image();
	whaleImg.onload = function () {
		whaleReady = true;
		/* 图到了，把所有实例重画一遍 */
		Object.keys(instances).forEach(render);
	};
	whaleImg.onerror = function () {
		whaleReady = false;
	};
	whaleImg.src = "../static/whale.png";
}

/* ---------------- 绘制 ---------------- */

/*
 * 椭圆气泡 + 指向鲸鱼的尖角，合成同一条路径。
 * 合并成单条路径是为了让描边连续：若先画椭圆再补一个三角，
 * 接缝处会留下一条横穿尖角根部的线。
 */
function ellipseBubble(ctx, cx, cy, rx, ry, side, tailSize) {
	ctx.beginPath();
	const t = 0.24;                 /* 尖角在椭圆上占据的角跨度 */
	if (side === "left") {
		const a1 = Math.PI - t;     /* 上侧接点 */
		const a2 = Math.PI + t;     /* 下侧接点 */
		/* 从下侧接点顺时针绕一整圈回到上侧接点，把缺口留给尖角 */
		ctx.ellipse(cx, cy, rx, ry, 0, a2, a1 + Math.PI * 2, false);
		ctx.lineTo(cx - rx * 0.98 - tailSize, cy + ry * 0.42);
	} else {
		const a1 = Math.PI / 2 - t;
		const a2 = Math.PI / 2 + t;
		ctx.ellipse(cx, cy, rx, ry, 0, a2, a1 + Math.PI * 2, false);
		ctx.lineTo(cx + rx * 0.30, cy + ry * 0.98 + tailSize);
	}
	ctx.closePath();
}

function render(context) {
	const st = instances[context];
	if (!st) return;

	const s = st.settings;
	const w = parseInt(s.ActionGeometry && s.ActionGeometry.width) || 320;
	const h = parseInt(s.ActionGeometry && s.ActionGeometry.height) || 160;
	const fam = s.fontFamily || "Microsoft YaHei";

	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d");
	ctx.clearRect(0, 0, w, h);

	const horizontal = w / h >= 1.25;      /* 宽扁 -> 左右排布；否则上下排布 */
	const pad = Math.round(Math.min(w, h) * 0.04);

	/* ---------- 分区 ---------- */
	let whaleX, whaleY, whaleS, bubX, bubY, bubW, bubH, tail;

	if (horizontal) {
		whaleS = Math.min(h - pad * 2, (w - pad * 3) * 0.36);
		whaleX = pad;
		whaleY = h - pad - whaleS;
		bubX = whaleX + whaleS + Math.round(pad * 0.4);
		bubY = pad;
		bubW = w - bubX - pad;
		bubH = h - pad * 2;
		tail = "left";
	} else {
		whaleS = Math.min(w - pad * 2, (h - pad * 3) * 0.46);
		whaleX = w - pad - whaleS;
		whaleY = h - pad - whaleS;
		bubX = pad;
		bubY = pad;
		bubW = w - pad * 2;
		bubH = h - pad * 2 - whaleS - Math.round(pad * 0.6);
		tail = "bottom";
	}

	/* ---------- 气泡：横向宽椭圆 + 蓝色描边 ---------- */
	const cx = bubX + bubW / 2;
	const cyB = bubY + bubH / 2;

	/*
	 * 目标长宽比。气泡区域往往接近正方形，若直接铺满外接框，
	 * 椭圆会长成近似正圆（1.14 左右），不够“横向宽”。
	 * 这里按目标比例取最大内接椭圆：哪个方向先受限，就由它定尺寸，另一边按比例算。
	 */
	let rx, ry;
	if (bubW / bubH >= BUBBLE_ASPECT) {
		ry = bubH / 2;                    /* 高度受限：吃满高度 */
		rx = ry * BUBBLE_ASPECT;
	} else {
		rx = bubW / 2;                    /* 宽度受限：吃满宽度 */
		ry = rx / BUBBLE_ASPECT;
	}

	const tailSize = Math.round(Math.min(rx, ry) * 0.34);
	const strokeW = Math.max(1.5, Math.min(w, h) * 0.014);

	ctx.save();
	ctx.shadowColor = "rgba(0,0,0,0.35)";
	ctx.shadowBlur = Math.round(6 * (Math.min(w, h) / 160));
	ctx.shadowOffsetY = Math.round(2 * (Math.min(w, h) / 160));
	ellipseBubble(ctx, cx, cyB, rx, ry, tail, tailSize);
	ctx.fillStyle = C_BUBBLE;
	ctx.fill();
	ctx.restore();

	/* 尖角与椭圆合成同一条路径，描边才不会在接缝处留线 */
	ellipseBubble(ctx, cx, cyB, rx, ry, tail, tailSize);
	ctx.lineJoin = "round";
	ctx.lineWidth = strokeW;
	ctx.strokeStyle = C_OUTLINE;
	ctx.stroke();

	/* ---------- 气泡内文字 ---------- */
	const st_data = st.status;
	const isPeak = !!(st.balance && st.balance.isPeak);
	const periodColor = isPeak ? C_PEAK : C_OFF;

	/* 组装要显示的行 */
	const rows = [];
	if (st_data === "ok") {
		rows.push({ k: "period" });
		rows.push({ k: "balance" });
		if (s.showToday && s.showTurn) {
			/*
			 * 椭圆压扁后垂直空间变少。若强行排四行，字号会被压到看不清，
			 * 所以行高不足时把两条明细并成一行，优先保住可读性。
			 */
			const bandH = ry * 0.66 * 2;
			if (bandH / 4 < 19) rows.push({ k: "detail" });
			else { rows.push({ k: "today" }); rows.push({ k: "turn" }); }
		} else if (s.showToday) {
			rows.push({ k: "today" });
		} else if (s.showTurn) {
			rows.push({ k: "turn" });
		}
	} else {
		rows.push({ k: "state" });
	}

	/*
	 * 椭圆气泡的文字带。
	 * 关键：椭圆在不同高度上的可用宽度不同（中间最宽、上下收窄），
	 * 所以逐行按该行高度反算真实宽度，否则四角的字会被椭圆切掉。
	 */
	const bandHalf = ry * 0.66;          /* 保持在半高 66% 内，宽度仍然够用 */
	const innerTop = cyB - bandHalf;
	const innerH = bandHalf * 2;
	const rowH = innerH / rows.length;

	function rowWidthAt(rowCy) {
		const dy = (rowCy - cyB) / ry;
		const half = rx * Math.sqrt(Math.max(0.04, 1 - dy * dy));
		return half * 2 * 0.84;          /* 留出描边与呼吸空间 */
	}

	/* 字号同时受行高与该行可用宽度约束 */
	const fitFont = function (text, maxPx, availW, weight) {
		let px = Math.max(6, Math.round(maxPx));
		do {
			ctx.font = (weight || "bold") + " " + px + "px " + fam;
			if (ctx.measureText(text).width <= availW) break;
			px -= 1;
		} while (px > 7);
		return px;
	};

	ctx.textBaseline = "middle";
	ctx.textAlign = "left";

	for (let i = 0; i < rows.length; i++) {
		const rowCy = innerTop + rowH * (i + 0.5);
		const innerW = rowWidthAt(rowCy);
		const innerX = cx - innerW / 2;
		const cy = rowCy;
		const row = rows[i];

		if (row.k === "period") {
			/* 「当前时间段为: 梁文峰」——灰色标签 + 彩色值 */
			const label = "当前时间段为:";
			const value = periodText(isPeak, s.periodMode);
			let px = Math.round(rowH * 0.52);
			px = Math.min(px, Math.round(innerW * 0.30));
			ctx.font = "bold " + px + "px " + fam;
			const lw = ctx.measureText(label).width;
			const sp = Math.round(px * 0.35);
			ctx.font = "bold " + px + "px " + fam;
			const vw = ctx.measureText(value).width;
			const total = lw + sp + vw;
			let x = innerX + Math.max(0, (innerW - total) / 2);

			ctx.fillStyle = C_SUB;
			ctx.fillText(label, x, cy);
			ctx.fillStyle = periodColor;
			ctx.fillText(value, x + lw + sp, cy);

		} else if (row.k === "balance") {
			/* 余额：主视觉 */
			const text = money(st.balance.totalBalance, 2);
			const unit = "¥";
			let px = fitFont(text, Math.round(rowH * 1.15), innerW);
			ctx.font = "bold " + px + "px " + fam;
			const tw = ctx.measureText(text).width;
			let upx = Math.round(px * 0.42);
			ctx.font = "bold " + upx + "px " + fam;
			const uw = ctx.measureText(unit).width;
			const sp = Math.round(px * 0.12);
			let x = innerX + Math.max(0, (innerW - (uw + sp + tw)) / 2);

			ctx.fillStyle = C_INK;
			ctx.font = "bold " + upx + "px " + fam;
			ctx.fillText(unit, x, cy + Math.round(px * 0.16));
			ctx.font = "bold " + px + "px " + fam;
			ctx.fillText(text, x + uw + sp, cy);

		} else if (row.k === "detail") {
			/* 扁平椭圆下的合并行：今日 + 本轮 放同一行 */
			const t = st.turn || {};
			const todayTxt = "今日 ¥" + money(st.balance.todayUsage, 2);
			const turnTxt = (t.amount === null || t.amount === undefined)
				? "本轮 --" : ("本轮 ¥" + money(t.amount, 3));
			const text = todayTxt + "   ·   " + turnTxt;
			const px = fitFont(text, Math.round(rowH * 0.62), innerW);
			ctx.fillStyle = C_INK;
			ctx.font = "bold " + px + "px " + fam;
			ctx.textAlign = "center";
			ctx.fillText(text, innerX + innerW / 2, cy);
			ctx.textAlign = "left";

		} else if (row.k === "today") {
			const text = "今日已用 ¥" + money(st.balance.todayUsage, 2);
			const px = fitFont(text, Math.round(rowH * 0.62), innerW);
			ctx.fillStyle = C_INK;
			ctx.font = "bold " + px + "px " + fam;
			ctx.fillText(text, innerX, cy);

		} else if (row.k === "turn") {
			const t = st.turn || {};
			const left = (t.amount === null || t.amount === undefined)
				? "本轮 --" : ("本轮 ¥" + money(t.amount, 3));
			const right = "· " + tokens(t.tokens) + " tok";
			let px = Math.round(rowH * 0.52);
			ctx.font = "bold " + px + "px " + fam;
			while (px > 7 && ctx.measureText(left).width + ctx.measureText(right).width + px * 0.4 > innerW) {
				px -= 1;
				ctx.font = "bold " + px + "px " + fam;
			}
			ctx.fillStyle = C_INK;
			ctx.fillText(left, innerX, cy);
			ctx.textAlign = "right";
			ctx.fillStyle = C_SUB;
			ctx.fillText(right, innerX + innerW, cy);
			ctx.textAlign = "left";

		} else if (row.k === "state") {
			const text = st_data === "error" ? "DSH 未运行" : "连接中…";
			const px = fitFont(text, Math.round(rowH * 0.72), innerW);
			ctx.fillStyle = st_data === "error" ? C_PEAK : "#d97706";
			ctx.font = "bold " + px + "px " + fam;
			ctx.textAlign = "center";
			ctx.fillText(text, innerX + innerW / 2, cy);
			ctx.textAlign = "left";
		}
	}

	/* ---------- 鲸鱼本体 ---------- */
	if (whaleReady && whaleImg) {
		ctx.drawImage(whaleImg, whaleX, whaleY, whaleS, whaleS);
	} else {
		/* 图还没到：先占位，onload 会重画 */
		ctx.beginPath();
		ctx.arc(whaleX + whaleS / 2, whaleY + whaleS / 2, whaleS * 0.36, 0, Math.PI * 2);
		ctx.fillStyle = "rgba(125,211,252,0.25)";
		ctx.fill();
	}

	/* ---------- 状态灯：贴在椭圆右上边缘，带白色底与同色描边 ---------- */
	const dotR = Math.max(3, Math.round(Math.min(w, h) * 0.022));
	const statusColor = st.status === "ok" ? "#22c55e"
		: st.status === "error" ? C_PEAK : "#f59e0b";
	const dotA = -Math.PI / 4;
	const dotX = cx + rx * Math.cos(dotA) * 0.94;
	const dotY = cyB + ry * Math.sin(dotA) * 0.94;

	ctx.beginPath();
	ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
	ctx.fillStyle = C_BUBBLE;
	ctx.fill();
	ctx.lineWidth = Math.max(1, strokeW * 0.7);
	ctx.strokeStyle = C_OUTLINE;
	ctx.stroke();

	ctx.beginPath();
	ctx.arc(dotX, dotY, dotR * 0.62, 0, Math.PI * 2);
	ctx.fillStyle = statusColor;
	ctx.fill();

	$SD.setTitle(context, "");
	$SD.setImage(context, canvas.toDataURL("image/png"));
}

/* ---------------- 轮询 ---------------- */

function refresh(context) {
	const st = instances[context];
	if (!st) return;

	if (st.status !== "ok") {
		st.status = "loading";
		render(context);
	}

	fetchFromAnyPort(PATH_BALANCE, function (err, balance) {
		if (!instances[context]) return;
		if (err || !balance || !balance.ok) {
			st.status = "error";
			render(context);
			return;
		}
		st.balance = balance;

		fetchFromAnyPort(PATH_TURN, function (err2, turn) {
			if (!instances[context]) return;
			st.turn = err2 ? null : turn;
			st.status = "ok";
			st.updatedAt = Date.now();
			render(context);
		});
	});
}

function startTimer(context) {
	const st = instances[context];
	if (!st) return;
	if (st.timer) clearInterval(st.timer);
	const sec = Math.max(5, parseInt(st.settings.refreshSec) || 30);
	st.timer = setInterval(function () { refresh(context); }, sec * 1000);
}

/* ---------------- 事件分发 ---------------- */

const $AD = {
	[ACTION_UUID]: {
		willAppear(data) {
			const context = data.context;
			const settings = Object.assign({}, DEFAULT_SETTINGS, data.payload.settings || {});
			instances[context] = {
				settings: settings,
				status: "loading",
				balance: null,
				turn: null,
				timer: null
			};
			$SD.setSettings(context, settings);
			loadWhale();
			refresh(context);
			startTimer(context);
		},

		willDisappear(data) {
			const st = instances[data.context];
			if (st && st.timer) clearInterval(st.timer);
			delete instances[data.context];
		},

		didReceiveSettings(data) {
			const st = instances[data.context];
			if (!st) return;
			st.settings = Object.assign({}, DEFAULT_SETTINGS, data.payload.settings || {});
			render(data.context);
			startTimer(data.context);
		},

		keyUp(data) {
			refresh(data.context);
		}
	}
};

/* ---------------- 主程序入口 ---------------- */

async function connectElgatoStreamDeckSocket(inPort, inPluginUUID, inRegisterEvent, inInfo) {
	websocket = new WebSocket("ws://127.0.0.1:" + inPort);

	websocket.onopen = function () {
		websocket.send(JSON.stringify({
			uuid: inPluginUUID,
			event: inRegisterEvent
		}));
	};

	try {
		window.info = JSON.parse(inInfo);
	} catch (e) {
		window.info = {};
	}

	websocket.onmessage = function (e) {
		let data;
		try {
			data = JSON.parse(e.data);
		} catch (err) {
			return;
		}
		if ($AD[data.action] && $AD[data.action][data.event]) {
			$AD[data.action][data.event](data);
		}
	};

	websocket.onclose = function () {
		websocket = null;
	};
}
