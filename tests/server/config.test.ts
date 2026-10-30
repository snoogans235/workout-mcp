import assert from "node:assert/strict";
import { test } from "node:test";
import { serverConfiguration } from "../../src/server/config.js";

test("defaults only the loopback host and permits an ephemeral port", () => {
    assert.deepEqual(serverConfiguration({ MCP_PORT: "0" }), { host: "127.0.0.1", port: 0 });
});

test("rejects missing or malformed ports and non-loopback bindings without echoing values", () => {
    for (const env of [{}, { MCP_PORT: "" }, { MCP_PORT: "65536" }, { MCP_PORT: "-1" }, { MCP_PORT: "3.5" },
        { MCP_PORT: "3e3" }, { MCP_PORT: "3000", MCP_HOST: "" }, { MCP_PORT: "3000", MCP_HOST: "0.0.0.0" }]) {
        assert.throws(() => serverConfiguration(env), { message: "Set MCP_HOST to 127.0.0.1 and MCP_PORT to an integer from 0 to 65535." });
    }
});
