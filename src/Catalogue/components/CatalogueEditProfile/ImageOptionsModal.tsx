import * as React from 'react';
import { createPortal } from 'react-dom';

interface ImageOptionsModalProps {
  title: string;
  hasImage: boolean;
  onUpload: () => void;
  onRemove: () => void;
  onClose: () => void;
}

export const ImageOptionsModal: React.FC<ImageOptionsModalProps> = ({
  title,
  hasImage,
  onUpload,
  onRemove,
  onClose,
}) => {
  const modal = (
    <div
      className="fixed inset-0 z-9999 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="mx-4 mb-4 w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-2xl bg-card shadow-xl sm:mx-0 sm:mb-0 sm:w-80 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-3 text-center">
          <p className="m-0 text-sm font-semibold text-foreground">{title}</p>
        </div>
        <button
          type="button"
          onClick={onUpload}
          className="w-full cursor-pointer border-b border-border bg-card py-3 text-center text-sm font-medium text-primary"
        >
          {hasImage ? 'Change Photo' : 'Add Photo'}
        </button>
        {hasImage && (
          <button
            type="button"
            onClick={onRemove}
            className="w-full cursor-pointer border-b border-border bg-card py-3 text-center text-sm font-medium text-destructive"
          >
            Remove Current Photo
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-full cursor-pointer bg-card py-3 text-center text-sm font-semibold text-muted-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};
