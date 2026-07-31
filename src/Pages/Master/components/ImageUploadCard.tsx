import * as React from 'react';
import { ImagePlus, Link2, X } from 'lucide-react';
import { Spinner } from '../../../constants/Spinner';

interface ImageUploadCardProps {
  imagePreview: string | null;
  isImageCompressing: boolean;
  imageUrl: string;
  imageFile: File | null;
  requireImage?: boolean;
  imageInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUrlChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: () => void;
}

/**
 * Product image dropzone + "paste an image URL" fallback. Doubles as the
 * empty state for the image field (dashed border + prompt) and shows a
 * lightweight compressing indicator while the picked file is optimized.
 */
export const ImageUploadCard: React.FC<ImageUploadCardProps> = ({
  imagePreview,
  isImageCompressing,
  imageUrl,
  imageFile,
  requireImage,
  imageInputRef,
  onFileChange,
  onUrlChange,
  onRemoveImage,
}) => {
  return (
    <div className="mb-6 flex flex-col items-start gap-4 md:flex-row">
      <div
        className="group relative flex h-32 w-32 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-muted transition-all duration-200 hover:border-primary/50 hover:bg-muted/70 hover:shadow-md"
        onClick={() => imageInputRef.current?.click()}
      >
        {isImageCompressing ? (
          <div className="flex flex-col items-center">
            <Spinner />
            <span className="mt-2 text-[10px] text-muted-foreground">Compressing...</span>
          </div>
        ) : imagePreview ? (
          <img
            src={imagePreview}
            alt="Preview"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 px-2 text-center">
            <ImagePlus className="size-6 text-muted-foreground transition-colors group-hover:text-primary" />
            <span className="text-xs font-medium text-muted-foreground">Click to add image</span>
            <span className="text-[10px] text-muted-foreground/70">JPG, PNG · up to 5MB</span>
          </div>
        )}
        <input type="file" accept="image/*" ref={imageInputRef} onChange={onFileChange} className="hidden" />
      </div>
      <div className="w-full flex-1 space-y-2">
        <div className="flex flex-col">
          <label
            className={`mb-1 flex items-center gap-1.5 text-sm font-medium leading-none text-muted-foreground ${requireImage ? "after:content-['*'] after:ml-0.5 after:text-destructive" : ''
              }`}
          >
            <Link2 className="size-3.5" /> Or paste Image URL
          </label>
          <input
            type="text"
            value={imageUrl}
            onChange={onUrlChange}
            disabled={!!imageFile}
            className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-primary/40 disabled:bg-muted disabled:text-muted-foreground"
            placeholder="https://example.com/image.jpg"
          />
        </div>
        {imageFile && (
          <button
            onClick={onRemoveImage}
            className="inline-flex items-center gap-1 text-xs text-destructive transition-colors hover:underline"
          >
            <X className="size-3" /> Remove Selected Image
          </button>
        )}
      </div>
    </div>
  );
};
