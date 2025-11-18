## Code Improvement Plan & Steps

Date: 2025-11-18

Goal

- Collect concrete, actionable improvement steps from the audit and make them easy to apply in small PRs. This document is a direct checklist to improve readability, maintainability, and type-safety.

Principles

- Small PRs (<200 LOC) focusing a single class of changes (types, helpers, UI wrappers).
- Preserve runtime behavior while improving internals (use compatibility wrappers where needed).
- Centralize helpers and mappings to avoid accidental duplication.
- Move complex business logic from UI components into hooks or lib functions.

Top repo-wide action items

1. Replace `any` with strict types (high priority)

- Add canonical models in `src/constants/models.ts` (Item, Sale, Purchase, Customer, Invoice, User, Settings).
- Use typed Firestore mappers / converters so reads return typed objects.
- Replace `map((item: any) => ...)` with `map(parseItem)` where `parseItem` validates input.

2. Centralize small helpers

- Replace local `const cn = ...` implementations with `import { cn } from 'src/lib/utils'`.
- Add `src/lib/firestorePaths.ts` with helpers:
  - makeCollection(companyId, name)
  - makeDoc(companyId, collection, id)

3. Formalize UI wrapper pattern (shadcn primitives + thin adapters)

- Keep `src/Components/ui` as canonical shadcn-derived primitives.
- Formalize thin adapters into `src/Components/wrappers/` or add a comment header in each adapter describing the mapping.
- Add mapping helpers in `src/Components/wrappers/mappings.ts` (e.g., mapAppButtonVariant).

4. Move business logic into hooks

- Create hooks for heavy logic and data flows (examples):
  - `usePaymentCalculator` (from `PaymentDrawer` calculations)
  - `useJournalData` (already exists; ensure it is clean and typed)
  - `useReportsAggregator` (for PNL/Sales/Item reports)

5. Improve timers & DOM APIs typing

- Use browser timer types in refs: `useRef<number | null>(null)` and `window.setTimeout`/`clearTimeout`.

6. Consistent floating comparisons

- Add an EPS constant (e.g., `const EPS = 0.01`) in `src/lib/constants.ts` and use it for comparisons instead of magic numbers.

7. UseCallback & useMemo

- Wrap handlers in useCallback and heavy derived values in useMemo to reduce re-renders (especially for lists and charts).

8. Error handling and logging

- Replace console-only error swallowing with a consistent error handling pattern (Toast or Modal) and structured logs.

9. Tests & CI

- Add `tsc --noEmit` to CI and `npm run lint` with zero warnings.
- Add unit tests for parsing/mapping logic and for at least one UI wrapper snapshot (Button).

Per-file / focused tasks (start here)

- `src/Components/CustomButton.tsx`
  - Create `src/Components/wrappers/mappings.ts` with `mapAppButtonVariant`.
  - Type the wrapper with VariantProps<typeof buttonVariants> and React.ButtonHTMLAttributes.
  - Keep it as a thin adapter that forwards props and className.

- `src/Components/CustomCard.tsx`
  - Replace local `cn` with `import { cn } from 'src/lib/utils'`.
  - Either re-export `Card` from `ui/card.tsx` or keep a minimal wrapper.

- `src/Components/CustomToggle.tsx`
  - Replace `any` with proper React types and VariantProps from `ui/toggle`.
  - Convert to a thin adapter or re-export the primitive.

- `src/Components/Dropdown.tsx` / `ui/dropdown-menu.tsx`
  - Keep the typed `ReusableDropdown` wrapper but move it under `ui/` if it becomes widely reused.

- `src/Components/PaymentDrawer.tsx`
  - Change `longPressTimer` type to `useRef<number | null>(null)`.
  - Extract `usePaymentCalculator` hook to compute appliedCredit, appliedDebit, remainingAmount, and fill logic.
  - Use `firestorePaths` helper for any customer/doc lookup to ensure company-scoped reads/writes.
  - Wrap handlers in useCallback and ensure number handling uses numbers internally and only formats for display.

- `src/Pages/*` heavy pages (Journal, Purchase, Sales, Reports)
  - Extract data access into hooks or `src/lib` functions.
  - Create Firestore converters for domain objects.
  - Move aggregation logic (grouping, sums) into `src/lib/reporting.ts` with unit tests.

Small quick-win PRs to create first

1. Replace local `cn` in `CustomCard.tsx` and `CustomToggle.tsx` with `src/lib/utils` import. (Very small)
2. Add `src/Components/wrappers/mappings.ts` and refactor `CustomButton` to use it. Add a test. (Small)
3. Implement `src/lib/firestorePaths.ts` and refactor one page (`PaymentDrawer`) to use it. (Medium)

Migration & testing strategy

- Phase 1: Add compatibility wrappers and mapping helpers so runtime behavior is unchanged.
- Phase 2: Incrementally replace wrappers consumers to the primitive or improved wrapper types.
- Phase 3: Remove deprecated wrappers and update docs.
- Run unit tests and type-check after each PR.

Glossary & abbreviations

- DRY: Don't Repeat Yourself
- EPS: tolerance for money comparisons (0.01)
- shadcn: shadcn/ui + Radix primitives used in `src/Components/ui`

Next steps (I can do any of these for you)

- Create `src/Components/wrappers/mappings.ts` and refactor `CustomButton` (small PR).
- Replace `cn` in the two custom components (tiny PR).
- Extract `usePaymentCalculator` from `PaymentDrawer` (medium PR).
- Run lint/type-check and create a PR with the top 20 fixes.

## Routing isolation & route-scope hook (catalogue vs POS)

Add these concrete steps to safely split the router and ensure catalogue pages mount only the `Catalogue` layout and POS pages mount only the `Main` layout. This prevents UI bleed (e.g., POS actions showing on catalogue pages) and makes per-route scope explicit.

High-level plan

- Split the router into two root entries: POS root at `/` using `MainLayout`, and Catalogue root at `/catalogue` using `CatalogueLayout`.
- Add a route `handle` property to mark scope: `handle: { scope: 'pos'|'catalogue' }` on each root.
- Create a small hook `src/hooks/useRouteScope.ts` that reads `useMatches()` and returns the current scope (falls back to 'pos').
- Update `MainLayout` and `CatalogueLayout` to use the hook to hide/show UI bits (toolbar buttons, POS-only nav items).
- Rename `CatalougeLayout.tsx` to `CatalogueLayout.tsx` (and update imports) as a cleanup.

Minimal code samples

1. Router root pattern (example snippet for `src/routes/routes.tsx`)

```ts
// simplified example
import { createBrowserRouter } from 'react-router-dom';
import MainLayout from 'src/app/MainLayout';
import CatalogueLayout from 'src/app/CatalogueLayout';
import ROUTES from 'src/constants/routes.constants';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    handle: { scope: 'pos' },
    children: [
      { index: true, element: <HomePage /> },
      { path: ROUTES.PRINTQR, element: <PrintQrPage /> },
      // other POS children
    ],
  },
  {
    path: '/catalogue',
    element: <CatalogueLayout />,
    handle: { scope: 'catalogue' },
    children: [
      { index: true, element: <SharedCatalogueLanding /> },
      { path: ROUTES.MY_SHOP.replace('/catalogue/', ''), element: <MyShop /> },
      { path: ROUTES.ORDERS.replace('/catalogue/', ''), element: <Orders /> },
      { path: ROUTES.CATALOGUE_ACCOUNT.replace('/catalogue/', ''), element: <CatalogueAccount /> },
    ],
  },
  // public route for /catalogue/:companyId if you keep explicit links
  { path: ROUTES.CATALOGUE, element: <SharedCataloguePublic /> },
]);
```

2. Hook: `src/hooks/useRouteScope.ts`

```ts
import { useMemo } from 'react';
import { useMatches } from 'react-router-dom';

export function useRouteScope() {
  const matches = useMatches();
  return useMemo(() => {
    for (let i = matches.length - 1; i >= 0; i--) {
      const h = (matches[i] as any).handle;
      if (h && (h.scope === 'catalogue' || h.scope === 'pos'))
        return h.scope as 'catalogue' | 'pos';
    }
    return 'pos';
  }, [matches]);
}
```

3. Usage in a layout (example in `MainLayout` and `CatalogueLayout`)

```tsx
import { useRouteScope } from 'src/hooks/useRouteScope';

function MainLayout() {
  const scope = useRouteScope();
  // hide catalogue-only buttons when scope === 'catalogue'
  return <div>{/* layout ui */}</div>;
}
```

Verification steps

- Run the app locally: `npm run dev`.
- Visit a catalogue route (e.g., `/catalogue` or a public `/:companyId` route) and confirm `CatalogueLayout` is used and POS buttons are hidden.
- Visit POS routes (e.g., `/`) and confirm `MainLayout` is used and catalogue UI is hidden.
- Run `npm run type-check` and `npm run lint` and fix any import/type errors introduced by renames.

Notes & safety

- Use the ROUTES constants for children paths to avoid fragile substring logic; where needed, use `ROUTES.ORDERS.replace('/catalogue/', '')` for the child path string in the catalogue root.
- Make small, separate commits: (1) router split, (2) hook addition, (3) layout updates, (4) rename. This keeps each PR small and reviewable.

If you want, I can implement the router split + hook + layout update now and run the local checks. I can also create the `src/hooks/useRouteScope.ts` file for you as a first PR.

---

This file summarizes the actionable steps collected from the audit. Tell me which small PR to open first and I'll implement it, run the quick checks, and open a PR for review.
