import { useId, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'
import { erroDoServidor } from '../../ui/useCarregar.ts'
import { IconeSetaBaixo } from '../../ui/icones.tsx'
import { Modal } from '../../ui/Sobreposicao.tsx'
import { LIMITES, SEVERIDADES, criarBug, type Bug, type Severidade } from './api.ts'

type Props = { aoFechar: () => void; aoCriado: (bug: Bug) => void }

/** "Relatar bug": modal curto (título, severidade, relato); passos e esperado × obtido são opcionais. */
export function RelatarBug({ aoFechar, aoCriado }: Props) {
  const { api } = useAuth()
  const id = useId()
  const [titulo, setTitulo] = useState('')
  const [severidade, setSeveridade] = useState<Severidade>('media')
  const [relato, setRelato] = useState('')
  const [passos, setPassos] = useState('')
  const [esperado, setEsperado] = useState('')
  const [obtido, setObtido] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const t = titulo.trim()
    if (t.length < 3) return setErro('Dá um título com pelo menos 3 letras pra gente achar esse bug depois.')
    if (t.length > LIMITES.titulo) return setErro(`O título pode ter até ${LIMITES.titulo} caracteres. Resume um pouquinho?`)
    if (relato.length > LIMITES.relato) return setErro(`O relato pode ter até ${LIMITES.relato} caracteres.`)
    if ([passos, esperado, obtido].some((c) => c.length > LIMITES.campo))
      return setErro(`Passos, esperado e obtido podem ter até ${LIMITES.campo} caracteres cada.`)
    setErro('')
    setEnviando(true)
    try {
      const r = await criarBug(api, { titulo: t, severidade, relato: relato.trim(), passos: passos.trim(), esperado: esperado.trim(), obtido: obtido.trim() })
      if (r.ok) {
        const bug = (await r.json()) as Bug
        aoCriado(bug)
        return
      }
      if (r.status === 400) setErro((await erroDoServidor(r)) ?? 'Algum campo não passou na validação. Confere e tenta de novo.')
      else if (r.status !== 401) setErro('Ops, não deu pra enviar o relato. Tenta de novo em instantes.')
    } catch {
      setErro('Ops, não deu pra enviar. Sem conexão? Tenta de novo em instantes.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal titulo="Relatar bug" descricao="Conta o que aconteceu. Ele entra na lista pra triar." aoFechar={aoFechar}>
      <form className="form-sobre" onSubmit={(e) => void enviar(e)} noValidate aria-label="Relatar bug">
        <div className="duas-colunas relatar-linha">
          <div className="campo">
            <label className="campo-rotulo" htmlFor={`${id}-titulo`}>
              Título
            </label>
            <input
              id={`${id}-titulo`}
              className="controle"
              maxLength={LIMITES.titulo}
              placeholder="Ex.: calendário some ao trocar de workspace"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              aria-invalid={erro && titulo.trim().length < 3 ? true : undefined}
              required
            />
          </div>
          <div className="campo">
            <label className="campo-rotulo" htmlFor={`${id}-sev`}>
              Severidade
            </label>
            <select id={`${id}-sev`} className="controle" value={severidade} onChange={(e) => setSeveridade(e.target.value as Severidade)}>
              {(['baixa', 'media', 'alta', 'critica'] as const).map((s) => (
                <option key={s} value={s}>
                  {SEVERIDADES[s].nome}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`${id}-relato`}>
            O que aconteceu?
          </label>
          <textarea
            id={`${id}-relato`}
            className="controle controle-area"
            maxLength={LIMITES.relato}
            placeholder="Conta do seu jeito: onde estava, o que fez e o que deu errado."
            value={relato}
            onChange={(e) => setRelato(e.target.value)}
          />
        </div>
        <details className="detalhes">
          <summary>
            Passos, esperado e obtido (opcional)
            <IconeSetaBaixo />
          </summary>
          <div className="detalhes-corpo">
            <div className="campo">
              <label className="campo-rotulo" htmlFor={`${id}-passos`}>
                Passos pra reproduzir
              </label>
              <textarea id={`${id}-passos`} className="controle controle-area" maxLength={LIMITES.campo} value={passos} onChange={(e) => setPassos(e.target.value)} />
            </div>
            <div className="duas-colunas">
              <div className="campo">
                <label className="campo-rotulo" htmlFor={`${id}-esperado`}>
                  Esperado
                </label>
                <input id={`${id}-esperado`} className="controle" maxLength={LIMITES.campo} value={esperado} onChange={(e) => setEsperado(e.target.value)} />
              </div>
              <div className="campo">
                <label className="campo-rotulo" htmlFor={`${id}-obtido`}>
                  Obtido
                </label>
                <input id={`${id}-obtido`} className="controle" maxLength={LIMITES.campo} value={obtido} onChange={(e) => setObtido(e.target.value)} />
              </div>
            </div>
          </div>
        </details>
        {erro && (
          <p role="alert" className="campo-erro">
            {erro}
          </p>
        )}
        <div className="acoes-sobre">
          <button type="button" className="botao botao-fantasma" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="botao botao-primario" disabled={enviando}>
            {enviando && <span className="giro" aria-hidden="true" />}
            {enviando ? 'Enviando…' : 'Enviar relato'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
