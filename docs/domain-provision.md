````markdown
# Domain Provisioning for Catalogue (Firebase + GoDaddy)

This document explains options and step-by-step instructions to provision subdomains or custom domains for customer catalogues hosted on Firebase Hosting, with DNS managed on GoDaddy. It covers:

- recommended approaches (wildcard vs per-customer custom domains)
- manual GoDaddy DNS steps for both subdomains and apex domains
- Firebase Hosting configuration notes
- Firestore security considerations
- app-level changes (runtime host -> company resolution)
- optional automation ideas (Firebase Hosting API + GoDaddy API)

> Assumptions
>
> - Your app is hosted on Firebase Hosting.
> - DNS for the domain is managed at GoDaddy.
> - Company metadata is stored in Firestore under `companies/{companyId}`.

---

## 1. Recommended approaches

Option A (Recommended): Wildcard subdomain

- Use a wildcard host (\*.yourdomain.com) in Firebase Hosting.
- Advantages: no per-customer DNS changes. Fast, scalable, and SSL provisioning is automatic for all subdomains.
- Good when you control the parent domain (yourdomain.com).

Option B: Per-customer custom domain (customer-controlled)

- Each customer points their custom domain (e.g., store.example.com or example-store.com) to your Firebase-hosted site.
- Requires per-domain verification and DNS changes for each customer.
- Use when customers require their own branded domain.

## 2. Firebase Hosting: wildcard setup (high level)

1. In Firebase Console -> Hosting -> Add custom domain.
2. Enter the wildcard domain: `*.yourdomain.com` (or `*.catalogue.yourdomain.com`).
3. Firebase shows DNS verification records (usually one or more TXT records and a CNAME or A records).
4. In GoDaddy, add the records exactly as shown (see Section 3 for GoDaddy steps).
5. After verification Firebase will provision a wildcard SSL cert and your wildcard subdomains will route to the same hosting site.

Note: Firebase may require an initial verification on the apex domain too (yourdomain.com) depending on configuration.

## 3. Manual DNS steps on GoDaddy

(When Firebase provides you the DNS entries to add)

A. Subdomain (example: `acme.yourdomain.com`)

1. Go to your GoDaddy Domain Manager and open DNS for `yourdomain.com`.
2. Add TXT record (if Firebase provided a TXT verification token):
   - Type: TXT
   - Name/Host: (as given by Firebase, often `@` or a specific host)
   - Value: (token from Firebase)
   - TTL: default (1 hour)
3. Add CNAME record for the subdomain (Firebase typically instructs this):
   - Type: CNAME
   - Name/Host: `acme` (the subdomain label)
   - Value/Points to: `ghs.googlehosted.com` (or the value provided by Firebase)
4. Wait for DNS to propagate and for Firebase to validate the domain in the Console.

B. Wildcard subdomain (`*.yourdomain.com`)

1. Add TXT record(s) as directed by Firebase for domain verification.
2. Add CNAME with host `*` to the target provided (or follow Firebase instructions). Some registrars require special handling for wildcard records—GoDaddy supports CNAME for subdomains but not for the root. Firebase will guide exact records to add.
3. Wait for verification and SSL provisioning.

C. Apex domain (root domain: `yourdomain.com`)

1. Add TXT verification record per Firebase console.
2. Add A records as specified by Firebase (e.g. `199.36.158.100` or other IPs).
3. Wait for verification and SSL provisioning.

DNS propagation: allow up to 24-48 hours in worst cases but often completes in minutes to a few hours.

## 4. Firestore security rule considerations

If you host per-company catalogues, ensure public catalogue reads obey your security model.

Example rules excerpt (tenant model: `companies/{companyId}/*`):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /companies/{companyId} {
      // allow catalogue pages to be readable if the company opted-in
      allow read: if resource.data.publicCatalog == true;

      match /items/{itemId} {
        allow read: if get(/databases/$(database)/documents/companies/$(companyId)).data.publicCatalog == true;
      }

      // orders and other sensitive collections should remain protected
      match /customerOrders/{orderId} {
        allow read, write: if request.auth != null && request.auth.token.companyId == companyId;
      }
    }
  }
}
```

If you choose to leave data in a top-level `customerOrders` collection, add explicit rules to allow company-member-only access (but prefer per-company subcollection pattern).

## 5. App changes — resolve host -> companyId at runtime

When a visitor opens `acme.yourdomain.com` or `customdomain.com`, the app should:

1. Inspect `window.location.hostname`.
2. Try to resolve the host to a company doc in Firestore (first by exact `customDomain`, then by subdomain slug lookup).
3. If a mapping is found, fetch company items using that `companyId`.
4. Fallback: keep existing `/catalogue/:companyId` route for explicit links.

Example helper (`src/lib/CompaniesFirebase.ts`):

```ts
import { db } from './firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

export async function getCompanyByHost(host: string) {
  if (!host) return null;
  // 1) check exact customDomain
  const q1 = query(
    collection(db, 'companies'),
    where('customDomain', '==', host),
    limit(1),
  );
  let snap = await getDocs(q1);
  if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };

  // 2) fallback: subdomain slug (acme.yourdomain.com -> slug = acme)
  const parts = host.split('.');
  if (parts.length > 2) {
    const slug = parts[0];
    const q2 = query(
      collection(db, 'companies'),
      where('slug', '==', slug),
      limit(1),
    );
    snap = await getDocs(q2);
    if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
  }

  return null;
}
```

Update `src/Catalogue/SharedCatalouge.tsx` (on mount) to call `getCompanyByHost(window.location.hostname)` when `companyId` param is absent.

## 6. Admin UI: provision subdomain or custom domain

Create an admin page where company admins can:

- Set `slug` (subdomain label) — app uses `slug.yourdomain.com`.
- Enter `customDomain` (optional), e.g., `store.example.com` or `store.com`.
- Start provisioning flow: write `customDomain` + set `domainStatus: 'pending'`.
- Show DNS records/instructions for the user to add to GoDaddy (TXT + CNAME/A as provided by Firebase console).
- After the customer adds DNS, admin can click "Validate" which calls Firebase Hosting API to check verification status. On success set `domainStatus: 'active'`.

DB schema suggestion (company doc):

```json
{
  "slug": "acme",
  "customDomain": "store.acme.com", // optional
  "domainStatus": "pending|verified|active|failed",
  "publicCatalog": true
}
```

## 7. Optional automation (advanced)

If customers give DNS API access (rare), you can automate provisioning fully:

- Use Firebase Hosting REST API to add domains and get verification tokens.
- Use GoDaddy API to programmatically create TXT/CNAME/A records.
- Poll Firebase Hosting API until the domain is verified.
- Security: store GoDaddy API keys securely (Vault/Secret Manager) and only do this with customer consent.

A sample flow:

1. Admin triggers provision -> your backend calls Firebase Hosting API to `create a domain` and receives verification records.
2. Backend uses customer's DNS API (or your own DNS if controlling the domain) to add the records.
3. Poll Firebase API until domain is `connected`.
4. Mark company doc `domainStatus: 'active'`.

## 8. Debugging & verification tips

- Use `dig` or `nslookup` to verify TXT/CNAME/A records from outside your network.
- Firebase console shows verification progress and errors.
- For wildcard certs expect a short wait after verification.

Commands:

```bash
# Check DNS
dig TXT _acme.yourdomain.com +short
dig CNAME acme.yourdomain.com +short

# Check exact host resolution
curl -v https://acme.yourdomain.com
```

## 9. Rollback & safety

- If a domain verification fails, remove the partially-created domain in Firebase Console and revert `domainStatus` in Firestore.
- Keep DNS TTLs reasonably small for testing (e.g., 1 hour) to speed up iteration.

## 10. Example: minimal code changes for SharedCatalogue

See Section 5 for `getCompanyByHost`. In `SharedCatalouge.tsx`:

- prefer the `route param companyId` when present
- else call `getCompanyByHost(window.location.hostname)` and use the returned company id

---

If you want I can:

- Add the `src/lib/CompaniesFirebase.ts` helper and update `SharedCatalouge.tsx` now.
- Add a simple admin page to set `slug` and `customDomain` and to show Firebase DNS instructions (placeholder UI).
- Draft a Cloud Function or server-side snippet showing how to call Firebase Hosting API for automation.

Which of the above would you like me to implement next?
````
