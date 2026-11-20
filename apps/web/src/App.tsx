import { useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase as clientePadrao } from './supabase.ts'
import { AuthProvider, useAuth } from './features/auth/AuthProvider.tsx'

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
  const { estado, workspaces, workspaceAtivo, trocarWorkspace, sair, tentarDeNovo, cliente } = useAuth()

  if (estado === 'carregando') {
    return (
      <main className="conteudo" aria-busy="true">
        <h1>Portal</h1>
        <p className="suave">Carregando…</p>
      </main>
    )
  }

  if (estado === 'sem-sessao') return <Entrar cliente={cliente} />

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
    </main>
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
      <h1>Portal</h1>
      <form className="painel" onSubmit={(e) => void enviar(e)} aria-label="Entrar no portal">
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
