import { useEffect, useRef, useState } from 'react'

// Draws the empanada mascot (public/emp.png) as the avatar body, with black
// stick limbs anchored at the orange dots marked on the artwork. Each limb is
// two segments -- shoulder->elbow->wrist for arms, hip->knee->ankle for legs
// -- mirroring the two bones the pose model actually tracks per limb, so the
// empanada "performs" the tracked movement (elbow/knee bend included) while
// its body stays the fixed image. The whole character also drifts a little
// left/right as the person steps side to side (see bodyShiftX below).

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

// Limbs are drawn as layered strokes instead of a single flat line, so they
// read as golden cheese breadsticks rather than stick-figure sticks: a dark
// crust outline underneath, a gradient golden-brown body on top, and two
// dash-array overlays that scatter cheese/herb "speckles" along the length.
const STICK_WIDTH = 9
const OUTLINE_WIDTH = STICK_WIDTH + 4
const HIGHLIGHT_WIDTH = STICK_WIDTH * 0.35

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

// Same direct (non-swapped) correspondence as the limb mapping above: a
// keypoint's raw x position in the camera frame maps straight to the
// avatar's screen x, with no left/right flip, so stepping physically drifts
// the whole character the way the limb motion already implies it should.
const HIP_NAMES = ['left_hip', 'right_hip']
const SHOULDER_NAMES = ['left_shoulder', 'right_shoulder']
const MAX_SHIFT = 60 // viewBox units either side of center -- "a lil", not a lot
const SHIFT_SMOOTHING = 0.25 // 0..1, higher = snappier/less smoothing
// how fast the "center" baseline drifts toward wherever the person actually stands.
const BASELINE_SMOOTHING = 0.01

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

// Midpoint x of the hips (falling back to shoulders) -- a stable stand-in
// for "where the body is horizontally", null if neither pair is visible.
function bodyCenterX(byName) {
  const [lh, rh] = HIP_NAMES.map((n) => byName[n])
  if (lh && rh) return (lh.x + rh.x) / 2
  const [ls, rs] = SHOULDER_NAMES.map((n) => byName[n])
  if (ls && rs) return (ls.x + rs.x) / 2
  return null
}

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

function EmpanadaAvatar({ pose }) {
  const keypoints = pose.keypoints
  const visible = keypoints.filter((kp) => kp.visible)
  const byName = Object.fromEntries(visible.map((kp) => [kp.name, kp]))

  const limbs = LIMBS.map((limb) => ({
    name: limb.name,
    points: limbPoints(limb, byName),
  }))

  const shiftRef = useRef(0)
  const [shiftX, setShiftX] = useState(0)

  const baselineRef = useRef(null)

  useEffect(() => {
    if (!pose.frame_width) return
    const cx = bodyCenterX(byName)
    if (cx == null) return
    if (baselineRef.current == null) {
      baselineRef.current = cx
    } else {
      baselineRef.current += (cx - baselineRef.current) * BASELINE_SMOOTHING
    }
    const normalized = clamp((cx - baselineRef.current) / (pose.frame_width / 2), -1, 1)
    const target = normalized * MAX_SHIFT
    shiftRef.current += (target - shiftRef.current) * SHIFT_SMOOTHING
    setShiftX(shiftRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pose])

  return (
    <svg
      viewBox={`0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}`}
      width="320"
      height="240"
      style={{ border: '1px solid black' }}
    >
      <defs>
        {/* objectBoundingBox (the default) means this recomputes per limb,
            so every segment gets its own light-crumb-to-crust gradient
            running along its own length, regardless of the angle it's
            drawn at. */}
        <linearGradient id="breadstickBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f7e2ab" />
          <stop offset="45%" stopColor="#e3a83f" />
          <stop offset="100%" stopColor="#a8641f" />
        </linearGradient>
      </defs>
      <g transform={`translate(${shiftX.toFixed(1)}, 0)`}>
        <image href="/emp.png" x="0" y="0" width={IMAGE_WIDTH} height={IMAGE_HEIGHT} />
        {limbs.map((limb) => {
          const pts = limb.points.map((p) => `${p.x},${p.y}`).join(' ')
          return (
            <g key={limb.name}>
              {/* baked crust outline */}
              <polyline
                points={pts}
                fill="none"
                stroke="#5c3512"
                strokeWidth={OUTLINE_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* golden-brown breadstick body */}
              <polyline
                points={pts}
                fill="none"
                stroke="url(#breadstickBody)"
                strokeWidth={STICK_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* pale crumb highlight down the center */}
              <polyline
                points={pts}
                fill="none"
                stroke="#fdf1d3"
                strokeWidth={HIGHLIGHT_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.55}
              />
              {/* melted cheese speckles */}
              <polyline
                points={pts}
                fill="none"
                stroke="#ffb545"
                strokeWidth={STICK_WIDTH * 0.8}
                strokeLinecap="round"
                strokeDasharray="1.5 5"
                opacity={0.85}
              />
              {/* herb/olive flecks */}
              <polyline
                points={pts}
                fill="none"
                stroke="#2e1c0f"
                strokeWidth={STICK_WIDTH * 0.5}
                strokeLinecap="round"
                strokeDasharray="1 7"
                strokeDashoffset={3}
                opacity={0.8}
              />
            </g>
          )
        })}
      </g>
    </svg>
  )
}

export default EmpanadaAvatar
