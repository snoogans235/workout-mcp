import { InvalidAccessToken } from "../src/authentication/tokens.js";
import { serverConfiguration } from "../src/server/config.js";
import { startServer } from "../src/server/listener.js";

// A tooling fixture, never selected by the production entry point. No real user,
// provider, database, or credentials are needed to inspect static tool metadata.
const server = await startServer(serverConfiguration(process.env), {
    authentication: {
        configuration: { issuer: "https://reference.invalid/", resource: "https://reference.invalid" },
        async verify(token) {
            if (token !== "tool-reference-fixture") {
                throw new InvalidAccessToken();
            }
            return { issuer: "https://reference.invalid/", subject: "metadata-fixture", scopes: [] };
        },
        resolveUser: async () => ({ id: "metadata-fixture" }),
        close: async () => {},
    },
});

const stop = () => {
    void server.close().catch(() => { process.exitCode = 1; });
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
