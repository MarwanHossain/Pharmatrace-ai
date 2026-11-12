// DEMO ONLY: in-memory shared state for illustrative fixtures. Persistence across reloads is out of scope for Phase 1.
import { createContext, useContext, useState } from 'react'
import {
  TODAY,
  products as seedProducts,
  batches as seedBatches,
  packages as seedPackages,
  shipments as seedShipments,
  organizations as seedOrganizations
} from '../data/fixtures'
import { generateBatchSerials } from '../services/serialization'
import { verifySerial } from '../services/verification'

const DemoDataCtx = createContext(null)

const clonePackages = list => list.map(p => ({ ...p, history: p.history.map(h => [...h]) }))

export function DemoDataProvider({ children }) {
  const [products] = useState(() => seedProducts.map(p => ({ ...p })))
  const [batches] = useState(() => seedBatches.map(b => ({ ...b })))
  const [packages, setPackages] = useState(() => clonePackages(seedPackages))
  const [shipments] = useState(() =>
    seedShipments.map(s => ({ ...s, packageSerials: [...s.packageSerials] }))
  )

  const orgName = id => seedOrganizations.find(o => o.id === id)?.name ?? '—'
  const productOf = id => products.find(p => p.id === id)

  function generateSerials({ batchId, quantity }) {
    const batch = batches.find(b => b.id === batchId)
    const result = generateBatchSerials({
      batch,
      quantity,
      packages,
      date: TODAY
    })
    if (result.ok) {
      setPackages(prev => [...result.added, ...prev])
    }
    return result
  }

  function verifyAndRecord(rawSerial) {
    const normalized = String(rawSerial ?? '').trim().toUpperCase()
    const exists = normalized && packages.some(p => p.serial === normalized)

    if (!exists) {
      return verifySerial(rawSerial, { packages, batches, shipments, today: TODAY })
    }

    const nextPackages = packages.map(p =>
      p.serial === normalized ? { ...p, verifyCount: (p.verifyCount ?? 0) + 1 } : p
    )
    setPackages(nextPackages)
    return verifySerial(rawSerial, { packages: nextPackages, batches, shipments, today: TODAY })
  }

  return (
    <DemoDataCtx.Provider
      value={{
        products,
        batches,
        packages,
        shipments,
        orgName,
        productOf,
        generateSerials,
        verifyAndRecord
      }}
    >
      {children}
    </DemoDataCtx.Provider>
  )
}

export const useDemoData = () => useContext(DemoDataCtx)
