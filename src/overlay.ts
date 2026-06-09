import type { ProofletDraft, ProofletRecord, ResolvedAnchor } from "./types.js"

type OverlayCallbacks = {
  onEnterEditMode(): void
  onExitEditMode(): void
  onSaveDraft(draft: ProofletDraft): void
  onUpdateProoflet(id: string, draft: ProofletDraft): void
  onDeleteProoflet(id: string): void
  onCancelEditor(): void
}

type RenderState = {
  enabled: boolean
  editMode: boolean
  prooflets: Array<{
    record: ProofletRecord
    resolved: ResolvedAnchor
  }>
  selectedTarget: Element | null
  hoveredTarget: Element | null
}

export type Overlay = {
  host: HTMLElement
  mount(): void
  unmount(): void
  render(state: RenderState): void
  openCreateEditor(): void
  openEditEditor(record: ProofletRecord): void
  closeEditor(): void
}

export function createOverlay(callbacks: OverlayCallbacks): Overlay {
  const host = document.createElement("div")
  const shadow = host.attachShadow({ mode: "open" })
  let state: RenderState | null = null
  let draftOpen = false
  let editingProoflet: ProofletRecord | null = null
  let hoveredProofletId: string | null = null
  let lockedProofletId: string | null = null
  let hoverCloseTimer: ReturnType<typeof window.setTimeout> | null = null
  let proofletsVisible = true

  host.id = "prooflet-root"
  host.setAttribute("data-prooflet-root", "")

  function mount(): void {
    document.documentElement.appendChild(host)
  }

  function unmount(): void {
    document.removeEventListener("keydown", handleEditorKeydown, true)
    host.remove()
  }

  function render(nextState: RenderState): void {
    state = nextState
    shadow.innerHTML = buildMarkup(nextState, draftOpen, lockedProofletId ?? hoveredProofletId, proofletsVisible, editingProoflet)
    bindEvents()
  }

  function openCreateEditor(): void {
    draftOpen = true
    editingProoflet = null
    clearActiveProoflet()

    if (state) {
      render(state)
    }
  }

  function openEditEditor(record: ProofletRecord): void {
    draftOpen = true
    editingProoflet = record
    clearActiveProoflet()

    if (state) {
      render(state)
    }
  }

  function closeEditor(): void {
    draftOpen = false
    editingProoflet = null
    callbacks.onCancelEditor()

    if (state) {
      render(state)
    }
  }

  function clearHoverCloseTimer(): void {
    if (hoverCloseTimer) {
      window.clearTimeout(hoverCloseTimer)
      hoverCloseTimer = null
    }
  }

  function clearActiveProoflet(): void {
    clearHoverCloseTimer()
    hoveredProofletId = null
    lockedProofletId = null
  }

  function scheduleHoverClose(): void {
    if (lockedProofletId) {
      return
    }

    clearHoverCloseTimer()
    hoverCloseTimer = window.setTimeout(() => {
      hoverCloseTimer = null
      hoveredProofletId = null

      if (state) {
        render(state)
      }
    }, 160)
  }

  function handleEditorKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !shadow.querySelector("[data-prooflet-editor]")) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    closeEditor()
  }

  function bindEvents(): void {
    document.removeEventListener("keydown", handleEditorKeydown, true)

    if (shadow.querySelector("[data-prooflet-editor]")) {
      document.addEventListener("keydown", handleEditorKeydown, true)
    }

    shadow.querySelector<HTMLButtonElement>("[data-action='enter-edit']")?.addEventListener("click", callbacks.onEnterEditMode)
    shadow.querySelector<HTMLButtonElement>("[data-action='exit-edit']")?.addEventListener("click", callbacks.onExitEditMode)
    shadow.querySelector<HTMLButtonElement>("[data-action='cancel-editor']")?.addEventListener("click", closeEditor)
    shadow.querySelector<HTMLElement>(".scrim")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget && !isEditorDirty()) {
        closeEditor()
      }
    })
    shadow.querySelector<HTMLButtonElement>("[data-action='toggle-visibility']")?.addEventListener("click", () => {
      proofletsVisible = !proofletsVisible
      clearActiveProoflet()

      if (state) {
        render(state)
      }
    })

    for (const button of shadow.querySelectorAll<HTMLButtonElement>("[data-prooflet-id][data-action='edit']")) {
      button.addEventListener("click", () => {
        const id = button.dataset.proofletId
        const record = state?.prooflets.find((item) => item.record.id === id)?.record

        if (record) {
          openEditEditor(record)
        }
      })
    }

    for (const button of shadow.querySelectorAll<HTMLButtonElement>("[data-prooflet-id][data-action='view']")) {
      button.addEventListener("mouseenter", () => {
        if (lockedProofletId) {
          return
        }

        clearHoverCloseTimer()
        hoveredProofletId = button.dataset.proofletId ?? null

        if (state) {
          render(state)
        }
      })
      button.addEventListener("mouseleave", scheduleHoverClose)
      button.addEventListener("click", () => {
        clearHoverCloseTimer()
        lockedProofletId = button.dataset.proofletId ?? null
        hoveredProofletId = null

        if (state) {
          render(state)
        }
      })
    }

    shadow.querySelector<HTMLElement>(".viewer")?.addEventListener("mouseenter", clearHoverCloseTimer)
    shadow.querySelector<HTMLElement>(".viewer")?.addEventListener("mouseleave", scheduleHoverClose)
    shadow.querySelector<HTMLButtonElement>("[data-action='close-viewer']")?.addEventListener("click", () => {
      clearActiveProoflet()

      if (state) {
        render(state)
      }
    })

    for (const button of shadow.querySelectorAll<HTMLButtonElement>("[data-prooflet-id][data-action='delete']")) {
      button.addEventListener("click", () => {
        const id = button.dataset.proofletId

        if (id) {
          clearActiveProoflet()
          callbacks.onDeleteProoflet(id)
        }
      })
    }

    shadow.querySelector<HTMLFormElement>("[data-prooflet-editor]")?.addEventListener("submit", (event) => {
      event.preventDefault()

      const form = event.currentTarget as HTMLFormElement
      const formData = new FormData(form)
      const title = String(formData.get("title") ?? "").trim()
      const body = String(formData.get("body") ?? "").trim()

      if (!title && !body) {
        return
      }

      draftOpen = false

      const currentEditingProoflet = editingProoflet
      editingProoflet = null

      if (currentEditingProoflet) {
        callbacks.onUpdateProoflet(currentEditingProoflet.id, { title, body })
      } else {
        callbacks.onSaveDraft({ title, body })
      }
    })
  }

  function isEditorDirty(): boolean {
    const form = shadow.querySelector<HTMLFormElement>("[data-prooflet-editor]")

    if (!form) {
      return false
    }

    const formData = new FormData(form)
    const title = String(formData.get("title") ?? "")
    const body = String(formData.get("body") ?? "")

    return title !== (editingProoflet?.title ?? "") || body !== (editingProoflet?.body ?? "")
  }

  return {
    host,
    mount,
    unmount,
    render,
    openCreateEditor,
    openEditEditor,
    closeEditor,
  }
}

function buildMarkup(
  state: RenderState,
  draftOpen: boolean,
  activeProofletId: string | null,
  proofletsVisible: boolean,
  editingProoflet: ProofletRecord | null,
): string {
  if (!state.enabled) {
    return `
      <style>${styles}</style>
      <div class="root is-disabled"></div>
    `
  }

  const activeProoflets = state.prooflets.filter((item) => item.record.status !== "hidden")
  const visibleProoflets = proofletsVisible ? activeProoflets : []
  const activeItem = visibleProoflets.find((item) => item.record.id === activeProofletId)
  const anchoredActiveItem = activeItem?.resolved.element ? activeItem : null
  const pins = visibleProoflets
    .map((item, index) => {
      if (!item.resolved.element) {
        return ""
      }

      const rect = item.resolved.element.getBoundingClientRect()
      const health = item.resolved.health

      return `
        <button class="pin pin-${health}" style="left:${Math.round(rect.right - 12)}px;top:${Math.round(rect.top - 12)}px" data-prooflet-id="${escapeHtml(item.record.id)}" data-action="view" aria-label="${escapeHtml(item.record.title || "Prooflet")}">
          ${index + 1}
        </button>
      `
    })
    .join("")
  const hoverBox = state.hoveredTarget ? targetBox(state.hoveredTarget, "hover-box") : ""
  const selectedBox = state.selectedTarget ? targetBox(state.selectedTarget, "selected-box") : ""
  const staleList = visibleProoflets.filter((item) => item.resolved.health === "stale")
  const showEditor = draftOpen || Boolean(editingProoflet)

  return `
    <style>${styles}</style>
    <div class="root ${state.enabled ? "is-enabled" : "is-disabled"} ${state.editMode ? "is-editing" : ""}">
      <div class="layer">
        ${pins}
        ${hoverBox}
        ${selectedBox}
      </div>
      ${
        anchoredActiveItem
          ? `
            <section class="viewer" style="${viewerStyle(anchoredActiveItem.resolved.element!)}">
              <div class="viewer-head">
                <button type="button" class="icon-button" data-action="close-viewer" aria-label="Close prooflet">×</button>
              </div>
              <h2>${escapeHtml(anchoredActiveItem.record.title || "Untitled prooflet")}</h2>
              <p>${escapeHtml(anchoredActiveItem.record.body || "No narration yet.")}</p>
              <div class="viewer-actions">
                <button type="button" class="primary" data-prooflet-id="${escapeHtml(anchoredActiveItem.record.id)}" data-action="edit">Edit</button>
                <button type="button" class="danger" data-prooflet-id="${escapeHtml(anchoredActiveItem.record.id)}" data-action="delete">Delete</button>
              </div>
            </section>
          `
          : ""
      }
      <div class="dock">
        <div class="brand">
          <span class="mark"></span>
          <span>Prooflet</span>
          ${activeProoflets.length ? `<span class="count">${activeProoflets.length}</span>` : ""}
        </div>
        <div class="actions">
          ${
            state.editMode
              ? `<button type="button" class="primary" data-action="exit-edit">Done</button>`
              : `<button type="button" class="primary" data-action="enter-edit">Annotate</button>`
          }
          ${
            activeProoflets.length
              ? `<button type="button" class="secondary" data-action="toggle-visibility">${proofletsVisible ? "Hide" : "Show"}</button>`
              : ""
          }
        </div>
        ${
          staleList.length
            ? `<div class="stale-list">${staleList
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
      </div>
      ${
        showEditor
          ? `
            <div class="scrim">
              <form class="editor" data-prooflet-editor>
                <div class="editor-head">
                  <strong>${editingProoflet ? "Edit prooflet" : "New prooflet"}</strong>
                  <button type="button" class="icon-button" data-action="cancel-editor" aria-label="Close editor">×</button>
                </div>
                <label>
                  <span>Title</span>
                  <input name="title" value="${escapeHtml(editingProoflet?.title ?? "")}" placeholder="What should reviewers notice?" autofocus />
                </label>
                <label>
                  <span>Narration</span>
                  <textarea name="body" rows="6" placeholder="Explain the product intent, expected behavior, or caveat.">${escapeHtml(editingProoflet?.body ?? "")}</textarea>
                </label>
                <div class="editor-actions">
                  ${editingProoflet ? `<button type="button" class="danger" data-prooflet-id="${escapeHtml(editingProoflet.id)}" data-action="delete">Delete</button>` : ""}
                  <span></span>
                  <button type="submit" class="primary">Save</button>
                </div>
              </form>
            </div>
          `
          : ""
      }
    </div>
  `
}

function targetBox(element: Element, className: string): string {
  const rect = element.getBoundingClientRect()

  return `<div class="${className}" style="left:${Math.round(rect.left)}px;top:${Math.round(rect.top)}px;width:${Math.round(rect.width)}px;height:${Math.round(rect.height)}px"></div>`
}

function viewerStyle(element: Element): string {
  const rect = element.getBoundingClientRect()
  const width = 320
  const height = 190
  const gap = 12
  const margin = 12
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || width
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || height
  const rightSideLeft = rect.right + gap
  const leftSideLeft = rect.left - width - gap
  const left = rightSideLeft + width <= viewportWidth - margin ? rightSideLeft : Math.max(margin, leftSideLeft)
  const top = clamp(rect.top, margin, viewportHeight - height - margin)

  return `left:${Math.round(left)}px;top:${Math.round(top)}px`
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
.secondary,
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
.editor-head,
.editor-actions {
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
