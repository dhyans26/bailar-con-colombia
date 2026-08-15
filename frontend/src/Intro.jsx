import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { BEATS, CLIMB_AUDIO, DEFAULT_HINT, TITLE } from './story.js'

// The ride up Monserrate. A title card, then one gondola clip per beat: the
// clip plays, freezes on its last frame, its line of text fades in, and space
// moves on. After the last beat the sun washes the whole thing out and hands
// over to the game.
//
// All copy lives in story.js — nothing to edit in here to change the words.

const TITLE_INDEX = -1

function Intro({ onComplete }) {
  // -1 is the title card, 0..n-1 index into BEATS.
  const [index, setIndex] = useState(TITLE_INDEX)
  // Text only appears once the clip for this beat has finished.
  const [showText, setShowText] = useState(true)

  const rootRef = useRef(null)
  const titleRef = useRef(null)
  const copyRef = useRef(null)
  const flashRef = useRef(null)
  const videoRefs = useRef([])

  const indexRef = useRef(TITLE_INDEX)
  const showTextRef = useRef(true)
  const doneRef = useRef(false)
  const busyRef = useRef(false)

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Slow drift on the title image so the start screen is not dead still.
  useLayoutEffect(() => {
    if (!titleRef.current) return
    gsap.set(titleRef.current, { xPercent: -50 })
    if (reduced) return
    const tween = gsap.to(titleRef.current, { scale: 1.12, duration: 24, ease: 'none' })
    return () => tween.kill()
  }, [reduced])

  // Fade each line in as it arrives.
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

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    busyRef.current = true
    videoRefs.current.forEach((v) => v?.pause())

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

  // Start the clip for `next`, crossfading over whatever is on screen.
  const playBeat = useCallback(
    (next) => {
      const video = videoRefs.current[next]
      const previous = next > 0 ? videoRefs.current[next - 1] : null

      busyRef.current = true
      indexRef.current = next
      showTextRef.current = false
      setIndex(next)
      setShowText(false)

      if (!video) {
        // Missing clip: fall through to the text rather than dead-ending.
        showTextRef.current = true
        setShowText(true)
        busyRef.current = false
        return
      }

      video.currentTime = 0
      video.muted = !CLIMB_AUDIO
      video.play().catch(() => {
        // Autoplay with sound refused — retry silently instead of stalling.
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

      // The title card only ever leaves once.
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
    // busy = a clip is crossfading in, so a fast double-tap cannot blow
    // straight through the clip that just started.
    if (doneRef.current || busyRef.current) return

    // Mid-clip: jump to the end rather than making the player wait it out.
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

      <div className="intro__title-card">
        <img src={TITLE.image} alt="" ref={titleRef} draggable="false" />
      </div>

      {BEATS.map((b, i) => (
        <video
          key={b.video}
          ref={(el) => {
            videoRefs.current[i] = el
          }}
          className="intro__video"
          src={b.video}
          // Only the current clip and the next one are worth fetching; the
          // rest stay cold so a four-clip climb does not download at once.
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
