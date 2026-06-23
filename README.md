# Oxford Home Lending mortgage lead form

A standalone, full-page progressive intake form for mortgage leads. It guides a
visitor through three stages of increasing detail and posts a clean JSON payload
to an n8n webhook at each stage boundary, so a lead is captured even if the
visitor stops early.

Built with React and Vite. No backend in this repo: the form is a static bundle
served from Vercel that talks to an n8n webhook over HTTPS.

## How it works

The form is a three-stage funnel:

1. **Quick Start** (lowest barrier): goal, name, state, value, loan amount, credit,
   contact, and TCPA consent. A lead fires here.
2. **Your Details**: property and income detail plus credit-pull authorization. An
   enriched lead fires here.
3. **Full Application**: the remainder of a standard 1003. The full lead fires here.

Each stage ends in a milestone screen where the visitor can stop (and be contacted)
or continue. A per-stage progress bar fills to each milestone, and the payload
carries `leadStage` (1, 2, or 3) so downstream systems can grade lead quality.

For the end-to-end data flow and the safeguards at each hop, see the architecture
diagram referenced in `SECURITY.md`.

## Tech stack

- React 18 with the automatic JSX runtime
- Vite 5 for dev server and production build
- No UI framework: hand-written CSS in `src/styles.css`, sized in rem
- Zero runtime dependencies beyond React

## Project structure

```
src/
  main.jsx          App entry, mounts <App> into #root
  App.jsx           Thin wrapper around the form
  MortgageForm.jsx  Orchestrator: navigation, stages, milestones, submission
  Step.jsx          Renders each question type (text, select, date, ssn, consent, ...)
  flow.js           The form definition: stages, questions, milestones, copy
  tracking.js       Attribution capture and the outbound payload builder
  progress.js       Save and resume (sensitive fields excluded from storage)
  personalize.js    Resolves dynamic copy (greeting by name, etc.)
  styles.css        Full immersive layout, rem based
  assets/           Logos and the eagle mark (imported, hashed by Vite)
test/
  run-tests.mjs     Node test harness (flow, payload, progress, bot detection)
index.html          HTML shell, font links, #root
vite.config.js      Build config
vercel.json         Security headers (CSP, HSTS, frame protection, ...)
```

## Getting started

Requires Node 18.18 or newer (see `.nvmrc`).

```bash
npm install        # install dependencies
npm run dev        # local dev server at http://localhost:5173
npm test           # run the test harness (should report 53 / 53)
npm run lint       # ESLint
npm run format     # Prettier (writes), or npm run format:check
npm run build      # production build to dist/
npm run preview    # serve the production build locally
```

## Environment variables

Copy `.env.example` to `.env` for local development. All build-time vars use the
`VITE_` prefix and are inlined at build time.

| Variable | Required | Purpose |
|---|---|---|
| `VITE_N8N_WEBHOOK_URL` | yes | The n8n webhook the form posts to |
| `VITE_REDIRECT_URL` | no | If set, the browser redirects here after submit |
| `VITE_FORM_TOKEN` | no | Shared secret sent as a header so n8n can reject direct posts |

In Vercel, set these under Project Settings, Environment Variables. Do not mark
`VITE_N8N_WEBHOOK_URL` as a Sensitive variable, because a `VITE_` value must be
readable at build time.

## Security

See `SECURITY.md` for the full posture. In short: HTTPS only, no PII written to
logs in production, browser save-and-resume excludes SSN, date of birth, and
consents, security headers are set in `vercel.json`, and the form includes
honeypot and timing-based bot rejection. The form collects sensitive applicant
data, so treat the deployment as in-scope for the company's GLBA program.

## Deployment

Vercel builds and deploys automatically on every push to `main`. The build
command is `npm run build` and the output directory is `dist`. Security headers
are applied from `vercel.json`.

## Browser support

Modern evergreen browsers (Chrome, Edge, Firefox, Safari) on desktop and mobile.
Uses native date inputs and standard form controls.
