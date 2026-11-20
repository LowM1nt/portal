import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase as clientePadrao } from './supabase.ts'
import { AuthProvider, useAuth } from './features/auth/AuthProvider.tsx'
import { Calendario } from './features/calendario/Calendario.tsx'

type Props = { cliente?: SupabaseClient | null }

function App({ cliente = clientePadrao }: Props) {
  if (!cliente) {
    return (
      <main className="conteudo">
        <h1>Portal</h1>
        <p className="vazio">
          Configuração ausente: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no build.
        </p>
      </main>
    )
  }
  return (
    <AuthProvider cliente={cliente}>
      <Telas />
    </AuthProvider>
  )
}

export function Telas() {
  const { estado, workspaces, workspaceAtivo, trocarWorkspace, sair, tentarDeNovo } = useAuth()

  if (estado === 'carregando') {
    return (
      <main className="conteudo" aria-busy="true">
        <h1>Portal</h1>
        <p className="suave">Carregando…</p>
      </main>
    )
  }

  if (estado === 'erro') {
    return (
      <main className="conteudo">
        <h1>Portal</h1>
        <p role="alert" className="selo selo-erro">
          Não foi possível carregar seus dados. Tente de novo.
        </p>
        <button type="button" className="botao botao-primario" onClick={tentarDeNovo}>
          Tentar de novo
        </button>
      </main>
    )
  }

  return (
    <main className="conteudo">
      <header className="cabecalho">
        <h1>Portal</h1>
        <div className="grupo-botoes">
          {workspaces.length > 1 && (
            <label className="campo">
              Workspace
              <select value={workspaceAtivo?.id ?? ''} onChange={(e) => trocarWorkspace(e.target.value)}>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.nome} ({w.papel})
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="suave">{workspaceAtivo?.nome ?? 'Nenhum workspace'}</span>
          <button type="button" className="botao botao-quieto" onClick={() => void sair().catch(() => undefined)}>
            Sair
          </button>
        </div>
      </header>
      {workspaceAtivo && <Calendario />}
    </main>
  )
}

export default App
