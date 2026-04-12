import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  email: string
  type: 'password-reset' | 'email-change'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Configurazione Supabase mancante')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const { email, type } = await req.json() as RequestBody

    if (!email || !type) {
      return new Response(
        JSON.stringify({ error: 'Email e tipo sono richiesti' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    if (type !== 'password-reset') {
      return new Response(
        JSON.stringify({ error: 'Tipo di operazione non valido' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    // Genera un codice OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString()

    // Prima salva l'OTP nel database
    const { error: dbError } = await supabase
      .from('otp_codes')
      .insert({
        email,
        code: otp,
        type,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      })

    if (dbError) {
      console.error('Database error:', dbError)
      return new Response(
        JSON.stringify({ error: 'Errore nel salvataggio del codice' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      )
    }

    // Invia l'email usando l'API di Supabase
    const { error: emailError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        data: {
          otp,
          type
        },
        redirectTo: `${supabaseUrl}/${type === 'password-reset' ? 'verify-password-otp' : 'verify-email-otp'}`
      }
    })

    if (emailError) {
      console.error('Email error:', emailError)
      // Se l'invio email fallisce, elimina l'OTP dal database
      await supabase
        .from('otp_codes')
        .delete()
        .eq('email', email)
        .eq('type', type)

      return new Response(
        JSON.stringify({ error: 'Errore nell\'invio dell\'email' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('General error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Errore interno del server' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
}) 