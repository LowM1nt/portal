import { useCallback } from 'react'
import { useAuth } from '../auth/AuthProvider.tsx'
import { SEVERIDADES } from '../bugs/api.ts'
import { Carregando } from '../../ui/Estados.tsx'
import { IconeTriagem } from '../../ui/icones.tsx'
import { useCarregar } from '../../ui/useCarregar.ts'
import { confianca, evidencias, lerTriagem } from './api.ts'
import { Confianca } from './Triagem.tsx'

function Campo({ nome, valor }: { nome: string; valor: string }) {
  if (!valor.trim()) return null
  return (
    <>
      <dt>{nome}</dt>
      <dd className="sug-texto">{valor}</dd>
    </>
  )
}

/**
 * "Sugestão da IA" no detalhe de um bug a triar, separada do que o time escreveu ou confirmou.
 * Vem da fila da triagem (GET /api/triagem); tudo aqui é texto puro.
 */
export function SugestaoNoBug({ bugId }: { bugId: string }) {
  const { api } = useAuth()
  const carregar = useCallback(() => lerTriagem(api), [api])
  const fila = useCarregar(carregar, bugId)

  if (fila.estado === 'carregando') {
    return (
      <Carregando className="secao">
        <span className="osso osso-linha" />
        <span className="osso osso-bloco" />
      </Carregando>
    )
  }
  if (fila.estado === 'erro') {
    return (
      <div className="secao">
        <span className="secao-t">Sugestão da IA</span>
        <p className="sug-nada">
          Não deu pra ler a sugestão agora.{' '}
          <button type="button" className="link-botao" onClick={fila.recarregar}>
            Tentar de novo
          </button>
        </p>
      </div>
    )
  }

  const s = fila.dados?.find((i) => i.bugId === bugId)?.sugestao ?? null
  if (!s) return null
  if (s.status === 'pendente') {
    return (
      <div className="secao">
        <span className="secao-t">Sugestão da IA</span>
        <p className="sug-nada" role="status">
          <span className="giro" aria-hidden="true" />A IA está lendo esse relato…
        </p>
      </div>
    )
  }
  if (s.status !== 'pronta') return null

  const sev = s.severidade ? SEVERIDADES[s.severidade] : null
  const nota = confianca(s)
  const lista = evidencias(s)
  return (
    <section className="secao sug" aria-label="Sugestão da IA">
      <div className="sug-cab">
        <span className="secao-t tri-rotulo">
          <IconeTriagem />
          Sugestão da IA
        </span>
        {nota !== null && <Confianca valor={nota} />}
      </div>
      <p className="sug-nota">
        Ainda não confirmada: a IA sugere, você decide. <a href="#/triagem">Decidir na Triagem</a>
      </p>
      <dl className="meta">
        {sev && (
          <>
            <dt>Severidade</dt>
            <dd>
              <span className={`selo ${sev.classe}`}>{sev.nome}</span>
            </dd>
          </>
        )}
        <Campo nome="Área" valor={s.area ?? ''} />
        <Campo nome="Ambiente" valor={s.ambiente ?? ''} />
        <Campo nome="Passos" valor={s.passos ?? ''} />
        <Campo nome="Esperado" valor={s.esperado ?? ''} />
        <Campo nome="Obtido" valor={s.obtido ?? ''} />
      </dl>
      {lista.length > 0 && (
        <div className="tri-evid">
          <b>Por que a IA acha isso</b>
          <ul>
            {lista.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
