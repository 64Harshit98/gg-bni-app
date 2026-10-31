export const splitAddOns = (item: any): { baseName: string; addOnText: string } => {
    const name: string = item?.name || '';
    const fromArray = (item?.addOns || []).map((a: any) => a.name).filter(Boolean).join(', ');

    if (fromArray) {
        const suffix = ` + ${fromArray}`;
        return { baseName: name.endsWith(suffix) ? name.slice(0, -suffix.length) : name, addOnText: fromArray };
    }
    const i = name.indexOf(' + ');
    if (i > 0) return { baseName: name.slice(0, i), addOnText: name.slice(i + 3) };
    return { baseName: name, addOnText: '' };
};

// PDF tables: name cell me add-ons ke liye khali jagah chhodo (didParseCell me call karo)
export const reserveAddOnSpace = (data: any, nameCol: number, addOnTexts: string[], charsPerLine: number = 45) => {
    if (data.section !== 'body' || data.column.index !== nameCol) return;
    const t = addOnTexts[data.row.index];
    if (!t) return;
    data.cell.__baseLines = data.cell.text.length;
    const extra = Math.max(1, Math.ceil((t.length + 2) / charsPerLine));
    data.cell.__extraLines = extra;
    data.cell.text = [...data.cell.text, ...Array(extra).fill('')];
};

// Us jagah par chhote font me add-ons draw karo (didDrawCell me call karo)
export const drawAddOnText = (doc: any, data: any, nameCol: number, addOnTexts: string[]) => {
    if (data.section !== 'body' || data.column.index !== nameCol) return;
    const t = addOnTexts[data.row.index];
    if (!t) return;

    const baseLines = data.cell.__baseLines ?? 1;
    const extraLines = data.cell.__extraLines ?? 1;
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
    const lines = doc.splitTextToSize(`+ ${t}`, maxW);
    doc.text(lines, data.cell.x + padLeft, blockTop + baseLines * lineH, { baseline: 'top' });
    doc.setFontSize(prevSize);
    doc.setTextColor(0, 0, 0);
};