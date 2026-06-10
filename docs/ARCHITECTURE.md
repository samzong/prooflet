# Prooflet Architecture

Prooflet is a browser-side proof layer: a runtime that lets a live prototype
explain itself in place. This document shows how the runtime is wired. The
rules for changing it safely live in [MAINTENANCE.md](MAINTENANCE.md); the
product boundary lives in [SPEC.md](SPEC.md).

## Module and state flow

Runtime state flows one way. The controller owns all of it; the overlay is a
stateless view that renders the state it is given and reports user intent
back. The anchor module is pure functions; storage is a narrow document
store (and the future cloud-sync seam).

```mermaid
flowchart TB
    host["Host app"] -- "prooflet.mount(config)" --> ctrl

    subgraph runtime["Prooflet runtime"]
        ctrl["controller.ts<br/>single owner of runtime state"]
        ov["overlay.ts<br/>stateless view in a shadow root"]
        an["anchor.ts<br/>pure create / resolve / score"]
        st["storage.ts<br/>load / sanitize / replace"]
    end

    dom["Host DOM"]
    ls[("localStorage<br/>prooflet:v1:projectId")]

    ov -- "intents:<br/>click / hover / submit" --> ctrl
    ctrl -- "update(state)<br/>reposition()" --> ov
    ctrl -- "createAnchor<br/>resolveAnchor" --> an
    an -- "read-only queries" --> dom
    ctrl -- "load / replace" --> st
    st --> ls
```

Intents are synchronous callbacks; the controller may re-render inside them.
That is safe because overlay events are delegated on the shadow root and
stateful nodes (the editor) are session-keyed, never rebuilt mid-session.

## Render paths

Layout can change without any catchable event (display-scale switches,
media-query reflows, CSS transitions, font loads). Events therefore drive
anchor re-resolution only; geometry is observed directly every animation
frame and diff-written, so steady frames cost a few rect reads and zero
style writes.

```mermaid
flowchart LR
    data["Data changed<br/>create / edit / delete"] --> R
    resize["window resize"] --> R
    mut["Host DOM mutations<br/>debounced 150ms"] --> R
    uiState["UI-only state<br/>hover / viewer / editor"] --> P
    frame["Every animation frame<br/>plus scroll (capture)"] --> G

    R["refresh()<br/>re-resolve all anchors"] --> P["push()<br/>overlay.update(state)"]
    P --> G["reposition()<br/>diffed geometry writes"]
```

The cost model behind this split: `refresh()` walks the host DOM (expensive,
event-driven and debounced), `push()` re-renders structure from cached
resolutions (cheap, on state change), `reposition()` only reads rects and
writes changed styles (cheapest, every frame).

## Anchor resolution

An anchor stores independent signals captured at selection time: URL, test
ids, ARIA attributes, a CSS path, normalized text, geometry, and a
structural fingerprint. Resolution scores candidates across all signals and
accepts one only if an identity-level signal matches exactly. Weak or stale
is always preferred over a wrong bind.

```mermaid
flowchart LR
    create["createAnchor(element)<br/>capture url, selectors, text,<br/>rect, structure"] --> resolve["resolveAnchor()"]
    resolve --> score["score all candidates<br/>across signals"]
    score -- "high score + identity match" --> ok["resolved"]
    score -- "low score + identity match" --> weak["weak"]
    score -- "no identity match<br/>or no candidate" --> stale["stale<br/>recoverable, never wrong-bound"]
```

Stale prooflets stay visible in the dock with edit and delete actions. They
are recoverable state, not garbage.
