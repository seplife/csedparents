import { createClient } from '@supabase/supabase-js'

// La clé anon Supabase est publique par conception (elle active la RLS côté client).
// Ces valeurs par défaut permettent le fonctionnement sans configuration .env.
const url = import.meta.env.VITE_SUPABASE_URL
  || 'https://gwzvoiukzwdqskcjpghk.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3enZvaXVrendkcXNrY2pwZ2hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3NjI5NTMsImV4cCI6MjEwODMzODk1M30.4SCxbVjT3JAMSw562cLjaRatAw9IqOSWENG4JFsrNR4'

export const configured = Boolean(url && key)
export const sb = configured ? createClient(url, key) : null

/** Le numéro de téléphone sert d'identifiant : 0700000000@parents.csed.app */
const EMAIL_DOMAIN = 'parents.csed.app'
const mail = (telephone) => telephone.replace(/\D/g, '') + '@' + EMAIL_DOMAIN

/** Code saisi à la première connexion, appliqué dès que le compte existe. */
let pendingCode = null
export function takePending() {
  const code = pendingCode
  pendingCode = null
  return code
}

function unwrap({ data, error }) {
  if (error) throw error
  return data
}

export async function connecter(telephone, motDePasse) {
  const { error } = await sb.auth.signInWithPassword({ email: mail(telephone), password: motDePasse })
  if (error) throw error
}

export async function creerCompte(telephone, code, motDePasse) {
  pendingCode = code
  const { data, error } = await sb.auth.signUp({
    email: mail(telephone),
    password: motDePasse,
    options: { data: { code: code.trim() } },
  })
  if (error) {
    pendingCode = null
    throw error
  }
  // Sans session immédiate, « Confirm email » est resté activé dans Supabase.
  if (!data.session) {
    pendingCode = null
    throw new Error('CONFIRM_EMAIL')
  }
}

export const deconnecter = () => sb.auth.signOut()

export const activer = async (code) => unwrap(await sb.rpc('activer_compte', { p_code: code.trim() }))

export const justifier = async (presenceId, motif) =>
  unwrap(await sb.rpc('envoyer_justificatif', { p_presence: presenceId, p_motif: motif.trim() }))

export const loadEleves = async () => unwrap(await sb.from('eleves').select('*').order('prenom'))

export async function loadData(eleve) {
  const today = new Date().toLocaleDateString('en-CA') // AAAA-MM-JJ, heure locale
  const [cours, evaluations, notes, presences, echeances] = await Promise.all([
    sb.from('cours').select('*').eq('classe', eleve.classe).order('debut'),
    sb.from('evaluations').select('*').eq('classe', eleve.classe).gte('date', today).order('date'),
    sb.from('notes').select('*').eq('eleve_id', eleve.id).order('date'),
    sb.from('presences').select('*').eq('eleve_id', eleve.id).order('date', { ascending: false }),
    sb.from('echeances').select('*').eq('eleve_id', eleve.id).order('date_limite'),
  ])
  return {
    cours: unwrap(cours),
    evaluations: unwrap(evaluations),
    notes: unwrap(notes),
    presences: unwrap(presences),
    echeances: unwrap(echeances),
  }
}
