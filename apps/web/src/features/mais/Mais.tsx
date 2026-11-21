import { IconeAvancar, IconeLua, IconeRoadmap, IconeSair, IconeSol } from '../../ui/icones.tsx'
import { alternarTema, useTema } from '../../ui/tema.ts'

/** Aba "Mais" do celular: o que não cabe nas abas (Roadmap), o tema e sair. */
export function Mais({ aoSair }: { aoSair: () => void }) {
  const tema = useTema()
  return (
    <section className="cartao" aria-label="Mais opções">
      <ul className="lista-mais">
        <li>
          <a className="mais-item" href="#/roadmap">
            <IconeRoadmap />
            Roadmap
            <span className="seta">
              <IconeAvancar />
            </span>
          </a>
        </li>
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
