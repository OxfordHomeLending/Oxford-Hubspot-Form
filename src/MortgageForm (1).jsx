import { useState, useEffect, useRef } from 'react'
import {
  NODES, STAGES, capitalize, isVisible, nextVisible, prevVisible, stageProgress
} from './flow'
import { resolve } from './personalize'
import { buildPayload, captureAttribution, evaluateSubmission } from './tracking'
import { loadProgress, saveProgress, clearProgress } from './progress'
import Step from './Step.jsx'
import logoReverse from './assets/logo-reverse.svg'
import logoFull from './assets/logo.svg'
import eagleMark from './assets/eagle.svg'

const WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL ||
  'https://n8n.oxfordhomelending.com/webhook/0677cb4f-76a7-46ba-b9ad-40d030d43c59'
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

// The brand panel reacts to the person's name, their goal, and the sensitive
// moments (reassurance right when it matters). Names are capitalized.
function panelLine(node, answers) {
  const name = capitalize(answers.contact && answers.contact.firstName)
  const greet = name ? `Thanks, ${name}. ` : ''
  if (!node) return 'This only takes a minute. No pressure, no obligation.'
  if (node.key === 'ssn' || node.key === 'date_of_birth') return 'Your details are encrypted and never sold.'
  if (node.key === 'credit') return "Answering this won't affect your credit score."
  if (node.type === 'milestone') return greet + 'Great work so far.'
  const g = answers.loan_goal
  if (g) {
    const m = {
      'Buy a home': "Let's get you into your next home.",
      'Refinance for a lower rate': "Let's find you a better rate.",
      'Take cash out of my home': "Let's put your equity to work.",
      'Just exploring my options': "Let's explore what's possible."
    }
    return greet + (m[g] || 'This only takes a minute.')
  }
  return 'This only takes a minute. No pressure, no obligation.'
}

export default function MortgageForm() {
  const [restored] = useState(() => loadProgress())
  const [answers, setAnswers] = useState(restored.answers)
  const [index, setIndex] = useState(restored.index)
  const [history, setHistory] = useState(restored.history)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('filling') // filling | submitting | done
  const [formError, setFormError] = useState('')
  const [dir, setDir] = useState('fwd')
  const consentMeta = useRef({})
  const busy = useRef(false)
  const honeypotRef = useRef(null)
  const startedAt = useRef(Date.now())
  const cardRef = useRef(null)
  const attempted = useRef(new Set())   // stages we've started a webhook fire for
  const succeeded = useRef(new Set())   // stages confirmed received

  const node = NODES[index]
  const isMilestone = node.type === 'milestone'
  const stage = node.stage
  const pct = stageProgress(index, answers)

  useEffect(() => { captureAttribution() }, [])
  useEffect(() => { busy.current = false }, [index])

  // Save progress as the visitor advances (sensitive fields + consents excluded
  // inside saveProgress). Stops once the form is submitted.
  useEffect(() => {
    if (status === 'done') return
    saveProgress(answers)
  }, [answers, status])

  // Progressive lead capture: when an intermediate milestone is reached, fire a
  // webhook so the lead is captured even if the person stops there. The final
  // milestone fires on the explicit submit button instead.
  useEffect(() => {
    if (isMilestone && !node.final && !attempted.current.has(node.milestone)) {
      attempted.current.add(node.milestone)
      submitStage(node.milestone).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  // Keep a parent page sized to our content if this is ever embedded. Harmless
  // when standalone (it posts to its own window, which has no listener).
  useEffect(() => {
    const post = () => {
      const h = Math.ceil(document.documentElement.scrollHeight)
      try { window.parent && window.parent.postMessage({ type: 'ohl-form-height', height: h }, '*') } catch (e) { /* ignore */ }
    }
    post()
    let ro
    if (typeof ResizeObserver !== 'undefined' && cardRef.current) {
      ro = new ResizeObserver(post)
      ro.observe(cardRef.current)
    }
    window.addEventListener('resize', post)
    window.addEventListener('orientationchange', post)
    return () => {
      if (ro) ro.disconnect()
      window.removeEventListener('resize', post)
      window.removeEventListener('orientationchange', post)
    }
  }, [])

  // ---- field handlers ----
  function setContact(field, value) {
    setAnswers((a) => ({ ...a, contact: { ...(a.contact || {}), [field]: value } }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }
  function setAddress(field, value) {
    setAnswers((a) => ({ ...a, [node.key]: { ...(a[node.key] || {}), [field]: value } }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }
  function setSelect(value) {
    setAnswers((a) => ({ ...a, [node.key]: value }))
    setErrors((e) => ({ ...e, [node.key]: undefined }))
  }
  function setField(name, value) {
    setAnswers((a) => ({ ...a, [name]: value }))
    setErrors((e) => ({ ...e, [name]: undefined }))
  }
  function setConsent(checked) {
    setAnswers((a) => ({ ...a, [node.key]: checked ? 'Yes' : '' }))
    setErrors((e) => ({ ...e, [node.key]: undefined }))
    if (checked) consentMeta.current[node.key] = { text: stripHtml(node.text), timestamp: new Date().toISOString() }
  }
  function chooseSingle(value) {
    if (busy.current) return
    busy.current = true
    const na = { ...answers, [node.key]: value }
    setAnswers(na)
    setErrors({})
    setDir('fwd')
    const nxt = nextVisible(index, na)
    window.setTimeout(() => {
      setHistory((h) => [...h, index])
      if (nxt !== -1) setIndex(nxt)
    }, 230)
  }

  // ---- validation ----
  function validate() {
    const errs = {}
    const k = node.key
    switch (node.type) {
      case 'firstname': {
        const c = answers.contact || {}
        if (!(c.firstName || '').trim()) errs.firstName = true
        break
      }
      case 'reach': {
        const c = answers.contact || {}
        if (!(c.lastName || '').trim()) errs.lastName = true
        if (!emailOk((c.email || '').trim())) errs.email = true
        if (!phoneOk((c.phone || '').trim())) errs.phone = true
        break
      }
      case 'address': {
        const ad = answers[k] || {}
        if (!(ad.street || '').trim()) errs.street = true
        if (!(ad.city || '').trim()) errs.city = true
        if (!(ad.state || '')) errs.state = true
        if (!/^\d{5}(-\d{4})?$/.test((ad.zip || '').trim())) errs.zip = true
        break
      }
      case 'select': if (!answers[k]) errs[k] = true; break
      case 'text': if (!(answers[k] || '').trim()) errs[k] = true; break
      case 'date': {
        const v = answers[k]
        const d = v ? new Date(v + 'T00:00:00') : null
        if (!v || !d || isNaN(d.getTime())) { errs[k] = true; break }
        const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000)
        if (age < 18 || age > 120) errs[k] = true
        break
      }
      case 'ssn': if ((answers[k] || '').replace(/\D/g, '').length !== 9) errs[k] = true; break
      case 'consent': if (answers[k] !== 'Yes') errs[k] = true; break
      default: break
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ---- navigation ----
  function goNext() {
    if (!validate()) return
    setFormError('')
    setDir('fwd')
    const nxt = nextVisible(index, answers)
    setHistory((h) => [...h, index])
    if (nxt !== -1) setIndex(nxt)
  }
  function goBack() {
    setFormError('')
    setDir('back')
    setHistory((h) => {
      const c = [...h]
      const prev = c.pop()
      if (prev != null) setIndex(prev)
      return c
    })
  }
  function onFormSubmit(e) { e.preventDefault(); goNext() }

  // ---- progressive submission to the n8n webhook ----
  async function submitStage(stageNum) {
    const verdict = evaluateSubmission({
      startedAt: startedAt.current,
      honeypotValue: honeypotRef.current ? honeypotRef.current.value : ''
    })
    const meta = {
      leadStage: stageNum,
      formStartedAt: new Date(startedAt.current).toISOString(),
      elapsedMs: verdict.elapsedMs,
      honeypotTriggered: verdict.honeypotTriggered,
      suspectedBot: verdict.suspectedBot
    }
    const payload = buildPayload(answers, consentMeta.current, meta)
    if (DEBUG) console.log('[Oxford form] stage', stageNum, 'payload ->', payload)

    // Filled honeypot means a bot: pretend success, send nothing.
    if (verdict.honeypotTriggered) { succeeded.current.add(stageNum); return true }
    if (!WEBHOOK_URL) { succeeded.current.add(stageNum); return true }
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (FORM_TOKEN) headers['X-Oxford-Form-Token'] = FORM_TOKEN
      const res = await fetch(WEBHOOK_URL, { method: 'POST', headers, body: JSON.stringify(payload), keepalive: true })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      succeeded.current.add(stageNum)
      return true
    } catch (err) {
      if (DEBUG) console.error('[Oxford form] stage', stageNum, 'failed', err)
      return false
    }
  }

  function finishDone() {
    clearProgress()
    if (REDIRECT_URL) { window.location.href = REDIRECT_URL; return }
    setStatus('done')
  }

  // Milestone: stop here. Make sure this stage's lead has landed, then finish.
  async function milestoneFinish() {
    setFormError('')
    setStatus('submitting')
    const ok = await submitStage(stage)   // re-send latest; n8n upserts on leadUuid
    if (ok) finishDone()
    else { setStatus('filling'); setFormError("We couldn't submit your request. Please try again.") }
  }
  // Milestone: keep going. The next stage's fire will include everything so far.
  function milestoneContinue() {
    setFormError('')
    if (!attempted.current.has(stage)) { attempted.current.add(stage); submitStage(stage).catch(() => {}) }
    setDir('fwd')
    const nxt = nextVisible(index, answers)
    setHistory((h) => [...h, index])
    if (nxt !== -1) setIndex(nxt)
  }

  const submitting = status === 'submitting'

  return (
    <div className="ohl-card" ref={cardRef}>
      <aside className="ohl-aside">
        <img className="ohl-eagle-mark" src={eagleMark} alt="" aria-hidden="true" />
        <div className="ohl-aside-top">
          <img className="ohl-logo" src={logoReverse} alt="Oxford Home Lending" />
          <h1 className="ohl-aside-head">Your mortgage,<br />made simple.</h1>
          <p className="ohl-aside-sub">{panelLine(node, answers)}</p>
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
          <Success firstName={capitalize(answers.contact && answers.contact.firstName)} logo={logoFull} />
        ) : (
          <>
            {/* Honeypot stays mounted across steps so its value is readable at submit time. */}
            <div className="ohl-hp" aria-hidden="true">
              <label htmlFor="ohl_company">Company (leave blank)</label>
              <input ref={honeypotRef} id="ohl_company" name="company" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
            </div>

            <StageHeader stages={STAGES} stage={stage} pct={pct} />

            {isMilestone ? (
              <div className="ohl-flow">
                <Milestone
                  node={node}
                  answers={answers}
                  submitting={submitting}
                  canBack={history.length > 0}
                  onBack={goBack}
                  onContinue={milestoneContinue}
                  onFinish={milestoneFinish}
                />
                {formError && <div className="ohl-form-err" role="alert">{formError}</div>}
              </div>
            ) : (
              <form className="ohl-flow" onSubmit={onFormSubmit} noValidate>
                {formError && <div className="ohl-form-err" role="alert">{formError}</div>}
                <Step
                  step={node}
                  answers={answers}
                  errors={errors}
                  dir={dir}
                  handlers={{ setContact, setAddress, setSelect, chooseSingle, setConsent, setField }}
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
                  {node.type !== 'single' && (
                    <button type="submit" className="ohl-next" disabled={submitting}>
                      Continue
                    </button>
                  )}
                </div>
              </form>
            )}

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

function StageHeader({ stages, stage, pct }) {
  return (
    <div className="ohl-stagewrap">
      <div className="ohl-stages">
        {stages.map((s, i) => {
          const state = s.id < stage ? 'done' : s.id === stage ? 'active' : 'todo'
          return (
            <div key={s.id} className={'ohl-stage ohl-stage-' + state}>
              <span className="ohl-stage-dot">
                {s.id < stage
                  ? <svg viewBox="0 0 24 24" fill="none"><path d="m6 12.5 4 4 8-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  : s.id}
              </span>
              <span className="ohl-stage-name">{s.name}</span>
            </div>
          )
        })}
      </div>
      <div className="ohl-progress"><div className="ohl-progress-bar" style={{ width: pct + '%' }} /></div>
    </div>
  )
}

function Milestone({ node, answers, submitting, canBack, onBack, onContinue, onFinish }) {
  const title = resolve(node.title, answers)
  return (
    <div className="ohl-step ohl-milestone">
      <div className="ohl-ms-check">
        <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill="#C42D2D" /><path d="m7 12.4 3.2 3.2L17 8.8" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      {node.eyebrow && <div className="ohl-eyebrow ohl-eyebrow-ok">{node.eyebrow}</div>}
      <h2 className="ohl-title">{title}</h2>
      <p className="ohl-ms-body">{node.body}</p>
      <div className="ohl-ms-actions">
        {node.continueLabel ? (
          <>
            <button type="button" className="ohl-next ohl-ms-go" onClick={onContinue} disabled={submitting}>
              {node.continueLabel}
              <svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button type="button" className="ohl-ms-stop" onClick={onFinish} disabled={submitting}>
              {submitting ? 'Submitting...' : node.finishLabel}
            </button>
          </>
        ) : (
          <button type="button" className="ohl-next finish ohl-ms-final" onClick={onFinish} disabled={submitting}>
            {submitting ? 'Submitting...' : node.finishLabel}
          </button>
        )}
        {canBack && (
          <button type="button" className="ohl-ms-back" onClick={onBack} disabled={submitting}>
            Go back and edit
          </button>
        )}
      </div>
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
      <p>Thanks for sharing the details. A licensed Oxford Home Lending mortgage advisor will review your information and reach out shortly.</p>
      <span className="ohl-next-steps">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /></svg>
        Most clients hear back the same business day.
      </span>
    </div>
  )
}
