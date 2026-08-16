import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import SalsaGame from './SalsaGame.jsx'
import Intro from './Intro.jsx'
import SummitScene from './SummitScene.jsx'
import { INTRO_MUSIC, INTRO_MUSIC_VOLUME, INTRO_MUSIC_CUTSCENE_VOLUME } from './story.js'

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
  const [gameActive, setGameActive] = useState(false)
  const [muted, setMuted] = useState(false)
  const [speaker, setSpeaker] = useState(null) // 'cabi' | 'empanada' | null -- who's talking in the end cutscene
  const [cutsceneActive, setCutsceneActive] = useState(false)
  const stageRef = useRef(null)
  const lobbyMusicRef = useRef(null)
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

    // poll otherwise one failure means uh oh
    poll()
    const id = setInterval(poll, HEALTH_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  // pose + prediction arrive over a websocket
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

  useEffect(() => {
    if (!INTRO_MUSIC) return
    const audio = new Audio(INTRO_MUSIC)
    audio.loop = true
    audio.volume = INTRO_MUSIC_VOLUME
    audio.muted = mutedRef.current
    lobbyMusicRef.current = audio

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

  // shakira keeps playing under the end cutscene -- duck it way down so it
  // doesn't fight with Cabí and Empanada's dialogue, then bring it back up after.
  useEffect(() => {
    const audio = lobbyMusicRef.current
    if (!audio) return
    audio.volume = cutsceneActive ? INTRO_MUSIC_CUTSCENE_VOLUME : INTRO_MUSIC_VOLUME
  }, [cutsceneActive])

  useEffect(() => {
    mutedRef.current = muted
    if (lobbyMusicRef.current) lobbyMusicRef.current.muted = muted
  }, [muted])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'm' && e.key !== 'M') return
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

  // left/right arrows swap between the game and the monitor
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

  useEffect(() => {
    if (view !== 'game') setGameActive(false)
  }, [view])

  useLayoutEffect(() => {
    if (stage !== 'game' || !stageRef.current) return
    gsap.fromTo(
      stageRef.current,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out', delay: 0.2 },
    )
  }, [stage])

  return (
    <div className="app">
      <SummitScene pose={pose} speaker={speaker} />

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
                  onSpeakerChange={setSpeaker}
                  onCutsceneActiveChange={setCutsceneActive}
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
