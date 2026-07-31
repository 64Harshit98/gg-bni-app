import * as React from 'react';
import { FiCamera } from 'react-icons/fi';

interface IdentityBannerProps {
  previewUrl: string | null;
  logoPreviewUrl: string | null;
  onOpenProfileMenu: () => void;
  onOpenLogoMenu: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  logoInputRef: React.RefObject<HTMLInputElement | null>;
  onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLogoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const IdentityBanner: React.FC<IdentityBannerProps> = ({
  previewUrl,
  logoPreviewUrl,
  onOpenProfileMenu,
  onOpenLogoMenu,
  fileInputRef,
  logoInputRef,
  onImageChange,
  onLogoChange,
}) => (
  <div className="flex items-center gap-6 rounded-2xl border border-border/70 bg-card px-5 py-3 shadow-sm">
    {/* Profile Avatar */}
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <div className="relative">
        <div onClick={onOpenProfileMenu} className="relative cursor-pointer">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Profile"
              className="block size-16 rounded-full border-2 border-card object-cover shadow-md"
            />
          ) : (
            <div className="flex size-16 items-center justify-center rounded-full border-2 border-card bg-muted shadow-md">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="size-9 text-muted-foreground"
              >
                <path
                  fillRule="evenodd"
                  d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          )}
          <div className="absolute bottom-0 right-0 flex size-5 items-center justify-center rounded-full border-2 border-card bg-primary text-white">
            <FiCamera size={8} />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png, image/jpeg, image/jpg"
            className="hidden"
            aria-label="Upload profile photo"
            onChange={onImageChange}
          />
        </div>
      </div>
      <span className="text-[10px] font-medium text-muted-foreground">Profile Photo</span>
    </div>

    <div className="w-px self-stretch bg-border" />

    {/* Company Logo */}
    <div className="flex flex-1 items-center gap-4">
      <div className="relative shrink-0">
        <div onClick={onOpenLogoMenu} className="relative cursor-pointer">
          {logoPreviewUrl ? (
            <img
              src={logoPreviewUrl}
              alt="Company Logo"
              className="size-14 rounded-lg border border-border bg-muted object-contain p-1.5 shadow-sm"
            />
          ) : (
            <div className="flex size-14 flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-border bg-muted text-muted-foreground">
              <FiCamera size={14} />
              <span className="text-[8px] font-bold tracking-wider">LOGO</span>
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border-[1.5px] border-card bg-primary text-white">
            <FiCamera size={7} />
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png, image/jpeg, image/jpg, image/svg+xml"
            className="hidden"
            aria-label="Upload company logo"
            onChange={onLogoChange}
          />
        </div>
      </div>
      <div>
        <p className="m-0 text-[12px] font-semibold text-foreground">Company Logo</p>
        <p className="m-0 mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          Appears on invoices, reports &amp; PDFs.
          <br />
          PNG or JPG recommended.
        </p>
      </div>
    </div>
  </div>
);
