export const workoutScopes = Object.freeze(["workout:read", "workout:write"] as const);
export type WorkoutScope = typeof workoutScopes[number];

export function requireScope(granted: readonly string[], required: WorkoutScope): void {
    if (!granted.includes(required)) {
        throw new Error("Required application scope is unavailable.");
    }
}
