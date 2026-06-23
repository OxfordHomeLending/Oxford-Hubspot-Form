// ----------------------------------------------------------------------------
// SAVE AND RESUME (memory across the 3-stage funnel)
// Persists answers to the browser so a returning visitor picks up where they
// left off. Guardrails:
//   1. Truly sensitive identity fields (SSN, date of birth) are NEVER stored.
//   2. The consent checkboxes are never restored, so consent is always a fresh
//      action in the current session.
// On resume we walk the flow to the first unanswered question, which naturally
// re-collects any excluded field (and re-affirms consent) rather than skipping
// it. Everything auto-expires after 24 hours and is cleared on final submit.
// All storage access is wrapped in try/catch.
// ----------------------------------------------------------------------------
import { NODES, isVisible } from './flow.js'
import { FORM_VERSION } from './tracking.js'

const STORE_KEY = 'ohl_form_progress'
const TTL_MS = 24 * 60 * 60 * 1000
// Never persisted: sensitive identity fields + the two consents.
const EXCLUDED = ['date_of_birth', 'ssn', 'credit_auth', 'tcpa']

function hasAnswer(node, answers) {
  const a = answers || {}
  switch (node.type) {
    case 'firstname': return !!(a.contact && a.contact.firstName)
    case 'reach': return !!(a.contact && a.contact.lastName && a.contact.email && a.contact.phone)
    case 'address': { const ad = a[node.key]; return !!(ad && ad.street && ad.city && ad.state && ad.zip) }
    case 'consent': return a[node.key] === 'Yes'
    default: return node.key ? !!a[node.key] : true
  }
}

// First unanswered visible question (milestones are skipped). Returns its index
// plus the navigation history to reach it (for the Back button).
function computeResume(answers) {
  const history = []
  for (let i = 0; i < NODES.length; i++) {
    const node = NODES[i]
    if (!isVisible(node, answers)) continue
    if (node.type !== 'milestone' && !hasAnswer(node, answers)) {
      return { index: i, history }
    }
    history.push(i)
  }
  return { index: Math.max(0, NODES.length - 1), history: history.slice(0, -1) }
}

export function loadProgress() {
  const empty = { answers: {}, index: 0, history: [] }
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (!raw) return empty
    const data = JSON.parse(raw)
    if (!data || !data.savedAt || (Date.now() - data.savedAt) > TTL_MS || data.version !== FORM_VERSION) {
      window.localStorage.removeItem(STORE_KEY)
      return empty
    }
    const answers = data.answers || {}
    if (!answers.loan_goal) return empty
    const { index, history } = computeResume(answers)
    return { answers, index, history }
  } catch (e) {
    return empty
  }
}

export function saveProgress(answers) {
  try {
    if (!answers || !answers.loan_goal) return
    const toSave = { ...answers }
    EXCLUDED.forEach((k) => { delete toSave[k] })
    window.localStorage.setItem(STORE_KEY, JSON.stringify({
      savedAt: Date.now(), version: FORM_VERSION, answers: toSave
    }))
  } catch (e) { /* storage unavailable or full: skip silently */ }
}

export function clearProgress() {
  try { window.localStorage.removeItem(STORE_KEY) } catch (e) { /* ignore */ }
}