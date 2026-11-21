import { useId, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useAvisos } from '../../ui/avisos.ts'
import { Logo } from '../../ui/Marca.tsx'
import { useVarredura } from '../../ui/transicao.ts'

// Prévia decorativa do lado da marca (não são dados de ninguém).
const PREVIA = [
  { titulo: 'Filtro por ambiente', selo: 'selo-ok', rotulo: 'Sucesso' },
  { titulo: 'Ajuste no lead time', selo: 'selo-andamento', rotulo: 'Rodando' },
  { titulo: 'Novo tema escuro', selo: 'selo-erro', rotulo: 'Falhou' },
]

export function Entrar({ cliente }: { cliente: SupabaseClient }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const { avisar } = useAvisos()
  const varrer = useVarredura()
  const id = useId()

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const { error } = await cliente.auth.signInWithPassword({ email, password: senha })
    setEnviando(false)
    if (error) {
      setErro('E-mail ou senha não batem. Confere e tenta de novo.')
      return
    }
    varrer()
    avisar({ tipo: 'ok', titulo: 'Que bom te ver por aqui!', texto: 'Bora ver o que sobe hoje.' })
  }

  return (
    <main className="login">
      <section className="login-marca">
        <Logo className="login-logo" />
        <div className="login-frase">
          <h2>
            Deploy sem drama.
            <br />
            <em>Release sem susto.</em>
          </h2>
          <p>O calendário do que sobe e a fila de revisões do time, num lugar só.</p>
        </div>
        <div className="cartao login-previa" aria-hidden="true">
          {PREVIA.map((p) => (
            <div key={p.titulo} className="login-previa-item">
              <span>{p.titulo}</span>
              <span className={`selo ${p.selo}`}>{p.rotulo}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="login-lado-form">
        <form className="login-form" onSubmit={(e) => void enviar(e)} aria-label="Entrar no portal">
          <div className="login-titulo">
            <h1>Entrar</h1>
            <p className="suave">Bora pro deploy de hoje? Entre para ver o que sobe e o que está em revisão.</p>
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
          <p className="login-rodape">
            Só quer dar uma olhada? <a href="/demo">Ver a demo</a>
          </p>
        </form>
      </section>
    </main>
  )
}
