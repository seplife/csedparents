import { useCallback, useEffect, useState } from 'react'
import { activer, configured, deconnecter, loadData, loadEleves, sb, takePending } from './api.js'
import { Activation, Login, Message } from './Auth.jsx'
import Dashboard from './Dashboard.jsx'
import AdminApp from './Admin.jsx'

const NETWORK = 'Chargement impossible. Vérifiez votre connexion internet.'

export default function App() {
  const [mode, setMode] = useState(() =>
    window.location.hash.includes('admin') || window.location.pathname.startsWith('/admin') ? 'admin' : 'parent'
  )
  const [session, setSession] = useState(undefined) // undefined = vérification en cours
  const [stage, setStage] = useState('loading') // loading | out | activation | offline | ready
  const [eleves, setEleves] = useState([])
  const [selected, setSelected] = useState(0)
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const handleHash = () => {
      setMode(window.location.hash.includes('admin') ? 'admin' : 'parent')
    }
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [])

  useEffect(() => {
    if (!configured) return
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const load = useCallback(async (index = 0) => {
    setBusy(true)
    setError('')
    try {
      const code = takePending()
      if (code) await activer(code).catch(() => false)
      const list = await loadEleves()
      if (!list.length) {
        setEleves([])
        setStage('activation')
        return
      }
      const i = Math.min(index, list.length - 1)
      const loaded = await loadData(list[i])
      setEleves(list)
      setSelected(i)
      setData(loaded)
      setStage('ready')
    } catch {
      setError(NETWORK)
      setStage((s) => (s === 'ready' ? s : 'offline'))
    } finally {
      setBusy(false)
    }
  }, [])

  const userId = session === undefined ? undefined : (session?.user?.id ?? null)
  useEffect(() => {
    if (userId === undefined) return
    if (userId === null) {
      setEleves([])
      setData(null)
      setStage('out')
      return
    }
    setStage('loading')
    load(0)
  }, [userId, load])

  if (!configured) {
    return (
      <Message title="Configuration manquante">
        Créez un fichier <code>.env</code> à partir de <code>.env.example</code>, renseignez l'URL et la clé de
        votre projet Supabase, puis relancez l'application.
      </Message>
    )
  }

  if (mode === 'admin') {
    return (
      <AdminApp
        onSwitchToParent={() => {
          setMode('parent')
          window.location.hash = ''
        }}
      />
    )
  }

  if (stage === 'loading') return <div className="center">Chargement…</div>
  if (stage === 'out') {
    return (
      <Login
        onGoAdmin={() => {
          setMode('admin')
          window.location.hash = '#admin'
        }}
      />
    )
  }
  if (stage === 'activation') return <Activation onDone={() => load(0)} />
  if (stage === 'offline') {
    return (
      <Message title="Connexion au serveur impossible" action={['Réessayer', () => { setStage('loading'); load(0) }]}>
        Vérifiez votre connexion internet, puis réessayez.
      </Message>
    )
  }
  return (
    <Dashboard
      eleves={eleves}
      selected={selected}
      data={data}
      busy={busy}
      error={error}
      onSelect={(i) => load(i)}
      onRefresh={() => load(selected)}
      onLogout={deconnecter}
    />
  )
}
