import { base } from '../auth/apiClient.ts'
import { CalendarioDaFonte } from '../calendario/Calendario.tsx'
import type { Fonte } from '../calendario/useDeploysDaSemana.ts'

// Fora do componente: a referência é estável e não refaz a busca a cada render.
const fonteDaDemo: Fonte = {
  buscar: (caminho) => fetch(`${base}${caminho}`),
  caminho: '/api/demo/deploys',
  escopo: 'demo',
}

export function DemoPage() {
  return (
    <main className="conteudo">
      <header className="cabecalho">
        <h1>Portal</h1>
        <span className="selo">Demonstração com dados fictícios</span>
      </header>
      <CalendarioDaFonte fonte={fonteDaDemo} />
    </main>
  )
}
