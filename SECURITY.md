# Security and data handling

This document describes how the mortgage lead form handles data, for engineering
review and for compliance sign-off. The form is a static front end; it has no
server of its own and no database. It collects applicant input and transmits it
once, over HTTPS, to an n8n webhook.

## Data collected

The form collects applicant-provided data across three stages. Sensitivity rises
with stage:

- **Contact and intent** (stage 1): name, email, phone, property state, estimated
  value and loan amount as ranges, credit self-rating.
- **Property and income** (stage 2): address, property type, occupancy, income
  source and monthly income as ranges.
- **Identity and full application** (stage 3): marital status, co-borrower, veteran
  status, birthplace, date of birth, and Social Security number.

Date of birth and Social Security number are the most sensitive fields and are
treated accordingly below.

## In transit

All traffic is HTTPS. The production site is served over TLS by Vercel, and the
form posts to the n8n webhook over TLS (`https://n8n.oxfordhomelending.com`). The
`Strict-Transport-Security` header is set so browsers refuse to connect over HTTP.

## At rest

- **In this application:** none of the sensitive fields are persisted server-side,
  because the form has no server.
- **Browser save and resume:** to let a visitor return to a partial form, answers
  are saved to the browser's local storage with a 24-hour expiry. Social Security
  number, date of birth, and both consent checkboxes are never written to storage.
  On return, those fields are always re-collected and consent is always re-affirmed.
  Storage is cleared on final submission.
- **Downstream systems:** once the payload leaves the form it is handled by the n8n
  pipeline and its destinations, which are governed separately under the company's
  data program.

## No PII in logs

Payload logging is gated behind a development-only flag and is disabled in any
production build (Vite sets the dev flag to false during `npm run build`). No
applicant data is written to the browser console in production, and there is no
third-party analytics or error-reporting SDK embedded in the form.

## Security headers

`vercel.json` sets, for every response:

- `Content-Security-Policy` restricting scripts, styles, fonts, images, and network
  connections to known origins, and blocking framing entirely.
- `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` so the form (which
  collects an SSN) cannot be embedded or clickjacked by another site.
- `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, and a restrictive `Permissions-Policy`.

The Content-Security-Policy is strict. When changing fonts, the webhook origin, or
adding any external resource, update the policy. It is good practice to first
deploy a change as `Content-Security-Policy-Report-Only`, confirm nothing breaks,
then enforce.

## Abuse prevention

- A hidden honeypot field that real users never see. If it is filled, the
  submission is dropped silently.
- A timing check that flags submissions completed implausibly fast.
- An optional shared-secret header (`VITE_FORM_TOKEN`) so the n8n webhook can reject
  posts that did not originate from the form.

## Consent capture

When a visitor agrees to the TCPA or credit-pull disclosures, the form records the
exact disclosure text shown and a timestamp, and includes both in the payload. This
provides a contemporaneous record of what was consented to and when.

## Dependencies

Runtime dependencies are limited to React and React DOM. Run `npm audit` as part of
review and enable automated dependency updates (for example Dependabot) on the
repository. The build produces hashed, immutable static assets.

## Known items before launch

- The phone number in the TCPA and credit-authorization disclosures must be set to a
  valid, monitored revocation number before the form collects live consents. It is a
  single constant (`CONTACT_PHONE`) in `src/flow.js`.
- Confirm the deployment domain and whether the form should run on a subdomain of the
  company site for cookie continuity.

## Reporting

Report any security concern to the engineering owner of this repository rather than
filing a public issue.
