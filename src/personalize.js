// Resolves a piece of copy that may be a plain string or a function of answers.
// This is what powers the dynamic, self referencing parts of the form (greeting
// the client by name, echoing their chosen state, and so on).
export function resolve(value, answers) {
  return typeof value === 'function' ? value(answers) : value
}
