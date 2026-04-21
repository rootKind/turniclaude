import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/types/database'
import { getSalaLayout } from '@/lib/queries/sala-layout'
import { SalaPageClient } from './sala-page-client'

export default async function TurniSalaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = user ? isAdmin(user.id) : false
  const layout = await getSalaLayout(supabase)

  return <SalaPageClient layout={layout} isAdmin={admin} userId={user?.id ?? ''} />
}
