import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
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
    <div className="numero">
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
    <div className="grade">
      <div className="abas" role="group" aria-label="Período">
        {([7, 30] as const).map((p) => (
          <button
            key={p}
            type="button"
            className="aba"
            aria-selected={periodo === p}
            aria-pressed={periodo === p}
            onClick={() => escolher(p)}
          >
            {p} dias
          </button>
        ))}
      </div>

      {estado.situacao === "carregando" && (
        <p className="suave" aria-busy="true">
          Carregando…
        </p>
      )}
      {estado.situacao === "erro" && (
        <div className="painel">
          <p role="alert" className="selo selo-erro">
            Não foi possível carregar a performance.
          </p>
          <button type="button" className="botao" onClick={tentarDeNovo}>
            Tentar de novo
          </button>
        </div>
      )}
      {estado.situacao === "vazio" && (
        <p className="vazio">Sem eventos do agente neste período.</p>
      )}
      {estado.situacao === "pronto" && (
        <section className="painel" aria-label="Indicadores de performance">
          <div className="grade grade-3">
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
                  : inteiro.format(estado.indicadores.tokensPorTarefa)
              }
            />
            <Numero
              rotulo="Fila de difíceis"
              valor={
                estado.indicadores.filaDificeis === null
                  ? semValor
                  : inteiro.format(estado.indicadores.filaDificeis)
              }
            />
            <Numero
              rotulo="Acionamentos do fallback"
              valor={inteiro.format(estado.indicadores.fallbacks)}
            />
          </div>
        </section>
      )}
    </div>
  );
}
