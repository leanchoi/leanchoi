import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/access'
import TopBar from '@/components/TopBar'
import Footer from '@/components/Footer'
import AdminUsers from '@/components/AdminUsers'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const user = await requireUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/')
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <AdminUsers />
      </main>
      <Footer />
    </div>
  )
}
