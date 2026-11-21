/** Só os 6 dígitos do app autenticador (espaços e traços colados junto são ignorados). */
export const limparCodigo = (codigo: string) => codigo.replace(/[\s-]/g, '')

/** O SDK devolve o QR code como imagem SVG em data URI; qualquer outra coisa não é desenhada. */
export const qrSeguro = (qr: unknown): string | null => (typeof qr === 'string' && /^data:image\/svg\+xml[;,]/.test(qr) ? qr : null)
