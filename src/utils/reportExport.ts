/**
 * Export laporan ke PDF (jsPDF + autotable) dan CSV untuk Excel.
 * Setiap tab laporan menyusun ReportDoc yang sama, lalu dipakai oleh kedua format.
 */
import type { StoreSettings } from '../types';

export type Cell = string | number;

export interface ReportTable {
  title: string;
  head: string[];
  rows: Cell[][];
  foot?: Cell[];
  /** Kolom angka (rata kanan); default: kolom bertipe number */
  numericCols?: number[];
  note?: string;
}

export interface ReportDoc {
  title: string;
  period: string;
  summary?: Array<[string, string]>;
  tables: ReportTable[];
}

const rupiah = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n || 0);

/** Font standar PDF hanya mendukung Latin-1; ganti simbol yang tidak tersedia */
function pdfText(v: Cell): string {
  const s = typeof v === 'number' ? rupiah(v) : String(v ?? '');
  return s
    .replace(/[−–—]/g, '-')
    .replace(/→/g, '->')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/ | /g, ' ')
    .replace(/[^\x00-\xff]/g, '');
}

const INK: [number, number, number] = [17, 17, 19];
const MUTED: [number, number, number] = [110, 110, 118];

export async function exportReportPdf(docs: ReportDoc[], settings: StoreSettings, fileName: string) {
  // Library PDF (±400 KB) baru dimuat saat dibutuhkan, supaya aplikasi terbuka lebih cepat
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const printedAt = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());

  docs.forEach((rep, docIdx) => {
    if (docIdx > 0) doc.addPage();

    // Kop laporan
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...INK);
    doc.text(pdfText(settings.name), margin, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(pdfText([settings.address, settings.city].filter(Boolean).join(', ')), margin, 21);
    doc.text(pdfText(`Telp ${settings.phone || '-'} · WA ${settings.wa || '-'}`), margin, 25);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text(pdfText(rep.title), pageW - margin, 16, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(pdfText(rep.period), pageW - margin, 21, { align: 'right' });
    doc.text(pdfText(`Dicetak ${printedAt}`), pageW - margin, 25, { align: 'right' });

    doc.setDrawColor(...INK);
    doc.setLineWidth(0.5);
    doc.line(margin, 28, pageW - margin, 28);

    let y = 33;

    if (rep.summary?.length) {
      // Ringkasan 2 kolom pasangan label/nilai
      const pairs = rep.summary;
      const half = Math.ceil(pairs.length / 2);
      const body = Array.from({ length: half }, (_, i) => [
        pdfText(pairs[i][0]),
        pdfText(pairs[i][1]),
        pairs[i + half] ? pdfText(pairs[i + half][0]) : '',
        pairs[i + half] ? pdfText(pairs[i + half][1]) : '',
      ]);
      autoTable(doc, {
        startY: y,
        body,
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 1.6, textColor: INK },
        columnStyles: {
          0: { textColor: MUTED },
          1: { fontStyle: 'bold', halign: 'right' },
          2: { textColor: MUTED },
          3: { fontStyle: 'bold', halign: 'right' },
        },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    for (const t of rep.tables) {
      if (y > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        y = 18;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      doc.text(pdfText(t.title), margin, y);
      y += 2;

      const numeric = new Set(
        t.numericCols ?? t.head.map((_, i) => i).filter((i) => t.rows.some((r) => typeof r[i] === 'number'))
      );
      const colStyles: Record<number, any> = {};
      numeric.forEach((i) => (colStyles[i] = { halign: 'right' }));

      autoTable(doc, {
        startY: y,
        head: [t.head.map(pdfText)],
        body: t.rows.length ? t.rows.map((r) => r.map(pdfText)) : [[{ content: 'Tidak ada data', colSpan: t.head.length, styles: { halign: 'center', textColor: MUTED } } as any]],
        foot: t.foot ? [t.foot.map(pdfText)] : undefined,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 1.8, lineColor: [228, 228, 231], lineWidth: 0.1, textColor: INK, overflow: 'linebreak' },
        headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold' },
        footStyles: { fillColor: [244, 244, 245], textColor: INK, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: colStyles,
        didParseCell: (data) => {
          if ((data.section === 'head' || data.section === 'foot') && numeric.has(data.column.index)) data.cell.styles.halign = 'right';
        },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 4;
      if (t.note) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED);
        const lines = doc.splitTextToSize(pdfText(t.note), pageW - margin * 2);
        doc.text(lines, margin, y + 1);
        y += lines.length * 3.5 + 2;
      }
      y += 4;
    }
  });

  // Nomor halaman
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`Halaman ${i} dari ${total}`, pageW - margin, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    doc.text(pdfText(`${settings.name} - laporan dibuat otomatis`), margin, doc.internal.pageSize.getHeight() - 8);
  }

  doc.save(fileName);
}

function csvCell(v: Cell | undefined): string {
  if (v === undefined || v === null) return '';
  let s = String(v);
  // Cegah CSV injection: teks yang diawali = + - @ (atau tab/CR) dijalankan Excel sebagai rumus
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV (pemisah ;) yang langsung rapi dibuka di Excel versi Indonesia */
export function exportReportCsv(docs: ReportDoc[], fileName: string) {
  const lines: Cell[][] = [];
  for (const rep of docs) {
    lines.push([rep.title], [rep.period], []);
    for (const [k, v] of rep.summary || []) lines.push([k, v]);
    if (rep.summary?.length) lines.push([]);
    for (const t of rep.tables) {
      lines.push([t.title], t.head, ...t.rows);
      if (t.foot) lines.push(t.foot);
      lines.push([]);
    }
    lines.push([]);
  }
  const body = '﻿' + lines.map((l) => l.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
