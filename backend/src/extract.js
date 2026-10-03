import mammoth from 'mammoth';
export async function extract(filename,buffer){
 if(/\.(txt|md|csv)$/i.test(filename))return buffer.toString('utf8');
 if(/\.docx$/i.test(filename))return (await mammoth.extractRawText({buffer})).value;
 if(/\.xlsx$/i.test(filename)){
  const {default:readExcelFile}=await import('read-excel-file/node');const sheets=await readExcelFile(buffer);
  if(sheets.length>30||sheets.reduce((count,sheet)=>count+sheet.data.length,0)>20000)throw Error('Maximum 30 sheets and 20,000 rows per spreadsheet.');
  return sheets.map(sheet=>sheet.sheet+'\n'+sheet.data.map(row=>row.map(value=>value instanceof Date?value.toISOString():String(value??'')).join(' | ')).join('\n')).join('\n\n');
 }
 if(/\.pdf$/i.test(filename)){
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=getDocument({data:new Uint8Array(buffer),isEvalSupported:false,useSystemFonts:true});const pdf=await task.promise;
  try{if(pdf.numPages>100)throw Error('Maximum 100 PDF pages per upload.');const pages=[];for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);pages.push((await page.getTextContent()).items.map(x=>x.str||'').join(' '));}return pages.join('\n');}finally{await task.destroy();}
 }
 throw Error('Supported formats: PDF, DOCX, XLSX, TXT, Markdown and CSV.');
}
