-- V4 权限与规则自动测试（只能在测试环境执行）
-- 整个测试在一个事务里，最后 ROLLBACK，不会留下任何数据。任何一条检查失败都会报错 "FAIL: ..."。
-- 用 SET LOCAL ROLE authenticated + request.jwt.claims 模拟不同账号登录后的请求，和网页端经过的权限完全一样。
--
-- 角色：t_admin 管理员；t_a、t_b 普通成员（各自负责客户）；t_c 普通成员（只被派单）

BEGIN;

INSERT INTO public.members (uid, username, role) VALUES
    ('t_admin', '测试管理员', 'admin'),
    ('t_a', '成员甲', 'member'),
    ('t_b', '成员乙', 'member'),
    ('t_c', '成员丙', 'member');

-- ===== 成员甲：新建客户、设备 =====
SELECT set_config('request.jwt.claims', '{"sub":"t_a"}', true);
SET LOCAL ROLE authenticated;

INSERT INTO public.clients (id, name, region, created_at)
VALUES ('00000000-0000-0000-0000-0000000000a1', '甲的客户', '深圳', '2000-01-01');

INSERT INTO public.devices (id, client_id, address, phone, install_date)
VALUES ('00000000-0000-0000-0000-00000000ad01', '00000000-0000-0000-0000-0000000000a1', 'A栋', '13800000000', '2026-01-01');

DO $$ BEGIN
    IF (SELECT owner_id FROM public.clients WHERE id = '00000000-0000-0000-0000-0000000000a1') <> 't_a' THEN
        RAISE EXCEPTION 'FAIL: 负责人应默认为自己';
    END IF;
    IF (SELECT created_at::date FROM public.clients WHERE id = '00000000-0000-0000-0000-0000000000a1') = '2000-01-01' THEN
        RAISE EXCEPTION 'FAIL: 网页端不能伪造创建时间';
    END IF;
    IF (SELECT created_by || version FROM public.clients WHERE id = '00000000-0000-0000-0000-0000000000a1') <> 't_a1' THEN
        RAISE EXCEPTION 'FAIL: created_by / version 未自动设置';
    END IF;
END $$;

-- 不能把新客户的负责人写成别人
DO $$ BEGIN
    BEGIN
        INSERT INTO public.clients (name, owner_id) VALUES ('冒名客户', 't_b');
        RAISE EXCEPTION 'FAIL: 成员不应能替别人建客户';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END $$;

-- ===== 成员乙：自己的客户 =====
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"t_b"}', true);
SET LOCAL ROLE authenticated;

INSERT INTO public.clients (id, name) VALUES ('00000000-0000-0000-0000-0000000000b1', '乙的客户');
INSERT INTO public.devices (id, client_id, address) VALUES ('00000000-0000-0000-0000-00000000bd01', '00000000-0000-0000-0000-0000000000b1', 'B栋');

DO $$ BEGIN
    IF (SELECT count(*) FROM public.clients) <> 1 THEN RAISE EXCEPTION 'FAIL: 乙应只看到 1 个客户'; END IF;
    IF (SELECT count(*) FROM public.devices) <> 1 THEN RAISE EXCEPTION 'FAIL: 乙应只看到 1 台设备'; END IF;
    IF (SELECT count(*) FROM public.device_overview) <> 1 THEN RAISE EXCEPTION 'FAIL: 视图也应按权限过滤'; END IF;
END $$;

-- ===== 回到成员甲：越权操作都应失败 =====
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"t_a"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE n integer;
BEGIN
    IF (SELECT count(*) FROM public.clients) <> 1 THEN RAISE EXCEPTION 'FAIL: 甲应只看到 1 个客户'; END IF;

    BEGIN
        INSERT INTO public.devices (client_id, address) VALUES ('00000000-0000-0000-0000-0000000000b1', '偷加');
        RAISE EXCEPTION 'FAIL: 不能往别人的客户下加设备';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        INSERT INTO public.replacements (device_id, replaced_on) VALUES ('00000000-0000-0000-0000-00000000bd01', '2026-02-01');
        RAISE EXCEPTION 'FAIL: 不能给别人的设备登记换芯';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    UPDATE public.clients SET name = '改名' WHERE id = '00000000-0000-0000-0000-0000000000b1';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL: 不能修改别人的客户'; END IF;

    BEGIN
        UPDATE public.clients SET owner_id = 't_b' WHERE id = '00000000-0000-0000-0000-0000000000a1';
        RAISE EXCEPTION 'FAIL: 成员不能把客户转给别人';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    DELETE FROM public.clients WHERE id = '00000000-0000-0000-0000-0000000000a1';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL: 成员不能彻底删除'; END IF;

    BEGIN
        INSERT INTO public.audit_log (table_name, action) VALUES ('clients', 'insert');
        RAISE EXCEPTION 'FAIL: 不能伪造操作日志';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END $$;

-- ===== 版本号与并发冲突 =====
DO $$
DECLARE n integer;
BEGIN
    UPDATE public.clients SET name = '甲的客户（改）' WHERE id = '00000000-0000-0000-0000-0000000000a1' AND version = 1;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'FAIL: 带正确版本号应能更新'; END IF;
    IF (SELECT version FROM public.clients WHERE id = '00000000-0000-0000-0000-0000000000a1') <> 2 THEN
        RAISE EXCEPTION 'FAIL: 版本号应变为 2';
    END IF;
    UPDATE public.clients SET name = '过期的修改' WHERE id = '00000000-0000-0000-0000-0000000000a1' AND version = 1;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL: 旧版本号的修改应被拒绝（冲突）'; END IF;
END $$;

-- ===== 到期计算 =====
DO $$ BEGIN
    IF (SELECT next_due_on FROM public.device_overview WHERE id = '00000000-0000-0000-0000-00000000ad01') <> '2026-04-01' THEN
        RAISE EXCEPTION 'FAIL: 装机 2026-01-01 + 默认 90 天应为 2026-04-01';
    END IF;
END $$;

INSERT INTO public.replacements (id, device_id, replaced_on, cost)
VALUES ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000ad01', '2026-03-01', 80);

DO $$ BEGIN
    IF (SELECT client_id FROM public.replacements WHERE id = '00000000-0000-0000-0000-0000000000e1') <> '00000000-0000-0000-0000-0000000000a1' THEN
        RAISE EXCEPTION 'FAIL: 换芯记录的 client_id 应自动填写';
    END IF;
    IF (SELECT next_due_on FROM public.device_overview WHERE id = '00000000-0000-0000-0000-00000000ad01') <> '2026-05-30' THEN
        RAISE EXCEPTION 'FAIL: 换芯 2026-03-01 + 90 天应为 2026-05-30';
    END IF;
END $$;

-- 滤芯分级：PP 棉 30 天、RO 膜 365 天
INSERT INTO public.filter_stages (id, device_id, position, name, interval_days) VALUES
    ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000ad01', 1, 'PP 棉', 30),
    ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000ad01', 2, 'RO 膜', 365);
INSERT INTO public.replacements (device_id, stage_id, replaced_on)
VALUES ('00000000-0000-0000-0000-00000000ad01', '00000000-0000-0000-0000-0000000000f1', '2026-04-01');

DO $$ BEGIN
    IF (SELECT next_due_on FROM public.filter_stage_overview WHERE id = '00000000-0000-0000-0000-0000000000f1') <> '2026-05-01' THEN
        RAISE EXCEPTION 'FAIL: PP 棉 2026-04-01 + 30 天应为 2026-05-01';
    END IF;
    IF (SELECT next_due_on FROM public.filter_stage_overview WHERE id = '00000000-0000-0000-0000-0000000000f2') <> '2027-03-01' THEN
        RAISE EXCEPTION 'FAIL: RO 膜从整机换芯 2026-03-01 起 365 天应为 2027-03-01';
    END IF;
    IF (SELECT next_due_on FROM public.device_overview WHERE id = '00000000-0000-0000-0000-00000000ad01') <> '2026-05-01' THEN
        RAISE EXCEPTION 'FAIL: 设备到期应取最早到期的一级';
    END IF;
END $$;

-- ===== 应收与收款 =====
INSERT INTO public.receivables (id, client_id, device_id, title, amount, billed_on)
VALUES ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000ad01', '换芯费', 100, '2026-03-01');
INSERT INTO public.payments (receivable_id, amount, paid_on) VALUES ('00000000-0000-0000-0000-0000000000c1', 30, '2026-03-10');

DO $$ BEGIN
    IF (SELECT outstanding FROM public.receivable_overview WHERE id = '00000000-0000-0000-0000-0000000000c1') <> 70 THEN
        RAISE EXCEPTION 'FAIL: 未收余额应为 70';
    END IF;
    IF (SELECT settled FROM public.receivable_overview WHERE id = '00000000-0000-0000-0000-0000000000c1') THEN
        RAISE EXCEPTION 'FAIL: 尚未结清';
    END IF;
    -- 催款基准取最晚的：设备上次服务 2026-04-01（PP 棉换芯）> 收款 2026-03-10 > 开单 2026-03-01
    IF (SELECT next_remind_on FROM public.receivable_overview WHERE id = '00000000-0000-0000-0000-0000000000c1') <> '2026-05-01' THEN
        RAISE EXCEPTION 'FAIL: 下次催款应为 2026-04-01 + 30 天';
    END IF;
    IF (SELECT outstanding_total FROM public.client_overview WHERE id = '00000000-0000-0000-0000-0000000000a1') <> 70 THEN
        RAISE EXCEPTION 'FAIL: 客户总览的欠款合计应为 70';
    END IF;
END $$;

INSERT INTO public.payments (receivable_id, amount, paid_on) VALUES ('00000000-0000-0000-0000-0000000000c1', 70, '2026-03-20');

DO $$ BEGIN
    IF NOT (SELECT settled FROM public.receivable_overview WHERE id = '00000000-0000-0000-0000-0000000000c1') THEN
        RAISE EXCEPTION 'FAIL: 收满后应结清';
    END IF;
    IF (SELECT next_remind_on FROM public.receivable_overview WHERE id = '00000000-0000-0000-0000-0000000000c1') IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL: 结清后不再提醒';
    END IF;
END $$;

-- ===== 派单：甲把工单派给丙 =====
INSERT INTO public.work_orders (id, client_id, device_id, type, assignee_id, title)
VALUES ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000ad01', 'replacement', 't_c', '上门换芯');

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"t_c"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE n integer;
BEGIN
    IF (SELECT count(*) FROM public.clients) <> 1 THEN RAISE EXCEPTION 'FAIL: 丙应能看到被派单的客户'; END IF;
    IF (SELECT count(*) FROM public.devices) <> 1 THEN RAISE EXCEPTION 'FAIL: 丙应能看到该客户的设备'; END IF;
    IF (SELECT count(*) FROM public.work_orders) <> 1 THEN RAISE EXCEPTION 'FAIL: 丙应能看到自己的工单'; END IF;

    UPDATE public.clients SET name = '丙改名' WHERE id = '00000000-0000-0000-0000-0000000000a1';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL: 被指派人不能改客户资料'; END IF;

    UPDATE public.replacements SET notes = '丙改别人的记录' WHERE id = '00000000-0000-0000-0000-0000000000e1';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL: 被指派人不能改别人登记的换芯记录'; END IF;

    BEGIN
        UPDATE public.work_orders SET title = '改标题' WHERE id = '00000000-0000-0000-0000-0000000000d1';
        RAISE EXCEPTION 'FAIL: 被指派人不能改工单标题';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        UPDATE public.work_orders SET status = 'cancelled' WHERE id = '00000000-0000-0000-0000-0000000000d1';
        RAISE EXCEPTION 'FAIL: 被指派人不能取消工单';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END $$;

-- 丙上门完成：登记换芯 + 完成工单
INSERT INTO public.replacements (id, device_id, work_order_id, replaced_on, operator_name)
VALUES ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000ad01', '00000000-0000-0000-0000-0000000000d1', '2026-04-20', '成员丙');
UPDATE public.replacements SET notes = '补充说明' WHERE id = '00000000-0000-0000-0000-0000000000e2';
UPDATE public.work_orders SET status = 'done', result = '已更换' WHERE id = '00000000-0000-0000-0000-0000000000d1';

DO $$ BEGIN
    IF (SELECT notes FROM public.replacements WHERE id = '00000000-0000-0000-0000-0000000000e2') <> '补充说明' THEN
        RAISE EXCEPTION 'FAIL: 被指派人应能修改自己登记的记录';
    END IF;
    IF (SELECT completed_by FROM public.work_orders WHERE id = '00000000-0000-0000-0000-0000000000d1') IS DISTINCT FROM 't_c' THEN
        RAISE EXCEPTION 'FAIL: 完成人应自动记录为丙';
    END IF;
    IF (SELECT count(*) FROM public.clients WHERE id = '00000000-0000-0000-0000-0000000000b1') <> 0 THEN
        RAISE EXCEPTION 'FAIL: 丙不应看到乙的客户';
    END IF;
END $$;

-- ===== 甲取消工单后，丙失去该客户的访问权 =====
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"t_a"}', true);
SET LOCAL ROLE authenticated;
UPDATE public.work_orders SET status = 'cancelled' WHERE id = '00000000-0000-0000-0000-0000000000d1';

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"t_c"}', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
    IF (SELECT count(*) FROM public.clients) <> 0 THEN RAISE EXCEPTION 'FAIL: 工单取消后丙不应再看到客户'; END IF;
END $$;

-- ===== 软删除与操作日志 =====
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"t_a"}', true);
SET LOCAL ROLE authenticated;
UPDATE public.devices SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-00000000ad01';

DO $$ BEGIN
    IF (SELECT count(*) FROM public.device_overview) <> 0 THEN RAISE EXCEPTION 'FAIL: 软删除的设备不应出现在列表'; END IF;
    IF (SELECT count(*) FROM public.devices WHERE deleted_at IS NOT NULL) <> 1 THEN RAISE EXCEPTION 'FAIL: 回收站应能看到已删除设备'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE table_name = 'devices' AND action = 'soft_delete' AND actor_id = 't_a') THEN
        RAISE EXCEPTION 'FAIL: 软删除应写入操作日志';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE table_name = 'clients' AND action = 'update'
                   AND changes -> 'name' ->> 1 = '甲的客户（改）' AND NOT (changes ? 'version')) THEN
        RAISE EXCEPTION 'FAIL: 修改日志应只记录变化的字段';
    END IF;
    IF EXISTS (SELECT 1 FROM public.audit_log WHERE actor_id <> 't_a') THEN
        RAISE EXCEPTION 'FAIL: 成员只能看到自己的操作日志';
    END IF;
END $$;

UPDATE public.devices SET deleted_at = NULL WHERE id = '00000000-0000-0000-0000-00000000ad01';
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE table_name = 'devices' AND action = 'restore') THEN
        RAISE EXCEPTION 'FAIL: 恢复应写入操作日志';
    END IF;
END $$;

-- ===== 管理员 =====
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"t_admin"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE n integer;
BEGIN
    IF (SELECT count(*) FROM public.clients WHERE id IN ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1')) <> 2 THEN
        RAISE EXCEPTION 'FAIL: 管理员应看到全部客户';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE actor_id = 't_c') THEN RAISE EXCEPTION 'FAIL: 管理员应看到全部日志'; END IF;
    IF (SELECT owner_name FROM public.client_overview WHERE id = '00000000-0000-0000-0000-0000000000b1') <> '成员乙' THEN
        RAISE EXCEPTION 'FAIL: 应显示负责人姓名';
    END IF;

    UPDATE public.clients SET owner_id = 't_a' WHERE id = '00000000-0000-0000-0000-0000000000b1';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'FAIL: 管理员应能转移客户'; END IF;

    DELETE FROM public.clients WHERE id = '00000000-0000-0000-0000-0000000000b1';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'FAIL: 管理员应能彻底删除'; END IF;
    IF (SELECT count(*) FROM public.devices WHERE client_id = '00000000-0000-0000-0000-0000000000b1') <> 0 THEN
        RAISE EXCEPTION 'FAIL: 彻底删除客户应连带删除设备';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE action = 'delete' AND table_name = 'devices') THEN
        RAISE EXCEPTION 'FAIL: 彻底删除应写入日志（含连带删除的设备）';
    END IF;

    UPDATE public.app_settings SET value = '60' WHERE key = 'replacement_interval_days';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'FAIL: 管理员应能改系统设置'; END IF;
END $$;

-- 即使是管理员，网页端也不能执行迁移、读 V3 原始数据或碰备份
DO $$ BEGIN
    BEGIN
        PERFORM public.v4_migrate_from_v3(true);
        RAISE EXCEPTION 'FAIL: 网页端不能执行迁移';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        PERFORM 1 FROM public.v4_v3_devices;
        RAISE EXCEPTION 'FAIL: 网页端不能读迁移用的 V3 展开视图';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    IF to_regnamespace('backup') IS NOT NULL THEN
        BEGIN
            EXECUTE 'SELECT 1 FROM backup.snapshot_runs';
            RAISE EXCEPTION 'FAIL: 网页端不能读备份';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
    END IF;
END $$;

-- 普通成员不能改系统设置
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"t_a"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n integer;
BEGIN
    UPDATE public.app_settings SET value = '1' WHERE key = 'replacement_interval_days';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL: 成员不能改系统设置'; END IF;
    IF (SELECT count(*) FROM public.v4_member_directory()) < 4 THEN RAISE EXCEPTION 'FAIL: 通讯录应列出所有成员'; END IF;
END $$;

-- ===== 未登录 =====
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE anon;
DO $$ BEGIN
    BEGIN
        PERFORM 1 FROM public.clients;
        RAISE EXCEPTION 'FAIL: 未登录不能读客户';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        PERFORM 1 FROM public.device_overview;
        RAISE EXCEPTION 'FAIL: 未登录不能读视图';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END $$;

RESET ROLE;
SELECT 'ALL PASSED' AS result;
ROLLBACK;
