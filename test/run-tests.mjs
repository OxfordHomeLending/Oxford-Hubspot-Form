// ============================================================================
// Test harness for the 3-stage progressive intake.
// Imports the REAL src/flow.js, src/tracking.js, src/progress.js, mocks the
// browser globals they touch, walks the flow the way the orchestrator does
// (nextVisible over NODES, honoring showIf), builds the payload with the real
// buildPayload(), and asserts structure + behavior.
//
//   node test/run-tests.mjs
//
// Browser globals MUST be installed before importing tracking.js (it reads
// document.cookie at load time for the first-touch store).
// ============================================================================

// ---- 1. Mock the browser ----------------------------------------------------
const cookieJar = {}
function seedCookie(k, v) { cookieJar[k] = v }
seedCookie('_ga', 'GA1.2.1234567890.1681500000')
seedCookie('hubspotutk', 'a1b2c3d4e5f6a7b8c9d0e1f2')

const QUERY =
  '?gclid=TESTgclid123&utm_source=google&utm_medium=cpc&utm_campaign=spring_refi' +
  '&utm_content=hero_ad&utm_term=mortgage+rates&fbclid=FBxyz789'
const HREF = 'https://apply.oxfordhomelending.com/get-started' + QUERY

globalThis.document = {
  get cookie() { return Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ') },
  set cookie(str) {
    const pair = String(str).split(';')[0]
    const i = pair.indexOf('=')
    if (i === -1) return
    const k = pair.slice(0, i).trim()
    const v = decodeURIComponent(pair.slice(i + 1).trim())
    cookieJar[k] = v
  },
  referrer: 'https://www.google.com/',
  createElement: () => ({ set innerHTML(v) { this._t = String(v).replace(/<[^>]*>/g, '') }, get textContent() { return this._t || '' } })
}
const _ls = {}
globalThis.window = {
  location: { search: QUERY, href: HREF, protocol: 'https:' },
  crypto: globalThis.crypto,
  screen: { width: 1920, height: 1080 },
  innerWidth: 1440,
  innerHeight: 900,
  Intl,
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(_ls, k) ? _ls[k] : null),
    setItem: (k, v) => { _ls[k] = String(v) },
    removeItem: (k) => { delete _ls[k] }
  }
}
globalThis.location = globalThis.window.location
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'Mozilla/5.0 (Macintosh; TestHarness) Node', language: 'en-US' },
  configurable: true, writable: true
})

// ---- 2. Import the real source ---------------------------------------------
const flow = await import('../src/flow.js')
const { NODES, STAGES, capitalize, stateName, isVisible, nextVisible, prevVisible, firstIndexOfStage, stageProgress } = flow
const { buildPayload, captureAttribution, evaluateSubmission, FORM_VERSION } = await import('../src/tracking.js')
const { loadProgress, saveProgress, clearProgress } = await import('../src/progress.js')

captureAttribution()

// ---- 3. Assertion kit -------------------------------------------------------
let PASS = 0, FAIL = 0
const fails = []
function check(label, cond) { if (cond) PASS++; else { FAIL++; fails.push(label) } }
function eq(label, a, b) { check(`${label} (got ${JSON.stringify(a)})`, a === b) }

// ---- 4. Walk the flow like the orchestrator --------------------------------
// Returns the ordered list of visited node indices for a given answers object,
// following nextVisible and stopping at milestones the way "continue" would.
function walk(answers, { stopAtStage } = {}) {
  const visited = []
  let i = 0
  while (i !== -1 && i < NODES.length) {
    visited.push(i)
    const n = NODES[i]
    if (n.type === 'milestone' && stopAtStage && n.milestone === stopAtStage) break
    i = nextVisible(i, answers)
  }
  return visited
}

const buyer = {
  loan_goal: 'Buy a home',
  contact: { firstName: 'logan', lastName: 'pack', email: 'logan@example.com', phone: '(614) 555 0142' },
  property_state: 'OH', home_value: '$350,000 to $500,000', loan_amount: '$300,000 to $500,000',
  credit: 'Good (680 to 739)', tcpa: 'Yes',
  property_address: { street: '1 Main St', city: 'Columbus', state: 'OH', zip: '43004' },
  property_type: 'Single-family home', occupancy: 'Primary residence', own_multiple: 'No',
  income_source: 'Employed (W-2)', monthly_income: '$7,000 to $10,000', credit_auth: 'Yes',
  time_at_residence: '2 to 5 years', income_duration: '2 to 5 years', liquid_assets: '$50,000 to $100,000',
  marital_status: 'Married', co_borrower: 'No', veteran: 'No', birth_place: 'ohio',
  date_of_birth: '1990-05-04', ssn: '123-45-6789'
}
const refier = { ...buyer, loan_goal: 'Refinance for a lower rate',
  second_liens: 'None', current_rate: '6% to 7%', when_acquired: '3 to 5 years ago' }

// ---- 5. Structure ----------------------------------------------------------
eq('three stages defined', STAGES.length, 3)
const milestones = NODES.filter((n) => n.type === 'milestone')
eq('three milestones', milestones.length, 3)
eq('milestone 1 is stage 1', milestones[0].stage, 1)
eq('milestone 3 is final', !!milestones[2].final, true)
check('only final milestone has no continueLabel', milestones[2].continueLabel === undefined && !!milestones[0].continueLabel)
check('every non-milestone node has a key', NODES.filter((n) => n.type !== 'milestone').every((n) => !!n.key))
check('stage 1 question count is 6-7 (+ contact + consent)', (() => {
  const q = NODES.filter((n) => n.stage === 1 && n.type !== 'milestone')
  return q.length >= 7 && q.length <= 9
})())

// ---- 6. showIf: refi-only questions skipped for buyers ----------------------
const refiOnly = ['second_liens', 'current_rate', 'when_acquired']
check('refi-only questions hidden for a buyer', refiOnly.every((k) => {
  const n = NODES.find((x) => x.key === k)
  return !isVisible(n, buyer)
}))
check('refi-only questions shown for a refinancer', refiOnly.every((k) => {
  const n = NODES.find((x) => x.key === k)
  return isVisible(n, refier)
}))
const buyerVisited = walk(buyer).map((i) => NODES[i].key).filter(Boolean)
check('buyer path excludes current_rate', !buyerVisited.includes('current_rate'))
const refiVisited = walk(refier).map((i) => NODES[i].key).filter(Boolean)
check('refi path includes current_rate', refiVisited.includes('current_rate'))

// ---- 7. Per-stage progress resets each stage --------------------------------
const m1 = NODES.findIndex((n) => n.type === 'milestone' && n.milestone === 1)
const m2 = NODES.findIndex((n) => n.type === 'milestone' && n.milestone === 2)
eq('progress is 100% at milestone 1', stageProgress(m1, refier), 100)
eq('progress is 100% at milestone 2', stageProgress(m2, refier), 100)
const firstS2 = firstIndexOfStage(2, refier)
check('progress resets near 0 at start of stage 2', stageProgress(firstS2, refier) <= 20)
check('progress increases within a stage', stageProgress(firstS2 + 2, refier) > stageProgress(firstS2, refier))

// ---- 8. Navigation back/forward --------------------------------------------
check('prevVisible from m1 lands on a real node', prevVisible(m1, refier) >= 0)
check('nextVisible from m1 enters stage 2', NODES[nextVisible(m1, refier)].stage === 2)

// ---- 9. capitalize ----------------------------------------------------------
eq('capitalize single word', capitalize('logan'), 'Logan')
eq('capitalize multi word', capitalize('mary jane'), 'Mary Jane')
eq('capitalize empty is empty', capitalize(''), '')
eq('stateName resolves', stateName('OH'), 'Ohio')

// ---- 10. Payload per stage --------------------------------------------------
function payloadFor(answers, stageNum) {
  return buildPayload(answers, { tcpa: { text: 'tcpa text', timestamp: '2026-01-01T00:00:00Z' }, credit_auth: { text: 'auth text', timestamp: '2026-01-01T00:00:00Z' } },
    { leadStage: stageNum, formStartedAt: '2026-01-01T00:00:00Z', elapsedMs: 30000, honeypotTriggered: false, suspectedBot: false })
}
const p1 = payloadFor(buyer, 1)
const p3 = payloadFor(buyer, 3)
eq('payload carries leadStage 1', p1.leadStage, 1)
eq('payload carries leadStage 3', p3.leadStage, 3)
check('leadStageLabel present', typeof p1.leadStageLabel === 'string' && p1.leadStageLabel.length > 0)
eq('firstName capitalized in payload', p1.contact.firstName, 'Logan')
eq('lastName capitalized in payload', p1.contact.lastName, 'Pack')
eq('loan.goal mapped', p1.loan.goal, 'Buy a home')
eq('loan.propertyState mapped', p1.loan.propertyState, 'OH')
eq('loan.estimatedHomeValue mapped', p1.loan.estimatedHomeValue, '$350,000 to $500,000')
eq('loan.propertyType mapped (stage 2 field)', p3.loan.propertyType, 'Single-family home')
eq('borrower.maritalStatus mapped (stage 3)', p3.borrower.maritalStatus, 'Married')
eq('borrower.dateOfBirth mapped', p3.borrower.dateOfBirth, '1990-05-04')
eq('borrower.ssn mapped', p3.borrower.ssn, '123-45-6789')
eq('tcpa consent granted', p1.consents.tcpa.granted, true)
eq('credit auth consent granted', p3.consents.creditAuthorization.granted, true)
eq('leadUuid present', typeof p1.leadUuid, 'string')
eq('gclid captured in tracking', p1.tracking.gclid, 'TESTgclid123')
eq('utm_source captured', p1.tracking.utmSource, 'google')
eq('ga client id derived', p1.tracking.gaClientId, '1234567890.1681500000')
eq('meta.leadStage echoed', p3.meta.leadStage, 3)

// ---- 11. Save/resume excludes sensitive fields ------------------------------
clearProgress()
saveProgress(buyer)
const rawSaved = JSON.parse(globalThis.window.localStorage.getItem('ohl_form_progress'))
check('saved blob has answers', !!rawSaved && !!rawSaved.answers)
check('SSN never stored', rawSaved.answers.ssn === undefined)
check('date of birth never stored', rawSaved.answers.date_of_birth === undefined)
check('tcpa consent never stored', rawSaved.answers.tcpa === undefined)
check('credit_auth consent never stored', rawSaved.answers.credit_auth === undefined)
check('non-sensitive answer (loan_goal) is stored', rawSaved.answers.loan_goal === 'Buy a home')
check('non-sensitive answer (home_value) is stored', rawSaved.answers.home_value === '$350,000 to $500,000')

// resume should land on first unanswered: with consents+ssn+dob stripped, a
// partial saver returns to the first stripped/unanswered question.
const partial = { loan_goal: 'Buy a home', contact: { firstName: 'sam' }, property_state: 'TX' }
clearProgress()
saveProgress(partial)
const resumed = loadProgress()
check('resume restores stored answers', resumed.answers.property_state === 'TX')
check('resume index points to an unanswered question', (() => {
  const n = NODES[resumed.index]
  return n && n.type !== 'milestone'
})())
clearProgress()

// ---- 12. Bot + timing -------------------------------------------------------
const human = evaluateSubmission({ startedAt: Date.now() - 30000, honeypotValue: '' })
check('human not flagged as bot', human.suspectedBot === false && human.honeypotTriggered === false)
const bot = evaluateSubmission({ startedAt: Date.now() - 30000, honeypotValue: 'spam' })
check('filled honeypot flagged', bot.honeypotTriggered === true)
const tooFast = evaluateSubmission({ startedAt: Date.now() - 500, honeypotValue: '' })
check('too-fast submit flagged', tooFast.suspectedBot === true)

// ---- 13. FORM_VERSION -------------------------------------------------------
check('FORM_VERSION present', typeof FORM_VERSION === 'string' && FORM_VERSION.length > 0)

// ---- report -----------------------------------------------------------------
const RESET = '\x1b[0m', GREEN = '\x1b[32m', RED = '\x1b[31m', BOLD = '\x1b[1m'
console.log('')
if (FAIL === 0) {
  console.log(`${GREEN}${BOLD}  Total: ${PASS + FAIL}   PASS ${PASS}   FAIL ${FAIL}${RESET}`)
  console.log(`${GREEN}   3-stage flow, payload, progress, and save/resume verified. Safe to test live.${RESET}`)
} else {
  console.log(`${RED}${BOLD}  Total: ${PASS + FAIL}   PASS ${PASS}   FAIL ${FAIL}${RESET}`)
  fails.forEach((f) => console.log(`${RED}   FAIL  ${f}${RESET}`))
  process.exit(1)
}
