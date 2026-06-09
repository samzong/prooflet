import type { ProofletDocument, ProofletRecord } from "./types.js"

export function createStore(projectId: string, storageKey?: string) {
  const key = storageKey ?? `prooflet:v1:${projectId}`

  function emptyDocument(): ProofletDocument {
    const now = new Date().toISOString()

    return {
      schemaVersion: 1,
      projectId,
      origin: window.location.origin,
      createdAt: now,
      updatedAt: now,
      prooflets: [],
    }
  }

  function load(): ProofletDocument {
    const raw = window.localStorage.getItem(key)

    if (!raw) {
      return emptyDocument()
    }

    try {
      const parsed = JSON.parse(raw) as Partial<ProofletDocument>

      if (parsed.schemaVersion !== 1 || parsed.projectId !== projectId || !Array.isArray(parsed.prooflets)) {
        return emptyDocument()
      }

      return {
        schemaVersion: 1,
        projectId,
        origin: parsed.origin ?? window.location.origin,
        createdAt: parsed.createdAt ?? new Date().toISOString(),
        updatedAt: parsed.updatedAt ?? new Date().toISOString(),
        prooflets: parsed.prooflets,
      }
    } catch {
      return emptyDocument()
    }
  }

  function save(document: ProofletDocument): void {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        ...document,
        updatedAt: new Date().toISOString(),
      }),
    )
  }

  function replace(prooflets: ProofletRecord[]): ProofletDocument {
    const current = load()
    const next: ProofletDocument = {
      ...current,
      updatedAt: new Date().toISOString(),
      prooflets,
    }

    save(next)
    return next
  }

  return {
    load,
    save,
    replace,
  }
}
