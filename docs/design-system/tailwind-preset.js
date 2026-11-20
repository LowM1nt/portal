// Madrugada — preset opcional do Tailwind. As cores apontam para as variáveis de tokens.css,
// então a troca de tema continua sendo só o atributo data-theme no <html>.
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['selector', ':root:not([data-theme="light"])'],
  theme: {
    extend: {
      colors: {
        noite: 'var(--noite)', veu: 'var(--veu)', 'veu-alto': 'var(--veu-alto)', linha: 'var(--linha)',
        texto: 'var(--texto)', 'texto-suave': 'var(--texto-suave)', 'texto-fraco': 'var(--texto-fraco)',
        roxo: { DEFAULT: 'var(--roxo)', forte: 'var(--roxo-forte)', texto: 'var(--roxo-texto)', veu: 'var(--roxo-veu)' },
        ok: { DEFAULT: 'var(--ok)', veu: 'var(--ok-veu)' },
        atencao: { DEFAULT: 'var(--atencao)', veu: 'var(--atencao-veu)' },
        erro: { DEFAULT: 'var(--erro)', veu: 'var(--erro-veu)' },
      },
      fontFamily: { titulo: 'var(--fonte-titulo)', texto: 'var(--fonte-texto)', codigo: 'var(--fonte-codigo)' },
      borderRadius: { controle: 'var(--raio-controle)', painel: 'var(--raio-painel)' },
    },
  },
};
