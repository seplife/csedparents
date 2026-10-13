// Edge Function : envoie par WhatsApp (API Cloud de Meta) le code d'activation des familles.
// Appelée par le déclencheur SQL (corps webhook {type, record}) ou par la relance (corps vide).
//
// Secrets à définir (supabase secrets set ...) :
//   WEBHOOK_SECRET            secret partagé avec le déclencheur SQL
//   WHATSAPP_TOKEN            jeton d'accès permanent (utilisateur système Meta)
//   WHATSAPP_PHONE_ID         identifiant du numéro WhatsApp Business expéditeur
//   WHATSAPP_TEMPLATE         nom du modèle approuvé (ex. code_activation_csed)
//   WHATSAPP_LANG             code langue du modèle (défaut : fr)
//   WHATSAPP_TEMPLATE_AUTH    "true" si le modèle est de catégorie « Authentification » (bouton copier le code)
//   INDICATIF_PAYS            indicatif sans « + » (défaut : 225)
//
// Le modèle doit contenir une variable {{1}} = le code d'activation.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MAX_TENTATIVES = 5
const INDICATIF = Deno.env.get('INDICATIF_PAYS') ?? '225'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

/** 0700000000 -> 2250700000000 (format attendu par WhatsApp : chiffres, sans « + ») */
function formatNumero(tel: string): string {
  const d = tel.replace(/\D/g, '')
  if (d.startsWith(INDICATIF) && d.length >= INDICATIF.length + 8) return d
  return INDICATIF + d
}

async function envoyer(numero: string, code: string) {
  const token = Deno.env.get('WHATSAPP_TOKEN')!
  const phoneId = Deno.env.get('WHATSAPP_PHONE_ID')!
  const components: unknown[] = [{ type: 'body', parameters: [{ type: 'text', text: code }] }]
  if (Deno.env.get('WHATSAPP_TEMPLATE_AUTH') === 'true') {
    components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] })
  }
  const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: numero,
      type: 'template',
      template: {
        name: Deno.env.get('WHATSAPP_TEMPLATE')!,
        language: { code: Deno.env.get('WHATSAPP_LANG') ?? 'fr' },
        components,
      },
    }),
  })
  if (!r.ok) throw new Error(`WhatsApp ${r.status}: ${await r.text()}`)
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
    try {
      await envoyer(formatNumero(f.telephone), f.code_activation)
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
  return new Response(`${ok}/${lignes.length} messages WhatsApp envoyés`)
})
