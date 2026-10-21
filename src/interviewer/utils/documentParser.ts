import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Configure pdfjs worker in Vite
try {
  // Use official CDN worker matching version or fallback
  if (typeof window !== 'undefined') {
    const version = pdfjsLib.version || '4.10.38';
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
  }
} catch (e) {
  console.warn('Failed to set pdfjs workerSrc:', e);
}

/**
 * Extracts plain text from an uploaded file (PDF, DOCX, TXT, MD).
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'pdf' || file.type === 'application/pdf') {
    return extractTextFromPdf(file);
  }

  if (
    extension === 'docx' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return extractTextFromDocx(file);
  }

  if (extension === 'doc') {
    throw new Error('Older .doc format is not supported. Please save your file as .docx or .pdf.');
  }

  // Fallback for .txt, .md, and other plain text documents
  return file.text();
}

/**
 * Extracts all text across all pages in a PDF using pdf.js.
 */
async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageString = textContent.items
      .map((item: any) => item.str || '')
      .join(' ')
      .trim();

    if (pageString) {
      pageTexts.push(pageString);
    }
  }

  const combined = pageTexts.join('\n\n');
  if (!combined.trim()) {
    throw new Error('The PDF appears to be empty or contains scanned images without selectable text.');
  }

  return combined;
}

/**
 * Extracts plain text from a DOCX file using mammoth.
 */
async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = result.value ? result.value.trim() : '';

  if (!text) {
    throw new Error('The DOCX file appears to be empty or could not be read.');
  }

  return text;
}
