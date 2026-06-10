import { createAnchor, isSelectableElement, resolveAnchor } from "./anchor.js"
import { createOverlay, type Overlay, type OverlayItem } from "./overlay.js"
import { createStore, type ProofletStore } from "./storage.js"
import type { ProofletAnchor, ProofletConfig, ProofletController, ProofletDraft, ProofletRecord, ResolvedAnchor } from "./types.js"

const HOVER_CLOSE_DELAY_MS = 160
const MUTATION_DEBOUNCE_MS = 150

type EditorState = {
  key: number
  mode: "create" | "edit"
  recordId: string | null
  target: Element | null
  // Captured at selection time. Saving a new prooflet must never depend on
  // the live element: a host re-render can detach the target while the user
  // is typing, and the draft still has to land as a weak/stale record.
  anchor: ProofletAnchor | null
  initialTitle: string
  initialBody: string
}

type ViewerState = {
  id: string
  pinned: boolean
}

/**
 * The controller is the single owner of runtime state. The overlay is a
 * stateless view; storage is a dumb document store; the anchor module is a
 * pure resolver. Every state change flows through push() or refresh().
 *
 * Two update paths keep the host cheap to live in:
 * - refresh(): re-resolve all anchors against the live DOM, then push.
 *   Runs on data changes, resize, and debounced host DOM mutations.
 * - push(): re-render from cached resolutions. Runs on UI-only changes.
 * - scroll never re-resolves or rebuilds DOM; it only repositions geometry.
 */
export function createController(config: ProofletConfig): ProofletController {
  assertBrowser()
  assertConfig(config)

  let mounted = false
  let enabled = config.enabled ?? true
  let editMode = false
  let records: ProofletRecord[] = []
  let items: OverlayItem[] = []
  let resolutions = new Map<string, ResolvedAnchor>()
  let hoveredTarget: Element | null = null
  let editor: EditorState | null = null
  let viewer: ViewerState | null = null
  let proofletsVisible = true
  let storageHealthy = true
  let editorKeySequence = 0
  let hoverCloseTimer: ReturnType<typeof window.setTimeout> | null = null
  let mutationTimer: ReturnType<typeof window.setTimeout> | null = null
  let keydownBound = false
  let observer: MutationObserver | null = null
  let geometryFrame: number | null = null
  let store: ProofletStore
  let overlay: Overlay

  function mount(): void {
    if (mounted) {
      return
    }

    store = createStore(config.projectId, config.storageKey)
    records = store.load().prooflets
    overlay = createOverlay({
      onEnterEditMode: enterEditMode,
      onExitEditMode: exitEditMode,
      onToggleVisibility: toggleVisibility,
      onPinHover: hoverPin,
      onPinLeave: scheduleViewerClose,
      onPinActivate: activatePin,
      onViewerHover: clearHoverCloseTimer,
      onViewerLeave: scheduleViewerClose,
      onCloseViewer: closeViewer,
      onEditRecord: editRecord,
      onDeleteRecord: deleteRecord,
      onSubmitEditor: submitEditor,
      onCancelEditor: closeEditor,
    })
    overlay.mount()
    mounted = true
    window.addEventListener("resize", handleResize)
    window.addEventListener("scroll", handleScroll, true)
    observer = new MutationObserver(scheduleMutationRefresh)
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })
    startGeometryLoop()
    refresh()
  }

  // Layout can change without any catchable event: display-scale switches,
  // media-query reflows, CSS transitions, font and image loads. Events are
  // only used for anchor re-resolution; geometry is observed directly every
  // frame and converges within one frame no matter what moved the page.
  // Writes are diffed in the overlay, so steady frames cost a few rect reads.
  function startGeometryLoop(): void {
    if (typeof window.requestAnimationFrame !== "function") {
      return
    }

    const tick = (): void => {
      if (!mounted) {
        geometryFrame = null
        return
      }

      overlay.reposition()
      geometryFrame = window.requestAnimationFrame(tick)
    }

    geometryFrame = window.requestAnimationFrame(tick)
  }

  function unmount(): void {
    if (!mounted) {
      return
    }

    observer?.disconnect()
    observer = null

    if (geometryFrame !== null) {
      window.cancelAnimationFrame(geometryFrame)
      geometryFrame = null
    }

    clearHoverCloseTimer()

    if (mutationTimer !== null) {
      window.clearTimeout(mutationTimer)
      mutationTimer = null
    }

    editor = null
    viewer = null
    exitEditModeInternal()
    syncKeydownListener()
    window.removeEventListener("resize", handleResize)
    window.removeEventListener("scroll", handleScroll, true)
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
    syncKeydownListener()
    push()
  }

  function exitEditMode(): void {
    if (!editMode) {
      return
    }

    exitEditModeInternal()
    syncKeydownListener()
    push()
  }

  function exitEditModeInternal(): void {
    if (!editMode) {
      return
    }

    editMode = false
    hoveredTarget = null
    document.removeEventListener("mousemove", handlePointerMove, true)
    document.removeEventListener("click", handleDocumentClick, true)
  }

  function setEnabled(nextEnabled: boolean): void {
    enabled = nextEnabled

    if (!enabled) {
      exitEditModeInternal()
      editor = null
      viewer = null
      clearHoverCloseTimer()
      syncKeydownListener()
    }

    refresh()
  }

  function handleResize(): void {
    refresh()
  }

  function handleScroll(): void {
    if (mounted) {
      overlay.reposition()
    }
  }

  function scheduleMutationRefresh(): void {
    // Mutation callbacks are async: they can arrive after the environment is
    // torn down or after the host removed our root node. Never act on a page
    // we are no longer rendered into.
    if (typeof window === "undefined" || !mounted || mutationTimer !== null || !overlay.host.isConnected) {
      return
    }

    mutationTimer = window.setTimeout(() => {
      mutationTimer = null
      refresh()
    }, MUTATION_DEBOUNCE_MS)
  }

  function handlePointerMove(event: MouseEvent): void {
    if (!enabled || !editMode || editor) {
      return
    }

    const target = event.target instanceof Element ? event.target : null
    hoveredTarget = target && isSelectableElement(target, overlay.host) ? target : null
    push()
  }

  function handleDocumentClick(event: MouseEvent): void {
    if (!enabled || !editMode || editor || !hoveredTarget) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const existing = findExistingForTarget(hoveredTarget)

    if (existing) {
      openEditor("edit", existing.record, existing.resolved.element)
    } else {
      openEditor("create", null, hoveredTarget)
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape") {
      return
    }

    if (editor) {
      event.preventDefault()
      event.stopPropagation()
      closeEditor()
      return
    }

    if (editMode) {
      event.preventDefault()
      exitEditMode()
    }
  }

  function syncKeydownListener(): void {
    const shouldBind = mounted && (editMode || editor !== null)

    if (shouldBind && !keydownBound) {
      document.addEventListener("keydown", handleKeydown, true)
      keydownBound = true
    } else if (!shouldBind && keydownBound) {
      document.removeEventListener("keydown", handleKeydown, true)
      keydownBound = false
    }
  }

  function openEditor(mode: "create" | "edit", record: ProofletRecord | null, target: Element | null): void {
    editorKeySequence += 1
    editor = {
      key: editorKeySequence,
      mode,
      recordId: record?.id ?? null,
      target,
      anchor: mode === "create" && target ? createAnchor(target) : null,
      initialTitle: record?.title ?? "",
      initialBody: record?.body ?? "",
    }
    hoveredTarget = null
    viewer = null
    clearHoverCloseTimer()
    syncKeydownListener()
    push()
  }

  function closeEditor(): void {
    if (!editor) {
      return
    }

    editor = null
    hoveredTarget = null
    syncKeydownListener()
    push()
  }

  function submitEditor(draft: ProofletDraft): void {
    if (!editor) {
      return
    }

    const now = new Date().toISOString()

    if (editor.mode === "edit" && editor.recordId) {
      const recordId = editor.recordId
      setRecords(
        records.map((record) =>
          record.id === recordId
            ? {
                ...record,
                title: draft.title,
                body: draft.body,
                updatedAt: now,
              }
            : record,
        ),
      )
    } else if (editor.anchor) {
      setRecords([
        ...records,
        {
          id: createId(),
          anchor: editor.anchor,
          title: draft.title,
          body: draft.body,
          createdAt: now,
          updatedAt: now,
        },
      ])
    }

    editor = null
    hoveredTarget = null
    syncKeydownListener()
    refresh()
  }

  function editRecord(id: string): void {
    const record = records.find((entry) => entry.id === id)

    if (!record) {
      return
    }

    openEditor("edit", record, resolutions.get(id)?.element ?? null)
  }

  function deleteRecord(id: string): void {
    if (viewer?.id === id) {
      viewer = null
      clearHoverCloseTimer()
    }

    if (editor?.recordId === id) {
      editor = null
      syncKeydownListener()
    }

    setRecords(records.filter((record) => record.id !== id))
    refresh()
  }

  function toggleVisibility(): void {
    proofletsVisible = !proofletsVisible
    viewer = null
    clearHoverCloseTimer()
    push()
  }

  function hoverPin(id: string): void {
    if (viewer?.pinned) {
      return
    }

    clearHoverCloseTimer()
    viewer = { id, pinned: false }
    push()
  }

  function activatePin(id: string): void {
    clearHoverCloseTimer()
    viewer = { id, pinned: true }
    push()
  }

  function closeViewer(): void {
    clearHoverCloseTimer()
    viewer = null
    push()
  }

  function scheduleViewerClose(): void {
    if (!viewer || viewer.pinned) {
      return
    }

    clearHoverCloseTimer()
    hoverCloseTimer = window.setTimeout(() => {
      hoverCloseTimer = null
      viewer = null
      push()
    }, HOVER_CLOSE_DELAY_MS)
  }

  function clearHoverCloseTimer(): void {
    if (hoverCloseTimer !== null) {
      window.clearTimeout(hoverCloseTimer)
      hoverCloseTimer = null
    }
  }

  function findExistingForTarget(target: Element): { record: ProofletRecord; resolved: ResolvedAnchor } | null {
    let match: { record: ProofletRecord; resolved: ResolvedAnchor } | null = null

    for (const record of records) {
      const resolved = resolutions.get(record.id)
      const element = resolved?.element

      if (!resolved || !element || (element !== target && !element.contains(target))) {
        continue
      }

      if (!match || resolved.confidence > match.resolved.confidence || (resolved.confidence === match.resolved.confidence && record.updatedAt > match.record.updatedAt)) {
        match = { record, resolved }
      }
    }

    return match
  }

  function setRecords(next: ProofletRecord[]): void {
    const result = store.replace(next)
    storageHealthy = result.persisted
    records = result.document.prooflets
  }

  function refresh(): void {
    if (!mounted) {
      return
    }

    resolutions = new Map(records.map((record) => [record.id, safeResolve(record.anchor)]))
    items = records.map((record) => ({
      record,
      resolved: resolutions.get(record.id) ?? { health: "stale", element: null, confidence: 0 },
    }))
    push()
  }

  function push(): void {
    if (!mounted) {
      return
    }

    overlay.update({
      enabled,
      editMode,
      items,
      proofletsVisible,
      storageHealthy,
      hoveredTarget,
      selectedTarget: editor?.target ?? null,
      viewerId: viewer?.id ?? null,
      editor,
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

// Containment boundary: a single broken anchor must degrade to "stale",
// never break the whole overlay or the host page.
function safeResolve(anchor: ProofletRecord["anchor"]): ResolvedAnchor {
  try {
    return resolveAnchor(anchor)
  } catch {
    return { health: "stale", element: null, confidence: 0 }
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
