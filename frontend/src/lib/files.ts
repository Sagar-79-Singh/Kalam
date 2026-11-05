import { MAX_FILE_BYTES, PDFJS_VERSION } from '../constants';
import type { Attachment } from '../types';
import { uid } from './utils';
interface PDFPage { getTextContent(): Promise<{ items: Array<{ str?: string }> }> }
interface PDFDocument { numPages: number; getPage(page: number): Promise<PDFPage>; destroy(): Promise<void> }
interface PDFModule { GlobalWorkerOptions: { workerSrc: string }; getDocument(options: { data: Uint8Array; isEvalSupported: boolean }): { promise: Promise<PDFDocument> } }
let pdfModule: Promise<PDFModule> | undefined;
export async function readAttachment(file: File): Promise<Attachment> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is too large. The limit is 15 MB per file.`);
  const attachment: Attachment = { id: uid(), name: file.name, mime: file.type || 'text/plain', size: file.size };
  if (/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
    attachment.dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error(`Could not read ${file.name}.`)); reader.readAsDataURL(file);
    });
  } else if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const moduleUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
    pdfModule ??= import(/* @vite-ignore */ moduleUrl).then(module => module as PDFModule).catch(error => { pdfModule = undefined; throw error; });
    let pdf: PDFModule;
    try { pdf = await pdfModule; } catch { throw new Error('The PDF reader could not load. Internet access is needed the first time a PDF is opened.'); }
    pdf.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
    const document = await pdf.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    const pages: string[] = [];
    try { for (let page = 1; page <= Math.min(document.numPages, 100); page++) pages.push((await (await document.getPage(page)).getTextContent()).items.map(item => item.str || '').join(' ')); }
    finally { await document.destroy(); }
    attachment.text = pages.join('\n\n').slice(0, 250_000);
    if (!attachment.text.trim()) throw new Error(`${file.name} has no extractable text. Scanned PDFs need OCR before upload.`);
  } else {
    const buffer = new Uint8Array(await file.arrayBuffer());
    if (buffer.subarray(0, 8192).some(byte => byte === 0)) throw new Error(`${file.name} is a binary file. Upload text, code, PDF, or a supported image.`);
    attachment.text = new TextDecoder().decode(buffer).slice(0, 250_000);
  }
  return attachment;
}
