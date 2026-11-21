import { base } from '../auth/apiClient.ts'
import { CalendarioDaFonte } from '../calendario/Calendario.tsx'
import type { Fonte } from '../calendario/useDeploysDaSemana.ts'
import { Casca, type ItemNav } from '../../ui/Casca.tsx'
import { IconeDeploys, IconeInfo } from '../../ui/icones.tsx'

// Fora do componente: a referência é estável e não refaz a busca a cada render.
const fonteDaDemo: Fonte = {
  buscar: (caminho) => fetch(`${base}${caminho}`),
  caminho: '/api/demo/deploys',
  escopo: 'demo',
}

const ITENS: ItemNav[] = [{ id: 'deploys', nome: 'Deploys', icone: <IconeDeploys /> }]

export function DemoPage() {
  return (
    <Casca itens={ITENS} ativo="deploys" aoIr={() => undefined} conta={null}>
      <div className="faixa-demo" role="note">
        <IconeInfo />
        <span>Você está na demo: tudo aqui é fictício.</span>
        <a className="botao botao-primario botao-p" href="/">
          Entrar
        </a>
      </div>
      <header className="cab">
        <div className="cab-titulo">
          <h1>Deploys</h1>
          <p>O que o time vai subir nesta semana.</p>
        </div>
      </header>
      <CalendarioDaFonte fonte={fonteDaDemo} />
    </Casca>
  )
}
