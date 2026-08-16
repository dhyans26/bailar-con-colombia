import { useCallback, useEffect } from 'react'
import DrawnButton from './DrawnButton.jsx'
import { publicAsset } from './publicAsset.js'
import { BUTTON_ART } from './story.js'

// shown once the player has a name locked in and hits Start, right before
// startGame() actually kicks off round 1 -- all three moves demoed side by
// side at once so there's no cycling to sit through, each with its own
// swinging hands/feet so the limbs read as clearly as the body does.

const EMP_ART = publicAsset('/emp-cutout.png')

// same source art + anchor points EmpanadaAvatar.jsx drives off live pose data;
// this popup has no pose feed to work from, so each limb instead swings on a
// fixed rest-to-rest arc (an unrotated stick reaches straight down from its
// anchor -- these are just the shoulder/hip fallback directions from
// EmpanadaAvatar, extended out to a full limb length).
const IMAGE_WIDTH = 577
const IMAGE_HEIGHT = 432
const LIMBS = [
  { name: 'left_arm', type: 'arm', side: 'left', anchor: { x: 166, y: 184 }, end: { x: 101, y: 210 } },
  { name: 'right_arm', type: 'arm', side: 'right', anchor: { x: 321, y: 155 }, end: { x: 386, y: 181 } },
  { name: 'left_leg', type: 'leg', side: 'left', anchor: { x: 226, y: 219 }, end: { x: 212, y: 288 } },
  { name: 'right_leg', type: 'leg', side: 'right', anchor: { x: 278, y: 215 }, end: { x: 292, y: 284 } },
]

// limbs = breadsticks NOT a line, same as EmpanadaAvatar
const STICK_WIDTH = 9
const OUTLINE_WIDTH = STICK_WIDTH + 4
const HIGHLIGHT_WIDTH = STICK_WIDTH * 0.35
// hand / foot cap at the tip of each limb
const CAP_RADIUS = 9

// the three moves the model is trained on (see backend/dataset/) get their own
// tailored css animation + blurb; anything else trained in later falls back to
// one of these three loops picked off the move's position so the popup never breaks
const MOVE_STYLE = { front_and_back: 'front-back', side_step: 'side-step', spin: 'spin' }
const FALLBACK_STYLES = ['front-back', 'side-step', 'spin']

const MOVE_COPY = {
  front_and_back: {
    title: 'Front & Back',
    blurb: 'Rock forward on the downbeat, then rock back.',
  },
  side_step: {
    title: 'Side Step',
    blurb: 'Step out to one side, tap, then the other.',
  },
  spin: {
    title: 'Spin',
    blurb: 'Plant your feet and spin all the way around.',
  },
}

const DISPLAY_NAME_LOWERCASE_WORDS = new Set(['and', 'of', 'the'])

function displayName(label) {
  return label
    .split('_')
    .map((w, i) => (i > 0 && DISPLAY_NAME_LOWERCASE_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

// the empanada body plus its four stick limbs, each swinging around its own
// anchor point -- gradient id is scoped fine since every card gets its own <svg>
function TutorialFigure({ style }) {
  return (
    <svg className="tutorial__figure-svg" viewBox={`0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}`}>
      <defs>
        <linearGradient id="tutorialBreadstick" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f7e2ab" />
          <stop offset="45%" stopColor="#e3a83f" />
          <stop offset="100%" stopColor="#a8641f" />
        </linearGradient>
      </defs>
      <image href={EMP_ART} x="0" y="0" width={IMAGE_WIDTH} height={IMAGE_HEIGHT} />
      {LIMBS.map((limb) => {
        const pts = `${limb.anchor.x},${limb.anchor.y} ${limb.end.x},${limb.end.y}`
        return (
          <g
            key={limb.name}
            className={`tutorial__limb tutorial__limb--${limb.type} tutorial__limb--${limb.side} tutorial__limb--${style}`}
            style={{ transformOrigin: `${limb.anchor.x}px ${limb.anchor.y}px` }}
          >
            {/* baked crust outline */}
            <polyline points={pts} fill="none" stroke="#5c3512" strokeWidth={OUTLINE_WIDTH} strokeLinecap="round" />
            {/* golden-brown breadstick body */}
            <polyline points={pts} fill="none" stroke="url(#tutorialBreadstick)" strokeWidth={STICK_WIDTH} strokeLinecap="round" />
            {/* crumb highlight down the center */}
            <polyline points={pts} fill="none" stroke="#fdf1d3" strokeWidth={HIGHLIGHT_WIDTH} strokeLinecap="round" opacity={0.55} />
            {/* the hand / foot itself */}
            <circle cx={limb.end.x} cy={limb.end.y} r={CAP_RADIUS} fill="url(#tutorialBreadstick)" stroke="#5c3512" strokeWidth={3} />
          </g>
        )
      })}
    </svg>
  )
}

function DanceTutorial({ moves, onDone }) {
  const list = (moves || []).slice(0, 3)

  const confirm = useCallback(() => onDone(), [onDone])

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault()
        confirm()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onDone()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirm, onDone])

  // nothing trained to preview -- SalsaGame already warns about that case
  if (list.length === 0) return null

  return (
    <div className="tutorial-overlay" onClick={confirm}>
      <div
        className="tutorial-card card-drawn"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-heading"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="tutorial-heading" className="tutorial__title">
          Learn the Moves
        </h2>
        <p className="tutorial__subtitle">Watch all three, then match them when they're called out.</p>

        <div className="tutorial__grid">
          {list.map((move, i) => {
            const style = MOVE_STYLE[move] ?? FALLBACK_STYLES[i % FALLBACK_STYLES.length]
            const copy = MOVE_COPY[move] ?? {
              title: displayName(move),
              blurb: 'Watch and match it when it comes up.',
            }
            return (
              <div className="tutorial__move" key={move}>
                <div className="tutorial__stage">
                  <div className={`tutorial__figure tutorial__figure--${style}`}>
                    <TutorialFigure style={style} />
                  </div>
                </div>
                <p className="tutorial__move-title">{copy.title}</p>
                <p className="tutorial__blurb">{copy.blurb}</p>
              </div>
            )
          })}
        </div>

        <DrawnButton className="btn-drawn--start" src={BUTTON_ART.start} label="let's dance!" onClick={confirm} />
      </div>

      <DrawnButton
        className="tutorial__skip btn-drawn--skip"
        src={BUTTON_ART.skip}
        label="skip · esc"
        onClick={(e) => {
          e.stopPropagation()
          onDone()
        }}
      />
    </div>
  )
}

export default DanceTutorial
