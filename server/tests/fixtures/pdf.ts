/** Tiny, standards-based PDF fixtures with real page content and xref offsets. */
export function pdfFixture(pages: { text?: string; graphic?: 'vector' | 'image' }[]): Buffer {
  const fontId = 3 + pages.length * 2;
  const imageId = fontId + 1;
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  ];
  for (const [index, page] of pages.entries()) {
    const contentId = 4 + index * 2;
    const literal = (page.text ?? '').replace(/([\\()])/g, '\\$1');
    const content = [
      literal ? `BT /F1 12 Tf 40 760 Td (${literal}) Tj ET` : '',
      page.graphic === 'vector' ? 'q 0.1 0.5 0.2 rg 40 600 60 60 re f Q' : '',
      page.graphic === 'image' ? 'q 500 0 0 700 40 40 cm /Im1 Do Q' : '',
    ].filter(Boolean).join('\n');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> /XObject << /Im1 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 3 >>\nstream\n\x00\x00\x00\nendstream');
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
