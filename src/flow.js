// ----------------------------------------------------------------------------
// THE FLOW  (completion-optimized order)
// Sequence is intentionally psychological: open with one easy, engaging tap,
// grab the first name early to personalize, build momentum with low-friction
// categorical questions, and defer the higher-commitment asks (email, phone,
// consents) to the end once the client is invested.
//
//   1  intent            (the engaging opener, one tap)
//   2  first name        (friendly, powers every "name" mention after this)
//      -> branch on intent:
//         Buying a home   -> 3,4,5,6,7        (purchase path)
//         Refinancing     -> 8,9,10           (current-property path)
//         Accessing equity-> 8,9,10           (current-property path)
//   11 veteran   12 employment   13 income   14 credit   (shared, easy taps)
//   15 contact details (last name, email, phone)   16 preferred contact
//   17 credit authorization   18 TCPA   -> submit
//
// Any "title", "sub", or "note" may be a function of the answers object, which
// is what powers the dynamic, self-referencing copy.
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

// First name helper for dynamic copy
const fn = (a) => (a && a.contact && a.contact.firstName ? a.contact.firstName : '')
const hi = (a) => (fn(a) ? fn(a) + ', ' : '')
const intentLead = (a) =>
  a.intent === 'Buying a home' ? "Let's find your new home." :
  a.intent === 'Refinancing my home' ? "Let's lower that payment." :
  a.intent === 'Accessing my equity' ? "Let's put your equity to work." :
  "Let's get started."

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

export const STEPS = [
  // ---- Opener ----
  {
    id: 1, key: 'intent', type: 'single', eyebrow: 'Welcome',
    title: 'How can we help you today?',
    sub: 'This takes about a minute, and there is no obligation.',
    options: ['Buying a home', 'Refinancing my home', 'Accessing my equity'],
    next: 2
  },
  {
    id: 2, key: 'firstName', type: 'firstname',
    title: (a) => `${intentLead(a)} First, what should we call you?`,
    sub: 'Just your first name for now.',
    // Branch happens here, after we know the intent from step 1.
    branch: (a) => (a.intent === 'Buying a home' ? 3 : 8)
  },

  // ---- Purchase path ----
  {
    id: 3, key: 'purchase_state', type: 'select',
    title: (a) => `Nice to meet you, ${fn(a) || 'there'}. Which state are you buying in?`,
    options: STATE_OPTIONS, placeholder: 'Select a state',
    next: 4
  },
  {
    id: 4, key: 'will_occupy', type: 'single',
    title: 'Will you be living in this home?',
    options: ['Yes', 'No'],
    next: 5
  },
  {
    id: 5, key: 'purchase_price', type: 'single',
    title: (a) => a.purchase_state
      ? `What is your target price in ${stateName(a.purchase_state)}?`
      : 'What is your target purchase price?',
    options: ['Under $200,000', '$200,000 to $350,000', '$350,000 to $500,000', '$500,000 to $750,000', '$750,000 to $1M', 'Over $1M'],
    note: 'A ballpark is perfect. Nothing here is locked in.',
    next: 6
  },
  {
    id: 6, key: 'purchase_process', type: 'single',
    title: 'Where are you in the process?',
    options: ['Just researching', 'Getting pre-approved', 'Actively shopping', 'Found a home and making offers', 'Under contract'],
    next: 7
  },
  {
    id: 7, key: 'realtor', type: 'single',
    title: 'Are you working with a real estate agent?',
    options: ['Yes', 'No'],
    next: 11
  },

  // ---- Current-property path (Refinance / Equity) ----
  {
    id: 8, key: 'current_address', type: 'address',
    title: (a) => a.intent === 'Accessing my equity'
      ? `Thanks, ${fn(a) || 'there'}. Which property would you tap equity from?`
      : `Thanks, ${fn(a) || 'there'}. Which home are you refinancing?`,
    sub: 'Just the address to start.',
    next: 9
  },
  {
    id: 9, key: 'primary_residence', type: 'single',
    title: 'Is this your primary residence?',
    options: ['Yes', 'No'],
    next: 10
  },
  {
    id: 10, key: 'loan_amount', type: 'single',
    title: 'Roughly how much are you looking to borrow?',
    options: ['Under $150,000', '$150,000 to $300,000', '$300,000 to $500,000', '$500,000 to $750,000', 'Over $750,000'],
    note: 'An estimate is fine. Nothing here is binding.',
    next: 11
  },

  // ---- Shared tail ----
  {
    id: 11, key: 'veteran', type: 'single',
    title: 'Have you or your spouse served in the military?',
    options: ['Yes', 'No'],
    note: 'This can unlock loan options built for veterans.',
    next: 12
  },
  {
    id: 12, key: 'employment', type: 'single',
    title: (a) => `Almost there, ${fn(a) || 'there'}. What is your employment status?`,
    sub: 'Just a couple of quick financial details.',
    options: ['Employed (W-2)', 'Self-employed', 'Retired', 'Active military', 'Other'],
    next: 13
  },
  {
    id: 13, key: 'income', type: 'single',
    title: 'What is your approximate household income?',
    options: ['Under $50,000', '$50,000 to $75,000', '$75,000 to $100,000', '$100,000 to $150,000', '$150,000 to $250,000', 'Over $250,000'],
    next: 14
  },
  {
    id: 14, key: 'credit', type: 'single',
    title: 'How would you rate your credit?',
    options: ['Excellent (740+)', 'Good (680 to 739)', 'Fair (620 to 679)', 'Below 620', 'Not sure'],
    note: "This won't affect your credit score.",
    next: 15
  },

  // ---- The asks, deferred to the end ----
  {
    id: 15, key: 'contact', type: 'reach', eyebrow: 'Almost done',
    title: (a) => `Perfect. Where should we send your options, ${fn(a) || 'and how can we reach you'}?`,
    sub: 'A loan officer will reach out with options tailored to you.',
    note: 'We only use this to share your options. No spam, ever.',
    next: 16
  },
  {
    id: 16, key: 'preferred_contact', type: 'single',
    title: 'How would you prefer we reach out?',
    options: ['Phone call', 'Text message', 'Email'],
    next: 17
  },
  {
    id: 17, key: 'credit_auth', type: 'consent', eyebrow: 'Almost done',
    title: 'Stay Informed About Your Mortgage Options',
    text: CREDIT_AUTH_TEXT,
    checkLabel: 'Yes, I authorize this.',
    next: 18
  },
  {
    id: 18, key: 'tcpa', type: 'consent', eyebrow: 'One last thing',
    title: 'Stay Connected',
    text: TCPA_TEXT,
    checkLabel: 'Yes, I agree.',
    next: 'submit'
  }
]

export function stepById(id) {
  return STEPS.find((s) => s.id === id) || null
}

// Walk the flow from step 1 following the current answers to estimate how many
// steps the active path has (for the progress bar). Before the intent is
// chosen, it assumes the longer purchase path so the bar fills smoothly.
export function estimateTotal(answers) {
  let n = 0, id = 1, guard = 0
  const a = answers.intent ? answers : { ...answers, intent: 'Buying a home' }
  while (id && id !== 'submit' && guard < 100) {
    n++
    const s = stepById(id)
    if (!s) break
    id = s.branch ? s.branch(a) : s.next
    guard++
  }
  return n
}
