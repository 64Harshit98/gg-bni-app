export const splitAddOns = (item: any): {
    baseName: string;
    addOnText: string;
    addOnList: { name: string; price?: number }[];
    addOnPdfText: string;
} => {
    const name: string = item?.name || '';
    // cart ka addOns ho to wahi, warna save hua addOnLines
    const src: any[] = (item?.addOns?.length ? item.addOns : item?.addOnLines) || [];
    const list = src.filter((a: any) => a?.name).map((a: any) => ({
        name: a.name as string,
        price: a.price !== undefined && a.price !== null ? Number(a.price) || 0 : undefined,
    }));

    const toPdf = (l: { name: string; price?: number }[]) =>
        l.map(a => a.price === undefined ? a.name : `${a.name} : ${a.price > 0 ? `Rs.${a.price.toFixed(2)}` : 'Free'}`).join('\n');

    if (list.length) {
        const fromArray = list.map(a => a.name).join(', ');
        const suffix = ` + ${fromArray}`;
        return {
            baseName: name.endsWith(suffix) ? name.slice(0, -suffix.length) : name,
            addOnText: fromArray,
            addOnList: list,
            addOnPdfText: toPdf(list),
        };
    }
    // Purane bills: sirf naam ke text se (price nahi)
    const i = name.indexOf(' + ');
    if (i > 0) {
        const text = name.slice(i + 3);
        const l = text.split(', ').map(n => ({ name: n }));
        return { baseName: name.slice(0, i), addOnText: text, addOnList: l, addOnPdfText: toPdf(l) };
    }
    return { baseName: name, addOnText: '', addOnList: [], addOnPdfText: '' };
};

// PDF tables: name cell me add-ons ke liye khali jagah chhodo (didParseCell me call karo)
export const reserveAddOnSpace = (data: any, nameCol: number, addOnTexts: string[], charsPerLine: number = 28) => {
    if (data.section !== 'body' || data.column.index !== nameCol) return;
    const t = addOnTexts[data.row.index];
    if (!t) return;
    data.cell.__baseLines = data.cell.text.length;
    const extra = t.split('\n').reduce((s, l) => s + Math.max(1, Math.ceil((l.length + 2) / charsPerLine)), 0);
    data.cell.__extraLines = extra;
    data.cell.text = [...data.cell.text, ...Array(extra).fill('')];
};

// Us jagah par chhote font me add-ons draw karo (didDrawCell me call karo)
export const drawAddOnText = (doc: any, data: any, nameCol: number, addOnTexts: string[]) => {
    if (data.section !== 'body' || data.column.index !== nameCol) return;
    const t = addOnTexts[data.row.index];
    if (!t) return;

    const extraLines = data.cell.__extraLines ?? 1;
// wrap ke baad cell.text final hota hai: total lines me se reserved lines ghata do
const baseLines = Math.max(1, data.cell.text.length - extraLines);
    const fs = data.cell.styles.fontSize || 8;
    const lineH = fs * 0.3528 * doc.getLineHeightFactor();
    const padLeft = data.cell.padding('left');
    const maxW = data.cell.width - padLeft - data.cell.padding('right');

    // text block (base + reserved lines) cell me vertically center hai
    const blockH = (baseLines + extraLines) * lineH;
    const blockTop = data.cell.y + (data.cell.height - blockH) / 2;

    const prevSize = doc.getFontSize();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(90, 90, 90);
    const lines = t.split('\n').flatMap((l: string) => doc.splitTextToSize(`+ ${l}`, maxW));
    doc.text(lines, data.cell.x + padLeft, blockTop + baseLines * lineH, { baseline: 'top' });
    doc.setFontSize(prevSize);
    doc.setTextColor(0, 0, 0);
};
// "Burger (Rs.189.00)" jaisa naam: unit total me se add-ons ghata kar base price. Add-on na ho ya price na ho to sirf baseName.
export const nameWithBase = (item: any, unitTotal: number): string => {
    const { baseName, addOnList } = splitAddOns(item);
    if (!addOnList.length || addOnList.some(a => a.price === undefined)) return baseName;
    const base = unitTotal - addOnList.reduce((s, a) => s + (a.price || 0), 0);
    return base > 0 ? `${baseName} (Rs.${base.toFixed(2)})` : baseName;
};