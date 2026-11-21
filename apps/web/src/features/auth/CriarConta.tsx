import { useId, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useAvisos } from '../../ui/avisos.ts'
import { IconeCheck } from '../../ui/icones.tsx'
import { ForcaSenha } from './ForcaSenha.tsx'
import { LayoutL2 } from './LayoutL2.tsx'
import { FORCA_MINIMA, MENSAGEM_FALHA, emailValido, forcaSenha, tipoDeFalha } from './senha.ts'

const NOME_MAXIMO = 80

/** Resposta neutra: a mesma para e-mail novo e para e-mail que já tem conta. */
export function ConfiraSeuEmail({ texto }: { texto: string }) {
  return (
    <div className="login-form" role="status">
      <div className="estado estado-login">
        <span className="estado-icone">
          <IconeCheck />
        </span>
        <h1 className="estado-titulo">Confere seu e-mail</h1>
        <span className="estado-texto">{texto}</span>
      </div>
      <a className="botao botao-secundario botao-cheio" href="#/entrar">
        Voltar para o login
      </a>
    </div>
  )
}

export function CriarConta({ cliente }: { cliente: SupabaseClient }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [termos, setTermos] = useState(false)
  const [erro, setErro] = useState<{ campo: string; texto: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const { avisar } = useAvisos()
  const id = useId()

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const n = nome.trim()
    const m = email.trim()
    if (!n) return setErro({ campo: 'nome', texto: 'Faltou o seu nome. Como a gente te chama?' })
    if (n.length > NOME_MAXIMO) return setErro({ campo: 'nome', texto: `O nome pode ter até ${NOME_MAXIMO} caracteres.` })
    if (!emailValido(m)) return setErro({ campo: 'email', texto: 'Esse e-mail parece incompleto. Confere pra gente?' })
    if (forcaSenha(senha) < FORCA_MINIMA)
      return setErro({ campo: 'senha', texto: 'Bora uma senha mais forte: 8+ caracteres com letras, números e um símbolo.' })
    if (!termos) return setErro({ campo: 'termos', texto: 'Pra continuar, marca que você aceita os termos de uso e a política de privacidade.' })
    setErro(null)
    setEnviando(true)
    try {
      const { data, error } = await cliente.auth.signUp({
        email: m,
        password: senha,
        options: { data: { nome: n }, emailRedirectTo: `${window.location.origin}/` },
      })
      const falha = tipoDeFalha(error)
      if (falha && falha !== 'outra') return setErro({ campo: falha === 'senha' ? 'senha' : '', texto: MENSAGEM_FALHA[falha] })
      if (!falha && data.session) {
        avisar({ tipo: 'ok', titulo: 'Conta criada!', texto: 'Bem-vindo ao Releasy.' })
        return
      }
      setEnviado(true)
    } catch {
      setErro({ campo: '', texto: MENSAGEM_FALHA.conexao })
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <LayoutL2>
        <ConfiraSeuEmail texto="Se der tudo certo com esse endereço, chega um link pra confirmar sua conta. Pode levar uns minutinhos (olha o spam também)." />
      </LayoutL2>
    )
  }

  const invalido = (campo: string) => (erro?.campo === campo ? true : undefined)
  return (
    <LayoutL2>
      <form className="login-form" onSubmit={(e) => void enviar(e)} noValidate aria-label="Criar conta">
        <div className="login-titulo">
          <h1>Crie sua conta</h1>
          <p className="suave">Leva menos de um minuto. Sem cartão de crédito.</p>
        </div>
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`${id}-nome`}>
            Seu nome
          </label>
          <input
            id={`${id}-nome`}
            className="controle"
            autoComplete="name"
            placeholder="Como te chamamos?"
            maxLength={NOME_MAXIMO}
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            aria-invalid={invalido('nome')}
          />
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={invalido('email')}
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
            autoComplete="new-password"
            placeholder="Mínimo de 8 caracteres"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            aria-invalid={invalido('senha')}
            aria-describedby={`${id}-forca`}
          />
          <ForcaSenha senha={senha} id={`${id}-forca`} />
        </div>
        <label className="opcao">
          <input
            type="checkbox"
            className="marcacao"
            checked={termos}
            onChange={(e) => setTermos(e.target.checked)}
            aria-invalid={invalido('termos')}
          />
          Li e aceito os termos de uso e a política de privacidade.
        </label>
        {erro && (
          <p role="alert" className="campo-erro">
            {erro.texto}
          </p>
        )}
        <button type="submit" className="botao botao-primario botao-g botao-cheio" disabled={enviando}>
          {enviando && <span className="giro" aria-hidden="true" />}
          {enviando ? 'Criando…' : 'Criar conta'}
        </button>
        <p className="login-rodape">
          Já tem conta? <a href="#/entrar">Entrar</a>
        </p>
      </form>
    </LayoutL2>
  )
}
