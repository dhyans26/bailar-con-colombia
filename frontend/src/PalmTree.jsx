// stylized palm silhouette -- flat vector shapes in the same spirit as
// the mountain-range svg in SummitScene, just colored in instead of a
// currentColor silhouette. sized/positioned per-instance via css
// (see .scene__palm variants in index.css).

const FROND_ANGLES = [-82, -55, -28, -2, 24, 50, 76]

// one frond: a single curved blade shape, fanned out from the crown by
// rotation and mirrored for the ones leaning right, alternating shade
// for a little depth between overlapping leaves.
function Frond({ angle, index }) {
  const scale = 0.86 + (index % 3) * 0.08
  const mirror = angle >= -3 ? -1 : 1
  return (
    <path
      className={index % 2 === 0 ? 'palm-tree__frond' : 'palm-tree__frond palm-tree__frond--dark'}
      d="M0,0 C-4,-38 -24,-66 -28,-112 C-30,-134 -18,-152 0,-154 C9,-134 3,-96 9,-58 C13,-28 7,-10 0,0 Z"
      transform={`rotate(${angle}) scale(${mirror * scale}, ${scale})`}
    />
  )
}

function PalmTree({ className = '' }) {
  return (
    <svg
      className={`palm-tree ${className}`}
      viewBox="0 0 220 420"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
    >
      <path
        className="palm-tree__trunk"
        d="M84,420 C74,356 98,314 84,250 C70,186 94,144 100,82 L122,86 C114,148 136,188 124,252 C112,316 134,356 126,420 Z"
      />
      <g transform="translate(103,84)">
        {FROND_ANGLES.map((angle, i) => (
          <Frond key={angle} angle={angle} index={i} />
        ))}
        <circle className="palm-tree__coconut" cx="-7" cy="8" r="7" />
        <circle className="palm-tree__coconut" cx="9" cy="12" r="7" />
        <circle className="palm-tree__coconut" cx="1" cy="19" r="7" />
      </g>
    </svg>
  )
}

export default PalmTree
