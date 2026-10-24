import { useState } from 'react'
import { activer, connecter, creerCompte, deconnecter } from './api.js'

const Brand = () => (
  <div className="brand">
    CSED <span>Parents+</span>
  </div>
)

export function Message({ title, children, action }) {
  return (
    <div className="loginwrap">
      <div className="logincard">
        <Brand />
        <h1>{title}</h1>
        <p className="muted">{children}</p>
        {action && (
          <button className="btn" onClick={action[1]}>
            {action[0]}
          </button>
        )}
      </div>
    </div>
  )
}

export function Login({ onGoAdmin }) {
  const [premiere, setPremiere] = useState(false)
  const [tel, setTel] = useState('')
  const [code, setCode] = useState('')
  const [mdp, setMdp] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (tel.replace(/\D/g, '').length < 8) return setError('Saisissez votre numéro de téléphone complet.')
    if (premiere && !code.trim()) return setError("Saisissez le code d'activation.")
    if (mdp.length < 6) return setError('Le mot de passe doit contenir au moins 6 caractères.')
    setBusy(true)
    setError('')
    try {
      if (premiere) await creerCompte(tel, code, mdp)
      else await connecter(tel, mdp)
      // La suite est prise en charge par App dès que la session est ouverte.
    } catch (err) {
      const msg = String(err?.message || '')
      if (msg === 'CONFIRM_EMAIL') setError("Le compte n'a pas pu être ouvert. Signalez-le à l'établissement.")
      else if (/database error|invalid.*(code|numéro)|code d'activation/i.test(msg))
        setError("Numéro ou code d'activation incorrect. Vérifiez le code remis par l'établissement.")
      else if (/already registered|already been registered/i.test(msg))
        setError('Ce numéro a déjà un compte. Utilisez « J\'ai déjà un compte ».')
      else if (/invalid login credentials/i.test(msg)) setError('Numéro ou mot de passe incorrect. Vérifiez-les puis réessayez.')
      else setError('Connexion impossible. Vérifiez votre connexion internet, puis réessayez.')
      setBusy(false)
    }
  }

  return (
    <div className="loginwrap">
      <div className="logincard">
        <Brand />
        <h1>{premiere ? 'Première connexion' : 'Connexion parent'}</h1>
        <p className="muted">
          {premiere
            ? "Créez votre mot de passe avec le code d'activation remis par l'établissement (reçu par WhatsApp ou au secrétariat)."
            : 'Suivez la scolarité de vos enfants.'}
        </p>
        <form onSubmit={submit} noValidate>
          <label htmlFor="tel">Numéro de téléphone</label>
          <input id="tel" type="tel" autoComplete="tel" value={tel} onChange={(e) => setTel(e.target.value)} />
          {premiere && (
            <>
              <label htmlFor="code">Code d'activation</label>
              <input id="code" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
            </>
          )}
          <label htmlFor="mdp">{premiere ? 'Choisissez un mot de passe (6 caractères minimum)' : 'Mot de passe'}</label>
          <input
            id="mdp"
            type="password"
            autoComplete={premiere ? 'new-password' : 'current-password'}
            value={mdp}
            onChange={(e) => setMdp(e.target.value)}
          />
          {error && (
            <p className="err" role="alert">
              {error}
            </p>
          )}
          <button className="btn" type="submit" disabled={busy}>
            {premiere ? 'Créer mon compte' : 'Se connecter'}
          </button>
        </form>
        <button
          className="linkbtn"
          onClick={() => {
            setPremiere(!premiere)
            setError('')
          }}
        >
          {premiere ? "J'ai déjà un compte" : 'Première connexion ? Activer mon compte'}
        </button>

        {onGoAdmin && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--line)', textAlign: 'center' }}>
            <button
              className="linkbtn small"
              style={{ color: 'var(--ink2)', textDecoration: 'none' }}
              onClick={onGoAdmin}
            >
              🏛️ Accès Établissement (CSE Divo — Gestion)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function Activation({ onDone }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!code.trim()) return setError("Saisissez le code d'activation.")
    setBusy(true)
    setError('')
    try {
      if (await activer(code)) return onDone()
      setError("Code d'activation incorrect. Vérifiez le code remis par l'établissement.")
    } catch (err) {
      if (/trop_de_tentatives/.test(String(err?.message || ''))) {
        setError('Trop de tentatives. Réessayez dans 15 minutes ou contactez le secrétariat.')
      } else {
        setError('Activation impossible. Vérifiez votre connexion internet.')
      }
    }
    setBusy(false)
  }

  return (
    <div className="loginwrap">
      <div className="logincard">
        <Brand />
        <h1>Activez votre compte</h1>
        <p className="muted">
          Votre compte n'est relié à aucun élève. Saisissez le code d'activation remis par l'établissement. Si vous
          ne l'avez pas, demandez-le au secrétariat.
        </p>
        <form onSubmit={submit} noValidate>
          <label htmlFor="code">Code d'activation</label>
          <input id="code" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
          {error && (
            <p className="err" role="alert">
              {error}
            </p>
          )}
          <button className="btn" type="submit" disabled={busy}>
            Activer mon compte
          </button>
        </form>
        <button className="linkbtn" onClick={deconnecter}>
          Se déconnecter
        </button>
      </div>
    </div>
  )
}
