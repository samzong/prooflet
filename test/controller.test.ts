import { beforeEach, describe, expect, it, vi } from "vitest"
import { prooflet } from "../src/index.js"

describe("controller", () => {
  beforeEach(() => {
    vi.useRealTimers()
    document.querySelectorAll("#prooflet-root").forEach((root) => root.remove())
    document.body.innerHTML = `
      <main>
        <article data-testid="pipeline-card">
          <strong>Pipeline</strong>
          <p>Qualified revenue expected this month.</p>
        </article>
        <article data-testid="risk-card">
          <strong>Review risk</strong>
          <p>Accounts waiting for approval.</p>
        </article>
        <button data-testid="host-action">Host action</button>
      </main>
    `
    window.localStorage.clear()
    history.replaceState(null, "", "/demo")
  })

  it("creates, stores, and restores a prooflet from the in-page flow", () => {
    const target = pipelineCard()
    setRect(target, { left: 20, top: 30, right: 220, bottom: 130, width: 200, height: 100 })

    const controller = prooflet.mount({ projectId: "controller-demo" })
    const shadow = proofletShadow()

    shadow.querySelector<HTMLButtonElement>("[data-action='enter-edit']")!.click()
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))

    const title = shadow.querySelector<HTMLInputElement>("input[name='title']")!
    const body = shadow.querySelector<HTMLTextAreaElement>("textarea[name='body']")!
    title.value = "Pipeline proof"
    body.value = "This explains the qualified revenue signal."
    shadow.querySelector<HTMLFormElement>("[data-prooflet-editor]")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))

    const stored = JSON.parse(window.localStorage.getItem("prooflet:v1:controller-demo")!)
    expect(stored.prooflets).toHaveLength(1)
    expect(shadow.querySelector("[data-prooflet-editor]")).toBeNull()
    expect(shadow.querySelectorAll(".pin")).toHaveLength(1)
    expect(shadow.querySelector("[data-action='exit-edit']")).not.toBeNull()

    controller.unmount()
    prooflet.mount({ projectId: "controller-demo" })

    const restoredRoot = document.querySelector<HTMLElement>("#prooflet-root")!
    expect(restoredRoot.shadowRoot!.querySelectorAll(".pin")).toHaveLength(1)
  })

  it("can be mounted disabled and enabled later", () => {
    const controller = prooflet.mount({ projectId: "disabled-demo", enabled: false })
    const root = document.querySelector<HTMLElement>("#prooflet-root")!

    expect(root.shadowRoot!.querySelector("[data-action='enter-edit']")).toBeNull()

    controller.setEnabled(true)

    expect(root.shadowRoot!.querySelector("[data-action='enter-edit']")).not.toBeNull()
  })

  it("does not let disabled controllers enter annotation mode through the public API", () => {
    const target = pipelineCard()
    setRect(target, { left: 20, top: 30, right: 220, bottom: 130, width: 200, height: 100 })
    const controller = prooflet.mount({ projectId: "disabled-api-demo", enabled: false })

    controller.enterEditMode()
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    const click = new MouseEvent("click", { bubbles: true, cancelable: true })
    target.dispatchEvent(click)

    expect(click.defaultPrevented).toBe(false)
  })

  it("keeps editor input stable after target selection", () => {
    const target = pipelineCard()
    setRect(target, { left: 20, top: 30, right: 220, bottom: 130, width: 200, height: 100 })
    const controller = prooflet.mount({ projectId: "editor-demo" })
    const shadow = proofletShadow()

    shadow.querySelector<HTMLButtonElement>("[data-action='enter-edit']")!.click()
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))

    shadow.querySelector<HTMLInputElement>("input[name='title']")!.value = "Draft title"
    document.body.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))

    expect(shadow.querySelector<HTMLInputElement>("input[name='title']")!.value).toBe("Draft title")

    shadow.querySelector<HTMLButtonElement>("[data-action='cancel-editor']")!.click()

    expect(shadow.querySelector("[data-prooflet-editor]")).toBeNull()
    controller.unmount()
  })

  it("continues annotating after saving a prooflet", () => {
    const firstTarget = pipelineCard()
    const secondTarget = riskCard()
    setRect(firstTarget, { left: 20, top: 30, right: 220, bottom: 130, width: 200, height: 100 })
    setRect(secondTarget, { left: 240, top: 30, right: 440, bottom: 130, width: 200, height: 100 })

    prooflet.mount({ projectId: "continuous-demo" })
    const shadow = proofletShadow()

    shadow.querySelector<HTMLButtonElement>("[data-action='enter-edit']")!.click()
    firstTarget.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    firstTarget.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    shadow.querySelector<HTMLInputElement>("input[name='title']")!.value = "First"
    shadow.querySelector<HTMLFormElement>("[data-prooflet-editor]")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))

    secondTarget.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    secondTarget.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))

    expect(shadow.querySelector("[data-prooflet-editor]")).not.toBeNull()

    shadow.querySelector<HTMLInputElement>("input[name='title']")!.value = "Second"
    shadow.querySelector<HTMLFormElement>("[data-prooflet-editor]")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))

    const stored = JSON.parse(window.localStorage.getItem("prooflet:v1:continuous-demo")!)
    expect(stored.prooflets).toHaveLength(2)
  })

  it("edits an existing prooflet when selecting the same target again", () => {
    const target = pipelineCard()
    setRect(target, { left: 20, top: 30, right: 220, bottom: 130, width: 200, height: 100 })

    prooflet.mount({ projectId: "same-target-edit-demo" })
    const shadow = proofletShadow()

    shadow.querySelector<HTMLButtonElement>("[data-action='enter-edit']")!.click()
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    shadow.querySelector<HTMLInputElement>("input[name='title']")!.value = "Original title"
    shadow.querySelector<HTMLTextAreaElement>("textarea[name='body']")!.value = "Original body"
    shadow.querySelector<HTMLFormElement>("[data-prooflet-editor]")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))

    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))

    expect(shadow.querySelector(".editor-head")!.textContent).toContain("Edit prooflet")
    expect(shadow.querySelector<HTMLInputElement>("input[name='title']")!.value).toBe("Original title")
    expect(shadow.querySelector<HTMLTextAreaElement>("textarea[name='body']")!.value).toBe("Original body")

    shadow.querySelector<HTMLInputElement>("input[name='title']")!.value = "Updated title"
    shadow.querySelector<HTMLFormElement>("[data-prooflet-editor]")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))

    const stored = JSON.parse(window.localStorage.getItem("prooflet:v1:same-target-edit-demo")!)

    expect(stored.prooflets).toHaveLength(1)
    expect(stored.prooflets[0].title).toBe("Updated title")
  })

  it("toggles prooflet visibility without disabling annotation", () => {
    const target = pipelineCard()
    setRect(target, { left: 20, top: 30, right: 220, bottom: 130, width: 200, height: 100 })

    prooflet.mount({ projectId: "visibility-demo" })
    const shadow = proofletShadow()

    shadow.querySelector<HTMLButtonElement>("[data-action='enter-edit']")!.click()
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    shadow.querySelector<HTMLInputElement>("input[name='title']")!.value = "Visible"
    shadow.querySelector<HTMLFormElement>("[data-prooflet-editor]")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))

    expect(shadow.querySelectorAll(".pin")).toHaveLength(1)

    shadow.querySelector<HTMLButtonElement>("[data-action='toggle-visibility']")!.click()

    expect(shadow.querySelectorAll(".pin")).toHaveLength(0)
    expect(shadow.querySelector<HTMLButtonElement>("[data-action='toggle-visibility']")!.textContent).toBe("Show")

    shadow.querySelector<HTMLButtonElement>("[data-action='toggle-visibility']")!.click()

    expect(shadow.querySelectorAll(".pin")).toHaveLength(1)
  })

  it("shows prooflet content near the annotated target", () => {
    const target = pipelineCard()
    setRect(target, { left: 20, top: 30, right: 220, bottom: 130, width: 200, height: 100 })

    prooflet.mount({ projectId: "viewer-position-demo" })
    const shadow = proofletShadow()

    shadow.querySelector<HTMLButtonElement>("[data-action='enter-edit']")!.click()
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    shadow.querySelector<HTMLInputElement>("input[name='title']")!.value = "Near target"
    shadow.querySelector<HTMLFormElement>("[data-prooflet-editor]")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))
    shadow.querySelector<HTMLButtonElement>(".pin")!.click()

    const viewer = shadow.querySelector<HTMLElement>(".viewer")!

    expect(viewer.style.left).toBe("232px")
    expect(viewer.style.top).toBe("30px")
    expect(viewer.style.right).toBe("")
    expect(viewer.style.bottom).toBe("")
    expect(viewer.textContent).not.toContain("resolved")
  })

  it("previews prooflet content on pin hover and locks it on pin click", () => {
    vi.useFakeTimers()

    const target = pipelineCard()
    setRect(target, { left: 20, top: 30, right: 220, bottom: 130, width: 200, height: 100 })

    prooflet.mount({ projectId: "viewer-hover-demo" })
    const shadow = proofletShadow()

    shadow.querySelector<HTMLButtonElement>("[data-action='enter-edit']")!.click()
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    shadow.querySelector<HTMLInputElement>("input[name='title']")!.value = "Hover target"
    shadow.querySelector<HTMLFormElement>("[data-prooflet-editor]")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))

    shadow.querySelector<HTMLButtonElement>(".pin")!.dispatchEvent(new MouseEvent("mouseenter"))

    expect(shadow.querySelector(".viewer")).not.toBeNull()

    shadow.querySelector<HTMLButtonElement>(".pin")!.dispatchEvent(new MouseEvent("mouseleave"))
    shadow.querySelector<HTMLElement>(".viewer")!.dispatchEvent(new MouseEvent("mouseenter"))
    vi.advanceTimersByTime(200)

    expect(shadow.querySelector(".viewer")).not.toBeNull()

    shadow.querySelector<HTMLElement>(".viewer")!.dispatchEvent(new MouseEvent("mouseleave"))
    vi.advanceTimersByTime(200)

    expect(shadow.querySelector(".viewer")).toBeNull()

    shadow.querySelector<HTMLButtonElement>(".pin")!.click()

    expect(shadow.querySelector(".viewer")).not.toBeNull()

    shadow.querySelector<HTMLButtonElement>(".pin")!.dispatchEvent(new MouseEvent("mouseleave"))
    shadow.querySelector<HTMLElement>(".viewer")!.dispatchEvent(new MouseEvent("mouseleave"))
    vi.advanceTimersByTime(200)

    expect(shadow.querySelector(".viewer")).not.toBeNull()

    shadow.querySelector<HTMLButtonElement>("[data-action='close-viewer']")!.click()

    expect(shadow.querySelector(".viewer")).toBeNull()
  })

  it("closes the editor with Escape and clean scrim clicks", () => {
    const target = pipelineCard()
    setRect(target, { left: 20, top: 30, right: 220, bottom: 130, width: 200, height: 100 })

    prooflet.mount({ projectId: "editor-close-demo" })
    const shadow = proofletShadow()

    shadow.querySelector<HTMLButtonElement>("[data-action='enter-edit']")!.click()
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    shadow.querySelector<HTMLInputElement>("input[name='title']")!.value = "Closable"
    shadow.querySelector<HTMLFormElement>("[data-prooflet-editor]")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))
    shadow.querySelector<HTMLButtonElement>("[data-action='exit-edit']")!.click()

    shadow.querySelector<HTMLButtonElement>(".pin")!.click()
    shadow.querySelector<HTMLButtonElement>("[data-action='edit']")!.click()
    expect(shadow.querySelector("[data-prooflet-editor]")).not.toBeNull()

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    expect(shadow.querySelector("[data-prooflet-editor]")).toBeNull()

    shadow.querySelector<HTMLButtonElement>(".pin")!.click()
    shadow.querySelector<HTMLButtonElement>("[data-action='edit']")!.click()
    expect(shadow.querySelector("[data-prooflet-editor]")).not.toBeNull()

    shadow.querySelector<HTMLElement>(".scrim")!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(shadow.querySelector("[data-prooflet-editor]")).toBeNull()
  })

  it("keeps prooflet content near right-edge targets", () => {
    const target = pipelineCard()
    setRect(target, { left: 1040, top: 80, right: 1180, bottom: 180, width: 140, height: 100 })

    prooflet.mount({ projectId: "viewer-edge-demo" })
    const shadow = proofletShadow()

    shadow.querySelector<HTMLButtonElement>("[data-action='enter-edit']")!.click()
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    shadow.querySelector<HTMLInputElement>("input[name='title']")!.value = "Edge target"
    shadow.querySelector<HTMLFormElement>("[data-prooflet-editor]")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))
    shadow.querySelector<HTMLButtonElement>(".pin")!.click()

    const viewer = shadow.querySelector<HTMLElement>(".viewer")!

    expect(Number.parseInt(viewer.style.left, 10)).toBeLessThan(1040)
    expect(viewer.style.top).toBe("80px")
    expect(viewer.style.right).toBe("")
    expect(viewer.style.bottom).toBe("")
  })

  it("shows stale prooflets as health items instead of floating viewers", () => {
    const target = pipelineCard()
    setRect(target, { left: 20, top: 30, right: 220, bottom: 130, width: 200, height: 100 })

    prooflet.mount({ projectId: "stale-health-demo" })
    const shadow = proofletShadow()

    shadow.querySelector<HTMLButtonElement>("[data-action='enter-edit']")!.click()
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    shadow.querySelector<HTMLInputElement>("input[name='title']")!.value = "Missing target"
    shadow.querySelector<HTMLTextAreaElement>("textarea[name='body']")!.value = "This should stay recoverable."
    shadow.querySelector<HTMLFormElement>("[data-prooflet-editor]")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))

    document.querySelector("main")!.innerHTML = `<button data-testid="host-action">Host action</button>`
    window.dispatchEvent(new Event("resize"))

    const staleItem = shadow.querySelector<HTMLElement>(".stale-item")!

    expect(shadow.querySelector(".viewer")).toBeNull()
    expect(shadow.querySelectorAll(".pin")).toHaveLength(0)
    expect(staleItem.textContent).toContain("stale")
    expect(staleItem.textContent).toContain("Missing target")
    expect(staleItem.textContent).toContain("This should stay recoverable.")
    expect(staleItem.textContent).toContain("Target not found on this page.")
    expect(staleItem.querySelector("[data-action='edit']")).not.toBeNull()
    expect(staleItem.querySelector("[data-action='delete']")).not.toBeNull()
  })

  it("does not intercept host clicks outside annotation mode", () => {
    const hostButton = document.querySelector<HTMLButtonElement>("[data-testid='host-action']")!
    let clicks = 0
    hostButton.addEventListener("click", () => {
      clicks += 1
    })

    prooflet.mount({ projectId: "host-click-demo" })
    const shadow = document.querySelector<HTMLElement>("#prooflet-root")!.shadowRoot!

    hostButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    shadow.querySelector<HTMLButtonElement>("[data-action='enter-edit']")!.click()
    shadow.querySelector<HTMLButtonElement>("[data-action='exit-edit']")!.click()
    hostButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))

    expect(clicks).toBe(2)
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

function riskCard(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-testid='risk-card']")!
}

function proofletShadow(): ShadowRoot {
  return document.querySelector<HTMLElement>("#prooflet-root")!.shadowRoot!
}
