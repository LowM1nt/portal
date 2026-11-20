import { useEffect, useState, type FormEvent, type MouseEvent } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { supabase as clientePadrao } from './supabase.ts'
import VisaoGeral from './features/visao-geral/VisaoGeral.tsx'
import Performance from './features/performance/Performance.tsx'

type Aba = 'visao-geral' | 'performance'
type Props = { cliente?: SupabaseClient | null }

function App({ cliente = clientePadrao }: Props) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(cliente !== null)
  const [aba, setAba] = useState<Aba>('visao-geral')

  useEffect(() => {
    if (!cliente) return
    let ativo = true
    cliente.auth.getSession().then(({ data }) => {
      if (ativo) {
        setSessao(data.session)
        setCarregando(false)
      }
    })
    const { data } = cliente.auth.onAuthStateChange((_evento, nova) => setSessao(nova))
    return () => {
      ativo = false
      data.subscription.unsubscribe()
    }
  }, [cliente])

  if (!cliente) {
    return (
      <main className="conteudo">
        <h1>Painel do agente</h1>
        <p className="vazio">
          Configuração ausente: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no build.
        </p>
      </main>
    )
  }

  if (carregando) {
    return (
      <main className="conteudo" aria-busy="true">
        <h1>Painel do agente</h1>
        <p className="suave">Carregando…</p>
      </main>
    )
  }

  if (!sessao) return <Entrar cliente={cliente} />

  const destinos = [
    { id: 'visao-geral', rotulo: 'Visão geral' },
    { id: 'performance', rotulo: 'Performance' },
  ] as const

  function ir(id: Aba) {
    return (e: MouseEvent) => {
      e.preventDefault()
      setAba(id)
    }
  }

  return (
    <div className="app">
      <nav className="trilho" aria-label="Principal">
        <div className="marca">
          <span className="lua" aria-hidden="true" />
          Madrugada
        </div>
        {destinos.map((d) => (
          <a
            key={d.id}
            href={`#${d.id}`}
            className="nav-item"
            aria-current={aba === d.id ? 'page' : undefined}
            onClick={ir(d.id)}
          >
            {d.rotulo}
          </a>
        ))}
      </nav>
      <main className="conteudo">
        <div className="cabecalho">
          <span className="suave pequeno">{sessao.user.email}</span>
          <button type="button" className="botao botao-quieto" onClick={() => void cliente.auth.signOut()}>
            Sair
          </button>
        </div>
        {aba === 'visao-geral' ? <VisaoGeral cliente={cliente} /> : <Performance cliente={cliente} />}
      </main>
      <nav className="barra" aria-label="Principal no celular">
        {destinos.map((d) => (
          <a key={d.id} href={`#${d.id}`} aria-current={aba === d.id ? 'page' : undefined} onClick={ir(d.id)}>
            {d.rotulo}
          </a>
        ))}
      </nav>
    </div>
  )
}

function Entrar({ cliente }: { cliente: SupabaseClient }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const { error } = await cliente.auth.signInWithPassword({ email, password: senha })
    setEnviando(false)
    if (error) setErro('E-mail ou senha incorretos.')
  }

  return (
    <main className="conteudo">
      <h1>Painel do agente</h1>
      <form className="painel" onSubmit={(e) => void enviar(e)} aria-label="Entrar no painel">
        <label className="campo">
          E-mail
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="campo">
          Senha
          <input
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </label>
        {erro && (
          <p role="alert" className="selo selo-erro">
            {erro}
          </p>
        )}
        <button type="submit" className="botao botao-primario" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}

export default App
