import React, { useRef } from 'react';
import { FiCamera } from 'react-icons/fi';

interface ImagePickerProps {
  /** Currently displayed image URL (existing or blob preview). */
  previewUrl: string | null;
  /** Called when the user selects a new file. */
  onChange: (file: File) => void;
  /** Visual shape of the preview. */
  shape?: 'circle' | 'square';
  /** Accept string for the hidden file input. */
  accept?: string;
  /** Accessible label for the hidden file input. */
  ariaLabel?: string;
  /** Size of the preview in Tailwind units, e.g. "16" → w-16 h-16. */
  size?: number;
  /** Fallback icon when no preview is available (circle shape only). */
  fallbackIcon?: React.ReactNode;
}

const ImagePicker: React.FC<ImagePickerProps> = ({
  previewUrl,
  onChange,
  shape = 'circle',
  accept = 'image/png, image/jpeg, image/jpg',
  ariaLabel = 'Upload image',
  size = 16,
  fallbackIcon,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onChange(file);
  };

  const sizeClass = `w-${size} h-${size}`;
  const isCircle = shape === 'circle';

  return (
    <div
      onClick={() => inputRef.current?.click()}
      className="relative cursor-pointer"
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Preview"
          className={[
            sizeClass,
            'object-cover border-2 border-white shadow-md shadow-sky-200 block',
            isCircle ? 'rounded-full' : 'rounded-sm object-contain bg-slate-50 p-1.5',
          ].join(' ')}
        />
      ) : (
        <div
          className={[
            sizeClass,
            'border-2 bg-slate-50 flex flex-col items-center justify-center text-slate-300 gap-0.5',
            isCircle
              ? 'rounded-full border-white shadow-md shadow-sky-200 bg-gray-200'
              : 'rounded-sm border-dashed border-slate-200',
          ].join(' ')}
        >
          {fallbackIcon ?? (
            <>
              <FiCamera size={isCircle ? 20 : 14} className={isCircle ? 'text-gray-400' : ''} />
              {!isCircle && (
                <span className="text-[8px] font-bold tracking-wider">LOGO</span>
              )}
            </>
          )}
        </div>
      )}

      {/* Camera badge */}
      <div
        className={[
          'absolute bg-sky-500 border-white flex items-center justify-center text-white',
          isCircle
            ? 'bottom-0 right-0 w-5 h-5 rounded-full border-2'
            : '-bottom-1 -right-1 w-4 h-4 rounded-full border-[1.5px]',
        ].join(' ')}
      >
        <FiCamera size={isCircle ? 8 : 7} />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        aria-label={ariaLabel}
        onChange={handleChange}
      />
    </div>
  );
};

export default ImagePicker;