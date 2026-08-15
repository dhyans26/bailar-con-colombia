import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient.js'

const ROUNDS_PER_GAME = 5
const READY_MS = 2000
const PERFORM_MS = 4000

// One entry per track in public/game-music -- each game starts with a random
// pick, so dropping a new song in the folder means adding it to this list too.
const GAME_MUSIC_TRACKS = [
  encodeURI('/game-music/La Vida Es Un Carnaval - Celia Cruz [0nBFWzpWXuM].opus'),
  encodeURI('/game-music/markanthony.mp3'),
]

const GAME_MUSIC_VOLUME = 0.55

function pickTrack() {
  return GAME_MUSIC_TRACKS[Math.floor(Math.random() * GAME_MUSIC_TRACKS.length)]
}

// "idle" is the model's do-nothing/rest class, not a move to call out and
// score against -- every other trained label is fair game. New labels
// recorded via dataset_recorder.py + train_lstm.py show up automatically.
function playableMoves(labels) {
  return (labels || []).filter((label) => label !== 'idle')
}

function displayName(label) {
  return label
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function pickTarget(moves, avoid) {
  const options = moves.length > 1 ? moves.filter((m) => m !== avoid) : moves
  return options[Math.floor(Math.random() * options.length)]
}

// 100 points = 1 star, so a 5-round game (max 500) tops out at 5 stars.
const POINTS_PER_STAR = 100

// A live star meter: fills up as you dance instead of only revealing the
// score at the end of a round, so there's something to react to in the
// moment. `score` can include an in-progress round's live-tracked estimate.
// Stacked vertically (bottom star fills first, like a level rising) so it
// reads at a glance from across the room instead of needing to be read
// left-to-right.
function DanceMeter({ score, maxScore }) {
  const totalStars = maxScore / POINTS_PER_STAR
  const starsEarned = Math.max(0, Math.min(totalStars, score / POINTS_PER_STAR))

  return (
    <div
      className="dance-meter"
      role="img"
      aria-label={`${score} of ${maxScore} points, ${starsEarned.toFixed(1)} of ${totalStars} stars`}
    >
      <p className="dance-meter__label">Just Dance Meter</p>
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

// The move to nail this round, blown up to fill the whole screen -- portalled
// straight to <body> so it escapes the boxed side panel (whose backdrop-filter
// would otherwise clip a position:fixed overlay to its own small width) and
// is actually readable from a few feet back, mid-dance.
function DanceCallout({ phase, round, target, poseDetected, liveScore, maxScore }) {
  return createPortal(
    <div className="dance-callout">
      <p className="dance-callout__round">
        round {round + 1} / {ROUNDS_PER_GAME}
      </p>
      <p className="dance-callout__go">{phase === 'ready' ? 'get ready...' : 'GO!'}</p>
      <p className="dance-callout__move">{displayName(target)}</p>
      {!poseDetected && <p className="dance-callout__warning">step into frame!</p>}
      <div className="dance-callout__meter">
        <DanceMeter score={liveScore} maxScore={maxScore} />
      </div>
    </div>,
    document.body,
  )
}

<<<<<<< HEAD
function SalsaGame({ pose, prediction, health, playerName, onGameActiveChange, muted = false }) {
=======
function SalsaGame({ pose, prediction, health, playerName, onGameActiveChange }) {
>>>>>>> c588afead891cdc7fec1ad2488a75665da8fa059
  const [phase, setPhase] = useState('lobby') // lobby | ready | perform | finished
  const [round, setRound] = useState(0)
  const [target, setTarget] = useState(null)
  const [roundScores, setRoundScores] = useState([])
  const [submitState, setSubmitState] = useState('idle') // idle | saving | done | error
  const [liveProb, setLiveProb] = useState(0) // best confidence seen this round, mirrored for live rendering
  const maxProbRef = useRef(0)
  const submittedRef = useRef(false)
  const musicRef = useRef(null)
  const prevPhaseRef = useRef(phase)
  const trackRef = useRef(null)
  const lastTrackRef = useRef(null)
<<<<<<< HEAD
  // App owns the mute flag (the M hotkey lives there, since it is the only
  // place that can see every track at once) and hands it down; the ref mirror
  // is for the setup effect, which must not re-run when it flips.
  const mutedRef = useRef(muted)
=======
  // Mirrors the mute pattern in Intro.jsx -- this file never had a mutedRef
  // of its own even though the game-music effect below reads one, which
  // threw a ReferenceError the instant a round started. No mute control is
  // wired up on this screen yet, so it just defaults to unmuted.
  const mutedRef = useRef(false)
>>>>>>> c588afead891cdc7fec1ad2488a75665da8fa059

  const moves = playableMoves(health && health.labels)

  const startGame = () => {
    setRoundScores([])
    setSubmitState('idle')
    submittedRef.current = false
    setRound(0)
    setTarget(pickTarget(moves, null))
    trackRef.current = pickTrack()
    setPhase('ready')
  }

  // ready -> perform after a countdown
  useEffect(() => {
    if (phase !== 'ready') return
    const id = setTimeout(() => setPhase('perform'), READY_MS)
    return () => clearTimeout(id)
  }, [phase])

  // Game music from public/game-music: it only plays while a round is live
  // (ready/perform), starts a fresh random track each time a game begins, and
  // never plays on the lobby, the finished screen, or any other view. The
  // ambient track in App stands down while this is going.
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
<<<<<<< HEAD
    mutedRef.current = muted
    if (musicRef.current) musicRef.current.muted = muted
  }, [muted])

  useEffect(() => {
=======
>>>>>>> c588afead891cdc7fec1ad2488a75665da8fa059
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
      setLiveProb(prob) // drives the live meter; maxProbRef alone can't trigger a re-render
    }
  }, [prediction, phase, target])

  const totalScore = roundScores.reduce((sum, r) => sum + r.score, 0)
  const maxScore = ROUNDS_PER_GAME * POINTS_PER_STAR
  // during a round, add in the live-tracked estimate so the meter moves as you dance
  const liveScore = phase === 'perform' ? totalScore + Math.round(liveProb * 100) : totalScore

  // The name was captured on the title card, so once the last round lands the
  // score goes up to the leaderboard on its own -- no submit prompt.
  useEffect(() => {
    if (phase !== 'finished' || submittedRef.current) return
    const name = playerName.trim()
    if (!name) return
    submittedRef.current = true
    let cancelled = false
    setSubmitState('saving')
    // submit_score() is a database upsert that keeps only the best score per
    // player name -- a new lower score never overwrites a higher one.
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
      {phase !== 'ready' && phase !== 'perform' && <h1>Salsa Skills Challenge</h1>}

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
            {ROUNDS_PER_GAME} rounds. Each round calls out a move -- nail it before time's up to
            score points.
          </p>
          <button onClick={startGame}>Start Game</button>
        </div>
      )}

      {(phase === 'ready' || phase === 'perform') && (
        <DanceCallout
          phase={phase}
          round={round}
          target={target}
          poseDetected={Boolean(pose && pose.person_detected)}
          liveScore={liveScore}
          maxScore={maxScore}
        />
      )}

      {phase === 'finished' && (
        <div>
          <div className="finished-summary">
            <h2>final score: {totalScore} / {maxScore}</h2>
            <DanceMeter score={totalScore} maxScore={maxScore} />
          </div>
          <table border="1" cellPadding="4">
            <thead>
              <tr>
                <th>round</th>
                <th>move</th>
                <th>score</th>
              </tr>
            </thead>
            <tbody>
              {roundScores.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{displayName(r.move)}</td>
                  <td>{r.score}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {submitState === 'saving' && <p>submitting your score to the leaderboard...</p>}
          {submitState === 'done' && <p>score saved to the leaderboard!</p>}
          {submitState === 'error' && <p>couldn't save your score to the leaderboard.</p>}

          <button style={{ marginTop: '8px' }} onClick={startGame}>
            play again
          </button>
        </div>
      )}
    </div>
  )
}

export default SalsaGame
