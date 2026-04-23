import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ADMIN_ID } from '@/types/database'
import { ColorSettingsPage } from '@/components/admin/color-settings-page'

export default async function AdminColoriPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ADMIN_ID) redirect('/dashboard')
  return <ColorSettingsPage />
}
