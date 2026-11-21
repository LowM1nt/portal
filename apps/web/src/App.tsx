import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase as clientePadrao } from './supabase.ts'
import { AuthProvider, useAuth } from './features/auth/AuthProvider.tsx'
import { DemoPage } from './features/demo/DemoPage.tsx'
import { Calendario } from './features/calendario/Calendario.tsx'
import { FilaRevisao } from './features/revisoes/FilaRevisao.tsx'
import { useAvisoDeErro } from './ui/avisos.ts'
import { Casca, type ItemNav } from './ui/Casca.tsx'
import { Carregando, EstadoErro, EstadoVazio } from './ui/Estados.tsx'
import { IconeDeploys, IconeRevisoes, IconeSetaBaixo, IconeTime } from './ui/icones.tsx'
import { Aurora, Logo } from './ui/Marca.tsx'
import { useDestino, type Destino } from './ui/rota.ts'
import { ToastProvider } from './ui/Toasts.tsx'
import { TransicaoProvider } from './ui/Transicao.tsx'

type Props = { cliente?: SupabaseClient | null }

function App({ cliente = clientePadrao }: Props) {
  // A demo é pública: não passa pelo AuthProvider nem exige a configuração do Supabase.
  const demo = window.location.pathname.replace(/\/+$/, '') === '/demo'
  let tela
  if (demo) tela = <DemoPage />
  else if (!cliente) {
    tela = (
      <main className="sem-config">
        <Logo />
        <p className="suave">
          Configuração ausente: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no build.
        </p>
      </main>
    )
  } else {
    tela = (
      <AuthProvider cliente={cliente}>
        <Telas />
      </AuthProvider>
    )
  }
  return (
    <ToastProvider>
      <TransicaoProvider>
        <Aurora />
        {tela}
      </TransicaoProvider>
    </ToastProvider>
  )
}

const ITENS: ItemNav[] = [
  { id: 'deploys', nome: 'Deploys', icone: <IconeDeploys /> },
  { id: 'revisoes', nome: 'Revisões', icone: <IconeRevisoes /> },
]

const TITULOS: Record<Destino, { titulo: string; texto: string }> = {
  deploys: { titulo: 'Deploys', texto: 'O que o time vai subir nesta semana.' },
  revisoes: { titulo: 'Fila de revisão', texto: 'PRs esperando revisão nos repositórios do workspace.' },
}

export function Telas() {
  const [destino, ir] = useDestino()
  const { estado, email, workspaces, workspaceAtivo, trocarWorkspace, sair, tentarDeNovo } = useAuth()
  useAvisoDeErro(estado === 'erro', 'Seus dados não vieram', 'Pode ser a conexão. Dá pra tentar de novo ali no meio da tela.')

  const conta = { email, aoSair: () => void sair().catch(() => undefined) }
  const { titulo, texto } = TITULOS[destino]

  let corpo
  if (estado === 'carregando') {
    corpo = (
      <Carregando className="cartao tela-carregando">
        <span className="osso osso-titulo" />
        <span className="osso osso-bloco" />
        <span className="osso osso-bloco" />
      </Carregando>
    )
  } else if (estado === 'erro') {
    corpo = (
      <div className="cartao">
        <EstadoErro
          titulo="Ops, não deu pra carregar seus dados."
          texto="Seus dados estão seguros. Tenta de novo?"
          aoTentar={tentarDeNovo}
        />
      </div>
    )
  } else if (!workspaceAtivo) {
    corpo = (
      <div className="cartao">
        <EstadoVazio
          icone={<IconeTime />}
          titulo="Você ainda não está em nenhum workspace"
          texto="Peça para alguém do time te convidar e volte aqui."
        />
      </div>
    )
  } else {
    corpo = destino === 'revisoes' ? <FilaRevisao /> : <Calendario />
  }

  return (
    <Casca itens={ITENS} ativo={destino} aoIr={ir} conta={conta}>
      <header className="cab">
        <div className="cab-titulo">
          <h1>{titulo}</h1>
          <p>{texto}</p>
        </div>
        {estado === 'pronto' && (
          <div className="ws">
            <IconeTime />
            <span className="ws-nome">{workspaceAtivo?.nome ?? 'Nenhum workspace'}</span>
            {workspaces.length > 1 && (
              <>
                <IconeSetaBaixo />
                <select
                  className="ws-seletor"
                  aria-label="Workspace"
                  value={workspaceAtivo?.id ?? ''}
                  onChange={(e) => trocarWorkspace(e.target.value)}
                >
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.nome} ({w.papel})
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        )}
      </header>
      {corpo}
    </Casca>
  )
}

export default App
