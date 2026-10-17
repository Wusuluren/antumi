// A turn can run for an hour, and everything that says so loops for as long as it does. While the
// window is not the one being used, [data-resting] holds those loops still: their frames went to a
// window nobody was watching, and each one kept the compositor awake to draw it. A hidden window
// stops drawing on its own; an unfocused one on another screen does not, which is the case this is
// for. Only the loops rest — what enters or leaves still animates, so nothing is left half-drawn
// for the moment the window comes back.
function apply(): void {
  const resting = document.hidden || !document.hasFocus()
  if (resting) document.documentElement.dataset.resting = ''
  else delete document.documentElement.dataset.resting
}

export function startBackgroundRest(): void {
  apply()
  window.addEventListener('focus', apply)
  window.addEventListener('blur', apply)
  document.addEventListener('visibilitychange', apply)
}
