import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Navbar from '@/components/Navbar';
import RankingsClient from '@/components/RankingsClient';

export default async function RankingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="p-6 pb-20 max-w-7xl mx-auto">
        <RankingsClient />
      </main>
    </div>
  );
}
