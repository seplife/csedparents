import { useEffect, useState } from 'react'
import {
  adminConnecter,
  adminCreerCompte,
  checkIsAdmin,
  deconnecter,
  inscrireEleveAdmin,
  loadAdminFamilles,
  loadAdminSmsQueue,
  regenererCodeActivation,
  sb,
  supprimerEleve,
} from './api.js'

const CLASSES = [
  '6ème 1', '6ème 2', '6ème 3',
  '5ème 1', '5ème 2', '5ème 3',
  '4ème 1', '4ème 2', '4ème 3',
  '3ème 1', '3ème 2', '3ème 3',
  '2nde A', '2nde C',
  '1ère A', '1ère D',
  'Terminale A1', 'Terminale A2', 'Terminale D',
]

function cleanTel(raw) {
  let d = (raw || '').replace(/\D/g, '')
  if (d.startsWith('225') && d.length >= 11) d = d.slice(3)
  return d
}

function waLink(tel, text) {
  const d = cleanTel(tel)
  const full = d.startsWith('225') ? d : '225' + d
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`
}

function messageWhatsApp(parent, eleve, code) {
  return `Bonjour ${parent.nom_parent || 'Parent d\'élève'},\n\nLe Collège Saint Édouard de Divo (CSED) a créé votre accès à CSED Parents+ pour le suivi de votre enfant ${eleve.prenom} ${eleve.nom} (${eleve.classe}).\n\n🔑 Votre CODE D'ACTIVATION est : ${code}\n\nPour créer votre mot de passe et suivre sa scolarité (notes, emploi du temps, absences, scolarité) :\n1. Rendez-vous sur : https://csedparents.vercel.app\n2. Cliquez sur « Première connexion ? Activer mon compte »\n3. Saisissez votre numéro (${cleanTel(parent.telephone)}), ce code d'activation et votre nouveau mot de passe.`
}

export default function AdminApp({ onSwitchToParent }) {
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('inscription') // inscription | repertoire | sms | aide

  // Données
  const [familles, setFamilles] = useState([])
  const [smsQueue, setSmsQueue] = useState([])
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState({ type: '', text: '' })

  // Auth form
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)

  // Inscription form
  const [parentNom, setParentNom] = useState('')
  const [parentTel, setParentTel] = useState('')
  const [eleveNom, setEleveNom] = useState('')
  const [elevePrenom, setElevePrenom] = useState('')
  const [eleveMatricule, setEleveMatricule] = useState('')
  const [eleveClasse, setEleveClasse] = useState('6ème 1')
  const [scolarite, setScolarite] = useState('')
  const [lastInscrit, setLastInscrit] = useState(null)

  // Filtre répertoire
  const [search, setSearch] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('tous') // tous | attente | active

  useEffect(() => {
    sb.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user || null
      setUser(u)
      if (u) {
        const admin = await checkIsAdmin(u)
        setIsAdmin(admin)
      }
      setLoading(false)
    })

    const { data: sub } = sb.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user || null
      setUser(u)
      if (u) {
        const admin = await checkIsAdmin(u)
        setIsAdmin(admin)
      } else {
        setIsAdmin(false)
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const refreshData = async () => {
    if (!isAdmin) return
    setBusy(true)
    try {
      const [f, s] = await Promise.all([loadAdminFamilles(), loadAdminSmsQueue()])
      setFamilles(f)
      setSmsQueue(s)
    } catch (err) {
      setFeedback({ type: 'err', text: 'Erreur lors du chargement des données : ' + err.message })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (isAdmin) refreshData()
  }, [isAdmin])

  // --- Handlers Auth ---
  async function handleAuth(e) {
    e.preventDefault()
    setBusy(true)
    setFeedback({ type: '', text: '' })
    try {
      if (isSignUp) {
        await adminCreerCompte(email, password)
        setFeedback({
          type: 'notice',
          text: 'Compte créé avec succès ! Si vous n\'êtes pas encore administrateur, ajoutez votre identifiant dans la table admins de Supabase.',
        })
      } else {
        await adminConnecter(email, password)
      }
    } catch (err) {
      setFeedback({ type: 'err', text: err.message || 'Échec de connexion.' })
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    await deconnecter()
    setUser(null)
    setIsAdmin(false)
    setFamilles([])
  }

  // --- Inscription Handler ---
  async function handleInscription(e) {
    e.preventDefault()
    if (!parentNom.trim()) return setFeedback({ type: 'err', text: 'Précisez le nom du parent.' })
    if (cleanTel(parentTel).length < 8) return setFeedback({ type: 'err', text: 'Numéro de téléphone invalide.' })
    if (!eleveNom.trim() || !elevePrenom.trim()) return setFeedback({ type: 'err', text: 'Précisez le nom et prénom de l\'élève.' })

    const matriculeFinal = eleveMatricule.trim() || `CSED-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`

    setBusy(true)
    setFeedback({ type: '', text: '' })

    try {
      const result = await inscrireEleveAdmin({
        nomParent: parentNom,
        telephone: parentTel,
        matricule: matriculeFinal,
        nom: eleveNom,
        prenom: elevePrenom,
        classe: eleveClasse,
        scolariteTotal: scolarite ? parseInt(scolarite, 10) : 0,
      })

      setLastInscrit(result)
      setFeedback({ type: 'ok', text: `Élève ${result.prenom} ${result.nom} inscrit avec succès !` })

      // Réinitialiser les champs de l'élève
      setEleveNom('')
      setElevePrenom('')
      setEleveMatricule('')
      setScolarite('')
      await refreshData()
    } catch (err) {
      setFeedback({ type: 'err', text: 'Erreur lors de l\'inscription : ' + (err.message || err) })
    } finally {
      setBusy(false)
    }
  }

  // --- Regénérer code ---
  async function handleRegenerer(familleId) {
    if (!confirm('Voulez-vous générer un nouveau code d\'activation ? L\'ancien code ne fonctionnera plus.')) return
    setBusy(true)
    try {
      const newCode = await regenererCodeActivation(familleId)
      setFeedback({ type: 'ok', text: `Nouveau code généré : ${newCode}` })
      await refreshData()
    } catch (err) {
      setFeedback({ type: 'err', text: 'Impossible de regénérer le code : ' + err.message })
    } finally {
      setBusy(false)
    }
  }

  // --- Supprimer élève ---
  async function handleSupprimer(eleveId, prenom, nom) {
    if (!confirm(`Supprimer définitivement l'élève ${prenom} ${nom} ?`)) return
    setBusy(true)
    try {
      await supprimerEleve(eleveId)
      setFeedback({ type: 'ok', text: `Élève ${prenom} ${nom} supprimé.` })
      await refreshData()
    } catch (err) {
      setFeedback({ type: 'err', text: 'Erreur : ' + err.message })
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="center">Chargement de l'administration…</div>
  }

  // --- Écran 1 : Non connecté ou Non Admin ---
  if (!user || !isAdmin) {
    return (
      <div className="loginwrap">
        <div className="logincard" style={{ maxWidth: 460 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div className="brand">
              CSE Divo <span>Gestion</span>
            </div>
            <button className="linkbtn small" onClick={onSwitchToParent}>
              ← Espace Parents
            </button>
          </div>

          <h1>Portail Établissement</h1>
          <p className="muted" style={{ marginBottom: 18 }}>
            Application de gestion du Collège Saint Édouard de Divo (inscriptions, familles, codes d'activation).
          </p>

          {user && !isAdmin && (
            <div className="panel" style={{ border: '2px solid var(--red)', background: 'var(--red-soft)', marginBottom: 18 }}>
              <strong style={{ color: 'var(--red)', display: 'block', marginBottom: 6 }}>Accès refusé : compte non administrateur</strong>
              <p className="small" style={{ marginBottom: 8 }}>
                Le compte <code>{user.email}</code> est connecté mais n'est pas dans la table <code>admins</code> de Supabase.
              </p>
              <p className="small muted" style={{ marginBottom: 6 }}>
                Pour l'activer, exécutez cette commande dans Supabase &gt; SQL Editor :
              </p>
              <pre
                style={{
                  background: 'var(--surface)',
                  padding: 8,
                  borderRadius: 6,
                  fontSize: '0.8rem',
                  overflowX: 'auto',
                  border: '1px solid var(--line)',
                }}
              >
                {`INSERT INTO public.admins (user_id) VALUES ('${user.id}') ON CONFLICT DO NOTHING;`}
              </pre>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  className="btn"
                  style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                  onClick={() => {
                    navigator.clipboard.writeText(`INSERT INTO public.admins (user_id) VALUES ('${user.id}') ON CONFLICT DO NOTHING;`)
                    alert('Commande SQL copiée ! Collez-la dans Supabase > SQL Editor.')
                  }}
                >
                  📋 Copier la commande SQL
                </button>
                <button
                  className="btn ghost"
                  style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                  onClick={() => window.location.reload()}
                >
                  🔄 J'ai activé, recharger
                </button>
              </div>
              <button
                className="linkbtn small"
                style={{ marginTop: 12, color: 'var(--ink)' }}
                onClick={handleLogout}
              >
                Se déconnecter
              </button>
            </div>
          )}

          {(!user || (!isAdmin && isSignUp)) && (
            <form onSubmit={handleAuth} noValidate>
              <label htmlFor="adm-email">Adresse e-mail administrateur</label>
              <input
                id="adm-email"
                type="email"
                placeholder="direction@csed.ci"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <label htmlFor="adm-pwd">Mot de passe</label>
              <input
                id="adm-pwd"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              {feedback.text && (
                <p className={feedback.type === 'err' ? 'err' : 'notice'} role="alert" style={{ marginTop: 12 }}>
                  {feedback.text}
                </p>
              )}

              <button className="btn" type="submit" disabled={busy} style={{ width: '100%', marginTop: 20 }}>
                {isSignUp ? 'Créer le compte administrateur' : 'Se connecter à la gestion'}
              </button>
            </form>
          )}

          <div style={{ marginTop: 18, textAlign: 'center' }}>
            <button
              className="linkbtn"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setFeedback({ type: '', text: '' })
              }}
            >
              {isSignUp ? 'J\'ai déjà un compte admin (Se connecter)' : 'Créer un nouveau compte administrateur'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- Écran 2 : Connecté et Administrateur ---
  const famillesFiltrees = familles.filter((f) => {
    const parentMatch = (f.nom_parent || '').toLowerCase().includes(search.toLowerCase())
    const telMatch = (f.telephone || '').includes(search)
    const eleveMatch = (f.eleves || []).some(
      (e) =>
        e.nom.toLowerCase().includes(search.toLowerCase()) ||
        e.prenom.toLowerCase().includes(search.toLowerCase()) ||
        e.classe.toLowerCase().includes(search.toLowerCase()) ||
        e.matricule.toLowerCase().includes(search.toLowerCase())
    )
    const statutMatch =
      filtreStatut === 'tous'
        ? true
        : filtreStatut === 'active'
        ? Boolean(f.user_id)
        : !f.user_id
    return (parentMatch || telMatch || eleveMatch) && statutMatch
  })

  return (
    <div className="app" style={{ maxWidth: 880 }}>
      {/* Top Header */}
      <header className="top" style={{ flexWrap: 'wrap', gap: 12, borderBottom: '1px solid var(--line)', paddingBottom: 12, marginBottom: 16 }}>
        <div>
          <div className="brand" style={{ fontSize: '1.25rem' }}>
            CSE DIVO <span>Gestion Scolaire</span>
          </div>
          <p className="muted small">Collège Saint Édouard de Divo — Inscriptions & Accès Parents</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="tag ok" title={user.email}>
            Admin : {user.email?.split('@')[0]}
          </span>
          <button className="btn ghost small" onClick={onSwitchToParent}>
            📱 Espace Parents
          </button>
          <button className="btn ghost small" onClick={handleLogout}>
            Déconnexion
          </button>
        </div>
      </header>

      {/* Tabs Menu */}
      <div className="seg" style={{ marginBottom: 20 }}>
        <button aria-pressed={tab === 'inscription'} onClick={() => setTab('inscription')}>
          ✍️ Inscrire un élève
        </button>
        <button aria-pressed={tab === 'repertoire'} onClick={() => { setTab('repertoire'); refreshData() }}>
          👥 Répertoire ({familles.length})
        </button>
        <button aria-pressed={tab === 'sms'} onClick={() => { setTab('sms'); refreshData() }}>
          📨 File WhatsApp ({smsQueue.length})
        </button>
        <button aria-pressed={tab === 'aide'} onClick={() => setTab('aide')}>
          ℹ️ Guide & Secrets
        </button>
      </div>

      {feedback.text && (
        <div
          className={feedback.type === 'err' ? 'notice' : 'notice'}
          style={{
            background: feedback.type === 'err' ? 'var(--red-soft)' : 'var(--green-soft)',
            color: feedback.type === 'err' ? 'var(--red)' : 'var(--green)',
            marginBottom: 16,
          }}
        >
          {feedback.text}
          <button
            style={{ float: 'right', border: 0, background: 'none', cursor: 'pointer', fontWeight: 700 }}
            onClick={() => setFeedback({ type: '', text: '' })}
          >
            ✕
          </button>
        </div>
      )}

      {/* ==================== TAB 1 : INSCRIPTION ==================== */}
      {tab === 'inscription' && (
        <div>
          {/* Modal / Encart de succès après inscription */}
          {lastInscrit && (
            <div
              className="panel"
              style={{
                border: '2px solid var(--green)',
                background: 'var(--green-soft)',
                padding: 20,
                marginBottom: 20,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h2 style={{ color: 'var(--green)', margin: 0 }}>🎉 Inscription réussie !</h2>
                <button className="linkbtn small" onClick={() => setLastInscrit(null)}>
                  Fermer ✕
                </button>
              </div>

              <div style={{ margin: '14px 0', fontSize: '1rem' }}>
                <p>
                  <strong>Élève :</strong> {lastInscrit.prenom} {lastInscrit.nom} ({lastInscrit.classe}) — Matricule :{' '}
                  <code>{lastInscrit.matricule}</code>
                </p>
                <p>
                  <strong>Parent :</strong> {lastInscrit.nomParent} — Téléphone :{' '}
                  <strong style={{ color: 'var(--blue)' }}>0{cleanTel(lastInscrit.telephone)}</strong>
                </p>
              </div>

              {/* Code d'activation grand format */}
              <div
                style={{
                  background: 'var(--surface)',
                  padding: 16,
                  borderRadius: 12,
                  textAlign: 'center',
                  border: '1px dashed var(--green)',
                  margin: '14px 0',
                }}
              >
                <span className="muted small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Code d'activation CSED Parents+
                </span>
                <div
                  style={{
                    fontFamily: '"Bricolage Grotesque", monospace',
                    fontSize: '2.5rem',
                    fontWeight: 700,
                    letterSpacing: '0.15em',
                    color: 'var(--blue)',
                    margin: '6px 0',
                  }}
                >
                  {lastInscrit.codeActivation}
                </div>
                <p className="small muted">Ce code permet au parent de créer son mot de passe lors de sa première visite.</p>
              </div>

              {/* Actions de partage */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                <a
                  className="btn"
                  href={waLink(
                    lastInscrit.telephone,
                    messageWhatsApp(
                      { nom_parent: lastInscrit.nomParent, telephone: lastInscrit.telephone },
                      lastInscrit,
                      lastInscrit.codeActivation
                    )
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ background: '#25D366', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  📱 Envoyer immédiatement par WhatsApp
                </a>

                <button
                  className="btn ghost"
                  onClick={() => {
                    const msg = messageWhatsApp(
                      { nom_parent: lastInscrit.nomParent, telephone: lastInscrit.telephone },
                      lastInscrit,
                      lastInscrit.codeActivation
                    )
                    navigator.clipboard.writeText(msg)
                    alert('Message d\'activation complet copié dans le presse-papier !')
                  }}
                >
                  📋 Copier le message
                </button>

                <button
                  className="btn ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(lastInscrit.codeActivation)
                    alert(`Code ${lastInscrit.codeActivation} copié !`)
                  }}
                >
                  📋 Copier le code seul
                </button>
              </div>
            </div>
          )}

          <div className="panel">
            <h2>Nouvelle Inscription</h2>
            <p className="muted small" style={{ marginBottom: 18 }}>
              Renseignez les coordonnées de la famille et de l'élève. Le système rattachera automatiquement l'élève au parent
              et générera son code d'activation.
            </p>

            <form onSubmit={handleInscription}>
              <div className="duo" style={{ marginBottom: 14 }}>
                {/* Section Parent */}
                <div style={{ background: 'var(--paper)', padding: 14, borderRadius: 10 }}>
                  <h3 style={{ fontSize: '1rem', color: 'var(--blue)', marginBottom: 10 }}>👤 Coordonnées du Parent / Tuteur</h3>

                  <label htmlFor="pnom" className="small" style={{ fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    Nom et Prénom du parent *
                  </label>
                  <input
                    id="pnom"
                    type="text"
                    placeholder="M. KOUAMÉ Kouassi"
                    value={parentNom}
                    onChange={(e) => setParentNom(e.target.value)}
                    style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--line)', marginBottom: 12 }}
                    required
                  />

                  <label htmlFor="ptel" className="small" style={{ fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    Numéro de Téléphone (WhatsApp) *
                  </label>
                  <input
                    id="ptel"
                    type="tel"
                    placeholder="0701020304"
                    value={parentTel}
                    onChange={(e) => setParentTel(e.target.value)}
                    style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--line)' }}
                    required
                  />
                  <small className="muted" style={{ display: 'block', marginTop: 4 }}>
                    Numéro sans indicatif (+225 ajouté auto).
                  </small>
                </div>

                {/* Section Élève */}
                <div style={{ background: 'var(--paper)', padding: 14, borderRadius: 10 }}>
                  <h3 style={{ fontSize: '1rem', color: 'var(--blue)', marginBottom: 10 }}>🎓 Informations de l'Élève</h3>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <label htmlFor="enom" className="small" style={{ fontWeight: 700, display: 'block', marginBottom: 4 }}>
                        Nom élève *
                      </label>
                      <input
                        id="enom"
                        type="text"
                        placeholder="KOUAMÉ"
                        value={eleveNom}
                        onChange={(e) => setEleveNom(e.target.value)}
                        style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--line)' }}
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="eprenom" className="small" style={{ fontWeight: 700, display: 'block', marginBottom: 4 }}>
                        Prénom élève *
                      </label>
                      <input
                        id="eprenom"
                        type="text"
                        placeholder="Aya Marie"
                        value={elevePrenom}
                        onChange={(e) => setElevePrenom(e.target.value)}
                        style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--line)' }}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <label htmlFor="eclasse" className="small" style={{ fontWeight: 700, display: 'block', marginBottom: 4 }}>
                        Classe *
                      </label>
                      <select
                        id="eclasse"
                        value={eleveClasse}
                        onChange={(e) => setEleveClasse(e.target.value)}
                        style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)' }}
                      >
                        {CLASSES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="emat" className="small" style={{ fontWeight: 700, display: 'block', marginBottom: 4 }}>
                        Matricule (optionnel)
                      </label>
                      <input
                        id="emat"
                        type="text"
                        placeholder="CSED-2024-..."
                        value={eleveMatricule}
                        onChange={(e) => setEleveMatricule(e.target.value)}
                        style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--line)' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="esco" className="small" style={{ fontWeight: 700, display: 'block', marginBottom: 4 }}>
                      Scolarité totale annuelle (F CFA)
                    </label>
                    <input
                      id="esco"
                      type="number"
                      placeholder="Ex: 180000"
                      value={scolarite}
                      onChange={(e) => setScolarite(e.target.value)}
                      style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--line)' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn" type="submit" disabled={busy} style={{ padding: '12px 24px', fontSize: '1rem' }}>
                  {busy ? 'Enregistrement en cours…' : '💾 Inscrire l\'élève & Générer le code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== TAB 2 : RÉPERTOIRE ==================== */}
      {tab === 'repertoire' && (
        <div>
          <div className="panel" style={{ padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="search"
                placeholder="🔍 Rechercher (nom, élève, classe, tél, matricule)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 240,
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                }}
              />

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className={filtreStatut === 'tous' ? 'btn small' : 'btn ghost small'}
                  onClick={() => setFiltreStatut('tous')}
                >
                  Tous ({familles.length})
                </button>
                <button
                  className={filtreStatut === 'attente' ? 'btn small' : 'btn ghost small'}
                  onClick={() => setFiltreStatut('attente')}
                >
                  🟡 En attente
                </button>
                <button
                  className={filtreStatut === 'active' ? 'btn small' : 'btn ghost small'}
                  onClick={() => setFiltreStatut('active')}
                >
                  🟢 Activés
                </button>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="rowhead">
              <h2>Familles et Élèves enregistrés</h2>
              <button className="linkbtn small" onClick={refreshData} disabled={busy}>
                🔄 Actualiser
              </button>
            </div>

            {!famillesFiltrees.length ? (
              <p className="muted" style={{ padding: '20px 0', textAlign: 'center' }}>
                Aucune famille ne correspond à votre recherche.
              </p>
            ) : (
              famillesFiltrees.map((f) => {
                const isActivated = Boolean(f.user_id)
                const code = f.code_activation || '------'
                const firstEleve = f.eleves?.[0] || { prenom: 'Élève', nom: '', classe: '' }

                return (
                  <div
                    key={f.id}
                    style={{
                      borderTop: '1px solid var(--line)',
                      padding: '14px 0',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                      {/* Info Parent */}
                      <div>
                        <strong style={{ fontSize: '1.05rem' }}>{f.nom_parent}</strong>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <span className="muted small">📞 0{cleanTel(f.telephone)}</span>
                          <span className={'tag ' + (isActivated ? 'ok' : 'bad')}>
                            {isActivated ? '🟢 Compte activé' : '🟡 En attente d\'activation'}
                          </span>
                        </div>
                      </div>

                      {/* Code d'activation & Boutons */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div
                          style={{
                            background: 'var(--blue-soft)',
                            color: 'var(--blue)',
                            padding: '6px 12px',
                            borderRadius: 8,
                            fontWeight: 700,
                            fontFamily: 'monospace',
                            fontSize: '1.1rem',
                            letterSpacing: '0.08em',
                          }}
                          title="Code d'activation"
                        >
                          Code : {code}
                        </div>

                        <a
                          className="btn small"
                          href={waLink(f.telephone, messageWhatsApp(f, firstEleve, code))}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ background: '#25D366', color: '#fff', textDecoration: 'none', padding: '6px 10px' }}
                          title="Ouvrir WhatsApp avec le message d'activation"
                        >
                          📱 WhatsApp
                        </a>

                        <button
                          className="btn ghost small"
                          onClick={() => {
                            navigator.clipboard.writeText(code)
                            alert(`Code ${code} copié !`)
                          }}
                          title="Copier le code"
                        >
                          📋
                        </button>

                        <button
                          className="btn ghost small"
                          onClick={() => handleRegenerer(f.id)}
                          title="Générer un nouveau code d'activation"
                        >
                          🔄 Nouveau code
                        </button>
                      </div>
                    </div>

                    {/* Liste des enfants */}
                    <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: '3px solid var(--line)' }}>
                      <span className="muted small" style={{ fontWeight: 700 }}>
                        Enfant(s) rattaché(s) :
                      </span>
                      {(!f.eleves || !f.eleves.length) && <p className="small muted">Aucun élève rattaché.</p>}
                      {(f.eleves || []).map((e) => (
                        <div
                          key={e.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginTop: 6,
                            background: 'var(--paper)',
                            padding: '6px 10px',
                            borderRadius: 6,
                          }}
                        >
                          <div>
                            <strong>
                              {e.prenom} {e.nom}
                            </strong>{' '}
                            <span className="tag info" style={{ marginLeft: 6 }}>
                              {e.classe}
                            </span>{' '}
                            <span className="muted small" style={{ marginLeft: 6 }}>
                              (Matr: {e.matricule})
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {e.scolarite_total > 0 && (
                              <span className="small muted">
                                Scolarité : {Number(e.scolarite_total).toLocaleString('fr-FR')} F
                              </span>
                            )}
                            <button
                              className="linkbtn small"
                              style={{ color: 'var(--red)' }}
                              onClick={() => handleSupprimer(e.id, e.prenom, e.nom)}
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 3 : FILE WHATSAPP & SMS ==================== */}
      {tab === 'sms' && (
        <div className="panel">
          <div className="rowhead">
            <h2>File d'envoi automatique (WhatsApp / SMS)</h2>
            <button className="linkbtn small" onClick={refreshData}>
              🔄 Actualiser
            </button>
          </div>
          <p className="muted small" style={{ marginBottom: 16 }}>
            Cette table liste les tentatives d'envoi automatique effectuées par l'Edge Function Supabase.
          </p>

          {!smsQueue.length ? (
            <p className="muted" style={{ padding: '20px 0', textAlign: 'center' }}>
              Aucun envoi dans la file d'attente pour l'instant.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 6px' }}>Date</th>
                    <th style={{ padding: '8px 6px' }}>Parent</th>
                    <th style={{ padding: '8px 6px' }}>Téléphone</th>
                    <th style={{ padding: '8px 6px' }}>Statut</th>
                    <th style={{ padding: '8px 6px' }}>Tentatives</th>
                    <th style={{ padding: '8px 6px' }}>Détail / Erreur</th>
                  </tr>
                </thead>
                <tbody>
                  {smsQueue.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '8px 6px' }}>{new Date(s.cree_le).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td style={{ padding: '8px 6px' }}>{s.familles?.nom_parent || '–'}</td>
                      <td style={{ padding: '8px 6px' }}>{s.familles?.telephone || '–'}</td>
                      <td style={{ padding: '8px 6px' }}>
                        <span className={'tag ' + (s.statut === 'envoye' ? 'ok' : s.statut === 'echec' ? 'bad' : 'info')}>
                          {s.statut}
                        </span>
                      </td>
                      <td style={{ padding: '8px 6px' }}>{s.tentatives}</td>
                      <td style={{ padding: '8px 6px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.erreur || ''}>
                        {s.erreur || (s.statut === 'envoye' ? 'Message remis' : 'En attente d\'exécution')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 4 : GUIDE & SECRETS ==================== */}
      {tab === 'aide' && (
        <div>
          <div className="panel">
            <h2>Guide d'utilisation pour l'Établissement</h2>
            <div style={{ marginTop: 12, lineHeight: 1.6 }}>
              <h3 style={{ fontSize: '1.05rem', color: 'var(--blue)', marginTop: 12 }}>1. Comment donner le code d'activation aux parents ?</h3>
              <p className="small muted">
                À chaque nouvelle inscription dans l'onglet <strong>« Inscrire un élève »</strong>, un code à 6 chiffres est généré.
                Vous pouvez :
              </p>
              <ul className="small muted" style={{ paddingLeft: 20, margin: '6px 0' }}>
                <li>Cliquer sur le bouton vert <strong>« 📱 Envoyer par WhatsApp »</strong> : votre application WhatsApp s'ouvrira immédiatement avec le message complet et le numéro du parent pré-remplis !</li>
                <li>Ou lui communiquer le code par téléphone, SMS ou sur fiche papier au secrétariat.</li>
              </ul>

              <h3 style={{ fontSize: '1.05rem', color: 'var(--blue)', marginTop: 16 }}>2. Que fait le parent avec ce code ?</h3>
              <p className="small muted">
                Le parent ouvre <strong>https://csedparents.vercel.app</strong> sur son smartphone, clique sur{' '}
                <em>« Première connexion ? Activer mon compte »</em>, tape son numéro de téléphone et le code d'activation, puis choisit son mot de passe.
                Dès lors, il accède à l'emploi du temps, aux notes et au suivi financier de son enfant.
              </p>

              <h3 style={{ fontSize: '1.05rem', color: 'var(--blue)', marginTop: 16 }}>3. Ajouter un autre compte administrateur</h3>
              <p className="small muted">
                Pour qu'un autre membre de la direction puisse se connecter à cette interface, il doit :
              </p>
              <ol className="small muted" style={{ paddingLeft: 20, margin: '6px 0' }}>
                <li>Créer un compte sur l'écran d'accueil administration.</li>
                <li>Puis exécuter dans Supabase &gt; SQL Editor :</li>
              </ol>
              <pre
                style={{
                  background: 'var(--paper)',
                  padding: 10,
                  borderRadius: 8,
                  fontSize: '0.85rem',
                  border: '1px solid var(--line)',
                }}
              >
                {`INSERT INTO public.admins (user_id) 
SELECT id FROM auth.users WHERE email = 'adresse@csed.ci';`}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
