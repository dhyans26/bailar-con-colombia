import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import {
  BUTTON_ART,
  DEFAULT_HINT,
  DEFAULT_HINT_IMAGE,
  LICENSE_DIALOGUE_FAIL,
  LICENSE_DIALOGUE_PASS,
  LICENSE_IMAGE,
  LICENSE_SCORE_THRESHOLD,
} from './story.js'
import DrawnButton from './DrawnButton.jsx'

// story.js to update the lines

function fillTemplate(text, values) {
  return text.replace(/\{(\w+)\}/g, (match, key) => (key in values ? values[key] : match))
}

// maps a dialogue line's display-name speaker to the scene character it should wiggle
const SPEAKER_KEY = { 'Cabí': 'cabi', Empanada: 'empanada' }

// Cabí talks to Empanada after the last round -- grants (or withholds) his salsa license
function EndCutscene({ passed, score, maxScore, onComplete, onSpeakerChange }) {
  const [index, setIndex] = useState(0)

  const rootRef = useRef(null)
  const copyRef = useRef(null)
  const doneRef = useRef(false)

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const lines = passed ? LICENSE_DIALOGUE_PASS : LICENSE_DIALOGUE_FAIL
  const values = { score, maxScore, threshold: LICENSE_SCORE_THRESHOLD }
  const line = lines[index]
  const isLast = index === lines.length - 1
  const showLicense = passed && isLast

  useLayoutEffect(() => {
    if (!copyRef.current) return
    gsap.fromTo(
      copyRef.current.children,
      { opacity: 0, y: 18 },
      {
        opacity: 1,
        y: 0,
        duration: reduced ? 0 : 0.7,
        stagger: reduced ? 0 : 0.12,
        ease: 'power2.out',
        overwrite: true,
      },
    )
  }, [index, reduced])

  // wiggle whichever character is currently speaking; stop wiggling once the cutscene is gone
  useEffect(() => {
    onSpeakerChange?.(SPEAKER_KEY[line.speaker] ?? null)
  }, [line, onSpeakerChange])

  useEffect(() => {
    return () => onSpeakerChange?.(null)
  }, [onSpeakerChange])

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true

    if (reduced) {
      onComplete()
      return
    }

    gsap.to(rootRef.current, {
      opacity: 0,
      duration: 0.5,
      ease: 'power1.in',
      onComplete,
    })
  }, [onComplete, reduced])

  const advance = useCallback(() => {
    if (doneRef.current) return
    if (isLast) {
      finish()
      return
    }
    setIndex((i) => i + 1)
  }, [finish, isLast])

  useLayoutEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault()
        advance()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        finish()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance, finish])

  return (
    <div className="cutscene-overlay" ref={rootRef} onClick={advance}>
      <div className="cutscene__box" ref={copyRef} key={index}>
        <p className="cutscene__speaker">{line.speaker}</p>
        <p className="cutscene__text">{fillTemplate(line.text, values)}</p>
        {showLicense && (
          <img className="cutscene__license" src={LICENSE_IMAGE} alt="Salsa license" />
        )}
        {/* the drawn prompt, except on the license beat, which asks for
            something other than the plain "space to continue" */}
        {isLast && passed ? (
          <p className="cutscene__hint">space to claim your license</p>
        ) : (
          <img
            className="cutscene__hint cutscene__hint--drawn"
            src={DEFAULT_HINT_IMAGE}
            alt={DEFAULT_HINT}
            draggable="false"
          />
        )}
      </div>

      <DrawnButton
        className="cutscene__skip btn-drawn--skip"
        src={BUTTON_ART.skip}
        label="skip · esc"
        onClick={(e) => {
          e.stopPropagation()
          finish()
        }}
      />
    </div>
  )
}

export default EndCutscene
