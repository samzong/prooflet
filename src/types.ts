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

export type ProofletRecord = {
  id: string
  status: "active" | "hidden" | "stale"
  anchor: ProofletAnchor
  title: string
  body: string
  placement: "auto" | "top" | "right" | "bottom" | "left"
  tags: string[]
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
