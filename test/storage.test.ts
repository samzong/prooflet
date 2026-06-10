import { beforeEach, describe, expect, it, vi } from "vitest"
import { createAnchor } from "../src/anchor.js"
import { createStore } from "../src/storage.js"
import type { ProofletRecord } from "../src/types.js"

describe("storage", () => {
  beforeEach(() => {
    document.body.innerHTML = `<button>Save</button>`
    window.localStorage.clear()
  })

  it("persists prooflets by project id", () => {
    const store = createStore("demo")
    const record = buildRecord("p1")

    const result = store.replace([record])

    expect(result.persisted).toBe(true)
    expect(createStore("demo").load().prooflets).toHaveLength(1)
    expect(createStore("other").load().prooflets).toHaveLength(0)
  })

  it("sanitizes legacy and malformed records on load", () => {
    const legacyRecord = {
      ...buildRecord("legacy"),
      status: "hidden",
      placement: "auto",
      tags: ["a"],
    }
    window.localStorage.setItem(
      "prooflet:v1:demo",
      JSON.stringify({
        schemaVersion: 1,
        projectId: "demo",
        origin: window.location.origin,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        prooflets: [legacyRecord, { id: "" }, "garbage", { id: "no-anchor" }, null],
      }),
    )

    const loaded = createStore("demo").load()

    expect(loaded.prooflets).toHaveLength(1)
    expect(loaded.prooflets[0].id).toBe("legacy")
    expect("status" in loaded.prooflets[0]).toBe(false)
    expect("placement" in loaded.prooflets[0]).toBe(false)
    expect("tags" in loaded.prooflets[0]).toBe(false)
  })

  it("returns an empty document for unparseable or foreign payloads", () => {
    window.localStorage.setItem("prooflet:v1:demo", "{not json")
    expect(createStore("demo").load().prooflets).toHaveLength(0)

    window.localStorage.setItem("prooflet:v1:demo", JSON.stringify({ schemaVersion: 2, projectId: "demo", prooflets: [] }))
    expect(createStore("demo").load().prooflets).toHaveLength(0)
  })

  it("reports persistence failure without losing the in-memory document", () => {
    const store = createStore("demo")
    const spy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded")
    })

    try {
      const result = store.replace([buildRecord("p1")])

      expect(result.persisted).toBe(false)
      expect(result.document.prooflets).toHaveLength(1)
    } finally {
      spy.mockRestore()
    }
  })
})

function buildRecord(id: string): ProofletRecord {
  const now = new Date().toISOString()

  return {
    id,
    anchor: createAnchor(document.querySelector("button")!),
    title: "Save action",
    body: "This explains the save action.",
    createdAt: now,
    updatedAt: now,
  }
}
