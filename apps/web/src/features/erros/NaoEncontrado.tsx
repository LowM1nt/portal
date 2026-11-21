import { IconeMapa } from '../../ui/icones.tsx'
import { Logo } from '../../ui/Marca.tsx'

/** 404 amigável: fora da casca, com um caminho de volta. */
export function NaoEncontrado() {
  return (
    <main className="nao-encontrado">
      <div className="nao-encontrado-caixa cascata">
        <Logo />
        <div className="cartao">
          <div className="estado">
            <span className="estado-icone">
              <IconeMapa />
            </span>
            <h1 className="estado-titulo">Essa página tirou folga</h1>
            <span className="estado-texto">O link pode estar errado ou a página mudou de lugar. Bora voltar pro começo?</span>
            <a className="botao botao-primario" href="/#/inicio">
              Voltar ao início
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}
