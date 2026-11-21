import { useCallback, useId, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'
import { limparCodigo, qrSeguro } from './mfa.ts'
import { useAvisos } from '../../ui/avisos.ts'
import { IconeEscudo } from '../../ui/icones.tsx'
import { Modal } from '../../ui/Sobreposicao.tsx'
import { useCarregar } from '../../ui/useCarregar.ts'

type Fator = { id: string; status: string; factor_type?: string }

type Cadastro = { id: string; qr: string; segredo: string }

const MSG_CODIGO = 'Código não confere ou expirou. Espera o próximo no app e tenta de novo.'
const MSG_API = 'Não deu pra salvar no Releasy agora. Espera o próximo código e tenta de novo.'

/** Verificação em duas etapas (TOTP) com o SDK do Supabase: ativar com QR code, desativar com um código. */
export function DuasEtapas() {
  const { cliente, workspaceAtivo } = useAuth()
  const { avisar } = useAvisos()
  const [modo, setModo] = useState<'ativar' | 'desativar' | null>(null)
  const carregar = useCallback(async () => {
    const { data, error } = await cliente.auth.mfa.listFactors()
    if (error) throw error
    const todos = ((data?.all ?? []) as Fator[]).filter((f) => (f.factor_type ?? 'totp') === 'totp')
    return { verificado: todos.find((f) => f.status === 'verified') ?? null, pendentes: todos.filter((f) => f.status !== 'verified') }
  }, [cliente])
  const recurso = useCarregar(carregar, `mfa#${workspaceAtivo?.id ?? ''}`)

  let acao
  let texto = 'Código do app autenticador a cada login novo.'
  let selo = null
  if (recurso.estado === 'carregando') {
    acao = <span className="osso osso-botao" aria-hidden="true" />
    texto = 'Conferindo…'
  } else if (recurso.estado === 'erro' || !recurso.dados) {
    texto = 'Não deu pra ver se está ligada.'
    acao = (
      <button type="button" className="botao botao-secundario botao-p" onClick={recurso.recarregar}>
        Tentar de novo
      </button>
    )
  } else if (recurso.dados.verificado) {
    selo = <span className="selo selo-ok">Ligada</span>
    acao = (
      <button type="button" className="botao botao-secundario botao-p" onClick={() => setModo('desativar')}>
        Desativar
      </button>
    )
  } else {
    selo = <span className="selo selo-neutro">Desligada</span>
    acao = (
      <button type="button" className="botao botao-primario botao-p" onClick={() => setModo('ativar')}>
        Ativar
      </button>
    )
  }

  return (
    <li className="linha-cfg">
      <span className="linha-cfg-icone" aria-hidden="true">
        <IconeEscudo />
      </span>
      <span className="txt">
        <b>Verificação em duas etapas</b>
        <span>{texto}</span>
      </span>
      {selo}
      {acao}
      {modo === 'ativar' && recurso.dados && (
        <Ativar
          pendentes={recurso.dados.pendentes}
          aoFechar={() => {
            setModo(null)
            recurso.atualizar()
          }}
          aoAtivado={() => {
            setModo(null)
            recurso.atualizar()
            avisar({ tipo: 'ok', titulo: 'Verificação em duas etapas ligada!', texto: 'No próximo login, o Releasy vai pedir o código do app.' })
          }}
        />
      )}
      {modo === 'desativar' && recurso.dados?.verificado && (
        <Desativar
          fatorId={recurso.dados.verificado.id}
          aoFechar={() => setModo(null)}
          aoDesativado={() => {
            setModo(null)
            recurso.atualizar()
            avisar({ tipo: 'ok', titulo: 'Verificação em duas etapas desligada', texto: 'Dá pra ligar de novo quando quiser.' })
          }}
        />
      )}
    </li>
  )
}

function CampoCodigo({ id, valor, aoMudar, invalido }: { id: string; valor: string; aoMudar: (v: string) => void; invalido: boolean }) {
  return (
    <div className="campo">
      <label className="campo-rotulo" htmlFor={id}>
        Código de 6 números
      </label>
      <input
        id={id}
        className="controle mono"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={9}
        placeholder="123456"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        aria-invalid={invalido ? true : undefined}
      />
    </div>
  )
}

function Ativar({ pendentes, aoFechar, aoAtivado }: { pendentes: Fator[]; aoFechar: () => void; aoAtivado: () => void }) {
  const { cliente, salvarMfaExigido } = useAuth()
  const id = useId()
  const [cadastro, setCadastro] = useState<Cadastro | null>(null)
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [rodando, setRodando] = useState(false)

  async function comecar() {
    setErro('')
    setRodando(true)
    try {
      // Cadastro antigo que ficou pela metade atrapalha um novo: some antes.
      for (const f of pendentes) await cliente.auth.mfa.unenroll({ factorId: f.id })
      const { data, error } = await cliente.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Releasy ${Date.now()}` })
      const qr = qrSeguro(data?.totp?.qr_code)
      if (error || !data || !qr) return setErro('Não deu pra gerar o QR code agora. Tenta de novo em instantes.')
      setCadastro({ id: data.id, qr, segredo: data.totp.secret })
    } catch {
      setErro('Não deu pra gerar o QR code. Sem conexão? Tenta de novo em instantes.')
    } finally {
      setRodando(false)
    }
  }

  async function confirmar(e: FormEvent) {
    e.preventDefault()
    if (!cadastro) return
    const limpo = limparCodigo(codigo)
    if (!/^\d{6}$/.test(limpo)) return setErro('O código tem 6 números. Confere no app autenticador.')
    setErro('')
    setRodando(true)
    try {
      const { error } = await cliente.auth.mfa.challengeAndVerify({ factorId: cadastro.id, code: limpo })
      if (error) return setErro(MSG_CODIGO)
      // A sessão virou aal2: agora a API passa a exigir o código em toda chamada (D-013).
      if (!(await salvarMfaExigido(true))) return setErro(MSG_API)
      aoAtivado()
    } catch {
      setErro('Não deu pra conferir o código. Sem conexão? Tenta de novo em instantes.')
    } finally {
      setRodando(false)
    }
  }

  function fechar() {
    // Fechou sem confirmar: o cadastro pela metade não vale e é desfeito.
    if (cadastro) void cliente.auth.mfa.unenroll({ factorId: cadastro.id }).catch(() => undefined)
    aoFechar()
  }

  if (!cadastro) {
    return (
      <Modal
        titulo="Ativar a verificação em duas etapas"
        descricao="Você vai precisar de um app autenticador no celular (Google Authenticator, 1Password, Authy…)."
        aoFechar={fechar}
        icone={<IconeEscudo />}
      >
        <div className="form-sobre">
          {erro && (
            <p role="alert" className="campo-erro">
              {erro}
            </p>
          )}
          <div className="acoes-sobre">
            <button type="button" className="botao botao-fantasma" onClick={fechar}>
              Cancelar
            </button>
            <button type="button" className="botao botao-primario" disabled={rodando} onClick={() => void comecar()}>
              {rodando && <span className="giro" aria-hidden="true" />}
              {rodando ? 'Gerando…' : 'Gerar QR code'}
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal titulo="Escaneie o QR code" descricao="Abra o app autenticador, escaneie e digite o código que aparecer." aoFechar={fechar}>
      <form className="form-sobre" onSubmit={(e) => void confirmar(e)} noValidate aria-label="Confirmar a verificação em duas etapas">
        <div className="qr">
          <img src={cadastro.qr} alt="QR code para cadastrar o Releasy no app autenticador" width={176} height={176} />
        </div>
        <details className="detalhes">
          <summary>Não dá pra escanear? Digite a chave</summary>
          <div className="detalhes-corpo">
            <code className="segredo">{cadastro.segredo}</code>
          </div>
        </details>
        <CampoCodigo id={`${id}-codigo`} valor={codigo} aoMudar={setCodigo} invalido={Boolean(erro)} />
        {erro && (
          <p role="alert" className="campo-erro">
            {erro}
          </p>
        )}
        <div className="acoes-sobre">
          <button type="button" className="botao botao-fantasma" onClick={fechar}>
            Cancelar
          </button>
          <button type="submit" className="botao botao-primario" disabled={rodando}>
            {rodando && <span className="giro" aria-hidden="true" />}
            {rodando ? 'Conferindo…' : 'Ativar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Desativar({ fatorId, aoFechar, aoDesativado }: { fatorId: string; aoFechar: () => void; aoDesativado: () => void }) {
  const { cliente, salvarMfaExigido } = useAuth()
  const id = useId()
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [rodando, setRodando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const limpo = limparCodigo(codigo)
    if (!/^\d{6}$/.test(limpo)) return setErro('O código tem 6 números. Confere no app autenticador.')
    setErro('')
    setRodando(true)
    try {
      // Desligar pede a sessão verificada (aal2): o código confirma que é você mesmo.
      const verificacao = await cliente.auth.mfa.challengeAndVerify({ factorId: fatorId, code: limpo })
      if (verificacao.error) return setErro(MSG_CODIGO)
      // Primeiro a API deixa de exigir (pede aal2, que o código acabou de dar); só então o fator some.
      if (!(await salvarMfaExigido(false))) return setErro(MSG_API)
      const { error } = await cliente.auth.mfa.unenroll({ factorId: fatorId }).catch(() => ({ error: true }))
      if (error) {
        // O fator continua (erro ou sem conexão): a API volta a exigir o código.
        await salvarMfaExigido(true)
        return setErro('Não deu pra desligar agora. Tenta de novo em instantes.')
      }
      aoDesativado()
    } catch {
      setErro('Não deu pra desligar. Sem conexão? Tenta de novo em instantes.')
    } finally {
      setRodando(false)
    }
  }

  return (
    <Modal
      titulo="Desligar a verificação em duas etapas?"
      descricao="Sua conta fica protegida só pela senha. Pra confirmar que é você, digite o código do app."
      aoFechar={aoFechar}
      icone={<IconeEscudo />}
    >
      <form className="form-sobre" onSubmit={(e) => void enviar(e)} noValidate aria-label="Desligar a verificação em duas etapas">
        <CampoCodigo id={`${id}-codigo`} valor={codigo} aoMudar={setCodigo} invalido={Boolean(erro)} />
        {erro && (
          <p role="alert" className="campo-erro">
            {erro}
          </p>
        )}
        <div className="acoes-sobre">
          <button type="button" className="botao botao-fantasma" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao botao-perigo" disabled={rodando}>
            {rodando && <span className="giro" aria-hidden="true" />}
            {rodando ? 'Desligando…' : 'Desligar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
