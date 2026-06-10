# Prooflet Specification

Prooflet is an in-page proof layer for prototypes. It gives a live prototype its own third-person narration without making annotation content part of the host codebase.

## Positioning

Prooflet is not a design tool, dashboard, screenshot annotation app, or documentation site.

It is a portable runtime layer:

- installed as an npm package
- mounted inside any frontend prototype
- authored directly on the live page
- stored locally in V1
- designed to become cloud-syncable later

Tagline:

> The proof layer for prototypes.

Chinese product line:

> 让原型自己作证。

## Core Insight

Prototype annotation is not a comment system. It is the prototype's explainability layer.

A prototype needs a narrator because many product decisions are invisible in the UI: why a state exists, what a module proves, what should be reviewed, what is intentionally fake, and what must not be mistaken for final behavior.

Prooflet makes that intent inspectable at the exact UI location where it matters.

## Terms

**Prooflet**

A single narrated annotation anchored to a UI element, region, or page state.

**Proof layer**

The overlay runtime that renders prooflets above the host app.

**Anchor**

The resilient binding between a prooflet and a host DOM target.

**Narration**

The explanation body. It should describe product intent, expected behavior, state meaning, review context, or implementation caveats.

**Host**

The frontend app or prototype that imports the Prooflet SDK.

## Product Requirements

V1 must provide:

1. A framework-agnostic SDK.
2. One-line host mounting.
3. A selectable edit mode for choosing DOM elements.
4. A compact editor for title and body.
5. Local browser persistence.
6. Runtime rendering for saved prooflets.
7. Anchor health detection.
8. Visual isolation from host CSS.
9. A small public API for mounting, unmounting, and mode control.

V1 must not provide:

1. Export.
2. Cloud sync.
3. Authentication.
4. Collaboration.
5. A hosted web dashboard.
6. Browser extension behavior.
7. Per-framework component wrappers.
8. Backend service calls.
9. Screenshot diffing.
10. Project management features.

## Technical Shape

Package target:

```txt
prooflet
```

Runtime target:

- TypeScript
- browser DOM
- ESM-first package
- no host framework dependency
- Shadow DOM for internal UI isolation
- localStorage for V1 persistence

The SDK should expose a small controller:

```ts
type ProofletConfig = {
  projectId: string
  enabled?: boolean
  storageKey?: string
}

type ProofletController = {
  mount(): void
  unmount(): void
  enterEditMode(): void
  exitEditMode(): void
  setEnabled(enabled: boolean): void
}

declare const prooflet: {
  mount(config: ProofletConfig): ProofletController
}
```

This is the 0.x API surface. Keep it small and avoid breaking host imports without a versioned release.

## Runtime Modules

**Controller**

Owns lifecycle, configuration, event wiring, and teardown.

**DOM Picker**

Handles hover, target selection, keyboard cancellation, and ignored elements.

**Anchor Resolver**

Creates anchors from selected elements and resolves saved anchors back to live DOM nodes.

**Overlay Renderer**

Renders pins, highlights, panels, and stale-anchor states.

**Editor**

Creates and updates prooflet content.

**Storage**

Reads and writes the local document. V1 ships only localStorage. The boundary should stay narrow enough to replace with cloud sync later without turning V1 into a storage framework.

## Data Model

```ts
type ProofletDocument = {
  schemaVersion: 1
  projectId: string
  origin: string
  createdAt: string
  updatedAt: string
  prooflets: ProofletRecord[]
}

type ProofletRecord = {
  id: string
  anchor: ProofletAnchor
  title: string
  body: string
  createdAt: string
  updatedAt: string
}

type ProofletAnchor = {
  url: {
    origin: string
    pathname: string
  }
  selectors: {
    css?: string
    dataTestId?: string
    ariaLabel?: string
    role?: string
    name?: string
    placeholder?: string
    inputType?: string
  }
  text?: {
    exact?: string
    prefix?: string
    suffix?: string
  }
  rect?: {
    x: number
    y: number
    width: number
    height: number
  }
  fingerprint: {
    tagName: string
    classList: string[]
    childIndexPath: number[]
  }
}
```

The anchor must never rely on a single CSS selector. Selector, text, role, geometry, and structural fingerprint should all contribute to matching confidence.

The record persists only authored facts. Anchor health is derived at render time and never stored. Loaders must sanitize stored documents: ignore unknown fields, drop malformed records, and fill missing optional fields.

## Anchor Health

Anchor resolution returns a confidence level:

```ts
type AnchorHealth = "resolved" | "weak" | "stale"
```

Rules:

- `resolved`: target found with high confidence.
- `weak`: target found, but matching signals changed.
- `stale`: target cannot be found.

Stale prooflets remain visible in a recoverable state. They are not silently deleted.

## Storage

Default V1 key:

```txt
prooflet:v1:<projectId>
```

V1 stores data per browser profile and origin. This is intentional. Cross-device use is a future hosted-sync direction, not a V1 requirement.

Stored data should avoid sensitive values. The picker must not store input values from password fields or secret-like controls.

## UI Behavior

V1 needs only four surfaces:

1. Launcher.
2. Edit mode picker.
3. Prooflet editor.
4. Runtime prooflet viewer.

The overlay should be useful but quiet. It must not reshape the host layout, pollute global CSS, or require the host app to adopt Prooflet styles.

Keyboard expectations:

- `Escape`: exit current mode or close editor.
- click outside editor: close editor if there are no dirty changes.
- selected target remains highlighted while editing.

## Future Collaboration Path

The open local SDK proves adoption.

Future hosted value can later come from:

- cloud sync
- cross-device storage
- team workspaces
- shareable review links
- version history
- role-based access
- comments on prooflets
- prototype review sessions
- hosted storage for agencies and product teams

Do not build hosted collaboration features into V1. Keep V1 good enough that a product manager can install it in one prototype and immediately use it alone.

## First Acceptance Test

Prooflet V1 is real only when:

1. It runs in Dify Prototype with one import.
2. It runs in one unrelated frontend project with the same import.
3. A user can select a DOM element, write a prooflet, refresh the page, and see it again.
4. A normal UI edit can make an anchor weak or stale, and Prooflet shows that state.
5. Removing Prooflet from the host app removes the overlay without leaving application code changes behind.

This list is the V1 acceptance bar. The published npm package validates the package import path, and the in-repository Vite demo validates the authoring loop. Dify Prototype dogfood should still be recorded separately before calling V1 complete.

## Implementation Bias

Prefer the smallest working runtime over a plugin architecture.

Build the local SDK before any cloud service.

Do not add a dashboard until local authoring proves insufficient.

Do not add export in V1.

Do not add framework adapters until the DOM SDK fails in a real host.
