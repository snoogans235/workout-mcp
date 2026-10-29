/** Validate before pg can fall back to ambient PG* configuration. */
export function requireDatabaseUrl(value: string | undefined): string {
    const message = "Set DATABASE_URL to postgresql://USER@HOST:PORT/DATABASE, or use localhost with one host query containing an absolute socket directory (include a password when required).";
    if (!value || value !== value.trim()) throw new Error(message);

    let url: URL;
    try {
        url = new URL(value);
        for (const part of [url.username, url.password, url.pathname, url.search]) {
            if (/[\u0000-\u001f]/.test(decodeURIComponent(part))) throw new Error(message);
        }
    } catch {
        throw new Error(message);
    }
    const socketHosts = url.searchParams.getAll("host");
    if (socketHosts.length > 0 && (socketHosts.length !== 1 || url.hostname !== "localhost"
        || !socketHosts[0].startsWith("/") || socketHosts[0].startsWith("//")
        || /[\u0000-\u001f\\]/.test(socketHosts[0]))) {
        throw new Error(message);
    }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
        || !url.hostname || !url.username || !/^\/[^/]+$/.test(url.pathname)
        || url.hash || !/^\d+$/.test(url.port) || Number(url.port) < 1 || Number(url.port) > 65535
        || ['port', 'user', 'password', 'database', 'dbname', 'hostaddr', 'service'].some(key => url.searchParams.has(key))) {
        throw new Error(message);
    }
    return value;
}
