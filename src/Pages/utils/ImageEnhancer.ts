export const enhanceImageForOCR = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();

        reader.onload = (e) => {
            img.src = e.target?.result as string;
        };

        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return reject('Canvas not supported');

            // 1. Upscale the image by 2x to prevent "Image too small" errors
            const scale = 2;
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;

            // Draw the scaled image
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // 2. Extract pixel data for contrast/grayscale processing
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            // 3. Apply Grayscale and High Contrast
            // We push light pixels to pure white and dark pixels to pure black
            // This destroys shadows and helps ignore faint gridlines
            const contrast = 100; // Contrast level (0-255)
            const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

            for (let i = 0; i < data.length; i += 4) {
                // Standard Grayscale conversion
                const avg = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];

                // Apply Contrast thresholding
                const finalColor = factor * (avg - 128) + 128;

                // Clamp values and set R, G, B to the same value
                const clamped = Math.max(0, Math.min(255, finalColor));
                data[i] = clamped;     // R
                data[i + 1] = clamped; // G
                data[i + 2] = clamped; // B
            }

            ctx.putImageData(imageData, 0, 0);

            // Return as a base64 string which Tesseract accepts perfectly
            resolve(canvas.toDataURL('image/jpeg', 1.0));
        };

        img.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
    });
};