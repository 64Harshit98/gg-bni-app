import jsPDF from "jspdf";

export const drawWatermark = (
    doc: jsPDF,
    pageWidth: number,
    pageHeight: number,
    text: string = "SELLAR.IN",
    options?: { fontSize?: number; centerYOffset?: number }
) => {
    const fontSize = options?.fontSize ?? 70;
    const centerYOffset = options?.centerYOffset ?? 0;

    // @ts-ignore
    doc.saveGraphicsState();
    // @ts-ignore
    doc.setGState(new (doc as any).GState({ opacity: 0.15 }));

    doc.setFont("helvetica", "bold");
    doc.setFontSize(fontSize);
    doc.setTextColor(120, 120, 120);

    // Manual centering — do NOT rely on jsPDF's align+baseline+angle combo,
    // it miscalculates the rotated bounding box (especially at large font sizes).
    const angleDeg = 45;
    const angleRad = (angleDeg * Math.PI) / 180;
    const textWidth = doc.getTextWidth(text);

    // Page's true center point
    const centerX = pageWidth / 2;
    const centerY = (pageHeight / 2) + centerYOffset;

    // Shift the anchor BACKWARD along the rotation direction by half the
    // text's width, so the text is centered on its own rotated axis.
    const startX = centerX - (textWidth / 2) * Math.cos(angleRad);
    const startY = centerY + (textWidth / 2) * Math.sin(angleRad);

    doc.text(text, startX, startY, {
        angle: angleDeg
        // no align/baseline options — we've already centered manually
    });

    // @ts-ignore
    doc.restoreGraphicsState();
};