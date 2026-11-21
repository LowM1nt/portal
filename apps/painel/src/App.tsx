import { useEffect, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { supabase as clientePadrao } from './supabase.ts'
import Entrar from './features/entrada/Entrar.tsx'
import VisaoGeral from './features/visao-geral/VisaoGeral.tsx'
import PerfilSeletor from './features/perfil/PerfilSeletor.tsx'
import Performance from './features/performance/Performance.tsx'
import { Casca, type ItemNav } from './ui/Casca.tsx'
import { IconePerformance, IconeVisao } from './ui/icones.tsx'
import { Aurora, Logo } from './ui/Marca.tsx'
import { ToastProvider } from './ui/Toasts.tsx'

type Aba = 'visao-geral' | 'performance'
type Props = { cliente?: SupabaseClient | null }

// Um destino por tela que existe hoje.
const DESTINOS: ItemNav<Aba>[] = [
  { id: 'visao-geral', nome: 'Visão geral', icone: <IconeVisao /> },
  { id: 'performance', nome: 'Performance', icone: <IconePerformance /> },
]

function App({ cliente = clientePadrao }: Props) {
  return (
    <ToastProvider>
      <Aurora />
      <Conteudo cliente={cliente} />
    </ToastProvider>
  )
}

function Conteudo({ cliente }: { cliente: SupabaseClient | null }) {
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
      <main className="sem-config">
        <Logo />
        <h1>Painel do agente</h1>
        <p className="suave">
          Configuração ausente: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no build.
        </p>
      </main>
    )
  }

  if (carregando) {
    return (
      <main className="sem-config" aria-busy="true">
        <Logo />
        <span className="giro suave" aria-hidden="true" />
        <span className="sr">Carregando…</span>
      </main>
    )
  }

  if (!sessao) return <Entrar cliente={cliente} />

  return (
    <Casca
      itens={DESTINOS}
      ativo={aba}
      aoIr={setAba}
      conta={{ email: sessao.user.email ?? null, aoSair: () => void cliente.auth.signOut() }}
    >
      <div className="contexto">
        <PerfilSeletor cliente={cliente} />
      </div>
      <div className="cascata" key={aba}>
        {aba === 'visao-geral' ? <VisaoGeral cliente={cliente} /> : <Performance cliente={cliente} />}
      </div>
    </Casca>
  )
}

export default App
