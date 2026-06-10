export type ProofletConfig = {
  projectId: string
  enabled?: boolean
  storageKey?: string
}

export type ProofletController = {
  mount(): void
  unmount(): void
  enterEditMode(): void
  exitEditMode(): void
  setEnabled(enabled: boolean): void
}

export type ProofletDocument = {
  schemaVersion: 1
  projectId: string
  origin: string
  createdAt: string
  updatedAt: string
  prooflets: ProofletRecord[]
}

/**
 * The persisted record holds only authored facts. Anchor health is derived
 * at render time from live DOM resolution and must never be persisted.
 */
export type ProofletRecord = {
  id: string
  anchor: ProofletAnchor
  title: string
  body: string
  createdAt: string
  updatedAt: string
}

export type ProofletAnchor = {
  url: {
    origin: string
    pathname: string
  }
  selectors: {
    css?: string
    dataTestId?: string
    ariaLabel?: string
    role?: string
    name?: string
    placeholder?: string
    inputType?: string
  }
  text?: {
    exact?: string
    prefix?: string
    suffix?: string
  }
  rect?: {
    x: number
    y: number
    width: number
    height: number
  }
  fingerprint: {
    tagName: string
    classList: string[]
    childIndexPath: number[]
  }
}

export type AnchorHealth = "resolved" | "weak" | "stale"

export type ResolvedAnchor = {
  health: AnchorHealth
  element: Element | null
  confidence: number
}

export type ProofletDraft = {
  title: string
  body: string
}
