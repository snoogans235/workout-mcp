import { z } from "zod";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";

const nonempty = z.string().refine(value => value.trim().length > 0);
const identitySchema = z.strictObject({ issuer: nonempty, subject: nonempty });
const profileSchema = z.strictObject({
    displayName: nonempty,
    timezone: nonempty.refine(value => {
        try {
            new Intl.DateTimeFormat("en", { timeZone: value });
            return true;
        } catch {
            return false;
        }
    }),
});

export type VerifiedIdentity = z.infer<typeof identitySchema>;
export type InitialUserProfile = z.infer<typeof profileSchema>;

/** Stable local bootstrap identifier; it carries no authentication authority. */
export const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";

function parseIdentity(input: VerifiedIdentity): VerifiedIdentity {
    const result = identitySchema.safeParse(input);
    if (!result.success) {
        throw new Error("Verified identity must contain only nonempty issuer and subject.");
    }
    return result.data;
}

function parseProfile(input: InitialUserProfile): InitialUserProfile {
    const result = profileSchema.safeParse(input);
    if (!result.success) {
        throw new Error("Initial user profile requires a name and valid timezone.");
    }
    return result.data;
}

/** Caller must verify the token before supplying this identity. No token parsing occurs here. */
export async function resolveUser(client: PrismaClient, identity: VerifiedIdentity, initialProfile?: InitialUserProfile) {
    const key = parseIdentity(identity);
    const existing = await client.externalIdentity.findUnique({ where: { issuer_subject: key }, include: { user: true } });
    if (existing) {
        return existing.user;
    }
    if (initialProfile === undefined) {
        throw new Error("First identity resolution requires an initial user profile.");
    }
    const profile = parseProfile(initialProfile);
    try {
        // Nested creation is atomic: a losing concurrent creation leaves no orphan User.
        const created = await client.externalIdentity.create({
            data: { ...key, user: { create: profile } },
            include: { user: true },
        });
        return created.user;
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            const winner = await client.externalIdentity.findUnique({ where: { issuer_subject: key }, include: { user: true } });
            if (winner) {
                return winner.user;
            }
        }
        // Do not expose persisted identity values through driver error messages.
        throw new Error("Identity persistence failed.");
    }
}

/** Explicit opt-in seed, separate from authenticated identity resolution. Never links a provider. */
export async function bootstrapLocalUser(client: PrismaClient, profile: InitialUserProfile) {
    return client.user.upsert({
        where: { id: LOCAL_USER_ID },
        create: { id: LOCAL_USER_ID, ...parseProfile(profile) },
        update: {},
    });
}
