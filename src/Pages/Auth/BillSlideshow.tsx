import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BillPaper,
  DEFAULT_TERMS_AND_CONDITIONS,
  PAPER_W,
  ScaledPaper,
  type BusinessInfoData,
} from '../Settings/BillPaper';

/**
 * Slideshow of every bill format the app prints, filled with the shop's details
 * as they are typed. Uses BillPaper, the same layouts as Bill settings and the
 * printed bills. Holds on the current bill while hovered.
 */

const FORMATS = [
  { value: 'A4', title: 'A4 size', note: 'Full page · GST invoices, wholesale' },
  { value: 'A5', title: 'A5 size', note: 'Half page · Compact invoices' },
  { value: 'THERMAL80', title: '3-inch thermal', note: '80 mm roll · Most counter printers' },
  { value: 'THERMAL58', title: '2-inch thermal', note: '58 mm roll · Small receipt printers' },
] as const;

const SLIDE_MS = 4500;

const TONES = {
  navy: { title: 'text-white', note: 'text-[#b9c6ea]' },
  light: { title: 'text-slate-900', note: 'text-slate-500' },
};

interface BillSlideshowProps {
  name: string;
  address: string;
  phone: string;
  gstin: string;
  /** TAX INVOICE or BILL OF SUPPLY, from the GST choice. */
  title: string;
  tone?: keyof typeof TONES;
}

export const BillSlideshow: React.FC<BillSlideshowProps> = ({ name, address, phone, gstin, title, tone = 'navy' }) => {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const t = TONES[tone];

  useEffect(() => {
    if (hovered) return;
    const timer = window.setInterval(() => {
      // Skip while hidden (the desktop panel stays mounted on phones).
      if (rootRef.current?.offsetParent === null) return;
      setIndex((i) => (i + 1) % FORMATS.length);
    }, SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [hovered]);

  const format = FORMATS[index];
  const business: BusinessInfoData = {
    companyName: name,
    address,
    phone,
    gstin,
    email: '',
    panNumber: '',
    msmeNumber: '',
    bankName: '',
    accountHolderName: '',
    accountNumber: '',
    ifscCode: '',
    companyLogo: '',
  };

  return (
    <div
      ref={rootRef}
      className="flex w-full flex-col gap-3"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <p className="text-[13px] leading-[19px]">
        <span className={`font-semibold ${t.title}`}>{format.title}</span> <span className={t.note}>{format.note}</span>
      </p>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={format.value}
          className="mx-auto w-full"
          style={{ maxWidth: PAPER_W[format.value] }}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          <ScaledPaper width={PAPER_W[format.value]}>
            <BillPaper
              business={business}
              settings={{ termsAndConditions: DEFAULT_TERMS_AND_CONDITIONS, printFormat: format.value }}
              title={title}
            />
          </ScaledPaper>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
