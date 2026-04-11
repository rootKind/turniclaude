export default function ConfirmEmailPage() {
  return (
    <div className="w-full max-w-sm text-center space-y-2">
      <h1 className="text-2xl font-bold">Email confermata</h1>
      <p className="text-muted-foreground text-sm">
        Email confermata. Puoi accedere.
      </p>
      <a href="/login" className="inline-block mt-4 text-sm underline hover:no-underline">
        Vai al login
      </a>
    </div>
  )
}
