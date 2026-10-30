import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { connect } from "node:net";
import { test } from "node:test";
import { startServer } from "../../src/server/listener.js";

for (const entrypoint of [["--import", "tsx", "src/index.ts"], ["dist/index.js"]]) {
for (const signal of ["SIGINT", "SIGTERM"] as const) {
    test(`${entrypoint.at(-1)} ${signal} closes partial requests and permits rebinding`, async () => {
        const child = spawn(process.execPath, entrypoint, {
            env: { ...process.env, MCP_HOST: "127.0.0.1", MCP_PORT: "0", DATABASE_URL: "unused-database-sentinel" },
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "", stderr = "", selected: URL | undefined;
        try {
            const code = await new Promise<number | null>((resolve, reject) => {
                const deadline = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Server lifecycle check timed out.")); }, 5000);
                child.stdout.on("data", chunk => {
                    stdout += chunk;
                    const match = stdout.match(/Local MCP listening at (http:\/\/127\.0\.0\.1:\d+\/mcp)/);
                    if (match && !selected) {
                        selected = new URL(match[1]);
                        const socket = connect(Number(selected.port), "127.0.0.1", () => {
                            socket.write("POST /mcp HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 4096\r\n\r\n{", () => child.kill(signal));
                        });
                        socket.on("error", () => { /* Shutdown can reset an incomplete HTTP request. */ });
                        child.once("exit", () => socket.destroy());
                    }
                });
                child.stderr.on("data", chunk => { stderr += chunk; });
                child.on("error", error => { clearTimeout(deadline); reject(error); });
                child.on("exit", code => { clearTimeout(deadline); resolve(code); });
            });
            assert.equal(code, 0, stderr);
            assert.equal(stderr, "");
            assert.ok(selected);
            assert.doesNotMatch(stdout, /unused-database-sentinel|DATABASE_URL|\/Users\//);
            const rebound = await startServer({ host: "127.0.0.1", port: Number(selected.port) });
            await rebound.close(); await rebound.close();
        } finally { if (child.exitCode === null) child.kill("SIGKILL"); }
    });
}
}

test("repeated start and idempotent close release the same port without signal listeners", async () => {
    const listeners = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
    let port = 0;
    for (let cycle = 0; cycle < 4; cycle++) {
        const server = await startServer({ host: "127.0.0.1", port });
        port = Number(server.url.port);
        const closed = server.close();
        assert.equal(server.close(), closed);
        await closed;
    }
    assert.deepEqual([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")], listeners);
});

test("invalid configuration and occupied ports fail without exposing values or stacks", async () => {
    const occupied = await startServer({ host: "127.0.0.1", port: 0 });
    try {
        for (const entrypoint of [["--import", "tsx", "src/index.ts"], ["dist/index.js"]]) {
            for (const configuration of [
                { MCP_HOST: "127.0.0.1", MCP_PORT: "private-configuration-sentinel" },
                { MCP_HOST: "0.0.0.0", MCP_PORT: "0" },
                { MCP_HOST: "127.0.0.1", MCP_PORT: occupied.url.port },
            ]) {
                const result = spawnSync(process.execPath, entrypoint, {
                    env: { ...process.env, ...configuration }, encoding: "utf8", timeout: 5000,
                });
                assert.equal(result.status, 1);
                assert.equal(result.stdout, "");
                assert.match(result.stderr, /^Local MCP startup failed\./);
                assert.doesNotMatch(result.stderr, /private-configuration-sentinel|\/Users\/|node_modules|Error:|DATABASE_URL/);
            }
        }
    } finally { await occupied.close(); }
});
