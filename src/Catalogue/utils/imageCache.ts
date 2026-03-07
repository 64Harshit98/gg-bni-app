const imageCache = new Map<string, string>();

export const getCompressedBase64 = (url: string): Promise<string | undefined> => {
  return new Promise((resolve) => {

    if (!url) {
      resolve(undefined);
      return;
    }

    if (imageCache.has(url)) {
      resolve(imageCache.get(url));
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = img.width;
        canvas.height = img.height;

        ctx?.drawImage(img, 0, 0);

        const base64 = canvas.toDataURL("image/jpeg", 0.8);

        imageCache.set(url, base64);

        resolve(base64);
      } catch (e) {
        console.error("Canvas convert error", e);
        resolve(undefined);
      }
    };

    img.onerror = () => {
      console.error("Image load failed:", url);
      resolve(undefined);
    };

    img.src = url;
  });
};