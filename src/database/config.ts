/** Validate before pg can fall back to ambient PG* configuration. */
export function requireDatabaseUrl(value: string | undefined): string {
    const message = "Set DATABASE_URL to an explicit postgresql://USER@HOST:PORT/DATABASE URL (include a password when required).";
    if (!value || value !== value.trim()) throw new Error(message);

    let url: URL;
    try {
        url = new URL(value);
        for (const part of [url.username, url.password, url.pathname]) {
            if (/[\u0000-\u001f]/.test(decodeURIComponent(part))) throw new Error(message);
        }
    } catch {
        throw new Error(message);
    }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
        || !url.hostname || !url.username || !/^\/[^/]+$/.test(url.pathname)
        || url.hash || !/^\d+$/.test(url.port) || Number(url.port) < 1 || Number(url.port) > 65535
        || ['host', 'port', 'user', 'password', 'database', 'dbname'].some(key => url.searchParams.has(key))) {
        throw new Error(message);
    }
    return value;
}
