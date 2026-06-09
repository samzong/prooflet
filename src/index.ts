import { createController } from "./controller.js"
import type { ProofletConfig, ProofletController } from "./types.js"

export type {
  AnchorHealth,
  ProofletAnchor,
  ProofletConfig,
  ProofletController,
  ProofletDocument,
  ProofletDraft,
  ProofletRecord,
  ResolvedAnchor,
} from "./types.js"

export { createAnchor, resolveAnchor } from "./anchor.js"
export { createStore } from "./storage.js"

export const prooflet = {
  mount(config: ProofletConfig): ProofletController {
    const controller = createController(config)
    controller.mount()
    return controller
  },
}

export function mountProoflet(config: ProofletConfig): ProofletController {
  return prooflet.mount(config)
}
