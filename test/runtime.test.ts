import { beforeEach, describe, expect, it, vi } from "vitest"
import { createAnchor, resolveAnchor } from "../src/anchor.js"
import { prooflet } from "../src/index.js"

describe("runtime guarantees", () => {
  beforeEach(() => {
    vi.useRealTimers()
    document.querySelectorAll("#prooflet-root").forEach((root) => root.remove())
    document.body.innerHTML = `
      <main>
        <article data-testid="pipeline-card">
          <strong>Pipeline</strong>
          <p>Qualified revenue expected this month.</p>
        </article>
      </main>
    `
    window.localStorage.clear()
    history.replaceState(null, "", "/demo")
  })

  it("preserves unsaved editor input across scroll and resize", () => {
    const target = pipelineCard()
    setRect(target, { left: 20, top: 30, right: 220, bottom: 130, width: 200, height: 100 })

    const controller = prooflet.mount({ projectId: "editor-survival-demo" })
    const shadow = proofletShadow()

    shadow.querySelector<HTMLButtonElement>("[data-action='enter-edit']")!.click()
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))

    const input = shadow.querySelector<HTMLInputElement>("input[name='title']")!
    input.value = "Half-written thought"

    window.dispatchEvent(new Event("scroll"))
    window.dispatchEvent(new Event("resize"))

    expect(shadow.querySelector<HTMLInputElement>("input[name='title']")).toBe(input)
    expect(input.value).toBe("Half-written thought")
    controller.unmount()
  })

  it("saves the draft as a recoverable prooflet when the host removes the target mid-edit", () => {
    const target = pipelineCard()
    setRect(target, { left: 20, top: 30, right: 220, bottom: 130, width: 200, height: 100 })

    const controller = prooflet.mount({ projectId: "detached-target-demo" })
    const shadow = proofletShadow()

    shadow.querySelector<HTMLButtonElement>("[data-action='enter-edit']")!.click()
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    shadow.querySelector<HTMLInputElement>("input[name='title']")!.value = "Survives host re-render"

    document.querySelector("main")!.innerHTML = `<p>Re-rendered</p>`

    shadow.querySelector<HTMLFormElement>("[data-prooflet-editor]")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))

    const stored = JSON.parse(window.localStorage.getItem("prooflet:v1:detached-target-demo")!)
    expect(stored.prooflets).toHaveLength(1)
    expect(stored.prooflets[0].title).toBe("Survives host re-render")
    expect(shadow.querySelector("[data-prooflet-editor]")).toBeNull()
    expect(shadow.querySelector(".stale-item")!.textContent).toContain("Survives host re-render")
    controller.unmount()
  })

  it("never throws when host attributes contain hostile selector characters", () => {
    document.body.innerHTML = `<button aria-label='weird"]
multi"line' name='a"b'>Hostile</button>`
    const button = document.querySelector("button")!
    setRect(button, { left: 0, top: 0, right: 80, bottom: 32, width: 80, height: 32 })

    const anchor = createAnchor(button)
    const resolved = resolveAnchor(anchor)

    expect(resolved.health).not.toBe("stale")
    expect(resolved.element).toBe(button)
  })

  it("keeps prooflets usable in memory when storage writes fail", () => {
    const target = pipelineCard()
    setRect(target, { left: 20, top: 30, right: 220, bottom: 130, width: 200, height: 100 })
    const spy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded")
    })

    try {
      const controller = prooflet.mount({ projectId: "storage-failure-demo" })
      const shadow = proofletShadow()

      shadow.querySelector<HTMLButtonElement>("[data-action='enter-edit']")!.click()
      target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
      shadow.querySelector<HTMLInputElement>("input[name='title']")!.value = "Unsaved but alive"
      shadow.querySelector<HTMLFormElement>("[data-prooflet-editor]")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))

      expect(shadow.querySelectorAll(".pin")).toHaveLength(1)
      expect(shadow.querySelector(".storage-note")!.textContent).toContain("memory")
      expect(window.localStorage.getItem("prooflet:v1:storage-failure-demo")).toBeNull()
      controller.unmount()
    } finally {
      spy.mockRestore()
    }
  })

  it("repositions an open viewer when the viewport size changes", () => {
    const target = pipelineCard()
    setRect(target, { left: 400, top: 80, right: 600, bottom: 180, width: 200, height: 100 })

    const controller = prooflet.mount({ projectId: "viewer-reflow-demo" })
    const shadow = proofletShadow()

    shadow.querySelector<HTMLButtonElement>("[data-action='enter-edit']")!.click()
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    shadow.querySelector<HTMLInputElement>("input[name='title']")!.value = "Follows the viewport"
    shadow.querySelector<HTMLFormElement>("[data-prooflet-editor]")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))
    shadow.querySelector<HTMLButtonElement>("[data-action='exit-edit']")!.click()
    shadow.querySelector<HTMLButtonElement>(".pin")!.click()

    expect(shadow.querySelector<HTMLElement>(".viewer")!.style.left).toBe("612px")

    const originalInnerWidth = window.innerWidth

    try {
      Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 800 })
      window.dispatchEvent(new Event("resize"))

      expect(shadow.querySelector<HTMLElement>(".viewer")!.style.left).toBe("68px")
      expect(shadow.querySelector<HTMLElement>(".viewer")!.style.top).toBe("80px")
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: originalInnerWidth })
    }

    controller.unmount()
  })

  it("hangs the viewer below the pin corner when the target spans the viewport", () => {
    const target = pipelineCard()
    setRect(target, { left: 12, top: 100, right: 1012, bottom: 200, width: 1000, height: 100 })

    const controller = prooflet.mount({ projectId: "full-width-target-demo" })
    const shadow = proofletShadow()

    shadow.querySelector<HTMLButtonElement>("[data-action='enter-edit']")!.click()
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    shadow.querySelector<HTMLInputElement>("input[name='title']")!.value = "Full width"
    shadow.querySelector<HTMLFormElement>("[data-prooflet-editor]")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))
    shadow.querySelector<HTMLButtonElement>("[data-action='exit-edit']")!.click()
    shadow.querySelector<HTMLButtonElement>(".pin")!.click()

    const viewer = shadow.querySelector<HTMLElement>(".viewer")!

    expect(viewer.style.top).toBe("212px")
    expect(viewer.style.left).toBe("692px")
    controller.unmount()
  })

  it("re-resolves anchors after host DOM mutations without scroll or resize", async () => {
    vi.useFakeTimers()
    const target = pipelineCard()
    setRect(target, { left: 20, top: 30, right: 220, bottom: 130, width: 200, height: 100 })

    const controller = prooflet.mount({ projectId: "mutation-demo" })
    const shadow = proofletShadow()

    shadow.querySelector<HTMLButtonElement>("[data-action='enter-edit']")!.click()
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    shadow.querySelector<HTMLInputElement>("input[name='title']")!.value = "Watching the DOM"
    shadow.querySelector<HTMLFormElement>("[data-prooflet-editor]")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))

    expect(shadow.querySelectorAll(".pin")).toHaveLength(1)

    document.querySelector("main")!.innerHTML = `<p>Replaced</p>`
    await vi.advanceTimersByTimeAsync(300)

    expect(shadow.querySelectorAll(".pin")).toHaveLength(0)
    expect(shadow.querySelector(".stale-item")!.textContent).toContain("Watching the DOM")
    controller.unmount()
    vi.useRealTimers()
  })
})

function setRect(element: HTMLElement, rect: Omit<DOMRect, "x" | "y" | "toJSON">): void {
  element.getBoundingClientRect = () =>
    ({
      x: rect.left,
      y: rect.top,
      ...rect,
      toJSON: () => ({}),
    }) as DOMRect
}

function pipelineCard(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-testid='pipeline-card']")!
}

function proofletShadow(): ShadowRoot {
  return document.querySelector<HTMLElement>("#prooflet-root")!.shadowRoot!
}
