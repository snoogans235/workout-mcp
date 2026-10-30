/** Public errors and their safe diagnostic metadata share one definition. */
export const ErrorDefinitions = Object.freeze({
    CONFIGURATION_INVALID: Object.freeze({
        code: "CONFIGURATION_INVALID",
        message: "Application configuration is invalid.",
        retryable: false,
        cause: "invalid_configuration",
    } as const),
    DEPENDENCY_UNAVAILABLE: Object.freeze({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "A required dependency is unavailable. Retry later.",
        retryable: true,
        cause: "dependency_unavailable",
    } as const),
    INTERNAL_ERROR: Object.freeze({
        code: "INTERNAL_ERROR",
        message: "An internal error occurred.",
        retryable: false,
        cause: "unexpected_exception",
    } as const),
});

export type ErrorDefinition = typeof ErrorDefinitions[keyof typeof ErrorDefinitions];
export type ErrorCode = ErrorDefinition["code"];
