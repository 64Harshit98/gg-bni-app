````markdown
## Repository improvement & optimization plan

Date: 2025-11-18

Purpose

- Provide a concise, prioritized plan to improve code quality, security, performance, and developer experience for this repository.
- Produce a small, actionable roadmap that can be split into reviewable PRs.

Assumptions

- Project is a TypeScript + Vite + Firebase web app (multi-tenant, companies/...).
- You have CI capability (GitHub Actions recommended) and access to Firebase project settings for rules/functions.

Goals

- Fix critical type-safety and lint problems to improve maintainability.
- Harden Firebase usage and push privileged operations to Cloud Functions.
- Add CI and basic tests to prevent regressions.
- Improve performance and UX for key flows (reports, payments, printing).

Top priorities (short description + why)

- Type-safety & linting (critical) — reduces bugs, improves DX.
- Firebase security & privileged operations (critical) — prevents data exposure/miswrites.
- CI (lint/type-check/build) — prevents regressions on PRs.
- Centralize data layer (RTK Query or typed APIs) — simplifies caching and error handling.

Concrete roadmap

## Short-term (0–3 days)

- Fix top ESLint/TypeScript errors reported in `eslint.txt` and configure `npm run type-check` (tsc --noEmit).
  - Files to start: `src/store/api.ts`, `src/lib/AuthOperations.ts`, `src/constants/models.ts`.
  - Deliverable: zero critical lint/type errors (or documented exceptions) and a passing local `npm run type-check`.

- Router split & route-scope isolation (0.5-1 day)
  - Split the router into two roots: POS (`/`) and Catalogue (`/catalogue`) so each root mounts its own layout (`MainLayout` and `CatalogueLayout`).
  - Add `handle: { scope: 'pos'|'catalogue' }` to the root routes and create `src/hooks/useRouteScope.ts` to expose the current scope to layouts/components.
  - Rename `CatalougeLayout.tsx` -> `CatalogueLayout.tsx` and update imports.
  - Verification: run `npm run dev`, smoke-test navigation (catalogue vs pos), run `npm run type-check` and `npm run lint`.
  - Deliverable: scoped router + hook + layout rename in a small PR. This reduces UI bleed and allows components to hide/show features by scope.

## Mid-term (1–2 weeks)

- Implement typed Firestore mappers / converters to map DocumentData <-> typed models. Add model types in `src/constants/models.ts`.
- Introduce RTK Query endpoints (or another typed service layer) in `src/store/api.ts` and migrate 1–2 data-heavy pages to use it (e.g., Catalogue, Orders).
- Audit and memoize components with heavy re-renders (examples: `PaymentDrawer.tsx`, `SalesBarGraph.tsx`, reporting pages).

## Security & Architecture (2–4 weeks)

- Review and tighten `firestore.rules` to enforce multi-tenant (companies/{companyId}/...) access.
- Move privileged operations (user invites, company creation) into Cloud Functions. Review `functions/lib/index.js` and ensure UI calls these functions rather than performing privileged client writes.
- Audit auth claims and permissions wiring (custom claims for companyId/role). Files: functions entrypoints and `src/context/auth-context.tsx`.

## Testing & CI (1–2 weeks)

- Add GitHub Actions workflow to run: install, lint, type-check, test (unit), build.
- Add unit tests for helpers (pdfGenerator, invoice counter, firestore mappers).

## Performance & UX

- Lazy-load large images and charts; add useMemo/useCallback where appropriate.
- Improve print/QR flows (print CSS, stability across browsers).

Files & symbols to inspect first (high ROI)

- `src/Components/PaymentDrawer.tsx` — payment distribution logic, handlers, types.
- `src/store/api.ts` — central data layer; implement typed endpoints.
- `functions/lib/index.js` — server-side privileged operations (invite/register flows).
- `src/constants/models.ts` — canonical types and models.
- `src/Pages/Master/UserAdd.tsx` — invites and privileged user creation flows.
- `eslint.config.js` / `eslint.txt` — lint rule adjustments and immediate errors.

Sample CI (put under `.github/workflows/ci.yml`):

```yaml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Use Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm test --if-present
      - run: npm run build
```

Actionable tasks (small, reviewable PRs)

1. Type-check & lint cleanup: run `npm run lint` and `npm run type-check`, fix top 20 errors. (1–3 days)
2. Add CI workflow and ensure it passes. (0.5–1 day)
3. Add typed Firestore mappers + basic unit tests for mappers. (2–3 days)
4. Move invite/company creation to Cloud Functions and update client calls. (2–5 days)
5. Introduce RTK Query endpoints and migrate one page. (3–5 days)

Estimates & owners

- Each task above includes a rough estimate in days; split into smaller PRs of <200 LOC when possible.

Next steps (immediate)

1. Commit `plan.md` (done).
2. Open a PR with this plan and a checklist linking to the above tasks.
3. Start work on the top-priority task: run lint/type-check locally and fix the highest-severity errors.

Notes & assumptions

- If you prefer a different data layer than RTK Query, treat step (RTK Query) as 'introduce a typed service layer'.
- Some changes (Cloud Functions, rules) require Firebase project access and admin credentials.

Contact & context

- Repository root: this file `plan.md`.
- If you'd like, I can create the CI workflow file and open the first PR that adds CI + runs lint/type-check.

Completion summary

- This file captures the recommended short/mid/long-term improvements, sample CI, and next actionable steps. Use it as the single-source plan for splitting into small PRs.

## Deduplication & common components (high ROI)

What I found (revised)

- `src/Components/ui` contains shadcn-derived UI primitives (Radix + Tailwind + cva patterns) that are the canonical building blocks for the app's design system.
- Several `src/Components/*` files (for example `CustomButton.tsx`, `CustomCard.tsx`, and `CustomToggle.tsx`) are thin wrappers built on top of the shadcn primitives. They typically:
  - Map an internal `Variant` enum or app-specific props to the shadcn `buttonVariants`/`toggleVariants`.
  - Apply a small set of app-specific class overrides (spacing, sizing) and forward all other props.
- In other words: DRY is largely followed — the app has a canonical `ui` layer and small compatibility/adapter components on top of it.

Implication

- Because wrappers are already thin and intentional, the recommended approach is conservative: favor standardizing and documenting the wrapper pattern rather than wholesale removal.

Updated suggested actions (lower-risk)

1. Keep `src/Components/ui` as the canonical primitives (shadcn-derived).
2. Formalize thin wrappers (like `CustomButton`) as adapter components that:

- Live under `src/Components/wrappers/` or continue in `src/Components/` but include a brief comment linking to the canonical primitive.
- Contain a single mapping function that maps legacy `Variant` enums to `buttonVariants` (or `toggleVariants`).
- Re-export the primitive's props (use VariantProps<typeof buttonVariants> + React.ButtonHTMLAttributes) to get proper typing.
- Example: `CustomButton` should import `buttonVariants` and `Button` from `ui/button.tsx`, map the app `Variant` to `variant` and pass through className via `cn`.
- Benefit: minimal churn across pages; easier to remove wrappers later if desired.

3. Remove small, accidental duplications:

- Replace local `const cn = ...` helpers with `import { cn } from 'src/lib/utils'`.
- Standardize any ad-hoc size/spacing tokens into the `ui` primitives or a design-tokens file.

4. Centralize mappings and types

- Create a small mapping file `src/Components/wrappers/mappings.ts` that exports functions like `mapAppButtonVariant(appVariant: Variant): VariantProps<typeof buttonVariants>['variant']` so all wrappers share the same mapping logic.

5. Keep `ReusableDropdown` as a typed convenience wrapper that composes `ui/dropdown-menu.tsx` primitives (fine to keep as-is; ensure it imports `cn` and Button from `ui/button`).

Checklist (revised)

- [ ] Add short comments in each wrapper explaining it is an adapter over shadcn primitives.
- [ ] Move or create shared mapping helpers in `src/Components/wrappers/mappings.ts`.
- [ ] Replace local `cn` with `src/lib/utils` imports across wrappers.
- [ ] Add a small test for `mapAppButtonVariant` or a snapshot test for `CustomButton`.

Estimated effort (revised)

- 1–3 days to formalize wrappers, centralize mappings, and remove small helper duplications. Less risky and delivers quick consistency wins.

Notes

- This conservative approach preserves the current, DRY architecture (shadcn primitives + thin adapters) while reducing accidental duplication and improving typing.
- If you want a more aggressive cleanup (remove wrappers and migrate all pages to primitives), we can schedule that as a follow-up with a migration plan that targets small PRs.

```

```
````
