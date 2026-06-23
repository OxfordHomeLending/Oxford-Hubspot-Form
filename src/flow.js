// ----------------------------------------------------------------------------
// THREE-STAGE PROGRESSIVE INTAKE
//
// Stage 1  "Quick Start"  - lowest barrier, 6-7 questions + contact + TCPA.
//          A lead fires here (low-intent / "just looking").
// Stage 2  "Your Details" - property + income detail + credit authorization.
//          An enriched lead fires here (mid-intent / pre-qual).
// Stage 3  "Full Application" - the rest of the 1003 (assets, DOB, SSN, etc.).
//          The full lead fires here (high-intent / application).
//
// The flow is a flat ordered list of NODES (questions + milestones). A question
// may carry showIf(answers) so refi-only questions are skipped for buyers. The
// per-stage progress bar fills to 100% at each milestone, then resets for the
// next stage. A webhook fires when each milestone is reached, so you capture a
// lead at every stage boundary regardless of whether the person continues.
//
// Any title/sub/note may be a function of the answers object (dynamic copy).
// First names are capitalized wherever they are inserted.
// ----------------------------------------------------------------------------

export const STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
  ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],
  ['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
  ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],
  ['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],
  ['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],
  ['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],
  ['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],
  ['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],
  ['WI','Wisconsin'],['WY','Wyoming']
]
const STATE_OPTIONS = STATES.map(([value, label]) => ({ value, label }))
export function stateName(code) {
  const hit = STATES.find(([c]) => c === code)
  return hit ? hit[1] : code
}

// Capitalize each word of a name: "logan" -> "Logan", "mary jane" -> "Mary Jane".
export function capitalize(s) {
  return (s || '').toLowerCase().replace(/\b([a-z])/g, (m, c) => c.toUpperCase())
}
const fn = (a) => capitalize(a && a.contact && a.contact.firstName ? a.contact.firstName : '')
const buying = (a) => a.loan_goal === 'Buy a home'

const goalLead = (a) =>
  a.loan_goal === 'Buy a home' ? "Let's find your new home." :
  a.loan_goal === 'Refinance for a lower rate' ? "Let's lower that payment." :
  a.loan_goal === 'Take cash out of my home' ? "Let's put your equity to work." :
  "Let's explore your options."

export const STAGES = [
  { id: 1, name: 'Quick Start' },
  { id: 2, name: 'Your Details' },
  { id: 3, name: 'Full Application' }
]

// ---- Consent copy (Oxford's own approved language) ----
const CONTACT_EMAIL = 'info@oxfordhomelending.com'
const CONTACT_PHONE = '655-689-3571'
const telHref = 'tel:' + CONTACT_PHONE.replace(/[^0-9]/g, '')
const contactLinks =
  `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> or <a href="${telHref}">${CONTACT_PHONE}</a>`

export const CREDIT_AUTH_TEXT =
  'By checking this box, I provide express written authorization for Oxford Home Lending to obtain and use ' +
  'consumer report information, including information related to my mortgage shopping behavior, for the purpose ' +
  'of providing prescreened offers of credit. I understand I may revoke this authorization at any time by ' +
  'contacting: ' + contactLinks + '.'

export const TCPA_TEXT =
  'I authorize Oxford Home Lending to contact me at the phone number provided using automated technology, ' +
  'including autodialed calls, prerecorded or artificial voice messages, and text messages regarding mortgage ' +
  'loan products and prescreened offers. By checking this box, I also consent to receive calls and messages from ' +
  'Oxford Home Lending, its affiliates, and its service providers at the telephone number I provide, including ' +
  'through automated calling technologies, prerecorded or artificial voice messages, and AI-assisted voice ' +
  'communications. My consent is voluntary and not a condition of loan approval. I may revoke consent at any ' +
  'time by contacting: ' + contactLinks + '.'

// ============================================================================
// NODES
// ============================================================================
export const NODES = [
  // ---------------- STAGE 1: Quick Start ----------------
  {
    stage: 1, key: 'loan_goal', type: 'single', eyebrow: 'Welcome',
    title: 'What would you like to do?',
    sub: 'This takes about a minute, and there is no obligation.',
    options: ['Buy a home', 'Refinance for a lower rate', 'Take cash out of my home', 'Just exploring my options']
  },
  {
    stage: 1, key: 'firstName', type: 'firstname',
    title: (a) => `${goalLead(a)} First, what should we call you?`,
    sub: 'Just your first name for now.'
  },
  {
    stage: 1, key: 'property_state', type: 'select',
    title: (a) => fn(a) ? `Nice to meet you, ${fn(a)}. Which state is the property in?` : 'Which state is the property in?',
    options: STATE_OPTIONS, placeholder: 'Select a state'
  },
  {
    stage: 1, key: 'home_value', type: 'single',
    title: (a) => buying(a) ? 'What is your target purchase price?' : 'What is the home worth, roughly?',
    options: ['Under $200,000', '$200,000 to $350,000', '$350,000 to $500,000', '$500,000 to $750,000', '$750,000 to $1M', 'Over $1M'],
    note: 'A ballpark is perfect. Nothing here is locked in.'
  },
  {
    stage: 1, key: 'loan_amount', type: 'single',
    title: 'About how much are you looking to finance?',
    options: ['Under $150,000', '$150,000 to $300,000', '$300,000 to $500,000', '$500,000 to $750,000', '$750,000 to $1M', 'Over $1M'],
    note: 'An estimate is fine. Nothing here is binding.'
  },
  {
    stage: 1, key: 'credit', type: 'single',
    title: 'How would you rate your credit?',
    options: ['Excellent (740+)', 'Good (680 to 739)', 'Fair (620 to 679)', 'Below 620', 'Not sure'],
    note: "This won't affect your credit score."
  },
  {
    stage: 1, key: 'contact', type: 'reach', eyebrow: 'Almost there',
    title: (a) => `Perfect. Where should we send your options${fn(a) ? ', ' + fn(a) : ''}?`,
    sub: 'A licensed mortgage advisor will reach out with options tailored to you.',
    note: 'We only use this to share your options. No spam, ever.'
  },
  {
    stage: 1, key: 'tcpa', type: 'consent', eyebrow: 'One last thing',
    title: 'Stay Connected',
    text: TCPA_TEXT,
    checkLabel: 'Yes, I agree.'
  },
  {
    stage: 1, type: 'milestone', milestone: 1,
    eyebrow: 'Stage 1 complete',
    title: (a) => `You're set for a ballpark${fn(a) ? ', ' + fn(a) : ''}.`,
    body: 'We have enough to get a licensed mortgage advisor working on your options. You can stop here and we will reach out, or answer a few more questions for more accurate pricing and a tailored strategy.',
    continueLabel: 'Continue for accurate pricing',
    finishLabel: "I'm good for now"
  },

  // ---------------- STAGE 2: Your Details ----------------
  {
    stage: 2, key: 'property_address', type: 'address', eyebrow: 'Your Details',
    title: (a) => buying(a) ? "Which area are you buying in?" : "What is the property address?",
    sub: 'This helps us price your loan accurately.'
  },
  {
    stage: 2, key: 'property_type', type: 'single',
    title: 'What type of property is it?',
    options: ['Single-family home', 'Condo', 'Townhouse', 'Multi-family (2 to 4 units)', 'Manufactured home']
  },
  {
    stage: 2, key: 'occupancy', type: 'single',
    title: 'How will the property be used?',
    options: ['Primary residence', 'Second home', 'Investment property']
  },
  {
    stage: 2, key: 'own_multiple', type: 'single',
    title: 'Do you currently own more than one property?',
    options: ['Yes', 'No']
  },
  {
    stage: 2, key: 'second_liens', type: 'single', showIf: (a) => !buying(a),
    title: 'Any 2nd mortgages, HELOCs, or solar panels on it?',
    options: ['None', '2nd mortgage or HELOC', 'Solar panels', 'Both']
  },
  {
    stage: 2, key: 'current_rate', type: 'single', showIf: (a) => !buying(a),
    title: 'What is your current interest rate?',
    options: ['Below 4%', '4% to 5%', '5% to 6%', '6% to 7%', 'Over 7%', 'Not sure'],
    note: 'An estimate is fine.'
  },
  {
    stage: 2, key: 'when_acquired', type: 'single', showIf: (a) => !buying(a),
    title: 'When did you buy or last refinance this property?',
    options: ['Within the last year', '1 to 3 years ago', '3 to 5 years ago', '5 to 10 years ago', 'Over 10 years ago']
  },
  {
    stage: 2, key: 'income_source', type: 'single',
    title: (a) => `Let's talk income${fn(a) ? ', ' + fn(a) : ''}. What is your main source?`,
    options: ['Employed (W-2)', 'Self-employed', 'Retired', 'Active military', 'Other']
  },
  {
    stage: 2, key: 'monthly_income', type: 'single',
    title: 'Estimated total monthly income?',
    options: ['Under $4,000', '$4,000 to $7,000', '$7,000 to $10,000', '$10,000 to $15,000', '$15,000 to $20,000', 'Over $20,000'],
    note: 'Before taxes. An estimate is fine.'
  },
  {
    stage: 2, key: 'credit_auth', type: 'consent', eyebrow: 'For accurate pricing',
    title: 'Stay Informed About Your Mortgage Options',
    text: CREDIT_AUTH_TEXT,
    checkLabel: 'Yes, I authorize this.'
  },
  {
    stage: 2, type: 'milestone', milestone: 2,
    eyebrow: 'Stage 2 complete',
    title: (a) => `Great progress${fn(a) ? ', ' + fn(a) : ''}.`,
    body: 'We can now build you a tailored estimate and strategy. Finish here and an advisor will follow up, or complete the full application for the most precise pricing and a faster close.',
    continueLabel: 'Complete the full application',
    finishLabel: 'Finish here'
  },

  // ---------------- STAGE 3: Full Application ----------------
  {
    stage: 3, key: 'time_at_residence', type: 'single', eyebrow: 'Full Application',
    title: 'How long have you lived at your current residence?',
    options: ['Less than 1 year', '1 to 2 years', '2 to 5 years', '5 to 10 years', 'Over 10 years']
  },
  {
    stage: 3, key: 'income_duration', type: 'single',
    title: 'How long have you had your current income source?',
    options: ['Less than 1 year', '1 to 2 years', '2 to 5 years', 'Over 5 years']
  },
  {
    stage: 3, key: 'liquid_assets', type: 'single',
    title: 'How much do you have in liquid assets?',
    options: ['Under $10,000', '$10,000 to $50,000', '$50,000 to $100,000', '$100,000 to $250,000', 'Over $250,000'],
    note: 'Checking, savings, 401k, IRA, and similar.'
  },
  {
    stage: 3, key: 'marital_status', type: 'single',
    title: 'What is your marital status?',
    options: ['Married', 'Unmarried', 'Separated']
  },
  {
    stage: 3, key: 'co_borrower', type: 'single',
    title: 'Will there be a co-borrower on the loan?',
    options: ['Yes', 'No']
  },
  {
    stage: 3, key: 'veteran', type: 'single',
    title: 'Have you or your spouse served in the U.S. military?',
    options: ['Yes', 'No'],
    note: 'This can unlock loan options built for veterans.'
  },
  {
    stage: 3, key: 'birth_place', type: 'text',
    title: 'What state or country were you born in?',
    placeholder: 'e.g. Ohio',
    autoComplete: 'off'
  },
  {
    stage: 3, key: 'date_of_birth', type: 'date',
    title: (a) => `Almost done${fn(a) ? ', ' + fn(a) : ''}. What is your date of birth?`,
    note: 'Used to verify your identity for your application.'
  },
  {
    stage: 3, key: 'ssn', type: 'ssn', eyebrow: 'Secure',
    title: 'Finally, your Social Security number.',
    sub: 'Required to complete your application.',
    note: 'Encrypted and transmitted securely.'
  },
  {
    stage: 3, type: 'milestone', milestone: 3, final: true,
    eyebrow: 'Ready to submit',
    title: (a) => `That's everything${fn(a) ? ', ' + fn(a) : ''}.`,
    body: 'Submit your full application and a licensed mortgage advisor will review it and reach out with your most precise pricing and next steps.',
    finishLabel: 'Submit my application'
  }
]

// ---- navigation + progress helpers (operate on NODES + answers) ----
export function isVisible(node, answers) {
  return node.showIf ? !!node.showIf(answers) : true
}
export function firstIndex() { return 0 }
export function nextVisible(index, answers) {
  for (let i = index + 1; i < NODES.length; i++) if (isVisible(NODES[i], answers)) return i
  return -1
}
export function prevVisible(index, answers) {
  for (let i = index - 1; i >= 0; i--) if (isVisible(NODES[i], answers)) return i
  return -1
}
export function firstIndexOfStage(stage, answers) {
  for (let i = 0; i < NODES.length; i++) if (NODES[i].stage === stage && isVisible(NODES[i], answers)) return i
  return -1
}
// Progress within the current node's stage: questions answered / total questions
// in that stage (milestones count as the 100% endpoint).
export function stageProgress(index, answers) {
  const node = NODES[index]
  if (!node) return 0
  const stage = node.stage
  const qs = NODES.filter((n, i) => n.stage === stage && n.type !== 'milestone' && isVisible(n, answers))
  if (node.type === 'milestone') return 100
  const done = NODES.filter((n, i) => i < index && n.stage === stage && n.type !== 'milestone' && isVisible(n, answers)).length
  const total = qs.length || 1
  return Math.min(100, Math.round((done / total) * 100))
}
