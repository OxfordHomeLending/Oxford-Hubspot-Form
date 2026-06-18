import { STATES } from './flow'
import { resolve } from './personalize'

const letter = (i) => String.fromCharCode(65 + i)

const Shield = () => (
  <svg viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
)

export default function Step({ step, answers, errors, dir, handlers }) {
  const title = resolve(step.title, answers)
  const sub = step.sub ? resolve(step.sub, answers) : null

  return (
    <div className={'ohl-step ohl-' + (dir || 'fwd')} key={step.id}>
      {step.eyebrow && <div className="ohl-eyebrow">{step.eyebrow}</div>}
      <h2 className="ohl-title">{title}</h2>
      {sub && <p className="ohl-sub">{sub}</p>}
      {step.note && <div className="ohl-note"><Shield />{step.note}</div>}

      {step.type === 'firstname' && <FirstNameField answers={answers} errors={errors} onChange={handlers.setContact} />}
      {step.type === 'reach' && <ReachFields answers={answers} errors={errors} onChange={handlers.setContact} />}
      {step.type === 'address' && <AddressFields step={step} answers={answers} errors={errors} onChange={handlers.setAddress} />}
      {step.type === 'select' && <SelectField step={step} answers={answers} errors={errors} onChange={handlers.setSelect} />}
      {step.type === 'single' && <SingleOptions step={step} answers={answers} onChoose={handlers.chooseSingle} />}
      {step.type === 'consent' && <Consent step={step} answers={answers} errors={errors} onToggle={handlers.setConsent} />}
    </div>
  )
}

function Field({ label, name, type = 'text', value, placeholder, autoComplete, inputMode, error, onChange, autoFocus }) {
  return (
    <div className={'ohl-fld' + (error ? ' bad' : '')}>
      <label className="ohl-lbl" htmlFor={'f_' + name}>{label}</label>
      <input
        className="ohl-in"
        id={'f_' + name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value || ''}
        onChange={(e) => onChange(name, e.target.value)}
      />
      {error && <span className="ohl-err">Please complete this field.</span>}
    </div>
  )
}

function FirstNameField({ answers, errors, onChange }) {
  const c = answers.contact || {}
  return (
    <Field label="First name" name="firstName" value={c.firstName} autoComplete="given-name" placeholder="Jane" error={errors.firstName} onChange={onChange} autoFocus />
  )
}

function ReachFields({ answers, errors, onChange }) {
  const c = answers.contact || {}
  return (
    <>
      <Field label="Last name" name="lastName" value={c.lastName} autoComplete="family-name" placeholder="Doe" error={errors.lastName} onChange={onChange} autoFocus />
      <Field label="Email" name="email" type="email" inputMode="email" value={c.email} autoComplete="email" placeholder="jane@email.com" error={errors.email} onChange={onChange} />
      <Field label="Phone" name="phone" type="tel" inputMode="tel" value={c.phone} autoComplete="tel" placeholder="(614) 555 0142" error={errors.phone} onChange={onChange} />
    </>
  )
}

function AddressFields({ answers, step, errors, onChange }) {
  const a = answers[step.key] || {}
  return (
    <>
      <Field label="Street address" name="street" value={a.street} autoComplete="address-line1" placeholder="123 Main St" error={errors.street} onChange={onChange} autoFocus />
      <div className="ohl-grid">
        <Field label="City" name="city" value={a.city} autoComplete="address-level2" placeholder="Columbus" error={errors.city} onChange={onChange} />
        <div className={'ohl-fld' + (errors.state ? ' bad' : '')}>
          <label className="ohl-lbl" htmlFor="f_state">State</label>
          <select className="ohl-sel" id="f_state" value={a.state || ''} onChange={(e) => onChange('state', e.target.value)}>
            <option value="" disabled>Select</option>
            {STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
          {errors.state && <span className="ohl-err">Required.</span>}
        </div>
      </div>
      <Field label="ZIP code" name="zip" inputMode="numeric" value={a.zip} autoComplete="postal-code" placeholder="43004" error={errors.zip} onChange={onChange} />
    </>
  )
}

function SelectField({ step, answers, errors, onChange }) {
  return (
    <div className={'ohl-fld' + (errors[step.key] ? ' bad' : '')}>
      <select className="ohl-sel" id={'f_' + step.key} value={answers[step.key] || ''} onChange={(e) => onChange(e.target.value)} autoFocus>
        <option value="" disabled>{step.placeholder || 'Select'}</option>
        {step.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {errors[step.key] && <span className="ohl-err">Please choose an option.</span>}
    </div>
  )
}

function SingleOptions({ step, answers, onChoose }) {
  const chosen = answers[step.key]
  return (
    <div className="ohl-opts">
      {step.options.map((o, i) => (
        <button
          type="button"
          key={o}
          className={'ohl-opt' + (chosen === o ? ' sel' : '')}
          onClick={() => onChoose(o)}
        >
          <span className="ohl-badge">{letter(i)}</span>
          <span className="ohl-opt-label">{o}</span>
        </button>
      ))}
    </div>
  )
}

function Consent({ step, answers, errors, onToggle }) {
  const on = answers[step.key] === 'Yes'
  return (
    <label className={'ohl-consent' + (errors[step.key] ? ' bad' : '')}>
      <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />
      <span>
        <span dangerouslySetInnerHTML={{ __html: step.text }} />
        <br /><br />
        <strong>{step.checkLabel}</strong>
      </span>
    </label>
  )
}
