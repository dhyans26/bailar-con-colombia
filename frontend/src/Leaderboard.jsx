import { useEffect, useState } from 'react'
import { supabase, LEADERBOARD_TABLE } from './supabaseClient.js'
import { publicAsset } from './publicAsset.js'

// The drawn board (public/leaderboard.png) already has the title, the ruled
// columns and the numerals 1-7 painted on it, so the art dictates the shape:
// seven slots, no more. We only fill the two blank columns it leaves.
const TOP_N = 7

// Vertical centre of each numeral, measured off the artwork and expressed as a
// percentage of the board's height so the names line up at any size. (The
// hand-drawn numerals aren't evenly spaced, hence the literal list.)
const SLOT_TOPS = ['24.9%', '35.4%', '46.0%', '56.3%', '66.7%', '77.0%', '87.4%']

function Leaderboard({ refreshSignal }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    supabase
      .from(LEADERBOARD_TABLE)
      .select('player_name, score, created_at')
      .order('score', { ascending: false })
      .limit(TOP_N)
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
        } else {
          setError(null)
          setRows(data)
        }
      })

    return () => {
      cancelled = true
    }
  }, [refreshSignal])

  const status = error
    ? "couldn't load the board"
    : !rows
      ? 'loading...'
      : rows.length === 0
        ? 'no scores yet -- be the first!'
        : null

  return (
    <div className="leaderboard">
      <h2 className="leaderboard__heading">Leaderboard</h2>

      <img
        className="leaderboard__art"
        src={publicAsset('/leaderboard.png')}
        alt=""
        draggable="false"
      />

      {SLOT_TOPS.map((top, i) => {
        const row = rows?.[i]
        return (
          <div className="leaderboard__slot" style={{ top }} key={top}>
            <span className="leaderboard__name">{row?.player_name ?? ''}</span>
            <span className="leaderboard__score">{row ? row.score : ''}</span>
          </div>
        )
      })}

      {status && <p className="leaderboard__status">{status}</p>}
    </div>
  )
}

export default Leaderboard
