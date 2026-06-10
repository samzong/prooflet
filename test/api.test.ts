import { describe, expect, it } from "vitest"
import * as api from "../src/index.js"

describe("public api surface", () => {
  it("exports exactly the documented runtime surface", () => {
    expect(Object.keys(api).sort()).toEqual(["mountProoflet", "prooflet"])
  })
})
