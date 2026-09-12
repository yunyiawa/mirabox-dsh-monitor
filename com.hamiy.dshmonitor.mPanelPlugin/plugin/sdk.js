/*
 * 最小化的 MiraBox Craft / StreamDock 插件通信层。
 * 主程序加载本页后会调用全局函数 connectElgatoStreamDeckSocket，
 * 我们据此建立到主程序的 WebSocket 并注册。
 */

let websocket = null;

/* 目标：0 = 软硬件，1 = 仅硬件，2 = 仅软件 */
const DestinationEnum = Object.freeze({
	HARDWARE_AND_SOFTWARE: 0,
	HARDWARE_ONLY: 1,
	SOFTWARE_ONLY: 2
});

const $SD = {
	/* 显示文字（走系统的标题层，字体由主程序渲染） */
	setTitle(context, title) {
		if (!websocket) return;
		websocket.send(JSON.stringify({
			event: "setTitle",
			context: context,
			payload: {
				title: "" + title,
				target: DestinationEnum.HARDWARE_AND_SOFTWARE
			}
		}));
	},

	/* 显示图像：接受 dataURL，直接推给屏幕 */
	setImage(context, dataUrl) {
		if (!websocket) return;
		websocket.send(JSON.stringify({
			event: "setImage",
			context: context,
			payload: {
				image: dataUrl || "",
				target: DestinationEnum.HARDWARE_AND_SOFTWARE
			}
		}));
	},

	/* 持久化该实例的配置 */
	setSettings(context, payload) {
		if (!websocket) return;
		websocket.send(JSON.stringify({
			event: "setSettings",
			context: context,
			payload: payload
		}));
	},

	/* 用默认浏览器打开网址 */
	openUrl(url) {
		if (!websocket) return;
		websocket.send(JSON.stringify({
			event: "openUrl",
			payload: { url: url }
		}));
	}
};

/* ---------- 画布小工具 ---------- */

/*
 * 圆角矩形：只负责构建路径，不填充也不描边。
 * 调用方按需 ctx.fill() / ctx.stroke()，避免出现意外的默认黑边。
 */
function roundRect(ctx, x, y, w, h, r) {
	if (typeof r === "number") r = { tl: r, tr: r, br: r, bl: r };
	const tl = Math.min(r.tl || 0, w / 2, h / 2);
	const tr = Math.min(r.tr || 0, w / 2, h / 2);
	const br = Math.min(r.br || 0, w / 2, h / 2);
	const bl = Math.min(r.bl || 0, w / 2, h / 2);

	ctx.beginPath();
	ctx.moveTo(x + tl, y);
	ctx.lineTo(x + w - tr, y);
	ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
	ctx.lineTo(x + w, y + h - br);
	ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
	ctx.lineTo(x + bl, y + h);
	ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
	ctx.lineTo(x, y + tl);
	ctx.quadraticCurveTo(x, y, x + tl, y);
	ctx.closePath();
}

/* 两个字符补零 */
const pad2 = (n) => (n < 10 ? "0" + n : "" + n);
