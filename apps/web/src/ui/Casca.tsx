import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { IconeBusca, IconeLua, IconeNovo, IconeSair, IconeSol } from './icones.tsx'
import { Logo, LogoCurto } from './Marca.tsx'
import { Paleta, type Comando } from './Paleta.tsx'
import { eCelular } from './preferencias.ts'
import { hrefDe, type Destino } from './rota.ts'
import { alternarTema, useTema } from './tema.ts'

export type ItemNav = {
  id: Destino
  nome: string
  icone: ReactNode
  /** Só no dock do computador ('desk') ou só nas abas do celular ('cel'). */
  so?: 'desk' | 'cel'
  /** Outros destinos em que este item aparece ativo (a aba "Mais" cobre o Roadmap no celular). */
  ativoEm?: Destino[]
  /** Bolinha de pendências; a descrição é o que o leitor de tela ouve. */
  contador?: { valor: number; descricao: string } | null
}

/** Conta de quem está logado; `null` na demo pública (sem menu de conta). */
export type Conta = { email: string | null; aoSair: () => void }

/** Ação principal da tela no celular: o botão "+" redondo acima das abas. */
export type Fab = { rotulo: string; aoClicar: () => void }

type Props = {
  itens: ItemNav[]
  ativo: Destino | null
  aoIr: (destino: Destino) => void
  conta: Conta | null
  /** Ações extras da busca rápida (Ctrl+K), antes de tema e sair. */
  acoes?: Comando[]
  fab?: Fab | null
  children: ReactNode
}

const estaAtivo = (item: ItemNav, ativo: Destino | null) =>
  ativo !== null && (item.id === ativo || Boolean(item.ativoEm?.includes(ativo)))

// Arrastar para o lado troca de aba: só com toque, só no celular e longe de campos e listas que rolam de lado.
const SEM_ARRASTO = 'input, textarea, select, [data-sem-arrasto], .painel, .modal, .paleta, .veu, .dock'
const ARRASTO_MINIMO = 64

/**
 * Casca do Releasy. Um único menu serve às duas larguras: no computador é o dock flutuante à
 * esquerda (só ícones, nome na dica); no celular vira a barra de abas no rodapé (ícone + nome),
 * com busca e conta no topo. Assim não há botão duplicado para leitor de tela.
 */
export function Casca({ itens, ativo, aoIr, conta, acoes = [], fab = null, children }: Props) {
  const tema = useTema()
  const [paletaAberta, setPaletaAberta] = useState(false)
  const focoAntes = useRef<HTMLElement | null>(null)
  const toque = useRef<[number, number] | null>(null)
  const id = useId()

  const abrirPaleta = useCallback(() => {
    focoAntes.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setPaletaAberta(true)
  }, [])

  const fecharPaleta = useCallback(() => {
    setPaletaAberta(false)
    focoAntes.current?.focus()
  }, [])

  useEffect(() => {
    function atalho(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (paletaAberta) fecharPaleta()
        else abrirPaleta()
      }
    }
    window.addEventListener('keydown', atalho)
    return () => window.removeEventListener('keydown', atalho)
  }, [paletaAberta, abrirPaleta, fecharPaleta])

  function comecarToque(e: TouchEvent) {
    const alvo = e.target instanceof Element ? e.target : null
    toque.current = e.touches.length === 1 && !alvo?.closest(SEM_ARRASTO) ? [e.touches[0].clientX, e.touches[0].clientY] : null
  }

  function terminarToque(e: TouchEvent) {
    const inicio = toque.current
    toque.current = null
    if (!inicio || !eCelular()) return
    const dx = e.changedTouches[0].clientX - inicio[0]
    const dy = e.changedTouches[0].clientY - inicio[1]
    // Gesto quase na horizontal: quem está rolando a página não troca de aba sem querer.
    if (Math.abs(dx) < ARRASTO_MINIMO || Math.abs(dy) > Math.abs(dx) * 0.6) return
    const abas = itens.filter((i) => i.so !== 'desk')
    const atual = abas.findIndex((i) => estaAtivo(i, ativo))
    if (atual < 0) return
    const proxima = abas[atual + (dx < 0 ? 1 : -1)]
    if (proxima) aoIr(proxima.id)
  }

  const nomeTema = tema === 'claro' ? 'Usar tema escuro' : 'Usar tema claro'
  const iconeTema = tema === 'claro' ? <IconeLua /> : <IconeSol />

  const comandos: Comando[] = [
    ...acoes,
    { id: 'tema', grupo: 'Ações', nome: 'Alternar tema claro/escuro', icone: iconeTema, executar: alternarTema },
    ...(conta ? [{ id: 'sair', grupo: 'Ações' as const, nome: 'Sair', icone: <IconeSair />, executar: conta.aoSair }] : []),
    ...itens
      .filter((item) => item.so !== 'cel')
      .map((item) => ({ id: item.id, grupo: 'Ir para' as const, nome: item.nome, icone: item.icone, executar: () => aoIr(item.id) })),
  ]

  return (
    <div
      className={`casca${itens.length < 2 ? ' casca-sem-abas' : ''}${fab ? ' casca-com-fab' : ''}`}
      onTouchStart={comecarToque}
      onTouchEnd={terminarToque}
    >
      <header className="topo-cel">
        <Logo />
      </header>

      <nav className="dock" aria-label="Navegação principal">
        <LogoCurto />
        <ul className="dock-itens">
          {itens.map((item) => {
            const descricao = item.contador ? `${id}-${item.id}-contador` : undefined
            return (
              <li key={item.id} className={item.so ? `so-${item.so}` : undefined}>
                <a
                  className="dock-item"
                  href={hrefDe(item.id)}
                  aria-current={estaAtivo(item, ativo) ? 'page' : undefined}
                  aria-describedby={descricao}
                  onClick={(e) => {
                    e.preventDefault()
                    aoIr(item.id)
                  }}
                >
                  <span className="dock-ic">
                    {item.icone}
                    {item.contador && (
                      <span className="contador" aria-hidden="true" data-testid={`contador-${item.id}`}>
                        {item.contador.valor > 99 ? '99+' : item.contador.valor}
                      </span>
                    )}
                  </span>
                  <span className="dock-rotulo">{item.nome}</span>
                </a>
                {item.contador && (
                  <span id={descricao} hidden>
                    {item.contador.descricao}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
        <span className="dock-sep" aria-hidden="true" />
        <button type="button" className="dock-item dock-busca" aria-label="Buscar (Ctrl+K)" onClick={abrirPaleta}>
          <span className="dock-ic">
            <IconeBusca />
          </span>
          <span className="dock-rotulo" aria-hidden="true">
            Buscar · Ctrl+K
          </span>
        </button>
        <span className="dock-espaco" aria-hidden="true" />
        {conta ? (
          <MenuConta conta={conta} nomeTema={nomeTema} iconeTema={iconeTema} />
        ) : (
          <button type="button" className="dock-item dock-tema" aria-label={nomeTema} onClick={alternarTema}>
            <span className="dock-ic">
              {iconeTema}
            </span>
            <span className="dock-rotulo" aria-hidden="true">
              {nomeTema}
            </span>
          </button>
        )}
      </nav>

      <main className="principal">
        <div className="centro cascata" key={ativo ?? ''}>
          {children}
        </div>
      </main>

      {fab && (
        <button type="button" className="fab" aria-label={fab.rotulo} onClick={fab.aoClicar}>
          <IconeNovo />
        </button>
      )}

      {paletaAberta && <Paleta comandos={comandos} aoFechar={fecharPaleta} />}
    </div>
  )
}

function MenuConta({ conta, nomeTema, iconeTema }: { conta: Conta; nomeTema: string; iconeTema: ReactNode }) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const id = useId()
  const inicial = (conta.email?.trim()[0] ?? '?').toUpperCase()

  useEffect(() => {
    if (!aberto) return
    function fora(e: PointerEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('pointerdown', fora)
    return () => document.removeEventListener('pointerdown', fora)
  }, [aberto])

  function fechar() {
    setAberto(false)
    botao.current?.focus()
  }

  return (
    <div className="conta" ref={caixa}>
      <button
        ref={botao}
        type="button"
        className="dock-eu"
        aria-label="Sua conta"
        aria-expanded={aberto}
        aria-controls={aberto ? id : undefined}
        onClick={() => setAberto((a) => !a)}
      >
        <span className="avatar" aria-hidden="true">
          {inicial}
        </span>
      </button>
      {aberto && (
        <div
          className="menu-conta"
          id={id}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              fechar()
            }
          }}
        >
          <div className="menu-conta-quem">
            <span className="avatar avatar-g" aria-hidden="true">
              {inicial}
            </span>
            <div>
              <b>Sua conta</b>
              <span>{conta.email ?? 'Sem e-mail'}</span>
            </div>
          </div>
          <button
            type="button"
            className="menu-conta-item"
            onClick={() => {
              alternarTema()
              fechar()
            }}
          >
            {iconeTema}
            {nomeTema}
          </button>
          <button
            type="button"
            className="menu-conta-item"
            onClick={() => {
              setAberto(false)
              conta.aoSair()
            }}
          >
            <IconeSair />
            Sair
          </button>
        </div>
      )}
    </div>
  )
}
