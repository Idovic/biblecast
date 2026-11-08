/* Réduction des images importées : une photo de téléphone (3 à 8 Mo) ferait
   déborder la mémoire de la tablette. On la ramène à la taille de l'écran TV. */

/** Redimensionne à maxWidth (et 1080 px de haut pour un écran 16:9) puis compresse.
    keepTransparency : garde un PNG (logos), sinon JPEG. */
export function compressImage(file: Blob, maxWidth = 1920, quality = 0.82, keepTransparency = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxHeight = Math.round(maxWidth * 1080 / 1920) * 1.5; // affiches verticales : un peu plus de hauteur
      const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * ratio));
      canvas.height = Math.max(1, Math.round(img.height * ratio));
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(keepTransparency ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('image illisible')); };
    img.src = objectUrl;
  });
}

/** Ouvre le sélecteur de fichiers et renvoie l'image réduite (null si annulé ou illisible) */
export function pickImage(opts: { maxWidth?: number; quality?: number; keepTransparency?: boolean; accept?: string } = {}): Promise<{ dataUrl: string; name: string } | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = opts.accept ?? 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      try {
        // Les SVG restent tels quels (vectoriels, légers)
        if (file.type === 'image/svg+xml') {
          const r = new FileReader();
          r.onload = () => resolve({ dataUrl: String(r.result), name: file.name });
          r.onerror = () => resolve(null);
          r.readAsDataURL(file);
          return;
        }
        const dataUrl = await compressImage(file, opts.maxWidth ?? 1920, opts.quality ?? 0.82, opts.keepTransparency);
        resolve({ dataUrl, name: file.name });
      } catch { resolve(null); }
    };
    input.click();
  });
}
