import { createRemoteJWKSet, jwtVerify, errors, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

export interface OAuthConfiguration {
    readonly issuer: string;
    readonly resource: string;
}

const httpsUrl = z.url().refine(value => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash && !url.search;
});
const configurationSchema = z.strictObject({ issuer: httpsUrl, resource: httpsUrl });

export function oauthConfiguration(env: NodeJS.ProcessEnv): OAuthConfiguration {
    const result = configurationSchema.safeParse({ issuer: env.OAUTH_ISSUER, resource: env.OAUTH_AUDIENCE });
    if (!result.success) {
        throw new Error("OAuth issuer and resource must be configured as HTTPS URLs.");
    }
    return Object.freeze(result.data);
}

export interface VerifiedAccessToken {
    readonly issuer: string;
    readonly subject: string;
    readonly scopes: readonly string[];
}

export type VerifyAccessToken = (token: string) => Promise<VerifiedAccessToken>;

/** Public error deliberately carries no claims, token, URL, or underlying cause. */
export class InvalidAccessToken extends Error {
    constructor() {
        super("Invalid access token.");
    }
}

/** The key resolver is injected for offline fixtures; production uses discovered JWKS. */
export function jwtAccessTokenVerifier(configuration: OAuthConfiguration, keys: JWTVerifyGetKey): VerifyAccessToken {
    return async token => {
        try {
            const { payload } = await jwtVerify(token, keys, {
                algorithms: ["RS256"],
                issuer: configuration.issuer,
                audience: configuration.resource,
                requiredClaims: ["iss", "sub", "aud", "exp"],
            });
            if (typeof payload.sub !== "string" || !payload.sub.trim()) {
                throw new InvalidAccessToken();
            }
            if (payload.scope !== undefined && typeof payload.scope !== "string") {
                throw new InvalidAccessToken();
            }
            const scopes = typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [];
            return Object.freeze({
                issuer: configuration.issuer,
                subject: payload.sub,
                scopes: Object.freeze([...new Set(scopes)]),
            });
        } catch (error) {
            const invalid = error instanceof InvalidAccessToken || (error instanceof errors.JOSEError && (
                error.code.startsWith("ERR_JWT_") || error.code.startsWith("ERR_JWS_")
                || error.code === "ERR_JOSE_ALG_NOT_ALLOWED" || error.code === "ERR_JWKS_NO_MATCHING_KEY"
            ));
            if (invalid) {
                throw new InvalidAccessToken();
            }
            throw new Error("Access token verification is unavailable.");
        }
    };
}

/** Discover only the configured issuer, never a token-supplied URL. */
export async function discoverAccessTokenVerifier(configuration: OAuthConfiguration): Promise<VerifyAccessToken> {
    try {
        const discoveryUrl = new URL(`${configuration.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`);
        const response = await fetch(discoveryUrl, { redirect: "error", signal: AbortSignal.timeout(5000) });
        if (!response.ok) {
            throw new Error();
        }
        const metadata = z.object({ issuer: z.literal(configuration.issuer), jwks_uri: httpsUrl }).parse(await response.json());
        const keys = createRemoteJWKSet(new URL(metadata.jwks_uri), { timeoutDuration: 5000 });
        return jwtAccessTokenVerifier(configuration, keys);
    } catch {
        throw new Error("OAuth discovery is unavailable or invalid.");
    }
}
