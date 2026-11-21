import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatarNumero } from "../../formatar.ts";
import { Carregando, EstadoErro, EstadoVazio } from "../../ui/Estados.tsx";
import { IconePerformance } from "../../ui/icones.tsx";
import { buscarPerformance, type Indicadores, type Periodo } from "./dados.ts";

type Estado =
  | { situacao: "carregando" }
  | { situacao: "erro" }
  | { situacao: "vazio" }
  | { situacao: "pronto"; indicadores: Indicadores };

// Na nova tentativa, mantém "Carregando…" visível por um instante: o clique precisa dar retorno.
const ESPERA_NOVA_TENTATIVA_MS = 400;

const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="painel numero">
      <b>{valor}</b> <span>{rotulo}</span>
    </div>
  );
}

export default function Performance({ cliente }: { cliente: SupabaseClient }) {
  const [periodo, setPeriodo] = useState<Periodo>(7);
  const [tentativa, setTentativa] = useState(0);
  const [estado, setEstado] = useState<Estado>({ situacao: "carregando" });

  useEffect(() => {
    let ativo = true;
    const espera =
      tentativa > 0
        ? new Promise((r) => setTimeout(r, ESPERA_NOVA_TENTATIVA_MS))
        : null;
    buscarPerformance(cliente, periodo)
      .finally(() => espera)
      .then(({ eventos, indicadores }) => {
        if (ativo)
          setEstado(
            eventos.length
              ? { situacao: "pronto", indicadores }
              : { situacao: "vazio" },
          );
      })
      .catch(() => {
        if (ativo) setEstado({ situacao: "erro" });
      });
    return () => {
      ativo = false;
    };
  }, [cliente, periodo, tentativa]);

  function escolher(novo: Periodo) {
    if (novo === periodo) return;
    setEstado({ situacao: "carregando" });
    setPeriodo(novo);
  }

  function tentarDeNovo() {
    setEstado({ situacao: "carregando" });
    setTentativa((n) => n + 1);
  }

  const semValor = "—";

  return (
    <div className="tela">
      <div className="cabecalho">
        <div className="titulo">
          <h1>Performance</h1>
          <p>Como o agente anda no período escolhido.</p>
        </div>
        <div className="abas" role="tablist" aria-label="Período">
          {([7, 30] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              className="aba"
              aria-selected={periodo === p}
              onClick={() => escolher(p)}
            >
              {p} dias
            </button>
          ))}
        </div>
      </div>

      {estado.situacao === "carregando" && (
        <Carregando className="grade grade-5">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className="osso osso-numero" />
          ))}
        </Carregando>
      )}
      {estado.situacao === "erro" && (
        <div className="painel">
          <EstadoErro
            titulo="Não foi possível carregar a performance."
            texto="Seus dados estão seguros. Pode ser a conexão; tenta de novo?"
            aoTentar={tentarDeNovo}
          />
        </div>
      )}
      {estado.situacao === "vazio" && (
        <div className="painel">
          <EstadoVazio
            icone={<IconePerformance />}
            titulo="Sem eventos do agente neste período."
            texto="Quando ele rodar uma noite, os números aparecem aqui."
          />
        </div>
      )}
      {estado.situacao === "pronto" && (
        <section className="grade grade-5" aria-label="Indicadores de performance">
          <Numero
            rotulo="PRs por noite"
            valor={
              estado.indicadores.prsPorNoite === null
                ? semValor
                : decimal.format(estado.indicadores.prsPorNoite)
            }
          />
          <Numero
            rotulo="Taxa de aprovação nos portões"
            valor={
              estado.indicadores.taxaAprovacao === null
                ? semValor
                : `${inteiro.format(estado.indicadores.taxaAprovacao * 100)}%`
            }
          />
          <Numero
            rotulo="Tokens por tarefa"
            valor={
              estado.indicadores.tokensPorTarefa === null
                ? semValor
                : formatarNumero(estado.indicadores.tokensPorTarefa)
            }
          />
          <Numero
            rotulo="Fila de difíceis"
            valor={
              estado.indicadores.filaDificeis === null
                ? semValor
                : formatarNumero(estado.indicadores.filaDificeis)
            }
          />
          <Numero
            rotulo="Acionamentos do fallback"
            valor={formatarNumero(estado.indicadores.fallbacks)}
          />
        </section>
      )}
    </div>
  );
}
