import type { Authentication } from "../../src/authentication/requests.js";
import { createApplication as application } from "../../src/server/application.js";
import { startServer as listener } from "../../src/server/listener.js";

export function testAuthentication(): Authentication {
    return {
        configuration: { issuer: "https://issuer.example/", resource: "https://api.example" },
        verify: async () => ({ issuer: "https://issuer.example/", subject: "fixture", scopes: ["workout:read", "workout:write"] }),
        resolveUser: async () => ({ id: "fixture-user" }),
        close: async () => {},
    };
}

export const createApplication: typeof application = options => application({ authentication: testAuthentication(), ...options });
export const startServer: typeof listener = (configuration, options) => listener(configuration, { authentication: testAuthentication(), ...options });

export const authenticatedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("authorization")) {
        headers.set("authorization", "Bearer fixture");
    }
    return globalThis.fetch(input, { ...init, headers });
};

import { test } from "node:test";
import { authenticatedRequests } from "../../src/authentication/requests.js";

export function authenticatedTest(name: string, callback: () => void | Promise<void>) {
    return test(name, () => authenticatedRequests.run(
        Object.freeze({ userId: "fixture-user", scopes: Object.freeze(["workout:read", "workout:write"]) }), callback,
    ));
}
