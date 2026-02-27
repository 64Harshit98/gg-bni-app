import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface CatalogueInvoiceData {
  company: {
    name: string;
    address: string;
    phone: string;
    logoBase64?: string;
  };
  customer: {
    name: string;
    phone: string;
    address?: string;
  };
  order: {
    orderId: string;
    date: string;
  };
  items: {
    sno: number;
    name: string;
    qty: number;
    price: number;
    total: number;
    imageBase64?: string;
  }[];
  grandTotal: number;
}

export const generateCatalogueBill = async (
  data: CatalogueInvoiceData,
  action: 'download' | 'print' | 'blob' = 'download'
): Promise<Blob | void> => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15; // Slightly wider margin for a cleaner look
  let cursorY = margin;

  // =========================
  // 🔷 HEADER & LOGO
  // =========================
  if (data.company.logoBase64) {
    try {
      doc.addImage(data.company.logoBase64, 'PNG', margin, cursorY, 20, 20);
    } catch (e) {
      console.error('Logo error', e);
    }
  }

  // Company Info (Right Aligned)
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(data.company.name.toUpperCase(), pageWidth - margin, cursorY + 8, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(data.company.address, pageWidth - margin, cursorY + 14, { align: 'right' });
  doc.text(`Contact: ${data.company.phone}`, pageWidth - margin, cursorY + 19, { align: 'right' });

  cursorY += 30;

  // Blue Divider Line
  doc.setDrawColor(41, 128, 185);
  doc.setLineWidth(0.5);
  doc.line(margin, cursorY, pageWidth - margin, cursorY);
  cursorY += 10;

  // =========================
  // 🔷 BILL TO / ORDER INFO
  // =========================
  // Order Box (Left)
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, cursorY, (pageWidth / 2) - 20, 25, 'F');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(41, 128, 185);
  doc.text('BILL TO:', margin + 5, cursorY + 7);
  
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(data.customer.name, margin + 5, cursorY + 13);
  doc.setFont('helvetica', 'normal');
  doc.text(`Mob: ${data.customer.phone}`, margin + 5, cursorY + 18);

  // Invoice Details (Right)
  doc.setFont('helvetica', 'bold');
  doc.text(`ESTIMATE #:`, pageWidth - 60, cursorY + 7);
  doc.setFont('helvetica', 'normal');
  doc.text(data.order.orderId, pageWidth - margin, cursorY + 7, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.text(`DATE:`, pageWidth - 60, cursorY + 13);
  doc.setFont('helvetica', 'normal');
  doc.text(data.order.date, pageWidth - margin, cursorY + 13, { align: 'right' });

  cursorY += 35;

  // =========================
  // 🔷 TABLE BODY
  // =========================
  const body = data.items.map((item) => [
    item.sno,
    '', // Image placeholder
    item.name,
    item.qty,
    `₹${item.price.toLocaleString()}`,
    `₹${item.total.toLocaleString()}`,
  ]);

  autoTable(doc, {
    startY: cursorY,
    head: [['#', 'Image', 'Product Description', 'Qty', 'Unit Price', 'Total']],
    body,
    theme: 'grid',
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: 255,
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'center'
    },
    styles: {
      fontSize: 8,
      valign: 'middle',
      cellPadding: 3,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { cellWidth: 22 }, // Image column
      2: { halign: 'left' },
      3: { halign: 'center', cellWidth: 15 },
      4: { halign: 'right', cellWidth: 25 },
      5: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
    },
    didDrawCell: (dataCell) => {
      if (dataCell.column.index === 1 && dataCell.section === 'body') {
        const item = data.items[dataCell.row.index];
        if (item.imageBase64) {
          try {
            doc.addImage(item.imageBase64, 'JPEG', dataCell.cell.x + 2, dataCell.cell.y + 2, 18, 18);
          } catch (e) {
            console.error('Image error', e);
          }
        }
      }
    },
  });

  // @ts-ignore
  let finalY = doc.lastAutoTable.finalY + 10;

  // =========================
  // 🔷 TOTALS SECTION
  // =========================
  const totalBoxWidth = 60;
  doc.setDrawColor(200, 200, 200);
  doc.rect(pageWidth - margin - totalBoxWidth, finalY, totalBoxWidth, 12);
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(41, 128, 185);
  doc.text('GRAND TOTAL:', pageWidth - margin - 58, finalY + 8);
  
  doc.setTextColor(0, 0, 0);
  doc.text(`₹ ${data.grandTotal.toLocaleString()}`, pageWidth - margin - 5, finalY + 8, { align: 'right' });

  // =========================
  // 🔷 FOOTER
  // =========================
  const footerY = doc.internal.pageSize.getHeight() - 20;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(150, 150, 150);
  doc.text('This is a computer generated estimate.', pageWidth / 2, footerY, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text('Thank you for choosing HARDIK STATIONERY!', pageWidth / 2, footerY + 5, { align: 'center' });

  // =========================
  // 🔷 OUTPUT
  // =========================
  if (action === 'print') {
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  } else if (action === 'download') {
    doc.save(`Estimate_${data.order.orderId}.pdf`);
  } else if (action === 'blob') {
    return doc.output('blob');
  }
};