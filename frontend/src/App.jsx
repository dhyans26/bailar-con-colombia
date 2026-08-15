import { useEffect, useState } from 'react'
import StickFigure from './StickFigure.jsx'

const API_BASE = 'http://127.0.0.1:8000'
const POLL_MS = 500

function App() {
  const [health, setHealth] = useState(null)
  const [pose, setPose] = useState(null)
  const [prediction, setPrediction] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false

    const poll = () => {
      fetch(`${API_BASE}/api/state`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return
          setPose(data.pose)
          setPrediction(data.prediction)
          setError(null)
        })
        .catch((err) => {
          if (!cancelled) setError(err.message)
        })
    }

    poll()
    const id = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

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
          <StickFigure keypoints={pose.keypoints} />
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

export default App
