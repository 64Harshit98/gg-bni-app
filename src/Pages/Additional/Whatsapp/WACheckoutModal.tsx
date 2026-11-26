import React, { useMemo, useState } from 'react';
import { LegalModal } from '../../../Components/LegalModal';
import { createIciciOrder, validateCoupon } from '../../../lib/PaymentOperations';
import { discountPct, perMessageRate } from './SellarWhatsappPlans';
import type { SellarWhatsappPlan } from './SellarWhatsappPlans';

// Checkout pop-up for a Sellar WhatsApp plan — same flow as the subscription
// checkout on SubscriptionPage.tsx: price breakdown, coupon, GST, terms, then
// off to the ICICI hosted page. The server re-prices everything; the numbers
// here are only a preview.
const TAX_RATE = 0.18; // kept in sync with functions/lib/index.js

interface Props {
  plan: SellarWhatsappPlan;
  isRenewal: boolean;
  onClose: () => void;
}

const btnBase = 'h-10 px-4 rounded-sm text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const btnPrimary = `${btnBase} bg-purple-600 text-white hover:bg-purple-700`;
const btnSecondary = `${btnBase} border border-gray-300 bg-white text-gray-800 hover:bg-gray-50`;
const btnGhost = `${btnBase} bg-transparent text-gray-600 hover:bg-gray-100`;

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const WACheckoutModal: React.FC<Props> = ({ plan, isRenewal, onClose }) => {
  const [couponInput, setCouponInput] = useState('');
  const [couponApplying, setCouponApplying] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountAmount: number; taxAmount: number; finalAmount: number } | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [legalTab, setLegalTab] = useState<'terms' | 'privacy' | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');

  const breakdown = useMemo(() => {
    if (appliedCoupon) {
      return { discountAmount: appliedCoupon.discountAmount, taxAmount: appliedCoupon.taxAmount, total: appliedCoupon.finalAmount };
    }
    const taxAmount = Math.round(plan.price * TAX_RATE);
    return { discountAmount: 0, taxAmount, total: plan.price + taxAmount };
  }, [plan.price, appliedCoupon]);

  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponApplying(true);
    setCouponError('');
    try {
      const result = await validateCoupon(code, plan.id, 'whatsapp');
      if (!result.valid) {
        setCouponError(result.message);
        setAppliedCoupon(null);
      } else {
        setAppliedCoupon({ code: code.toUpperCase(), discountAmount: result.discountAmount, taxAmount: result.taxAmount, finalAmount: result.finalAmount });
      }
    } catch (err: any) {
      setCouponError(err.message || 'Failed to validate coupon.');
      setAppliedCoupon(null);
    } finally {
      setCouponApplying(false);
    }
  };

  const pay = async () => {
    if (!acceptedTerms) return;
    setPaying(true);
    setPayError('');
    try {
      const order = await createIciciOrder(plan.id, appliedCoupon?.code, 'whatsapp');
      window.location.href = order.redirectURI;
    } catch (err: any) {
      setPayError(err.message || 'Failed to start payment.');
      setPaying(false);
    }
  };

  const rate = perMessageRate(plan);
  const off = discountPct(plan);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-[rgba(2,6,24,.45)] flex items-end justify-center sm:items-center sm:p-4" onClick={() => !paying && onClose()}>
        <div
          className="bg-white w-full max-w-[448px] rounded-t-sm sm:rounded-sm shadow-2xl p-5 max-h-[92vh] overflow-y-auto text-gray-900"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wa-checkout-title"
          onClick={e => e.stopPropagation()}
        >
          <h3 id="wa-checkout-title" className="m-0 text-lg font-semibold">Checkout</h3>
          <p className="m-0 mt-0.5 mb-4 text-sm text-gray-500">
            {plan.subtitle} · {plan.quota === null ? 'Unlimited' : plan.quota.toLocaleString('en-IN')} WhatsApp messages / {plan.duration.toLowerCase()}
            {rate !== null && <> · ₹{rate}/msg</>}
          </p>

          <dl className="grid gap-1.5 m-0 mb-4 p-4 bg-gray-50 border border-gray-200 rounded-sm text-sm tabular-nums">
            {plan.mrp > plan.price && (
              <div className="flex justify-between gap-3 text-gray-500">
                <dt>MRP</dt>
                <dd className="m-0 text-right line-through">{inr(plan.mrp)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-gray-600">Plan price{off > 0 && <span className="ml-1.5 text-[11px] font-bold text-green-700">{off}% OFF</span>}</dt>
              <dd className="m-0 text-right">{inr(plan.price)}</dd>
            </div>
            {appliedCoupon && (
              <div className="flex justify-between gap-3 text-green-700">
                <dt>Coupon ({appliedCoupon.code})</dt>
                <dd className="m-0 text-right">-{inr(appliedCoupon.discountAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-gray-600">GST (18%)</dt>
              <dd className="m-0 text-right">+{inr(breakdown.taxAmount)}</dd>
            </div>
            <div className="flex justify-between gap-3 items-baseline font-semibold text-base pt-2 mt-1 border-t border-gray-200">
              <dt>Total</dt>
              <dd className="m-0 text-right text-xl">{inr(breakdown.total)}</dd>
            </div>
          </dl>

          <div className="mb-4">
            <label htmlFor="wa-coupon" className="block text-[13px] font-medium mb-1.5">Coupon code</label>
            <div className="flex gap-2">
              <input
                id="wa-coupon"
                type="text"
                className="flex-1 min-w-0 h-10 text-sm bg-white border border-gray-400 rounded-sm px-3 placeholder:text-gray-400 disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={couponInput}
                onChange={e => { setCouponInput(e.target.value.toUpperCase()); setAppliedCoupon(null); setCouponError(''); }}
                onKeyDown={e => { if (e.key === 'Enter' && !appliedCoupon) applyCoupon(); }}
                placeholder="Enter code"
                disabled={!!appliedCoupon}
              />
              {appliedCoupon ? (
                <button className={btnSecondary} onClick={() => { setAppliedCoupon(null); setCouponInput(''); }}>Remove</button>
              ) : (
                <button className={btnSecondary} onClick={applyCoupon} disabled={couponApplying || !couponInput.trim()}>
                  {couponApplying ? 'Checking…' : 'Apply'}
                </button>
              )}
            </div>
            {appliedCoupon && <p className="m-0 mt-1.5 text-xs text-green-700">Coupon applied ✓</p>}
            {couponError && <p className="m-0 mt-1.5 text-xs text-red-600">{couponError}</p>}
          </div>

          {isRenewal && (
            <p className="m-0 mb-4 rounded-sm bg-purple-50 p-3 text-[13px] leading-[19px] text-purple-800">
              You already have an active plan. This starts a fresh year from today, and your unused messages are added on top.
            </p>
          )}

          {/* The links sit outside the <label> so opening them doesn't toggle the checkbox. */}
          <div className="flex items-start gap-2 mb-4 text-xs leading-[18px] text-gray-600">
            <input
              id="wa-terms"
              type="checkbox"
              className="mt-0.5 w-4 h-4 shrink-0 cursor-pointer accent-purple-600"
              checked={acceptedTerms}
              onChange={e => setAcceptedTerms(e.target.checked)}
              aria-label="I agree to the Terms & Conditions and Privacy Policy"
            />
            <div>
              <label htmlFor="wa-terms" className="cursor-pointer">I agree to the</label>{' '}
              <button type="button" className="bg-transparent border-0 p-0 underline cursor-pointer text-purple-700" onClick={() => setLegalTab('terms')}>Terms &amp; Conditions</button>{' '}
              and{' '}
              <button type="button" className="bg-transparent border-0 p-0 underline cursor-pointer text-purple-700" onClick={() => setLegalTab('privacy')}>Privacy Policy</button>.
            </div>
          </div>

          {payError && <p className="m-0 mb-3 text-sm text-red-600">{payError}</p>}

          <div className="flex items-center justify-end gap-2">
            <button className={btnGhost} onClick={onClose} disabled={paying}>Cancel</button>
            <button className={`${btnPrimary} flex-1 sm:flex-none sm:min-w-[160px]`} onClick={pay} disabled={paying || !acceptedTerms}>
              {paying ? 'Processing…' : `Pay ${inr(breakdown.total)}`}
            </button>
          </div>

          <p className="m-0 mt-3 text-center text-[11px] text-gray-400">
            WhatsApp is connected automatically as soon as payment is confirmed.
          </p>
        </div>
      </div>
      <LegalModal isOpen={legalTab !== null} defaultTab={legalTab ?? 'terms'} onClose={() => setLegalTab(null)} />
    </>
  );
};

export default WACheckoutModal;
