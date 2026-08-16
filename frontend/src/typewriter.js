// shared timing + sound for the game's typewriter text reveal (end cutscene
// dialogue, climb narration) -- keeps them in lockstep instead of two copies
// of the same tuning drifting apart.

// how long each revealed character stays on screen for before the next one
// appears. other per-character effects (talking bounce, beep sfx) ride
// along with this, so a longer line naturally talks/bounces longer.
export const MS_PER_CHAR = 32

export function getAudioCtx(ref) {
  if (typeof window === 'undefined') return null
  const Ctx = window.AudioContext || window['webkitAudioContext']
  if (!Ctx) return null
  if (!ref.current) ref.current = new Ctx()
  if (ref.current.state === 'suspended') ref.current.resume().catch(() => {})
  return ref.current
}

// one short typewriter blip, pitched around `baseFreq` with a little jitter
// so a run of them doesn't read as a flat drone.
export function playBeep(ctx, baseFreq) {
  if (!ctx) return
  try {
    const freq = baseFreq * (0.92 + Math.random() * 0.16)
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.05)
  } catch {
    // beeps are a nice-to-have, never worth breaking a scene over
  }
}
