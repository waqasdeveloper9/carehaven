import type { Entry } from './types';
import { config } from './config';
export async function exportReport(entries: Entry[], format: 'xlsx'|'pdf') {
 const rows = entries.map(e=>[e.created_at.slice(0,10),e.description,e.category,Number(e.amount_in),Number(e.amount_out),e.verification_status]);
 const columns=['Date','Description','Category',`Received (${config.currency})`,`Spent (${config.currency})`,'Verification'];
 if(format==='xlsx') { const ExcelJS=await import('exceljs'); const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Financial report');sheet.addRow(columns);rows.forEach(r=>sheet.addRow(r));sheet.getRow(1).font={bold:true};sheet.columns.forEach(c=>c.width=24);const buffer=await book.xlsx.writeBuffer();const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const link=document.createElement('a');link.href=url;link.download='financial-report.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
 else { const {jsPDF}=await import('jspdf');const doc=new jsPDF();doc.setFontSize(18);doc.text(`${config.name} | Financial report`,14,20);doc.setFontSize(9);let y=32;doc.text(`Currency: ${config.currency} | Records: ${rows.length}`,14,y);y+=10;for(const row of rows){const lines=doc.splitTextToSize(row.join(' | '),180);if(y+lines.length*5>280){doc.addPage();y=20;}doc.text(lines,14,y);y+=lines.length*5+5;}doc.save('financial-report.pdf'); }
}
