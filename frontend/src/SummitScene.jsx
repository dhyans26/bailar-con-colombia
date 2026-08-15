import EmpanadaAvatar from './EmpanadaAvatar.jsx'

// EmpanadaAvatar always needs a pose object -- before the camera has ever
// seen a person (or when no `pose` prop is wired in at all), this stands in
// so the background dancer still renders, just idling on its fallback pose.
const EMPTY_POSE = { keypoints: [] }

// The stage the game is played on: the flat top of Monserrate, with the
// basilica standing in the background. `pose` is the same live pose feed
// driving the in-game avatar -- passing it here mirrors that avatar as an
// ambient dancer out on the summit, so it actually moves with you.
function SummitScene({ pose }) {
  return (
    <div className="scene" aria-hidden="true">
      <div className="scene__sky" />

      {/* far cordillera, just enough to read as "we are very high up" */}
      <svg className="scene__range" viewBox="0 0 1200 120" preserveAspectRatio="none">
        <path
          d="M0 120 L0 78 L90 52 L170 74 L260 40 L340 70 L430 46 L520 76 L610 54 L700 82 L800 58 L890 80 L980 50 L1070 74 L1140 56 L1200 72 L1200 120 Z"
          fill="currentColor"
        />
      </svg>

      <img className="scene__church" src="/church_monserrate.png" alt="" />
      <div className="scene__dancer">
        <EmpanadaAvatar pose={pose ?? EMPTY_POSE} />
      </div>
      <div className="scene__haze" />

      {/* ground paints over the church's steps so it reads as planted on the
          summit; its cast shadow then goes on top of the ground */}
      <div className="scene__ground">
        <div className="scene__floor-light" />
      </div>
      <div className="scene__church-shadow" />
    </div>
  )
}

export default SummitScene
