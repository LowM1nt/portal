import { TEXTO_FORCA, forcaSenha } from './senha.ts'

/** Quatro tracinhos + uma frase; a frase é a ajuda do campo (aria-describedby). */
export function ForcaSenha({ senha, id }: { senha: string; id: string }) {
  const forca = forcaSenha(senha)
  return (
    <>
      <div className="forca" aria-hidden="true" data-forca={forca}>
        {[0, 1, 2, 3].map((n) => (
          <i key={n} className={n < forca ? 'ligado' : undefined} />
        ))}
      </div>
      <span id={id} className="campo-ajuda" aria-live="polite">
        {TEXTO_FORCA[forca]}
      </span>
    </>
  )
}
