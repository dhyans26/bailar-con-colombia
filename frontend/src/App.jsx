import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import SalsaGame from './SalsaGame.jsx'
import Intro from './Intro.jsx'
import SummitScene from './SummitScene.jsx'
import { INTRO_MUSIC, INTRO_MUSIC_VOLUME } from './story.js'

const API_BASE = 'http://127.0.0.1:8000'
const WS_URL = 'ws://127.0.0.1:8000/ws/state'
const HEALTH_POLL_MS = 1000
const WS_RECONNECT_MS = 1000

function MonitorView({ health, pose, prediction, error }) {
  return (
    <div>
      <h1>Monitor</h1>

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
  const [view, setView] = useState('game') // game | monitor
  const [playerName, setPlayerName] = useState('')
  const [health, setHealth] = useState(null)
  const [pose, setPose] = useState(null)
  const [prediction, setPrediction] = useState(null)
  const [error, setError] = useState(null)
  // True while a round is actually being danced -- shakira stands down then.
  const [gameActive, setGameActive] = useState(false)
  const [muted, setMuted] = useState(false)
  const stageRef = useRef(null)
  const lobbyMusicRef = useRef(null)
  // Mirror of `muted` for effects that must not re-run when it flips.
  const mutedRef = useRef(false)

  const handleGameActiveChange = useCallback((active) => setGameActive(active), [])

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

  // Shakira is the ambient track for everything outside a live game: the intro,
  // the lobby, the finished screen, the leaderboard. It hands over to the
  // game-music track the instant a game goes live and comes back when it ends,
  // so the player is never stuck in silence.
  useEffect(() => {
    if (!INTRO_MUSIC) return
    const audio = new Audio(INTRO_MUSIC)
    audio.loop = true
    audio.volume = INTRO_MUSIC_VOLUME
    audio.muted = mutedRef.current
    lobbyMusicRef.current = audio

    // Autoplay before the player has touched the page is usually refused, so
    // the first key or click anywhere is the fallback trigger.
    const stopWaiting = () => {
      window.removeEventListener('keydown', start)
      window.removeEventListener('pointerdown', start)
    }
    function start() {
      audio.play().then(stopWaiting).catch(() => {})
    }
    start()
    window.addEventListener('keydown', start)
    window.addEventListener('pointerdown', start)

    return () => {
      stopWaiting()
      audio.pause()
      audio.src = ''
      lobbyMusicRef.current = null
    }
  }, [])

  useEffect(() => {
    const audio = lobbyMusicRef.current
    if (!audio) return
    if (gameActive) {
      audio.pause()
    } else if (audio.paused) {
      audio.play().catch(() => {})
    }
  }, [gameActive])

  // M kills every sound at once. Undocumented on purpose -- it is deliberately
  // absent from the hints and the UI. It lives up here because App is the only
  // place that can see all of it: the ambient track it owns, the game music in
  // SalsaGame, and the climb clips in Intro, the last two via the `muted` prop.
  // Mute rather than pause, so a track keeps its place while silenced.
  useEffect(() => {
    mutedRef.current = muted
    if (lobbyMusicRef.current) lobbyMusicRef.current.muted = muted
  }, [muted])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'm' && e.key !== 'M') return
      // Modifiers excluded so this never steals Cmd+M and friends, and text
      // fields excluded so typing an "m" into the name prompt is just an "m".
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return
      e.preventDefault()
      setMuted((m) => !m)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Left/right arrows swap between the game and the monitor -- replaces the
  // old on-screen tab buttons, which sat over the summit as a permanent UI
  // chrome element. Only wired up once the game stage is actually showing.
  useEffect(() => {
    if (stage !== 'game') return
    const onKey = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return
      e.preventDefault()
      setView((v) => (v === 'game' ? 'monitor' : 'game'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stage])

  // Leaving the game view abandons any in-progress round, so hand the ambient
  // track back over instead of leaving the player in silence.
  useEffect(() => {
    if (view !== 'game') setGameActive(false)
  }, [view])

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
      <SummitScene pose={pose} />

      {stage === 'intro' && (
        <Intro onComplete={() => setStage('game')} muted={muted} />
      )}

      {stage === 'game' && (
        <>
          <div className="stage" ref={stageRef}>
            <div className="stage__panel">
              {error && <p>cannot reach backend at {API_BASE}: {error}</p>}

              {view === 'game' && (
                <SalsaGame
                  pose={pose}
                  prediction={prediction}
                  health={health}
                  playerName={playerName}
                  onPlayerNameChange={setPlayerName}
                  onGameActiveChange={handleGameActiveChange}
                  onReturnToMenu={() => {
                    setPlayerName('')
                    setStage('intro')
                  }}
                  muted={muted}
                />
              )}
              {view === 'monitor' && (
                <MonitorView health={health} pose={pose} prediction={prediction} error={error} />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default App
