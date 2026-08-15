// Draws the pose keypoints returned by the backend as a stick figure.
// Bone list mirrors backend/pose_utils.py's BONES (by keypoint name instead
// of index, since that's what the API sends).
const BONES = [
  ['left_ankle', 'left_knee'],
  ['left_knee', 'left_hip'],
  ['right_ankle', 'right_knee'],
  ['right_knee', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['right_shoulder', 'right_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_elbow', 'right_wrist'],
  ['left_eye', 'right_eye'],
  ['nose', 'left_eye'],
  ['nose', 'right_eye'],
  ['left_eye', 'left_ear'],
  ['right_eye', 'right_ear'],
]

const PADDING = 20

function StickFigure({ keypoints }) {
  const visible = keypoints.filter((kp) => kp.visible)

  if (visible.length === 0) {
    return <p>no visible joints</p>
  }

  const byName = Object.fromEntries(visible.map((kp) => [kp.name, kp]))
  const xs = visible.map((kp) => kp.x)
  const ys = visible.map((kp) => kp.y)
  const minX = Math.min(...xs) - PADDING
  const minY = Math.min(...ys) - PADDING
  const width = Math.max(...xs) - minX + PADDING
  const height = Math.max(...ys) - minY + PADDING

  return (
    <svg
      viewBox={`${minX} ${minY} ${width} ${height}`}
      width="320"
      height="320"
      style={{ border: '1px solid black' }}
    >
      {BONES.map(([a, b]) => {
        const pa = byName[a]
        const pb = byName[b]
        if (!pa || !pb) return null
        return (
          <line key={`${a}-${b}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                stroke="black" strokeWidth="2" />
        )
      })}
      {visible.map((kp) => (
        <circle key={kp.name} cx={kp.x} cy={kp.y} r="4" fill="red" />
      ))}
    </svg>
  )
}

export default StickFigure
