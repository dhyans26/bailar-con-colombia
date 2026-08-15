import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient.js'

const ROUNDS_PER_GAME = 5
const READY_MS = 2000
const PERFORM_MS = 4000

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
              <span className="dance-meter__star-fill" style={{ width: `${fill}%` }}>
                ★
              </span>
            </span>
          )
        })}
      </div>
      <p className="dance-meter__score">
        {score} / {maxScore} pts
      </p>
    </div>
  )
}

function SalsaGame({ pose, prediction, health, playerName }) {
  const [phase, setPhase] = useState('lobby') // lobby | ready | perform | finished
  const [round, setRound] = useState(0)
  const [target, setTarget] = useState(null)
  const [roundScores, setRoundScores] = useState([])
  const [submitState, setSubmitState] = useState('idle') // idle | saving | done | error
  const [liveProb, setLiveProb] = useState(0) // best confidence seen this round, mirrored for live rendering
  const maxProbRef = useRef(0)
  const submittedRef = useRef(false)

  const moves = playableMoves(health && health.labels)

  const startGame = () => {
    setRoundScores([])
    setSubmitState('idle')
    submittedRef.current = false
    setRound(0)
    setTarget(pickTarget(moves, null))
    setPhase('ready')
  }

  // ready -> perform after a countdown
  useEffect(() => {
    if (phase !== 'ready') return
    const id = setTimeout(() => setPhase('perform'), READY_MS)
    return () => clearTimeout(id)
  }, [phase])

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
      <h1>Salsa Skills Challenge</h1>

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
        <div>
          <p>
            round {round + 1} / {ROUNDS_PER_GAME}
          </p>
          <h2>{phase === 'ready' ? 'get ready...' : 'GO!'}</h2>
          <h2>{displayName(target)}</h2>
          {!(pose && pose.person_detected) && <p>step into frame!</p>}
          <DanceMeter score={liveScore} maxScore={maxScore} />
        </div>
      )}

      {phase === 'finished' && (
        <div>
          <h2>final score: {totalScore} / {maxScore}</h2>
          <DanceMeter score={totalScore} maxScore={maxScore} />
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
