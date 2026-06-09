import { createAnchor, isSelectableElement, resolveAnchor } from "./anchor.js"
import { createOverlay, type Overlay } from "./overlay.js"
import { createStore } from "./storage.js"
import type { ProofletConfig, ProofletController, ProofletDraft, ProofletRecord } from "./types.js"

export function createController(config: ProofletConfig): ProofletController {
  assertBrowser()
  assertConfig(config)

  let mounted = false
  let enabled = config.enabled ?? true
  let editMode = false
  let hoveredTarget: Element | null = null
  let selectedTarget: Element | null = null
  let documentProoflets: ProofletRecord[] = []
  let store: ReturnType<typeof createStore>
  let overlay: Overlay

  function mount(): void {
    if (mounted) {
      return
    }

    store = createStore(config.projectId, config.storageKey)
    documentProoflets = store.load().prooflets
    overlay = createOverlay({
      onEnterEditMode: enterEditMode,
      onExitEditMode: exitEditMode,
      onSaveDraft: saveDraft,
      onUpdateProoflet: updateProoflet,
      onDeleteProoflet: deleteProoflet,
      onCancelEditor: cancelEditor,
    })
    overlay.mount()
    mounted = true
    window.addEventListener("resize", render)
    window.addEventListener("scroll", render, true)
    render()
  }

  function unmount(): void {
    if (!mounted) {
      return
    }

    exitEditMode()
    window.removeEventListener("resize", render)
    window.removeEventListener("scroll", render, true)
    overlay.unmount()
    mounted = false
  }

  function enterEditMode(): void {
    if (!mounted || !enabled || editMode) {
      return
    }

    editMode = true
    document.addEventListener("mousemove", handlePointerMove, true)
    document.addEventListener("click", handleDocumentClick, true)
    document.addEventListener("keydown", handleKeydown, true)
    render()
  }

  function exitEditMode(): void {
    if (!editMode) {
      return
    }

    editMode = false
    hoveredTarget = null
    selectedTarget = null
    document.removeEventListener("mousemove", handlePointerMove, true)
    document.removeEventListener("click", handleDocumentClick, true)
    document.removeEventListener("keydown", handleKeydown, true)
    render()
  }

  function setEnabled(nextEnabled: boolean): void {
    enabled = nextEnabled

    if (!enabled) {
      exitEditMode()
    }

    render()
  }

  function handlePointerMove(event: MouseEvent): void {
    if (!enabled || !editMode || selectedTarget) {
      return
    }

    const target = event.target instanceof Element ? event.target : null
    hoveredTarget = target && isSelectableElement(target, overlay.host) ? target : null
    render()
  }

  function handleDocumentClick(event: MouseEvent): void {
    if (!enabled || !editMode || selectedTarget || !hoveredTarget) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const existing = findExistingProofletForTarget(hoveredTarget)
    selectedTarget = existing?.resolved.element ?? hoveredTarget
    hoveredTarget = null

    if (existing) {
      overlay.openEditEditor(existing.record)
    } else {
      overlay.openCreateEditor()
    }

    render()
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault()

      if (selectedTarget) {
        overlay.closeEditor()
      } else {
        exitEditMode()
      }
    }
  }

  function saveDraft(draft: ProofletDraft): void {
    if (!selectedTarget) {
      return
    }

    const now = new Date().toISOString()
    const next: ProofletRecord = {
      id: createId(),
      status: "active",
      anchor: createAnchor(selectedTarget),
      title: draft.title,
      body: draft.body,
      placement: "auto",
      tags: [],
      createdAt: now,
      updatedAt: now,
    }

    documentProoflets = store.replace([...documentProoflets, next]).prooflets
    cancelEditor()
  }

  function updateProoflet(id: string, draft: ProofletDraft): void {
    const now = new Date().toISOString()
    documentProoflets = store.replace(
      documentProoflets.map((prooflet) =>
        prooflet.id === id
          ? {
              ...prooflet,
              title: draft.title,
              body: draft.body,
              updatedAt: now,
            }
          : prooflet,
        ),
    ).prooflets
    cancelEditor()
  }

  function deleteProoflet(id: string): void {
    documentProoflets = store.replace(documentProoflets.filter((prooflet) => prooflet.id !== id)).prooflets
    cancelEditor()
  }

  function findExistingProofletForTarget(target: Element): { record: ProofletRecord; resolved: ReturnType<typeof resolveAnchor> } | null {
    let match: { record: ProofletRecord; resolved: ReturnType<typeof resolveAnchor> } | null = null

    for (const record of documentProoflets) {
      if (record.status === "hidden") {
        continue
      }

      const resolved = resolveAnchor(record.anchor)
      const element = resolved.element

      if (!element || (element !== target && !element.contains(target))) {
        continue
      }

      if (!match || resolved.confidence > match.resolved.confidence || (resolved.confidence === match.resolved.confidence && record.updatedAt > match.record.updatedAt)) {
        match = { record, resolved }
      }
    }

    return match
  }

  function cancelEditor(): void {
    selectedTarget = null
    hoveredTarget = null
    render()
  }

  function render(): void {
    if (!mounted) {
      return
    }

    overlay.render({
      enabled,
      editMode,
      selectedTarget,
      hoveredTarget,
      prooflets: documentProoflets.map((record) => {
        const resolved = resolveAnchor(record.anchor)

        return {
          record: {
            ...record,
            status: resolved.health === "stale" ? "stale" : record.status === "stale" ? "active" : record.status,
          },
          resolved,
        }
      }),
    })
  }

  return {
    mount,
    unmount,
    enterEditMode,
    exitEditMode,
    setEnabled,
  }
}

function assertBrowser(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Prooflet can only be mounted in a browser environment.")
  }
}

function assertConfig(config: ProofletConfig): void {
  if (!config.projectId || !config.projectId.trim()) {
    throw new Error("Prooflet requires a non-empty projectId.")
  }
}

function createId(): string {
  if ("crypto" in window && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID()
  }

  return `prooflet_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}
