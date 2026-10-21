import React, { useState, useEffect } from 'react';
import { Check, ChevronUp, MessageCircle, ShieldCheck } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import LeadPopUp from '../PopUp';
import { indianStates } from '../../Components/IndianStates';
import type { Address } from './checkOut.types';
import {
    deriveTaxContext,
    computeCartTotals,
    isMinimumOrderValueMet,
} from './checkOut.calculations';
import {
    useBusinessInfo,
    useCart,
    useCheckoutSettings,
    useDomainResolution,
    usePlaceOrder,
} from './hooks';
import { EmptyState, Note, Photo, QtyStepper, Sheet, StoreFooter, StoreHeader, StoreMessage, btnClass } from '../storefront/StoreUI';
import { formatINR, formatPhone } from '../storefront/storefront.utils';
import { storeAddress } from '../storefront/StoreSections';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
const inputCls = 'h-10 w-full rounded-sm border border-sf-control bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-2 focus:outline-offset-1 focus:outline-sf-primary disabled:bg-sf-sunken disabled:text-slate-500';

/** Billing or shipping address fields: labels above, required ones say so in words. */
const AddressFields: React.FC<{ id: string; value: Address; onChange: (a: Address) => void; disabled?: boolean; onPhone?: (v: string) => void }> = ({ id, value, onChange, disabled, onPhone }) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
            <label htmlFor={`${id}-name`} className="mb-1.5 block text-[13px] font-medium text-slate-900">Full name</label>
            <input id={`${id}-name`} disabled={disabled} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} autoComplete="name" className={inputCls} />
        </div>
        <div>
            <label htmlFor={`${id}-phone`} className="mb-1.5 block text-[13px] font-medium text-slate-900">Mobile number</label>
            <input id={`${id}-phone`} disabled={disabled} type="tel" inputMode="numeric" autoComplete="tel" placeholder="10 digits" value={value.phone}
                onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 10); onChange({ ...value, phone: v }); onPhone?.(v); }} className={inputCls} />
        </div>
        <div>
            <label htmlFor={`${id}-city`} className="mb-1.5 block text-[13px] font-medium text-slate-900">City</label>
            <input id={`${id}-city`} disabled={disabled} value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })} autoComplete="address-level2" className={inputCls} />
        </div>
        <div>
            <label htmlFor={`${id}-state`} className="mb-1.5 block text-[13px] font-medium text-slate-900">State</label>
            <select id={`${id}-state`} disabled={disabled} value={value.state} onChange={(e) => onChange({ ...value, state: e.target.value })} className={inputCls}>
                <option value="">Select state</option>
                {indianStates.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
        </div>
        <div className="sm:col-span-2">
            <label htmlFor={`${id}-address`} className="mb-1.5 block text-[13px] font-medium text-slate-900">Address</label>
            <textarea id={`${id}-address`} disabled={disabled} rows={2} value={value.address} onChange={(e) => onChange({ ...value, address: e.target.value })} autoComplete="street-address"
                placeholder="House or shop number, building, area" className={cx(inputCls, 'h-auto min-h-16 resize-none py-2.5 leading-[22px]')} />
        </div>
        <div className="sm:col-span-2">
            <label htmlFor={`${id}-gstin`} className="mb-1.5 block text-[13px] font-medium text-slate-900">GSTIN <small className="font-normal text-slate-500">(optional)</small></label>
            <input id={`${id}-gstin`} disabled={disabled} value={value.gstin || ''} placeholder="For a GST bill in your business name"
                onChange={(e) => { const v = e.target.value.toUpperCase(); if (v.length <= 15) onChange({ ...value, gstin: v }); }} className={inputCls} />
        </div>
    </div>
);

const CartPage: React.FC = () => {
    const navigate = useNavigate();
    const { companyId: pathId } = useParams<{ companyId: string }>();

    const [step, setStep] = useState<number>(1);
    const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
    const [showAlert, setShowAlert] = useState(false);

    const { subdomain, effectiveCompanyId, domainResolveError, isResolvingDomain } = useDomainResolution(pathId);
    const { companyName, socialLinks, whatsappLink } = useBusinessInfo(effectiveCompanyId);
    const { salesSettings, leadStatus } = useCheckoutSettings(effectiveCompanyId);

    const getSavedLead = () => {
        try {
            const leadData = JSON.parse(localStorage.getItem("leadData") || "{}");
            return { name: leadData.name || '', phone: (leadData.number || '').replace(/\D/g, '').trim() };
        } catch {
            return { name: '', phone: '' };
        }
    };

    const [shipping, setShipping] = useState<Address>(() => {
        const lead = getSavedLead();
        return { name: lead.name, phone: lead.phone, city: '', state: '', address: '', gstin: '' };
    });
    const [billing, setBilling] = useState<Address>(() => {
        const lead = getSavedLead();
        return { name: lead.name, phone: lead.phone, city: '', state: '', address: '', gstin: '' };
    });
    const [isSameAsShipping, setIsSameAsShipping] = useState<boolean>(true);
    const [movError, setMovError] = useState<string | null>(null);
    const [specialInstruction, setSpecialInstruction] = useState("");

    const { cartItems, setCartItems, updateItemNote, updateQuantity, removeFromCart } = useCart(effectiveCompanyId, salesSettings);

    useEffect(() => {
        if (movError) window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }, [movError]);

    // 1. Evaluate the master tax logic
    const { scheme, taxType, applyExclusiveTax } = deriveTaxContext(salesSettings);
    // 2. Calculate Subtotal & Tax safely handling both scenarios
    const { baseSubtotal, totalTaxAmount, totalPay } = computeCartTotals(cartItems, scheme, taxType);
    const isMovValid = () => isMinimumOrderValueMet(salesSettings, totalPay);

    const isUserApproved = leadStatus === "approved";
    const hidePriceEnabled = salesSettings?.hidePrice === true;
    const approvalEnabled = salesSettings?.requireApproval === true;
    const shouldShowPrice = !hidePriceEnabled && (!approvalEnabled || isUserApproved);
    const minOrder = Number(salesSettings?.minimumOrderValue || 0);
    const itemCount = cartItems.reduce((a, c) => a + Number(c.quantity || 0), 0);

    const { isPlacing, orderSuccess, placedOrderId, placeOrder } = usePlaceOrder({
        effectiveCompanyId,
        billing,
        shipping,
        isSameAsShipping,
        cartItems,
        setCartItems,
        specialInstruction,
        scheme,
        taxType,
        applyExclusiveTax,
        setShowAlert,
    });

    useEffect(() => {
        if (isSameAsShipping) setShipping({ ...billing });
    }, [isSameAsShipping, billing]);

    const shortBy = () => Math.max(0, minOrder - totalPay);
    const movMessage = () => `Minimum order is ${formatINR(minOrder)}. Add ${formatINR(shortBy())} more to place this order.`;

    /** The one forward action: Cart → Delivery details → Place order. */
    const next = () => {
        if (cartItems.length === 0) return;
        if (!isMovValid()) { setMovError(movMessage()); return; }
        setMovError(null);
        if (step === 1) { setStep(2); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        setIsDrawerOpen(false);
        placeOrder();
    };

    const homeTo = subdomain ? '/' : `/catalogue/${effectiveCompanyId}`;

    if (domainResolveError) return <StoreMessage title="Store not found" text="This checkout link is invalid or has expired. Ask the shop for its current link." />;
    if (isResolvingDomain) return <div className="min-h-[100dvh] bg-sf-canvas" aria-busy="true" />;

    const actionLabel = isPlacing ? 'Placing order…' : step === 1 ? 'Continue to delivery details' : `Place order${shouldShowPrice ? ` · ${formatINR(totalPay)}` : ''}`;

    const summary = (
        <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
            <dt className="text-slate-600">Items ({itemCount})</dt><dd className="text-right tabular-nums">{shouldShowPrice ? formatINR(baseSubtotal, true) : '—'}</dd>
            {totalTaxAmount > 0 && <><dt className="text-slate-600">{applyExclusiveTax ? 'GST' : 'GST included'}</dt><dd className="text-right tabular-nums">{shouldShowPrice ? formatINR(totalTaxAmount, true) : '—'}</dd></>}
            <dt className="text-slate-600">Delivery</dt><dd className="text-right text-slate-500">Shop confirms</dd>
            <dt className="border-t border-sf-line pt-2.5 text-base font-semibold text-slate-900">Total</dt>
            <dd className="border-t border-sf-line pt-2.5 text-right text-base font-semibold tabular-nums text-slate-900">{shouldShowPrice ? formatINR(totalPay) : '—'}</dd>
        </dl>
    );

    return (
        <div className={cx('flex min-h-[100dvh] flex-col bg-sf-canvas font-sans text-slate-900', cartItems.length > 0 && 'pb-[calc(7.5rem+env(safe-area-inset-bottom))] lg:pb-0')}>
            {salesSettings?.requireApproval && <LeadPopUp companyId={effectiveCompanyId || ""} companyName={companyName} />}

            <StoreHeader name={companyName || 'Our shop'} logo={socialLinks?.companyLogo} tagline={[socialLinks?.businessCategory, socialLinks?.city].filter(Boolean).join(' · ')}
                homeTo={homeTo} cartCount={itemCount} onCart={() => setStep(1)} onAsk={() => whatsappLink && window.open(whatsappLink, '_blank', 'noopener')}
                onBack={() => (step === 2 ? setStep(1) : navigate(-1))} />

            <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-10 pt-5 md:px-10 md:pt-7">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{step === 1 ? 'Your cart' : 'Delivery details'}</h1>
                        <p className="text-[13px] text-slate-600">{companyName} confirms your order on WhatsApp. You don't pay now.</p>
                    </div>
                    <nav aria-label="Checkout steps" className="flex items-center gap-3 text-[13px] font-medium text-slate-500">
                        <button type="button" onClick={() => setStep(1)} aria-current={step === 1 ? 'step' : undefined} className={cx('inline-flex items-center gap-2', step === 1 && 'text-slate-900')}>
                            <i className={cx('grid size-6 place-items-center rounded-sm text-xs font-semibold not-italic', step === 1 ? 'bg-sf-primary text-white' : 'bg-green-50 text-green-700')}>{step > 1 ? <Check className="size-3.5" /> : 1}</i>Cart
                        </button>
                        <span className="h-px w-10 bg-sf-control" aria-hidden />
                        <button type="button" disabled={cartItems.length === 0} onClick={() => isMovValid() ? setStep(2) : setMovError(movMessage())} aria-current={step === 2 ? 'step' : undefined}
                            className={cx('inline-flex items-center gap-2', step === 2 && 'text-slate-900')}>
                            <i className={cx('grid size-6 place-items-center rounded-sm border text-xs font-semibold not-italic', step === 2 ? 'border-sf-primary bg-sf-primary text-white' : 'border-sf-line bg-sf-sunken')}>2</i>Delivery details
                        </button>
                    </nav>
                </div>

                {movError && <div className="mt-4"><Note tone="warning" onClose={() => setMovError(null)}><b>Minimum order not reached.</b> {movError}</Note></div>}

                <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="grid gap-5">
                        {step === 1 ? (
                            <>
                                <div className="rounded-sm border border-sf-line bg-white px-4 shadow-sf-card md:px-5">
                                    {cartItems.length > 0 ? (
                                        <>
                                            <div className="flex items-center justify-between border-b border-sf-line py-3.5">
                                                <h2 className="text-base font-semibold">{itemCount} item{itemCount === 1 ? '' : 's'}</h2>
                                                <button type="button" onClick={() => navigate(homeTo)} className="text-[13px] font-medium text-sf-primary hover:underline">Continue shopping</button>
                                            </div>
                                            {cartItems.map((item) => {
                                                const struck = item.quantitySlabs?.length && item.baseSalesPrice !== undefined && item.salesPrice < item.baseSalesPrice;
                                                return (
                                                    <div key={item.id} className="grid grid-cols-[64px_minmax(0,1fr)_auto] gap-3 border-b border-sf-line py-4 last:border-0 md:grid-cols-[72px_minmax(0,1fr)_auto] md:gap-4">
                                                        <Photo src={item.imageUrl} alt={item.name} fit="contain" className="aspect-square border border-sf-line" />
                                                        <div className="min-w-0">
                                                            <h3 className="text-sm font-medium leading-5">{item.name}{(item as { tierLabel?: string }).tierLabel ? <span className="font-normal text-slate-500"> · {(item as { tierLabel?: string }).tierLabel}</span> : null}</h3>
                                                            <p className="text-xs leading-[18px] text-slate-500">
                                                                {item.unitMultiplier && item.unitMultiplier > 1 ? `${item.unitMultiplier} pcs` : '1 pc'}
                                                                {shouldShowPrice && <> · {formatINR(item.salesPrice)} each {struck ? <s className="ml-0.5">{formatINR(item.baseSalesPrice!)}</s> : null}</>}
                                                            </p>
                                                            <div className="mt-2.5 flex flex-wrap items-center gap-3">
                                                                <QtyStepper value={item.quantity} size="sm" outline trash={item.quantity <= Number(item.moq || 1)} className="w-[120px]"
                                                                    onDec={() => (item.quantity <= Number(item.moq || 1) ? removeFromCart(item.id) : updateQuantity(item.id, -1))}
                                                                    onInc={() => updateQuantity(item.id, 1)} />
                                                                <button type="button" onClick={() => removeFromCart(item.id)} className="text-[13px] text-red-700 hover:underline">Remove</button>
                                                            </div>
                                                            <input aria-label={`Note for ${item.name}`} value={item.note} onChange={(e) => updateItemNote(item.id, e.target.value)}
                                                                placeholder="Add a note for this item (optional)" className="mt-2.5 h-8 w-full rounded-sm border border-sf-line bg-sf-sunken px-2.5 text-[13px] placeholder:text-slate-500 focus:bg-white focus:outline-2 focus:outline-sf-primary" />
                                                        </div>
                                                        <b className="text-[15px] font-semibold tabular-nums">{shouldShowPrice ? formatINR(item.salesPrice * item.quantity) : ''}</b>
                                                    </div>
                                                );
                                            })}
                                        </>
                                    ) : (
                                        <EmptyState title="Your cart is empty" text="Add products from the Store page. They stay here until you order."
                                            action={<button type="button" onClick={() => navigate(homeTo)} className={btnClass('secondary', 'sm')}>Back to store</button>} />
                                    )}
                                </div>
                                {cartItems.length > 0 && (
                                    <div className="rounded-sm border border-sf-line bg-white p-4 shadow-sf-card md:p-5">
                                        <label htmlFor="special" className="mb-1.5 block text-[13px] font-medium">Anything the shop should know? <small className="font-normal text-slate-500">(optional)</small></label>
                                        <textarea id="special" rows={3} value={specialInstruction} onChange={(e) => setSpecialInstruction(e.target.value)}
                                            placeholder="For example: deliver after 5 pm, or gift-wrap the order"
                                            className="block w-full resize-y rounded-sm border border-sf-control px-3 py-2.5 text-sm leading-[22px] placeholder:text-slate-500 focus:outline-2 focus:outline-sf-primary" />
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="rounded-sm border border-sf-line bg-white p-4 shadow-sf-card md:p-5">
                                    <h2 className="mb-4 text-base font-semibold">Billing details</h2>
                                    <AddressFields id="bill" value={billing} onChange={setBilling}
                                        onPhone={(v) => { if (isSameAsShipping) setShipping((p) => ({ ...p, phone: v })); }} />
                                </div>
                                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-sm border border-sf-line bg-white px-4 py-3 text-sm">
                                    Deliver to the same address
                                    <button type="button" role="switch" aria-checked={isSameAsShipping} onClick={() => setIsSameAsShipping(!isSameAsShipping)}
                                        className={cx('relative h-5 w-9 shrink-0 rounded-sm transition-colors', isSameAsShipping ? 'bg-sf-primary' : 'bg-sf-control')}>
                                        <span className={cx('absolute top-[3px] size-3.5 rounded-[2px] bg-white transition-transform', isSameAsShipping ? 'left-[19px]' : 'left-[3px]')} />
                                    </button>
                                </label>
                                {!isSameAsShipping && (
                                    <div className="rounded-sm border border-sf-line bg-white p-4 shadow-sf-card md:p-5">
                                        <h2 className="mb-4 text-base font-semibold">Delivery address</h2>
                                        <AddressFields id="ship" value={shipping} onChange={setShipping} />
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <aside className="sticky top-24 hidden rounded-sm border border-sf-line bg-white p-5 shadow-sf-card lg:block">
                        <h2 className="mb-3.5 text-base font-semibold">Order summary</h2>
                        {summary}
                        {minOrder > 0 && cartItems.length > 0 && (
                            <div className="mt-3.5">
                                {isMovValid()
                                    ? <Note tone="success" icon={<Check className="size-4" />}>Minimum order of {formatINR(minOrder)} reached.</Note>
                                    : <Note tone="warning">Add {formatINR(shortBy())} more to reach the {formatINR(minOrder)} minimum.</Note>}
                            </div>
                        )}
                        <button type="button" disabled={isPlacing || cartItems.length === 0} onClick={next} className={cx(btnClass('primary', 'lg', true), 'mt-4')}>{actionLabel}</button>
                        <p className="mt-3 flex items-start gap-2 text-xs leading-[18px] text-slate-500"><ShieldCheck className="mt-0.5 size-4 shrink-0" />Prices include GST unless shown separately. The shop confirms delivery charges, if any.</p>
                    </aside>
                </div>
            </main>

            <StoreFooter name={companyName} about={socialLinks?.brandingText} address={storeAddress(socialLinks || {})}
                phone={formatPhone(socialLinks?.phoneNumber)} whatsapp={formatPhone(socialLinks?.whatsappNumber)}
                instagram={socialLinks?.instagram} facebook={socialLinks?.facebook} gstin={socialLinks?.gstin} />

            {/* Phones: total + the one next step, pinned to the bottom */}
            {cartItems.length > 0 && (
                <div className="fixed inset-x-0 bottom-0 z-50 grid gap-2.5 border-t border-sf-line bg-white px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-sf-float lg:hidden">
                    <button type="button" onClick={() => setIsDrawerOpen(true)} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1 text-slate-600">Total · {itemCount} item{itemCount === 1 ? '' : 's'}<ChevronUp className="size-4 text-sf-primary" /></span>
                        <b className="text-[17px] font-semibold tabular-nums">{shouldShowPrice ? formatINR(totalPay) : '—'}</b>
                    </button>
                    <button type="button" disabled={isPlacing} onClick={next} className={btnClass('primary', 'lg', true)}>{step === 1 ? 'Continue' : actionLabel}</button>
                </div>
            )}
            <div className="lg:hidden">
                <Sheet open={isDrawerOpen} title="Order summary" onClose={() => setIsDrawerOpen(false)}
                    footer={<button type="button" disabled={isPlacing || cartItems.length === 0} onClick={next} className={btnClass('primary', 'lg', true)}>{actionLabel}</button>}>
                    {summary}
                </Sheet>
            </div>

            <Sheet open={showAlert} title="A few details are missing" onClose={() => setShowAlert(false)}
                footer={<button type="button" onClick={() => setShowAlert(false)} className={btnClass('primary')}>OK</button>}>
                <p className="text-sm text-slate-600">Fill in your name, a 10-digit mobile number, city, state and address so the shop can deliver your order.</p>
            </Sheet>

            {orderSuccess && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4">
                    <div role="dialog" aria-label="Order placed" className="w-full max-w-md rounded-sm bg-white p-6 text-center shadow-sf-float md:p-8">
                        <span className="mx-auto grid size-14 place-items-center rounded-sm bg-green-50 text-green-700"><Check className="size-7" /></span>
                        <h2 className="mt-3 text-[22px] font-semibold leading-[30px]">Order placed</h2>
                        <p className="mx-auto mt-1.5 max-w-[32ch] text-sm text-slate-600">{companyName} will confirm your order on WhatsApp.</p>
                        {placedOrderId && (
                            <dl className="mt-5 grid grid-cols-[1fr_auto] gap-y-2 rounded-sm border border-sf-line p-4 text-left text-sm">
                                <dt className="text-slate-600">Order number</dt><dd className="font-semibold">{placedOrderId}</dd>
                            </dl>
                        )}
                        <div className="mt-5 grid gap-2">
                            <button type="button" onClick={() => navigate(homeTo)} className={btnClass('primary', 'lg', true)}>Continue shopping</button>
                            {whatsappLink && <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className={btnClass('whatsapp', 'lg', true)}><MessageCircle className="size-4" />Message the shop</a>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CartPage;
