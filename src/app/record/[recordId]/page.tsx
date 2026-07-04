import { redirect } from 'next/navigation'
import db from '@/lib/db'
import { requireUser, baseRole, canView, baseIdOfRecord } from '@/lib/access'

export const dynamic = 'force-dynamic'

// Enlace corto usado por notificaciones: redirige a la vista de la tabla
// con el registro expandido.
export default async function RecordRedirect({ params }: { params: { recordId: string } }) {
  const user = await requireUser()
  if (!user) redirect('/login')
  const loc = baseIdOfRecord(params.recordId)
  if (!loc) redirect('/')
  const role = baseRole(user.id, loc.baseId, user.role)
  if (!canView(role)) redirect('/')
  const views = db
    .prepare('SELECT id, personal, created_by FROM views WHERE table_id = ? ORDER BY position')
    .all(loc.tableId) as any[]
  const view = views.find((v) => !v.personal || v.created_by === user.id)
  if (!view) redirect('/')
  redirect(
    `/base/${loc.baseId}/table/${loc.tableId}/view/${view.id}?record=${params.recordId}`
  )
}
