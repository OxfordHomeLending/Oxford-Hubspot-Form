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

export const FORM_VERSION = '3.0.0-3stage'

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
// Capitalize names for clean CRM data.
function capName(s) {
  return (s || '').toLowerCase().replace(/\b([a-z])/g, (m, ch) => ch.toUpperCase())
}

const STAGE_LABEL = { 1: 'Exploring (Stage 1)', 2: 'Pre-qualified (Stage 2)', 3: 'Full application (Stage 3)' }

// Shapes the final JSON. leadStage marks how far the person progressed, so n8n
// can grade quality (1 = low / searching, 2 = mid / pre-qual, 3 = best / full
// application). Sections map onto your downstream branches.
export function buildPayload(answers, consentMeta, meta) {
  const c = answers.contact || {}
  const cm = consentMeta || {}
  const m = meta || {}
  const stage = m.leadStage || 1
  return {
    leadUuid: store.leadUuid,                 // idempotency key for dedupe / enrichment in n8n
    submittedAt: new Date().toISOString(),
    source: 'oxford-web-form',
    formVersion: FORM_VERSION,
    leadStage: stage,
    leadStageLabel: STAGE_LABEL[stage] || STAGE_LABEL[1],
    contact: {
      firstName: capName(c.firstName),
      lastName: capName(c.lastName),
      email: (c.email || '').trim(),
      phone: c.phone || ''
    },
    loan: {
      goal: answers.loan_goal || '',
      propertyState: answers.property_state || '',
      estimatedHomeValue: answers.home_value || '',
      estimatedLoanAmount: answers.loan_amount || '',
      creditCategory: answers.credit || '',
      // stage 2
      propertyAddress: answers.property_address || null,
      propertyType: answers.property_type || '',
      occupancy: answers.occupancy || '',
      ownsMultipleProperties: answers.own_multiple || '',
      secondLiens: answers.second_liens || '',
      currentInterestRate: answers.current_rate || '',
      propertyAcquired: answers.when_acquired || '',
      incomeSource: answers.income_source || '',
      monthlyIncome: answers.monthly_income || '',
      // stage 3
      timeAtResidence: answers.time_at_residence || '',
      incomeSourceDuration: answers.income_duration || '',
      liquidAssets: answers.liquid_assets || '',
      veteran: answers.veteran || ''
    },
    borrower: {
      maritalStatus: answers.marital_status || '',
      coBorrower: answers.co_borrower || '',
      birthPlace: answers.birth_place || '',
      dateOfBirth: answers.date_of_birth || '',
      ssn: answers.ssn || ''
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
      leadStage: stage,
      formStartedAt: m.formStartedAt || null,
      elapsedMs: typeof m.elapsedMs === 'number' ? m.elapsedMs : null,
      honeypotTriggered: !!m.honeypotTriggered,
      suspectedBot: !!m.suspectedBot
    },
    tracking: buildTracking()
  }
}
