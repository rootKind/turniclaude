import { createClient } from '@/lib/supabase/client'
import type { UserProfile } from '@/types/database'

export async function fetchCurrentUserProfile(): Promise<UserProfile | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()
  if (error) return null
  return data as UserProfile
}

export async function updateUserProfile(updates: Partial<Pick<UserProfile,
  | 'notification_enabled'
  | 'notify_on_interest'
  | 'notify_on_new_shift'
  | 'notify_on_vacation_interest'
  | 'notify_on_new_vacation'
>>) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { error } = await supabase.from('users').update(updates).eq('id', user.id)
  if (error) throw error
}

export async function fetchAllUsers(): Promise<UserProfile[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('users').select('*').order('cognome')
  if (error) throw error
  return data as UserProfile[]
}

export async function fetchAllUsersMinimal(): Promise<Pick<UserProfile, 'id' | 'nome' | 'cognome'>[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, nome, cognome')
    .order('cognome')
  if (error) throw error
  return data as Pick<UserProfile, 'id' | 'nome' | 'cognome'>[]
}

export async function fetchUsersByGroup(isSecondary: boolean): Promise<Pick<UserProfile, 'id' | 'nome' | 'cognome'>[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, nome, cognome')
    .eq('is_secondary', isSecondary)
    .order('cognome')
  if (error) throw error
  return data as Pick<UserProfile, 'id' | 'nome' | 'cognome'>[]
}
