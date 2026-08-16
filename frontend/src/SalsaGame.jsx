import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient.js'
import EndCutscene from './EndCutscene.jsx'
import { LICENSE_SCORE_THRESHOLD } from './story.js'

const ROUNDS_PER_GAME = 5
const READY_MS = 2000
const PERFORM_MS = 2000

// 3-2-1-start countdown
const COUNTDOWN_STEPS = ['3', '2', '1', 'START!']
const COUNTDOWN_STEP_MS = 700

const GAME_MUSIC_TRACKS = [
  encodeURI('/game-music/La Vida Es Un Carnaval - Celia Cruz [0nBFWzpWXuM].opus'),
  encodeURI('/game-music/markanthony.mp3'),
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
              <span className="dance-meter__star-outline">★</span>
              <span className="dance-meter__star-fill" style={{ height: `${fill}%` }}>
                ★
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

  // start game asks for a name first if one hasn't been captured yet
  const handleStartClick = () => {
    if (!playerName.trim()) {
      setShowNamePrompt(true)
      return
    }
    startGame()
  }

  const submitName = () => {
    if (!playerName.trim()) return
    setShowNamePrompt(false)
    startGame()
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
      {phase !== 'ready' && phase !== 'perform' && <h1>Baile para Cabi</h1>}

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
            {ROUNDS_PER_GAME} rounds. Each round calls out a move, salsa it before time's up to
            score points.
          </p>
          <button onClick={handleStartClick}>Start Game</button>
        </div>
      )}

      {showNamePrompt && (
        <div className="name-prompt-overlay" onClick={(e) => e.stopPropagation()}>
          <div
            className="name-prompt-card"
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
            <button type="button" onClick={submitName} disabled={!playerName.trim()}>
              Start Game
            </button>
          </div>
        </div>
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
            <button onClick={startGame}>play again</button>
            <button onClick={onReturnToMenu}>return to main menu</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default SalsaGame
