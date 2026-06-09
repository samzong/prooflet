import type { ProofletAnchor, ResolvedAnchor } from "./types.js"

const selectableTextTags = new Set(["BUTTON", "A", "LABEL", "SUMMARY", "TH", "TD", "SPAN", "P", "H1", "H2", "H3", "H4"])
const testIdAttributes = ["data-testid", "data-test", "data-qa"]

export function createAnchor(element: Element): ProofletAnchor {
  const rect = element.getBoundingClientRect()
  const text = normalizeText(element.textContent ?? "")

  return {
    url: {
      origin: window.location.origin,
      pathname: window.location.pathname,
    },
    selectors: {
      css: buildCssSelector(element),
      dataTestId: readFirstAttribute(element, testIdAttributes),
      ariaLabel: readFirstAttribute(element, ["aria-label"]),
      role: readFirstAttribute(element, ["role"]),
    },
    text: text
      ? {
          exact: text.slice(0, 160),
          prefix: text.slice(0, 48),
          suffix: text.slice(-48),
        }
      : undefined,
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    fingerprint: {
      tagName: element.tagName.toLowerCase(),
      classList: Array.from(element.classList).slice(0, 8),
      childIndexPath: getChildIndexPath(element),
    },
  }
}

export function resolveAnchor(anchor: ProofletAnchor): ResolvedAnchor {
  if (anchor.url.origin !== window.location.origin || anchor.url.pathname !== window.location.pathname) {
    return {
      health: "stale",
      element: null,
      confidence: 0,
    }
  }

  const candidates = collectCandidates(anchor)
  let best: { element: Element; score: number } | null = null

  for (const element of candidates) {
    const score = scoreElement(anchor, element)

    if (!best || score > best.score) {
      best = { element, score }
    }
  }

  if (!best || best.score < 24) {
    return {
      health: "stale",
      element: null,
      confidence: 0,
    }
  }

  return {
    health: best.score >= 72 ? "resolved" : "weak",
    element: best.element,
    confidence: Math.min(100, Math.max(0, best.score)),
  }
}

export function isSelectableElement(element: Element, rootHost?: HTMLElement | null): boolean {
  if (rootHost && (element === rootHost || rootHost.contains(element))) {
    return false
  }

  if (element === document.documentElement || element === document.body) {
    return false
  }

  const tagName = element.tagName

  if (tagName === "SCRIPT" || tagName === "STYLE" || tagName === "META" || tagName === "LINK") {
    return false
  }

  const rect = element.getBoundingClientRect()

  return rect.width >= 4 && rect.height >= 4
}

function collectCandidates(anchor: ProofletAnchor): Element[] {
  const candidates = new Set<Element>()
  const selectors = anchor.selectors

  if (selectors.dataTestId) {
    for (const attribute of testIdAttributes) {
      addCandidate(document.querySelector(`[${attribute}="${escapeAttribute(selectors.dataTestId)}"]`), candidates)
    }
  }
  addCandidate(selectors.ariaLabel ? document.querySelector(`[aria-label="${escapeAttribute(selectors.ariaLabel)}"]`) : null, candidates)
  addCandidate(selectors.role ? document.querySelector(`[role="${escapeAttribute(selectors.role)}"]`) : null, candidates)
  addCandidate(selectors.css ? safeQuerySelector(selectors.css) : null, candidates)
  addCandidate(findByChildIndexPath(anchor.fingerprint.childIndexPath), candidates)

  if (anchor.text?.prefix || anchor.text?.exact) {
    for (const element of document.body.querySelectorAll(Array.from(selectableTextTags).join(","))) {
      const text = normalizeText(element.textContent ?? "")

      if (text && (text === anchor.text.exact || text.includes(anchor.text.prefix ?? ""))) {
        candidates.add(element)
      }
    }
  }

  return Array.from(candidates).filter(isResolvableElement)
}

function scoreElement(anchor: ProofletAnchor, element: Element): number {
  let score = 0
  const selectors = anchor.selectors

  if (selectors.css && safeQuerySelector(selectors.css) === element) {
    score += 32
  }

  if (selectors.dataTestId && readFirstAttribute(element, testIdAttributes) === selectors.dataTestId) {
    score += 30
  }

  if (selectors.ariaLabel && element.getAttribute("aria-label") === selectors.ariaLabel) {
    score += 18
  }

  if (selectors.role && element.getAttribute("role") === selectors.role) {
    score += 12
  }

  if (element.tagName.toLowerCase() === anchor.fingerprint.tagName) {
    score += 12
  }

  const classMatches = anchor.fingerprint.classList.filter((className) => element.classList.contains(className)).length
  score += Math.min(16, classMatches * 4)

  const text = normalizeText(element.textContent ?? "")

  if (anchor.text?.exact && text === anchor.text.exact) {
    score += 26
  } else if (anchor.text?.prefix && text.includes(anchor.text.prefix)) {
    score += 14
  }

  if (anchor.rect) {
    const rect = element.getBoundingClientRect()
    const delta = Math.abs(rect.width - anchor.rect.width) + Math.abs(rect.height - anchor.rect.height)

    if (delta < 24) {
      score += 10
    } else if (delta < 80) {
      score += 4
    }
  }

  return score
}

function buildCssSelector(element: Element): string {
  if (element.id) {
    return `#${escapeCss(element.id)}`
  }

  const parts: string[] = []
  let current: Element | null = element

  while (current && current !== document.body && parts.length < 5) {
    let part = current.tagName.toLowerCase()
    const stableClass = Array.from(current.classList).find((className) => !className.includes(":") && className.length < 48)

    if (stableClass) {
      part += `.${escapeCss(stableClass)}`
    }

    const parent = current.parentElement

    if (parent) {
      const siblings = Array.from(parent.children).filter((sibling) => sibling.tagName === current?.tagName)

      if (siblings.length > 1) {
        part += `:nth-of-type(${siblings.indexOf(current) + 1})`
      }
    }

    parts.unshift(part)
    current = current.parentElement
  }

  return parts.join(" > ")
}

function getChildIndexPath(element: Element): number[] {
  const path: number[] = []
  let current: Element | null = element

  while (current && current !== document.body) {
    const parent: Element | null = current.parentElement

    if (!parent) {
      break
    }

    path.unshift(Array.from(parent.children).indexOf(current))
    current = parent
  }

  return path.slice(-8)
}

function findByChildIndexPath(path: number[]): Element | null {
  let current: Element | null = document.body

  for (const index of path) {
    if (!current || index < 0 || index >= current.children.length) {
      return null
    }

    current = current.children[index]
  }

  return current
}

function readFirstAttribute(element: Element, names: string[]): string | undefined {
  for (const name of names) {
    const value = element.getAttribute(name)

    if (value) {
      return value
    }
  }

  return undefined
}

function addCandidate(element: Element | null, candidates: Set<Element>): void {
  if (element) {
    candidates.add(element)
  }
}

function isResolvableElement(element: Element): boolean {
  if (!element.isConnected) {
    return false
  }

  if (element === document.documentElement || element === document.body) {
    return false
  }

  const tagName = element.tagName

  return tagName !== "SCRIPT" && tagName !== "STYLE" && tagName !== "META" && tagName !== "LINK"
}

function safeQuerySelector(selector: string): Element | null {
  try {
    return document.querySelector(selector)
  } catch {
    return null
  }
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function escapeCss(value: string): string {
  if (typeof CSS !== "undefined" && "escape" in CSS) {
    return CSS.escape(value)
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&")
}

function escapeAttribute(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}
