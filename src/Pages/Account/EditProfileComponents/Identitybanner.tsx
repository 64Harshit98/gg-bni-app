import React from 'react';
import ImagePicker from './Imagepicker';

interface IdentityBannerProps {
  profilePreviewUrl: string | null;
  logoPreviewUrl: string | null;
  onProfileChange: (file: File) => void;
  onLogoChange: (file: File) => void;
}

const IdentityBanner: React.FC<IdentityBannerProps> = ({
  profilePreviewUrl,
  logoPreviewUrl,
  onProfileChange,
  onLogoChange,
}) => (
  <div className="bg-white rounded-sm border border-slate-100 shadow-sm px-5 py-2 flex items-center gap-6">

    {/* Profile Avatar */}
    <div className="flex flex-col items-center gap-1.5 shrink-0">
      <ImagePicker
        previewUrl={profilePreviewUrl}
        onChange={onProfileChange}
        shape="circle"
        ariaLabel="Upload profile photo"
        size={16}
        fallbackIcon={
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-9 h-9 text-gray-400">
            <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
          </svg>
        }
      />
      <span className="text-[10px] text-slate-400 font-medium">Profile Photo</span>
    </div>

    {/* Divider */}
    <div className="w-px self-stretch bg-slate-100" />

    {/* Company Logo */}
    <div className="flex items-center gap-4 flex-1">
      <ImagePicker
        previewUrl={logoPreviewUrl}
        onChange={onLogoChange}
        shape="square"
        accept="image/png, image/jpeg, image/jpg, image/svg+xml"
        ariaLabel="Upload company logo"
        size={14}
      />
      <div>
        <p className="text-[12px] font-semibold text-slate-700 m-0">Company Logo</p>
        <p className="text-[11px] text-slate-400 m-0 mt-0.5 leading-relaxed">
          Appears on invoices, reports & PDFs.<br />
          PNG or JPG recommended.
        </p>
      </div>
    </div>

  </div>
);

export default IdentityBanner;