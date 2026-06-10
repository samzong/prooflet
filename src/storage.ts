import type { ProofletAnchor, ProofletDocument, ProofletRecord } from "./types.js"

export type ProofletStore = {
  load(): ProofletDocument
  replace(prooflets: ProofletRecord[]): { document: ProofletDocument; persisted: boolean }
}

export function createStore(projectId: string, storageKey?: string): ProofletStore {
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
    let raw: string | null = null

    try {
      raw = window.localStorage.getItem(key)
    } catch {
      return emptyDocument()
    }

    if (!raw) {
      return emptyDocument()
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>

      if (parsed.schemaVersion !== 1 || parsed.projectId !== projectId) {
        return emptyDocument()
      }

      return {
        schemaVersion: 1,
        projectId,
        origin: optionalString(parsed.origin) ?? window.location.origin,
        createdAt: optionalString(parsed.createdAt) ?? new Date().toISOString(),
        updatedAt: optionalString(parsed.updatedAt) ?? new Date().toISOString(),
        prooflets: sanitizeRecords(parsed.prooflets),
      }
    } catch {
      return emptyDocument()
    }
  }

  function replace(prooflets: ProofletRecord[]): { document: ProofletDocument; persisted: boolean } {
    const current = load()
    const next: ProofletDocument = {
      ...current,
      updatedAt: new Date().toISOString(),
      prooflets,
    }

    let persisted = true

    try {
      window.localStorage.setItem(key, JSON.stringify(next))
    } catch {
      persisted = false
    }

    return { document: next, persisted }
  }

  return {
    load,
    replace,
  }
}

function sanitizeRecords(value: unknown): ProofletRecord[] {
  if (!Array.isArray(value)) {
    return []
  }

  const records: ProofletRecord[] = []

  for (const entry of value) {
    const record = sanitizeRecord(entry)

    if (record) {
      records.push(record)
    }
  }

  return records
}

function sanitizeRecord(value: unknown): ProofletRecord | null {
  if (!isObject(value) || typeof value.id !== "string" || !value.id) {
    return null
  }

  const anchor = sanitizeAnchor(value.anchor)

  if (!anchor) {
    return null
  }

  const now = new Date().toISOString()

  return {
    id: value.id,
    anchor,
    title: optionalString(value.title) ?? "",
    body: optionalString(value.body) ?? "",
    createdAt: optionalString(value.createdAt) ?? now,
    updatedAt: optionalString(value.updatedAt) ?? now,
  }
}

function sanitizeAnchor(value: unknown): ProofletAnchor | null {
  if (!isObject(value)) {
    return null
  }

  const url = value.url
  const fingerprint = value.fingerprint

  if (!isObject(url) || typeof url.origin !== "string" || typeof url.pathname !== "string") {
    return null
  }

  if (!isObject(fingerprint) || typeof fingerprint.tagName !== "string") {
    return null
  }

  const selectors = isObject(value.selectors) ? value.selectors : {}
  const text = isObject(value.text) ? value.text : null
  const rect = isObject(value.rect) ? value.rect : null

  return {
    url: {
      origin: url.origin,
      pathname: url.pathname,
    },
    selectors: {
      css: optionalString(selectors.css),
      dataTestId: optionalString(selectors.dataTestId),
      ariaLabel: optionalString(selectors.ariaLabel),
      role: optionalString(selectors.role),
      name: optionalString(selectors.name),
      placeholder: optionalString(selectors.placeholder),
      inputType: optionalString(selectors.inputType),
    },
    text: text
      ? {
          exact: optionalString(text.exact),
          prefix: optionalString(text.prefix),
          suffix: optionalString(text.suffix),
        }
      : undefined,
    rect:
      rect && typeof rect.x === "number" && typeof rect.y === "number" && typeof rect.width === "number" && typeof rect.height === "number"
        ? {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          }
        : undefined,
    fingerprint: {
      tagName: fingerprint.tagName,
      classList: stringArray(fingerprint.classList).slice(0, 8),
      childIndexPath: numberArray(fingerprint.childIndexPath).slice(-8),
    },
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === "number" && Number.isInteger(entry)) : []
}
