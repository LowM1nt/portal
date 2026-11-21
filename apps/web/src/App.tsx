import { useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase as clientePadrao } from './supabase.ts'
import { AuthProvider, useAuth } from './features/auth/AuthProvider.tsx'
import { Bugs } from './features/bugs/Bugs.tsx'
import { RelatarBug } from './features/bugs/RelatarBug.tsx'
import type { Bug } from './features/bugs/api.ts'
import { Calendario } from './features/calendario/Calendario.tsx'
import type { Deploy } from './features/calendario/useDeploysDaSemana.ts'
import { Config } from './features/config/Config.tsx'
import { MinhaConta } from './features/conta/MinhaConta.tsx'
import { pedeRevisaoDe } from './features/conta/github.ts'
import { capturarConvite } from './features/convite/convite.ts'
import { useAceitarConvitePendente } from './features/convite/useAceitarConvite.ts'
import { NovoDeploy } from './features/deploys/NovoDeploy.tsx'
import { PainelDeploy } from './features/deploys/PainelDeploy.tsx'
import { Metricas } from './features/metricas/Metricas.tsx'
import { PERIODOS, periodoDaRota } from './features/metricas/formato.ts'
import { diasDaSemana, periodo, rotuloSemana } from './features/calendario/semana.ts'
import { DemoPage } from './features/demo/DemoPage.tsx'
import { NaoEncontrado } from './features/erros/NaoEncontrado.tsx'
import { Inicio } from './features/inicio/Inicio.tsx'
import { Mais } from './features/mais/Mais.tsx'
import { PrimeirosPassos } from './features/primeiros-passos/PrimeirosPassos.tsx'
import { passoDaRota, usePrimeirosPassosAutomatico } from './features/primeiros-passos/primeirosPassos.ts'
import { contadores, usePendencias } from './features/pendencias/pendencias.ts'
import { PendenciasProvider } from './features/pendencias/PendenciasProvider.tsx'
import { FilaRevisao } from './features/revisoes/FilaRevisao.tsx'
import { Roadmap } from './features/roadmap/Roadmap.tsx'
import { Triagem } from './features/triagem/Triagem.tsx'
import { hrefRoadmap, visaoDaRota } from './features/roadmap/visao.ts'
import { useAvisoDeErro, useAvisos } from './ui/avisos.ts'
import { Casca, type Fab, type ItemNav } from './ui/Casca.tsx'
import { Carregando, EstadoErro, EstadoVazio } from './ui/Estados.tsx'
import {
  IconeBugs,
  IconeConfig,
  IconeDeploys,
  IconeInicio,
  IconeMais,
  IconeMetricas,
  IconeNovo,
  IconePessoa,
  IconeRevisoes,
  IconeRoadmap,
  IconeSetaBaixo,
  IconeTime,
  IconeTriagem,
} from './ui/icones.tsx'
import { Aurora, Logo } from './ui/Marca.tsx'
import type { Comando } from './ui/Paleta.tsx'
import { useRota, type Destino } from './ui/rota.ts'
import { ToastProvider } from './ui/Toasts.tsx'
import { TransicaoProvider } from './ui/Transicao.tsx'

type Props = { cliente?: SupabaseClient | null }

function App({ cliente = clientePadrao }: Props) {
  // Link de convite (/convite#token=…): guarda o token, limpa o endereço e segue pro Início (uma vez por montagem).
  useState(() => {
    capturarConvite()
    return true
  })
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
    case 'triagem':
      return { titulo: 'Triagem com IA', texto: 'A IA sugere; você decide. Nada muda sem a sua aprovação.' }
    case 'roadmap':
      return { titulo: 'Roadmap', texto: 'O que vem por aí, da ideia à entrega.' }
    case 'metricas':
      return { titulo: 'Métricas', texto: 'Como o time está entregando.' }
    case 'config':
      return { titulo: 'Configurações', texto: 'Integrações, repositórios e o time do workspace.' }
    case 'conta':
      return { titulo: 'Minha conta', texto: 'Seu perfil, aparência e segurança.' }
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
  const { estado, email, githubLogin, workspaces, workspaceAtivo, trocarWorkspace, sair, tentarDeNovo } = useAuth()
  const pendencias = usePendencias()
  const { avisar } = useAvisos()
  const [relatando, setRelatando] = useState(false)
  const [criandoDeploy, setCriandoDeploy] = useState(false)
  // Muda depois de criar ou marcar um deploy: o calendário busca de novo sem voltar ao esqueleto.
  const [versaoDeploys, setVersaoDeploys] = useState(0)
  useAceitarConvitePendente()
  useAvisoDeErro(estado === 'erro', 'Seus dados não vieram', 'Pode ser a conexão. Dá pra tentar de novo ali no meio da tela.')

  const destino = rota.destino
  usePrimeirosPassosAutomatico(destino === 'inicio', ir)
  // Primeiros passos: tela cheia, fora da casca (sem dock nem abas).
  if (rota.partes[0] === 'primeiros-passos') return <PrimeirosPassos passo={passoDaRota(rota.params)} ir={ir} />
  if (destino === null) return <NaoEncontrado />

  const pronto = estado === 'pronto' && workspaceAtivo !== null
  const conta = { email, aoSair: () => void sair().catch(() => undefined), aoAbrirConta: () => ir('#/conta') }
  const { titulo, texto } = titulos(destino)
  const c = contadores(pendencias)
  // Com o login do GitHub configurado, a bolinha conta só o que pede a sua revisão.
  const contadorRevisoes =
    githubLogin && pendencias.revisoes.dados
      ? pendencias.revisoes.dados.filter((p) => pedeRevisaoDe(p.revisores, githubLogin)).length
      : c.revisoes
  const relatar = () => setRelatando(true)
  const novoDeploy = () => setCriandoDeploy(true)
  const idDeploy = destino === 'deploys' ? (rota.partes[1] ?? null) : null

  function deployCriado(deploy: Deploy) {
    setCriandoDeploy(false)
    setVersaoDeploys((v) => v + 1)
    const dia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'UTC' }).format(
      new Date(deploy.agendadoPara),
    )
    avisar({ tipo: 'ok', titulo: 'Deploy criado!', texto: `Já tá no calendário: ${dia}.` })
    if (destino !== 'deploys') ir('#/deploys')
  }
  const novoItem = () => ir(hrefRoadmap(visaoDaRota(rota), 'novo'))

  function bugCriado(bug: Bug) {
    if (pendencias.bugs.estado === 'pronto') pendencias.bugs.definir((lista) => [bug, ...lista])
    else pendencias.bugs.atualizar()
    setRelatando(false)
    avisar({ tipo: 'ok', titulo: 'Bug relatado!', texto: `“${bug.titulo}” entrou em A triar.` })
    ir('#/bugs?f=a_triar')
  }

  // A fila da triagem são os bugs "a triar": mesma contagem da bolinha de Bugs, vinda dos mesmos dados.
  const contadorTriagem = c.bugsATriar
    ? { valor: c.bugsATriar, descricao: plural(c.bugsATriar, 'bug esperando triagem', 'bugs esperando triagem') }
    : null

  const itens: ItemNav[] = [
    { id: 'inicio', nome: 'Início', icone: <IconeInicio /> },
    { id: 'deploys', nome: 'Deploys', icone: <IconeDeploys /> },
    {
      id: 'revisoes',
      nome: 'Revisões',
      icone: <IconeRevisoes />,
      contador: contadorRevisoes
        ? {
            valor: contadorRevisoes,
            descricao: githubLogin
              ? plural(contadorRevisoes, 'PR esperando você', 'PRs esperando você')
              : plural(contadorRevisoes, 'PR esperando revisão', 'PRs esperando revisão'),
          }
        : null,
    },
    {
      id: 'bugs',
      nome: 'Bugs',
      icone: <IconeBugs />,
      contador: c.bugsATriar ? { valor: c.bugsATriar, descricao: plural(c.bugsATriar, 'bug a triar', 'bugs a triar') } : null,
    },
    { id: 'roadmap', nome: 'Roadmap', icone: <IconeRoadmap />, so: 'desk' },
    { id: 'triagem', nome: 'Triagem com IA', icone: <IconeTriagem />, so: 'desk', contador: contadorTriagem },
    { id: 'metricas', nome: 'Métricas', icone: <IconeMetricas />, so: 'desk' },
    { id: 'mais', nome: 'Mais', icone: <IconeMais />, so: 'cel', ativoEm: ['roadmap', 'triagem', 'metricas', 'config', 'conta'] },
    { id: 'config', nome: 'Configurações', icone: <IconeConfig />, so: 'desk', lugar: 'pe' },
  ]

  const acoes: Comando[] = pronto
    ? [
        { id: 'novo-deploy', grupo: 'Ações', nome: 'Novo deploy', icone: <IconeDeploys />, executar: novoDeploy },
        { id: 'relatar-bug', grupo: 'Ações', nome: 'Relatar bug', icone: <IconeBugs />, executar: relatar },
        { id: 'novo-item', grupo: 'Ações', nome: 'Novo item no roadmap', icone: <IconeRoadmap />, executar: () => ir(hrefRoadmap('quadro', 'novo')) },
        { id: 'conta', grupo: 'Ir para', nome: 'Minha conta', icone: <IconePessoa />, executar: () => ir('#/conta') },
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
  } else if (pronto && destino === 'deploys') {
    fab = { rotulo: 'Novo deploy', aoClicar: novoDeploy }
    acaoCab = (
      <button type="button" className="botao botao-primario so-desk" onClick={novoDeploy}>
        <IconeNovo />
        Novo deploy
      </button>
    )
  } else if (estado === 'pronto' && destino === 'metricas') {
    const atual = periodoDaRota(rota.params)
    acaoCab = (
      <nav className="segmento" aria-label="Período">
        {PERIODOS.map((p) => (
          <a key={p} className="segmento-op" href={`#/metricas?p=${p}`} aria-current={p === atual ? 'true' : undefined}>
            {p} semanas
          </a>
        ))}
      </nav>
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
    corpo = <Mais aoSair={conta.aoSair} contadores={{ triagem: contadorTriagem }} />
  } else if (destino === 'conta') {
    corpo = <MinhaConta aoSair={conta.aoSair} />
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
  else if (destino === 'revisoes') corpo = <FilaRevisao soMinhas={rota.params.get('f') !== 'todas'} />
  else if (destino === 'bugs') corpo = <Bugs rota={rota} ir={ir} aoRelatar={relatar} />
  else if (destino === 'triagem') corpo = <Triagem />
  else if (destino === 'roadmap') corpo = <Roadmap rota={rota} ir={ir} />
  else if (destino === 'metricas') corpo = <Metricas semanas={periodoDaRota(rota.params)} />
  else if (destino === 'config') corpo = <Config rota={rota} />
  else
    corpo = (
      <Calendario
        versao={versaoDeploys}
        aoAbrir={(id) => ir(`#/deploys/${encodeURIComponent(id)}`)}
        acaoVazio={
          <button type="button" className="botao botao-primario" onClick={novoDeploy}>
            <IconeNovo />
            Novo deploy
          </button>
        }
      />
    )

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
      {criandoDeploy && pronto && <NovoDeploy aoFechar={() => setCriandoDeploy(false)} aoCriado={deployCriado} />}
      {idDeploy && pronto && (
        <PainelDeploy id={idDeploy} aoFechar={() => ir('#/deploys')} aoMudar={() => setVersaoDeploys((v) => v + 1)} />
      )}
    </>
  )
}

export default App
