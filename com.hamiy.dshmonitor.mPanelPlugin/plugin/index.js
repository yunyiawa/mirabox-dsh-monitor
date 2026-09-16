/*
 * DSH Monitor —— 鲸鱼娘 + 气泡样式
 *
 * v3.0.0 起不再依赖 DSH：直接调用 DeepSeek 官方余额接口。
 *
 *   GET https://api.deepseek.com/user/balance
 *   Authorization: Bearer <你的 API Key>
 *   -> { is_available, balance_infos: [{ currency, total_balance,
 *                                        granted_balance, topped_up_balance }] }
 *
 * 官方接口只给「当前余额」，没有用量历史，所以：
 *   - 今日已用：本地记账（累加余额的下降量），随设置持久化
 *   - 峰谷状态：按官方时段本地判定（工作日 9-12 / 14-18 为高峰，周末全天谷价）
 *
 * API Key 由属性面板填写，存在 MiraBox Craft 的主题配置里。
 * ⚠️ 那是明文存储，请不要在这台机器以外的地方复用同一个 Key。
 */

const ACTION_UUID = "com.hamiy.dshmonitor.action1";

const BALANCE_URL = "https://api.deepseek.com/user/balance";

/* 配色，跟原版小鲸鱼保持一致 */
const C_PEAK = "#e0433f";      /* 峰：红 */
const C_OFF = "#2fa24c";       /* 谷：绿 */
const C_INK = "#203170";       /* 主文字：藏青 */
const C_SUB = "#64748b";       /* 次要文字 */
const C_BUBBLE = "#ffffff";
const C_OUTLINE = "#203170";   /* 气泡描边：与主文字同色 */

/* 气泡椭圆的目标长宽比（rx/ry）。越大越扁，1.0 就是正圆 */
const BUBBLE_ASPECT = 2.0;

/* 高峰时段（北京时间，整点区间）。来源与上游一致：
 * 工作日 9:00–12:00、14:00–18:00；2026-08-23 起周末全天按谷价。 */
const PEAK_HOURS = [[9, 12], [14, 18]];

/* 每个控件实例的状态，key = context */
const instances = {};

/* 鲸鱼本体：预加载一次，全实例共用 */
let whaleImg = null;
let whaleReady = false;

const DEFAULT_SETTINGS = {
	ActionGeometry: { width: 480, height: 240 },
	apiKey: "",
	refreshSec: 60,
	periodMode: "liangwen",
	showToday: true,
	showDetail: true,
	fontFamily: "Microsoft YaHei"
};

/* ---------------- 时间与峰谷 ---------------- */

/** 取北京时间（UTC+8）的日历信息：0=周日 6=周六 */
function beijingParts(timeSec) {
	const bj = new Date(timeSec * 1000 + 8 * 3600 * 1000);
	return { hour: bj.getUTCHours(), dow: bj.getUTCDay() };
}

/** 是否处于高峰时段 */
function isPeakTime(timeSec) {
	const t = isFinite(Number(timeSec)) ? Number(timeSec) : Math.floor(Date.now() / 1000);
	const p = beijingParts(t);
	if (p.dow === 0 || p.dow === 6) return false;            /* 周末全天谷价 */
	for (let i = 0; i < PEAK_HOURS.length; i++) {
		if (p.hour >= PEAK_HOURS[i][0] && p.hour < PEAK_HOURS[i][1]) return true;
	}
	return false;
}

/** 北京时间的日期键，用于「今日」归零 */
function beijingDayKey(timeSec) {
	const bj = new Date(timeSec * 1000 + 8 * 3600 * 1000);
	return bj.getUTCFullYear() + "-" + pad2(bj.getUTCMonth() + 1) + "-" + pad2(bj.getUTCDate());
}

/* ---------------- 数据获取 ---------------- */

/*
 * 直连 DeepSeek 官方余额接口。
 * 注意：带 Authorization 头属于「非简单请求」，若宿主强制 CORS 会先发 OPTIONS 预检。
 * MiraBox Craft 的插件页可跨域取第三方 API（自带插件即如此），因此这里按可用处理；
 * 万一不行，错误会以「网络不可用」显式暴露，不会静默失败。
 */
function fetchBalance(key, cb) {
	if (!key) {
		cb({ kind: "nokey" });
		return;
	}
	try {
		const x = new XMLHttpRequest();
		x.open("GET", BALANCE_URL, true);
		x.timeout = 12000;
		x.setRequestHeader("Authorization", "Bearer " + key);
		x.setRequestHeader("Accept", "application/json");
		x.onreadystatechange = function () {
			if (x.readyState !== 4) return;
			if (x.status >= 200 && x.status < 300) {
				try {
					cb(null, JSON.parse(x.responseText));
				} catch (e) {
					cb({ kind: "parse" });
				}
			} else if (x.status === 401 || x.status === 403) {
				cb({ kind: "auth" });
			} else {
				cb({ kind: "http", code: x.status });
			}
		};
		x.ontimeout = function () { cb({ kind: "timeout" }); };
		x.onerror = function () { cb({ kind: "net" }); };
		x.send();
	} catch (e) {
		cb({ kind: "net" });
	}
}

/** 从接口返回里取出第一条余额信息 */
function pickBalanceInfo(payload) {
	const list = payload && payload.balance_infos;
	if (!list || !list.length) return null;
	return list[0];
}

/* ---------------- 本地记账（今日已用） ---------------- */

function normalizeLedger(raw) {
	const l = raw && typeof raw === "object" ? raw : {};
	return {
		day: typeof l.day === "string" ? l.day : "",
		used: isFinite(Number(l.used)) ? Number(l.used) : 0,
		last: isFinite(Number(l.last)) && l.last !== null ? Number(l.last) : null
	};
}

/*
 * 用余额差值累加「今日已用」。
 * 只累加下降量，所以中途充值不会把已用量冲掉。
 * 局限：控件没在跑的时候发生的消耗统计不到。
 */
function updateLedger(ledger, balance) {
	const today = beijingDayKey(Math.floor(Date.now() / 1000));
	if (ledger.day !== today) {
		return { day: today, used: 0, last: balance, changed: true };
	}
	if (ledger.last === null) {
		return { day: today, used: ledger.used, last: balance, changed: true };
	}
	const delta = ledger.last - balance;
	if (delta > 0.000001) {
		return { day: today, used: ledger.used + delta, last: balance, changed: true };
	}
	if (delta < 0) {
		/* 充值了：只更新基准，不计入已用 */
		return { day: today, used: ledger.used, last: balance, changed: true };
	}
	return { day: today, used: ledger.used, last: balance, changed: false };
}

/* ---------------- 格式化 ---------------- */

function money(v, digits) {
	if (v === null || v === undefined || v === "" || isNaN(v)) return "--";
	return Number(v).toFixed(digits === undefined ? 2 : digits);
}

/* 峰谷文案 */
function periodText(isPeak, mode) {
	if (mode === "plain") return isPeak ? "高峰时段" : "空闲时段";
	if (mode === "qiangqiang") return isPeak ? "!?峰峰?!" : "!?谷谷?!";
	return isPeak ? "梁文峰" : "梁文谷";   /* liangwen，默认 */
}

/* 错误状态对应的提示文案 */
function statusMessage(st) {
	if (st.status === "nokey") return "未配置 API Key";
	if (st.status === "auth") return "API Key 无效";
	if (st.status === "net" || st.status === "timeout") return "网络不可用";
	if (st.status === "parse") return "返回格式异常";
	if (st.status === "http") return "查询失败 " + (st.httpCode || "");
	return "连接中…";
}

/* ---------------- 鲸鱼本体加载 ---------------- */

function loadWhale() {
	if (whaleImg) return;
	whaleImg = new Image();
	whaleImg.onload = function () {
		whaleReady = true;
		Object.keys(instances).forEach(render);
	};
	whaleImg.onerror = function () { whaleReady = false; };
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
	const w = parseInt(s.ActionGeometry && s.ActionGeometry.width) || 480;
	const h = parseInt(s.ActionGeometry && s.ActionGeometry.height) || 240;
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

	ellipseBubble(ctx, cx, cyB, rx, ry, tail, tailSize);
	ctx.lineJoin = "round";
	ctx.lineWidth = strokeW;
	ctx.strokeStyle = C_OUTLINE;
	ctx.stroke();

	/* ---------- 气泡内文字 ---------- */
	const ready = st.status === "ok";
	const isPeak = ready ? st.isPeak : isPeakTime(Math.floor(Date.now() / 1000));
	const periodColor = isPeak ? C_PEAK : C_OFF;

	/* 组装要显示的行 */
	const rows = [];
	if (ready) {
		rows.push({ k: "period" });
		rows.push({ k: "balance" });
		if (s.showToday) rows.push({ k: "today" });
		if (s.showDetail) rows.push({ k: "detail" });
	} else {
		rows.push({ k: "state" });
	}

	/*
	 * 椭圆气泡的文字带。
	 * 关键：椭圆在不同高度上的可用宽度不同（中间最宽、上下收窄），
	 * 所以逐行按该行高度反算真实宽度，否则四角的字会被椭圆切掉。
	 */
	const bandHalf = ry * 0.66;
	const innerTop = cyB - bandHalf;
	const innerH = bandHalf * 2;
	const rowH = innerH / rows.length;

	function rowWidthAt(rowCy) {
		const dy = (rowCy - cyB) / ry;
		const half = rx * Math.sqrt(Math.max(0.04, 1 - dy * dy));
		return half * 2 * 0.84;          /* 留出描边与呼吸空间 */
	}

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
			const label = "当前时间段为:";
			const value = periodText(isPeak, s.periodMode);
			let px = Math.round(rowH * 0.52);
			px = Math.min(px, Math.round(innerW * 0.30));
			ctx.font = "bold " + px + "px " + fam;
			const lw = ctx.measureText(label).width;
			const sp = Math.round(px * 0.35);
			const vw = ctx.measureText(value).width;
			const total = lw + sp + vw;
			const x = innerX + Math.max(0, (innerW - total) / 2);

			ctx.fillStyle = C_SUB;
			ctx.fillText(label, x, cy);
			ctx.fillStyle = periodColor;
			ctx.fillText(value, x + lw + sp, cy);

		} else if (row.k === "balance") {
			const text = money(st.balance, 2);
			const unit = "¥";
			const px = fitFont(text, Math.round(rowH * 1.15), innerW);
			ctx.font = "bold " + px + "px " + fam;
			const tw = ctx.measureText(text).width;
			const upx = Math.round(px * 0.42);
			ctx.font = "bold " + upx + "px " + fam;
			const uw = ctx.measureText(unit).width;
			const sp = Math.round(px * 0.12);
			const x = innerX + Math.max(0, (innerW - (uw + sp + tw)) / 2);

			ctx.fillStyle = C_INK;
			ctx.font = "bold " + upx + "px " + fam;
			ctx.fillText(unit, x, cy + Math.round(px * 0.16));
			ctx.font = "bold " + px + "px " + fam;
			ctx.fillText(text, x + uw + sp, cy);

		} else if (row.k === "today") {
			const text = "今日已用 ¥" + money(st.ledger.used, 2);
			const px = fitFont(text, Math.round(rowH * 0.62), innerW);
			ctx.fillStyle = C_INK;
			ctx.font = "bold " + px + "px " + fam;
			ctx.textAlign = "center";
			ctx.fillText(text, innerX + innerW / 2, cy);
			ctx.textAlign = "left";

		} else if (row.k === "detail") {
			/* 赠送 / 充值 —— 官方接口直接提供，不依赖任何外部统计 */
			const text = (st.granted > 0)
				? ("赠送 ¥" + money(st.granted, 2) + "   ·   充值 ¥" + money(st.toppedUp, 2))
				: (st.currency + " · 充值余额 ¥" + money(st.toppedUp, 2));
			const px = fitFont(text, Math.round(rowH * 0.58), innerW);
			ctx.fillStyle = C_SUB;
			ctx.font = "bold " + px + "px " + fam;
			ctx.textAlign = "center";
			ctx.fillText(text, innerX + innerW / 2, cy);
			ctx.textAlign = "left";

		} else if (row.k === "state") {
			const text = statusMessage(st);
			const px = fitFont(text, Math.round(rowH * 0.72), innerW);
			ctx.fillStyle = (st.status === "loading") ? "#d97706" : C_PEAK;
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
		ctx.beginPath();
		ctx.arc(whaleX + whaleS / 2, whaleY + whaleS / 2, whaleS * 0.36, 0, Math.PI * 2);
		ctx.fillStyle = "rgba(125,211,252,0.25)";
		ctx.fill();
	}

	/* ---------- 状态灯：气泡右上内侧，白底 + 同色描边环 ---------- */
	const dotR = Math.max(3, Math.round(Math.min(w, h) * 0.022));
	const statusColor = st.status === "ok" ? "#22c55e"
		: st.status === "loading" ? "#f59e0b" : C_PEAK;

	/*
	 * 位置按椭圆参数方程取（(rx·cosθ, ry·sinθ)），再沿该方向向内收，
	 * 直到圆点与气泡描边之间留出 margin 的净空。
	 */
	const dotAngle = -0.50;
	const bx = rx * Math.cos(dotAngle);
	const by = ry * Math.sin(dotAngle);
	const edgeDist = Math.sqrt(bx * bx + by * by);
	const dotMargin = dotR + strokeW + Math.max(3, Math.min(rx, ry) * 0.06);
	const dotK = Math.max(0.30, 1 - dotMargin / edgeDist);
	const dotX = cx + bx * dotK;
	const dotY = cyB + by * dotK;

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

	const key = (st.settings.apiKey || "").trim();
	if (!key) {
		st.status = "nokey";
		render(context);
		return;
	}

	if (st.status !== "ok") {
		st.status = "loading";
		render(context);
	}

	fetchBalance(key, function (err, payload) {
		if (!instances[context]) return;

		if (err) {
			st.status = err.kind === "http" ? "http" : err.kind;
			st.httpCode = err.code || "";
			render(context);
			return;
		}

		const info = pickBalanceInfo(payload);
		if (!info) {
			st.status = "parse";
			render(context);
			return;
		}

		st.status = "ok";
		st.balance = Number(info.total_balance);
		st.granted = Number(info.granted_balance);
		st.toppedUp = Number(info.topped_up_balance);
		st.currency = info.currency || "CNY";
		st.isPeak = isPeakTime(Math.floor(Date.now() / 1000));
		st.updatedAt = Date.now();

		/* 本地记账：只有真正变化时才写回设置，避免每次轮询都落盘 */
		if (isFinite(st.balance)) {
			const next = updateLedger(st.ledger, st.balance);
			st.ledger = { day: next.day, used: next.used, last: next.last };
			if (next.changed) {
				st.settings.ledger = st.ledger;
				$SD.setSettings(context, st.settings);
			}
		}

		render(context);
	});
}

function startTimer(context) {
	const st = instances[context];
	if (!st) return;
	if (st.timer) clearInterval(st.timer);
	const sec = Math.max(10, parseInt(st.settings.refreshSec) || 60);
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
				granted: 0,
				toppedUp: 0,
				currency: "CNY",
				isPeak: false,
				httpCode: "",
				ledger: normalizeLedger(settings.ledger),
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
			const incoming = data.payload.settings || {};
			st.settings = Object.assign({}, DEFAULT_SETTINGS, incoming);
			/* 属性面板不该覆盖记账数据：面板若没带 ledger 就沿用内存里的 */
			st.ledger = normalizeLedger(incoming.ledger || st.ledger);
			st.settings.ledger = st.ledger;
			render(data.context);
			startTimer(data.context);
			refresh(data.context);
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
