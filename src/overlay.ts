import type { ProofletDraft, ProofletRecord, ResolvedAnchor } from "./types.js"

export type OverlayItem = {
  record: ProofletRecord
  resolved: ResolvedAnchor
}

export type OverlayEditorSession = {
  key: number
  mode: "create" | "edit"
  recordId: string | null
  initialTitle: string
  initialBody: string
}

export type OverlayState = {
  enabled: boolean
  editMode: boolean
  items: OverlayItem[]
  proofletsVisible: boolean
  storageHealthy: boolean
  hoveredTarget: Element | null
  selectedTarget: Element | null
  viewerId: string | null
  editor: OverlayEditorSession | null
}

export type OverlayIntents = {
  onEnterEditMode(): void
  onExitEditMode(): void
  onToggleVisibility(): void
  onPinHover(id: string): void
  onPinLeave(): void
  onPinActivate(id: string): void
  onViewerHover(): void
  onViewerLeave(): void
  onCloseViewer(): void
  onEditRecord(id: string): void
  onDeleteRecord(id: string): void
  onSubmitEditor(draft: ProofletDraft): void
  onCancelEditor(): void
}

export type Overlay = {
  host: HTMLElement
  mount(): void
  unmount(): void
  update(state: OverlayState): void
  reposition(): void
}

const VIEWER_WIDTH = 320
const VIEWER_HEIGHT = 190
const VIEWER_GAP = 12
const VIEWER_MARGIN = 12

/**
 * The overlay is a stateless view. It owns DOM nodes inside a closed-world
 * shadow root and emits intents; it never decides what the runtime state is.
 *
 * Rendering is split in two paths:
 * - update(state): structural sync, called only when state actually changes.
 * - reposition(): geometry-only style writes, safe to call on every scroll.
 *
 * The editor form is created once per editor session and never rebuilt while
 * the session is open, so unsaved input survives scroll/resize/re-renders.
 */
export function createOverlay(intents: OverlayIntents): Overlay {
  const host = document.createElement("div")
  host.id = "prooflet-root"
  host.setAttribute("data-prooflet-root", "")
  const shadow = host.attachShadow({ mode: "open" })

  const style = document.createElement("style")
  style.textContent = styles
  const root = createDiv("root")
  const layer = createDiv("layer")
  const hoverBox = createDiv("hover-box")
  const selectedBox = createDiv("selected-box")
  const dock = createDiv("dock")
  hoverBox.style.display = "none"
  selectedBox.style.display = "none"
  layer.append(hoverBox, selectedBox)
  root.append(layer, dock)
  shadow.append(style, root)

  let pinEntries: Array<{ button: HTMLButtonElement; element: Element }> = []
  let hoveredTarget: Element | null = null
  let selectedTarget: Element | null = null
  let viewer: HTMLElement | null = null
  let viewerTarget: Element | null = null
  let scrim: HTMLElement | null = null
  let editorForm: HTMLFormElement | null = null
  let editorSession: OverlayEditorSession | null = null
  let lastPins: { items: OverlayItem[]; visible: boolean } | null = null
  let lastDock: { items: OverlayItem[]; editMode: boolean; visible: boolean; storageHealthy: boolean } | null = null
  let lastViewer: { items: OverlayItem[]; viewerId: string | null } | null = null

  shadow.addEventListener("click", handleDelegatedClick)

  function mount(): void {
    document.documentElement.appendChild(host)
  }

  function unmount(): void {
    host.remove()
  }

  function update(state: OverlayState): void {
    root.className = `root ${state.enabled ? "is-enabled" : "is-disabled"}${state.editMode ? " is-editing" : ""}`

    if (!state.enabled) {
      clearPins()
      removeViewer()
      removeEditor()
      dock.innerHTML = ""
      hoveredTarget = null
      selectedTarget = null
      lastDock = null
      lastViewer = null
      reposition()
      return
    }

    syncPins(state)
    syncDock(state)
    syncViewer(state)
    syncEditor(state)
    hoveredTarget = state.hoveredTarget
    selectedTarget = state.selectedTarget
    reposition()
  }

  function reposition(): void {
    for (const entry of pinEntries) {
      if (!entry.element.isConnected) {
        entry.button.style.display = "none"
        continue
      }

      const rect = entry.element.getBoundingClientRect()

      if (entry.button.style.display !== "") {
        entry.button.style.display = ""
      }

      setPosition(entry.button, Math.round(rect.right - 12), Math.round(rect.top - 12))
    }

    positionBox(hoverBox, hoveredTarget)
    positionBox(selectedBox, selectedTarget)
    positionViewer()
  }

  function syncPins(state: OverlayState): void {
    if (lastPins && lastPins.items === state.items && lastPins.visible === state.proofletsVisible) {
      return
    }

    clearPins()
    const items = state.proofletsVisible ? state.items : []
    let index = 0

    for (const item of items) {
      index += 1
      const element = item.resolved.element

      if (!element) {
        continue
      }

      const button = document.createElement("button")
      button.type = "button"
      button.className = `pin pin-${item.resolved.health}`
      button.dataset.proofletId = item.record.id
      button.dataset.action = "view"
      button.setAttribute("aria-label", item.record.title || "Prooflet")
      button.textContent = String(index)
      button.addEventListener("mouseenter", () => intents.onPinHover(item.record.id))
      button.addEventListener("mouseleave", () => intents.onPinLeave())
      layer.append(button)
      pinEntries.push({ button, element })
    }

    lastPins = { items: state.items, visible: state.proofletsVisible }
  }

  function clearPins(): void {
    for (const entry of pinEntries) {
      entry.button.remove()
    }

    pinEntries = []
    lastPins = null
  }

  function syncDock(state: OverlayState): void {
    if (
      lastDock &&
      lastDock.items === state.items &&
      lastDock.editMode === state.editMode &&
      lastDock.visible === state.proofletsVisible &&
      lastDock.storageHealthy === state.storageHealthy
    ) {
      return
    }

    const count = state.items.length
    const staleItems = state.proofletsVisible ? state.items.filter((item) => item.resolved.health === "stale") : []

    dock.innerHTML = `
      <div class="brand">
        <span class="mark"></span>
        <span>Prooflet</span>
        ${count ? `<span class="count">${count}</span>` : ""}
      </div>
      <div class="actions">
        ${
          state.editMode
            ? `<button type="button" class="primary" data-action="exit-edit">Done</button>`
            : `<button type="button" class="primary" data-action="enter-edit">Annotate</button>`
        }
        ${count ? `<button type="button" class="secondary" data-action="toggle-visibility">${state.proofletsVisible ? "Hide" : "Show"}</button>` : ""}
      </div>
      ${state.storageHealthy ? "" : `<div class="storage-note">Local storage is unavailable. Changes stay in memory only.</div>`}
      ${
        staleItems.length
          ? `<div class="stale-list">${staleItems
              .map(
                (item) => `
                  <div class="stale-item">
                    <div class="stale-head">
                      <span class="health health-stale">stale</span>
                      <strong>${escapeHtml(item.record.title || "Untitled")}</strong>
                    </div>
                    <p>${escapeHtml(item.record.body || "No narration yet.")}</p>
                    <span>Target not found on this page.</span>
                    <div class="stale-actions">
                      <button type="button" class="secondary" data-prooflet-id="${escapeHtml(item.record.id)}" data-action="edit">Edit</button>
                      <button type="button" class="danger" data-prooflet-id="${escapeHtml(item.record.id)}" data-action="delete">Delete</button>
                    </div>
                  </div>
                `,
              )
              .join("")}</div>`
          : ""
      }
    `

    lastDock = {
      items: state.items,
      editMode: state.editMode,
      visible: state.proofletsVisible,
      storageHealthy: state.storageHealthy,
    }
  }

  function syncViewer(state: OverlayState): void {
    if (lastViewer && lastViewer.items === state.items && lastViewer.viewerId === state.viewerId && (viewer !== null) === Boolean(state.viewerId)) {
      return
    }

    const item = state.viewerId && state.proofletsVisible ? state.items.find((entry) => entry.record.id === state.viewerId) : null
    const target = item?.resolved.element ?? null

    if (!item || !target) {
      removeViewer()
      lastViewer = { items: state.items, viewerId: state.viewerId }
      return
    }

    if (!viewer) {
      viewer = document.createElement("section")
      viewer.className = "viewer"
      viewer.addEventListener("mouseenter", () => intents.onViewerHover())
      viewer.addEventListener("mouseleave", () => intents.onViewerLeave())
      root.append(viewer)
    }

    viewerTarget = target
    viewer.innerHTML = `
      <div class="viewer-head">
        <button type="button" class="icon-button" data-action="close-viewer" aria-label="Close prooflet">×</button>
      </div>
      <h2>${escapeHtml(item.record.title || "Untitled prooflet")}</h2>
      <p>${escapeHtml(item.record.body || "No narration yet.")}</p>
      <div class="viewer-actions">
        <button type="button" class="primary" data-prooflet-id="${escapeHtml(item.record.id)}" data-action="edit">Edit</button>
        <button type="button" class="danger" data-prooflet-id="${escapeHtml(item.record.id)}" data-action="delete">Delete</button>
      </div>
    `
    lastViewer = { items: state.items, viewerId: state.viewerId }
  }

  function removeViewer(): void {
    viewer?.remove()
    viewer = null
    viewerTarget = null
  }

  function syncEditor(state: OverlayState): void {
    const session = state.editor

    if (!session) {
      removeEditor()
      return
    }

    if (editorSession && editorSession.key === session.key && editorForm) {
      return
    }

    removeEditor()
    editorSession = session
    scrim = createDiv("scrim")
    const form = document.createElement("form")
    form.className = "editor"
    form.setAttribute("data-prooflet-editor", "")
    form.innerHTML = `
      <div class="editor-head">
        <strong>${session.mode === "edit" ? "Edit prooflet" : "New prooflet"}</strong>
        <button type="button" class="icon-button" data-action="cancel-editor" aria-label="Close editor">×</button>
      </div>
      <label>
        <span>Title</span>
        <input name="title" placeholder="What should reviewers notice?" />
      </label>
      <label>
        <span>Narration</span>
        <textarea name="body" rows="6" placeholder="Explain the product intent, expected behavior, or caveat."></textarea>
      </label>
      <div class="editor-actions">
        ${session.recordId ? `<button type="button" class="danger" data-prooflet-id="${escapeHtml(session.recordId)}" data-action="delete">Delete</button>` : ""}
        <span></span>
        <button type="submit" class="primary">Save</button>
      </div>
    `

    const title = form.querySelector<HTMLInputElement>("input[name='title']")!
    const body = form.querySelector<HTMLTextAreaElement>("textarea[name='body']")!
    title.value = session.initialTitle
    body.value = session.initialBody
    form.addEventListener("submit", (event) => {
      event.preventDefault()
      const draft: ProofletDraft = { title: title.value.trim(), body: body.value.trim() }

      if (!draft.title && !draft.body) {
        return
      }

      intents.onSubmitEditor(draft)
    })

    editorForm = form
    scrim.append(form)
    root.append(scrim)
    title.focus()
  }

  function removeEditor(): void {
    scrim?.remove()
    scrim = null
    editorForm = null
    editorSession = null
  }

  function isEditorDirty(): boolean {
    if (!editorForm || !editorSession) {
      return false
    }

    const title = editorForm.querySelector<HTMLInputElement>("input[name='title']")?.value ?? ""
    const body = editorForm.querySelector<HTMLTextAreaElement>("textarea[name='body']")?.value ?? ""

    return title !== editorSession.initialTitle || body !== editorSession.initialBody
  }

  function handleDelegatedClick(event: Event): void {
    const target = event.target instanceof Element ? event.target : null

    if (!target) {
      return
    }

    if (scrim && target === scrim) {
      if (!isEditorDirty()) {
        intents.onCancelEditor()
      }

      return
    }

    const actionElement = target.closest<HTMLElement>("[data-action]")

    if (!actionElement) {
      return
    }

    const id = actionElement.dataset.proofletId ?? null

    switch (actionElement.dataset.action) {
      case "enter-edit":
        intents.onEnterEditMode()
        break
      case "exit-edit":
        intents.onExitEditMode()
        break
      case "toggle-visibility":
        intents.onToggleVisibility()
        break
      case "view":
        if (id) intents.onPinActivate(id)
        break
      case "close-viewer":
        intents.onCloseViewer()
        break
      case "edit":
        if (id) intents.onEditRecord(id)
        break
      case "delete":
        if (id) intents.onDeleteRecord(id)
        break
      case "cancel-editor":
        intents.onCancelEditor()
        break
    }
  }

  function positionBox(box: HTMLElement, target: Element | null): void {
    if (!target || !target.isConnected) {
      if (box.style.display !== "none") {
        box.style.display = "none"
      }

      return
    }

    const rect = target.getBoundingClientRect()

    if (box.style.display !== "") {
      box.style.display = ""
    }

    setPosition(box, Math.round(rect.left), Math.round(rect.top))
    setStyleLength(box, "width", Math.round(rect.width))
    setStyleLength(box, "height", Math.round(rect.height))
  }

  function positionViewer(): void {
    if (!viewer || !viewerTarget || !viewerTarget.isConnected) {
      return
    }

    const rect = viewerTarget.getBoundingClientRect()
    // Measured size, not design constants: CSS caps the viewer at
    // min(320px, 100vw - 32px) and height follows content. jsdom has no
    // layout and reports 0, hence the constant fallbacks.
    const width = viewer.offsetWidth || VIEWER_WIDTH
    const height = viewer.offsetHeight || VIEWER_HEIGHT
    const vv = window.visualViewport
    const viewportWidth = (vv ? vv.width * vv.scale : 0) || window.innerWidth || document.documentElement.clientWidth || width
    const viewportHeight = (vv ? vv.height * vv.scale : 0) || window.innerHeight || document.documentElement.clientHeight || height
    const maxLeft = Math.max(VIEWER_MARGIN, viewportWidth - width - VIEWER_MARGIN)
    const maxTop = Math.max(VIEWER_MARGIN, viewportHeight - height - VIEWER_MARGIN)

    // Placement ladder: beside the target (right, then left); when a reflow
    // makes the target span the viewport - the normal responsive case after
    // a display-ratio change - fall through to below, then above, hanging
    // off the pin corner. Only a viewport too small for any slot degrades to
    // a clamped overlap. The viewer must always stay visually attached to
    // its pin, never park at a far-away margin.
    const rightLeft = rect.right + VIEWER_GAP
    const leftLeft = rect.left - width - VIEWER_GAP
    const belowTop = rect.bottom + VIEWER_GAP
    const aboveTop = rect.top - height - VIEWER_GAP
    let left: number
    let top: number

    if (rightLeft <= maxLeft) {
      left = rightLeft
      top = clamp(rect.top, VIEWER_MARGIN, maxTop)
    } else if (leftLeft >= VIEWER_MARGIN) {
      left = leftLeft
      top = clamp(rect.top, VIEWER_MARGIN, maxTop)
    } else if (belowTop <= maxTop) {
      left = clamp(rect.right - width, VIEWER_MARGIN, maxLeft)
      top = belowTop
    } else if (aboveTop >= VIEWER_MARGIN) {
      left = clamp(rect.right - width, VIEWER_MARGIN, maxLeft)
      top = aboveTop
    } else {
      left = clamp(rightLeft, VIEWER_MARGIN, maxLeft)
      top = clamp(rect.top, VIEWER_MARGIN, maxTop)
    }

    setPosition(viewer, left, top)
  }

  return {
    host,
    mount,
    unmount,
    update,
    reposition,
  }
}

function createDiv(className: string): HTMLDivElement {
  const element = document.createElement("div")
  element.className = className
  return element
}

// Geometry runs every animation frame in real browsers; only touch the
// style object when a value actually changed so steady frames stay free of
// style invalidation.
function setPosition(element: HTMLElement, left: number, top: number): void {
  setStyleLength(element, "left", Math.round(left))
  setStyleLength(element, "top", Math.round(top))
}

function setStyleLength(element: HTMLElement, property: "left" | "top" | "width" | "height", value: number): void {
  const next = `${value}px`

  if (element.style[property] !== next) {
    element.style[property] = next
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

const styles = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #101828;
  --prooflet-accent: #0d99ff;
  --prooflet-accent-hover: #007be5;
  --prooflet-accent-soft: rgba(13, 153, 255, 0.1);
  --prooflet-accent-ring: rgba(13, 153, 255, 0.18);
  --prooflet-border: rgba(16, 24, 40, 0.08);
  --prooflet-border-strong: rgba(16, 24, 40, 0.14);
  --prooflet-text: #101828;
  --prooflet-text-secondary: #354052;
  --prooflet-text-tertiary: #676f83;
  --prooflet-muted: #98a2b2;
  --prooflet-surface: rgba(255, 255, 255, 0.96);
  --prooflet-surface-alt: #f9fafb;
  --prooflet-input: rgba(200, 206, 218, 0.25);
  --prooflet-shadow-sm: 0 1px 2px rgba(9, 9, 11, 0.04);
  --prooflet-shadow-lg: 0 20px 56px rgba(9, 9, 11, 0.12), 0 1px 2px rgba(9, 9, 11, 0.04);
}
* {
  box-sizing: border-box;
}
[hidden] {
  display: none !important;
}
button,
input,
textarea {
  font: inherit;
}
button {
  appearance: none;
}
.root {
  position: fixed;
  inset: 0;
  pointer-events: none;
}
.root.is-disabled .dock {
  display: none;
}
.layer {
  position: absolute;
  inset: 0;
}
.pin {
  position: fixed;
  width: 22px;
  height: 22px;
  border: 2px solid rgba(255, 255, 255, 0.95);
  border-radius: 999px;
  background: var(--prooflet-accent);
  color: #fff;
  font-size: 11px;
  font-weight: 650;
  line-height: 1;
  box-shadow: 0 4px 10px rgba(13, 153, 255, 0.22);
  cursor: pointer;
  pointer-events: auto;
}
.pin-weak {
  background: #f79009;
  box-shadow: 0 4px 10px rgba(247, 144, 9, 0.2);
}
.pin-stale {
  background: #98a2b2;
  box-shadow: 0 4px 10px rgba(16, 24, 40, 0.12);
}
.hover-box,
.selected-box {
  position: fixed;
  border-radius: 8px;
  pointer-events: none;
}
.hover-box {
  border: 1px solid rgba(13, 153, 255, 0.72);
  background: rgba(13, 153, 255, 0.08);
}
.selected-box {
  border: 2px solid rgba(13, 153, 255, 0.84);
  background: rgba(13, 153, 255, 0.07);
}
.dock {
  position: fixed;
  right: 16px;
  bottom: 16px;
  width: 276px;
  border: 0.5px solid var(--prooflet-border);
  border-radius: 12px;
  background: var(--prooflet-surface);
  box-shadow: var(--prooflet-shadow-lg);
  padding: 8px;
  pointer-events: auto;
  backdrop-filter: blur(12px);
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 650;
  line-height: 18px;
  color: var(--prooflet-text);
  padding: 2px 2px 0;
}
.mark {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--prooflet-accent);
  box-shadow: 0 0 0 3px var(--prooflet-accent-ring);
}
.count {
  margin-left: auto;
  min-width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--prooflet-accent-soft);
  color: var(--prooflet-accent-hover);
  display: inline-grid;
  place-items: center;
  font-size: 11px;
  font-weight: 650;
}
.actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.actions button,
.editor-actions button,
.stale-item button {
  border: 0.5px solid var(--prooflet-border-strong);
  border-radius: 8px;
  min-height: 32px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--prooflet-text-secondary);
  cursor: pointer;
  transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease;
}
.actions button {
  flex: 1;
}
.primary {
  border-color: rgba(16, 24, 40, 0.04) !important;
  background: var(--prooflet-accent);
  color: #fff;
  box-shadow: var(--prooflet-shadow-sm);
}
.primary:hover {
  background: var(--prooflet-accent-hover);
}
.secondary {
  background: rgba(255, 255, 255, 0.95);
  color: var(--prooflet-text-secondary);
  box-shadow: var(--prooflet-shadow-sm);
}
.secondary:hover {
  background: var(--prooflet-surface-alt);
  border-color: rgba(16, 24, 40, 0.2);
}
.danger {
  background: #fff;
  color: #d92d20;
}
.danger:hover {
  background: #fef3f2;
  border-color: rgba(240, 68, 56, 0.25);
}
.storage-note {
  margin-top: 8px;
  border: 0.5px solid rgba(240, 68, 56, 0.25);
  border-radius: 8px;
  background: #fef3f2;
  color: #d92d20;
  padding: 7px 8px;
  font-size: 12px;
  line-height: 1.4;
}
.stale-list {
  display: grid;
  gap: 8px;
  max-height: 260px;
  margin-top: 8px;
  overflow: auto;
}
.stale-item {
  display: grid;
  gap: 6px;
  border: 0.5px solid var(--prooflet-border);
  border-radius: 10px;
  background: var(--prooflet-surface-alt);
  padding: 8px;
}
.stale-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.stale-item strong {
  font-size: 12px;
  font-weight: 650;
  color: var(--prooflet-text);
}
.stale-item p {
  margin: 0;
  color: var(--prooflet-text-secondary);
  font-size: 12px;
  line-height: 1.4;
}
.stale-item span {
  color: var(--prooflet-text-tertiary);
  font-size: 12px;
}
.stale-actions {
  display: flex;
  gap: 6px;
}
.stale-actions button {
  min-height: 26px;
  padding: 0 9px;
}
.viewer {
  position: fixed;
  width: min(320px, calc(100vw - 32px));
  border: 0.5px solid var(--prooflet-border);
  border-radius: 12px;
  background: var(--prooflet-surface);
  box-shadow: var(--prooflet-shadow-lg);
  padding: 12px;
  pointer-events: auto;
  backdrop-filter: blur(12px);
}
.viewer-head,
.viewer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.viewer-head {
  justify-content: flex-end;
}
.viewer h2 {
  margin: 10px 0 5px;
  color: var(--prooflet-text);
  font-size: 14px;
  font-weight: 650;
  line-height: 1.25;
}
.viewer p {
  margin: 0;
  color: var(--prooflet-text-secondary);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
}
.viewer-actions {
  justify-content: flex-end;
  margin-top: 12px;
}
.viewer-actions button {
  border: 0.5px solid var(--prooflet-border-strong);
  border-radius: 8px;
  min-height: 30px;
  padding: 0 10px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.health {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  border-radius: 6px;
  background: var(--prooflet-accent-soft);
  color: var(--prooflet-accent-hover);
  padding: 0 7px;
  font-size: 10px;
  font-weight: 650;
  text-transform: uppercase;
}
.health-stale {
  background: rgba(16, 24, 40, 0.04);
  color: #676f83;
}
.scrim {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(242, 244, 247, 0.82);
  pointer-events: auto;
  backdrop-filter: blur(2px);
}
.editor {
  width: min(440px, calc(100vw - 32px));
  border: 0.5px solid var(--prooflet-border);
  border-radius: 12px;
  background: var(--prooflet-surface);
  box-shadow: var(--prooflet-shadow-lg);
  padding: 16px;
  backdrop-filter: blur(12px);
}
.editor-head {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 8px;
}
.editor-head strong {
  font-size: 14px;
  font-weight: 650;
  color: var(--prooflet-text);
}
.editor label {
  display: grid;
  gap: 6px;
  margin-top: 12px;
}
.editor label span {
  color: var(--prooflet-text-secondary);
  font-size: 13px;
  font-weight: 600;
}
.editor input,
.editor textarea {
  width: 100%;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--prooflet-text);
  background: var(--prooflet-input);
  padding: 8px 11px;
  font-size: 13px;
  line-height: 20px;
  outline: none;
  transition: background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
}
.editor input {
  min-height: 34px;
}
.editor input:focus,
.editor textarea:focus {
  border-color: #d0d5dc;
  background: var(--prooflet-surface-alt);
  box-shadow: 0 0 0 3px var(--prooflet-accent-ring);
}
.editor input::placeholder,
.editor textarea::placeholder {
  color: var(--prooflet-muted);
}
.editor-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}
.editor-actions span {
  flex: 1;
}
.icon-button {
  width: 30px;
  height: 30px;
  border: 0.5px solid var(--prooflet-border-strong);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.95);
  color: var(--prooflet-text-tertiary);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  box-shadow: var(--prooflet-shadow-sm);
}
.icon-button:hover {
  background: var(--prooflet-surface-alt);
  color: var(--prooflet-text-secondary);
}
button:focus-visible,
input:focus-visible,
textarea:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--prooflet-accent-ring);
}
`
