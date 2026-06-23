import { STATES } from './flow'
import { resolve } from './personalize'

const letter = (i) => String.fromCharCode(65 + i)

const Shield = () => (
  <svg viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
)

export default function Step({ step, answers, errors, dir, handlers }) {
  const title = resolve(step.title, answers)
  const sub = step.sub ? resolve(step.sub, answers) : null
  const note = step.note ? resolve(step.note, answers) : null

  return (
    <div className={'ohl-step ohl-anim-' + (dir || 'fwd')} key={step.key}>
      {step.eyebrow && <div className="ohl-eyebrow">{step.eyebrow}</div>}
      <h2 className="ohl-title">{title}</h2>
      {sub && <p className="ohl-sub">{sub}</p>}
      {note && <div className="ohl-note"><Shield />{note}</div>}

      {step.type === 'firstname' && <FirstNameField answers={answers} errors={errors} onChange={handlers.setContact} />}
      {step.type === 'reach' && <ReachFields answers={answers} errors={errors} onChange={handlers.setContact} />}
      {step.type === 'address' && <AddressFields step={step} answers={answers} errors={errors} onChange={handlers.setAddress} />}
      {step.type === 'select' && <SelectField step={step} answers={answers} errors={errors} onChange={handlers.setSelect} />}
      {step.type === 'single' && <SingleOptions step={step} answers={answers} onChoose={handlers.chooseSingle} />}
      {step.type === 'text' && <TextField step={step} answers={answers} errors={errors} onChange={handlers.setField} />}
      {step.type === 'date' && <DateField step={step} answers={answers} errors={errors} onChange={handlers.setField} />}
      {step.type === 'ssn' && <SSNField step={step} answers={answers} errors={errors} onChange={handlers.setField} />}
      {step.type === 'consent' && <Consent step={step} answers={answers} errors={errors} onToggle={handlers.setConsent} />}
    </div>
  )
}

function Field({ label, name, type = 'text', value, placeholder, autoComplete, inputMode, error, errorMsg, onChange, autoFocus, max }) {
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
        max={max}
        value={value || ''}
        onChange={(e) => onChange(name, e.target.value)}
      />
      {error && <span className="ohl-err">{errorMsg || 'Please complete this field.'}</span>}
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
      <Field label="Email" name="email" type="email" inputMode="email" value={c.email} autoComplete="email" placeholder="jane@email.com" error={errors.email} errorMsg="Enter a valid email." onChange={onChange} />
      <Field label="Phone" name="phone" type="tel" inputMode="tel" value={c.phone} autoComplete="tel" placeholder="(614) 555 0142" error={errors.phone} errorMsg="Enter a valid phone number." onChange={onChange} />
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
      <select className="ohl-sel" id={'f_' + step.key} value={answers[step.key] || ''} onChange={(e) => onChange(e.target.value)}>
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

function TextField({ step, answers, errors, onChange }) {
  return (
    <Field
      label={step.fieldLabel || 'Your answer'}
      name={step.key}
      value={answers[step.key]}
      placeholder={step.placeholder}
      autoComplete={step.autoComplete || 'off'}
      error={errors[step.key]}
      onChange={onChange}
      autoFocus
    />
  )
}

function DateField({ step, answers, errors, onChange }) {
  const today = new Date().toISOString().slice(0, 10)
  return (
    <Field
      label={step.fieldLabel || 'Date of birth'}
      name={step.key}
      type="date"
      value={answers[step.key]}
      error={errors[step.key]}
      errorMsg="Enter a valid date. You must be at least 18."
      max={today}
      onChange={onChange}
    />
  )
}

// Formats to XXX-XX-XXXX as the person types; stores the formatted value.
function formatSSN(raw) {
  const d = (raw || '').replace(/[^0-9]/g, '').slice(0, 9)
  if (d.length <= 3) return d
  if (d.length <= 5) return d.slice(0, 3) + '-' + d.slice(3)
  return d.slice(0, 3) + '-' + d.slice(3, 5) + '-' + d.slice(5)
}

function SSNField({ step, answers, errors, onChange }) {
  return (
    <div className={'ohl-fld' + (errors[step.key] ? ' bad' : '')}>
      <label className="ohl-lbl" htmlFor={'f_' + step.key}>Social Security number</label>
      <input
        className="ohl-in"
        id={'f_' + step.key}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="123-45-6789"
        value={answers[step.key] || ''}
        onChange={(e) => onChange(step.key, formatSSN(e.target.value))}
        autoFocus
      />
      {errors[step.key] && <span className="ohl-err">Enter all 9 digits.</span>}
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
