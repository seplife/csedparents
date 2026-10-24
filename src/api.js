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

// ---------- Fonctions Administration (CSE Divo — Gestion) ----------

export async function adminConnecter(email, motDePasse) {
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password: motDePasse })
  if (error) throw error
  return data
}

export async function adminCreerCompte(email, motDePasse) {
  const { data, error } = await sb.auth.signUp({
    email: email.trim(),
    password: motDePasse,
  })
  if (error) throw error
  return data
}

export async function checkIsAdmin(user) {
  if (!user?.id) return false
  try {
    const { data, error } = await sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
    if (!error && data?.user_id) return true
  } catch {}
  try {
    const { data } = await sb.rpc('is_admin')
    return Boolean(data)
  } catch {
    return false
  }
}

export async function inscrireEleveAdmin({ nomParent, telephone, matricule, nom, prenom, classe, scolariteTotal }) {
  let tel = telephone.replace(/\D/g, '')
  if (tel.startsWith('225') && tel.length >= 11) {
    tel = tel.slice(3)
  }
  if (!/^[0-9]{8,15}$/.test(tel)) {
    throw new Error('Le numéro de téléphone doit contenir entre 8 et 15 chiffres.')
  }

  const codeGenere = Math.floor(100000 + Math.random() * 900000).toString()
  let familleId = null
  let codeActivation = codeGenere
  let rpcSucceeded = false

  try {
    const { data: resRpc, error: rpcErr } = await sb.rpc('inscrire_eleve', {
      p_nom_parent: nomParent.trim() || 'Parent / Tuteur',
      p_telephone: tel,
      p_matricule: matricule.trim().toUpperCase(),
      p_nom: nom.trim(),
      p_prenom: prenom.trim(),
      p_classe: classe.trim(),
    })
    if (!rpcErr && resRpc?.famille_id) {
      familleId = resRpc.famille_id
      rpcSucceeded = true
    }
  } catch (e) {
    console.warn('RPC inscrire_eleve non exécuté, tentative via tables directes:', e)
  }

  if (!rpcSucceeded) {
    const { data: familleExistante } = await sb
      .from('familles')
      .select('id, code_activation')
      .eq('telephone', tel)
      .maybeSingle()

    if (!familleExistante) {
      const { data: nouvelleFamille, error: errFamille } = await sb
        .from('familles')
        .insert({
          nom_parent: nomParent.trim() || 'Parent / Tuteur',
          telephone: tel,
          code_activation: codeGenere,
        })
        .select()
        .single()
      if (errFamille) throw errFamille
      familleId = nouvelleFamille.id
      codeActivation = nouvelleFamille.code_activation || codeGenere
    } else {
      familleId = familleExistante.id
      codeActivation = familleExistante.code_activation
    }

    const scolarite = Number(scolariteTotal) || 0
    const { error: errEleve } = await sb
      .from('eleves')
      .upsert(
        {
          famille_id: familleId,
          matricule: matricule.trim().toUpperCase(),
          nom: nom.trim(),
          prenom: prenom.trim(),
          classe: classe.trim(),
          scolarite_total: scolarite,
        },
        { onConflict: 'matricule' }
      )

    if (errEleve) throw errEleve
  } else {
    const { data: f } = await sb.from('familles').select('code_activation').eq('id', familleId).single()
    if (f?.code_activation) {
      codeActivation = f.code_activation
    }
    if (scolariteTotal) {
      await sb.from('eleves').update({ scolarite_total: Number(scolariteTotal) }).eq('matricule', matricule.trim().toUpperCase())
    }
  }

  return {
    familleId,
    codeActivation,
    telephone: tel,
    nomParent: nomParent.trim(),
    nom: nom.trim(),
    prenom: prenom.trim(),
    classe: classe.trim(),
    matricule: matricule.trim().toUpperCase(),
  }
}

export async function loadAdminFamilles() {
  const { data, error } = await sb
    .from('familles')
    .select('*, eleves(*)')
    .order('nom_parent')
  if (error) throw error
  return data || []
}

export async function loadAdminSmsQueue() {
  try {
    const { data, error } = await sb
      .from('sms_file')
      .select('*, familles(nom_parent, telephone, code_activation)')
      .order('cree_le', { ascending: false })
      .limit(50)
    if (error) return []
    return data || []
  } catch {
    return []
  }
}

export async function regenererCodeActivation(familleId) {
  const newCode = Math.floor(100000 + Math.random() * 900000).toString()
  const { data, error } = await sb
    .from('familles')
    .update({ code_activation: newCode, user_id: null })
    .eq('id', familleId)
    .select()
    .single()
  if (error) throw error
  return newCode
}

export async function supprimerEleve(eleveId) {
  const { error } = await sb.from('eleves').delete().eq('id', eleveId)
  if (error) throw error
}

