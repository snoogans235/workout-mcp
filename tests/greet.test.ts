import assert from "node:assert/strict";
import { test } from "node:test";
import { greet } from "../src/greet.js";

test("includes the supplied name in the readiness greeting", () => {
    assert.equal(greet("Jonathan"), "Workout MCP is ready, Jonathan.");
    assert.equal(greet("Alex"), "Workout MCP is ready, Alex.");
});
