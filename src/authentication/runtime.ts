import { createDatabase } from "../database/index.js";
import { resolveUser } from "../identity/users.js";
import type { Authentication } from "./requests.js";
import { discoverAccessTokenVerifier, oauthConfiguration, type VerifyAccessToken } from "./tokens.js";

/** Own one database pool and cached verifier per listener; importing performs no I/O. */
export function createAuthentication(env: NodeJS.ProcessEnv): Authentication {
    const configuration = oauthConfiguration(env);
    const database = createDatabase(env.DATABASE_URL);
    let verifier: Promise<VerifyAccessToken> | undefined;
    return {
        configuration,
        async verify(token) {
            verifier ??= discoverAccessTokenVerifier(configuration).catch(error => {
                verifier = undefined;
                throw error;
            });
            return (await verifier)(token);
        },
        resolveUser(identity) {
            return resolveUser(database.client, { issuer: identity.issuer, subject: identity.subject }, {
                displayName: "Workout user",
                timezone: "UTC",
            });
        },
        close: () => database.disconnect(),
    };
}
