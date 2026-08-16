import EmpanadaAvatar from './EmpanadaAvatar.jsx'

const EMPTY_POSE = { keypoints: [] } // senior emp needs ts otherwise he wont move broski

function SummitScene({ pose, speaker }) {
  return (
    <div className="scene" aria-hidden="true">
      <div className="scene__sky" />

      <svg className="scene__range" viewBox="0 0 1200 120" preserveAspectRatio="none">
        <path
          d="M0 120 L0 78 L90 52 L170 74 L260 40 L340 70 L430 46 L520 76 L610 54 L700 82 L800 58 L890 80 L980 50 L1070 74 L1140 56 L1200 72 L1200 120 Z"
          fill="currentColor"
        />
      </svg>

      {/* soft rolling meadow wash so the sky doesn't cut straight to the grass line */}
      <svg className="scene__meadow" viewBox="0 0 1200 160" preserveAspectRatio="none">
        <path
          d="M0 160 L0 66 C110 40 190 78 310 58 C450 34 560 74 690 52 C840 28 970 66 1090 44 L1200 56 L1200 160 Z"
          fill="currentColor"
        />
      </svg>

      <img className="scene__church" src="/church_monserrate.png" alt="" />
      <img
        className={`scene__capybara${speaker === 'cabi' ? ' scene__capybara--talking' : ''}`}
        src="/sra-capybara-con-dress.png"
        alt=""
      />

      {/* palms flank the church and dancer so the sides of the scene aren't bare sky;
          drawn before the dancer so the empanada reads as in front of the trees */}
      <div className="scene__palms">
        <img className="scene__palm scene__palm--edge-left" src="/tree_coconut.png" alt="" />
        <img className="scene__palm scene__palm--edge-right" src="/tree.png" alt="" />
      </div>

      <div className={`scene__dancer${speaker === 'empanada' ? ' scene__dancer--talking' : ''}`}>
        <EmpanadaAvatar pose={pose ?? EMPTY_POSE} />
      </div>
      <div className="scene__haze" />

      {/* grass drawn last (within the scene) so it sits in front of the dancer */}
      <div className="scene__ground" />

      <div className="scene__church-shadow" />
    </div>
  )
}

export default SummitScene
