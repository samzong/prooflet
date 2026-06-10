# Prooflet Maintenance Golden Path

This document is the architecture contract for daily maintenance. If a change
fights one of these rules, the change is wrong or the rule must be revised
explicitly — never silently. For the visual map of modules, render paths,
and anchor resolution, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Invariants (never break)

1. **Host safety first.** Prooflet must never break, restyle, or intercept the
   host prototype outside annotation mode. All Prooflet UI lives inside one
   shadow root. A single broken anchor or storage failure must degrade
   gracefully, never throw into the host page.
2. **Anchors are conservative.** An anchor may be `weak` or `stale`, but it
   must never visibly bind to the wrong element. `resolveAnchor` requires an
   identity-level signal match (`hasIdentityMatch`) before accepting any
   candidate. Do not lower this bar to make anchors "stickier".
3. **Annotation content never enters host code.** Records live in
   `localStorage` (V1) behind the store boundary, nowhere else.
4. **Derived state is never persisted.** Anchor health is computed at render
   time. `ProofletRecord` holds only authored facts (id, anchor, title, body,
   timestamps). Do not add status/health/layout fields to the persisted record.
5. **Public API stays small.** The package exports exactly `prooflet`,
   `mountProoflet`, and the types `ProofletConfig`, `ProofletController`,
   `ProofletDocument`, `ProofletRecord`, `ProofletAnchor`. Internal modules
   (anchor, storage, overlay, controller) must not be re-exported from
   `index.ts`. Any change to this surface is a breaking change: it requires a
   version bump (0.x: bump minor), plus README/SPEC review. There is a test
   pinning the runtime export list (`test/api.test.ts`).

## Module responsibilities

| Module          | Owns                                                          | Must not do |
| --------------- | ------------------------------------------------------------- | ----------- |
| `types.ts`      | Public types and the persisted schema                          | Runtime logic |
| `anchor.ts`     | Pure create/resolve/score of anchors against the live DOM      | Hold state, touch storage or overlay |
| `storage.ts`    | Load/sanitize/persist the project document                     | Know about DOM elements, resolution, or UI |
| `controller.ts` | **All** runtime state and transitions; host event wiring       | Build DOM markup |
| `overlay.ts`    | Stateless view inside the shadow root; emits intents           | Decide state; read storage; resolve anchors |

State flows one way: intent → controller transition → `push()`/`refresh()` →
`overlay.update(state)`. The overlay never decides or mutates runtime state.
Intents are plain synchronous callbacks fired from DOM events, and the
controller does re-render synchronously inside them. That is safe only
because of two overlay properties: click handling is delegated on the shadow
root (nodes rebuilt mid-dispatch keep working), and stateful nodes like the
editor are session-keyed, never rebuilt while their session is open. Keep
both properties when adding UI.

## The render paths (performance contract)

- `refresh()` — re-resolves every anchor against the DOM, then updates the
  overlay. Allowed triggers: data changes, `resize`, debounced host DOM
  mutations (MutationObserver), enable/disable.
- `push()` — re-renders from cached resolutions. Allowed triggers: UI-only
  state changes (hover, viewer, editor, visibility).
- `overlay.reposition()` — geometry-only style writes. Runs every animation
  frame in real browsers (controller geometry loop) and on `scroll`/`resize`
  in environments without rAF (jsdom tests).

Layout can change without any catchable event — display-scale switches,
media-query reflows, CSS transitions, font and image loads. That is why
geometry is observed per frame instead of inferred from events; events only
drive anchor re-resolution. Two rules keep the loop affordable: reposition
must stay read-rect/write-style only (never resolve, never rebuild DOM), and
all style writes must go through the diffing helpers (`setPosition`/
`setStyleLength`) so steady frames write nothing.

Never wire `scroll` or `mousemove` to anchor resolution or DOM rebuilding.
This is what keeps Prooflet cheap enough to live inside a real prototype.

## Editor durability contract

The editor form is created once per editor session (keyed by
`EditorSession.key`) and is never rebuilt while the session is open. Unsaved
input must survive scroll, resize, and any re-render. For new prooflets the
anchor is captured at selection time, so saving never depends on the target
element still being attached: if the host re-renders the target away while
the user is typing, the draft still lands as a weak/stale prooflet instead
of being silently dropped. Tests in `test/runtime.test.ts` pin both
guarantees; keep them passing.

## How to change each area

- **Anchor logic** (`anchor.ts`): keep functions pure. Any new matching signal
  needs: a score weight, an entry in `hasIdentityMatch` only if it identifies
  the element (not just describes it), and a test proving it does not cause
  wrong binding on structurally similar elements. Every dynamic selector goes
  through `safeQuerySelector`/`queryByAttribute` — raw `querySelector` with
  interpolated host content is forbidden.
- **Storage** (`storage.ts`): schema changes require either staying tolerant
  within `schemaVersion: 1` (sanitizer ignores unknown, fills missing) or a
  new schema version with explicit migration in `load()`. Writes must never
  throw; report failure through the `persisted` flag.
- **Overlay** (`overlay.ts`): add UI by extending `OverlayState` +
  `OverlayIntents`, then rendering in the matching `sync*` function. Keep the
  structural-update / reposition split. Inputs and other stateful nodes must
  be session-keyed like the editor, not rebuilt per update. Floating surfaces
  must be placed from measured size (`offsetWidth`/`offsetHeight`) and live
  viewport metrics, never from design constants — constants drift from the
  rendered size when the viewport ratio changes. The viewer placement ladder
  is right → left → below → above → clamped overlap; anchored UI must stay
  visually attached to its pin and never park at a far-away margin.
- **Controller** (`controller.ts`): every new behavior is a named transition
  function that ends in `push()` or `refresh()`. Host-document listeners must
  be bound only while needed (edit mode, open editor) and removed
  symmetrically.
- **Public API** (`index.ts`, `types.ts`): treat as frozen for 0.x. Breaking
  changes need a versioned release and README/SPEC updates.

## Forbidden

- Persisting derived state (anchor health, positions, resolution results).
- Rendering Prooflet UI outside the shadow root, or importing host CSS in.
- Intercepting host events outside annotation mode.
- Lowering the anchor identity-match requirement.
- Implementing V2 surfaces in V1: dashboard, cloud sync, auth, collaboration,
  export/import, browser extension, backend calls, framework wrappers. The
  store interface (`load`/`replace`) is the future sync seam; leave it narrow.

## Verification loop

Every change, before commit:

```bash
pnpm verify        # typecheck + tests + package build
```

For overlay/controller changes also run the demo (`pnpm dev`) and manually
check: annotate → save → refresh page → pin restored; edit an element away →
stale card appears in dock; host buttons still work outside annotation mode.

New behavior needs a test in `test/`. Bug fixes need a test that fails
before the fix. Do not claim a change safe without a fresh `pnpm verify`.
