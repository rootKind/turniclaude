'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * M12 — LA VIA D'USCITA (23/09/2026).
 *
 * Uno stato vuoto che non offre niente lascia la persona in un vicolo cieco: la
 * domanda non è «perché non c'è niente», è «**e adesso?**». Il piano di M12 lo
 * chiedeva per tutti gli stati vuoti e di errore, e la passata li ha trovati
 * sparsi in una decina di schermate — ognuna con la sua frase e nessuna con una
 * via d'uscita.
 *
 * Questo componente esiste per una ragione precisa e piccola: perché le vie
 * d'uscita siano la STESSA cosa. Se ognuna fosse scritta a mano, la terza sarebbe
 * un `Button variant="link"`, la quinta un `<a>` sottolineato e la settima un
 * «clicca qui» — e l'app avrebbe sette modi di dire «prova da qui». Il primo è
 * quello che la board delle notifiche usa dal 23/09: testo primario, semibold,
 * sottolineato al passaggio.
 *
 * `href` e `onClick` sono alternativi di proposito: o si va da qualche parte
 * (turni di sala) o si cambia qualcosa QUI (azzerare una ricerca, ricaricare).
 */
export function ViaUscita({
  children,
  onClick,
  href,
  className,
}: {
  children: React.ReactNode
  onClick?: () => void
  href?: string
  className?: string
}) {
  const classi = cn(
    'text-sm font-semibold text-primary underline-offset-4 hover:underline',
    className,
  )
  if (href) {
    return (
      <Link href={href} className={classi}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={classi}>
      {children}
    </button>
  )
}
