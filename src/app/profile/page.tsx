import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/access'
import TopBar from '@/components/TopBar'
import Footer from '@/components/Footer'
import ProfileForm from '@/components/ProfileForm'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const user = await requireUser()
  if (!user) redirect('/login')
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
        <ProfileForm />
      </main>
      <Footer />
    </div>
  )
}
