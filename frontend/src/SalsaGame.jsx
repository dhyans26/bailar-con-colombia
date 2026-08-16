import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient.js'
import EndCutscene from './EndCutscene.jsx'
import DanceTutorial from './DanceTutorial.jsx'

import DrawnButton from './DrawnButton.jsx'
import { publicAsset } from './publicAsset.js'
import { BUTTON_ART, LICENSE_SCORE_THRESHOLD } from './story.js'


const ROUNDS_PER_GAME = 5
const READY_MS = 2000
const PERFORM_MS = 2000

// 3-2-1-start countdown
const COUNTDOWN_STEPS = ['3', '2', '1', 'START!']
const COUNTDOWN_STEP_MS = 700

const GAME_MUSIC_TRACKS = [
  encodeURI(publicAsset('/game-music/La Vida Es Un Carnaval - Celia Cruz [0nBFWzpWXuM].opus')),
  encodeURI(publicAsset('/game-music/markanthony.mp3')),
]

const GAME_MUSIC_VOLUME = 0.55

function pickTrack() {
  return GAME_MUSIC_TRACKS[Math.floor(Math.random() * GAME_MUSIC_TRACKS.length)]
}

function playableMoves(labels) {
  return (labels || []).filter((label) => label !== 'idle')
}

const DISPLAY_NAME_LOWERCASE_WORDS = new Set(['and', 'of', 'the'])

function displayName(label) {
  return label
    .split('_')
    .map((w, i) => (i > 0 && DISPLAY_NAME_LOWERCASE_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

function pickTarget(moves, avoid) {
  const options = moves.length > 1 ? moves.filter((m) => m !== avoid) : moves
  return options[Math.floor(Math.random() * options.length)]
}

// 100 points = 1 star, so a 5 round game is 5 stars
const POINTS_PER_STAR = 100

// the drawn star -- the meter stacks two copies of it, a ghosted one for the
// empty state and a full-colour one revealed from the bottom as points land
const STAR_ART = publicAsset('/star.png')

// just dance meter that fills up as u gain scores
function DanceMeter({ score, maxScore }) {
  const totalStars = maxScore / POINTS_PER_STAR
  const starsEarned = Math.max(0, Math.min(totalStars, score / POINTS_PER_STAR))

  return (
    <div
      className="dance-meter"
      role="img"
      aria-label={`${score} of ${maxScore} points, ${starsEarned.toFixed(1)} of ${totalStars} stars`}
    >
      <div className="dance-meter__stars" aria-hidden="true">
        {Array.from({ length: totalStars }).map((_, i) => {
          const fill = Math.max(0, Math.min(1, starsEarned - i)) * 100
          return (
            <span className="dance-meter__star" key={i}>
              <img
                className="dance-meter__star-art dance-meter__star-outline"
                src={STAR_ART}
                alt=""
                draggable="false"
              />
              <span className="dance-meter__star-fill" style={{ height: `${fill}%` }}>
                <img className="dance-meter__star-art" src={STAR_ART} alt="" draggable="false" />
              </span>
            </span>
          )
        })}
      </div>
      <p className="dance-meter__score">
        {score} / {maxScore}
      </p>
    </div>
  )
}

// the move to nail this round
function DanceCallout({ round, target, countdown, poseDetected, liveScore, maxScore }) {
  return createPortal(
    <div className="dance-callout">
      <p className="dance-callout__round">
        round {round + 1} / {ROUNDS_PER_GAME}
      </p>
      {countdown ? (
        <p className="dance-callout__countdown" key={countdown}>
          {countdown}
        </p>
      ) : (
        <p className="dance-callout__move">{displayName(target)}</p>
      )}
      {!poseDetected && <p className="dance-callout__warning">step into frame!</p>}
      <div className="dance-callout__meter">
        <DanceMeter score={liveScore} maxScore={maxScore} />
      </div>
    </div>,
    document.body,
  )
}

function SalsaGame({
  pose,
  prediction,
  health,
  playerName,
  onPlayerNameChange,
  onGameActiveChange,
  onSpeakerChange,
  onCutsceneActiveChange,
  onReturnToMenu,
  muted = false,
}) {
  const [phase, setPhase] = useState('lobby') // lobby | ready | perform | finished
  const [round, setRound] = useState(0)
  const [target, setTarget] = useState(null)
  const [roundScores, setRoundScores] = useState([])
  const [submitState, setSubmitState] = useState('idle') // idle | saving | done | error
  const [liveProb, setLiveProb] = useState(0) // best confidence seen this round, mirrored for live rendering
  const [showNamePrompt, setShowNamePrompt] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [cutsceneSeen, setCutsceneSeen] = useState(false)
  // 3-2-1-START! label shown only during round 1's ready phase; null the rest of the time.
  const [countdownLabel, setCountdownLabel] = useState(null)
  const maxProbRef = useRef(0)
  const submittedRef = useRef(false)
  const musicRef = useRef(null)
  const prevPhaseRef = useRef(phase)
  const trackRef = useRef(null)
  const lastTrackRef = useRef(null)
  const mutedRef = useRef(muted)

  const moves = playableMoves(health && health.labels)

  const startGame = () => {
    setRoundScores([])
    setSubmitState('idle')
    submittedRef.current = false
    setCutsceneSeen(false)
    setRound(0)
    setTarget(pickTarget(moves, null))
    trackRef.current = pickTrack()
    setPhase('ready')
  }

  // start game asks for a name first if one hasn't been captured yet, then a
  // quick tutorial popup previewing the moves before round 1 actually begins
  const handleStartClick = () => {
    if (!playerName.trim()) {
      setShowNamePrompt(true)
      return
    }
    setShowTutorial(true)
  }

  const submitName = () => {
    if (!playerName.trim()) return
    setShowNamePrompt(false)
    setShowTutorial(true)
  }

  // ready -> perform: round 1 gets a 3-2-1-start countdown
  useEffect(() => {
    if (phase !== 'ready') return
    if (round !== 0) {
      const id = setTimeout(() => setPhase('perform'), READY_MS)
      return () => clearTimeout(id)
    }
    let step = 0
    setCountdownLabel(COUNTDOWN_STEPS[0])
    const id = setInterval(() => {
      step += 1
      if (step < COUNTDOWN_STEPS.length) {
        setCountdownLabel(COUNTDOWN_STEPS[step])
      } else {
        clearInterval(id)
        setCountdownLabel(null)
        setPhase('perform')
      }
    }, COUNTDOWN_STEP_MS)
    return () => clearInterval(id)
  }, [phase, round])

  // Game music from public/game-music
  useEffect(() => {
    const audio = new Audio()
    audio.loop = true
    audio.volume = GAME_MUSIC_VOLUME
    audio.muted = mutedRef.current
    musicRef.current = audio
    return () => {
      audio.pause()
      audio.src = ''
      musicRef.current = null
    }
  }, [])

  useEffect(() => {
    mutedRef.current = muted
    if (musicRef.current) musicRef.current.muted = muted
  }, [muted])

  // lets App duck the lobby music while Cabí and Empanada are talking
  useEffect(() => {
    onCutsceneActiveChange?.(phase === 'finished' && !cutsceneSeen)
  }, [phase, cutsceneSeen, onCutsceneActiveChange])

  useEffect(() => {
    const audio = musicRef.current
    if (!audio) return
    const inPlay = phase === 'ready' || phase === 'perform'
    const wasInPlay = prevPhaseRef.current === 'ready' || prevPhaseRef.current === 'perform'
    prevPhaseRef.current = phase
    onGameActiveChange(inPlay)
    if (inPlay) {
      if (!wasInPlay && trackRef.current) {
        if (lastTrackRef.current !== trackRef.current) {
          lastTrackRef.current = trackRef.current
          audio.src = trackRef.current
          audio.load()
        }
        audio.currentTime = 0
      }
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  }, [phase, onGameActiveChange])

  // perform window: reset the tracker, then score whatever was captured
  useEffect(() => {
    if (phase !== 'perform') return
    maxProbRef.current = 0
    setLiveProb(0)
    const id = setTimeout(() => {
      const score = Math.round(maxProbRef.current * 100)
      setRoundScores((prev) => {
        const next = [...prev, { move: target, score }]
        return next
      })
      const nextRound = round + 1
      if (nextRound < ROUNDS_PER_GAME) {
        setTarget(pickTarget(moves, target))
        setRound(nextRound)
        setPhase('ready')
      } else {
        setPhase('finished')
      }
    }, PERFORM_MS)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // track the best confidence seen for the target move during the perform window
  useEffect(() => {
    if (phase !== 'perform' || !target || !prediction || !prediction.ready) return
    const prob = prediction.probabilities[target] || 0
    if (prob > maxProbRef.current) {
      maxProbRef.current = prob
      setLiveProb(prob) // drives the live meter cuz maxProbRef can't trigger a re-render
    }
  }, [prediction, phase, target])

  const totalScore = roundScores.reduce((sum, r) => sum + r.score, 0)
  const maxScore = ROUNDS_PER_GAME * POINTS_PER_STAR
  // during a round, add in the live-tracked estimate so the meter moves as you dance
  const liveScore = phase === 'perform' ? totalScore + Math.round(liveProb * 100) : totalScore

  // The name was captured on the title card

  useEffect(() => {
    if (phase !== 'finished' || submittedRef.current) return
    const name = playerName.trim()
    if (!name) return
    submittedRef.current = true
    let cancelled = false
    setSubmitState('saving')

    supabase
      .rpc('submit_score', {
        p_player_name: name,
        p_score: totalScore,
        p_moves_played: ROUNDS_PER_GAME,
      })
      .then(({ error }) => {
        if (cancelled) return
        setSubmitState(error ? 'error' : 'done')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  return (
    <div>
      {phase !== 'ready' && phase !== 'perform' && (
        <h1
          className={
            'game__title' + (phase === 'finished' && !cutsceneSeen ? ' title--cutscene' : '')
          }
        >
          <img
            className="game__title-logo"
            src={publicAsset('/baile_logo.png')}
            alt="Baile Salsa para Cabí con Sr Empanada"
            draggable="false"
          />
        </h1>
      )}

      {!health && <p>connecting to backend...</p>}

      {health && moves.length === 0 && (
        <p>
          no playable moves trained yet (only "idle" is trained) -- record some salsa moves with
          backend/dataset_recorder.py and retrain the model.
        </p>
      )}

      {moves.length > 0 && phase === 'lobby' && (
        <div>
          <p>
            You have five rounds to bailar your heart out and get as many points as you can...
          </p>
          <DrawnButton
            className="btn-drawn--start"
            src={BUTTON_ART.start}
            label="Start Game"
            onClick={handleStartClick}
          />
        </div>
      )}

      {showNamePrompt && (
        <div className="name-prompt-overlay" onClick={(e) => e.stopPropagation()}>
          <div
            className="name-prompt-card card-drawn"
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-name-heading"
          >
            <h2 id="game-name-heading">What's your name?</h2>
            <p>This name will be on the leaderboard.</p>
            <input
              type="text"
              placeholder="e.g. Juan"
              value={playerName}
              maxLength={40}
              autoFocus
              onChange={(e) => onPlayerNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitName()
              }}
            />
            <DrawnButton
              className="btn-drawn--start"
              src={BUTTON_ART.start}
              label="Start Game"
              onClick={submitName}
              disabled={!playerName.trim()}
            />
          </div>
        </div>
      )}

      {showTutorial && (
        <DanceTutorial
          moves={moves}
          onDone={() => {
            setShowTutorial(false)
            startGame()
          }}
        />
      )}

      {(phase === 'ready' || phase === 'perform') && (
        <DanceCallout
          round={round}
          target={target}
          countdown={countdownLabel}
          poseDetected={Boolean(pose && pose.person_detected)}
          liveScore={liveScore}
          maxScore={maxScore}
        />
      )}

      {phase === 'finished' && !cutsceneSeen && (
        <EndCutscene
          passed={totalScore > LICENSE_SCORE_THRESHOLD}
          score={totalScore}
          maxScore={maxScore}
          onComplete={() => setCutsceneSeen(true)}
          onSpeakerChange={onSpeakerChange}
        />
      )}

      {phase === 'finished' && cutsceneSeen && (
        <div className="finished">
          <div className="finished-body">
            <div className="finished-summary">
              <DanceMeter score={totalScore} maxScore={maxScore} />
            </div>

            <ul className="finished-rounds">
              {roundScores.map((r, i) => (
                <li key={i}>
                  <span className="finished-rounds__round">{i + 1}</span>
                  <span className="finished-rounds__move">{displayName(r.move)}</span>
                  <span className="finished-rounds__score">{r.score}</span>
                </li>
              ))}
            </ul>
          </div>

          {submitState === 'saving' && <p className="finished-status">submitting your score...</p>}
          {submitState === 'done' && <p className="finished-status">score saved!</p>}
          {submitState === 'error' && (
            <p className="finished-status finished-status--error">couldn't save your score.</p>
          )}

          <div className="finished-actions">
            <DrawnButton
              className="btn-drawn--play-again"
              src={BUTTON_ART.playAgain}
              label="play again"
              onClick={startGame}
            />
            <DrawnButton
              className="btn-drawn--home"
              src={BUTTON_ART.home}
              label="return to main menu"
              onClick={onReturnToMenu}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default SalsaGame
