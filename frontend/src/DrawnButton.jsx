// The hand-drawn buttons. The artwork *is* the button -- no chrome around it --
// so the label rides along as the accessible name. Behaves like the drawn
// "press space" prompts on the intro: flickers to draw the eye, then settles
// and swells once the pointer lands on it (see .btn-drawn in index.css).

function DrawnButton({ src, label, className, ...props }) {
  return (
    <button
      type="button"
      className={className ? `btn-drawn ${className}` : 'btn-drawn'}
      aria-label={label}
      {...props}
    >
      <img className="btn-drawn__art" src={src} alt="" draggable="false" />
    </button>
  )
}

export default DrawnButton
