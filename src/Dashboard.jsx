import { useState } from 'react'
import { justifier } from './api.js'
import { exportZip } from './export.js'

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const STATUTS = { justifiee: 'Justifiée', justificatif_envoye: 'Justificatif envoyé' }
const TABS = [
  ['accueil', 'Accueil', 'M3 11l9-7 9 7v9H3z M9 20v-6h6v6'],
  ['horaires', 'Horaires', 'M4 5h16v15H4z M4 10h16 M8 3v4 M16 3v4'],
  ['controles', 'Contrôles', 'M6 3h9l4 4v14H6z M9 12l2 2 4-4'],
  ['notes', 'Notes', 'M5 4h14v16H5z M9 4v16 M12 9h4 M12 13h4'],
  ['presences', 'Présences', 'M12 12a4 4 0 100-8 4 4 0 000 8z M4 21c0-4 4-6 8-6s8 2 8 6'],
  ['scolarite', 'Scolarité', 'M3 7h18v11H3z M3 11h18 M7 15h3'],
]

// ---------- Formats ----------
const fcfa = (n) => Number(n).toLocaleString('fr-FR') + ' F CFA'
const num = (n) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const heure = (t) => String(t || '').slice(0, 5)
const jsDate = (iso) => new Date(iso + 'T12:00')
const fmt = (d, o) => new Intl.DateTimeFormat('fr-FR', o).format(d)
const jourMois = (iso) => fmt(jsDate(iso), { day: 'numeric', month: 'long' })
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const todayJour = () => new Date().getDay() // 0 = dimanche, 1 = lundi ... 6 = samedi

function matieres(notes) {
  const map = new Map()
  for (const n of notes) {
    if (!map.has(n.matiere)) map.set(n.matiere, [])
    map.get(n.matiere).push(n)
  }
  return [...map].map(([nom, liste]) => ({
    nom,
    coefficient: liste[0].coefficient,
    moyenne: liste.reduce((a, n) => a + (n.note / n.sur) * 20, 0) / liste.length,
    notes: liste,
  }))
}
function moyenneGenerale(liste) {
  const coefs = liste.reduce((a, m) => a + m.coefficient, 0)
  return coefs ? liste.reduce((a, m) => a + m.moyenne * m.coefficient, 0) / coefs : null
}
const dernierTrimestre = (notes) => notes.reduce((a, n) => Math.max(a, n.trimestre), 1)
const totalPaye = (echeances) => echeances.filter((e) => e.payee).reduce((a, e) => a + e.montant, 0)

// ---------- Briques communes ----------
const Head = ({ title, sub }) => (
  <div className="pagehead">
    <h1>{title}</h1>
    {sub && <p>{sub}</p>}
  </div>
)

function Courses({ list }) {
  if (!list.length) return <p className="muted">Pas de cours ce jour-là.</p>
  return list.map((c, i) => (
    <div className="course" key={i}>
      <div className="time">
        {heure(c.debut)}
        <small>{heure(c.fin)}</small>
      </div>
      <div className="what">
        <strong>{c.matiere}</strong>
        <span className="muted small">{[c.enseignant, c.salle].filter(Boolean).join(', ')}</span>
      </div>
    </div>
  ))
}

function EvalItem({ e }) {
  const d = jsDate(e.date)
  return (
    <div className="item">
      <div className="datebox">
        <b>{d.getDate()}</b>
        {fmt(d, { month: 'short' })}
      </div>
      <div className="grow">
        <strong>{e.matiere}</strong> <span className="tag info">{e.type}</span>
        {e.chapitre && <p className="muted small">{e.chapitre}</p>}
        <p className="small">
          {cap(fmt(d, { weekday: 'long' }))} à {heure(e.heure)}
        </p>
      </div>
    </div>
  )
}

// ---------- Écrans ----------
function Accueil({ eleve, data, go, onLogout }) {
  const jour = todayJour()
  const cours = data.cours.filter((c) => c.jour === jour)
  const tri = dernierTrimestre(data.notes)
  const g = moyenneGenerale(matieres(data.notes.filter((n) => n.trimestre === tri)))
  const reste = Math.max(0, eleve.scolarite_total - totalPaye(data.echeances))
  const pending = data.presences.filter((p) => p.statut === 'a_justifier').length
  const next = data.evaluations[0]
  const [msg, setMsg] = useState('')

  async function download() {
    setMsg('Préparation du fichier…')
    try {
      await exportZip(eleve, data)
      setMsg('Fichier téléchargé.')
    } catch {
      setMsg('Le téléchargement a échoué. Réessayez.')
    }
  }

  return (
    <>
      <Head
        title={`${eleve.prenom} ${eleve.nom}`}
        sub={`${eleve.classe}. ${cap(fmt(new Date(), { weekday: 'long', day: 'numeric', month: 'long' }))}.`}
      />
      <section className="panel">
        <div className="rowhead">
          <h2>Les cours d'aujourd'hui</h2>
          <button className="linkbtn" onClick={() => go('horaires')}>Toute la semaine</button>
        </div>
        {cours.length ? <Courses list={cours} /> : <p className="muted">Pas de cours aujourd'hui.</p>}
      </section>
      <div className="duo grid-gap">
        <section className="panel">
          <h2>Moyenne générale</h2>
          <p className="figure">
            {g == null ? '–' : num(Math.round(g * 100) / 100)}
            <span className="muted small"> / 20</span>
          </p>
          <button className="linkbtn" onClick={() => go('notes')}>Voir les notes</button>
        </section>
        <section className="panel">
          <h2>Reste à payer</h2>
          <p className="figure">{fcfa(reste)}</p>
          <button className="linkbtn" onClick={() => go('scolarite')}>Voir la scolarité</button>
        </section>
      </div>
      <section className="panel">
        <div className="rowhead">
          <h2>Prochain contrôle</h2>
          <button className="linkbtn" onClick={() => go('controles')}>Tous les contrôles</button>
        </div>
        {next ? <EvalItem e={next} /> : <p className="muted">Aucun contrôle programmé.</p>}
      </section>
      <section className="panel">
        <div className="rowhead">
          <h2>Présences</h2>
          <button className="linkbtn" onClick={() => go('presences')}>Voir le détail</button>
        </div>
        {pending ? (
          <p>
            <span className="tag bad">{pending} à justifier</span> {eleve.prenom} a une absence ou un retard sans
            justificatif.
          </p>
        ) : (
          <p>
            <span className="tag ok">À jour</span> Rien à justifier pour {eleve.prenom}.
          </p>
        )}
      </section>
      <section className="panel">
        <h2>Mon compte</h2>
        <p className="muted small">
          Le fichier zip contient l'emploi du temps, les notes, les contrôles, les présences et la scolarité de{' '}
          {eleve.prenom}.
        </p>
        <div className="account">
          <button className="btn" onClick={download}>Télécharger les données (.zip)</button>
          <button className="btn ghost" onClick={onLogout}>Se déconnecter</button>
        </div>
        <p className="small" role="status" style={{ marginTop: 10 }}>{msg}</p>
      </section>
    </>
  )
}

function Horaires({ eleve, data }) {
  const today = todayJour()
  const [jour, setJour] = useState(today >= 1 ? today : 1)
  return (
    <>
      <Head title="Emploi du temps" sub={`${eleve.prenom} ${eleve.nom}, ${eleve.classe}`} />
      <div className="days" role="group" aria-label="Jour">
        {JOURS.map((nom, i) => (
          <button
            key={nom}
            aria-pressed={jour === i + 1}
            className={i + 1 === today ? 'today' : ''}
            onClick={() => setJour(i + 1)}
          >
            {nom.slice(0, 3)}
          </button>
        ))}
      </div>
      <section className="panel">
        <h2>
          {JOURS[jour - 1]}
          {jour === today ? " (aujourd'hui)" : ''}
        </h2>
        <Courses list={data.cours.filter((c) => c.jour === jour)} />
      </section>
    </>
  )
}

function Controles({ data }) {
  return (
    <>
      <Head title="Contrôles à venir" sub="Les évaluations programmées par les enseignants." />
      <section className="panel">
        {data.evaluations.length ? (
          data.evaluations.map((e) => <EvalItem key={e.id} e={e} />)
        ) : (
          <p className="muted">Aucun contrôle programmé pour l'instant.</p>
        )}
      </section>
    </>
  )
}

function Notes({ eleve, data }) {
  const [tri, setTri] = useState(dernierTrimestre(data.notes))
  const liste = matieres(data.notes.filter((n) => n.trimestre === tri))
  const g = moyenneGenerale(liste)
  return (
    <>
      <Head title="Notes et moyennes" sub={`${eleve.prenom} ${eleve.nom}, ${eleve.classe}`} />
      <div className="seg" role="group" aria-label="Trimestre">
        {[1, 2, 3].map((t) => (
          <button key={t} aria-pressed={tri === t} onClick={() => setTri(t)}>
            Trimestre {t}
          </button>
        ))}
      </div>
      {g == null ? (
        <section className="panel">
          <p className="muted">
            Aucune note pour ce trimestre. Elles apparaîtront ici dès que les enseignants les auront saisies.
          </p>
        </section>
      ) : (
        <>
          <section className="panel general">
            <div className={'big' + (g < 10 ? ' low' : '')}>{num(Math.round(g * 10) / 10)}</div>
            <div>
              <h2>Moyenne générale sur 20</h2>
              <p className="muted small">
                Calculée avec les coefficients de chaque matière. Les moyennes sous 10 sont en rouge.
              </p>
            </div>
          </section>
          <section className="panel">
            <div className="cahier">
              {liste.map((m) => (
                <div className="subject" key={m.nom}>
                  <div className={'avg' + (m.moyenne < 10 ? ' low' : '')}>{num(Math.round(m.moyenne * 10) / 10)}</div>
                  <strong>{m.nom}</strong> <span className="muted small">coefficient {m.coefficient}</span>
                  <div className="marks">
                    {m.notes.map((n) => (
                      <span className="mark" key={n.id}>
                        {n.libelle}{' '}
                        <b>
                          {num(n.note)}/{num(n.sur)}
                        </b>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  )
}

function Presences({ eleve, data, onRefresh }) {
  const [open, setOpen] = useState(null)
  const [motif, setMotif] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const liste = data.presences
  const abs = liste.filter((p) => p.type === 'absence').length
  const pend = liste.filter((p) => p.statut === 'a_justifier').length

  async function send(id) {
    if (!motif.trim()) return setError('Indiquez le motif avant d\'envoyer.')
    setBusy(true)
    setError('')
    try {
      if (!(await justifier(id, motif))) throw new Error('refus')
      setOpen(null)
      await onRefresh()
    } catch {
      setError("Envoi du justificatif impossible. Vérifiez votre connexion internet, puis réessayez.")
    }
    setBusy(false)
  }

  return (
    <>
      <Head title="Présences" sub={`${eleve.prenom} ${eleve.nom}, depuis la rentrée`} />
      <div className="counts">
        <div><b>{abs}</b>absence{abs > 1 ? 's' : ''}</div>
        <div><b>{liste.length - abs}</b>retard{liste.length - abs > 1 ? 's' : ''}</div>
        <div><b>{pend}</b>à justifier</div>
      </div>
      <section className="panel">
        {!liste.length && <p className="muted">Aucune absence ni retard.</p>}
        {liste.map((p) => (
          <div className="item" style={{ flexWrap: 'wrap' }} key={p.id}>
            <div className="grow">
              <strong>
                {p.type === 'absence' ? 'Absence' : 'Retard'} du {jourMois(p.date)}
              </strong>
              {p.detail && <p className="muted small">{p.detail}</p>}
            </div>
            {p.statut !== 'a_justifier' ? (
              <span className="tag ok">{STATUTS[p.statut] || p.statut}</span>
            ) : (
              open !== p.id && (
                <button
                  className="btn ghost"
                  onClick={() => {
                    setOpen(p.id)
                    setMotif('')
                    setError('')
                  }}
                >
                  Justifier
                </button>
              )
            )}
            {open === p.id && p.statut === 'a_justifier' && (
              <div className="formrow">
                <label htmlFor="motif" className="small">Motif à transmettre à l'établissement</label>
                <textarea
                  id="motif"
                  autoFocus
                  maxLength={500}
                  placeholder="Exemple : rendez-vous médical"
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                />
                {error && <p className="err" role="alert" style={{ margin: '0 0 10px' }}>{error}</p>}
                <button className="btn" disabled={busy} onClick={() => send(p.id)}>Envoyer le justificatif</button>{' '}
                <button className="btn ghost" onClick={() => setOpen(null)}>Annuler</button>
              </div>
            )}
          </div>
        ))}
      </section>
    </>
  )
}

function Scolarite({ eleve, data }) {
  const total = eleve.scolarite_total
  const paye = totalPaye(data.echeances)
  const pct = total > 0 ? Math.min(100, Math.round((paye / total) * 100)) : 0
  return (
    <>
      <Head title="Scolarité" sub={`${eleve.prenom} ${eleve.nom}`} />
      <section className="panel">
        <h2>Reste à payer</h2>
        <p className="figure">{fcfa(Math.max(0, total - paye))}</p>
        <div className="bar" role="img" aria-label={`${pct} % payé`}>
          <i style={{ width: pct + '%' }} />
        </div>
        <p className="muted small">
          {fcfa(paye)} payés sur {fcfa(total)} ({pct} %)
        </p>
      </section>
      <section className="panel">
        <h2>Échéances</h2>
        {!data.echeances.length && <p className="muted">Aucune échéance enregistrée.</p>}
        {data.echeances.map((e) => (
          <div className="item" key={e.id}>
            <div className="grow">
              <strong>{e.libelle}</strong>
              <p className="muted small">
                {e.payee ? 'Réglée' : `À régler avant le ${jourMois(e.date_limite)} ${e.date_limite.slice(0, 4)}`}
              </p>
              <p>{fcfa(e.montant)}</p>
            </div>
            <span className={'tag ' + (e.payee ? 'ok' : 'bad')}>{e.payee ? 'Payée' : 'À payer'}</span>
          </div>
        ))}
        <p className="muted small" style={{ marginTop: 10 }}>
          Les paiements se font auprès de l'établissement, qui met ensuite cette page à jour.
        </p>
      </section>
    </>
  )
}

// ---------- Cadre ----------
export default function Dashboard({ eleves, selected, data, busy, error, onSelect, onRefresh, onLogout }) {
  const [tab, setTab] = useState('accueil')
  const eleve = eleves[selected]
  const go = (t) => {
    setTab(t)
    window.scrollTo(0, 0)
  }
  const props = { eleve, data, go, onRefresh, onLogout }
  const View = { accueil: Accueil, horaires: Horaires, controles: Controles, notes: Notes, presences: Presences, scolarite: Scolarite }[tab]

  return (
    <>
      <div className="app">
        <header className="top">
          <div className="brand">
            CSED <span>Parents+</span>
          </div>
          {eleves.length > 1 && (
            <div className="kids" role="group" aria-label="Choisir un enfant">
              {eleves.map((e, i) => (
                <button key={e.id} aria-pressed={i === selected} disabled={busy} onClick={() => onSelect(i)}>
                  {e.prenom}
                </button>
              ))}
            </div>
          )}
        </header>
        {error && (
          <p className="err" role="alert" style={{ marginBottom: 14 }}>
            {error}{' '}
            <button className="linkbtn" onClick={onRefresh}>Réessayer</button>
          </p>
        )}
        {/* La clé remet chaque écran à zéro quand on change d'enfant. */}
        <main className={busy ? 'loading' : ''} aria-busy={busy}>
          <View key={eleve.id + tab} {...props} />
        </main>
      </div>
      <nav className="tabs" aria-label="Rubriques">
        {TABS.map(([id, label, path]) => (
          <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={path} />
            </svg>
            {label}
          </button>
        ))}
      </nav>
    </>
  )
}
