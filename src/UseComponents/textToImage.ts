// jsPDF's built-in fonts cannot draw emoji / non-Latin text, so such text is
// rasterised through a canvas (browser emoji font) and embedded as an image.
export const needsImageText = (s: string): boolean =>
    /[^\x20-\x7E\n]/.test(s);

// Width (mm) used for item-name images inside table cells
export const NAME_IMG_W = 41;

export const textToImage = (
    text: string,
    widthMm: number,
    fontPt = 9,
    tight = false
): { dataUrl: string; heightMm: number; widthMm: number } | null => {
    try {
        const pxPerMm = 12; // ~300 DPI
        const widthPx = Math.round(widthMm * pxPerMm);
        const fontPx = Math.round(fontPt * 0.3528 * pxPerMm);
        const lineH = Math.round(fontPx * 1.35);
                const fontStr = `${fontPx}px Helvetica, Arial, "Nirmala UI", "Noto Sans Devanagari", "Noto Sans Tamil", "Noto Sans Bengali", "Noto Sans Telugu", "Noto Sans Kannada", "Noto Sans Malayalam", "Noto Sans Gujarati", "Noto Sans Gurmukhi", "Noto Sans Oriya", "Noto Sans Arabic", "Noto Sans Hebrew", "Noto Sans Thai", "Segoe UI", "Microsoft YaHei", "Yu Gothic", "Malgun Gothic", "Noto Sans CJK SC", "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.font = fontStr;

        const lines: string[] = [];
        text.replace(/\r/g, "").replace(/\t/g, " ").split("\n").forEach((para) => {
            let line = "";
            para.split(" ").forEach((word) => {
                const test = line ? `${line} ${word}` : word;
                if (ctx.measureText(test).width <= widthPx) { line = test; return; }
                if (line) lines.push(line);
                line = "";
                Array.from(word).forEach((ch) => {
                    if (ctx.measureText(line + ch).width > widthPx && line) { lines.push(line); line = ch; }
                    else line += ch;
                });
            });
            lines.push(line);
        });

        // tight=true -> canvas ki width actual text jitni (max wrap width tak), warna column bekaar chauda hota hai
        const usedPx = tight
            ? Math.min(widthPx, Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + 2)
            : widthPx;
        canvas.width = usedPx;
        canvas.height = Math.max(1, lines.length * lineH);
        ctx.font = fontStr; // resetting canvas size clears the context state
        ctx.fillStyle = "#000000";
        ctx.textBaseline = "middle";
        lines.forEach((l, i) => ctx.fillText(l, 0, i * lineH + lineH / 2));

        return {
            dataUrl: canvas.toDataURL("image/png"),
            heightMm: canvas.height / pxPerMm,
            widthMm: canvas.width / pxPerMm,
        };
    } catch (e) {
        console.error("Failed to render text as image", e);
        return null;
    }
};
// ===== UNIVERSAL: doc.text ko patch karo, taaki koi bhi emoji/non-Latin text image ban ke draw ho =====
const UNI_FONT_FAMILY = `Helvetica, Arial, "Nirmala UI", "Noto Sans Devanagari", "Noto Sans Tamil", "Noto Sans Bengali", "Noto Sans Telugu", "Noto Sans Kannada", "Noto Sans Malayalam", "Noto Sans Gujarati", "Noto Sans Gurmukhi", "Noto Sans Oriya", "Noto Sans Arabic", "Noto Sans Hebrew", "Noto Sans Thai", "Segoe UI", "Microsoft YaHei", "Yu Gothic", "Malgun Gothic", "Noto Sans CJK SC", "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;

type UniLine = { dataUrl: string; wMm: number; hMm: number; baseMm: number };
const uniCache = new Map<string, UniLine>();

const renderUniLine = (text: string, fontPt: number, bold: boolean, color: string): UniLine | null => {
    const key = `${fontPt}|${bold}|${color}|${text}`;
    const hit = uniCache.get(key);
    if (hit) return hit;
    try {
        const PX = 12; // ~300 DPI
        const fontPx = Math.round(fontPt * 0.3528 * PX);
        const font = `${bold ? "bold " : ""}${fontPx}px ${UNI_FONT_FAMILY}`;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.font = font;
        const w = Math.max(1, Math.ceil(ctx.measureText(text).width) + 2);
        const h = Math.round(fontPx * 1.5);
        const basePx = Math.round(fontPx * 1.1);
        canvas.width = w;
        canvas.height = h;
        ctx.font = font; // canvas resize se state reset hota hai
        ctx.fillStyle = color;
        ctx.textBaseline = "alphabetic";
        ctx.fillText(text, 0, basePx);
        const out = { dataUrl: canvas.toDataURL("image/png"), wMm: w / PX, hMm: h / PX, baseMm: basePx / PX };
        uniCache.set(key, out);
        return out;
    } catch (e) {
        console.error("Unicode text render failed", e);
        return null;
    }
};

export const installUnicodeText = (doc: any): void => {
    if (doc.__unicodeTextInstalled) return;
    doc.__unicodeTextInstalled = true;
    const origText = doc.text.bind(doc);

    doc.text = (text: any, x: any, y: any, options?: any, ...rest: any[]) => {
        const lines: string[] = Array.isArray(text) ? text.map((t: any) => String(t)) : [String(text)];
        const opts = options && typeof options === "object" ? options : {};

        // normal case (sirf ASCII / rotated / unusual signature) -> jsPDF ka original behaviour
        if (typeof x !== "number" || typeof y !== "number" || opts.angle || !lines.some(needsImageText)) {
            return origText(text, x, y, options, ...rest);
        }

        const fontPt = doc.getFontSize();
        const fontMm = fontPt * 0.3528;
        const lineStep = fontMm * (doc.getLineHeightFactor ? doc.getLineHeightFactor() : 1.15);
        const bold = /bold/i.test(doc.getFont()?.fontStyle || "");
        const rawColor = doc.getTextColor ? doc.getTextColor() : "#000000";
        const color = typeof rawColor === "string" && rawColor.startsWith("#") ? rawColor : "#000000";

        lines.forEach((line, i) => {
            const ly = y + i * lineStep;
            if (!needsImageText(line)) {
                origText(line, x, ly, options, ...rest);
                return;
            }
            const img = renderUniLine(line, fontPt, bold, color);
            if (!img) { origText(line, x, ly, options, ...rest); return; }

            let ix = x;
            if (opts.align === "center") ix = x - img.wMm / 2;
            else if (opts.align === "right") ix = x - img.wMm;

            let top = ly - img.baseMm; // default: alphabetic baseline
            if (opts.baseline === "top" || opts.baseline === "hanging") top = ly - fontMm * 0.3;
            else if (opts.baseline === "middle") top = ly - img.hMm / 2;
            else if (opts.baseline === "bottom") top = ly - img.hMm;

            doc.addImage(img.dataUrl, "PNG", ix, top, img.wMm, img.hMm);
        });
        return doc;
    };
};