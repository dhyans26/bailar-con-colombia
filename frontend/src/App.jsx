import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import EmpanadaAvatar from './EmpanadaAvatar.jsx'
import SalsaGame from './SalsaGame.jsx'
import Intro from './Intro.jsx'
import SummitScene from './SummitScene.jsx'
import Leaderboard from './Leaderboard.jsx'

const API_BASE = 'http://127.0.0.1:8000'
const WS_URL = 'ws://127.0.0.1:8000/ws/state'
const HEALTH_POLL_MS = 1000
const WS_RECONNECT_MS = 1000

function MonitorView({ health, pose, prediction, error }) {
  return (
    <div>
      <h1>Macondo Pose / LSTM Monitor</h1>

      {error && <p>cannot reach backend at {API_BASE}: {error}</p>}

      {health && (
        <p>
          backend status: {health.status}
          {health.camera_error ? ` -- camera error: ${health.camera_error}` : ''}
          {' | labels: '}
          {health.labels.join(', ')}
        </p>
      )}

      <h2>Prediction</h2>
      {!prediction && <p>waiting for data...</p>}
      {prediction && !prediction.ready && (
        <p>
          collecting frames... ({prediction.frames_collected}/{prediction.frames_required})
        </p>
      )}
      {prediction && prediction.ready && (
        <div>
          <p>
            label: {prediction.label} (confidence: {prediction.confidence.toFixed(2)})
          </p>
          <table border="1" cellPadding="4">
            <thead>
              <tr>
                <th>move</th>
                <th>probability</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(prediction.probabilities).map(([name, p]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{p.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Pose</h2>
      {!pose && <p>waiting for data...</p>}
      {pose && !pose.person_detected && <p>no person detected</p>}
      {pose && pose.person_detected && (
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <EmpanadaAvatar pose={pose} />
          <table border="1" cellPadding="4">
            <thead>
              <tr>
                <th>joint</th>
                <th>x</th>
                <th>y</th>
                <th>confidence</th>
                <th>visible</th>
              </tr>
            </thead>
            <tbody>
              {pose.keypoints.map((kp) => (
                <tr key={kp.name}>
                  <td>{kp.name}</td>
                  <td>{kp.x.toFixed(1)}</td>
                  <td>{kp.y.toFixed(1)}</td>
                  <td>{kp.confidence.toFixed(2)}</td>
                  <td>{kp.visible ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function App() {
  const [stage, setStage] = useState('intro') // intro | game
  const [view, setView] = useState('game') // game | leaderboard | monitor
  const [playerName, setPlayerName] = useState('')
  const [health, setHealth] = useState(null)
  const [pose, setPose] = useState(null)
  const [prediction, setPrediction] = useState(null)
  const [error, setError] = useState(null)
  const stageRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    const poll = () => {
      fetch(`${API_BASE}/health`)
        .then((res) => res.json())
        .then((data) => {
          if (!cancelled) setHealth(data)
        })
        .catch(() => {})
    }

    // Polled, not one-shot: if the backend isn't up yet the moment this
    // mounts (Electron launches the frontend and the uvicorn backend at
    // roughly the same time), a single fetch-and-forget would leave
    // `health` stuck at null forever with no retry. Also keeps
    // camera_error live if it changes later.
    poll()
    const id = setInterval(poll, HEALTH_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  // Pose + prediction arrive over a websocket the backend pushes to the
  // instant it has a new result, instead of polling on a timer -- see
  // /ws/state in backend/api.py. Reconnects with a fixed delay if the
  // backend isn't up yet or the connection drops.
  useEffect(() => {
    let cancelled = false
    let socket = null
    let reconnectTimer = null

    const connect = () => {
      if (cancelled) return
      socket = new WebSocket(WS_URL)

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data)
        setPose(data.pose)
        setPrediction(data.prediction)
        setError(null)
      }

      socket.onclose = () => {
        if (cancelled) return
        setError('websocket disconnected, reconnecting...')
        reconnectTimer = setTimeout(connect, WS_RECONNECT_MS)
      }
    }

    connect()

    return () => {
      cancelled = true
      clearTimeout(reconnectTimer)
      if (socket) socket.close()
    }
  }, [])

  // The summit is already sitting behind the intro, so arriving at the game is
  // just the panel coming up on top of it.
  useLayoutEffect(() => {
    if (stage !== 'game' || !stageRef.current) return
    gsap.fromTo(
      stageRef.current,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out', delay: 0.2 },
    )
  }, [stage])

  // The backend connects during the intro, so the websocket is live and the
  // model is already collecting frames by the time the climb finishes.
  return (
    <div className="app">
      <SummitScene />

      {stage === 'intro' && (
        <Intro
          playerName={playerName}
          onPlayerNameChange={setPlayerName}
          onComplete={() => setStage('game')}
        />
      )}

      {stage === 'game' && (
        <div className="stage" ref={stageRef}>
          <div className="stage__panel">
            <div style={{ marginBottom: '16px' }}>
              <button onClick={() => setView('game')} disabled={view === 'game'}>
                Salsa Game
              </button>{' '}
              <button onClick={() => setView('leaderboard')} disabled={view === 'leaderboard'}>
                Leaderboard
              </button>{' '}
              <button onClick={() => setView('monitor')} disabled={view === 'monitor'}>
                Monitor
              </button>
            </div>

            {error && <p>cannot reach backend at {API_BASE}: {error}</p>}

            {view === 'game' && (
              <SalsaGame
                pose={pose}
                prediction={prediction}
                health={health}
                playerName={playerName}
                onPlayerNameChange={setPlayerName}
              />
            )}
            {view === 'leaderboard' && <Leaderboard refreshSignal={0} />}
            {view === 'monitor' && (
              <MonitorView health={health} pose={pose} prediction={prediction} error={error} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
