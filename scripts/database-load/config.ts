import { requireDatabaseUrl } from "../../src/database/config.js";

export function loadConfiguration(args: string[], value: string | undefined) {
    const options = new Map<string, string>();
    for (let index = 0; index < args.length; index += 2) {
        const key = args[index];
        const argument = args[index + 1];
        if (!["--file", "--target"].includes(key) || !argument || options.has(key)) {
            throw new Error("Supply --file PATH --target EXPECTED_DATABASE.");
        }
        options.set(key, argument);
    }
    const file = options.get("--file");
    const target = options.get("--target");
    if (!file || !target || target !== target.trim() || Buffer.byteLength(target) > 63
        || /[\u0000-\u001f]/.test(target) || ["postgres", "template0", "template1"].includes(target)) {
        throw new Error("Supply a non-maintenance target database and archive file.");
    }
    const connectionString = requireDatabaseUrl(value);
    const url = new URL(connectionString);
    const socket = url.searchParams.get("host");
    if (decodeURIComponent(url.pathname.slice(1)) !== target
        || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
        || [...url.searchParams.keys()].some(key => key !== "host")
        || (socket && !socket.startsWith("/"))) {
        throw new Error("DATABASE_LOAD_URL must explicitly select the expected local database.");
    }
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(env)) {
        if (key.startsWith("PG") || ["DATABASE_URL", "DATABASE_LOAD_URL", "TEST_DATABASE_ADMIN_URL"].includes(key)) {
            delete env[key];
        }
    }
    Object.assign(env, {
        PGHOST: socket ?? (url.hostname === "localhost" ? "127.0.0.1" : url.hostname.replace(/^\[|\]$/g, "")),
        PGPORT: url.port,
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGDATABASE: target,
        PGPASSFILE: "/dev/null",
        PGCONNECT_TIMEOUT: "5",
        PGSSLMODE: "disable",
    });
    return { file, target, connectionString, env };
}

/** TOC entries describe namespace membership independently of SQL/row contents. */
export function validateArchive(toc: string): { createsPublic: boolean } {
    if (!/Format: CUSTOM/.test(toc) || !/Dumped from database version: 18\./.test(toc)
        || !/Dumped by pg_dump version: 18\./.test(toc)) {
        throw new Error("Requires a PostgreSQL 18 full custom archive.");
    }
    const publicTypes = [
        "MATERIALIZED VIEW DATA", "SEQUENCE OWNED BY", "TABLE ATTACH", "INDEX ATTACH",
        "DEFAULT ACL", "FK CONSTRAINT", "CHECK CONSTRAINT", "TABLE DATA", "SEQUENCE SET",
        "MATERIALIZED VIEW", "ROW SECURITY", "STATISTICS DATA", "STATISTICS",
        "CONSTRAINT", "SEQUENCE", "TABLE", "INDEX", "VIEW", "TYPE", "DOMAIN",
        "FUNCTION", "PROCEDURE", "AGGREGATE", "TRIGGER", "RULE", "POLICY", "COLLATION", "DEFAULT", "ACL", "COMMENT",
    ];
    let createsPublic = false;
    let schemaEntries = 0;
    let dataEntries = 0;
    const tables = new Set<string>();
    const tableData = new Set<string>();
    for (const line of toc.split("\n")) {
        if (!line || line.startsWith(";")) {
            continue;
        }
        const match = /^\d+; \d+ \d+ (.+)$/.exec(line);
        if (!match) {
            throw new Error("Unsupported archive table of contents.");
        }
        const entry = match[1];
        if (/^SCHEMA - public(?: |$)/.test(entry)) {
            createsPublic = true;
            schemaEntries++;
        } else if (/^(?:ENCODING|STDSTRINGS|SEARCHPATH) - /.test(entry)
            || /^EXTENSION - plpgsql(?: |$)/.test(entry)
            || /^(?:COMMENT|ACL) - (?:SCHEMA public|EXTENSION plpgsql)(?: |$)/.test(entry)) {
            continue;
        } else {
            const type = publicTypes.find(candidate => entry.startsWith(`${candidate} public `));
            if (!type) {
                throw new Error("Archive contains unsupported namespaces or objects.");
            }
            if (["TABLE DATA", "MATERIALIZED VIEW DATA", "SEQUENCE SET"].includes(type)) {
                dataEntries++;
            } else if (!["ACL", "COMMENT", "DEFAULT ACL"].includes(type)) {
                schemaEntries++;
            }
            if (type === "TABLE") {
                tables.add(entry.slice("TABLE public ".length));
            } else if (type === "TABLE DATA") {
                tableData.add(entry.slice("TABLE DATA public ".length));
            }
        }
    }
    if (schemaEntries === 0 || [...tables].some(table => !tableData.has(table))
        || [...tableData].some(table => !tables.has(table))) {
        throw new Error("Archive must contain application schema and full table data.");
    }
    return { createsPublic };
}
