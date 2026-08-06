import jsPDF from "jspdf";

export const drawWatermark = (
    doc: jsPDF,
    pageWidth: number,
    pageHeight: number,
    text: string = "SELLAR.IN"
) => {
    // @ts-ignore - saveGraphicsState exists on jsPDF instance at runtime
    doc.saveGraphicsState();
    // @ts-ignore - GState exists on jsPDF instance at runtime
    doc.setGState(new (doc as any).GState({ opacity: 0.15 }));

    doc.setFont("helvetica", "bold");
    doc.setFontSize(70);
    doc.setTextColor(120, 120, 120);

    doc.text(text, pageWidth / 2, pageHeight / 2, {
        align: "center",
        angle: 45
    });

    // @ts-ignore - restoreGraphicsState exists on jsPDF instance at runtime
    doc.restoreGraphicsState();
};