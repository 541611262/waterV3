-- 每日数据快照与按客户恢复（可重复执行，需先执行 001）
--
-- 两层备份：
--   1. 平台备份：云开发 PostgreSQL 自带自动备份，可在控制台按时间点恢复到一个新数据库（不会覆盖当前数据）。
--      适合整库级别的事故。
--   2. 本文件的每日快照：每天北京时间 03:00 把所有业务表复制一份到 backup 模式，保留 30 天。
--      适合"某个客户被误删 / 误改"这类日常事故，可以只恢复这一个客户，不影响其他人的数据。
--
-- backup 模式对网页端完全不可见（没有任何授权），只能在控制台 SQL 窗口或 tcb db execute 中操作：
--   SELECT backup.take_snapshot('手动备份');                  -- 立即拍一次快照，返回快照编号
--   SELECT * FROM backup.list_snapshots();                     -- 查看所有快照
--   SELECT * FROM backup.find_client('客户名关键字');          -- 在快照里找客户（含已被彻底删除的）
--   SELECT backup.restore_client(<快照编号>, '<客户 id>');     -- 把该客户及其全部记录恢复到快照时的状态

CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS backup.snapshot_runs (
    id       bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    taken_at timestamptz NOT NULL DEFAULT now(),
    note     text        NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS backup.snapshot_tables (
    run_id     bigint  NOT NULL REFERENCES backup.snapshot_runs (id) ON DELETE CASCADE,
    table_name text    NOT NULL,
    row_count  integer NOT NULL,
    rows       jsonb   NOT NULL,
    PRIMARY KEY (run_id, table_name)
);

-- 需要快照的表（顺序即恢复顺序，父表在前）
CREATE OR REPLACE FUNCTION backup.snapshot_table_list()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT ARRAY['members', 'app_settings', 'customers',
                 'clients', 'devices', 'filter_stages', 'work_orders', 'replacements', 'follow_ups', 'receivables', 'payments'];
$$;

CREATE OR REPLACE FUNCTION backup.take_snapshot(p_note text DEFAULT '')
RETURNS bigint
LANGUAGE plpgsql
SET search_path = public, backup
AS $$
DECLARE
    v_run bigint;
    v_table text;
BEGIN
    INSERT INTO backup.snapshot_runs (note) VALUES (COALESCE(p_note, '')) RETURNING id INTO v_run;
    FOREACH v_table IN ARRAY backup.snapshot_table_list() LOOP
        EXECUTE format(
            'INSERT INTO backup.snapshot_tables (run_id, table_name, row_count, rows)
             SELECT $1, %L, count(*), COALESCE(jsonb_agg(to_jsonb(t)), ''[]'') FROM public.%I t',
            v_table, v_table)
        USING v_run;
    END LOOP;
    -- 自动快照保留 30 天；手动快照（note 不是 daily）保留 180 天
    DELETE FROM backup.snapshot_runs
    WHERE (note = 'daily' AND taken_at < now() - interval '30 days')
       OR taken_at < now() - interval '180 days';
    RETURN v_run;
END;
$$;

CREATE OR REPLACE FUNCTION backup.list_snapshots()
RETURNS TABLE (run_id bigint, taken_at_beijing timestamp, note text, clients integer, devices integer, replacements integer, legacy_customers integer)
LANGUAGE sql
STABLE
AS $$
    SELECT r.id, r.taken_at AT TIME ZONE 'Asia/Shanghai', r.note,
           max(t.row_count) FILTER (WHERE t.table_name = 'clients'),
           max(t.row_count) FILTER (WHERE t.table_name = 'devices'),
           max(t.row_count) FILTER (WHERE t.table_name = 'replacements'),
           max(t.row_count) FILTER (WHERE t.table_name = 'customers')
    FROM backup.snapshot_runs r
    LEFT JOIN backup.snapshot_tables t ON t.run_id = r.id
    GROUP BY r.id
    ORDER BY r.id DESC;
$$;

CREATE OR REPLACE FUNCTION backup.find_client(p_keyword text)
RETURNS TABLE (run_id bigint, taken_at_beijing timestamp, client_id uuid, name text, deleted_at timestamptz, still_exists boolean)
LANGUAGE sql
STABLE
AS $$
    SELECT r.id, r.taken_at AT TIME ZONE 'Asia/Shanghai', (c ->> 'id')::uuid, c ->> 'name', (c ->> 'deleted_at')::timestamptz,
           EXISTS (SELECT 1 FROM public.clients x WHERE x.id = (c ->> 'id')::uuid)
    FROM backup.snapshot_runs r
    JOIN backup.snapshot_tables t ON t.run_id = r.id AND t.table_name = 'clients'
    CROSS JOIN LATERAL jsonb_array_elements(t.rows) c
    WHERE c ->> 'name' ILIKE '%' || p_keyword || '%'
    ORDER BY r.id DESC;
$$;

-- 把一个客户及其全部子记录恢复为快照中的样子：
--   快照里有的记录 → 覆盖回快照时的内容（被彻底删除的会重新插入）
--   快照之后新增的记录 → 保留不动（不会因为恢复而丢失新数据）
-- 恢复本身会写入操作日志
CREATE OR REPLACE FUNCTION backup.restore_client(p_run_id bigint, p_client_id uuid)
RETURNS json
LANGUAGE plpgsql
SET search_path = public, backup
AS $$
DECLARE
    v_table   text;
    v_rows    jsonb;
    v_cols    text;
    v_set     text;
    v_count   integer;
    v_result  jsonb := '{}';
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM backup.snapshot_tables t, jsonb_array_elements(t.rows) c
        WHERE t.run_id = p_run_id AND t.table_name = 'clients' AND (c ->> 'id')::uuid = p_client_id
    ) THEN
        RAISE EXCEPTION '快照 % 中没有客户 %', p_run_id, p_client_id;
    END IF;

    FOREACH v_table IN ARRAY ARRAY['clients', 'devices', 'filter_stages', 'work_orders', 'replacements', 'follow_ups', 'receivables', 'payments'] LOOP
        SELECT COALESCE(jsonb_agg(c), '[]') INTO v_rows
        FROM backup.snapshot_tables t, jsonb_array_elements(t.rows) c
        WHERE t.run_id = p_run_id AND t.table_name = v_table
          AND (CASE WHEN v_table = 'clients' THEN c ->> 'id' ELSE c ->> 'client_id' END)::uuid = p_client_id;

        SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
               string_agg(format('%1$I = EXCLUDED.%1$I', column_name), ', ' ORDER BY ordinal_position)
                   FILTER (WHERE column_name <> 'id' AND is_generated = 'NEVER' AND is_identity = 'NO')
        INTO v_cols, v_set
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = v_table;

        EXECUTE format(
            'INSERT INTO public.%1$I (%2$s) OVERRIDING SYSTEM VALUE
             SELECT %2$s FROM jsonb_populate_recordset(NULL::public.%1$I, $1)
             ON CONFLICT (id) DO UPDATE SET %3$s',
            v_table, v_cols, v_set)
        USING v_rows;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_result := v_result || jsonb_build_object(v_table, v_count);
    END LOOP;

    RETURN v_result;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA backup FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA backup FROM PUBLIC, anon, authenticated;

-- 每天北京时间 03:00（UTC 19:00）自动快照
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'v4-daily-snapshot';
SELECT cron.schedule('v4-daily-snapshot', '0 19 * * *', $$SELECT backup.take_snapshot('daily')$$);
