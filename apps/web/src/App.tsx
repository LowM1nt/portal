import { useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase as clientePadrao } from './supabase.ts'
import { AuthProvider, useAuth } from './features/auth/AuthProvider.tsx'
import { Bugs } from './features/bugs/Bugs.tsx'
import { RelatarBug } from './features/bugs/RelatarBug.tsx'
import type { Bug } from './features/bugs/api.ts'
import { Calendario } from './features/calendario/Calendario.tsx'
import { diasDaSemana, periodo, rotuloSemana } from './features/calendario/semana.ts'
import { DemoPage } from './features/demo/DemoPage.tsx'
import { NaoEncontrado } from './features/erros/NaoEncontrado.tsx'
import { Inicio } from './features/inicio/Inicio.tsx'
import { Mais } from './features/mais/Mais.tsx'
import { contadores, usePendencias } from './features/pendencias/pendencias.ts'
import { PendenciasProvider } from './features/pendencias/PendenciasProvider.tsx'
import { FilaRevisao } from './features/revisoes/FilaRevisao.tsx'
import { Roadmap } from './features/roadmap/Roadmap.tsx'
import { hrefRoadmap, visaoDaRota } from './features/roadmap/visao.ts'
import { useAvisoDeErro, useAvisos } from './ui/avisos.ts'
import { Casca, type Fab, type ItemNav } from './ui/Casca.tsx'
import { Carregando, EstadoErro, EstadoVazio } from './ui/Estados.tsx'
import {
  IconeBugs,
  IconeDeploys,
  IconeInicio,
  IconeMais,
  IconeNovo,
  IconeRevisoes,
  IconeRoadmap,
  IconeSetaBaixo,
  IconeTime,
} from './ui/icones.tsx'
import { Aurora, Logo } from './ui/Marca.tsx'
import type { Comando } from './ui/Paleta.tsx'
import { useRota, type Destino } from './ui/rota.ts'
import { ToastProvider } from './ui/Toasts.tsx'
import { TransicaoProvider } from './ui/Transicao.tsx'

type Props = { cliente?: SupabaseClient | null }

function App({ cliente = clientePadrao }: Props) {
  // A demo é pública: não passa pelo AuthProvider nem exige a configuração do Supabase.
  const caminho = window.location.pathname.replace(/\/+$/, '')
  const demo = caminho === '/demo'
  let tela
  if (demo) tela = <DemoPage />
  else if (caminho !== '' && caminho !== '/index.html') tela = <NaoEncontrado />
  else if (!cliente) {
    tela = (
      <main className="sem-config">
        <Logo />
        <p className="suave">
          Configuração ausente: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no build.
        </p>
      </main>
    )
  } else {
    tela = (
      <AuthProvider cliente={cliente}>
        <Telas />
      </AuthProvider>
    )
  }
  return (
    <ToastProvider>
      <TransicaoProvider>
        <Aurora />
        {tela}
      </TransicaoProvider>
    </ToastProvider>
  )
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

function titulos(destino: Destino): { titulo: string; texto: string } {
  switch (destino) {
    case 'inicio':
      return { titulo: `Semana de ${periodo(diasDaSemana(rotuloSemana(new Date())))}`, texto: 'O que sobe, o que espera revisão e o que quebrou.' }
    case 'deploys':
      return { titulo: 'Deploys', texto: 'O que o time vai subir nesta semana.' }
    case 'revisoes':
      return { titulo: 'Fila de revisão', texto: 'PRs esperando revisão nos repositórios do workspace.' }
    case 'bugs':
      return { titulo: 'Bugs', texto: 'Relatados pelo time e pelo Discord.' }
    case 'roadmap':
      return { titulo: 'Roadmap', texto: 'O que vem por aí, da ideia à entrega.' }
    case 'mais':
      return { titulo: 'Mais', texto: 'Outras telas e preferências.' }
  }
}

/** Telas da casca autenticada; os dados compartilhados (contadores) vêm do PendenciasProvider. */
export function Telas() {
  return (
    <PendenciasProvider>
      <TelasDoWorkspace />
    </PendenciasProvider>
  )
}

function TelasDoWorkspace() {
  const [rota, ir] = useRota()
  const { estado, email, workspaces, workspaceAtivo, trocarWorkspace, sair, tentarDeNovo } = useAuth()
  const pendencias = usePendencias()
  const { avisar } = useAvisos()
  const [relatando, setRelatando] = useState(false)
  useAvisoDeErro(estado === 'erro', 'Seus dados não vieram', 'Pode ser a conexão. Dá pra tentar de novo ali no meio da tela.')

  const destino = rota.destino
  if (destino === null) return <NaoEncontrado />

  const pronto = estado === 'pronto' && workspaceAtivo !== null
  const conta = { email, aoSair: () => void sair().catch(() => undefined) }
  const { titulo, texto } = titulos(destino)
  const c = contadores(pendencias)
  const relatar = () => setRelatando(true)
  const novoItem = () => ir(hrefRoadmap(visaoDaRota(rota), 'novo'))

  function bugCriado(bug: Bug) {
    if (pendencias.bugs.estado === 'pronto') pendencias.bugs.definir((lista) => [bug, ...lista])
    else pendencias.bugs.atualizar()
    setRelatando(false)
    avisar({ tipo: 'ok', titulo: 'Bug relatado!', texto: `“${bug.titulo}” entrou em A triar.` })
    ir('#/bugs?f=a_triar')
  }

  const itens: ItemNav[] = [
    { id: 'inicio', nome: 'Início', icone: <IconeInicio /> },
    { id: 'deploys', nome: 'Deploys', icone: <IconeDeploys /> },
    {
      id: 'revisoes',
      nome: 'Revisões',
      icone: <IconeRevisoes />,
      contador: c.revisoes ? { valor: c.revisoes, descricao: plural(c.revisoes, 'PR esperando revisão', 'PRs esperando revisão') } : null,
    },
    {
      id: 'bugs',
      nome: 'Bugs',
      icone: <IconeBugs />,
      contador: c.bugsATriar ? { valor: c.bugsATriar, descricao: plural(c.bugsATriar, 'bug a triar', 'bugs a triar') } : null,
    },
    { id: 'roadmap', nome: 'Roadmap', icone: <IconeRoadmap />, so: 'desk' },
    { id: 'mais', nome: 'Mais', icone: <IconeMais />, so: 'cel', ativoEm: ['roadmap'] },
  ]

  const acoes: Comando[] = pronto
    ? [
        { id: 'relatar-bug', grupo: 'Ações', nome: 'Relatar bug', icone: <IconeBugs />, executar: relatar },
        { id: 'novo-item', grupo: 'Ações', nome: 'Novo item no roadmap', icone: <IconeRoadmap />, executar: () => ir(hrefRoadmap('quadro', 'novo')) },
      ]
    : []

  // Ação principal da tela: botão no cabeçalho (computador) e "+" flutuante (celular).
  let acaoCab: ReactNode = null
  let fab: Fab | null = null
  if (pronto && (destino === 'inicio' || destino === 'bugs')) {
    fab = { rotulo: 'Relatar bug', aoClicar: relatar }
    acaoCab = (
      <button type="button" className={`botao ${destino === 'bugs' ? 'botao-primario' : 'botao-secundario'} so-desk`} onClick={relatar}>
        <IconeNovo />
        Relatar bug
      </button>
    )
  } else if (pronto && destino === 'roadmap') {
    fab = { rotulo: 'Novo item', aoClicar: novoItem }
    acaoCab = (
      <button type="button" className="botao botao-primario so-desk" onClick={novoItem}>
        <IconeNovo />
        Novo item
      </button>
    )
  }

  let corpo
  if (estado === 'carregando') {
    corpo = (
      <Carregando className="cartao tela-carregando">
        <span className="osso osso-titulo" />
        <span className="osso osso-bloco" />
        <span className="osso osso-bloco" />
      </Carregando>
    )
  } else if (estado === 'erro') {
    corpo = (
      <div className="cartao">
        <EstadoErro
          titulo="Ops, não deu pra carregar seus dados."
          texto="Seus dados estão seguros. Tenta de novo?"
          aoTentar={tentarDeNovo}
        />
      </div>
    )
  } else if (destino === 'mais') {
    corpo = <Mais aoSair={conta.aoSair} />
  } else if (!workspaceAtivo) {
    corpo = (
      <div className="cartao">
        <EstadoVazio
          icone={<IconeTime />}
          titulo="Você ainda não está em nenhum workspace"
          texto="Peça para alguém do time te convidar e volte aqui."
        />
      </div>
    )
  } else if (destino === 'inicio') corpo = <Inicio />
  else if (destino === 'revisoes') corpo = <FilaRevisao />
  else if (destino === 'bugs') corpo = <Bugs rota={rota} ir={ir} aoRelatar={relatar} />
  else if (destino === 'roadmap') corpo = <Roadmap rota={rota} ir={ir} />
  else corpo = <Calendario />

  return (
    <>
      <Casca itens={itens} ativo={destino} aoIr={(d) => ir(`#/${d}`)} conta={conta} acoes={acoes} fab={fab}>
        <header className="cab">
          <div className="cab-titulo">
            <h1>{titulo}</h1>
            <p>{texto}</p>
          </div>
          {estado === 'pronto' && (
            <div className="cab-acoes">
              <div className="ws">
                <IconeTime />
                <span className="ws-nome">{workspaceAtivo?.nome ?? 'Nenhum workspace'}</span>
                {workspaces.length > 1 && (
                  <>
                    <IconeSetaBaixo />
                    <select
                      className="ws-seletor"
                      aria-label="Workspace"
                      value={workspaceAtivo?.id ?? ''}
                      onChange={(e) => trocarWorkspace(e.target.value)}
                    >
                      {workspaces.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.nome} ({w.papel})
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
              {acaoCab}
            </div>
          )}
        </header>
        {corpo}
      </Casca>
      {relatando && pronto && <RelatarBug aoFechar={() => setRelatando(false)} aoCriado={bugCriado} />}
    </>
  )
}

export default App
