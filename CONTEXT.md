# SELLAR — Codebase Context Document

> Living reference for the SELLAR POS/billing SaaS application.
> Update this file whenever architecture changes or new patterns are established.

---

## 1. What the app is

**SELLAR** is a multi-tenant SaaS POS system for Indian small businesses.
Core features: GST billing, inventory management, purchase tracking, reports, and a B2B catalogue marketplace.

The app is deployed as a web app (PWA-capable). All business data is isolated under each company's Firestore tenant path.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript + Vite |
| Routing | React Router v7 (lazy-loaded routes) |
| State — server | Firebase Firestore (real-time `onSnapshot` listeners) |
| State — client | Redux Toolkit (`auth` + `settings` slices) + React Context (legacy + complex trees) |
| Auth | Firebase Authentication + custom JWT claims (`companyId`, `role`) |
| Storage | Firebase Cloud Storage (logos, signatures) |
| Backend | Firebase Cloud Functions |
| UI | Tailwind CSS v4 + Radix UI primitives + shadcn-style components |
| Charts | Recharts |
| PDF export | jsPDF + jspdf-autotable + html2canvas |
| Barcode/QR | jsbarcode + qrcode + react-qr-code + html5-qrcode |
| Printing | react-thermal-printer + qz-tray |
| Excel | xlsx + xlsx-js-style |
| Offline cache | idb-keyval (IndexedDB) |
| Tests | Vitest (`environment: 'node'`, `globals: true`) |

---

## 3. Repository Layout

```
src/
├── app/                        # Layout shells
│   ├── MainLayout.tsx          # Sidebar + nav for POS module
│   └── CatalougeLayout.tsx     # Layout for Catalogue module
│
├── Pages/
│   ├── Auth/                   # Auth + onboarding
│   │   ├── Landing.tsx
│   │   ├── Signup.tsx
│   │   ├── BusInfo.tsx / ShopSetup.tsx / ShopSetup2.tsx
│   │   ├── ForgotPassword.tsx / ResetPassword.tsx
│   │   └── DownloadBill.tsx    ← PUBLIC route — QR bill download
│   ├── Home.tsx                # Dashboard
│   ├── Master/                 # Core transaction screens
│   │   ├── Sales.tsx           ← Primary billing screen
│   │   ├── SalesReturn.tsx
│   │   ├── Purchase.tsx        ← Stock receiving
│   │   ├── PurchaseReturn.tsx
│   │   ├── ItemAdd.tsx
│   │   ├── ItemGroup.tsx
│   │   ├── UserAdd.tsx
│   │   └── PrintQR.tsx
│   ├── Reports/
│   │   ├── ItemReport.tsx
│   │   ├── SalesReport.tsx
│   │   ├── PurchaseReport.tsx
│   │   ├── PNLReport.tsx
│   │   ├── RestockReport.tsx   ← uses isRestockNeeded field
│   │   └── TaxReport.tsx
│   └── Settings/
│       ├── SalesSetting.tsx
│       ├── Purchasesetting.tsx
│       ├── ItemSetting.tsx
│       ├── Permissionsetting.tsx
│       └── UserSettings.tsx
│
├── Catalogue/                  # B2B marketplace module
│   ├── CatalogueHome.tsx
│   ├── Shop.tsx / SharedCatalouge.tsx / SharedProduct.tsx
│   ├── Orders.tsx / OrdersReturn.tsx / CheckOut.tsx
│   └── Settings/
│       └── CatalogueSalesSetting.ts
│
├── Components/                 # Reusable UI
│   ├── ui/                     # Radix/shadcn primitives
│   ├── GlobalError.tsx         ← Route-level error boundary (uses import.meta.env.DEV)
│   └── ...
│
├── UseComponents/              # Hooks, utilities, heavy components
│   ├── pdfGenerator.ts         ← A4 PDF (modularized — see §7)
│   ├── A5PdfGenerator.ts
│   ├── ThermalpdfGenerator.tsx
│   ├── InvoiceCounter.ts       ← Atomic Firestore counters
│   ├── Invoice.tsx
│   └── BarcodeScanner.tsx
│
├── lib/                        # Firebase + pure utilities
│   ├── Firebase.ts             # App init (db, auth, storage)
│   ├── ItemsFirebase.ts        # All item/group Firestore ops + offline sync
│   ├── AuthOperations.ts       # Login, register, OTP
│   ├── taxUtils.ts             ← Pure tax helpers (unit-tested)
│   └── fetchDashboardData.ts
│
├── context/                    # React Context providers
│   ├── AuthContext.tsx         # Auth state; also dispatches to Redux auth slice
│   ├── SettingsContext.tsx     # Real-time settings listeners; also dispatches to Redux
│   ├── ErrorBoundary.tsx       ← Class component boundary with "Try Again"
│   ├── Plan.tsx                # Subscription plan tier helpers
│   └── Permissions.tsx         # Permission sync logic
│
├── store/                      # Redux Toolkit
│   ├── store.ts                # configureStore — api + auth + settings reducers
│   ├── authSlice.ts            # SerializableUser, setUser/clearUser/setPending
│   ├── settingsSlice.ts        # setSalesSettings/setPurchaseSettings/setItemSettings
│   └── api.ts                  # RTK Query base API
│
├── routes/
│   ├── routes.tsx              # All route definitions (lazy-loaded)
│   ├── SiteRoutes.tsx
│   ├── CatalougeRoutes.tsx
│   └── bottomRoutes.tsx        # Mobile bottom nav
│
├── enums/                      # TypeScript enums / constants
│   ├── permissions.enum.ts     # 50+ granular permission strings
│   ├── plan.enum.ts            # BASIC | PRO | ENTERPRISE | CATALOGUE_*
│   ├── roles.enum.ts           # Owner | Manager | Salesman
│   └── action.enum.ts          # DOWNLOAD | PRINT | BLOB
│
├── constants/
│   ├── models.ts               # Core data model interfaces
│   └── routes.constants.ts     # All ROUTES.* path strings
│
├── Role/
│   └── permission.ts           # User interface, hasPermission(), Role constants
│
└── test/
    ├── taxUtils.test.ts        # 9 tests — calcLineTax, applyRounding
    └── invoiceCounter.test.ts  # 6 tests — INV/PUR/ORD counters

functions/                      # Firebase Cloud Functions (Node.js backend)
firestore.rules                 # Security rules (see §6)
vite.config.ts                  # Vite + Vitest config
```

---

## 4. Firestore Data Architecture

Multi-tenant — all company data lives under `companies/{companyId}`:

```
companies/{companyId}/
  ├── items/{itemId}
  ├── itemGroups/{groupId}
  ├── deletedItems/{itemId}       # Tombstones for offline sync
  ├── sales/{saleId}
  ├── purchases/{purchaseId}
  ├── users/{userId}
  ├── counters/
  │   ├── invoiceCounter          # INV-#### (atomic runTransaction)
  │   ├── purchaseCounter         # PUR-####
  │   └── orderInvoice            # ORD-#### (starts at 1001)
  ├── business_info/{companyId}   # Company details, logo URL
  ├── settings/
  │   ├── sales-settings
  │   ├── purchase-settings
  │   ├── item-settings
  │   ├── catalogue-sales-settings
  │   └── bill
  └── permissions/
      ├── Owner
      ├── Manager
      └── Salesman

leads/{email}                     # Onboarding lead tracking
```

**Key Item fields:** `name`, `mrp`, `purchasePrice`, `salesPrice`, `discount`, `tax`, `taxRate`, `gst`, `hsnSac`, `stock`, `restockQuantity`, `isRestockNeeded`, `barcode`, `unit`, `itemGroupId`, `isListed`, `imageUrl`, `packetSize`, `moq`

---

## 5. State Management Pattern

The app uses **two parallel state layers** — this is intentional:

```
Firebase onSnapshot
       │
       ▼
React Context  ──────────────────────▶  Component tree (via hooks)
(useState)      (raw Firestore types,   useSalesSettings(), useAuth(), etc.
                 Timestamps as Date)
       │
       │  sanitizeForRedux() ──▶ converts Timestamps → ISO strings
       │  toSerializableUser() ──▶ converts expiryDate Date → ISO string
       ▼
Redux Store ─────────────────────────▶  Redux DevTools, future selectors
(SerializableUser, plain objects only)
```

**Rule:** Never read from Redux in components yet — all components still consume Context hooks. Redux is currently write-only from the providers, used for DevTools visibility and as the foundation for migrating state gradually.

**Why not Redux-only?** The existing Context consumers are numerous. The dual-write approach avoids a big-bang migration while keeping Redux up to date.

---

## 6. Firestore Security Rules — Key Principles

- **`allow get` vs `allow read`**: `get` allows a single-document fetch only; `read` also allows list queries. Public paths use `get` to support QR bill sharing without exposing enumeration.
- **`isCompanyMember(companyId)`**: The primary auth guard — checks `request.auth.token.companyId == companyId`.
- **Master admin**: UID `1AKioGfop8PmHhry6uXOz8Rw6qT2` has global read/write via the top-level wildcard rule.

Public `get` paths (no auth required — needed for QR bill sharing and catalogue):
- `sales/{saleId}` — QR share link loads a specific invoice
- `business_info/{docId}` — PDF header needs company name/address
- `settings/sales-settings` — PDF rendering needs tax/salesman config
- `settings/bill`
- `items/{itemId}` — catalogue item browsing
- `itemGroups/{groupId}` — catalogue category browsing
- `Orders/{orderId}` — order create + track (public)
- `settings/catalogue-sales-settings`
- `NotifyRequests/{requestId}`
- `AuthorizedUser/{userId}`

---

## 7. PDF Generation Architecture

`src/UseComponents/pdfGenerator.ts` supports three print formats dispatched from `generatePdf()`:

```
generatePdf(data, action)
  ├── data.printFormat === 'THERMAL58'  →  generateThermalReceipt()  [ThermalpdfGenerator.tsx]
  ├── data.printFormat === 'A5'         →  generateA5Invoice()        [A5PdfGenerator.ts]
  └── (default A4)                      →  generateA4Invoice()        [pdfGenerator.ts]
```

**A4 internal helpers** (all in `pdfGenerator.ts`):

| Helper | Type | Purpose |
|---|---|---|
| `convertNumberToWords(n)` | Pure function | Number → Indian-English words ("One Thousand…") |
| `buildItemRowData(item, scheme, taxType, isEstimate)` | Pure function | All tax/discount/total calculations for one item row; returns `cells[]` + totals for accumulation |
| `drawBrandingFooter(doc, pageWidth, pageHeight)` | Side-effectful | Draws "Powered by SELLAR.IN / Made with Love in India" at page bottom |
| `generateA4Invoice(data, isEstimate, action)` | Async orchestrator | Full A4 layout using the helpers above |

**Tax calculation logic** (inside `buildItemRowData` and in `src/lib/taxUtils.ts`):

```
EXCLUSIVE:  taxable = rowTotal;  tax = taxable × rate/100;  net = taxable + tax
INCLUSIVE:  net = rowTotal;  taxable = net / (1 + rate/100);  tax = net − taxable
NONE / COMPOSITION / isEstimate:  tax = 0, net = rowTotal
```

**Discount priority order** (prevents front-end rounding bugs):
1. `discountPercentage === 100` → free item
2. `item.amount` is present → trust exact amount from UI
3. `discountPercentage > 0` → calculate from percentage
4. Else → no discount

---

## 8. Invoice Counter Pattern

All counters use `runTransaction` for atomic increment. Three counters:

| Counter | Collection path | Prefix source | Format |
|---|---|---|---|
| Sales invoice | `counters/invoiceCounter` | `settings/sales-settings.voucherPrefix` | `{PREFIX}-{n}` |
| Purchase invoice | `counters/purchaseCounter` | `settings/purchase-settings.voucherPrefix` | `{PREFIX}-{n}` |
| Catalogue order | `counters/orderInvoice` | hardcoded | `ORD-{nnnn}` (min 4 digits, starts 1001) |

`peekNextInvoiceNumber` / `peekNextPurchaseNumber` — read-only, used for UI display.
`incrementInvoiceCounter` / `incrementPurchaseCounter` — write, called only on confirmed save.

---

## 9. Offline Item Sync

`listenToItems` in `ItemsFirebase.ts` implements a delta-sync pattern:

1. **Cold start**: reads IndexedDB cache (`idb-keyval`) → emits immediately so UI is instant.
2. **Firestore listener**: queries only items `updatedAt > lastSyncTime`. On first load, pulls full collection.
3. **Tombstone cleanup**: `deleteItem` hard-deletes the item doc and writes a `deletedItems/{id}` tombstone. `syncItems` checks tombstones so offline devices can purge deleted items on reconnect.
4. **Cache write**: merged item map is written back to IndexedDB with an updated `TIME_KEY`.

---

## 10. Tax System

- **GST Schemes**: `regular` | `composition` | `none`
- **Tax Types**: `exclusive` (tax added on top) | `inclusive` (price contains tax)
- Per-item rate via `item.taxRate` or `item.gstPercent`; scheme from `salesSettings.gstScheme`
- Tax breakdown table in PDF: CGST = SGST = total tax / 2 per rate slab
- **Pure utility**: `src/lib/taxUtils.ts` exports `calcLineTax()` and `applyRounding()` — use these for any new tax calculation code

---

## 11. Permissions & Plans

```
Auth token claim: companyId (string)

Role (per user doc):  Owner | Manager | Salesman
Permissions (50+):    stored per-role in companies/{id}/permissions/{role}
                      auto-synced on login via syncCompanyPermissions()

Plan (per company doc):
  POS_BASIC      → sales + items only
  POS_PRO        → all POS features
  ENTERPRISE     → all features
  CATALOGUE_BASIC / CATALOGUE_PRO → catalogue module only

Subscription validity: companies/{id}.validity === 'active' && expiryDate > now
```

`hasPermission(user.permissions, Permissions.SOME_PERMISSION)` — use everywhere in UI guards.
`<RequiredSubscription>` wrapper component gates features by plan.

---

## 12. Serialization Rules for Redux

Two known sources of non-serializable data coming from Firestore — always convert before dispatching:

| Source | Type | Conversion |
|---|---|---|
| `User.Subscription.expiryDate` | `Date` (from `Timestamp.toDate()`) | `toSerializableUser(user)` in `authSlice.ts` |
| Settings doc fields (`updatedAt`, `createdAt`, etc.) | Firestore `Timestamp` | `sanitizeForRedux(value)` in `SettingsContext.tsx` |

`sanitizeForRedux<T>(obj)` — duck-types any object with `{seconds, nanoseconds, toDate()}` and converts to ISO string. Defined at the top of `SettingsContext.tsx`. Apply to any new Firestore → Redux dispatch.

---

## 13. Testing

```bash
npx vitest run          # run all tests once
npx vitest              # watch mode
```

Test files live in `src/test/`. The Vitest config is in `vite.config.ts`:
```ts
test: { environment: 'node', globals: true }
```

**Why `environment: 'node'` not `jsdom`?** Tailwind CSS v4 uses ESM-only packages that crash under jsdom's CommonJS require. Pure unit tests (tax math, Firestore counter logic) don't need a DOM.

Firebase is always fully mocked in tests — never imports a real credentials file.

---

## 14. Known Remaining Tech Debt

| Item | Detail |
|---|---|
| No component tests | Vitest is configured; only pure-function unit tests exist so far |
| Redux read-only | Components still consume Context hooks; Redux is written but not yet read by any component |
| RestockReport | Uses local IndexedDB cache + `isRestockNeeded` field is maintained on write; a direct Firestore query `where('isRestockNeeded', '==', true)` would be faster if data volume grows |
| `counter/` legacy collection | Old singular collection name; can be dropped once all clients have synced past the migration window |
| `SalesSetting.tsx` `applyRounding` | Some callers may still import `applyRounding` locally — prefer `import { applyRounding } from '../../lib/taxUtils'` |
| PDF A5 + Thermal | Not yet modularized like the A4 path |

---

## 15. Key Files Quick Reference

| File | What it does |
|---|---|
| `src/Pages/Master/Sales.tsx` | Core billing screen — cart, tax, payment |
| `src/Pages/Master/Purchase.tsx` | Stock receiving |
| `src/Pages/Auth/DownloadBill.tsx` | Public QR bill download |
| `src/UseComponents/pdfGenerator.ts` | A4 PDF generation (modularized) |
| `src/UseComponents/InvoiceCounter.ts` | Atomic counter reads + increments |
| `src/lib/ItemsFirebase.ts` | All item Firestore ops + offline sync |
| `src/lib/taxUtils.ts` | Pure tax math — `calcLineTax`, `applyRounding` |
| `src/lib/AuthOperations.ts` | Login, register, OTP, Cloud Function calls |
| `src/context/AuthContext.tsx` | Auth state, permissions, plan resolution |
| `src/context/SettingsContext.tsx` | Real-time settings listeners |
| `src/context/ErrorBoundary.tsx` | Class component error boundary |
| `src/store/authSlice.ts` | Redux auth state + `toSerializableUser` |
| `src/store/settingsSlice.ts` | Redux settings state |
| `src/constants/models.ts` | All data model interfaces |
| `src/enums/permissions.enum.ts` | All permission constants |
| `src/constants/routes.constants.ts` | All ROUTES.* path strings |
| `firestore.rules` | Firestore security rules |
| `vite.config.ts` | Vite build + Vitest test config |
