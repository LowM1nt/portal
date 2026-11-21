import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  // Preferências guardadas (workspace lembrado, tema…) não vazam de um teste para o outro.
  try {
    window.localStorage.clear()
  } catch {
    // armazenamento bloqueado em algum teste
  }
})
