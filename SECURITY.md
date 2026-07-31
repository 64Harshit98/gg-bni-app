# Security notes

## Environment variables & the `VITE_` prefix

Vite inlines every `VITE_`-prefixed variable **that is referenced in frontend
code** into the public JavaScript bundle. Treat `VITE_*` as public. Secrets must
not carry a `VITE_` prefix and must only be read by backend code (Firebase
Functions / the Express server) via `process.env`, behind a server-side proxy.

## Payment / e-invoice credentials (ICICI, Eway) — corrected assessment

An earlier review flagged `VITE_ICICI_SECRET_KEY`, `VITE_EWAY_API_KEY`, etc. as
"exposed in the client bundle." On closer inspection that was **not** the case:

- These variables are **not referenced anywhere** in `src/`, `functions/`, or
  the Express server, so Vite never inlined them — they were **not** in the
  shipped bundle.
- `.env` is git-ignored and these values were **never committed** to git history.

They were still a **latent footgun**: the `VITE_` prefix meant the moment any
frontend file referenced one, it would be silently bundled. Remediation applied:

- The keys were renamed to drop the `VITE_` prefix (`ICICI_SECRET_KEY`, etc.).
- When the ICICI/Eway integration is built, call it **server-side only** from a
  Firebase Function, reading the keys via `process.env` / Functions secrets.

No key rotation is required (the values were never exposed or committed). Rotate
only if `.env`/`.env.bak` was ever shared outside the team.

## WhatsApp partner UID (BotMasterSender) — real, current exposure

`src/Pages/Additional/Whatsapp/WhatsappApi.ts` calls the BotMasterSender API
directly from the browser and reads `VITE_BMS_PARTNER_UID` — which **is** compiled
into the public bundle. The base URLs are the public API host (not sensitive);
the partner UID is the sensitive value (it authorises account/user registration).

A pass-through `botmasterProxy` Cloud Function already exists
(`functions` → `botmasterProxy`) but the frontend bypasses it, and as written it
only relays the request body (it does not inject the UID).

### Remediation — implemented (staged, non-breaking)

A dedicated Cloud Function `botmasterRegister` (in `functions/lib/index.js`)
injects the partner UID server-side. The client (`WhatsappApi.ts` → `registerUser`)
posts the registration payload WITHOUT the UID when a proxy URL is configured,
and falls back to the legacy direct call otherwise — so **nothing breaks before
cutover**. Only the `register` action ever needed the UID; the other calls use
per-user tokens and are unchanged.

`botmasterRegister` reads `BMS_PARTNER_UID` and `BMS_BASE_URL` from the server
environment (no values are hard-coded), so it works with your real BMS base URL.

> NOTE: `functions/lib/index.js` is the compiled/deployed artifact in this repo
> (no TS source is present here, and `firebase.json` runs `tsc` on predeploy). If
> you maintain the Functions TypeScript source elsewhere, port `botmasterRegister`
> into it before deploying.

### Cutover runbook
1. Set the Functions secrets:
   `firebase functions:secrets:set BMS_PARTNER_UID`
   `firebase functions:secrets:set BMS_BASE_URL`   (your real BMS base, e.g. https://api.botmastersender.com/api)
2. Deploy: `firebase deploy --only functions:botmasterRegister`
3. Set the client var to the deployed URL and rebuild the app:
   `VITE_BMS_REGISTER_PROXY_URL=https://<region>-<project>.cloudfunctions.net/botmasterRegister`
4. Verify signup/business-info registration works end to end.
5. Once verified, delete `VITE_BMS_PARTNER_UID` from `.env` and remove the legacy
   fallback branch in `registerUser` — the partner UID is then fully off the client.
