import type { ReactNode } from 'react'
import { IconeAvancar, IconeConfig, IconeLua, IconeMetricas, IconePessoa, IconeRoadmap, IconeSair, IconeSol, IconeTriagem } from '../../ui/icones.tsx'
import { alternarTema, useTema } from '../../ui/tema.ts'

type Contador = { valor: number; descricao: string } | null

const LINKS: { href: string; nome: string; icone: ReactNode; contador?: 'triagem' }[] = [
  { href: '#/roadmap', nome: 'Roadmap', icone: <IconeRoadmap /> },
  { href: '#/triagem', nome: 'Triagem com IA', icone: <IconeTriagem />, contador: 'triagem' },
  { href: '#/metricas', nome: 'Métricas', icone: <IconeMetricas /> },
  { href: '#/config/repositorios', nome: 'Configurações', icone: <IconeConfig /> },
  { href: '#/conta', nome: 'Minha conta', icone: <IconePessoa /> },
]

type Props = { aoSair: () => void; contadores?: { triagem?: Contador } }

/** Aba "Mais" do celular: o que não cabe nas abas (Roadmap, Triagem, Métricas, Configurações, conta), o tema e sair. */
export function Mais({ aoSair, contadores = {} }: Props) {
  const tema = useTema()
  return (
    <section className="cartao" aria-label="Mais opções">
      <ul className="lista-mais">
        {LINKS.map((l) => {
          const contador = l.contador ? contadores[l.contador] : null
          return (
            <li key={l.href}>
              <a className="mais-item" href={l.href}>
                {l.icone}
                {l.nome}
                {contador && (
                  <>
                    <span className="mais-contador" aria-hidden="true" data-testid={`mais-contador-${l.contador}`}>
                      {contador.valor > 99 ? '99+' : contador.valor}
                    </span>
                    <span className="sr">, {contador.descricao}</span>
                  </>
                )}
                <span className="seta">
                  <IconeAvancar />
                </span>
              </a>
            </li>
          )
        })}
        <li>
          <button type="button" className="mais-item" onClick={alternarTema}>
            {tema === 'claro' ? <IconeLua /> : <IconeSol />}
            {tema === 'claro' ? 'Usar tema escuro' : 'Usar tema claro'}
          </button>
        </li>
        <li>
          <button type="button" className="mais-item mais-item-perigo" onClick={aoSair}>
            <IconeSair />
            Sair
          </button>
        </li>
      </ul>
    </section>
  )
}
