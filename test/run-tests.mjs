// ============================================================================
// Path test harness.
// Imports the REAL src/flow.js and src/tracking.js, mocks the browser globals
// those modules touch, walks each of the three branch paths the same way the
// form's orchestrator does (following step.branch(answers) / step.next), builds
// the payload with the real buildPayload(), and asserts the JSON is correct.
//
//   node test/run-tests.mjs
//
// Browser globals MUST be installed before importing tracking.js, because that
// module reads document.cookie at load time (first-touch store init).
// ============================================================================

// ---- 1. Mock the browser ----------------------------------------------------
const cookieJar = {}
function seedCookie(k, v) { cookieJar[k] = v }
seedCookie('_ga', 'GA1.2.1234567890.1681500000')        // -> gaClientId 1234567890.1681500000
seedCookie('hubspotutk', 'a1b2c3d4e5f6a7b8c9d0e1f2')    // -> hubspotutk passthrough

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
  referrer: 'https://www.google.com/'
}
globalThis.window = {
  location: { search: QUERY, href: HREF, protocol: 'https:' },
  crypto: globalThis.crypto,        // Node 18+ exposes Web Crypto with randomUUID
  screen: { width: 1920, height: 1080 },
  innerWidth: 1440,
  innerHeight: 900,
  Intl
}
globalThis.location = globalThis.window.location
// navigator is a read-only global in modern Node, so define it explicitly.
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'Mozilla/5.0 (Macintosh; TestHarness) Node', language: 'en-US' },
  configurable: true, writable: true
})

// ---- 2. Import the real source ---------------------------------------------
const { STEPS, stepById } = await import('../src/flow.js')
const { buildPayload, captureAttribution, evaluateSubmission, FORM_VERSION } = await import('../src/tracking.js')

// Simulate the on-mount first-touch capture (the form does this in a useEffect).
captureAttribution()

// ---- 3. Tiny assertion kit --------------------------------------------------
let PASS = 0, FAIL = 0
const fails = []
function check(label, cond) {
  if (cond) { PASS++ } else { FAIL++; fails.push(label) }
  const tag = cond ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'
  console.log(`   ${tag}  ${label}`)
}
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || '')

// strip HTML the same way the form does when recording consent text
const strip = (h) => String(h).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()

// ---- 4. Walk the real flow graph for a given set of answers ----------------
function runPath(responder) {
  const answers = {}
  const consentMeta = {}
  const visited = []
  let id = 1, guard = 0
  while (id && id !== 'submit' && guard < 100) {
    const s = stepById(id)
    if (!s) throw new Error('no step with id ' + id)
    visited.push(s.id)
    switch (s.type) {
      case 'firstname':
        answers.contact = { ...(answers.contact || {}), firstName: responder.firstName }
        break
      case 'reach':
        answers.contact = { ...(answers.contact || {}), lastName: responder.lastName, email: responder.email, phone: responder.phone }
        break
      case 'address':
        answers[s.key] = responder[s.key]
        break
      case 'consent':
        answers[s.key] = 'Yes'
        consentMeta[s.key] = { text: strip(s.text), timestamp: new Date().toISOString() }
        break
      default: // single, select
        answers[s.key] = responder[s.key]
    }
    id = s.branch ? s.branch(answers) : s.next
    guard++
  }
  return { answers, consentMeta, visited }
}

// A normal human submission: ~70s on the form, honeypot empty.
function humanMeta() {
  const started = Date.now() - 70000
  const v = evaluateSubmission({ startedAt: started, honeypotValue: '' })
  return { formStartedAt: new Date(started).toISOString(), elapsedMs: v.elapsedMs, honeypotTriggered: v.honeypotTriggered, suspectedBot: v.suspectedBot }
}

// ---- 5. Responders for the three paths -------------------------------------
const purchase = {
  intent: 'Buying a home', firstName: 'Jordan',
  purchase_state: 'TX', will_occupy: 'Yes', purchase_price: '$350,000 to $500,000',
  purchase_process: 'Actively shopping', realtor: 'Yes',
  veteran: 'No', employment: 'Employed (W-2)', income: '$100,000 to $150,000', credit: 'Good (680 to 739)',
  lastName: 'Rivera', email: 'jordan.rivera@example.com', phone: '(614) 555-0142', preferred_contact: 'Text message'
}
const refinance = {
  intent: 'Refinancing my home', firstName: 'Sam',
  current_address: { street: '88 Maple Ave', city: 'Dublin', state: 'OH', zip: '43017' },
  primary_residence: 'Yes', loan_amount: '$300,000 to $500,000',
  veteran: 'Yes', employment: 'Self-employed', income: '$150,000 to $250,000', credit: 'Excellent (740+)',
  lastName: 'Okafor', email: 'sam.okafor@example.com', phone: '(555) 123-4567', preferred_contact: 'Phone call'
}
const equity = {
  intent: 'Accessing my equity', firstName: 'Lee',
  current_address: { street: '1200 Lake Shore Dr', city: 'Chicago', state: 'IL', zip: '60611' },
  primary_residence: 'No', loan_amount: 'Over $750,000',
  veteran: 'No', employment: 'Retired', income: 'Over $250,000', credit: 'Fair (620 to 679)',
  lastName: 'Nguyen', email: 'lee.nguyen@example.com', phone: '(312) 555-7788', preferred_contact: 'Email'
}

const EXPECTED = {
  purchase: [1, 2, 3, 4, 5, 6, 7, 11, 12, 13, 14, 15, 16, 17, 18],
  refinance: [1, 2, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
  equity: [1, 2, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
}

const leadUuids = []

function assertCommon(name, p, r) {
  // contact
  check(`${name}: firstName populated`, p.contact.firstName === r.firstName)
  check(`${name}: lastName populated`, p.contact.lastName === r.lastName)
  check(`${name}: email populated`, p.contact.email === r.email)
  check(`${name}: phone populated`, p.contact.phone === r.phone)
  check(`${name}: preferredContact populated`, p.contact.preferredContact === r.preferred_contact)
  // shared loan fields
  check(`${name}: intent correct`, p.loan.intent === r.intent)
  check(`${name}: employment populated`, nonEmpty(p.loan.employmentStatus))
  check(`${name}: income populated`, nonEmpty(p.loan.householdIncome))
  check(`${name}: credit populated`, nonEmpty(p.loan.creditCategory))
  check(`${name}: veteran populated`, nonEmpty(p.loan.veteran))
  // consents
  check(`${name}: credit auth granted`, p.consents.creditAuthorization.granted === true)
  check(`${name}: credit auth has timestamp`, nonEmpty(p.consents.creditAuthorization.timestamp))
  check(`${name}: credit auth has text`, nonEmpty(p.consents.creditAuthorization.text))
  check(`${name}: tcpa granted`, p.consents.tcpa.granted === true)
  check(`${name}: tcpa has timestamp`, nonEmpty(p.consents.tcpa.timestamp))
  check(`${name}: tcpa has text`, nonEmpty(p.consents.tcpa.text))
  // tracking / robust capture
  check(`${name}: gclid captured`, p.tracking.gclid === 'TESTgclid123')
  check(`${name}: utm_source captured`, p.tracking.utmSource === 'google')
  check(`${name}: utm_medium captured`, p.tracking.utmMedium === 'cpc')
  check(`${name}: utm_campaign captured`, p.tracking.utmCampaign === 'spring_refi')
  check(`${name}: fbclid captured`, p.tracking.fbclid === 'FBxyz789')
  check(`${name}: gaClientId from _ga`, p.tracking.gaClientId === '1234567890.1681500000')
  check(`${name}: hubspotutk passthrough`, p.tracking.hubspotutk === 'a1b2c3d4e5f6a7b8c9d0e1f2')
  check(`${name}: referrer captured`, p.tracking.referrer === 'https://www.google.com/')
  check(`${name}: viewport captured`, p.tracking.viewport === '1440x900')
  check(`${name}: leadUuid is a uuid`, isUuid(p.leadUuid))
  check(`${name}: leadUuid mirrored in tracking`, p.tracking.leadUuid === p.leadUuid)
  check(`${name}: formVersion stamped`, p.formVersion === FORM_VERSION)
  // meta / abuse signals (human submission)
  check(`${name}: not flagged as bot`, p.meta.suspectedBot === false)
  check(`${name}: honeypot not triggered`, p.meta.honeypotTriggered === false)
  check(`${name}: elapsedMs recorded`, typeof p.meta.elapsedMs === 'number' && p.meta.elapsedMs > 0)
  // serializable
  let ok = true; try { JSON.parse(JSON.stringify(p)) } catch { ok = false }
  check(`${name}: payload is valid JSON`, ok)
  leadUuids.push(p.leadUuid)
}

function assertPurchase(p) {
  check('purchase: purchaseState populated', nonEmpty(p.loan.purchaseState))
  check('purchase: willOccupy populated', nonEmpty(p.loan.willOccupy))
  check('purchase: purchasePrice populated', nonEmpty(p.loan.purchasePrice))
  check('purchase: purchaseProcess populated', nonEmpty(p.loan.purchaseProcess))
  check('purchase: workingWithRealtor populated', nonEmpty(p.loan.workingWithRealtor))
  // refi-only fields must be empty/null on this path
  check('purchase: currentAddress is null', p.loan.currentAddress === null)
  check('purchase: primaryResidence empty', p.loan.primaryResidence === '')
  check('purchase: estimatedLoanAmount empty', p.loan.estimatedLoanAmount === '')
}

function assertCurrentProperty(name, p) {
  check(`${name}: currentAddress is an object`, p.loan.currentAddress && typeof p.loan.currentAddress === 'object')
  check(`${name}: address.street populated`, nonEmpty(p.loan.currentAddress.street))
  check(`${name}: address.zip populated`, nonEmpty(p.loan.currentAddress.zip))
  check(`${name}: primaryResidence populated`, nonEmpty(p.loan.primaryResidence))
  check(`${name}: estimatedLoanAmount populated`, nonEmpty(p.loan.estimatedLoanAmount))
  // purchase-only fields must be empty on this path
  check(`${name}: purchaseState empty`, p.loan.purchaseState === '')
  check(`${name}: willOccupy empty`, p.loan.willOccupy === '')
  check(`${name}: purchasePrice empty`, p.loan.purchasePrice === '')
  check(`${name}: purchaseProcess empty`, p.loan.purchaseProcess === '')
  check(`${name}: workingWithRealtor empty`, p.loan.workingWithRealtor === '')
}

function divider(t) { console.log('\n\x1b[1m\x1b[36m' + t + '\x1b[0m') }

// ---- 6. Run the three paths -------------------------------------------------
const results = {}
for (const [name, r] of [['purchase', purchase], ['refinance', refinance], ['equity', equity]]) {
  divider(`========== PATH: ${name.toUpperCase()} ==========`)
  const { answers, consentMeta, visited } = runPath(r)
  const payload = buildPayload(answers, consentMeta, humanMeta())
  results[name] = payload

  console.log('   visited steps:', visited.join(' -> '))
  check(`${name}: step sequence matches expected`, JSON.stringify(visited) === JSON.stringify(EXPECTED[name]))
  assertCommon(name, payload, r)
  if (name === 'purchase') assertPurchase(payload)
  else assertCurrentProperty(name, payload)

  console.log('\n   --- emitted JSON ---')
  console.log(JSON.stringify(payload, null, 2).split('\n').map((l) => '   ' + l).join('\n'))
}

// idempotency: same browser session -> same leadUuid on every payload
divider('========== CROSS-PATH ==========')
check('leadUuid stable across all paths (idempotency key)', leadUuids.every((u) => u === leadUuids[0]))

// Optionally refresh the committed sample file so it always mirrors real output.
if (process.env.WRITE_SAMPLES) {
  const fs = await import('node:fs')
  const url = await import('node:url')
  const path = await import('node:path')
  const here = path.dirname(url.fileURLToPath(import.meta.url))
  const dest = path.join(here, '..', 'sample-payloads.json')
  fs.writeFileSync(dest, JSON.stringify(results, null, 2))
  console.log('   wrote sample-payloads.json')
}

// ---- 7. Honeypot + timing unit tests ---------------------------------------
divider('========== ABUSE DETECTION ==========')
const human = evaluateSubmission({ startedAt: Date.now() - 60000, honeypotValue: '' })
check('human (slow, empty honeypot) -> not bot', human.suspectedBot === false && human.honeypotTriggered === false && human.tooFast === false)

const filled = evaluateSubmission({ startedAt: Date.now() - 60000, honeypotValue: 'Acme Corp' })
check('honeypot filled -> honeypotTriggered true', filled.honeypotTriggered === true)
check('honeypot filled -> suspectedBot true', filled.suspectedBot === true)

const fast = evaluateSubmission({ startedAt: Date.now() - 400, honeypotValue: '' })
check('completed in 400ms -> tooFast true', fast.tooFast === true)
check('completed in 400ms -> suspectedBot true', fast.suspectedBot === true)

const edge = evaluateSubmission({ startedAt: Date.now() - 2600, honeypotValue: '' })
check('completed in 2600ms -> not bot (above 2500ms floor)', edge.suspectedBot === false)

// ---- 8. Summary -------------------------------------------------------------
divider('========== SUMMARY ==========')
console.log(`   Total: ${PASS + FAIL}   \x1b[32mPASS ${PASS}\x1b[0m   ${FAIL ? '\x1b[31m' : ''}FAIL ${FAIL}\x1b[0m`)
if (FAIL) { console.log('\n   Failing checks:'); fails.forEach((f) => console.log('     - ' + f)); process.exit(1) }
else console.log('\n   \x1b[32mAll path payloads verified. Safe for you to test live.\x1b[0m')
