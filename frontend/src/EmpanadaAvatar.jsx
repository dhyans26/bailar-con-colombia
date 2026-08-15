// Draws the empanada mascot (public/emp.png) as the avatar body, with black
// stick limbs anchored at the orange dots marked on the artwork. Each limb is
// two segments -- shoulder->elbow->wrist for arms, hip->knee->ankle for legs
// -- mirroring the two bones the pose model actually tracks per limb, so the
// empanada "performs" the tracked movement (elbow/knee bend included) while
// its body stays the fixed image.

// Pixel locations of the orange anchor dots in emp.png (577x432 source image).
const ANCHORS = {
  left_arm: { x: 166, y: 184 },
  right_arm: { x: 321, y: 155 },
  left_leg: { x: 226, y: 219 },
  right_leg: { x: 278, y: 215 },
}

const IMAGE_WIDTH = 577
const IMAGE_HEIGHT = 432
const SEGMENT_LENGTH = 38
const STICK_WIDTH = 6

// Two-segment limb chains: each entry names the pose keypoints whose
// consecutive pairs drive that segment's direction (proximal->mid,
// mid->distal), plus a fallback direction pair used whenever a segment's
// driving keypoints aren't visible.
//
// The camera frame is never mirrored (no cv2.flip in the backend), but the
// pose model's left_*/right_* keypoints are anatomical -- the *person's* own
// left/right. Facing the camera, your anatomical right arm lands on the
// image's left side. So the screen-left anchor is intentionally driven by
// right_* keypoints (and vice versa): this makes the avatar mirror you like
// a reflection, which also happens to be the natural, expected feel for a
// pose-driven avatar (and matters more than "left_arm" reading correctly).
const LIMBS = [
  {
    name: 'left_arm',
    anchor: ANCHORS.left_arm,
    joints: ['right_shoulder', 'right_elbow', 'right_wrist'],
    fallback: [{ x: -1, y: 0.4 }, { x: -0.5, y: 0.9 }],
  },
  {
    name: 'right_arm',
    anchor: ANCHORS.right_arm,
    joints: ['left_shoulder', 'left_elbow', 'left_wrist'],
    fallback: [{ x: 1, y: 0.4 }, { x: 0.5, y: 0.9 }],
  },
  {
    name: 'left_leg',
    anchor: ANCHORS.left_leg,
    joints: ['right_hip', 'right_knee', 'right_ankle'],
    fallback: [{ x: -0.2, y: 1 }, { x: -0.4, y: 1 }],
  },
  {
    name: 'right_leg',
    anchor: ANCHORS.right_leg,
    joints: ['left_hip', 'left_knee', 'left_ankle'],
    fallback: [{ x: 0.2, y: 1 }, { x: 0.4, y: 1 }],
  },
]

function unitVector(from, to) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-3) return null
  return { x: dx / len, y: dy / len }
}

// Walks a limb's joint chain (3 keypoints -> 2 segments) and returns the 3
// points (anchor, mid-joint, tip) to draw, falling back per-segment when the
// driving keypoints are missing.
function limbPoints(limb, byName) {
  const points = [limb.anchor]
  let current = limb.anchor
  for (let i = 0; i < limb.joints.length - 1; i++) {
    const a = byName[limb.joints[i]]
    const b = byName[limb.joints[i + 1]]
    const dir = (a && b && unitVector(a, b)) || limb.fallback[i]
    current = { x: current.x + dir.x * SEGMENT_LENGTH, y: current.y + dir.y * SEGMENT_LENGTH }
    points.push(current)
  }
  return points
}

function EmpanadaAvatar({ keypoints }) {
  const visible = keypoints.filter((kp) => kp.visible)
  const byName = Object.fromEntries(visible.map((kp) => [kp.name, kp]))

  const limbs = LIMBS.map((limb) => ({
    name: limb.name,
    points: limbPoints(limb, byName),
  }))

  return (
    <svg
      viewBox={`0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}`}
      width="320"
      height="240"
      style={{ border: '1px solid black' }}
    >
      <image href="/emp.png" x="0" y="0" width={IMAGE_WIDTH} height={IMAGE_HEIGHT} />
      {limbs.map((limb) => (
        <polyline
          key={limb.name}
          points={limb.points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="black"
          strokeWidth={STICK_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}

export default EmpanadaAvatar
