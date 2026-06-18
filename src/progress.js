// ----------------------------------------------------------------------------
// SAVE AND RESUME
// Persists in-progress answers to the browser so a returning visitor can pick
// up where they left off, instead of starting over. Two deliberate guardrails:
//   1. The sensitive financial answers (income, credit) are NEVER written to
//      disk. On resume the visitor re-enters them, so they never sit at rest.
//   2. The two consent checkboxes are never restored, so agreeing is always a
//      fresh, affirmative action in the current session.
// Saved progress auto-expires after 24 hours and is cleared on a successful
// submit. All storage access is wrapped in try/catch, so if a browser blocks
// localStorage the form simply runs without the resume feature.
// ----------------------------------------------------------------------------
import { stepById, STEPS } from './flow.js'
import { FORM_VERSION } from './tracking.js'

const STORE_KEY = 'ohl_form_progress'
const TTL_MS = 24 * 60 * 60 * 1000
// Never persisted: sensitive financials + the two consents.
const EXCLUDED = ['income', 'credit', 'credit_auth', 'tcpa']

function hasAnswer(step, answers) {
  const a = answers || {}
  switch (step.type) {
    case 'firstname': return !!(a.contact && a.contact.firstName)
    case 'reach': return !!(a.contact && a.contact.lastName && a.contact.email && a.contact.phone)
    case 'address': { const ad = a[step.key]; return !!(ad && ad.street && ad.city && ad.state && ad.zip) }
    case 'consent': return a[step.key] === 'Yes'
    default: return !!a[step.key]
  }
}

// Walk the flow from the start following the saved answers and resume at the
// first step that is not yet answered. Because income/credit/consents are never
// saved, this naturally lands the visitor back on the income step, so those
// sensitive answers are re-entered fresh rather than read from storage. History
// is rebuilt along the way so the Back button works on resume.
function computeResume(answers) {
  const history = []
  let id = 1, guard = 0
  while (id && id !== 'submit' && guard < 100) {
    const s = stepById(id)
    if (!s) break
    if (!hasAnswer(s, answers)) return { currentId: id, history }
    history.push(id)
    id = s.branch ? s.branch(answers) : s.next
    guard++
  }
  const last = STEPS[STEPS.length - 1]
  return { currentId: last.id, history: history.slice(0, -1) }
}

export function loadProgress() {
  const empty = { answers: {}, currentId: 1, history: [] }
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (!raw) return empty
    const data = JSON.parse(raw)
    if (!data || !data.savedAt || (Date.now() - data.savedAt) > TTL_MS || data.version !== FORM_VERSION) {
      window.localStorage.removeItem(STORE_KEY)
      return empty
    }
    const answers = data.answers || {}
    if (!answers.intent) return empty
    const { currentId, history } = computeResume(answers)
    return { answers, currentId, history }
  } catch (e) {
    return empty
  }
}

export function saveProgress(answers) {
  try {
    if (!answers || !answers.intent) return
    const toSave = { ...answers }
    EXCLUDED.forEach((k) => { delete toSave[k] })
    window.localStorage.setItem(STORE_KEY, JSON.stringify({
      savedAt: Date.now(), version: FORM_VERSION, answers: toSave
    }))
  } catch (e) {
    // storage unavailable or full: skip silently
  }
}

export function clearProgress() {
  try { window.localStorage.removeItem(STORE_KEY) } catch (e) { /* ignore */ }
}
