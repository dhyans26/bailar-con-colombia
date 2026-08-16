import { useEffect, useState } from 'react'
import { supabase, LEADERBOARD_TABLE } from './supabaseClient.js'

const TOP_N = 10 // how many top g's 

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

  return (
    <div>
      <h2>Leaderboard</h2>
      {error && <p>couldn't load leaderboard: {error}</p>}
      {!error && !rows && <p>loading...</p>}
      {!error && rows && rows.length === 0 && <p>no scores yet -- be the first!</p>}
      {!error && rows && rows.length > 0 && (
        <table border="1" cellPadding="4">
          <thead>
            <tr>
              <th>#</th>
              <th>player</th>
              <th>score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.player_name}-${row.created_at}`}>
                <td>{i + 1}</td>
                <td>{row.player_name}</td>
                <td>{row.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default Leaderboard
