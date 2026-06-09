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
    const anchor = createAnchor(button)
    const resolved = resolveAnchor(anchor)

    expect(resolved.health).toBe("resolved")
    expect(resolved.element).toBe(button)
    expect(resolved.confidence).toBeGreaterThanOrEqual(72)
  })

  it("marks a moved but recognizable anchor as weak", () => {
    document.body.innerHTML = `<section><button class="primary">Approve request</button></section>`
    const button = document.querySelector("button")!
    const anchor = createAnchor(button)

    document.body.innerHTML = `<section><div><button class="secondary">Approve request</button></div></section>`

    const resolved = resolveAnchor(anchor)

    expect(resolved.health).toBe("weak")
    expect(resolved.element?.textContent).toContain("Approve request")
  })

  it("marks missing anchors as stale", () => {
    document.body.innerHTML = `<button data-testid="delete-me">Delete</button>`
    const anchor = createAnchor(document.querySelector("button")!)

    document.body.innerHTML = `<main><p>Gone</p></main>`

    const resolved = resolveAnchor(anchor)

    expect(resolved.health).toBe("stale")
    expect(resolved.element).toBeNull()
  })
})
