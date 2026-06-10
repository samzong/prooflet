# Prooflet

The proof layer for prototypes.

Prooflet is a lightweight in-page narration and annotation SDK for interactive prototypes. It lets a prototype explain itself without embedding annotation content into the host app's source code.

The first product shape is deliberately small:

- one npm package
- one host import
- in-page element selection
- local annotation storage
- prototype-facing pins, panels, and narration
- no hosted dashboard in V1
- no export in V1
- no backend dependency in V1

## Why

Prototypes fail when intent is trapped outside the interface: in meetings, screenshots, chat threads, or forgotten documents.

Prooflet keeps the explanation beside the thing being explained. A prooflet is a small third-person note anchored to a real UI element, state, or flow. It turns a prototype from a clickable surface into a reviewable argument.

## Install

```bash
pnpm add prooflet
```

```ts
import { prooflet } from "prooflet"

prooflet.mount({
  projectId: "dify-prototype",
})
```

For auto mounting:

```ts
import "prooflet/auto"
```

## How it fits your prototype

Prooflet is a runtime layer, not a framework integration. The host imports
one line; everything else stays on Prooflet's side of the boundary.

```mermaid
flowchart LR
    subgraph host["Host prototype - any framework"]
        app["App code<br/>zero changes"]
        dom["Live DOM"]
    end

    subgraph runtime["Prooflet runtime - isolated in a shadow root"]
        ctrl["Controller<br/>single state owner"]
        anchor["Anchor engine<br/>multi-signal, conservative"]
        ui["Overlay<br/>pins / viewer / editor / dock"]
    end

    store[("localStorage<br/>prooflet:v1:projectId")]

    app == "the only touchpoint:<br/>prooflet.mount({ projectId })" ==> ctrl
    ctrl --> anchor
    ctrl --> ui
    anchor -- "read-only resolution:<br/>resolved / weak / stale" --> dom
    ui -. "renders above the prototype,<br/>never touches host styles or events" .-> dom
    ctrl -- "annotations stay in the browser,<br/>never in host source code" --> store
```

- **One import in, one delete out.** No component changes, no framework
  adapters, no build config. Removing the import removes every trace.
- **Hard isolation.** All Prooflet UI lives in a shadow root. The host DOM is
  only read for anchor resolution, never modified or restyled.
- **Conservative anchors.** Annotations survive normal prototype edits as
  `resolved` or `weak`; if the target disappears they degrade to a
  recoverable `stale` card - never a wrong bind.

What a review session looks like:

```mermaid
sequenceDiagram
    actor U as Reviewer / PM
    participant P as Prooflet
    participant H as Host DOM

    Note over U,H: Annotate once
    U->>P: Annotate - enter pick mode
    U->>H: Click an element
    P->>P: Capture multi-signal anchor,<br/>write narration, save locally

    Note over U,H: Revisit - after refresh or prototype edits
    P->>H: Re-resolve anchors against the live DOM
    alt Target still recognizable
        P-->>U: Pin re-attaches in place (resolved / weak)
    else Target gone
        P-->>U: Recoverable stale card - never a wrong bind
    end
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the runtime internals.

## Principles

1. Runtime first, dashboard later.
2. Annotation content must not live inside host application code.
3. The host app should not need framework-specific integration.
4. Local-first behavior must be useful before cloud sync exists.
5. Anchors must be resilient enough to survive normal prototype edits.
6. The overlay must be visually isolated from the host app.
7. Long-term value comes from portability, review flow, and sync, not from locking up local notes.

## V1 Boundary

Prooflet V1 is a browser-side runtime:

- select an element on the current page
- create or edit a prooflet
- render prooflets over the prototype
- persist data in browser storage for the same project
- detect stale or weak anchors

V1 does not include:

- export/import
- cloud sync
- accounts
- teams
- permissions
- hosted dashboards
- browser extensions
- backend services
- issue tracker integrations

## Development

```bash
pnpm install
pnpm dev
pnpm verify
pnpm pack:check
```

The demo runs at:

```txt
http://127.0.0.1:5173/
```

`pnpm verify` runs typecheck, tests, and package build. `pnpm pack:check` previews the npm package contents before publishing.

See [docs/SPEC.md](docs/SPEC.md) for the product specification,
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the runtime architecture,
and [docs/MAINTENANCE.md](docs/MAINTENANCE.md) for the change rules.

## License

MIT
