import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProvaMovimento } from '@/components/admin/prova-movimento'
import { ADMIN_ID } from '@/types/database'

/**
 * LA SONDA DEL MOVIMENTO (M7, 22/09/2026).
 *
 * Sta sotto `/admin` e non fra le pagine dell'app perché **non è una schermata**:
 * è uno strumento di taratura, come il pannello colori. La guardia è la stessa
 * delle altre pagine admin (ADMIN_ID), quindi non esiste un modo per un utente di
 * arrivarci.
 *
 * Perché serve una pagina e non un mockup: le molle sono token del foglio di
 * stile, e un mockup avrebbe i suoi valori — cioè mostrerebbe un movimento che
 * l'app non fa. Qui si muovono i controlli VERI (`<Button>`, `<FilterChip>`, la
 * classe `.month-pop`), con i token veri, sulla skin vera.
 */
export default async function MovimentoPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== ADMIN_ID) redirect('/dashboard')
  return <ProvaMovimento />
}
