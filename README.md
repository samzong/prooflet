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

```ts
import { prooflet } from "@prooflet/sdk"

prooflet.mount({
  projectId: "dify-prototype",
})
```

The package is not published yet. This is the intended API direction, not a released contract.

For auto mounting:

```ts
import "@prooflet/sdk/auto"
```

## Principles

1. SDK first, product later.
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
```

The demo runs at:

```txt
http://127.0.0.1:5173/
```

`pnpm verify` runs typecheck, tests, and package build.

See [docs/SPEC.md](docs/SPEC.md).

## License

MIT
