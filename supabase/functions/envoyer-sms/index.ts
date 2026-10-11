// Edge Function : envoie par SMS (Twilio) le code d'activation des familles.
// Appelée par le déclencheur SQL (corps webhook {type, record}) ou par la relance (corps vide).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MAX_TENTATIVES = 5

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

/** 0700000000 -> +2250700000000 ; 2250700000000 -> +2250700000000 */
function formatNumero(tel: string): string {
  const d = tel.replace(/\D/g, '')
  if (d.startsWith('225') && d.length >= 12) return '+' + d
  return '+225' + d
}

async function envoyer(numero: string, message: string) {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')!
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')!
  const service = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID') // optionnel
  const from = Deno.env.get('TWILIO_FROM') // numéro Twilio ou nom d'expéditeur
  const params = new URLSearchParams({ To: numero, Body: message })
  if (service) params.set('MessagingServiceSid', service)
  else params.set('From', from!)

  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${await r.text()}`)
}

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) {
    return new Response('Non autorisé', { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const id: string | undefined = body?.record?.id

  let q = supabase
    .from('sms_file')
    .select('id, tentatives, familles(nom_parent, telephone, code_activation)')
    .eq('statut', 'en_attente')
    .lt('tentatives', MAX_TENTATIVES)
    .limit(50)
  if (id) q = q.eq('id', id)
  const { data: lignes, error } = await q
  if (error) return new Response(error.message, { status: 500 })
  if (!lignes?.length) return new Response('Rien à envoyer')

  let ok = 0
  for (const l of lignes) {
    const f = (l as any).familles
    const message = `CSED Parents+ : votre code d'activation est ${f.code_activation}. Ouvrez l'application, choisissez « Première connexion » et saisissez ce code.`
    try {
      await envoyer(formatNumero(f.telephone), message)
      await supabase.from('sms_file').update({ statut: 'envoye', envoye_le: new Date().toISOString(), erreur: null, tentatives: l.tentatives + 1 }).eq('id', l.id)
      ok++
    } catch (e) {
      const tentatives = l.tentatives + 1
      await supabase.from('sms_file').update({
        tentatives,
        erreur: String(e).slice(0, 500),
        statut: tentatives >= MAX_TENTATIVES ? 'echec' : 'en_attente',
      }).eq('id', l.id)
    }
  }
  return new Response(`${ok}/${lignes.length} SMS envoyés`)
})
