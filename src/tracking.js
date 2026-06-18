// ----------------------------------------------------------------------------
// ATTRIBUTION + PAYLOAD + ABUSE SIGNALS
//
// Captures gclid, all UTMs, common click IDs, the GA client id (from the _ga
// cookie), the HubSpot tracking cookie, device context, and a persistent lead
// UUID. First-touch strategy: the first values seen in the session are stored
// in a cookie and reused, so a lead who lands via an ad and converts on a later
// page still carries the original gclid.
//
// PRIVACY: the cookie below stores ONLY marketing attribution (click ids, UTMs,
// landing page, referrer) and a random UUID. It never stores name, email, or
// phone. PII exists only in memory for the moment of submission and is sent
// directly to your webhook over TLS.
// ----------------------------------------------------------------------------

export const FORM_VERSION = '2.0.0'

const ATTR_COOKIE = 'ohl_attr'
const ATTR_DAYS = 90

const TRACK_PARAMS = [
  'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid', 'li_fat_id', 'epik', 'irclickid',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id'
]

function getCookie(name) {
  const m = ('; ' + document.cookie).split('; ' + name + '=')
  if (m.length === 2) return decodeURIComponent(m.pop().split(';').shift())
  return ''
}
function setCookie(name, value, days) {
  const d = new Date()
  d.setTime(d.getTime() + days * 86400000)
  const secure = (typeof location !== 'undefined' && location.protocol === 'https:') ? ';Secure' : ''
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/;SameSite=Lax${secure}`
}
function makeUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
function gaClientId() {
  const ga = getCookie('_ga')
  if (!ga) return ''
  const p = ga.split('.')
  return p.length >= 4 ? p[2] + '.' + p[3] : ''
}

// Module level store, loaded once and persisted in a cookie.
let store = {}
try { store = JSON.parse(getCookie(ATTR_COOKIE) || '{}') } catch { store = {} }
if (!store.first) store.first = {}

export function captureAttribution() {
  const params = new URLSearchParams(window.location.search)
  let dirty = false
  TRACK_PARAMS.forEach((p) => {
    const v = params.get(p)
    if (v && !store.first[p]) { store.first[p] = v; dirty = true }
  })
  if (!store.landingPage) { store.landingPage = window.location.href; dirty = true }
  if (!store.referrer) { store.referrer = document.referrer || ''; dirty = true }
  if (!store.leadUuid) { store.leadUuid = makeUuid(); dirty = true }
  if (dirty) setCookie(ATTR_COOKIE, JSON.stringify(store), ATTR_DAYS)
}

export function getLeadUuid() {
  return store.leadUuid
}

function camel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

export function buildTracking() {
  const params = new URLSearchParams(window.location.search)
  const t = {}
  TRACK_PARAMS.forEach((p) => {
    t[camel(p)] = store.first[p] || params.get(p) || ''
  })
  t.gaClientId = gaClientId()
  t.hubspotutk = getCookie('hubspotutk')
  t.leadUuid = store.leadUuid
  t.referrer = store.referrer || ''
  t.landingPage = store.landingPage || ''   // first touch URL
  t.submitPage = window.location.href        // page the form was submitted from
  t.userAgent = navigator.userAgent
  t.language = navigator.language || ''
  t.timezone = (window.Intl && Intl.DateTimeFormat) ? Intl.DateTimeFormat().resolvedOptions().timeZone : ''
  t.screen = window.screen ? `${window.screen.width}x${window.screen.height}` : ''
  t.viewport = (window.innerWidth && window.innerHeight) ? `${window.innerWidth}x${window.innerHeight}` : ''
  return t
}

// ---- Abuse signals -----------------------------------------------------------
// Pure function (no DOM), so it is unit-testable. A submission is flagged when
// the hidden honeypot was filled (only a bot sees it) or the form was completed
// implausibly fast. The flags travel in the payload; your n8n flow decides what
// to do (drop, queue for review, etc.).
export function evaluateSubmission({ startedAt, now = Date.now(), honeypotValue = '', minMs = 2500 }) {
  const elapsedMs = Math.max(0, now - (startedAt || now))
  const honeypotTriggered = !!(honeypotValue && String(honeypotValue).trim())
  const tooFast = elapsedMs < minMs
  return { elapsedMs, honeypotTriggered, tooFast, suspectedBot: honeypotTriggered || tooFast }
}

// Shapes the final JSON. Sections map cleanly onto your n8n branches:
// contact + loan -> Velocify LeadAdd, consents -> TCPA / credit fields,
// tracking -> Velocify hidden fields + HubSpot properties, meta -> spam routing.
export function buildPayload(answers, consentMeta, meta) {
  const c = answers.contact || {}
  const cm = consentMeta || {}
  const m = meta || {}
  return {
    leadUuid: store.leadUuid,                 // idempotency key for dedupe in n8n
    submittedAt: new Date().toISOString(),
    source: 'oxford-web-form',
    formVersion: FORM_VERSION,
    contact: {
      firstName: c.firstName || '',
      lastName: c.lastName || '',
      email: c.email || '',
      phone: c.phone || '',
      preferredContact: answers.preferred_contact || ''
    },
    loan: {
      intent: answers.intent || '',
      veteran: answers.veteran || '',
      // purchase path
      purchaseState: answers.purchase_state || '',
      willOccupy: answers.will_occupy || '',
      purchasePrice: answers.purchase_price || '',
      purchaseProcess: answers.purchase_process || '',
      workingWithRealtor: answers.realtor || '',
      // current property path
      currentAddress: answers.current_address || null,
      primaryResidence: answers.primary_residence || '',
      estimatedLoanAmount: answers.loan_amount || '',
      // shared
      employmentStatus: answers.employment || '',
      householdIncome: answers.income || '',
      creditCategory: answers.credit || ''
    },
    consents: {
      creditAuthorization: {
        granted: answers.credit_auth === 'Yes',
        timestamp: (cm.credit_auth && cm.credit_auth.timestamp) || null,
        text: (cm.credit_auth && cm.credit_auth.text) || null
      },
      tcpa: {
        granted: answers.tcpa === 'Yes',
        timestamp: (cm.tcpa && cm.tcpa.timestamp) || null,
        text: (cm.tcpa && cm.tcpa.text) || null
      }
    },
    meta: {
      formStartedAt: m.formStartedAt || null,
      elapsedMs: typeof m.elapsedMs === 'number' ? m.elapsedMs : null,
      honeypotTriggered: !!m.honeypotTriggered,
      suspectedBot: !!m.suspectedBot
    },
    tracking: buildTracking()
  }
}
