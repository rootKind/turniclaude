export const dictionary = {
  auth: {
    login: {
      title: "Accedi",
      description: "Inserisci le tue credenziali per accedere",
      email: "Email",
      password: "Password",
      submit: "Accedi",
      loading: "Accesso in corso...",
      emailPlaceholder: "nome@esempio.com",
      error: "Email o password non validi"
    }
  },
  dashboard: {
    welcome: "Benvenuto",
    notAuthenticated: "Non sei autenticato",
    table: {
      name: "Nome",
      surname: "Cognome",
      createdAt: "Data Creazione",
      notifications: "Notifiche",
      active: "Attive",
      inactive: "Disattive"
    },
    shiftDialog: {
      title: "Scambio Turno",
      offeredShift: "Turno offerto",
      takenShift: "Turno ricercato",
      date: "Data turno offerto",
      submit: "Invia",
      shifts: {
        morning: "Mattina",
        afternoon: "Pomeriggio",
        night: "Notte"
      }
    }
  }
}

export type Dictionary = typeof dictionary 