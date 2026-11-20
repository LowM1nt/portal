import { useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export function Entrar({ cliente }: { cliente: SupabaseClient }) {
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
    <main className="entrada">
      <form className="painel entrada-cartao" onSubmit={(e) => void enviar(e)} aria-label="Entrar no portal">
        <div className="marca">
          <span className="lua" aria-hidden="true" />
          Madrugada
        </div>
        <h1>Entrar</h1>
        <label className="campo">
          E-mail
          <input
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
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
        <button type="submit" className="botao botao-primario entrada-botao" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
