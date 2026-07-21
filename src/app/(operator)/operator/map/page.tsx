import { CrewMapView } from '@/components/operator/CrewMapView'

// CC-15 (D2): the Mapbox token is read SERVER-side at request time and passed to the client
// view as a prop — never NEXT_PUBLIC_ (the FND-49 build-time-empty trap). force-dynamic
// guarantees the runtime read (mirrors src/app/api/health/route.ts).
export const dynamic = 'force-dynamic'

export default function OperatorMapPage() {
  const token = process.env.MAPBOX_TOKEN ?? null
  return <CrewMapView token={token} />
}
