import { useId, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'
import { erroDoServidor } from '../../ui/useCarregar.ts'
import { Painel } from '../../ui/Sobreposicao.tsx'
import { COLUNAS, NOME_STATUS, TITULO_MAXIMO, criarItem, editarItem, moverItem, type DadosItem, type ItemRoadmap, type StatusItem } from './api.ts'

type Props = {
  /** Item a editar; `null` com `novo` cria um; `null` sem `novo` é um link para item que não existe. */
  item: ItemRoadmap | null
  novo?: boolean
  aoFechar: () => void
  /** Deu tudo certo: atualiza a lista, avisa e fecha. */
  aoConcluir: (item: ItemRoadmap, criado: boolean) => void
  /** Os dados foram salvos, mas a troca de status falhou: atualiza a lista e o painel fica aberto. */
  aoSalvarParcial: (item: ItemRoadmap, criado: boolean) => void
}

async function lerItem(r: Response): Promise<ItemRoadmap> {
  const corpo = (await r.json()) as ItemRoadmap
  if (!corpo?.id) throw new Error('Resposta inválida')
  return corpo
}

/** Criar ou editar item do roadmap (painel lateral). Mover de status é o campo "Status". */
export function PainelItem({ item, novo = false, aoFechar, aoConcluir, aoSalvarParcial }: Props) {
  const { api } = useAuth()
  const id = useId()
  const [dados, setDados] = useState<DadosItem>(() => ({
    titulo: item?.titulo ?? '',
    descricao: item?.descricao ?? '',
    status: item?.status ?? 'ideia',
    prazo: item?.prazo ?? '',
    progresso: item?.progresso ?? 0,
  }))
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const mudar = <K extends keyof DadosItem>(campo: K, valor: DadosItem[K]) => setDados((d) => ({ ...d, [campo]: valor }))

  if (!novo && !item) {
    return (
      <Painel
        titulo="Esse item não está aqui"
        aoFechar={aoFechar}
        rodape={
          <button type="button" className="botao botao-secundario" onClick={aoFechar}>
            Voltar pro roadmap
          </button>
        }
      >
        <p className="suave">O link pode estar velho, ou o item é de outro workspace. Confere o workspace ativo no topo da tela.</p>
      </Painel>
    )
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const titulo = dados.titulo.trim()
    if (!titulo) return setErro('Dá um título pro item.')
    if (titulo.length > TITULO_MAXIMO) return setErro(`O título pode ter até ${TITULO_MAXIMO} caracteres.`)
    if (!Number.isInteger(dados.progresso) || dados.progresso < 0 || dados.progresso > 100)
      return setErro('O progresso vai de 0 a 100%.')
    if (dados.prazo && !/^\d{4}-\d{2}-\d{2}$/.test(dados.prazo)) return setErro('Esse prazo não parece uma data. Escolhe no calendário?')
    setErro('')
    setSalvando(true)
    try {
      const r = item ? await editarItem(api, item, dados) : await criarItem(api, dados)
      if (!r.ok) {
        if (r.status === 400) setErro((await erroDoServidor(r)) ?? 'Algum campo não passou na validação. Confere e tenta de novo.')
        else if (r.status !== 401) setErro('Ops, não deu pra salvar. Tenta de novo em instantes.')
        return
      }
      let salvo = await lerItem(r)
      // O PUT não muda o status: mover é um PATCH à parte.
      if (item && salvo.status !== dados.status) {
        const m = await moverItem(api, salvo.id, dados.status).catch(() => null)
        if (!m?.ok) {
          aoSalvarParcial(salvo, false)
          setErro(`Salvamos o resto, mas o item continua em ${NOME_STATUS[salvo.status]}. Tenta mover de novo.`)
          return
        }
        salvo = await lerItem(m)
      }
      aoConcluir(salvo, !item)
    } catch {
      setErro('Ops, não deu pra salvar. Sem conexão? Tenta de novo em instantes.')
    } finally {
      setSalvando(false)
    }
  }

  const formId = `${id}-form`
  return (
    <Painel
      titulo={item ? 'Editar item' : 'Novo item'}
      sobretitulo="Roadmap"
      aoFechar={aoFechar}
      rodape={
        <>
          <button type="button" className="botao botao-fantasma" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" form={formId} className="botao botao-primario" disabled={salvando}>
            {salvando && <span className="giro" aria-hidden="true" />}
            {salvando ? 'Salvando…' : item ? 'Salvar' : 'Criar item'}
          </button>
        </>
      }
    >
      <form id={formId} className="form-painel" onSubmit={(e) => void salvar(e)} noValidate aria-label={item ? 'Editar item' : 'Novo item'}>
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`${id}-titulo`}>
            Título
          </label>
          <input
            id={`${id}-titulo`}
            className="controle"
            maxLength={TITULO_MAXIMO}
            placeholder="Ex.: notificações por e-mail"
            value={dados.titulo}
            onChange={(e) => mudar('titulo', e.target.value)}
            aria-invalid={erro && !dados.titulo.trim() ? true : undefined}
            required
          />
        </div>
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`${id}-descricao`}>
            Descrição
          </label>
          <textarea
            id={`${id}-descricao`}
            className="controle controle-area"
            maxLength={4000}
            placeholder="O que é e por que importa (opcional)."
            value={dados.descricao}
            onChange={(e) => mudar('descricao', e.target.value)}
          />
        </div>
        <div className="duas-colunas">
          <div className="campo">
            <label className="campo-rotulo" htmlFor={`${id}-status`}>
              Status
            </label>
            <select id={`${id}-status`} className="controle" value={dados.status} onChange={(e) => mudar('status', e.target.value as StatusItem)}>
              {COLUNAS.map((c) => (
                <option key={c.status} value={c.status}>
                  {NOME_STATUS[c.status]}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label className="campo-rotulo" htmlFor={`${id}-prazo`}>
              Prazo
            </label>
            <input id={`${id}-prazo`} className="controle" type="date" value={dados.prazo} onChange={(e) => mudar('prazo', e.target.value)} />
          </div>
        </div>
        <div className="campo">
          <label className="campo-rotulo" htmlFor={`${id}-progresso`}>
            Progresso
          </label>
          <div className="faixa-linha">
            <input
              id={`${id}-progresso`}
              className="faixa"
              type="range"
              min={0}
              max={100}
              step={5}
              value={dados.progresso}
              onChange={(e) => mudar('progresso', Number(e.target.value))}
            />
            <output htmlFor={`${id}-progresso`} className="faixa-valor">
              {dados.progresso}%
            </output>
          </div>
        </div>
        {erro && (
          <p role="alert" className="campo-erro">
            {erro}
          </p>
        )}
      </form>
    </Painel>
  )
}
