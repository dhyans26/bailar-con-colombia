import { useEffect, useRef, useState } from 'react'
import EmpanadaAvatar from './EmpanadaAvatar.jsx'
import Leaderboard from './Leaderboard.jsx'
import { supabase, LEADERBOARD_TABLE } from './supabaseClient.js'

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

function SalsaGame({ pose, prediction, health }) {
  const [phase, setPhase] = useState('lobby') // lobby | ready | perform | finished
  const [round, setRound] = useState(0)
  const [target, setTarget] = useState(null)
  const [roundScores, setRoundScores] = useState([])
  const [playerName, setPlayerName] = useState('')
  const [submitState, setSubmitState] = useState('idle') // idle | saving | done | error
  const [refreshSignal, setRefreshSignal] = useState(0)
  const maxProbRef = useRef(0)

  const moves = playableMoves(health && health.labels)

  const startGame = () => {
    setRoundScores([])
    setSubmitState('idle')
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
    if (prob > maxProbRef.current) maxProbRef.current = prob
  }, [prediction, phase, target])

  const totalScore = roundScores.reduce((sum, r) => sum + r.score, 0)

  const submitScore = async () => {
    const name = playerName.trim()
    if (!name) return
    setSubmitState('saving')
    const { error } = await supabase
      .from(LEADERBOARD_TABLE)
      .insert({ player_name: name, score: totalScore, moves_played: ROUNDS_PER_GAME })
    if (error) {
      setSubmitState('error')
    } else {
      setSubmitState('done')
      setRefreshSignal((n) => n + 1)
    }
  }

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
          {pose && pose.person_detected ? (
            <EmpanadaAvatar pose={pose} />
          ) : (
            <p>step into frame!</p>
          )}
        </div>
      )}

      {phase === 'finished' && (
        <div>
          <h2>final score: {totalScore} / {ROUNDS_PER_GAME * 100}</h2>
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

          {submitState !== 'done' && (
            <div style={{ marginTop: '8px' }}>
              <input
                type="text"
                placeholder="your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={40}
              />
              <button onClick={submitScore} disabled={!playerName.trim() || submitState === 'saving'}>
                {submitState === 'saving' ? 'saving...' : 'submit to leaderboard'}
              </button>
              {submitState === 'error' && <p>couldn't save score -- try again.</p>}
            </div>
          )}
          {submitState === 'done' && <p>score saved!</p>}

          <button style={{ marginTop: '8px' }} onClick={startGame}>
            play again
          </button>
        </div>
      )}

      <Leaderboard refreshSignal={refreshSignal} />
    </div>
  )
}

export default SalsaGame
