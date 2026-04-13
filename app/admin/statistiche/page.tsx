import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { StatsPage } from '@/components/admin/stats-page'
import { ADMIN_ID } from '@/types/database'

export default async function StatistichePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ADMIN_ID) redirect('/dashboard')
  return <StatsPage />
}
