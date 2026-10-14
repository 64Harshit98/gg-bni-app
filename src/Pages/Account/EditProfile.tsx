import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db, auth, storage } from '../../lib/Firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../context/auth-context';
import {
  FiCamera, FiCheck, FiX, FiUser, FiImage, FiBriefcase, FiMapPin, FiCreditCard,
  FiShare2, FiShoppingBag, FiLock, FiAlertTriangle, FiUpload, FiChevronDown,
  FiInstagram, FiFacebook, FiTwitter, FiMessageCircle,
} from 'react-icons/fi';
import { invalidateLogoCache, logoCache } from '../../Catalogue/hooks/useCompanyLogo';
import BackButton from '../../Components/BackButton';

// ─── Theme tokens (Tailwind arbitrary properties) ─────────────────────────
// Light + dark values live here as CSS variables; every class below reads them via var(--…).
// Put THEME on the page wrapper AND on the dropdown portal (portals render outside the wrapper).
const THEME = `
  [--primary:#155dfc] [--primary-hover:#1447e6] dark:[--primary-hover:#2b6bff] [--primary-text:#155dfc]
  dark:[--primary-text:#51a2ff] [--on-primary:#fff] [--primary-soft:#e6eeff] dark:[--primary-soft:#162456]
  [--primary-soft-ink:#155dfc] dark:[--primary-soft-ink:#8ec5ff] [--canvas:#eef2ff] dark:[--canvas:#060b1f]
  [--surface:#fff] dark:[--surface:#0e1530] [--surface-sunken:#f5f7ff] dark:[--surface-sunken:#172045]
  [--ink:#0f172b] dark:[--ink:#f1f5f9] [--ink-muted:#45556c] dark:[--ink-muted:#cbd5f0]
  [--ink-subtle:#5b6b86] dark:[--ink-subtle:#94a3c8] [--border:#dfe6fb] dark:[--border:#26315c]
  [--border-control:#7a8aa3] dark:[--border-control:#6573a8] [--focus-ring:#155dfc] dark:[--focus-ring:#51a2ff]
  [--success:#008236] dark:[--success:#05df72] [--success-soft:#e9faef] dark:[--success-soft:#0b3322]
  [--danger:#d5000c] dark:[--danger:#ff6467] [--danger-soft:#ffeef0] dark:[--danger-soft:#3f0d12]
  [--warning:#bb4d00] dark:[--warning:#ffb900] [--warning-soft:#fff3dd] dark:[--warning-soft:#3d2605]
  [--magenta-soft:#ffe8f8] dark:[--magenta-soft:#3d0a31] [--magenta-ink:#c4009a] dark:[--magenta-ink:#ff4fd8]
  [--shadow-card:0_1px_2px_rgba(21,48,140,.05),0_2px_6px_rgba(21,48,140,.06)] dark:[--shadow-card:none]
`.replace(/\s+/g, ' ').trim();

// ─── Options ──────────────────────────────────────────────────────────────
const toOptions = (list: string[]) => list.map(v => ({ value: v, label: v }));

const businessTypeOptions = toOptions(['Retail', 'Wholesale', 'Services', 'Manufacturing', 'Other']);

const businessCategoryOptions = [
  { value: 'Electronics', label: 'Electronics' },
  { value: 'Gifts & Stationery', label: 'Gifts & Stationery' },
  { value: 'Grocery', label: 'Grocery' },
  { value: 'Fashion', label: 'Fashion & Apparel' },
  { value: 'Health & Beauty', label: 'Health & Beauty' },
  { value: 'Home & Furniture', label: 'Home & Furniture' },
  { value: 'Food & Beverage', label: 'Food & Beverage' },
  { value: 'Other', label: 'Other' },
];

const stateOptions = toOptions([
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
]);

// --- Data Types ---
interface ProfileData {
  name: string;
  email: string;
  phone: string;
  panNumber: string;
  accountType: string;
  profilePicture?: string;
  companyLogo?: string;
  businessName: string;
  businessType: string;
  businessCategory: string;
  registrationNumber: string;
  gstin: string;
  msmeUdyamNumber: string;
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  ifscCode: string;
  instagram?: string;
  facebook?: string;
  twitter?: string;
  gmail?: string;
  whatsappNumber?: string;
}

// --- UTILITY: Logo Compression (PNG keeps transparency) ---
const compressLogo = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
      const MAX_SIZE = 500;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
      } else {
        if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context failed')); return; }

      // White fill first so transparent areas never turn black
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Logo compression failed'));
          URL.revokeObjectURL(img.src);
        },
        'image/png',
        0.9
      );
    };

    img.onerror = (error) => { URL.revokeObjectURL(img.src); reject(error); };
  });
};

// --- UTILITY: Aggressive Image Compression (profile photo) ---
const compressImage = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
      const MAX_WIDTH = 500;
      const MAX_HEIGHT = 500;

      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
      } else {
        if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context failed')); return; }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Image compression failed'));
          URL.revokeObjectURL(img.src);
        },
        'image/jpeg',
        0.5
      );
    };

    img.onerror = (error) => { URL.revokeObjectURL(img.src); reject(error); };
  });
};

// --- Custom Hook ---
const useProfileData = (userId?: string, companyId?: string) => {
  const [profile, setProfile] = useState<Partial<ProfileData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfileData = async () => {
    if (!userId || !companyId) return;
    setLoading(true);
    try {
      const userDocRef = doc(db, 'companies', companyId, 'users', userId);
      const businessDocRef = doc(db, 'companies', companyId, 'business_info', companyId);
      const [userDocSnap, businessDocSnap] = await Promise.all([
        getDoc(userDocRef),
        getDoc(businessDocRef),
      ]);
      const userData = userDocSnap.exists() ? userDocSnap.data() : {};
      const businessData = businessDocSnap.exists() ? businessDocSnap.data() : {};

      setProfile({
        ...businessData, // business data first
        name: userData.name || '',
        email: userData.email || '',
        phone: userData.phoneNumber || userData.phone || '',
        profilePicture: userData.profilePicture || businessData.profilePicture || '',
        panNumber: userData.panNumber || '',
        accountType: userData.accountType || '',
        msmeUdyamNumber: userData.msmeUdyamNumber || businessData.msmeUdyamNumber || '',
        businessType: businessData.businessType || '',
        businessCategory: businessData.businessCategory || '',
        companyLogo: businessData.companyLogo || '',
      });
    } catch (err) {
      console.error('Error fetching profile data:', err);
      setError('Failed to load profile information.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!userId || !companyId) {
      setLoading(false);
      return;
    }
    fetchProfileData();
  }, [userId, companyId]);

  const refetch = () => { fetchProfileData(); };

  const saveData = async (data: Partial<ProfileData>) => {
    if (!userId || !companyId || !auth.currentUser) {
      throw new Error('User or company is not authenticated.');
    }

    const { name, email, phone, profilePicture, accountType, ...businessData } = data;

    const userDocRef = doc(db, 'companies', companyId, 'users', userId);
    const businessDocRef = doc(db, 'companies', companyId, 'business_info', companyId);

    const promises: Promise<unknown>[] = [];

    const authUpdates: { displayName?: string; photoURL?: string } = {};
    if (name && auth.currentUser.displayName !== name) authUpdates.displayName = name;
    if (profilePicture && auth.currentUser.photoURL !== profilePicture) authUpdates.photoURL = profilePicture;
    if (Object.keys(authUpdates).length > 0) {
      promises.push(updateProfile(auth.currentUser, authUpdates));
    }

    // User doc (never send undefined to Firestore)
    const userUpdateData: Record<string, any> = {};
    if (name) userUpdateData.name = name;
    if (phone !== undefined) userUpdateData.phoneNumber = phone;
    if (email !== undefined) userUpdateData.email = email;
    if (data.panNumber !== undefined) userUpdateData.panNumber = data.panNumber;
    if (accountType !== undefined) userUpdateData.accountType = accountType;
    if (data.msmeUdyamNumber !== undefined) userUpdateData.msmeUdyamNumber = data.msmeUdyamNumber;
    if (profilePicture !== undefined) userUpdateData.profilePicture = profilePicture;
    if (Object.keys(userUpdateData).length > 0) {
      promises.push(setDoc(userDocRef, userUpdateData, { merge: true }));
    }

    // Business info doc
    const cleanBusinessData = Object.fromEntries(
      Object.entries(businessData).filter(([_, v]) => v !== undefined)
    );
    promises.push(setDoc(businessDocRef, {
      ...cleanBusinessData,
      ...(name !== undefined && { ownerName: name }),
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phoneNumber: phone }),
      updatedAt: serverTimestamp(),
    }, { merge: true }));

    await Promise.all(promises);
  };

  return { profile, loading, error, saveData, refetch };
};

// ─── Validation hints (display-only: they never block saving) ─────────────
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
const looksLikeWebsite = (v: string) => /^(https?:\/\/|www\.)/i.test(v) || /\.(com|in|co|net|org|io)(\/|$)/i.test(v);

const SECTIONS = [
  { id: 'ep-logo', label: 'Photo & logo', Icon: FiImage },
  { id: 'ep-personal', label: 'Personal', Icon: FiUser },
  { id: 'ep-business', label: 'Business', Icon: FiBriefcase },
  { id: 'ep-address', label: 'Address', Icon: FiMapPin },
  { id: 'ep-bank', label: 'Bank details', Icon: FiCreditCard },
  { id: 'ep-social', label: 'Social media', Icon: FiShare2 },
];

const scrollToSection = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

// ─── Shared class strings ─────────────────────────────────────────────────
const FOCUS_RING = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]';

const BTN = `inline-flex items-center justify-center gap-2 h-10 px-4 rounded-sm border border-transparent bg-transparent text-sm font-medium leading-5 whitespace-nowrap cursor-pointer transition-colors [&_svg]:w-4 [&_svg]:h-4 [&_svg]:shrink-0 disabled:opacity-45 disabled:cursor-not-allowed ${FOCUS_RING}`;
const BTN_PRIMARY = `${BTN} bg-[color:var(--primary)] text-[color:var(--on-primary)] hover:bg-[color:var(--primary-hover)]`;
const BTN_SECONDARY = `${BTN} bg-[color:var(--surface)] text-[color:var(--ink)] border-[color:var(--border-control)] hover:bg-[color:var(--surface-sunken)]`;
const BTN_GHOST = `${BTN} text-[color:var(--ink-muted)] hover:bg-[color:var(--surface-sunken)] hover:text-[color:var(--ink)]`;
const BTN_SM = 'h-8 px-3 text-[13px]';

const TINTS = {
  '': 'bg-[color:var(--primary-soft)] text-[color:var(--primary-soft-ink)]',
  green: 'bg-[color:var(--success-soft)] text-[color:var(--success)]',
  amber: 'bg-[color:var(--warning-soft)] text-[color:var(--warning)]',
  magenta: 'bg-[color:var(--magenta-soft)] text-[color:var(--magenta-ink)]',
};

const SPIN = 'inline-block w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin';

// ─── Field: label above the box, optional icon / +91 prefix / hint / flag ──
interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: React.ReactNode;
  leading?: string;
  hint?: string;
  warn?: string | null;
  error?: string | null;
  locked?: boolean;
  wrapClass?: string;
}

const Field: React.FC<FieldProps> = ({ label, icon, leading, hint, warn, error, locked, wrapClass = '', ...inputProps }) => {
  const borderCls = error
    ? 'border-[color:var(--danger)]'
    : warn
      ? 'border-[color:var(--warning)]'
      : 'border-[color:var(--border-control)]';
  return (
    <label className={`grid grid-cols-[minmax(0,1fr)] gap-1 min-w-0 content-start ${wrapClass}`}>
      <span className="text-xs leading-[18px] font-medium text-[color:var(--ink-muted)]">{label}</span>
      <div
        className={`relative min-w-0 w-full flex items-center gap-2 h-11 px-3 border rounded-sm focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[color:var(--focus-ring)] max-sm:group-[.two]:px-2.5 ${borderCls} ${locked
          ? 'bg-[color:var(--surface-sunken)] text-[color:var(--ink-muted)]'
          : 'bg-[color:var(--surface)] text-[color:var(--ink-subtle)]'
          }`}
      >
        {icon && <span data-ico className="inline-flex [&_svg]:w-4 [&_svg]:h-4 [&_svg]:shrink-0">{icon}</span>}
        {leading && (
          <span className="text-[13px] text-[color:var(--ink-subtle)] pr-2 border-r border-[color:var(--border)]">{leading}</span>
        )}
        <input
          {...inputProps}
          readOnly={locked || inputProps.readOnly}
          className={`flex-1 basis-0 w-0 min-w-0 h-full border-0 outline-none bg-transparent text-sm font-[inherit] placeholder:text-[color:var(--ink-subtle)] ${locked ? 'text-[color:var(--ink-muted)] cursor-not-allowed' : 'text-[color:var(--ink)]'}`}
        />
      </div>
      {error ? (
        <span className="flex gap-1 items-start text-xs leading-4 font-medium text-[color:var(--danger)]">
          <FiAlertTriangle className="w-[13px] h-[13px] mt-px shrink-0" />{error}
        </span>
      ) : warn ? (
        <span className="flex gap-1 items-start text-xs leading-4 font-medium text-[color:var(--warning)]">
          <FiAlertTriangle className="w-[13px] h-[13px] mt-px shrink-0" />{warn}
        </span>
      ) : hint ? (
        <small className="text-[11px] leading-[15px] text-[color:var(--ink-subtle)]">{hint}</small>
      ) : null}
    </label>
  );
};

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[];
  wrapClass?: string;
}

// Custom dropdown: opens right under the field, same width, styled with the design tokens.
// Keeps the same onChange(e.target.value) contract as a native <select>.
const SelectField: React.FC<SelectFieldProps> = ({ id, label, value, onChange, options, wrapClass = '' }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const selected = options.find(o => o.value === value);
  const shown = selected ? selected.label : value; // legacy values not in the list still show

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const openUp = below < 200 && above > below;
    const maxH = Math.max(120, Math.min(280, openUp ? above : below));
    setPos(openUp
      ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4, maxH }
      : { left: r.left, width: r.width, top: r.bottom + 4, maxH });
  };

  useEffect(() => {
    if (!open) return;
    place();
    selectedRef.current?.scrollIntoView({ block: 'center' });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onScroll = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  const pick = (v: string) => {
    onChange({ target: { value: v } } as React.ChangeEvent<HTMLSelectElement>);
    setOpen(false);
  };

  return (
    <div className={`grid grid-cols-[minmax(0,1fr)] gap-1 min-w-0 content-start ${wrapClass}`}>
      <span className="text-xs leading-[18px] font-medium text-[color:var(--ink-muted)]" id={`${id}-label`}>{label}</span>
      <button
        type="button" id={id} ref={triggerRef}
        aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-label ${id}`}
        onClick={() => setOpen(o => !o)}
        className={`w-full min-w-0 h-11 px-3 flex items-center justify-between gap-2 text-left cursor-pointer border border-[color:var(--border-control)] rounded-sm bg-[color:var(--surface)] text-[color:var(--ink-subtle)] font-[inherit] ${open ? 'outline outline-2 outline-offset-1 outline-[color:var(--focus-ring)]' : ''} ${FOCUS_RING}`}
      >
        <span className={`flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm max-sm:text-[13px] ${shown ? 'text-[color:var(--ink)]' : 'text-[color:var(--ink-subtle)]'}`}>
          {shown || 'Select'}
        </span>
        <FiChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-100 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && pos && createPortal(
        <div className={`${THEME} fixed inset-0 z-[9999] font-[Poppins,system-ui,sans-serif] text-sm`} onClick={() => setOpen(false)} role="presentation">
          <ul
            ref={menuRef} role="listbox" aria-label={label}
            onClick={e => e.stopPropagation()}
            style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
            className="fixed list-none m-0 p-1.5 overflow-y-auto grid gap-0.5 content-start bg-[color:var(--surface)] border border-[color:var(--border)] rounded-sm shadow-[0_10px_28px_rgba(21,48,140,.14),0_2px_6px_rgba(21,48,140,.08)]"
          >
            {options.map(o => {
              const on = o.value === value;
              return (
                <li key={o.value} role="option" aria-selected={on}>
                  <button
                    type="button" ref={on ? selectedRef : undefined} onClick={() => pick(o.value)}
                    className={`flex items-center justify-between gap-2 w-full min-h-10 px-2.5 border-0 rounded-sm text-sm text-left cursor-pointer ${on
                      ? 'bg-[color:var(--primary-soft)] text-[color:var(--primary-soft-ink)] font-medium'
                      : 'bg-transparent text-[color:var(--ink)] hover:bg-[color:var(--surface-sunken)]'}`}
                  >
                    <span>{o.label}</span>{on && <FiCheck size={16} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>,
        document.body
      )}
    </div>
  );
};

// ─── Section card ─────────────────────────────────────────────────────────
const Section: React.FC<{
  id: string; title: string; sub: string; icon: React.ReactNode;
  tone?: '' | 'green' | 'amber' | 'magenta'; count?: number; children: React.ReactNode;
}> = ({ id, title, sub, icon, tone = '', count = 0, children }) => (
  <section
    id={id}
    className="min-w-0 scroll-mt-[120px] overflow-hidden bg-[color:var(--surface)] border border-[color:var(--border)] rounded-sm [box-shadow:var(--shadow-card)]"
  >
    <div className="flex items-center gap-3 px-3.5 py-3 sm:px-[18px] sm:py-3.5 border-b border-[color:var(--border)]">
      <span className={`w-8 h-8 shrink-0 inline-grid place-items-center rounded-sm [&_svg]:w-[18px] [&_svg]:h-[18px] ${TINTS[tone]}`}>{icon}</span>
      <div>
        <b className="block text-[15px] sm:text-base leading-[22px] font-semibold">{title}</b>
        <small className="block text-xs leading-4 text-[color:var(--ink-subtle)]">{sub}</small>
      </div>
      {count > 0 && (
        <span className="ml-auto text-[11px] font-semibold whitespace-nowrap rounded-full px-2.5 py-0.5 text-[color:var(--warning)] bg-[color:var(--warning-soft)]">
          {count} to fix
        </span>
      )}
    </div>
    {children}
  </section>
);

// ─── Photo / logo upload row ──────────────────────────────────────────────
const UploadRow: React.FC<{
  shape: 'round' | 'sq';
  title: string;
  desc: string;
  url: string | null;
  emptyIcon: React.ReactNode;
  onPick: () => void;
  onRemove: () => void;
  children?: React.ReactNode;
}> = ({ shape, title, desc, url, emptyIcon, onPick, onRemove, children }) => (
  <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3.5 items-center p-3 sm:p-3.5 border border-[color:var(--border)] rounded-sm bg-[color:var(--surface-sunken)]">
    <div className="relative w-16 h-16 sm:w-[76px] sm:h-[76px]">
      {url ? (
        <img
          src={url} alt={title}
          className={`w-full h-full block ${shape === 'round'
            ? 'object-cover rounded-full'
            : 'object-contain p-1.5 rounded-sm border border-[color:var(--border)] bg-white'}`}
        />
      ) : (
        <div
          className={`w-full h-full grid place-items-center bg-[color:var(--surface)] text-[color:var(--ink-subtle)] border-[color:var(--border-control)] [&_svg]:w-6 [&_svg]:h-6 ${shape === 'round'
            ? 'rounded-full border'
            : 'rounded-[14px] border-2 border-dashed'}`}
        >
          {emptyIcon}
        </div>
      )}
      <button
        type="button" onClick={onPick}
        aria-label={url ? `Change ${title.toLowerCase()}` : `Add ${title.toLowerCase()}`}
        className="absolute -right-1 -bottom-1 w-7 h-7 p-0 rounded-full grid place-items-center cursor-pointer bg-[color:var(--primary)] text-white border-2 border-[color:var(--surface)] [&_svg]:w-3.5 [&_svg]:h-3.5"
      >
        <FiCamera />
      </button>
    </div>
    <div>
      <b className="text-sm">{title}</b>
      <p className="mt-0.5 mb-2 text-xs leading-[17px] text-[color:var(--ink-subtle)]">{desc}</p>
      <div className="flex gap-1.5 flex-wrap">
        <button type="button" className={`${BTN_SECONDARY} ${BTN_SM}`} onClick={onPick}>
          <FiUpload />{url ? 'Change' : 'Add photo'}
        </button>
        {url && (
          <button type="button" className={`${BTN_GHOST} ${BTN_SM}`} onClick={onRemove}>Remove</button>
        )}
      </div>
    </div>
    {children}
  </div>
);

// Shared grid classes
const GRID_1 = 'grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-3 p-3.5 sm:grid-cols-2 sm:px-[18px] sm:py-4';
// 2-up on every screen; tighter on phones. `group two` lets Field shrink its padding there.
const GRID_2 = 'group two grid grid-cols-2 gap-x-2.5 gap-y-3 px-3 py-3.5 sm:gap-x-4 sm:px-[18px] sm:py-4 max-sm:[&_[data-ico]]:hidden';
const GRID_3 = `${GRID_2} lg:grid-cols-3`;

// --- Main Edit Profile Page Component ---
const EditProfilePage: React.FC = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const { profile, loading: dataLoading, error: dataError, saveData, refetch } = useProfileData(currentUser?.uid, currentUser?.companyId);

  const [formData, setFormData] = useState<Partial<ProfileData>>({});
  const [customBusinessType, setCustomBusinessType] = useState('');
  const [customBusinessCategory, setCustomBusinessCategory] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [postalError, setPostalError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [removeProfilePicture, setRemoveProfilePicture] = useState(false);
  const [removeCompanyLogo, setRemoveCompanyLogo] = useState(false);

  // UI-only: which section is in view (section nav highlight)
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);

  const freshUploadRef = useRef<{ profilePicture?: string; companyLogo?: string }>({});

  useEffect(() => {
    const isCustomType = profile.businessType &&
      !businessTypeOptions.some(o => o.value === profile.businessType);
    const isCustomCategory = profile.businessCategory &&
      !businessCategoryOptions.some(o => o.value === profile.businessCategory);

    if (isCustomType) setCustomBusinessType(profile.businessType!);
    if (isCustomCategory) setCustomBusinessCategory(profile.businessCategory!);
    setFormData({
      ...profile,
      businessType: isCustomType ? 'Other' : (profile.businessType || ''),
      businessCategory: isCustomCategory ? 'Other' : (profile.businessCategory || ''),
    });
    // Only use profile's URLs if we don't have a freshly uploaded one
    if (profile.profilePicture && !imageFile && !freshUploadRef.current.profilePicture) {
      setPreviewUrl(profile.profilePicture);
    } else if (freshUploadRef.current.profilePicture) {
      setPreviewUrl(freshUploadRef.current.profilePicture);
    }
    if (profile.companyLogo && !logoFile && !freshUploadRef.current.companyLogo) {
      setLogoPreviewUrl(profile.companyLogo);
    } else if (freshUploadRef.current.companyLogo) {
      setLogoPreviewUrl(freshUploadRef.current.companyLogo);
    }
  }, [profile]);

  // UI-only: highlight the section nav item for whatever card is on screen
  useEffect(() => {
    if (authLoading || dataLoading || typeof IntersectionObserver === 'undefined') return;
    const els = SECTIONS.map(s => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const obs = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveSection(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -60% 0px' }
    );
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [authLoading, dataLoading]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePostalCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d{0,6}$/.test(value)) {
      setFormData(prev => ({ ...prev, postalCode: value }));
      if (value.length > 0 && value.length < 6) {
        setPostalError('Postal code must be exactly 6 digits.');
      } else {
        setPostalError(null);
      }
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d{0,10}$/.test(value)) {
      setFormData(prev => ({ ...prev, phone: value }));
      if (value.length > 0 && value.length < 10) {
        setPhoneError('Phone number must be exactly 10 digits.');
      } else {
        setPhoneError(null);
      }
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLogoFile(file);
      setLogoPreviewUrl(URL.createObjectURL(file));
      setRemoveCompanyLogo(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      // Show the raw file in preview instantly for better UX
      setPreviewUrl(URL.createObjectURL(file));
      setRemoveProfilePicture(false);
    }
  };

  const handleRemoveProfilePicture = () => {
    setPreviewUrl(null);
    setImageFile(null);
    setRemoveProfilePicture(true);
    freshUploadRef.current.profilePicture = undefined;
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveCompanyLogo = () => {
    setLogoPreviewUrl(null);
    setLogoFile(null);
    setRemoveCompanyLogo(true);
    freshUploadRef.current.companyLogo = undefined;
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    // GSTIN can be edited but never fully removed once it has been saved
    if (profile.gstin && profile.gstin.trim() !== '' && (!formData.gstin || formData.gstin.trim() === '')) {
      setSubmitError('GSTIN cannot be removed once added. You can only edit/update it.');
      return;
    }
    if (formData.postalCode && formData.postalCode.length !== 6) {
      setSubmitError('Postal code must be exactly 6 digits.');
      return;
    }
    if (formData.phone && formData.phone.length !== 10) {
      setSubmitError('Phone number must be exactly 10 digits.');
      return;
    }
    if (formData.msmeUdyamNumber && formData.msmeUdyamNumber.length !== 19) {
      setSubmitError('MSME/Udyam number must be exactly 19 digits.');
      return;
    }
    if (formData.panNumber && formData.panNumber.length !== 10) {
      setSubmitError('PAN number must be exactly 10 characters.');
      return;
    }
    if (formData.gstin && formData.gstin.length !== 15) {
      setSubmitError('GSTIN must be exactly 15 characters.');
      return;
    }

    setIsSubmitting(true);

    try {
      let finalPhotoUrl = removeProfilePicture ? '' : formData.profilePicture;

      if (imageFile && currentUser?.companyId && currentUser?.uid) {
        // .jpg because compressImage always outputs JPEG
        const storagePath = `companies/${currentUser.companyId}/users/${currentUser.uid}/profile_pic.jpg`;
        const storageRef = ref(storage, storagePath);
        const compressedBlob = await compressImage(imageFile);
        await uploadBytes(storageRef, compressedBlob);
        finalPhotoUrl = await getDownloadURL(storageRef);
      }

      let finalLogoUrl = removeCompanyLogo ? '' : formData.companyLogo;
      if (logoFile && currentUser?.companyId) {
        invalidateLogoCache(currentUser.companyId);
        const logoPath = `companies/${currentUser.companyId}/branding/company_logo.png`;
        const logoRef = ref(storage, logoPath);
        const compressedLogo = await compressLogo(logoFile);
        await uploadBytes(logoRef, compressedLogo);
        finalLogoUrl = await getDownloadURL(logoRef);
        logoCache[currentUser.companyId] = finalLogoUrl;
      }

      const finalBusinessType = formData.businessType === 'Other' ? customBusinessType : formData.businessType;
      const finalBusinessCategory = formData.businessCategory === 'Other' ? customBusinessCategory : formData.businessCategory;
      await saveData({ ...formData, profilePicture: finalPhotoUrl, companyLogo: finalLogoUrl, businessType: finalBusinessType, businessCategory: finalBusinessCategory });

      refetch(); // pull the latest from Firestore after save
      setFormData(prev => ({ ...prev, profilePicture: finalPhotoUrl, companyLogo: finalLogoUrl }));
      if (finalPhotoUrl) freshUploadRef.current.profilePicture = finalPhotoUrl;
      if (finalLogoUrl) freshUploadRef.current.companyLogo = finalLogoUrl;
      setLogoFile(null);
      setImageFile(null);
      setRemoveProfilePicture(false);
      setRemoveCompanyLogo(false);
      if (finalLogoUrl) setLogoPreviewUrl(finalLogoUrl);
      if (finalPhotoUrl) setPreviewUrl(finalPhotoUrl);

      setSubmitSuccess('Profile updated successfully!');
      setTimeout(() => setSubmitSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to save profile:', err);
      setSubmitError('Failed to save profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Discard: put every field, preview and pending upload back to the last saved profile
  const handleDiscard = () => {
    const isCustomType = !!profile.businessType &&
      !businessTypeOptions.some(o => o.value === profile.businessType);
    const isCustomCategory = !!profile.businessCategory &&
      !businessCategoryOptions.some(o => o.value === profile.businessCategory);
    setFormData({
      ...profile,
      businessType: isCustomType ? 'Other' : (profile.businessType || ''),
      businessCategory: isCustomCategory ? 'Other' : (profile.businessCategory || ''),
    });
    setCustomBusinessType(isCustomType ? profile.businessType! : '');
    setCustomBusinessCategory(isCustomCategory ? profile.businessCategory! : '');
    setImageFile(null);
    setLogoFile(null);
    setRemoveProfilePicture(false);
    setRemoveCompanyLogo(false);
    setPreviewUrl(freshUploadRef.current.profilePicture || profile.profilePicture || null);
    setLogoPreviewUrl(freshUploadRef.current.companyLogo || profile.companyLogo || null);
    setPostalError(null);
    setPhoneError(null);
    setSubmitError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const PAGE = `${THEME} min-h-screen flex flex-col bg-[color:var(--canvas)] text-[color:var(--ink)] font-[Poppins,system-ui,-apple-system,'Segoe_UI',sans-serif] text-sm leading-[22px] [&_*]:box-border`;

  // ── Loading state ──
  if (authLoading || dataLoading) {
    return (
      <div className={PAGE}>
        <div className="flex-1 grid place-items-center text-center text-[color:var(--ink-muted)] p-6">
          <div>
            <div className="w-10 h-10 mx-auto mb-3 rounded-full border-[3px] border-[color:var(--border)] border-t-[color:var(--primary)] animate-spin" />
            <p className="m-0">Loading profile…</p>
          </div>
        </div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className={PAGE}>
        <div className="flex-1 grid place-items-center text-center p-6 text-[color:var(--danger)]">{dataError}</div>
      </div>
    );
  }

  // ── Display-only profile check (never blocks saving) ──
  const pan = (formData.panNumber || '').trim();
  const gstin = (formData.gstin || '').trim();
  const ifsc = (formData.ifscCode || '').trim();
  const insta = (formData.instagram || '').trim();
  const specType = formData.businessType === 'Other' ? customBusinessType.trim() : '';
  const specCat = formData.businessCategory === 'Other' ? customBusinessCategory.trim() : '';

  const panWarn = pan && !PAN_RE.test(pan) ? 'Not a valid PAN — it looks like ABCDE1234F' : null;
  const gstinWarn = gstin && !GSTIN_RE.test(gstin) ? 'Doesn’t look like a valid GSTIN — e.g. 09ABCDE1234F1Z5' : null;
  const ifscWarn = ifsc && !IFSC_RE.test(ifsc) ? 'IFSC has 11 characters, like SBIN0001234' : null;
  const instaWarn = insta && looksLikeWebsite(insta) ? 'This is a website — use your handle, e.g. @superstore' : null;
  const typeWarn = specType && specType.length < 3 ? `Shows as “${specType}” — e.g. Supermarket` : null;
  const catWarn = specCat && specCat.length < 3 ? `Shows as “${specCat}” — e.g. Grocery` : null;

  const issues = [
    panWarn && { section: 'ep-personal', label: 'PAN No.', note: `“${pan}” isn’t a valid PAN` },
    typeWarn && { section: 'ep-business', label: 'Specify type', note: `Shows as “${specType}”` },
    catWarn && { section: 'ep-business', label: 'Specify category', note: `Shows as “${specCat}”` },
    gstinWarn && { section: 'ep-business', label: 'GSTIN', note: 'Doesn’t match the GSTIN format' },
    ifscWarn && { section: 'ep-bank', label: 'IFSC code', note: 'Should be 11 characters, like SBIN0001234' },
    instaWarn && { section: 'ep-social', label: 'Instagram', note: 'Is a website, not an Instagram handle' },
  ].filter(Boolean) as { section: string; label: string; note: string }[];

  const TOTAL_CHECKS = 6;
  const countFor = (id: string) => issues.filter(i => i.section === id).length;
  const passPct = Math.round(((TOTAL_CHECKS - issues.length) / TOTAL_CHECKS) * 100);

  const billAddress = [formData.streetAddress, formData.city, formData.state].filter(Boolean).join(', ')
    + (formData.postalCode ? ` – ${formData.postalCode}` : '');
  const billContact = [formData.phone, formData.email].filter(Boolean).join(' · ');

  const PANEL = 'grid gap-2.5 p-3.5 bg-[color:var(--surface)] border border-[color:var(--border)] rounded-sm [box-shadow:var(--shadow-card)]';

  return (
    <div className={PAGE}>
      {/* ── Page header + mobile chips (pinned on scroll) ── */}
      <div className="sticky top-0 z-[25]">
        <header className="flex items-center gap-3 px-4 py-3 sm:px-6 sm:py-3.5 bg-[color:var(--surface)] border-b border-[color:var(--border)]">
          <BackButton />
          <div>
            <small className="block text-xs leading-4 text-[color:var(--ink-subtle)]">Account</small>
            <h1 className="m-0 text-lg leading-[26px] sm:text-[22px] sm:leading-[30px] font-semibold">Edit profile</h1>
          </div>
          <span className="hidden lg:block ml-auto text-xs text-[color:var(--ink-subtle)]">Your details, and how your shop appears on invoices, reports &amp; PDFs</span>
        </header>

        {/* Mobile / tablet section chips */}
        <nav
          aria-label="Profile sections"
          className="flex lg:hidden gap-1.5 overflow-x-auto px-4 py-2.5 bg-[color:var(--surface)] border-b border-[color:var(--border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {SECTIONS.map(s => (
            <button
              key={s.id} type="button" aria-pressed={activeSection === s.id}
              onClick={() => { setActiveSection(s.id); scrollToSection(s.id); }}
              className={`shrink-0 inline-flex items-center h-[30px] px-3 rounded-full border text-xs font-medium whitespace-nowrap cursor-pointer ${activeSection === s.id
                ? 'bg-[color:var(--ink)] border-[color:var(--ink)] text-[color:var(--surface)]'
                : 'bg-[color:var(--surface)] border-[color:var(--border-control)] text-[color:var(--ink-muted)]'} ${FOCUS_RING}`}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
        <div className="flex-1 grid grid-cols-[minmax(0,1fr)] content-start gap-4 p-4 w-full max-w-[1320px] mx-auto lg:grid-cols-[168px_minmax(0,1fr)] lg:gap-5 lg:px-6 lg:py-5 xl:grid-cols-[168px_minmax(0,1fr)_300px]">

          {/* ── Desktop section nav ── */}
          <nav aria-label="Profile sections" className="hidden lg:grid sticky top-[84px] self-start gap-0.5">
            {SECTIONS.map(({ id, label, Icon }) => (
              <button
                key={id} type="button" aria-current={activeSection === id}
                onClick={() => { setActiveSection(id); scrollToSection(id); }}
                className={`flex items-center gap-2.5 w-full px-3 py-2 border-0 rounded-sm text-[13px] font-medium text-left cursor-pointer ${activeSection === id
                  ? 'bg-[color:var(--primary-soft)] text-[color:var(--primary-soft-ink)]'
                  : 'bg-transparent text-[color:var(--ink-muted)] hover:bg-[color:var(--surface-sunken)]'} ${FOCUS_RING}`}
              >
                <Icon size={16} />{label}
                {countFor(id) > 0 && <small className="ml-auto text-[11px] font-semibold text-[color:var(--warning)]">{countFor(id)}</small>}
              </button>
            ))}
          </nav>

          {/* ── Cards ── */}
          <div className="grid gap-3 lg:gap-4 min-w-0 content-start">
            {issues.length > 0 && (
              <div className="xl:hidden flex gap-2 items-start px-3 py-2.5 rounded-sm text-xs leading-[19px] bg-[color:var(--warning-soft)] text-[color:var(--warning)]">
                <FiAlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span><b>{issues.length} {issues.length === 1 ? 'detail needs' : 'details need'} fixing</b> before {issues.length === 1 ? 'it prints' : 'they print'} correctly on bills.</span>
              </div>
            )}

            {/* Photo & logo */}
            <Section id="ep-logo" title="Photo & logo" sub="How you and your shop look in SELLAR" tone="magenta" icon={<FiImage />}>
              <div className="grid gap-3 p-3.5 sm:gap-4 sm:px-[18px] sm:py-4">
                <UploadRow
                  shape="round" title="Profile photo"
                  desc="Shown to your team next to your name."
                  url={previewUrl} emptyIcon={<FiUser />}
                  onPick={() => fileInputRef.current?.click()}
                  onRemove={handleRemoveProfilePicture}
                >
                  <input
                    ref={fileInputRef} type="file" accept="image/png, image/jpeg, image/jpg"
                    className="hidden" aria-label="Upload profile photo" onChange={handleImageChange}
                  />
                </UploadRow>
                <UploadRow
                  shape="sq" title="Company logo"
                  desc="Appears on invoices, reports & PDFs. PNG or JPG recommended."
                  url={logoPreviewUrl} emptyIcon={<FiCamera />}
                  onPick={() => logoInputRef.current?.click()}
                  onRemove={handleRemoveCompanyLogo}
                >
                  <input
                    ref={logoInputRef} type="file" accept="image/png, image/jpeg, image/jpg, image/svg+xml"
                    className="hidden" aria-label="Upload company logo" onChange={handleLogoChange}
                  />
                </UploadRow>
              </div>
            </Section>

            {/* Personal */}
            <Section id="ep-personal" title="Personal information" sub="The owner of this account" icon={<FiUser />} count={countFor('ep-personal')}>
              <div className={GRID_1}>
                <Field
                  type="text" name="name" value={formData.name || ''} onChange={handleInputChange}
                  label="Full name" icon={<FiUser />}
                />
                <Field
                  type="text" name="phone" value={formData.phone || ''} onChange={handlePhoneChange}
                  label="Phone number" maxLength={10} inputMode="numeric" leading="+91"
                  error={phoneError}
                />
                <Field
                  type="email" name="email" value={formData.email || ''} locked
                  label="Email address" icon={<FiLock />}
                  hint="Your login email — can’t be changed here"
                />
                <Field
                  type="text" name="panNumber" maxLength={10} value={formData.panNumber || ''}
                  onChange={handleInputChange} label="PAN No." warn={panWarn}
                />
              </div>
            </Section>

            {/* Business */}
            <Section id="ep-business" title="Business information" sub="Printed on your bills and GST returns" tone="green" icon={<FiBriefcase />} count={countFor('ep-business')}>
              <div className={GRID_1}>
                <Field
                  wrapClass="col-span-full" type="text" name="businessName" value={formData.businessName || ''}
                  onChange={handleInputChange} label="Business name" icon={<FiShoppingBag />}
                  hint="The name customers see at the top of every bill"
                />
                <div className={`col-span-full grid gap-x-2.5 gap-y-3 min-w-0 lg:gap-x-4 ${formData.businessType === 'Other' ? 'grid-cols-2' : 'grid-cols-1 lg:grid-cols-2'}`}>
                  <SelectField
                    id="businessType" label="Business type"
                    value={formData.businessType || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, businessType: e.target.value }))}
                    options={businessTypeOptions}
                  />
                  {formData.businessType === 'Other' && (
                    <Field
                      label="Specify type" name="customBusinessType" value={customBusinessType}
                      onChange={(e) => setCustomBusinessType(e.target.value)} warn={typeWarn}
                    />
                  )}
                </div>
                <div className={`col-span-full grid gap-x-2.5 gap-y-3 min-w-0 lg:gap-x-4 ${formData.businessCategory === 'Other' ? 'grid-cols-2' : 'grid-cols-1 lg:grid-cols-2'}`}>
                  <SelectField
                    id="businessCategory" label="Category"
                    value={formData.businessCategory || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, businessCategory: e.target.value }))}
                    options={businessCategoryOptions}
                  />
                  {formData.businessCategory === 'Other' && (
                    <Field
                      label="Specify category" name="customBusinessCategory" value={customBusinessCategory}
                      onChange={(e) => setCustomBusinessCategory(e.target.value)} warn={catWarn}
                    />
                  )}
                </div>
                <Field
                  type="text" name="gstin" value={formData.gstin || ''} maxLength={15}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    if (val.length <= 15) setFormData(prev => ({ ...prev, gstin: val }));
                  }}
                  label="GSTIN" warn={gstinWarn}
                />
                <Field
                  type="text" name="msmeUdyamNumber" value={formData.msmeUdyamNumber || ''} maxLength={19}
                  onChange={handleInputChange} label="MSME No." placeholder="UDYAM-UP-00-0000000"
                  hint="Optional"
                />
              </div>
            </Section>

            {/* Address */}
            <Section id="ep-address" title="Business address" sub="Your bill address and GST place of supply" tone="amber" icon={<FiMapPin />}>
              <div className={GRID_3}>
                <label className="col-span-full grid grid-cols-[minmax(0,1fr)] gap-1 min-w-0 content-start">
                  <span className="text-xs leading-[18px] font-medium text-[color:var(--ink-muted)]">Street address</span>
                  <textarea
                    rows={2} name="streetAddress"
                    value={formData.streetAddress || ''} onChange={handleInputChange}
                    className="w-full resize-none px-3 py-2.5 text-sm leading-[21px] font-[inherit] rounded-sm border border-[color:var(--border-control)] bg-[color:var(--surface)] text-[color:var(--ink)] focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[color:var(--focus-ring)]"
                  />
                </label>
                <Field type="text" name="city" value={formData.city || ''} onChange={handleInputChange} label="City" />
                <Field
                  type="text" name="postalCode" value={formData.postalCode || ''} onChange={handlePostalCodeChange}
                  label="Postal code" maxLength={6} inputMode="numeric" error={postalError}
                />
                <SelectField
                  wrapClass="col-span-full lg:col-auto" id="state" label="State" value={formData.state || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                  options={stateOptions}
                />
              </div>
            </Section>

            {/* Bank */}
            <Section id="ep-bank" title="Bank details" sub="Printed on bills so customers can pay by bank transfer" icon={<FiCreditCard />} count={countFor('ep-bank')}>
              <div className={GRID_2}>
                <Field type="text" name="accountHolderName" value={formData.accountHolderName || ''} onChange={handleInputChange} label="Account holder name" />
                <Field type="text" name="bankName" value={formData.bankName || ''} onChange={handleInputChange} label="Bank name" />
                <Field type="text" name="ifscCode" value={formData.ifscCode || ''} onChange={handleInputChange} label="IFSC code" warn={ifscWarn} />
                <Field type="text" name="accountNumber" value={formData.accountNumber || ''} onChange={handleInputChange} label="Account no." />
              </div>
            </Section>

            {/* Social */}
            <Section id="ep-social" title="Social media" sub="Links on your catalogue and shared bills" tone="magenta" icon={<FiShare2 />} count={countFor('ep-social')}>
              <div className={GRID_2}>
                <Field type="text" name="instagram" value={formData.instagram || ''} onChange={handleInputChange} label="Instagram" icon={<FiInstagram />} warn={instaWarn} />
                <Field type="text" name="facebook" value={formData.facebook || ''} onChange={handleInputChange} label="Facebook" icon={<FiFacebook />} />
                <Field type="text" name="twitter" value={formData.twitter || ''} onChange={handleInputChange} label="Twitter / X" icon={<FiTwitter />} />
                <Field
                  type="text" name="whatsappNumber" value={formData.whatsappNumber || ''} onChange={handleInputChange}
                  label="WhatsApp No." maxLength={10} inputMode="numeric" leading="+91" icon={<FiMessageCircle />}
                />
              </div>
            </Section>

            {/* ── Error banner ── */}
            {submitError && (
              <div role="alert" className="flex gap-2 items-center px-3 py-2.5 rounded-sm text-[13px] leading-[19px] bg-[color:var(--danger-soft)] text-[color:var(--danger)]">
                <p className="m-0 flex-1">{submitError}</p>
                <button type="button" onClick={() => setSubmitError(null)} aria-label="Dismiss error" className="grid p-0.5 border-0 bg-transparent text-inherit cursor-pointer">
                  <FiX size={16} />
                </button>
              </div>
            )}
          </div>

          {/* ── Right panel (wide desktop): profile check + bill preview ── */}
          <aside aria-label="Profile check" className="hidden xl:grid sticky top-[84px] self-start gap-3.5">
            <div className={PANEL}>
              <div className="flex items-center gap-2">
                <b className="flex-1 text-sm">Profile check</b>
                {issues.length > 0
                  ? <span className="inline-flex items-center h-[22px] px-2 rounded-full text-[11px] font-semibold whitespace-nowrap bg-[color:var(--warning-soft)] text-[color:var(--warning)]">{issues.length} to fix</span>
                  : <span className="inline-flex items-center h-[22px] px-2 rounded-full text-[11px] font-semibold whitespace-nowrap bg-[color:var(--success-soft)] text-[color:var(--success)]">All good</span>}
              </div>
              <div className="h-2 rounded bg-[color:var(--surface-sunken)] overflow-hidden">
                <i
                  className={`block h-full rounded ${issues.length === 0 ? 'bg-[color:var(--success)]' : 'bg-[color:var(--warning)]'}`}
                  style={{ width: `${passPct}%` }}
                />
              </div>
              <div className="text-xs leading-[18px] text-[color:var(--ink-subtle)]">These print on bills, so customers and GST officers see them.</div>
              {issues.length > 0 && (
                <div className="grid">
                  {issues.map(i => (
                    <button
                      key={i.label} type="button" onClick={() => scrollToSection(i.section)}
                      className="grid grid-cols-[18px_1fr_auto] gap-2 items-start py-[9px] border-0 border-b last:border-b-0 border-[color:var(--border)] bg-transparent text-left text-[13px] leading-[18px] text-[color:var(--ink)] cursor-pointer"
                    >
                      <FiAlertTriangle className="w-[15px] h-[15px] mt-px text-[color:var(--warning)]" />
                      <span>{i.label}<small className="block text-[11px] leading-[15px] text-[color:var(--ink-subtle)]">{i.note}</small></span>
                      <em className="not-italic text-[11px] font-medium text-[color:var(--primary-text)]">Fix</em>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={`${PANEL} !bg-[color:var(--surface-sunken)]`}>
              <b className="text-sm">Top of your bill</b>
              <div className="grid grid-cols-[40px_1fr] gap-2.5 p-3.5 rounded-sm bg-white text-gray-800 text-[10px] leading-[14px] shadow-[0_8px_24px_rgba(21,48,140,.14)]">
                {logoPreviewUrl
                  ? <img className="w-10 h-10 rounded-sm object-contain bg-gray-100" src={logoPreviewUrl} alt="" />
                  : <div className="w-10 h-10 rounded-sm bg-gray-100" />}
                <div>
                  <h4 className="m-0 text-[13px] leading-[17px] [overflow-wrap:anywhere]">{formData.businessName || 'Your business name'}</h4>
                  {billAddress && <div className="text-gray-500 [overflow-wrap:anywhere]">{billAddress}</div>}
                  {billContact && <div className="text-gray-500 [overflow-wrap:anywhere]">{billContact}</div>}
                  {gstin && (
                    <div className="text-gray-500">
                      <span className={gstinWarn ? 'bg-amber-100 text-amber-800 rounded-[3px] px-[3px]' : ''}>GSTIN {gstin}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-xs leading-[18px] text-[color:var(--ink-subtle)]">Updates as you type. Highlighted: details that need fixing.</div>
            </div>
          </aside>
        </div>

        {/* ── Save bar ── */}
        <div className="sticky bottom-0 z-20 flex items-center gap-3 px-4 pt-2.5 pb-[calc(12px+env(safe-area-inset-bottom,0px))] sm:px-6 bg-[color:var(--surface)] border-t border-[color:var(--border)] shadow-[0_-6px_16px_rgba(21,48,140,.06)]">
          <span className={`flex-1 min-w-0 flex items-center gap-1.5 text-xs sm:text-[13px] leading-[18px] overflow-hidden text-ellipsis ${submitSuccess
            ? 'text-[color:var(--success)] font-medium'
            : issues.length
              ? 'text-[color:var(--warning)] font-semibold'
              : 'text-[color:var(--ink-subtle)]'}`}>
            {submitSuccess ? (
              <><FiCheck className="w-3.5 h-3.5 shrink-0" />{submitSuccess}</>
            ) : issues.length ? (
              `${issues.length} to fix`
            ) : (
              'Changes save only when you press Save.'
            )}
          </span>
          <button type="button" className={`${BTN_GHOST} ${BTN_SM}`} onClick={handleDiscard} disabled={isSubmitting}>
            Discard
          </button>
          <button type="submit" disabled={isSubmitting} className={`${BTN_PRIMARY} sm:min-w-[156px]`}>
            {isSubmitting ? (
              <><span className={SPIN} />Saving…</>
            ) : submitSuccess ? (
              <><FiCheck />Saved</>
            ) : (
              <><FiCheck /><span className="hidden sm:inline">Save all changes</span><span className="sm:hidden">Save all</span></>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditProfilePage;