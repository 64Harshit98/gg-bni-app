// Category image: centre-crop to 128x128, JPEG, compressed until it is small enough for a Firestore doc
const CATEGORY_IMAGE_SIZE = 128;
const CATEGORY_IMAGE_MAX_BYTES = 10 * 1024; // ~10 KB
const CATEGORY_IMAGE_MAX_UPLOAD_MB = 10;

export const fileToCategoryImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file.'));
    if (file.size > CATEGORY_IMAGE_MAX_UPLOAD_MB * 1024 * 1024) {
      return reject(new Error(`Image is too large. Max ${CATEGORY_IMAGE_MAX_UPLOAD_MB} MB.`));
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not load the image.'));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = CATEGORY_IMAGE_SIZE;
        canvas.height = CATEGORY_IMAGE_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Could not process the image.'));
        ctx.fillStyle = '#ffffff'; // transparent PNGs would turn black in JPEG
        ctx.fillRect(0, 0, CATEGORY_IMAGE_SIZE, CATEGORY_IMAGE_SIZE);
        ctx.drawImage(img, sx, sy, side, side, 0, 0, CATEGORY_IMAGE_SIZE, CATEGORY_IMAGE_SIZE);

        let quality = 0.8;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length * 0.75 > CATEGORY_IMAGE_MAX_BYTES && quality > 0.4) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

// Must be a valid https URL that actually loads as an image. Stored as-is.
export const loadImageFromUrl = (rawUrl: string): Promise<string> =>
  new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return reject(new Error('Please enter a valid image link.'));
    }
    if (parsed.protocol !== 'https:') {
      return reject(new Error('Image link must start with https://'));
    }
    const img = new Image();
    img.onload = () => resolve(parsed.toString());
    img.onerror = () => reject(new Error('Could not load an image from this link.'));
    img.src = parsed.toString();
  });