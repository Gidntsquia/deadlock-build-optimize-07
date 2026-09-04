import { useEffect, useMemo, useState } from 'react'
import { activeHeroes, loadSnapshots, type Snapshots } from './lib/data'
import { generateBuild } from './lib/generator'
import {
  computeCoreSet,
  validateBuild,
  HELD_OUT_PLAYERS,
  type BuildAgreement,
  type ZergCoreSet,
} from './lib/validation'
import HeroPicker from './components/HeroPicker'
import BuildView from './components/BuildView'

const INFERNUS_ID = 1

export default function App() {
  const [snap, setSnap] = useState<Snapshots | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [heroId, setHeroId] = useState(INFERNUS_ID)
  const [core, setCore] = useState<ZergCoreSet | null>(null)
  const [agreement, setAgreement] = useState<BuildAgreement | null>(null)

  useEffect(() => {
    loadSnapshots()
      .then(setSnap)
      .catch((e) => setError(String(e)))
  }, [])

  const heroes = useMemo(() => (snap ? activeHeroes(snap.heroes) : []), [snap])

  const build = useMemo(() => {
    if (!snap) return null
    return generateBuild(snap, heroId)
  }, [snap, heroId])

  const heldOutPlayer = HELD_OUT_PLAYERS[heroId]

  useEffect(() => {
    if (!heldOutPlayer || !build) {
      setCore(null)
      setAgreement(null)
      return
    }
    let cancelled = false
    computeCoreSet(heroId).then((c) => {
      if (cancelled || !c) return
      setCore(c)
      validateBuild(build, heroId, c).then((result) => {
        if (!cancelled) setAgreement(result)
      })
    })
    return () => {
      cancelled = true
    }
  }, [build, heroId, heldOutPlayer])

  if (error) {
    return (
      <div className="app">
        <div className="error-box">Failed to load data snapshots: {error}</div>
      </div>
    )
  }

  if (!snap) {
    return (
      <div className="app">
        <div className="loading">Loading Deadlock data...</div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="header">
        <h1>Deadlock Build Optimizer</h1>
        <HeroPicker heroes={heroes} selected={heroId} onSelect={setHeroId} />
      </div>
      <main>
        {heldOutPlayer && agreement && (
          <div className="agreement-banner">
            <span>
              Agreement with {heldOutPlayer.name}'s real builds ({core?.matchesSampled ?? 0} matches
              sampled)
            </span>
            <span className="agreement-value">{agreement.overallAgreementPct.toFixed(0)}%</span>
          </div>
        )}

        {build && (
          <BuildView
            build={build}
            core={heldOutPlayer ? core : null}
            corePlayerLabel={heldOutPlayer?.name}
          />
        )}
      </main>
    </div>
  )
}
