import { beforeEach, describe, expect, it } from "vitest"
import { createAnchor, resolveAnchor } from "../src/anchor.js"

describe("anchor resolution", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
    window.localStorage.clear()
    history.replaceState(null, "", "/demo")
  })

  it("resolves an anchor from multiple signals", () => {
    document.body.innerHTML = `<button data-testid="save-flow" aria-label="Save flow">Save</button>`
    const button = document.querySelector("button")!
    setRect(button, { width: 80, height: 32 })
    const anchor = createAnchor(button)
    const resolved = resolveAnchor(anchor)

    expect(resolved.health).toBe("resolved")
    expect(resolved.element).toBe(button)
    expect(resolved.confidence).toBeGreaterThanOrEqual(72)
  })

  it("marks a moved but recognizable anchor as weak", () => {
    document.body.innerHTML = `<section><button class="primary">Approve request</button></section>`
    const button = document.querySelector("button")!
    setRect(button, { width: 140, height: 32 })
    const anchor = createAnchor(button)

    document.body.innerHTML = `<section><div><button class="secondary">Approve request</button></div></section>`
    setRect(document.querySelector("button")!, { width: 140, height: 32 })

    const resolved = resolveAnchor(anchor)

    expect(resolved.health).toBe("weak")
    expect(resolved.element?.textContent).toContain("Approve request")
  })

  it("marks missing anchors as stale", () => {
    document.body.innerHTML = `<button data-testid="delete-me">Delete</button>`
    setRect(document.querySelector("button")!, { width: 80, height: 32 })
    const anchor = createAnchor(document.querySelector("button")!)

    document.body.innerHTML = `<main><p>Gone</p></main>`

    const resolved = resolveAnchor(anchor)

    expect(resolved.health).toBe("stale")
    expect(resolved.element).toBeNull()
  })

  it("marks anchors without a layout box as stale", () => {
    document.body.innerHTML = `<input name="password" type="password" />`
    const input = document.querySelector("input")!
    setRect(input, { width: 180, height: 40 })
    const anchor = createAnchor(input)

    setRect(input, { width: 0, height: 0 })

    const resolved = resolveAnchor(anchor)

    expect(resolved.health).toBe("stale")
    expect(resolved.element).toBeNull()
  })

  it("does not resolve a structurally reused selector to a different control", () => {
    document.body.innerHTML = `<main><form><input class="field" name="password" type="password" placeholder="Password" /></form></main>`
    const input = document.querySelector("input")!
    setRect(input, { width: 180, height: 40 })
    const anchor = createAnchor(input)

    document.body.innerHTML = `<main><form><input class="field" name="query" type="search" placeholder="Search apps" /></form></main>`
    setRect(document.querySelector("input")!, { width: 180, height: 40 })

    const resolved = resolveAnchor(anchor)

    expect(resolved.health).toBe("stale")
    expect(resolved.element).toBeNull()
  })
})

function setRect(element: Element, rect: Pick<DOMRect, "width" | "height">): void {
  element.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: rect.width,
      bottom: rect.height,
      ...rect,
      toJSON: () => ({}),
    }) as DOMRect
}
