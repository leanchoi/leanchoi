import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/access'
import TopBar from '@/components/TopBar'
import Footer from '@/components/Footer'
import AgendaView from '@/components/AgendaView'

export const dynamic = 'force-dynamic'

export default async function AgendaPage() {
  const user = await requireUser()
  if (!user) redirect('/login')
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <AgendaView />
      </main>
      <Footer />
    </div>
  )
}
