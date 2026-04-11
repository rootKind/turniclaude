import { TreePalm } from 'lucide-react'
export default function VacanzePage() {
  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4 flex flex-col items-center justify-center min-h-[60vh]">
      <TreePalm size={48} strokeWidth={1.5} className="text-muted-foreground mb-4" />
      <h1 className="text-lg font-bold">Ferie</h1>
      <p className="text-muted-foreground text-sm mt-2 text-center">
        La gestione delle ferie è in arrivo.<br />Torna presto!
      </p>
    </main>
  )
}
