import type { Rota } from '../../ui/rota.ts'
import { hrefPasso } from '../primeiros-passos/primeirosPassos.ts'
import { Integracoes } from './Integracoes.tsx'
import { Time } from './Time.tsx'
import './config.css'

const ABAS = [
  { id: 'repositorios', nome: 'Repositórios e integrações' },
  { id: 'time', nome: 'Time e workspace' },
] as const

/** Configurações do workspace: duas abas (`#/config/repositorios` e `#/config/time`). */
export function Config({ rota }: { rota: Rota }) {
  const aba = rota.partes[1] === 'time' ? 'time' : 'repositorios'
  return (
    <div className="tela-config">
      <div className="barra">
        <nav className="segmento" aria-label="Seções das configurações">
          {ABAS.map((a) => (
            <a key={a.id} className="segmento-op" href={`#/config/${a.id}`} aria-current={a.id === aba ? 'true' : undefined}>
              {a.nome}
            </a>
          ))}
        </nav>
        <a className="botao botao-fantasma botao-p" href={hrefPasso(1)}>
          Primeiros passos
        </a>
      </div>
      {aba === 'time' ? <Time /> : <Integracoes />}
    </div>
  )
}
