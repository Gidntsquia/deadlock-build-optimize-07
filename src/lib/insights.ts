import type { AppUserMatch } from '../types'

export interface PersonalizationInsight {
  matchCount: number
  medianDurationMin: number
  lateGameLean: 'short' | 'average' | 'long'
  note: string
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Deadlock matches average roughly 30-35 minutes; treat that as the baseline
// for "average" and flag players who trend notably shorter/longer.
export function computeInsight(matches: AppUserMatch[]): PersonalizationInsight {
  const durations = matches.filter((m) => m.match_duration_s > 0).map((m) => m.match_duration_s / 60)
  const med = durations.length ? median(durations) : 32
  const lean = med < 26 ? 'short' : med > 38 ? 'long' : 'average'
  const note =
    lean === 'short'
      ? `Your matches tend to end early (median ${med.toFixed(0)}m) — the tier-4 item near the end of the late buy list may not always be reachable; treat it as a stretch goal.`
      : lean === 'long'
        ? `Your matches tend to run long (median ${med.toFixed(0)}m) — you likely have time to finish the full late-game buy list, so don't rush the tier-4 item.`
        : `Your median match length (${med.toFixed(0)}m) is close to typical, so the late-game budget below is a reasonable target.`
  return { matchCount: matches.length, medianDurationMin: med, lateGameLean: lean, note }
}
