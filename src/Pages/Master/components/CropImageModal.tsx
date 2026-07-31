import * as React from 'react';
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Crop as CropIcon } from 'lucide-react';
import { Button } from '../../../Components/ui/button';

interface CropImageModalProps {
  rawImageSrc: string;
  crop: Crop | undefined;
  onCropChange: (crop: Crop) => void;
  onCropComplete: (crop: Crop) => void;
  imgRef: React.RefObject<HTMLImageElement | null>;
  onImageLoaded: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  onCancel: () => void;
  onUseFullImage: () => void;
  onCropConfirm: () => void;
}

/** Modal shown right after picking an image, letting the user crop before compression/upload. */
export const CropImageModal: React.FC<CropImageModalProps> = ({
  rawImageSrc,
  crop,
  onCropChange,
  onCropComplete,
  imgRef,
  onImageLoaded,
  onCancel,
  onUseFullImage,
  onCropConfirm,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center gap-2">
          <CropIcon className="size-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Crop Image</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Drag to select the area you want to keep. Click <strong>Use Full Image</strong> to skip cropping.
        </p>
        <div className="flex max-h-[60vh] justify-center overflow-auto">
          <ReactCrop crop={crop} onChange={(c) => onCropChange(c)} onComplete={(c) => onCropComplete(c)} aspect={undefined}>
            <img
              ref={imgRef}
              src={rawImageSrc}
              alt="Crop preview"
              onLoad={onImageLoaded}
              className="max-w-full object-contain"
            />
          </ReactCrop>
        </div>
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onCancel} className="rounded-xl active:scale-[0.98]">
            Cancel
          </Button>
          <Button type="button" variant="secondary" onClick={onUseFullImage} className="rounded-xl active:scale-[0.98]">
            Use Full Image
          </Button>
          <Button type="button" onClick={onCropConfirm} className="rounded-xl active:scale-[0.98]">
            Crop & Use
          </Button>
        </div>
      </div>
    </div>
  );
};
