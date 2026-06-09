import { prooflet } from "./index.js"
import type { ProofletController } from "./types.js"

declare global {
  interface Window {
    __PROOFLET__?: ProofletController
  }
}

const projectId =
  document.currentScript?.getAttribute("data-project-id") ??
  document.documentElement.getAttribute("data-prooflet-project") ??
  window.location.host

window.__PROOFLET__ = prooflet.mount({ projectId })
