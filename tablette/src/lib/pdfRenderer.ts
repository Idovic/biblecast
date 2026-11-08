/**
 * Rendu PDF → images JPEG base64
 * Chargé uniquement via dynamic import() depuis PresentationPanel.tsx
 *
 * Worker :
 *  pdfjs 3.11.174 exige un workerSrc valide — throw inconditionnel si vide.
 *  On utilise ?url : Vite copie pdf.worker.min.js dans dist/assets/ et
 *  retourne l'URL relative → accessible depuis Capacitor Android WebView
 *  (servi via https://localhost/assets/...).
 *  Si le Worker échoue à démarrer → pdfjs bascule en FakeWorker auto.
 *
 * Accès lib :
 *  UMD exécute `root.pdfjsLib = factory()` → window.pdfjsLib garanti.
 */

import * as pdfjsModule from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

/* eslint-disable @typescript-eslint/no-explicit-any */
function getPdfjsLib(): any {
  const w = window as any;
  if (w.pdfjsLib?.GlobalWorkerOptions) return w.pdfjsLib;
  const m = pdfjsModule as any;
  if (m.default?.GlobalWorkerOptions) return m.default;
  if (m.GlobalWorkerOptions) return m;
  throw new Error('pdfjs-dist non disponible — GlobalWorkerOptions introuvable');
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const pdfjs = getPdfjsLib();
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const yieldToUI = () => new Promise<void>(r => setTimeout(r, 0));

export async function renderPdfToImages(
  file: File,
  quality = 0.82,
  maxWidth = 1920,   // résolution d'une TV Full HD (avant : 960 px, flou sur 42 pouces)
  onProgress?: (current: number, total: number) => void,
): Promise<string[]> {
  const buffer = await file.arrayBuffer();

  const pdf = await pdfjs.getDocument({
    data:            new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts:  true,
  }).promise;

  const images: string[] = [];
  const canvas = document.createElement('canvas');
  const ctx    = canvas.getContext('2d')!;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page  = await pdf.getPage(i);
    const vp0   = page.getViewport({ scale: 1 });
    // Remplit un écran 1920×1080 (avec une petite marge de netteté), sans dépasser ×4
    const scale = Math.min(maxWidth / vp0.width, (1080 * 1.25) / vp0.height, 4);
    const vp    = page.getViewport({ scale });

    canvas.width  = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    images.push(canvas.toDataURL('image/jpeg', quality));

    page.cleanup();
    await yieldToUI();
    onProgress?.(i, pdf.numPages);
  }

  canvas.width  = 0;
  canvas.height = 0;
  return images;
}
