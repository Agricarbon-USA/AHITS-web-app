import { AdminMapView } from '@/components/admin/AdminMapView'

// CC-15 (D2): the Mapbox token is read SERVER-side at request time and passed to the
// client view as a prop — never a NEXT_PUBLIC_ var (which would be inlined empty at build
// time, the FND-49 trap). force-dynamic guarantees the runtime read even if a future build
// optimization would otherwise prerender this segment (mirrors src/app/api/health/route.ts).
export const dynamic = 'force-dynamic'

export default function AdminMapPage() {
  const token = process.env.MAPBOX_TOKEN ?? null
  return <AdminMapView token={token} />
}
