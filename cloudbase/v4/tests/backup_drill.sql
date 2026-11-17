-- 备份恢复演练（只能在测试环境执行；整个过程在一个事务里，最后 ROLLBACK，不留痕迹）
-- 步骤：拍快照 → 管理员彻底删除记录最多的客户、同时改另一个客户 → 从快照恢复被删客户
-- 检查：被删客户的全部记录与删除前逐字段一致；另一个客户的修改不受恢复影响

BEGIN;

CREATE TEMP TABLE drill AS
SELECT c.id AS client_id, (SELECT backup.take_snapshot('恢复演练')) AS run_id
FROM public.clients c
ORDER BY (SELECT count(*) FROM public.replacements r WHERE r.client_id = c.id)
       + (SELECT count(*) FROM public.devices d WHERE d.client_id = c.id) DESC
LIMIT 1;

-- 指纹：该客户在各表中的全部记录（去掉会随修改自动变化的 updated_at / updated_by / version）
CREATE TEMP TABLE fingerprint_before AS
SELECT t.name AS table_name, md5(COALESCE(string_agg(t.r::text, '|' ORDER BY t.r ->> 'id'), '')) AS hash, count(t.r) AS n
FROM (
    SELECT 'clients' AS name, to_jsonb(x) - ARRAY['updated_at', 'updated_by', 'version'] AS r FROM public.clients x WHERE x.id = (SELECT client_id FROM drill)
    UNION ALL SELECT 'devices', to_jsonb(x) - ARRAY['updated_at', 'updated_by', 'version'] FROM public.devices x WHERE x.client_id = (SELECT client_id FROM drill)
    UNION ALL SELECT 'replacements', to_jsonb(x) - ARRAY['updated_at', 'updated_by', 'version'] FROM public.replacements x WHERE x.client_id = (SELECT client_id FROM drill)
    UNION ALL SELECT 'follow_ups', to_jsonb(x) - ARRAY['updated_at', 'updated_by', 'version'] FROM public.follow_ups x WHERE x.client_id = (SELECT client_id FROM drill)
    UNION ALL SELECT 'receivables', to_jsonb(x) - ARRAY['updated_at', 'updated_by', 'version'] FROM public.receivables x WHERE x.client_id = (SELECT client_id FROM drill)
) t
GROUP BY t.name;

DO $$ BEGIN
    IF (SELECT sum(n) FROM fingerprint_before) < 5 THEN RAISE EXCEPTION 'FAIL: 演练客户的记录太少，不具代表性'; END IF;
END $$;

-- 事故：管理员误删该客户（连带删除设备、换芯、跟踪、应收），并修改了另一个客户
UPDATE public.clients SET notes = '演练中的修改' WHERE id = (SELECT id FROM public.clients WHERE id <> (SELECT client_id FROM drill) ORDER BY id LIMIT 1);
DELETE FROM public.clients WHERE id = (SELECT client_id FROM drill);

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.devices WHERE client_id = (SELECT client_id FROM drill)) THEN RAISE EXCEPTION 'FAIL: 删除未连带生效'; END IF;
END $$;

-- 恢复
SELECT backup.restore_client((SELECT run_id FROM drill), (SELECT client_id FROM drill)) AS restored;

DO $$
DECLARE v record;
BEGIN
    FOR v IN
        SELECT b.table_name, b.hash AS before_hash, a.hash AS after_hash, b.n AS before_n, a.n AS after_n
        FROM fingerprint_before b
        LEFT JOIN (
            SELECT t.name AS table_name, md5(COALESCE(string_agg(t.r::text, '|' ORDER BY t.r ->> 'id'), '')) AS hash, count(t.r) AS n
            FROM (
                SELECT 'clients' AS name, to_jsonb(x) - ARRAY['updated_at', 'updated_by', 'version'] AS r FROM public.clients x WHERE x.id = (SELECT client_id FROM drill)
                UNION ALL SELECT 'devices', to_jsonb(x) - ARRAY['updated_at', 'updated_by', 'version'] FROM public.devices x WHERE x.client_id = (SELECT client_id FROM drill)
                UNION ALL SELECT 'replacements', to_jsonb(x) - ARRAY['updated_at', 'updated_by', 'version'] FROM public.replacements x WHERE x.client_id = (SELECT client_id FROM drill)
                UNION ALL SELECT 'follow_ups', to_jsonb(x) - ARRAY['updated_at', 'updated_by', 'version'] FROM public.follow_ups x WHERE x.client_id = (SELECT client_id FROM drill)
                UNION ALL SELECT 'receivables', to_jsonb(x) - ARRAY['updated_at', 'updated_by', 'version'] FROM public.receivables x WHERE x.client_id = (SELECT client_id FROM drill)
            ) t
            GROUP BY t.name
        ) a USING (table_name)
    LOOP
        IF v.after_hash IS DISTINCT FROM v.before_hash THEN
            RAISE EXCEPTION 'FAIL: % 恢复后与删除前不一致（% 条 → % 条）', v.table_name, v.before_n, v.after_n;
        END IF;
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM public.clients WHERE notes = '演练中的修改') THEN
        RAISE EXCEPTION 'FAIL: 恢复不应影响其他客户';
    END IF;
END $$;

SELECT 'DRILL PASSED' AS result,
       (SELECT string_agg(table_name || '=' || n, ', ' ORDER BY table_name) FROM fingerprint_before) AS restored_rows;
ROLLBACK;
