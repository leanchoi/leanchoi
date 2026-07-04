import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/access'
import TopBar from '@/components/TopBar'
import Footer from '@/components/Footer'
import BasesHome from '@/components/BasesHome'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const user = await requireUser()
  if (!user) redirect('/login')
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <BasesHome />
      </main>
      <Footer />
    </div>
  )
}
