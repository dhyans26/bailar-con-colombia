import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import Leaderboard from './Leaderboard.jsx'
import { BEATS, CLIMB_AUDIO, DEFAULT_HINT, TITLE } from './story.js'

// story.js to update the lore


const TITLE_INDEX = -1

function Intro({ onComplete, muted = false }) {
  // -1 is the title card, 0..n-1 index into BEATS.
  const [index, setIndex] = useState(TITLE_INDEX)
  const [showText, setShowText] = useState(true)

  const rootRef = useRef(null)
  const titleRef = useRef(null)
  const copyRef = useRef(null)
  const flashRef = useRef(null)
  const videoRefs = useRef([])

  const indexRef = useRef(TITLE_INDEX)
  const showTextRef = useRef(true)
  const mutedRef = useRef(muted)
  const doneRef = useRef(false)
  const busyRef = useRef(false)

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useLayoutEffect(() => {
    if (!titleRef.current) return
    gsap.set(titleRef.current, { xPercent: -50 })
  }, [])

  useLayoutEffect(() => {
    if (!showText || !copyRef.current) return
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
  }, [index, showText, reduced])

  useEffect(() => {
    mutedRef.current = muted
    videoRefs.current.forEach((v) => {
      if (v) v.muted = !CLIMB_AUDIO || muted
    })
  }, [muted])

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    busyRef.current = true
    videoRefs.current.forEach((v) => v?.pause())

    // The ambient track lives up in App

    if (reduced) {
      gsap.set(rootRef.current, { opacity: 0 })
      onComplete()
      return
    }

    const tl = gsap.timeline({ onComplete })
    tl.to(copyRef.current, { opacity: 0, duration: 0.4, ease: 'power1.in' }, 0)
    tl.to(flashRef.current, { opacity: 1, duration: 1.2, ease: 'power2.in' }, 0.2)
    tl.to(rootRef.current, { opacity: 0, duration: 1, ease: 'power2.out' }, 1.4)
  }, [onComplete, reduced])

  const playBeat = useCallback(
    (next) => {
      const video = videoRefs.current[next]
      const previous = next > 0 ? videoRefs.current[next - 1] : null

      busyRef.current = true
      indexRef.current = next
      showTextRef.current = false
      setIndex(next)
      setShowText(false)

      if (!video) { // MISSING CLIPPPP
        showTextRef.current = true
        setShowText(true)
        busyRef.current = false
        return
      }

      video.currentTime = 0
      video.muted = !CLIMB_AUDIO || mutedRef.current
      video.play().catch(() => {
        // autoplay with sound refused
        video.muted = true
        video.play().catch(() => {})
      })

      const fadeIn = gsap.to(video, {
        opacity: 1,
        duration: reduced ? 0 : 0.7,
        ease: 'power2.out',
        onComplete: () => {
          if (previous) gsap.set(previous, { opacity: 0 })
          busyRef.current = false
        },
      })

      if (next === 0 && titleRef.current) {
        gsap.to(titleRef.current.parentElement, {
          opacity: 0,
          duration: reduced ? 0 : 0.7,
          ease: 'power2.out',
        })
      }

      return fadeIn
    },
    [reduced],
  )

  const onEnded = useCallback((beat) => {
    if (beat !== indexRef.current) return
    showTextRef.current = true
    setShowText(true)
  }, [])

  const advance = useCallback(() => {
    // busy = a clip is crossfading in
    if (doneRef.current || busyRef.current) return

    // mid-clip: jump to the end 
    if (!showTextRef.current) {
      const video = videoRefs.current[indexRef.current]
      if (video && Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = video.duration
      } else {
        showTextRef.current = true
        setShowText(true)
      }
      return
    }

    const next = indexRef.current + 1
    if (next >= BEATS.length) {
      finish()
      return
    }
    playBeat(next)
  }, [finish, playBeat])

  useEffect(() => {
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

  const beat = index >= 0 ? BEATS[index] : null
  const onTitle = index === TITLE_INDEX

  return (
    <div className="intro" ref={rootRef} onClick={advance}>
      <div className="intro__sky" />

      {/* soft rolling meadow wash so the sky doesn't cut straight to the grass line */}
      <svg className="scene__meadow" viewBox="0 0 1200 160" preserveAspectRatio="none">
        <path
          d="M0 160 L0 66 C110 40 190 78 310 58 C450 34 560 74 690 52 C840 28 970 66 1090 44 L1200 56 L1200 160 Z"
          fill="currentColor"
        />
      </svg>

      <div className="scene__ground" />

      <div className="intro__title-card">
        <img src={TITLE.image} alt="" ref={titleRef} draggable="false" />
        <img
          className="intro__capybara"
          src="/sra-capybara-con-dress.png"
          alt=""
          draggable="false"
        />
      </div>

      {/* palms flank the church so the sides of the title card aren't bare sky */}
      <div className="scene__palms">
        <img className="scene__palm scene__palm--edge-left" src="/tree_coconut.png" alt="" />
        <img className="scene__palm scene__palm--near-left" src="/tree.png" alt="" />
        <img className="scene__palm scene__palm--near-right" src="/tree_coconut.png" alt="" />
        <img className="scene__palm scene__palm--edge-right" src="/tree.png" alt="" />
      </div>

      {onTitle && (
        <div className="intro__leaderboard" onClick={(e) => e.stopPropagation()}>
          <Leaderboard refreshSignal={0} />
        </div>
      )}

      {BEATS.map((b, i) => (
        <video
          key={b.video}
          ref={(el) => {
            videoRefs.current[i] = el
          }}
          className="intro__video"
          src={b.video}
          // the current clip and the next one are worth fetching
          preload={i <= index + 1 ? 'auto' : 'none'}
          muted={!CLIMB_AUDIO}
          playsInline
          onEnded={() => onEnded(i)}
        />
      ))}

      <div className="intro__vignette" />
      <div className="intro__flash" ref={flashRef} />

      {showText && (
        <div
          className={onTitle ? 'intro__copy intro__copy--title' : 'intro__copy'}
          ref={copyRef}
          key={index}
        >
          {onTitle && <h1 className="intro__heading">{TITLE.title}</h1>}
          {onTitle && <p className="intro__subtitle">{TITLE.subtitle}</p>}
          {beat && <p className="intro__text">{beat.text}</p>}
          <p className="intro__hint">
            {(onTitle ? TITLE.hint : beat?.hint) ?? DEFAULT_HINT}
          </p>
        </div>
      )}

      <button
        className="intro__skip"
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          finish()
        }}
      >
        skip · esc
      </button>
    </div>
  )
}

export default Intro
