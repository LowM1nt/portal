import type { ReactNode } from 'react'
import { Logo } from '../../ui/Marca.tsx'
import { convitePendente } from '../convite/convite.ts'

// Prévia decorativa do lado da marca (não são dados de ninguém).
const PREVIA = [
  { titulo: 'Filtro por ambiente', selo: 'selo-ok', rotulo: 'Sucesso' },
  { titulo: 'Ajuste no lead time', selo: 'selo-andamento', rotulo: 'Rodando' },
  { titulo: 'Novo tema escuro', selo: 'selo-erro', rotulo: 'Falhou' },
]

/** Layout L2 das telas de quem não entrou: marca à esquerda, formulário à direita. */
export function LayoutL2({ children }: { children: ReactNode }) {
  return (
    <main className="login">
      <section className="login-marca">
        <Logo className="login-logo" />
        <div className="login-frase">
          <h2>
            Deploy sem drama.
            <br />
            <em>Release sem susto.</em>
          </h2>
          <p>O calendário do que sobe, a fila de revisões e os bugs do time, num lugar só.</p>
        </div>
        <div className="cartao login-previa" aria-hidden="true">
          {PREVIA.map((p) => (
            <div key={p.titulo} className="login-previa-item">
              <span>{p.titulo}</span>
              <span className={`selo ${p.selo}`}>{p.rotulo}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="login-lado-form">
        {convitePendente() ? (
          <div className="login-coluna">
            <p className="faixa-convite" role="status">
              Você recebeu um convite! Entre ou crie sua conta com o e-mail convidado e a gente te leva pro workspace.
            </p>
            {children}
          </div>
        ) : (
          children
        )}
      </section>
    </main>
  )
}
