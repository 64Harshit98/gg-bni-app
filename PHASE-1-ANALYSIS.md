# gg-bni-app — Phase 1: Architecture Analysis & Modernization Roadmap

**Prepared for:** Abdul Qadir Khan
**Date:** 24 July 2026
**Scope:** Full-project analysis of the Sellar billing/inventory/catalogue SaaS prior to a staged modernization.
**Method:** Static analysis of the live codebase (configs, entry points, routing, state, data layer, styling, and code-smell metrics gathered directly from source).

---

## 1. Executive summary

This is a **large, feature-rich, genuinely production-grade application** — a multi-tenant retail POS + inventory + catalogue e-commerce + reporting platform, built on React 19 / TypeScript / Vite / Tailwind v4 / Firebase. It works and it ships real business value. That is the important context for everything below: **the goal is not to rescue a broken app, it is to modernize a working one without regressing it.**

The codebase is **~84,600 lines across 262 TypeScript files**. It has good bones in a few places (a shadcn/ui token foundation with dark mode already defined, lazy-loaded routes, a dynamic route registry, Firebase security rules) but carries **significant structural debt** concentrated in a handful of areas:

The three findings that matter most:

1. **Redux Toolkit is dead weight.** There is not a single `createSlice`, `useSelector`, or `useDispatch` anywhere in `src`. The store contains one empty RTK Query API with no endpoints. State actually lives in React Context (4 providers) plus **1,295 `useState` calls** scattered across components. The stack advertises RTK; the app doesn't use it.
2. **There is no data/service layer.** Firestore is called directly from **98 files** with **~818 raw Firestore calls** (`getDocs`, `onSnapshot`, `setDoc`, etc.) embedded inside UI components. This is the single biggest driver of the giant-file problem and the hardest thing to change safely later — so it should be tackled early and incrementally.
3. **A security issue needs attention now, independent of the redesign:** payment-gateway and e-invoicing secrets are exposed to the browser bundle (see §5).

The UI modernization the brief asks for is very achievable because the design-token foundation *already exists* — it's just barely adopted. Most of the 200+ components hand-roll their own styling instead of using the shared primitives.

**Recommended posture:** proceed in the 8 phases the brief lays out, but treat this as a **months-long, incremental, behavior-preserving migration** with a working build after every step — not a big-bang rewrite. A 4,670-line `Orders.tsx` cannot be safely rewritten in one pass; it can be safely *strangled* piece by piece.

---

## 2. What the application is

From the README and code, gg-bni-app ("Sellar") is a comprehensive **billing & inventory management SaaS** for Indian retail businesses. Major functional areas:

- **POS / Master data** — Sales, Purchase, Sales Return, Purchase Return, Item Add/Group, item management, barcode/QR scanning, thermal + A5 PDF invoice generation.
- **Catalogue / storefront** — a public, subdomain-routed e-commerce catalogue (`tenant.sellar.in`), shop, product pages, cart/checkout, orders, bulk quotes.
- **Reports** — Sales, Purchase, Customer, Item, Item-Sold, Tax (GST), P&L, Party Ledger, Restock, User reports (both an admin set and a catalogue set — largely duplicated).
- **Accounts / Admin** — subscriptions, super-admin hub, support tickets, website/app leads, partner & agent dashboards.
- **Settings** — bill, item, purchase, sales, permission, user, shop-hours settings (again, an admin set and a parallel catalogue set).
- **Integrations** — Firebase (Auth/Firestore/Storage), WhatsApp Business messaging, ICICI + Eway payment/e-invoice gateways, QZ Tray printing.
- **Multi-tenant, role- and plan-gated** — roles, permissions, and subscription plans gate both routes and features.

This breadth is why the roadmap has to be surgical. There is a lot of real business logic to preserve.

---

## 3. Metrics snapshot (measured, not estimated)

| Metric | Value | Note |
|---|---|---|
| Source files (`.ts`/`.tsx`) | 262 (204 tsx, 58 ts) | |
| Total lines of source | ~84,600 | |
| Files > 500 lines | 49 | |
| Files > 1,000 lines | 18 | Well beyond the 250-line target in the brief |
| Largest file | `Catalogue/Orders.tsx` — **4,670 lines** | Single component |
| `useState` calls | 1,295 | Primary state mechanism |
| `useEffect` calls | 359 | Effect-heavy data fetching |
| Redux `createSlice` / `useSelector` / `useDispatch` | **0 / 0 / 0** | RTK is unused |
| Files calling Firestore directly | 98 | No data layer |
| Raw Firestore API calls | ~818 | Scattered in components |
| `any` occurrences | ~749 across 105 files | Type-safety gaps |
| `console.*` statements | ~400 | Left in production code |
| Native `alert()` calls | 42 | Blocking, un-styled UX |
| Inline `style={{…}}` blocks | 73 | Bypasses the token system |
| React `lazy()` splits | 85 | Good — route-level splitting exists |
| `Suspense` boundaries | 9 | Thin coverage relative to lazy count |
| Skeleton loaders | 0 | Loading = spinners / "Loading…" text |
| Toast/notification libs | ~2 files | Feedback is mostly `alert()` |
| Automated tests | **0** | No test suite of any kind |
| Icon libraries in use | 3 | `react-icons` (46 files), `lucide-react` (23), hand-rolled `Icons.tsx` |
| Animation libraries | 2 | `framer-motion` and `motion` both present |

---

## 4. Current architecture

### 4.1 Folder structure

The tree is **role-/type-organized, not feature-organized**, and casing is inconsistent (`Pages`, `Components`, `Catalogue`, `UseComponents`, `constants`, `context`). Top-level `src`:

```
src/
  app/          MainLayout, CatalougeLayout (259 & ~400 lines), App.tsx (dead stub)
  Catalogue/    storefront feature — huge files, own hooks/utils/enums/settings/reports
  Components/   ~60 mixed components + Components/ui (13 shadcn primitives)
  constants/    routes, icons, modal, spinner, table columns (mixed concerns)
  context/      Auth, Settings, Notification, ShopHours, ErrorBoundary, Permissions
  enums/        roles, permissions, plans, etc.
  guards/       AppGuard
  lib/          Firebase init, AuthOperations, ItemsFirebase, dashboard fetch, utils(cn)
  Pages/        admin app — Master, Reports, Settings, Account, Auth, Additional/Whatsapp
  Role/         permission types
  routes/       routes.tsx, AppRegistry, bottom/site/catalogue route lists
  store/         store.ts + api.ts (empty RTK boilerplate)
  UseComponents/ PDF/invoice/scanner/search utilities (naming is misleading)
```

Observations: `Catalogue/*` and `Pages/*` contain **two parallel implementations of the same concepts** (reports, settings, party ledger, bill settings) — a major duplication axis. `UseComponents/` mixes non-hook utilities (`pdfGenerator.ts`, `A5PdfGenerator.ts`) with components. `constants/` holds runtime UI (`Modal.tsx`, `Spinner.tsx`, `Icons.tsx`) that aren't constants.

### 4.2 Entry point & provider tree

`main.tsx` wraps the app in six nested providers (ErrorBoundary → StrictMode → Redux Provider → Auth → ShopHoursGuard → Notification → Settings). The Redux `Provider` is present but wraps a store that does nothing. `app/App.tsx` is a **dead placeholder** ("Main App / Click" button) — not referenced by the router.

### 4.3 Routing

React Router v7 (`createBrowserRouter`) in `routes/routes.tsx`. Genuinely good ideas here: **subdomain detection** switches between the public catalogue and the admin app, and a **dynamic route registry** (`AppRegistry.tsx`) generates protected routes with per-app plan/permission gating.

Problems:
- **Large-scale copy-paste duplication.** Inside the protected block, an identical ~15-route list (Landing, Signup, BusInfo, super-admin, WhatsApp, etc.) appears **twice**, verbatim, nested inside itself. Several routes (`SUPER_ADMINHUB`, `SUPPORT_TICKET`, `WEBSITE_QUERY`, `APP_LEADS`) are declared **three+ times**.
- **Two guard implementations** with overlapping jobs: `constants/ProtectedRoutes.tsx` and `guards/AppGuard.tsx`, plus `PermissionWrapper` and `RequireSubscription`. Auth-gating logic is spread across four wrappers.
- **Public routes sit outside the permission wrapper** (a code comment even flags "Completely outside permissions!"). Worth an explicit security review.
- Loading fallback is a single top-level `<Suspense>` with a spinner; no per-route skeletons or error boundaries beyond the root `errorElement`.

### 4.4 State management — the headline finding

**Redux Toolkit is installed, wired into the provider tree, documented in the README… and completely unused.** `store/api.ts` is empty RTK Query boilerplate (`endpoints: () => ({})`). There are zero slices and zero selector/dispatch calls in the entire `src` tree.

Actual state management:
- **Global/shared state → React Context:** `AuthContext` (auth + user + a `db operations` object typed `any`), `SettingsContext`, `NotificationContext`, `ShopHoursGuard`. Contexts are consumed in ~200 places.
- **Everything else → local `useState`:** 1,295 instances. Large pages hold dozens of `useState` each, with data fetching in `useEffect` (359 effects). No caching, no request dedup, no normalized entities, no optimistic updates — every screen refetches on mount.

Consequences: heavy re-renders, duplicated fetch logic, no single source of truth for server data, and state logic tangled into 1,000+ line render functions.

### 4.5 Data / API layer

**There isn't one.** Firestore is imported and called directly in **98 files** — components `import { collection, getDocs, onSnapshot, ... } from 'firebase/firestore'` and query the database inline. ~818 such calls. `lib/ItemsFirebase.ts` and `lib/AuthOperations.ts` are partial exceptions (some operations centralized), and `AuthContext` stores a `dbOperations` object — but it's typed `any` and doesn't cover most access.

`axios` is a dependency but used in **exactly one file** (WhatsApp API); `store/api.ts` references `VITE_API_BASE_URL` that isn't in `.env`. So the "API layer" is effectively: direct Firestore everywhere + one axios integration + a handful of REST fetches to payment gateways.

This is the highest-leverage area to fix, and also the riskiest, which is why the roadmap introduces a service layer **gradually, behind the existing call sites**, rather than in one sweep.

### 4.6 Firebase usage

Firebase v12: Auth (email/password, custom claims via `firebase-admin` in `functions/`), Firestore (primary datastore, multi-tenant under `companies/{companyId}/...`), Storage (logos/images). `firestore.rules` (5.9 KB) and `storage.rules` exist — good. Auth state flows through `onAuthStateChanged` in `AuthContext`, which also **auto-provisions default settings/permissions on first login** (a lot of business logic lives in the auth provider). Real-time listeners (`onSnapshot`) are used but not consistently cleaned up in every case — worth auditing during refactor.

### 4.7 Styling & design system

**The foundation the brief asks for largely already exists** in `global.css`: a full **oklch-based token system** (background/foreground/card/primary/secondary/muted/accent/destructive/border/ring/chart/sidebar), a `.dark` theme with all tokens redefined, radius scale, and `@theme inline` mapping tokens to Tailwind v4 utilities. Font is Comfortaa (self-hosted). shadcn/ui is configured (`components.json`, base color slate, CSS variables on).

The problem is **adoption, not absence**:
- Only **13 primitives** exist in `Components/ui` (button, card, input, label, drawer, dropdown-menu, popover, menubar, toggle, toggle-group, chart, FloatingLabelInput). The brief's target set (Modal, Dialog, Select, Table, Badge, Avatar, Tooltip, Toast, Alert, Skeleton, EmptyState, Stat/Dashboard cards, form field wrappers, etc.) is largely missing.
- The 200+ feature components mostly **don't use these primitives** — they hand-write Tailwind classes, hard-code colors (not tokens), use 73 inline `style` blocks, and mix **three icon systems**.
- **Dark mode is defined but never toggled** — no theme switcher, no `.dark` class management. It's "dark-mode-ready" in CSS only.
- Two animation libraries (`framer-motion` + `motion`) are both installed; usage is sparse and inconsistent.

### 4.8 UI/UX consistency

Because styling is per-component, spacing/radius/typography/color drift across screens. Feedback patterns are inconsistent: **42 native `alert()`s**, ~400 `console` logs, **zero skeletons** (spinners or "Loading…" text instead), and only a thin notification/toast path. Empty/error/success states are ad hoc. This is exactly the surface the design-system work will standardize.

---

## 5. Critical issues (address independent of the redesign)

1. **Exposed secrets in the client bundle (high severity).** `.env` contains `VITE_ICICI_SECRET_KEY`, `VITE_ICICI_MERCHANT_ID`, `VITE_ICICI_AGGREGATOR_ID`, `VITE_EWAY_API_KEY`, and related payment/e-invoice credentials. Every `VITE_`-prefixed variable is **compiled into the JavaScript bundle and publicly readable** by anyone who opens the app. Payment-gateway secret keys must never live in frontend env vars — they belong behind a server endpoint (a Firebase Function). Recommendation: rotate these keys and move the calls server-side. (Firebase Web config keys under `VITE_API_KEY` etc. are *expected* to be public and are fine — this is specifically about the ICICI/Eway secrets.)
2. **Public routes outside the permission wrapper.** Flagged in a code comment; needs a deliberate check that no privileged data is reachable through the legacy public catalogue/download-bill routes.
3. **No tests + no error monitoring.** Zero automated tests and no error-reporting service means regressions during modernization are invisible until a user hits them. A minimal safety net (smoke tests on critical POS/checkout flows + an error tracker like Sentry) should precede large refactors.
4. **`onSnapshot` listener hygiene.** Real-time listeners not consistently torn down risk memory leaks and quota burn; audit during the data-layer phase.

---

## 6. Code smells & technical debt (catalogue)

- **God components:** 18 files > 1,000 lines; `Orders.tsx` (4,670), `Sales.tsx` (3,006), `Purchase.tsx` (2,187), `Journal.tsx` (2,153), `SharedProduct.tsx` (1,847). These mix data fetching, business rules, PDF generation, and rendering in one file.
- **Type safety:** ~749 `any` usages; `dbOperations: any`, `useState<any>` patterns, untyped Firestore doc data.
- **Duplication:** parallel admin vs. catalogue implementations of reports, settings, and ledgers; duplicated route blocks; repeated report scaffolding (each report has near-identical filter/date-preset/export logic).
- **Dead / misleading code:** `app/App.tsx` stub; empty Redux store; `constants/indesx.ts` (typo file); `react-icons` + `lucide` + custom icons in parallel; `framer-motion` + `motion` both installed.
- **Left-in diagnostics:** ~400 `console.*`, 42 `alert()`.
- **Naming/casing inconsistency:** `UseComponents`, `CatalougeLayout`/`SharedCatalouge` (misspelling baked into filenames and imports), mixed Pascal/lower directories.
- **Config drift:** README claims RTK Query; `tailwind.config.js` is near-empty (Tailwind v4 uses CSS `@theme`, so the JS config is vestigial); `store/api.ts` points at a missing env var.

---

## 7. Performance issues

- **Refetch-on-mount everywhere** (359 effects, no server-state cache) → redundant Firestore reads (cost + latency).
- **Re-render pressure** from dozens of `useState` in giant components and context values that aren't all memoized.
- **Large route chunks:** lazy loading exists, but individual chunks are enormous (a 4,670-line Orders route is a multi-hundred-KB chunk). Splitting the god components shrinks chunks.
- **Heavy client-side libraries** loaded broadly: `xlsx`, `exceljs`, `jspdf`, `html2canvas`, `tesseract.js`, `pdfjs-dist`, `qz-tray`. These should be dynamically imported only where used (some already are; needs an audit).
- **No skeletons / optimistic updates** → perceived slowness on every navigation.
- **A 2.5 MB background PNG** (`assets/bg-main.png`) shipped unoptimized.

---

## 8. Prioritized modernization roadmap

Mapped to the 8 phases in your brief, ordered so that **every phase leaves a shippable, behavior-identical app** and lower-risk/high-leverage work comes first. Each feature-level refactor uses the **strangler pattern**: build the new primitive/service, migrate call sites incrementally, delete the old path only when nothing references it.

**Guiding rule:** no big-bang rewrites. Green build + working app after every merge.

### Phase 0 — Safety net & critical fixes (do first, ~small)
- Rotate & server-side the exposed ICICI/Eway secrets (Firebase Function proxy).
- Add an error tracker (Sentry) + a real toast system to replace `alert()`.
- Add smoke tests for the highest-value flows (login, create sale, checkout, generate invoice) so later refactors have a tripwire.
- Wire a CI check (build + lint + typecheck) if not already enforced.

### Phase 1 — Analysis *(this document)* ✅

### Phase 2 — Architecture plan & foundation
- Decide feature-based structure (`src/features/{sales,purchase,catalogue,reports,...}`, `src/shared/{ui,hooks,lib}`, `src/services`).
- Introduce path aliases consistently, fix casing, delete dead code (App.tsx stub, empty Redux store *or* actually adopt RTK Query — see decision points).
- Establish coding standards + strict-TS lint rules; add a barrel/import convention.

### Phase 3 — Design system & tokens
- Formalize the existing oklch tokens; add spacing/typography scales and document them.
- Build the missing primitives (Dialog, Drawer, Select, Table, Badge, Avatar, Tooltip, Toast, Alert, Skeleton, EmptyState, Stat/Dashboard Card, Form field set) on Radix + CVA + `cn`.
- Add a real dark-mode toggle (the CSS is already there).
- Consolidate to **one** icon library and **one** animation library.

### Phase 4 — Shared components & app shell
- Modernize `MainLayout`/`CatalogueLayout` (responsive nav, consistent spacing).
- Replace bespoke tables/forms/modals with the new primitives, screen by screen.
- Standardize loading (skeletons), empty, error, and success states.

### Phase 5 — Feature-by-feature refactoring (the long haul)
- Introduce a **typed service layer** per domain (`services/salesService.ts`, etc.) wrapping Firestore, with typed models and error handling. Migrate god components to consume services + extracted hooks.
- Break the 18 god components into feature folders (component + hooks + service + types), each file toward the ~250-line target.
- Collapse the admin/catalogue report & settings duplication into shared, config-driven implementations.

### Phase 6 — State & performance
- Adopt a server-state strategy (RTK Query **or** React Query) to replace refetch-on-mount; normalize entities; add caching + optimistic updates.
- Memoize context values and expensive selectors; audit `onSnapshot` cleanup; dynamic-import heavy libs; optimize images/bundle.

### Phase 7 — Cleanup
- Remove dead deps (unused of `qrious`/`qz-tray`/duplicate icon+motion libs after consolidation), dead files, `console` logs; fix all remaining `any`s in touched code.

### Phase 8 — Final review
- Accessibility pass (ARIA, focus management, keyboard nav, contrast), responsive verification at 320/768/1024/1440, Lighthouse/bundle budget, and a documentation pass.

---

## 9. Key decisions I need from you before Phase 2

These change the plan materially and are yours to make:

1. **Redux vs. React Query for server state.** The brief lists RTK, but the app uses neither meaningfully. Given the Firestore-first data model, **React Query (TanStack Query)** is often the cleaner fit than RTK Query for real-time Firestore; RTK Query is fine if you want to stay in the advertised stack. Either is a big improvement over the current refetch-on-mount.
2. **How aggressive on folder restructure.** A full move to feature-based structure touches nearly every import. Worth it long-term, but it's a large, low-visual-payoff diff. Options: do it up front (clean but disruptive) vs. migrate folder-by-folder alongside feature refactors (safer, slower).
3. **Design direction.** "Stripe/Linear/Vercel" is a broad target. Before Phase 3 I'd want to lock: light-first or dark-first, accent/brand color (currently near-monochrome oklch), density (compact POS vs. airy SaaS), and whether the public catalogue shares the admin design language or keeps its own.
4. **Working mode.** This is a months-long effort. I'd recommend I work **one feature/PR at a time against a branch**, each independently reviewable and shippable, rather than a single mega-change. Confirm your branching/review preference.

---

*Prepared as Phase 1 of the staged modernization. No source files were modified in this phase — analysis only.*
