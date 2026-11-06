import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestHandler } from "express";
import type { OAuthConfiguration, VerifiedAccessToken, VerifyAccessToken } from "./tokens.js";
import { InvalidAccessToken } from "./tokens.js";

export interface AuthenticatedRequest {
    readonly userId: string;
    readonly scopes: readonly string[];
}

const authenticatedRequests = new AsyncLocalStorage<AuthenticatedRequest>();

/** Available to handlers and domain composition only within an authenticated request. */
export function authenticatedRequest(): AuthenticatedRequest {
    const context = authenticatedRequests.getStore();
    if (!context) {
        throw new Error("Authenticated request context is unavailable.");
    }
    return context;
}

export interface Authentication {
    readonly configuration: OAuthConfiguration;
    readonly verify: VerifyAccessToken;
    readonly resolveUser: (identity: VerifiedAccessToken) => Promise<{ id: string }>;
    close(): Promise<void>;
}

export function resourceMetadata(configuration: OAuthConfiguration) {
    return {
        resource: configuration.resource,
        authorization_servers: [configuration.issuer],
        bearer_methods_supported: ["header"],
    };
}

export function requireAuthentication(authentication: Authentication): RequestHandler {
    const metadataUrl = new URL("/.well-known/oauth-protected-resource", authentication.configuration.resource).href;
    return async (request, response, next) => {
        const authorization = request.headers.authorization;
        const match = authorization?.match(/^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i);
        try {
            const headerCount = request.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === "authorization").length;
            if (!match || headerCount !== 1) {
                throw new InvalidAccessToken();
            }
            const identity = await authentication.verify(match[1]);
            const user = await authentication.resolveUser(identity);
            const context = Object.freeze({ userId: user.id, scopes: Object.freeze([...identity.scopes]) });
            authenticatedRequests.run(context, next);
        } catch (error) {
            if (error instanceof InvalidAccessToken) {
                response.setHeader("WWW-Authenticate", `Bearer resource_metadata="${metadataUrl}"${authorization ? ', error="invalid_token"' : ""}`);
                response.status(401).json({ error: "invalid_token" });
                return;
            }
            next(error);
        }
    };
}
