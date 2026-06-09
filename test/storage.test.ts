import { beforeEach, describe, expect, it } from "vitest"
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
    const now = new Date().toISOString()
    const record: ProofletRecord = {
      id: "p1",
      status: "active",
      anchor: createAnchor(document.querySelector("button")!),
      title: "Save action",
      body: "This explains the save action.",
      placement: "auto",
      tags: [],
      createdAt: now,
      updatedAt: now,
    }

    store.replace([record])

    expect(createStore("demo").load().prooflets).toHaveLength(1)
    expect(createStore("other").load().prooflets).toHaveLength(0)
  })
})
