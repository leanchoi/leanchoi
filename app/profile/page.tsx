import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Navbar from '@/components/Navbar';
import ProfileClient from '@/components/ProfileClient';

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="p-6 pb-20 max-w-xl mx-auto">
        <ProfileClient />
      </main>
    </div>
  );
}
