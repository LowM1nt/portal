import { useId, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Logo } from '../../ui/Marca.tsx'

// Entrada em modal central sobre o fundo Aurora (pedido do dono, P-016), no visual do Releasy.
export default function Entrar({ cliente }: { cliente: SupabaseClient }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const id = useId()

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const { error } = await cliente.auth.signInWithPassword({ email, password: senha })
    setEnviando(false)
    if (error) setErro('E-mail ou senha incorretos. Confere e tenta de novo.')
  }

  return (
    <main className="entrada">
      <form className="painel entrada-cartao" onSubmit={(e) => void enviar(e)} aria-label="Entrar no painel">
        <Logo />
        <div className="entrada-titulo">
          <h1>Entrar</h1>
          <p className="suave">Bora ver como foi a noite do agente?</p>
        </div>
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`${id}-email`}>
            E-mail
          </label>
          <input
            id={`${id}-email`}
            className="controle"
            type="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={erro ? true : undefined}
          />
        </div>
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`${id}-senha`}>
            Senha
          </label>
          <input
            id={`${id}-senha`}
            className="controle"
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            aria-invalid={erro ? true : undefined}
          />
        </div>
        {erro && (
          <p role="alert" className="campo-erro">
            {erro}
          </p>
        )}
        <button type="submit" className="botao botao-primario botao-g botao-cheio" disabled={enviando}>
          {enviando && <span className="giro" aria-hidden="true" />}
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
