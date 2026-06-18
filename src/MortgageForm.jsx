import { useState, useEffect, useMemo, useRef } from 'react'
import { stepById, estimateTotal } from './flow'
import { buildPayload, captureAttribution, evaluateSubmission } from './tracking'
import Step from './Step.jsx'
import logoReverse from './assets/logo-reverse.svg'
import logoFull from './assets/logo.svg'
import eagleMark from './assets/eagle.svg'

const WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL ||
  'http://174.138.67.21:5678/webhook/0677cb4f-76a7-46ba-b9ad-40d030d43c59'
const REDIRECT_URL = import.meta.env.VITE_REDIRECT_URL || ''
const FORM_TOKEN = import.meta.env.VITE_FORM_TOKEN || ''   // optional shared secret, sent as a header
const DEBUG = !!import.meta.env.DEV                         // never log PII in a production build

const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
const phoneOk = (v) => v.replace(/\D/g, '').length >= 10

function stripHtml(html) {
  const d = document.createElement('div')
  d.innerHTML = html
  return (d.textContent || '').replace(/\s+/g, ' ').trim()
}

// The brand panel "talks back" to the client: it reacts to their name, their
// chosen intent, and the sensitive moments (reassurance right when it matters).
function panelLine(stepId, answers) {
  const name = answers.contact && answers.contact.firstName
  const greet = name ? `Thanks, ${name}. ` : ''
  if (stepId === 15) return 'Your details are encrypted and never sold.'
  if (stepId === 14) return "Answering this won't affect your credit score."
  if (stepId === 17 || stepId === 18) return greet + 'Almost done. Just confirm a couple of details.'
  if (answers.intent) {
    const m = {
      'Buying a home': "Let's get you into your next home.",
      'Refinancing my home': "Let's find you a better rate.",
      'Accessing my equity': "Let's put your equity to work."
    }
    return greet + (m[answers.intent] || '')
  }
  return 'This only takes a minute. No pressure, no obligation.'
}

export default function MortgageForm() {
  const [answers, setAnswers] = useState({})
  const [currentId, setCurrentId] = useState(1)
  const [history, setHistory] = useState([])
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('filling') // filling | submitting | done
  const [formError, setFormError] = useState('')
  const [dir, setDir] = useState('fwd')
  const consentMeta = useRef({})
  const busy = useRef(false)
  const honeypotRef = useRef(null)
  const startedAt = useRef(Date.now())

  useEffect(() => { captureAttribution() }, [])
  useEffect(() => { busy.current = false }, [currentId])

  // Tell a parent page (Webflow embed) how tall we are, so the iframe can resize.
  useEffect(() => {
    const h = Math.ceil(document.documentElement.scrollHeight)
    try { window.parent && window.parent.postMessage({ type: 'ohl-form-height', height: h }, '*') } catch (e) { /* ignore */ }
  }, [currentId, status])

  const step = stepById(currentId)
  const nextId = step.branch ? step.branch(answers) : step.next
  const isFinal = nextId === 'submit'

  const total = useMemo(() => estimateTotal(answers), [answers])
  const position = history.length + 1

  // ---- field handlers ----
  function setContact(field, value) {
    setAnswers((a) => ({ ...a, contact: { ...(a.contact || {}), [field]: value } }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }
  function setAddress(field, value) {
    setAnswers((a) => ({ ...a, [step.key]: { ...(a[step.key] || {}), [field]: value } }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }
  function setSelect(value) {
    setAnswers((a) => ({ ...a, [step.key]: value }))
    setErrors((e) => ({ ...e, [step.key]: undefined }))
  }
  function setConsent(checked) {
    setAnswers((a) => ({ ...a, [step.key]: checked ? 'Yes' : '' }))
    setErrors((e) => ({ ...e, [step.key]: undefined }))
    if (checked) consentMeta.current[step.key] = { text: stripHtml(step.text), timestamp: new Date().toISOString() }
  }
  function chooseSingle(value) {
    if (busy.current) return
    busy.current = true
    setAnswers((a) => ({ ...a, [step.key]: value }))
    setErrors({})
    setDir('fwd')
    const nxt = step.branch ? step.branch({ ...answers, [step.key]: value }) : step.next
    window.setTimeout(() => {
      setHistory((h) => [...h, step.id])
      setCurrentId(nxt)
    }, 230)
  }

  // ---- validation + navigation ----
  function validate() {
    const errs = {}
    if (step.type === 'firstname') {
      const c = answers.contact || {}
      if (!(c.firstName || '').trim()) errs.firstName = true
    } else if (step.type === 'reach') {
      const c = answers.contact || {}
      if (!(c.lastName || '').trim()) errs.lastName = true
      if (!emailOk((c.email || '').trim())) errs.email = true
      if (!phoneOk((c.phone || '').trim())) errs.phone = true
    } else if (step.type === 'address') {
      const ad = answers[step.key] || {}
      if (!(ad.street || '').trim()) errs.street = true
      if (!(ad.city || '').trim()) errs.city = true
      if (!(ad.state || '')) errs.state = true
      if (!/^\d{5}(-\d{4})?$/.test((ad.zip || '').trim())) errs.zip = true
    } else if (step.type === 'select') {
      if (!answers[step.key]) errs[step.key] = true
    } else if (step.type === 'consent') {
      if (answers[step.key] !== 'Yes') errs[step.key] = true
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function goNext() {
    if (!validate()) return
    setFormError('')
    setDir('fwd')
    if (nextId === 'submit') { doSubmit(answers); return }
    setHistory((h) => [...h, step.id])
    setCurrentId(nextId)
  }
  function goBack() {
    setFormError('')
    setDir('back')
    setHistory((h) => {
      const c = [...h]
      const prev = c.pop()
      if (prev != null) setCurrentId(prev)
      return c
    })
  }

  // ---- submit to the n8n webhook ----
  async function doSubmit(finalAnswers) {
    setStatus('submitting')
    const verdict = evaluateSubmission({
      startedAt: startedAt.current,
      honeypotValue: honeypotRef.current ? honeypotRef.current.value : ''
    })
    const meta = {
      formStartedAt: new Date(startedAt.current).toISOString(),
      elapsedMs: verdict.elapsedMs,
      honeypotTriggered: verdict.honeypotTriggered,
      suspectedBot: verdict.suspectedBot
    }
    const payload = buildPayload(finalAnswers, consentMeta.current, meta)
    if (DEBUG) console.log('[Oxford form] payload ->', payload)

    // A filled honeypot means a bot. Show success and silently drop (no webhook hit).
    if (verdict.honeypotTriggered) { setStatus('done'); return }

    if (!WEBHOOK_URL) { window.setTimeout(() => setStatus('done'), 700); return }
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (FORM_TOKEN) headers['X-Oxford-Form-Token'] = FORM_TOKEN
      const res = await fetch(WEBHOOK_URL, { method: 'POST', headers, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      if (REDIRECT_URL) { window.location.href = REDIRECT_URL; return }
      setStatus('done')
    } catch (err) {
      if (DEBUG) console.error('[Oxford form] submit failed', err)
      setStatus('filling')
      setFormError("We couldn't submit your request. Please try again.")
    }
  }

  function onFormSubmit(e) { e.preventDefault(); goNext() }

  const isSingle = step.type === 'single'
  const countLabel = isFinal ? 'Last step' : `Step ${position} of ${total}`
  const pct = isFinal ? 100 : Math.min(100, Math.round((position / total) * 100))

  return (
    <div className="ohl-card">
      <aside className="ohl-aside">
        <img className="ohl-eagle-mark" src={eagleMark} alt="" aria-hidden="true" />
        <div className="ohl-aside-top">
          <img className="ohl-logo" src={logoReverse} alt="Oxford Home Lending" />
          <h1 className="ohl-aside-head">Your mortgage,<br />made simple.</h1>
          <p className="ohl-aside-sub">{panelLine(currentId, answers)}</p>
        </div>
        <ul className="ohl-aside-points">
          <li><Check />Licensed mortgage lender</li>
          <li><Check />Personalized options, fast</li>
          <li><Check />Your information stays secure</li>
        </ul>
        <div className="ohl-aside-foot">Equal Housing Opportunity. NMLS ID #1124061.</div>
      </aside>

      <main className="ohl-main">
        {status === 'done' ? (
          <Success firstName={answers.contact && answers.contact.firstName} logo={logoFull} />
        ) : (
          <>
            <div className="ohl-progress-row">
              <div className="ohl-progress"><div className="ohl-progress-bar" style={{ width: pct + '%' }} /></div>
              <div className="ohl-stepcount">{countLabel}</div>
            </div>

            <form className="ohl-flow" onSubmit={onFormSubmit} noValidate>
              {/* Honeypot: hidden from people, tempting to bots. If filled, we drop silently. */}
              <div className="ohl-hp" aria-hidden="true">
                <label htmlFor="ohl_company">Company (leave blank)</label>
                <input ref={honeypotRef} id="ohl_company" name="company" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
              </div>

              {formError && <div className="ohl-form-err" role="alert">{formError}</div>}

              <Step
                step={step}
                answers={answers}
                errors={errors}
                dir={dir}
                handlers={{ setContact, setAddress, setSelect, chooseSingle, setConsent }}
              />

              <div className="ohl-nav">
                <button
                  type="button"
                  className="ohl-back"
                  onClick={goBack}
                  style={{ visibility: history.length ? 'visible' : 'hidden' }}
                >
                  <svg viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Back
                </button>
                {!isSingle && (
                  <button type="submit" className={'ohl-next' + (isFinal ? ' finish' : '')} disabled={status === 'submitting'}>
                    {status === 'submitting' ? 'Submitting...' : isFinal ? 'Submit' : 'Continue'}
                  </button>
                )}
              </div>
            </form>

            <p className="ohl-trust">
              <svg viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" /></svg>
              Your information is encrypted and secure.
            </p>
          </>
        )}
      </main>
    </div>
  )
}

function Check() {
  return (
    <svg className="ohl-check" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="11" fill="rgba(255,255,255,.10)" />
      <path d="m7 12.4 3.2 3.2L17 8.8" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Success({ firstName, logo }) {
  return (
    <div className="ohl-done">
      <img className="ohl-done-logo" src={logo} alt="Oxford Home Lending" />
      <div className="ohl-done-mark">
        <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill="#C42D2D" /><path d="m7 12.4 3.2 3.2L17 8.8" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <h2>You're all set{firstName ? ', ' + firstName : ''}.</h2>
      <p>Thanks for sharing the details. A licensed Oxford Home Lending loan officer will review your options and reach out shortly.</p>
      <span className="ohl-next-steps">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /></svg>
        Most clients hear back the same business day.
      </span>
    </div>
  )
}
