import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ROUTES } from '../constants/routes.constants';
import ShowWrapper from '../context/ShowWrapper';
import { Permissions } from '../enums';
import BackButton from '../Components/BackButton';
import ShopHoursSettingPage from './Settings/ShopHoursSetting';
import { ROLES } from '../enums';
import { useAuth } from '../context/auth-context';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/Firebase';

/* ---------- SELLAR design tokens (light theme) ---------- */
type Tint = 'blue' | 'green' | 'amber' | 'magenta';

const TINT_CLASS: Record<Tint, string> = {
  blue: 'bg-[#e6eeff] text-[#155dfc]',
  green: 'bg-[#e9faef] text-[#008236]',
  amber: 'bg-[#fff3dd] text-[#bb4d00]',
  magenta: 'bg-[#ffe8f8] text-[#c4009a]',
};

/* ---------- Icons (same paths as the artifact) ---------- */
const Icon = ({ paths, className = 'w-5 h-5' }: { paths: string[]; className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={`${className} flex-none`}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {paths.map((d) => (
      <path key={d} d={d} />
    ))}
  </svg>
);

const ICONS = {
  sales: [
    'M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6',
    'M9 19.5a.5.5 0 1 0 0 .01M18 19.5a.5.5 0 1 0 0 .01',
  ],
  purchase: ['M21 8 12 3 3 8v8l9 5 9-5z', 'M3 8l9 5 9-5M12 13v8'],
  bill: ['M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z', 'M14 3v5h5M9 13h6M9 17h4'],
  items: ['M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z', 'M7.5 7.5a.5.5 0 1 0 0 .01'],
  barcode: ['M4 5v14M8 5v14M11 5v10M14 5v14M17 5v10M20 5v14'],
  users: [
    'M9 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    'M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3',
  ],
  permission: ['M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z', 'm9 12 2 2 4-4'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
  chevron: ['m9 6 6 6-6 6'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'm20 20-3.5-3.5'],
};

/* ---------- One settings entry (card on desktop, row on mobile) ---------- */
type ItemProps = {
  title: string;
  desc: string;
  tint: Tint;
  icon: string[];
  to?: string;
  onClick?: () => void;
  value?: string; // live value line (blue), e.g. "PUR-7 next"
  valueTone?: 'primary' | 'warn';
};

const SettingItem = ({ title, desc, tint, icon, to, onClick, value, valueTone = 'primary' }: ItemProps) => {
  const cls =
    'flex w-full items-center gap-3 px-4 py-3 text-left no-underline text-[#0f172b] bg-white ' +
    'hover:bg-[#f5f7ff] transition-colors ' +
    'md:rounded-sm md:border md:border-[#dfe6fb] md:p-4 md:shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)] ' +
    'md:hover:-translate-y-0.5 md:hover:shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)] md:transition-all';

  const inner = (
    <>
      <span className={`inline-grid place-items-center w-10 h-10 rounded-[10px] flex-none ${TINT_CLASS[tint]}`}>
        <Icon paths={icon} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] leading-[22px] font-semibold md:font-semibold truncate md:whitespace-normal">
          {title}
        </span>
        {/* mobile: live value replaces the description; desktop: description + value */}
        <span
          className={`${value ? 'hidden md:block' : 'block'} text-xs leading-[18px] text-[#5b6b86] truncate md:whitespace-normal`}
        >
          {desc}
        </span>
        {value && (
          <span
            className={`block text-xs leading-[18px] font-semibold mt-0 md:mt-1 truncate ${valueTone === 'warn' ? 'text-[#bb4d00]' : 'text-[#155dfc]'
              }`}
          >
            {value}
          </span>
        )}
      </span>
      <Icon paths={ICONS.chevron} className="w-4 h-4 text-[#5b6b86]" />
    </>
  );

  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
};

/* ---------- Group (overline on mobile / heading on desktop) ---------- */
const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-5 md:mb-6">
    <h2
      className="m-0 mb-2 text-[11px] leading-4 font-semibold tracking-[.08em] uppercase text-[#5b6b86]
                 md:mb-3 md:text-base md:leading-6 md:normal-case md:tracking-normal md:text-[#0f172b]"
    >
      {title}
    </h2>
    <div
      className="bg-white border border-[#dfe6fb] rounded-sm overflow-hidden divide-y divide-[#dfe6fb]
                 shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)]
                 md:bg-transparent md:border-0 md:rounded-none md:overflow-visible md:divide-y-0 md:shadow-none
                 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-3"
    >
      {children}
    </div>
  </section>
);

const Masters = () => {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [shopHoursOpen, setShopHoursOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false); // mobile only: toggles the search field
  const [query, setQuery] = useState('');

  const isDefaultMastersView =
    location.pathname === '/masters' || location.pathname === '/masters/';

  const isOwner = currentUser?.role === ROLES.OWNER;
  const companyId = currentUser?.companyId;
  useEffect(() => {
    if ((location.state as { openShopTiming?: boolean } | null)?.openShopTiming && isOwner) {
      setShopHoursOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, isOwner]);
  // ---- Live values for the cards (Firestore onSnapshot, same paths the settings pages use) ----
  // undefined = not loaded yet, null = doc missing
  const [docs, setDocs] = useState<Record<string, any>>({});
  const [userStats, setUserStats] = useState<{ total: number; managers: number } | null>(null);

  useEffect(() => {
    if (!companyId) return;
    const base = `companies/${companyId}`;
    const paths: Record<string, string> = {
      sales: `${base}/settings/sales-settings`,
      invoiceCounter: `${base}/counters/invoiceCounter`,
      purchase: `${base}/settings/purchase-settings`,
      purchaseCounter: `${base}/counters/purchaseCounter`,
      bill: `${base}/settings/bill`,
      barcode: `${base}/settings/barcode-settings`,
      shopHours: `${base}/settings/shop-hours`,
    };
    const unsubs = Object.entries(paths).map(([key, path]) =>
      onSnapshot(
        doc(db, path),
        (snap) => setDocs((prev) => ({ ...prev, [key]: snap.exists() ? snap.data() : null })),
        (err) => console.error(`Masters: failed to listen to ${path}`, err)
      )
    );

    // Users card is owner-only, so only listen when needed
    if (isOwner) {
      unsubs.push(
        onSnapshot(
          collection(db, `${base}/users`),
          (snap) =>
            setUserStats({
              total: snap.size,
              managers: snap.docs.filter((d) => d.data().role === ROLES.MANAGER).length,
            }),
          (err) => console.error('Masters: failed to listen to users', err)
        )
      );
    }
    return () => unsubs.forEach((u) => u());
  }, [companyId, isOwner]);

  const salesValue = (() => {
    const s = docs.sales;
    if (!s) return undefined;
    const gst =
      s.gstScheme === 'regular' ? 'Regular GST' : s.gstScheme === 'composition' ? 'Composition GST' : 'No GST';
    const parts = [gst];
    if (s.gstScheme === 'regular') parts.push(s.taxType === 'inclusive' ? 'incl.' : 'excl.');
    if (s.enableRounding) parts.push(`round ₹${s.roundingInterval ?? 1}`);
    const n = docs.invoiceCounter?.currentNumber;
    if (n !== undefined) parts.push(`${s.voucherPrefix || 'INV'}-${n}`);
    return parts.join(' · ');
  })();

  const purchaseValue = (() => {
    const p = docs.purchase;
    const n = docs.purchaseCounter?.currentNumber;
    if (!p || n === undefined) return undefined;
    return `${p.voucherPrefix || 'PUR'}-${n} next`;
  })();

  const PRINT_LABEL: Record<string, string> = {
    A4: 'A4',
    A5: 'A5',
    THERMAL58: 'Thermal 58 mm',
    THERMAL80: 'Thermal 80 mm',
  };
  const billValue = docs.bill ? PRINT_LABEL[docs.bill.posPrintFormat] || 'A4' : undefined;

  const LABEL_FORMAT: Record<string, string> = {
    qr_only: 'QR only',
    barcode_only: 'Barcode only',
    both: 'Barcode + QR',
  };
  const barcodeValue = docs.barcode
    ? `${LABEL_FORMAT[docs.barcode.labelFormat] || 'Barcode + QR'} · 35 × 35 mm`
    : undefined;

  const shopHoursLoaded = docs.shopHours !== undefined;
  const shopHoursSet = !!docs.shopHours?.enabled;
  const shopValue = !shopHoursLoaded
    ? undefined
    : shopHoursSet
      ? `${docs.shopHours.openTime} – ${docs.shopHours.closeTime}`
      : 'Not set · set up';

  const usersValue = userStats
    ? `${userStats.total} ${userStats.total === 1 ? 'user' : 'users'}` +
    (userStats.managers > 0 ? ` · ${userStats.managers} ${userStats.managers === 1 ? 'manager' : 'managers'}` : '')
    : undefined;

  // search helper: keywords per item, empty query shows everything
  const q = query.trim().toLowerCase();
  const match = (keywords: string) => !q || keywords.includes(q);

  const K = {
    sales: 'sales setting display gst rounding discounts due billing bill numbering',
    purchase: 'purchase setting numbering cost price supplier',
    bill: 'bill setting print size logo footer terms whatsapp',
    items: 'items setting units categories low stock alerts mrp',
    barcode: 'barcode label setting size format',
    users: 'users salesman admin staff password',
    perm: 'permission setting role access',
    shop: 'shop timing opening hours weekly off day close',
  };

  const showBilling = match(K.sales) || match(K.purchase) || match(K.bill);
  const showItems = match(K.items) || match(K.barcode);
  const showTeam = isOwner && (match(K.users) || match(K.perm));
  const showShop = isOwner && match(K.shop);
  const nothingFound = !!q && !showBilling && !showItems && !showTeam && !showShop;

  return (
    <div className="flex flex-col h-full min-h-0 w-full bg-[#eef2ff] font-poppins">
      {/* Header */}
      <div className="flex-shrink-0 sticky top-0 z-10 bg-white border-b border-[#dfe6fb]">
        <div className="flex items-center gap-3 px-2 h-14 md:h-auto md:px-6 md:py-3.5">
          <div className="flex-shrink-0">
            <BackButton />
          </div>

          <div className="flex-1 min-w-0">
            <div className="hidden md:block text-xs leading-[18px] text-[#5b6b86]">Account /</div>
            <h1 className="m-0 text-lg leading-6 md:text-[22px] md:leading-[30px] font-semibold text-[#0f172b]">
              Settings
            </h1>
          </div>

          {/* Desktop search field */}
          <label className="hidden md:flex items-center gap-2 w-[300px] h-[38px] px-3 rounded-sm border border-[#7a8aa3] bg-white text-[#5b6b86] focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[#155dfc]">
            <Icon paths={ICONS.search} className="w-4 h-4" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a setting — e.g. rounding, GST, prefix"
              className="flex-1 min-w-0 border-0 outline-none bg-transparent text-sm text-[#0f172b] placeholder:text-[#5b6b86]"
            />
          </label>

          {/* Mobile search toggle */}
          <button
            type="button"
            aria-label="Search"
            onClick={() => {
              setSearchOpen((o) => !o);
              if (searchOpen) setQuery('');
            }}
            className="md:hidden inline-grid place-items-center w-10 h-10 rounded-sm text-[#45556c] hover:bg-[#f5f7ff]"
          >
            <Icon paths={ICONS.search} />
          </button>
        </div>

        {/* Mobile search field */}
        {searchOpen && (
          <div className="md:hidden px-4 pb-3">
            <label className="flex items-center gap-2 h-10 px-3 rounded-sm border border-[#7a8aa3] bg-white text-[#5b6b86]">
              <Icon paths={ICONS.search} className="w-4 h-4" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a setting"
                className="flex-1 min-w-0 border-0 outline-none bg-transparent text-sm text-[#0f172b] placeholder:text-[#5b6b86]"
              />
            </label>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-grow min-h-0 p-4 md:px-6 md:py-5 overflow-y-auto bg-[#eef2ff]">
        {isDefaultMastersView ? (
          <>
            {showBilling && (
              <Group title="Billing">
                {match(K.sales) && (
                  <ShowWrapper requiredPermission={Permissions.ManageSalesSetting}>
                    <SettingItem
                      to={ROUTES.SALESETTING}
                      tint="blue"
                      icon={ICONS.sales}
                      title="Sales Setting"
                      value={salesValue}
                      desc="Display, GST & rounding, discounts, due billing, bill numbering"
                    />
                  </ShowWrapper>
                )}
                {match(K.purchase) && (
                  <ShowWrapper requiredPermission={Permissions.ManagePurchaseSetting}>
                    <SettingItem
                      to={ROUTES.PURCHASESETTING}
                      tint="green"
                      icon={ICONS.purchase}
                      title="Purchase Setting"
                      value={purchaseValue}
                      desc="Purchase numbering, cost price rules, supplier details"
                    />
                  </ShowWrapper>
                )}
                {match(K.bill) && (
                  <ShowWrapper requiredPermission={Permissions.ManageBillSetting}>
                    <SettingItem
                      to={ROUTES.BILLSETTING}
                      tint="amber"
                      icon={ICONS.bill}
                      title="Bill Setting"
                      value={billValue}
                      desc="Print size, logo, footer, terms and WhatsApp bill"
                    />
                  </ShowWrapper>
                )}
              </Group>
            )}

            {showItems && (
              <Group title="Items & stock">
                {match(K.items) && (
                  <ShowWrapper requiredPermission={Permissions.ManageItemSetting}>
                    <SettingItem
                      to={ROUTES.ITEMSETTING}
                      tint="magenta"
                      icon={ICONS.items}
                      title="Items Setting"
                      desc="Units, categories, low-stock alerts, MRP rules"
                    />
                  </ShowWrapper>
                )}
                {match(K.barcode) && (
                  <SettingItem
                    to={ROUTES.BARCODE_SETTING}
                    tint="blue"
                    icon={ICONS.barcode}
                    title="Barcode / Label Setting"
                    value={barcodeValue}
                    desc="Label size, format and what prints on it"
                  />
                )}
              </Group>
            )}

            {showTeam && (
              <Group title="Team & access">
                {match(K.users) && (
                  <SettingItem
                    to={ROUTES.USERSETTING}
                    tint="magenta"
                    icon={ICONS.users}
                    title="Users (Salesman, Admin)"
                    value={usersValue}
                    desc="Add staff, reset passwords, remove access"
                  />
                )}
                {match(K.perm) && (
                  <SettingItem
                    to={ROUTES.PERMSETTING}
                    tint="green"
                    icon={ICONS.permission}
                    title="Permission Setting"
                    desc="What each role can see and change"
                  />
                )}
              </Group>
            )}

            {showShop && (
              <Group title="Shop">
                <SettingItem
                  onClick={() => setShopHoursOpen(true)}
                  tint="amber"
                  icon={ICONS.clock}
                  title="Shop Timing"
                  value={shopValue}
                  valueTone={shopHoursSet ? 'primary' : 'warn'}
                  desc="Opening hours, weekly off, day-close time"
                />
              </Group>
            )}

            {nothingFound && (
              <div className="text-center text-sm text-[#5b6b86] py-10">
                No setting found for “{query}”
              </div>
            )}
          </>
        ) : (
          <div className="bg-white p-6 rounded-sm shadow-md mt-6 min-h-[200px] flex justify-center items-center text-gray-500 italic">
            <Outlet />
          </div>
        )}
      </div>

      {shopHoursOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[rgba(2,6,24,0.45)]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="shop-timing-title"
            className="bg-white shadow-xl w-full sm:max-w-xl sm:mx-4 flex flex-col max-h-[92dvh] sm:max-h-[90dvh] rounded-sm overflow-hidden"
          >
            {/* Fixed header */}
            <div className="flex-shrink-0 flex items-start gap-3 px-5 pt-5 pb-3 border-b border-[#dfe6fb]">
              <span className={`inline-grid place-items-center w-10 h-10 rounded-sm flex-none ${TINT_CLASS.amber}`}>
                <Icon paths={ICONS.clock} />
              </span>
              <div className="flex-1 min-w-0">
                <h2 id="shop-timing-title" className="m-0 text-[17px] leading-6 font-semibold text-[#0f172b]">
                  Shop timing
                </h2>
                <p className="m-0 text-xs leading-[18px] text-[#5b6b86]">When your team can use SELLAR</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShopHoursOpen(false)}
                className="inline-grid place-items-center w-9 h-9 rounded-sm text-[#45556c] hover:bg-[#f5f7ff]"
              >
                <Icon paths={['M6 6l12 12', 'M18 6 6 18']} className="w-5 h-5" />
              </button>
            </div>

            {/* Page = scrollable body + pinned Save */}
            <ShopHoursSettingPage />
          </div>
        </div>
      )}
    </div>
  );
};

export default Masters;