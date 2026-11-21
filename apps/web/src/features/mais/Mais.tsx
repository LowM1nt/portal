import { IconeAvancar, IconeConfig, IconeLua, IconeMetricas, IconePessoa, IconeRoadmap, IconeSair, IconeSol } from '../../ui/icones.tsx'
import { alternarTema, useTema } from '../../ui/tema.ts'

const LINKS = [
  { href: '#/roadmap', nome: 'Roadmap', icone: <IconeRoadmap /> },
  { href: '#/metricas', nome: 'Métricas', icone: <IconeMetricas /> },
  { href: '#/config/repositorios', nome: 'Configurações', icone: <IconeConfig /> },
  { href: '#/conta', nome: 'Minha conta', icone: <IconePessoa /> },
]

/** Aba "Mais" do celular: o que não cabe nas abas (Roadmap, Métricas, Configurações, conta), o tema e sair. */
export function Mais({ aoSair }: { aoSair: () => void }) {
  const tema = useTema()
  return (
    <section className="cartao" aria-label="Mais opções">
      <ul className="lista-mais">
        {LINKS.map((l) => (
          <li key={l.href}>
            <a className="mais-item" href={l.href}>
              {l.icone}
              {l.nome}
              <span className="seta">
                <IconeAvancar />
              </span>
            </a>
          </li>
        ))}
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
