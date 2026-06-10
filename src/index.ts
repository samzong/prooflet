import { createController } from "./controller.js"
import type { ProofletConfig, ProofletController } from "./types.js"

// Public surface: the mount API plus the types a host can rely on (config,
// controller, and the persisted schema). Internal modules (anchor, storage,
// overlay, controller) are implementation detail and must not be re-exported.
export type {
  ProofletAnchor,
  ProofletConfig,
  ProofletController,
  ProofletDocument,
  ProofletRecord,
} from "./types.js"

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
