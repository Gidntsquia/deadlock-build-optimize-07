import { useEffect, useMemo, useState } from 'react'
import { activeHeroes, loadSnapshots, type Snapshots } from './lib/data'
import { generateBuilds } from './lib/generator'
import { computeZergCoreSet, validateBuild, type BuildAgreement, type ZergCoreSet } from './lib/validation'
import { computeInsight } from './lib/insights'
import HeroPicker from './components/HeroPicker'
import BuildView from './components/BuildView'
import type { Build } from './types'

const INFERNUS_ID = 1

export default function App() {
  const [snap, setSnap] = useState<Snapshots | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [heroId, setHeroId] = useState(INFERNUS_ID)
  const [buildIdx, setBuildIdx] = useState(0)
  const [core, setCore] = useState<ZergCoreSet | null>(null)
  const [agreements, setAgreements] = useState<Record<string, BuildAgreement>>({})

  useEffect(() => {
    loadSnapshots()
      .then(setSnap)
      .catch((e) => setError(String(e)))
    computeZergCoreSet()
      .then(setCore)
      .catch(() => {})
  }, [])

  const heroes = useMemo(() => (snap ? activeHeroes(snap.heroes) : []), [snap])
  const insight = useMemo(() => (snap ? computeInsight(snap.appUserMatches) : null), [snap])

  const builds: Build[] = useMemo(() => {
    if (!snap) return []
    return generateBuilds(snap, heroId)
  }, [snap, heroId])

  useEffect(() => {
    setBuildIdx(0)
  }, [heroId])

  useEffect(() => {
    if (heroId !== INFERNUS_ID || !core || builds.length === 0) return
    let cancelled = false
    Promise.all(builds.map((b) => validateBuild(b, core))).then((results) => {
      if (cancelled) return
      const map: Record<string, BuildAgreement> = {}
      for (const r of results) map[r.buildId] = r
      setAgreements(map)
    })
    return () => {
      cancelled = true
    }
  }, [builds, core, heroId])

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

  const activeBuild = builds[buildIdx]
  const agreement = activeBuild ? agreements[activeBuild.id] : undefined
  const showValidation = heroId === INFERNUS_ID

  return (
    <div className="app">
      <div className="header">
        <h1>Deadlock Build Optimizer</h1>
        <HeroPicker heroes={heroes} selected={heroId} onSelect={setHeroId} />
      </div>
      <main>
        {insight && (
          <div className="insight-card">
            <strong>Your play pattern:</strong> {insight.note}
          </div>
        )}

        {builds.length > 0 && (
          <div className="build-tabs">
            {builds.map((b, i) => (
              <button
                key={b.id}
                className={`build-tab${i === buildIdx ? ' active' : ''}`}
                onClick={() => setBuildIdx(i)}
              >
                {b.name}
              </button>
            ))}
          </div>
        )}

        {showValidation && agreement && (
          <div className="agreement-banner">
            <span>
              Agreement with Zergggy's real Infernus builds ({core?.matchesSampled ?? 0} matches sampled)
            </span>
            <span className="agreement-value">{agreement.overallAgreementPct.toFixed(0)}%</span>
          </div>
        )}

        {activeBuild && <BuildView build={activeBuild} core={showValidation ? core : null} />}
      </main>
    </div>
  )
}
