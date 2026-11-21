import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { IconeBusca, IconeLua, IconeSair, IconeSol } from './icones.tsx'
import { Logo, LogoCurto } from './Marca.tsx'
import { Paleta, type Comando } from './Paleta.tsx'
import { hrefDe, type Destino } from './rota.ts'
import { alternarTema, useTema } from './tema.ts'

export type ItemNav = { id: Destino; nome: string; icone: ReactNode }

/** Conta de quem está logado; `null` na demo pública (sem menu de conta). */
export type Conta = { email: string | null; aoSair: () => void }

type Props = {
  itens: ItemNav[]
  ativo: Destino
  aoIr: (destino: Destino) => void
  conta: Conta | null
  children: ReactNode
}

/**
 * Casca do Releasy. Um único menu serve às duas larguras: no computador é o dock flutuante à
 * esquerda (só ícones, nome na dica); no celular vira a barra de abas no rodapé (ícone + nome),
 * com busca e conta no topo. Assim não há botão duplicado para leitor de tela.
 */
export function Casca({ itens, ativo, aoIr, conta, children }: Props) {
  const tema = useTema()
  const [paletaAberta, setPaletaAberta] = useState(false)
  const focoAntes = useRef<HTMLElement | null>(null)

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

  const nomeTema = tema === 'claro' ? 'Usar tema escuro' : 'Usar tema claro'
  const iconeTema = tema === 'claro' ? <IconeLua /> : <IconeSol />

  const comandos: Comando[] = [
    { id: 'tema', grupo: 'Ações', nome: 'Alternar tema claro/escuro', icone: iconeTema, executar: alternarTema },
    ...(conta ? [{ id: 'sair', grupo: 'Ações' as const, nome: 'Sair', icone: <IconeSair />, executar: conta.aoSair }] : []),
    ...itens.map((item) => ({ id: item.id, grupo: 'Ir para' as const, nome: item.nome, icone: item.icone, executar: () => aoIr(item.id) })),
  ]

  return (
    <div className={`casca${itens.length < 2 ? ' casca-sem-abas' : ''}`}>
      <header className="topo-cel">
        <Logo />
      </header>

      <nav className="dock" aria-label="Navegação principal">
        <LogoCurto />
        <ul className="dock-itens">
          {itens.map((item) => (
            <li key={item.id}>
              <a
                className="dock-item"
                href={hrefDe(item.id)}
                aria-current={ativo === item.id ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault()
                  aoIr(item.id)
                }}
              >
                <span className="dock-ic">{item.icone}</span>
                <span className="dock-rotulo">{item.nome}</span>
              </a>
            </li>
          ))}
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
        <div className="centro cascata" key={ativo}>
          {children}
        </div>
      </main>

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
