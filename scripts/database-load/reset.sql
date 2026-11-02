-- The loader executes this reset and the archive restoration in one transaction.
-- psql quotes the supplied value outside the DO body; the guard reads it locally.
SELECT set_config(
    'workout.database_load_expected',
    convert_from(decode(:'expected_database_hex', 'hex'), 'UTF8'),
    true
);
SET lock_timeout = '5s';
SELECT pg_advisory_xact_lock(751236814);

DO $guard$
BEGIN
    IF current_database() <> current_setting('workout.database_load_expected')
        OR current_setting('server_version_num')::int / 10000 <> 18
        OR EXISTS (SELECT FROM pg_database WHERE datname=current_database() AND datistemplate) THEN
        RAISE EXCEPTION 'Unsupported target';
    END IF;

    IF EXISTS (
        SELECT FROM pg_stat_activity
        WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'
    ) THEN
        RAISE EXCEPTION 'Stop application clients before loading';
    END IF;

    IF EXISTS (SELECT FROM pg_namespace WHERE nspname <> 'public' AND nspname <> 'information_schema' AND nspname !~ '^pg_')
        OR EXISTS (SELECT FROM pg_extension WHERE extname <> 'plpgsql')
        OR EXISTS (SELECT FROM pg_event_trigger)
        OR EXISTS (SELECT FROM pg_foreign_server)
        OR EXISTS (SELECT FROM pg_publication)
        OR EXISTS (SELECT oid FROM pg_subscription)
        OR EXISTS (SELECT FROM pg_largeobject_metadata)
        OR EXISTS (
            SELECT FROM pg_cast c
            JOIN pg_type t ON t.oid IN (c.castsource,c.casttarget)
            JOIN pg_namespace n ON n.oid=t.typnamespace
            WHERE n.nspname='public'
        ) THEN
        RAISE EXCEPTION 'Unsupported target objects';
    END IF;
END
$guard$;

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
