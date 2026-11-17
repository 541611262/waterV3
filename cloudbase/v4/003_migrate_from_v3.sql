-- 从 V3（customers.data 整块 JSON）迁移到 V4 关系型表（可重复执行，需先执行 001、002）
-- 迁移只读取 V3 的 customers 表，不会修改或删除它；V3 照常可用，随时可以回退。
--
-- 用法（在云开发控制台的 SQL 窗口或 tcb db execute 中执行，网页端无权调用）：
--   SELECT public.v4_migrate_from_v3();          -- 增量：只迁移还没迁移过的客户
--   SELECT public.v4_migrate_from_v3(true);      -- 重来：先清掉迁移过来的数据再全部重新迁移
--                                                --   （迁移后已经在 V4 里产生过新操作时会拒绝执行，保护新数据）
--   SELECT * FROM public.v4_migration_report();  -- 逐项核对：数量、字段内容、到期日期，ok 全部为 true 才算通过
--   SELECT * FROM public.v4_migration_anomalies(); -- V3 中无法识别、已按空值处理的字段（需要人工看一眼）

-- ---------- 宽松的类型转换：无法识别时返回空，不让一条脏数据中断整个迁移 ----------
CREATE OR REPLACE FUNCTION public.v4_try_date(p text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF p IS NULL OR p !~ '^\d{4}-\d{2}-\d{2}' THEN
        RETURN NULL;
    END IF;
    RETURN substr(p, 1, 10)::date;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.v4_try_timestamp(p text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF p IS NULL OR btrim(p) = '' THEN
        RETURN NULL;
    END IF;
    RETURN p::timestamptz;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.v4_try_numeric(p text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF p IS NULL OR btrim(p) = '' THEN
        RETURN NULL;
    END IF;
    RETURN btrim(p)::numeric;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- 正整数且在范围内，否则为空
CREATE OR REPLACE FUNCTION public.v4_try_int_between(p text, p_min integer, p_max integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE WHEN n = trunc(n) AND n BETWEEN p_min AND p_max THEN n::integer END
    FROM (SELECT public.v4_try_numeric(p) AS n) x;
$$;

CREATE OR REPLACE FUNCTION public.v4_try_bool(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p IS NULL OR jsonb_typeof(p) = 'null' THEN false
        WHEN jsonb_typeof(p) = 'boolean' THEN p::text::boolean
        ELSE lower(btrim(p #>> '{}')) IN ('true', '1', '是', 'y', 'yes', '√', '✓')
    END;
$$;

-- V3 数据展开成"一行一条"，迁移和核对共用，保证两边口径一致
CREATE OR REPLACE VIEW public.v4_v3_devices AS
SELECT
    c.id                                       AS client_legacy_id,
    c.id || ':d:' || COALESCE(NULLIF(d.value ->> 'id', ''), 'n' || d.ord) AS legacy_id,
    d.value                                    AS dev,
    d.ord
FROM public.customers c
CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(c.data -> 'devices') = 'array' THEN c.data -> 'devices' ELSE '[]'::jsonb END
) WITH ORDINALITY AS d(value, ord);

CREATE OR REPLACE VIEW public.v4_v3_replacements AS
SELECT
    vd.legacy_id                                AS device_legacy_id,
    vd.legacy_id || ':r:' || COALESCE(NULLIF(r.value ->> 'id', ''), 'n' || r.ord) AS legacy_id,
    r.value                                     AS rec
FROM public.v4_v3_devices vd
CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(vd.dev -> 'replacementHistory') = 'array' THEN vd.dev -> 'replacementHistory' ELSE '[]'::jsonb END
) WITH ORDINALITY AS r(value, ord);

CREATE OR REPLACE VIEW public.v4_v3_follow_ups AS
SELECT
    c.id                                        AS client_legacy_id,
    c.id || ':f:' || COALESCE(NULLIF(f.value ->> 'id', ''), 'n' || f.ord) AS legacy_id,
    f.value                                     AS rec
FROM public.customers c
CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(c.data -> 'followUps') = 'array' THEN c.data -> 'followUps' ELSE '[]'::jsonb END
) WITH ORDINALITY AS f(value, ord);

REVOKE ALL ON public.v4_v3_devices, public.v4_v3_replacements, public.v4_v3_follow_ups FROM PUBLIC, anon, authenticated;

-- ---------- 迁移 ----------
CREATE OR REPLACE FUNCTION public.v4_migrate_from_v3(p_reset boolean DEFAULT false)
RETURNS json
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_clients      integer;
    v_devices      integer;
    v_replacements integer;
    v_follow_ups   integer;
    v_receivables  integer;
BEGIN
    PERFORM set_config('app.skip_audit', 'on', true);

    IF p_reset THEN
        IF EXISTS (
            SELECT 1 FROM public.audit_log a
            JOIN public.clients c ON c.id = a.client_id
            WHERE c.legacy_id IS NOT NULL AND a.action <> 'migrate'
        ) THEN
            RAISE EXCEPTION '迁移过来的客户在 V4 中已有新的操作记录，拒绝重新迁移（会丢失这些操作）';
        END IF;
        DELETE FROM public.clients WHERE legacy_id IS NOT NULL;
    END IF;

    INSERT INTO public.clients (owner_id, name, province, region, long_term_partner, legacy_id, created_at)
    SELECT
        c.user_id,
        COALESCE(NULLIF(btrim(c.data ->> 'name'), ''), '（未命名客户）'),
        COALESCE(c.data ->> 'province', ''),
        COALESCE(c.data ->> 'region', ''),
        public.v4_try_bool(c.data -> 'longTermPartner'),
        c.id,
        COALESCE(public.v4_try_timestamp(c.data ->> 'createdAt'), c.updated_at)
    FROM public.customers c
    ON CONFLICT (legacy_id) DO NOTHING;
    GET DIAGNOSTICS v_clients = ROW_COUNT;

    INSERT INTO public.devices (client_id, address, contact_person, phone, install_date, model, quantity, location,
                                filter_purchase_date, interval_days, need_water_test, notes, legacy_id, created_at)
    SELECT
        cl.id,
        COALESCE(vd.dev ->> 'address', ''),
        COALESCE(vd.dev ->> 'contactPerson', ''),
        COALESCE(vd.dev ->> 'phoneNumber', ''),
        public.v4_try_date(vd.dev ->> 'installDate'),
        COALESCE(vd.dev ->> 'model', ''),
        public.v4_try_int_between(vd.dev ->> 'quantity', 1, 1000000),
        COALESCE(vd.dev ->> 'location', ''),
        public.v4_try_date(vd.dev ->> 'filterPurchaseDate'),
        public.v4_try_int_between(vd.dev ->> 'customInterval', 1, 3650),
        public.v4_try_bool(vd.dev -> 'needWaterTest'),
        COALESCE(vd.dev ->> 'notes', ''),
        vd.legacy_id,
        COALESCE(public.v4_try_timestamp(vd.dev ->> 'createdAt'), cl.created_at)
    FROM public.v4_v3_devices vd
    JOIN public.clients cl ON cl.legacy_id = vd.client_legacy_id
    ON CONFLICT (legacy_id) DO NOTHING;
    GET DIAGNOSTICS v_devices = ROW_COUNT;

    INSERT INTO public.replacements (client_id, device_id, replaced_on, filter_model, quantity, cost, operator_name,
                                     notes, legacy_id, created_at)
    SELECT
        d.client_id,
        d.id,
        public.v4_try_date(vr.rec ->> 'date'),
        COALESCE(vr.rec ->> 'filterModel', ''),
        COALESCE(public.v4_try_int_between(vr.rec ->> 'quantity', 1, 1000000), 1),
        GREATEST(COALESCE(public.v4_try_numeric(vr.rec ->> 'cost'), 0), 0),
        COALESCE(vr.rec ->> 'operator', ''),
        COALESCE(vr.rec ->> 'notes', ''),
        vr.legacy_id,
        COALESCE(public.v4_try_timestamp(vr.rec ->> 'timestamp'), d.created_at)
    FROM public.v4_v3_replacements vr
    JOIN public.devices d ON d.legacy_id = vr.device_legacy_id
    ON CONFLICT (legacy_id) DO NOTHING;
    GET DIAGNOSTICS v_replacements = ROW_COUNT;

    INSERT INTO public.follow_ups (client_id, followed_on, content, operator_name, legacy_id, created_at)
    SELECT
        cl.id,
        public.v4_try_date(vf.rec ->> 'date'),
        COALESCE(vf.rec ->> 'content', ''),
        COALESCE(vf.rec ->> 'operator', ''),
        vf.legacy_id,
        COALESCE(public.v4_try_timestamp(vf.rec ->> 'timestamp'), cl.created_at)
    FROM public.v4_v3_follow_ups vf
    JOIN public.clients cl ON cl.legacy_id = vf.client_legacy_id
    ON CONFLICT (legacy_id) DO NOTHING;
    GET DIAGNOSTICS v_follow_ups = ROW_COUNT;

    -- V3 的"未收款"只是一个开关，没有金额：迁移为金额未登记的应收款，催款周期沿用原设置
    INSERT INTO public.receivables (client_id, device_id, title, remind_interval_days, legacy_id, created_at)
    SELECT
        d.client_id,
        d.id,
        '历史未收款',
        public.v4_try_int_between(vd.dev ->> 'unpaidInterval', 1, 3650),
        vd.legacy_id || ':unpaid',
        d.created_at
    FROM public.v4_v3_devices vd
    JOIN public.devices d ON d.legacy_id = vd.legacy_id
    WHERE public.v4_try_bool(vd.dev -> 'hasUnpaid')
    ON CONFLICT (legacy_id) DO NOTHING;
    GET DIAGNOSTICS v_receivables = ROW_COUNT;

    PERFORM set_config('app.skip_audit', 'off', true);
    INSERT INTO public.audit_log (actor_id, table_name, action, changes)
    VALUES (NULL, 'clients', 'migrate', jsonb_build_object(
        'reset', p_reset, 'clients', v_clients, 'devices', v_devices, 'replacements', v_replacements,
        'follow_ups', v_follow_ups, 'receivables', v_receivables));

    RETURN json_build_object('clients', v_clients, 'devices', v_devices, 'replacements', v_replacements,
                             'follow_ups', v_follow_ups, 'receivables', v_receivables);
END;
$$;

-- ---------- 核对 ----------
CREATE OR REPLACE FUNCTION public.v4_migration_report()
RETURNS TABLE (check_item text, expected bigint, actual bigint, ok boolean)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    WITH
    v3_dev AS (
        SELECT vd.*, d.id AS new_id,
            GREATEST(
                public.v4_try_date(vd.dev ->> 'installDate'),
                public.v4_try_date(vd.dev ->> 'filterPurchaseDate'),
                (SELECT max(public.v4_try_date(vr.rec ->> 'date')) FROM public.v4_v3_replacements vr WHERE vr.device_legacy_id = vd.legacy_id)
            ) AS v3_last_service
        FROM public.v4_v3_devices vd
        LEFT JOIN public.devices d ON d.legacy_id = vd.legacy_id
    ),
    counts AS (
        SELECT 1 AS n, '客户数量' AS item, (SELECT count(*) FROM public.customers) AS e,
               (SELECT count(*) FROM public.clients WHERE legacy_id IS NOT NULL) AS a
        UNION ALL SELECT 2, '装机记录数量', (SELECT count(*) FROM public.v4_v3_devices),
               (SELECT count(*) FROM public.devices WHERE legacy_id IS NOT NULL)
        UNION ALL SELECT 3, '换芯记录数量', (SELECT count(*) FROM public.v4_v3_replacements),
               (SELECT count(*) FROM public.replacements WHERE legacy_id IS NOT NULL)
        UNION ALL SELECT 4, '跟踪记录数量', (SELECT count(*) FROM public.v4_v3_follow_ups),
               (SELECT count(*) FROM public.follow_ups WHERE legacy_id IS NOT NULL)
        UNION ALL SELECT 5, '未收款数量', (SELECT count(*) FROM public.v4_v3_devices WHERE public.v4_try_bool(dev -> 'hasUnpaid')),
               (SELECT count(*) FROM public.receivables WHERE legacy_id IS NOT NULL)
        UNION ALL SELECT 6, '换芯费用合计（分）',
               (SELECT COALESCE(sum(round(GREATEST(COALESCE(public.v4_try_numeric(rec ->> 'cost'), 0), 0) * 100)), 0)::bigint FROM public.v4_v3_replacements),
               (SELECT COALESCE(sum(round(cost * 100)), 0)::bigint FROM public.replacements WHERE legacy_id IS NOT NULL)
        UNION ALL SELECT 7, '客户资料不一致（负责人/名称/省份/区域/长期合作）', 0,
               (SELECT count(*) FROM public.customers c JOIN public.clients cl ON cl.legacy_id = c.id
                WHERE cl.owner_id IS DISTINCT FROM c.user_id
                   OR cl.name <> COALESCE(NULLIF(btrim(c.data ->> 'name'), ''), '（未命名客户）')
                   OR cl.province <> COALESCE(c.data ->> 'province', '')
                   OR cl.region <> COALESCE(c.data ->> 'region', '')
                   OR cl.long_term_partner <> public.v4_try_bool(c.data -> 'longTermPartner'))
        UNION ALL SELECT 8, '装机记录内容不一致（地址/联系人/电话/型号/位置/备注/日期/数量/周期/验水）', 0,
               (SELECT count(*) FROM v3_dev vd JOIN public.devices d ON d.id = vd.new_id
                WHERE d.address <> COALESCE(vd.dev ->> 'address', '')
                   OR d.contact_person <> COALESCE(vd.dev ->> 'contactPerson', '')
                   OR d.phone <> COALESCE(vd.dev ->> 'phoneNumber', '')
                   OR d.model <> COALESCE(vd.dev ->> 'model', '')
                   OR d.location <> COALESCE(vd.dev ->> 'location', '')
                   OR d.notes <> COALESCE(vd.dev ->> 'notes', '')
                   OR d.install_date IS DISTINCT FROM public.v4_try_date(vd.dev ->> 'installDate')
                   OR d.filter_purchase_date IS DISTINCT FROM public.v4_try_date(vd.dev ->> 'filterPurchaseDate')
                   OR d.quantity IS DISTINCT FROM public.v4_try_int_between(vd.dev ->> 'quantity', 1, 1000000)
                   OR d.interval_days IS DISTINCT FROM public.v4_try_int_between(vd.dev ->> 'customInterval', 1, 3650)
                   OR d.need_water_test <> public.v4_try_bool(vd.dev -> 'needWaterTest'))
        UNION ALL SELECT 9, '换芯记录内容不一致（日期/型号/数量/操作人/备注）', 0,
               (SELECT count(*) FROM public.v4_v3_replacements vr JOIN public.replacements r ON r.legacy_id = vr.legacy_id
                WHERE r.replaced_on IS DISTINCT FROM public.v4_try_date(vr.rec ->> 'date')
                   OR r.filter_model <> COALESCE(vr.rec ->> 'filterModel', '')
                   OR r.quantity <> COALESCE(public.v4_try_int_between(vr.rec ->> 'quantity', 1, 1000000), 1)
                   OR r.operator_name <> COALESCE(vr.rec ->> 'operator', '')
                   OR r.notes <> COALESCE(vr.rec ->> 'notes', ''))
        UNION ALL SELECT 10, '跟踪记录内容不一致（日期/内容/操作人）', 0,
               (SELECT count(*) FROM public.v4_v3_follow_ups vf JOIN public.follow_ups f ON f.legacy_id = vf.legacy_id
                WHERE f.followed_on IS DISTINCT FROM public.v4_try_date(vf.rec ->> 'date')
                   OR f.content <> COALESCE(vf.rec ->> 'content', '')
                   OR f.operator_name <> COALESCE(vf.rec ->> 'operator', ''))
        UNION ALL SELECT 11, '下次换芯日期与 V3 不一致', 0,
               (SELECT count(*) FROM v3_dev vd JOIN public.device_overview o ON o.id = vd.new_id
                WHERE o.next_due_on IS DISTINCT FROM vd.v3_last_service
                      + COALESCE(public.v4_try_int_between(vd.dev ->> 'customInterval', 1, 3650),
                                 public.v4_setting_int('replacement_interval_days', 90)))
        UNION ALL SELECT 12, '下次催款日期与 V3 不一致', 0,
               (SELECT count(*) FROM v3_dev vd
                JOIN public.receivables rc ON rc.legacy_id = vd.legacy_id || ':unpaid'
                JOIN public.receivable_overview o ON o.id = rc.id
                WHERE o.next_remind_on IS DISTINCT FROM COALESCE(
                          GREATEST(
                              (SELECT max(public.v4_try_date(vf.rec ->> 'date')) FROM public.v4_v3_follow_ups vf
                               WHERE vf.client_legacy_id = vd.client_legacy_id),
                              vd.v3_last_service),
                          (COALESCE(public.v4_try_timestamp(vd.dev ->> 'createdAt'), rc.created_at) AT TIME ZONE 'Asia/Shanghai')::date)
                      + COALESCE(public.v4_try_int_between(vd.dev ->> 'unpaidInterval', 1, 3650),
                                 public.v4_setting_int('unpaid_interval_days', 30)))
        UNION ALL SELECT 13, '迁移后的客户在 V4 中看不到（负责人账号不存在）', 0,
               (SELECT count(*) FROM public.clients cl WHERE cl.legacy_id IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM public.members m WHERE m.uid = cl.owner_id))
    )
    SELECT item, e, a, e = a FROM counts ORDER BY n;
$$;

-- V3 中填了内容、但无法识别而按空值迁移的字段
CREATE OR REPLACE FUNCTION public.v4_migration_anomalies()
RETURNS TABLE (legacy_id text, field text, raw_value text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT vd.legacy_id, f.field, f.raw
    FROM public.v4_v3_devices vd
    CROSS JOIN LATERAL (VALUES
        ('installDate', vd.dev ->> 'installDate', public.v4_try_date(vd.dev ->> 'installDate') IS NULL),
        ('filterPurchaseDate', vd.dev ->> 'filterPurchaseDate', public.v4_try_date(vd.dev ->> 'filterPurchaseDate') IS NULL),
        ('quantity', vd.dev ->> 'quantity', public.v4_try_int_between(vd.dev ->> 'quantity', 1, 1000000) IS NULL),
        ('customInterval', vd.dev ->> 'customInterval', public.v4_try_int_between(vd.dev ->> 'customInterval', 1, 3650) IS NULL),
        ('unpaidInterval', vd.dev ->> 'unpaidInterval', public.v4_try_int_between(vd.dev ->> 'unpaidInterval', 1, 3650) IS NULL)
    ) AS f(field, raw, bad)
    WHERE f.bad AND COALESCE(btrim(f.raw), '') <> ''
    UNION ALL
    SELECT vr.legacy_id, f.field, f.raw
    FROM public.v4_v3_replacements vr
    CROSS JOIN LATERAL (VALUES
        ('date', vr.rec ->> 'date', public.v4_try_date(vr.rec ->> 'date') IS NULL),
        ('quantity', vr.rec ->> 'quantity', public.v4_try_int_between(vr.rec ->> 'quantity', 1, 1000000) IS NULL),
        ('cost', vr.rec ->> 'cost', public.v4_try_numeric(vr.rec ->> 'cost') IS NULL OR public.v4_try_numeric(vr.rec ->> 'cost') < 0)
    ) AS f(field, raw, bad)
    WHERE f.bad AND COALESCE(btrim(f.raw), '') <> ''
    UNION ALL
    SELECT vf.legacy_id, 'date', vf.rec ->> 'date'
    FROM public.v4_v3_follow_ups vf
    WHERE public.v4_try_date(vf.rec ->> 'date') IS NULL AND COALESCE(btrim(vf.rec ->> 'date'), '') <> '';
$$;

REVOKE ALL ON FUNCTION public.v4_migrate_from_v3(boolean), public.v4_migration_report(), public.v4_migration_anomalies()
    FROM PUBLIC, anon, authenticated;
