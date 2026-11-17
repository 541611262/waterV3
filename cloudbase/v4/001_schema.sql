-- V4 关系型数据结构（可重复执行，需先执行 ../schema.sql）
-- 与 V3 的 customers 表并存：V4 的客户表叫 clients，迁移和试用期间旧版照常使用、互不影响。
--
-- 所有业务表的共同约定：
--   id uuid；created_at / created_by / updated_at / updated_by 由触发器自动维护，网页端无法伪造
--   version：每次修改自动 +1。网页端更新时带上 .eq('version', 原值)，返回 0 行即说明别人已改过（冲突）
--   deleted_at：软删除（回收站）。普通成员只能软删除；彻底删除只有管理员可以
--   client_id：子表都冗余一份所属客户，由触发器根据 device_id / receivable_id 自动填写，权限统一按客户判断
--   所有增删改都由触发器写入 audit_log（操作日志）
--
-- 权限（RLS）：
--   管理员：全部
--   客户负责人（clients.owner_id）：该客户的全部数据
--   工单被指派人：能看到该客户的资料，能登记换芯、跟踪、收款，能更新自己工单的状态和结果

-- ---------- 系统设置 ----------
CREATE TABLE IF NOT EXISTS public.app_settings (
    key        text PRIMARY KEY,
    value      jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_settings (key, value) VALUES
    ('replacement_interval_days', '90'),
    ('unpaid_interval_days', '30')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.v4_setting_int(p_key text, p_default integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((SELECT (value #>> '{}')::integer FROM public.app_settings WHERE key = p_key), p_default);
$$;

-- 北京时间的"今天"
CREATE OR REPLACE FUNCTION public.v4_today()
RETURNS date
LANGUAGE sql
STABLE
AS $$
    SELECT (now() AT TIME ZONE 'Asia/Shanghai')::date;
$$;

-- ---------- 客户 ----------
CREATE TABLE IF NOT EXISTS public.clients (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id          varchar(64) NOT NULL DEFAULT auth.uid(),
    name              text        NOT NULL CHECK (btrim(name) <> ''),
    province          text        NOT NULL DEFAULT '',
    region            text        NOT NULL DEFAULT '',
    long_term_partner boolean     NOT NULL DEFAULT false,
    notes             text        NOT NULL DEFAULT '',
    legacy_id         text        UNIQUE,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        varchar(64),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    updated_by        varchar(64),
    deleted_at        timestamptz,
    version           integer     NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS clients_owner_idx ON public.clients (owner_id);
CREATE INDEX IF NOT EXISTS clients_name_idx ON public.clients (name);

-- ---------- 装机记录（设备） ----------
CREATE TABLE IF NOT EXISTS public.devices (
    id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id            uuid        NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
    address              text        NOT NULL DEFAULT '',
    contact_person       text        NOT NULL DEFAULT '',
    phone                text        NOT NULL DEFAULT '',
    install_date         date,
    model                text        NOT NULL DEFAULT '',
    quantity             integer     CHECK (quantity > 0),
    location             text        NOT NULL DEFAULT '',
    filter_purchase_date date,
    interval_days        integer     CHECK (interval_days BETWEEN 1 AND 3650),
    need_water_test      boolean     NOT NULL DEFAULT false,
    notes                text        NOT NULL DEFAULT '',
    legacy_id            text        UNIQUE,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           varchar(64),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    updated_by           varchar(64),
    deleted_at           timestamptz,
    version              integer     NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS devices_client_idx ON public.devices (client_id);

-- ---------- 滤芯分级：一台设备的每一级滤芯各自的周期 ----------
-- 设备没有分级时，按设备的 interval_days（或系统默认周期）整体计算
CREATE TABLE IF NOT EXISTS public.filter_stages (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id     uuid        NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
    device_id     uuid        NOT NULL REFERENCES public.devices (id) ON DELETE CASCADE,
    position      smallint    NOT NULL DEFAULT 1,
    name          text        NOT NULL CHECK (btrim(name) <> ''),
    interval_days integer     NOT NULL CHECK (interval_days BETWEEN 1 AND 3650),
    started_on    date,
    notes         text        NOT NULL DEFAULT '',
    created_at    timestamptz NOT NULL DEFAULT now(),
    created_by    varchar(64),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    updated_by    varchar(64),
    deleted_at    timestamptz,
    version       integer     NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS filter_stages_device_idx ON public.filter_stages (device_id);

-- ---------- 工单 ----------
CREATE TABLE IF NOT EXISTS public.work_orders (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_no     bigint      GENERATED ALWAYS AS IDENTITY (START WITH 1001) UNIQUE,
    client_id    uuid        NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
    device_id    uuid        REFERENCES public.devices (id) ON DELETE SET NULL,
    type         text        NOT NULL DEFAULT 'replacement'
                             CHECK (type IN ('replacement', 'repair', 'water_test', 'install', 'collection', 'other')),
    status       text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
    assignee_id  varchar(64) REFERENCES public.members (uid) ON DELETE SET NULL,
    scheduled_on date,
    title        text        NOT NULL DEFAULT '',
    description  text        NOT NULL DEFAULT '',
    result       text        NOT NULL DEFAULT '',
    completed_at timestamptz,
    completed_by varchar(64),
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   varchar(64),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    updated_by   varchar(64),
    deleted_at   timestamptz,
    version      integer     NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS work_orders_client_idx ON public.work_orders (client_id);
CREATE INDEX IF NOT EXISTS work_orders_assignee_idx ON public.work_orders (assignee_id, status);

-- ---------- 换芯记录 ----------
-- stage_id 为空表示整机更换（所有级都重新计时）
CREATE TABLE IF NOT EXISTS public.replacements (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id     uuid          NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
    device_id     uuid          NOT NULL REFERENCES public.devices (id) ON DELETE CASCADE,
    stage_id      uuid          REFERENCES public.filter_stages (id) ON DELETE SET NULL,
    work_order_id uuid          REFERENCES public.work_orders (id) ON DELETE SET NULL,
    replaced_on   date,         -- V3 中有少量没填日期的历史记录，允许为空（不参与到期计算）
    filter_model  text          NOT NULL DEFAULT '',
    quantity      integer       NOT NULL DEFAULT 1 CHECK (quantity > 0),
    cost          numeric(12,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
    operator_name text          NOT NULL DEFAULT '',
    notes         text          NOT NULL DEFAULT '',
    legacy_id     text          UNIQUE,
    created_at    timestamptz   NOT NULL DEFAULT now(),
    created_by    varchar(64),
    updated_at    timestamptz   NOT NULL DEFAULT now(),
    updated_by    varchar(64),
    deleted_at    timestamptz,
    version       integer       NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS replacements_device_idx ON public.replacements (device_id, replaced_on);

-- ---------- 跟踪记录 ----------
CREATE TABLE IF NOT EXISTS public.follow_ups (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id     uuid        NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
    device_id     uuid        REFERENCES public.devices (id) ON DELETE SET NULL,
    followed_on   date,
    content       text        NOT NULL DEFAULT '',
    operator_name text        NOT NULL DEFAULT '',
    legacy_id     text        UNIQUE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    created_by    varchar(64),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    updated_by    varchar(64),
    deleted_at    timestamptz,
    version       integer     NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS follow_ups_client_idx ON public.follow_ups (client_id, followed_on);

-- ---------- 应收款 ----------
-- amount 为空表示"有欠款但金额未登记"（V3 迁移过来的未收款都是这种）
CREATE TABLE IF NOT EXISTS public.receivables (
    id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id            uuid          NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
    device_id            uuid          REFERENCES public.devices (id) ON DELETE SET NULL,
    title                text          NOT NULL DEFAULT '',
    amount               numeric(12,2) CHECK (amount >= 0),
    billed_on            date,
    remind_interval_days integer       CHECK (remind_interval_days BETWEEN 1 AND 3650),
    closed_at            timestamptz,
    notes                text          NOT NULL DEFAULT '',
    legacy_id            text          UNIQUE,
    created_at           timestamptz   NOT NULL DEFAULT now(),
    created_by           varchar(64),
    updated_at           timestamptz   NOT NULL DEFAULT now(),
    updated_by           varchar(64),
    deleted_at           timestamptz,
    version              integer       NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS receivables_client_idx ON public.receivables (client_id);

-- ---------- 收款记录 ----------
CREATE TABLE IF NOT EXISTS public.payments (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id     uuid          NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
    receivable_id uuid          NOT NULL REFERENCES public.receivables (id) ON DELETE CASCADE,
    amount        numeric(12,2) NOT NULL CHECK (amount > 0),
    paid_on       date          NOT NULL,
    method        text          NOT NULL DEFAULT '',
    notes         text          NOT NULL DEFAULT '',
    created_at    timestamptz   NOT NULL DEFAULT now(),
    created_by    varchar(64),
    updated_at    timestamptz   NOT NULL DEFAULT now(),
    updated_by    varchar(64),
    deleted_at    timestamptz,
    version       integer       NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS payments_receivable_idx ON public.payments (receivable_id);

-- ---------- 操作日志 ----------
CREATE TABLE IF NOT EXISTS public.audit_log (
    id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    at         timestamptz NOT NULL DEFAULT now(),
    actor_id   varchar(64),
    table_name text        NOT NULL,
    row_id     uuid,
    client_id  uuid,
    action     text        NOT NULL CHECK (action IN ('insert', 'update', 'delete', 'soft_delete', 'restore', 'migrate')),
    changes    jsonb       NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS audit_log_client_idx ON public.audit_log (client_id, at DESC);
CREATE INDEX IF NOT EXISTS audit_log_at_idx ON public.audit_log (at DESC);

-- ==================== 权限判断（SECURITY DEFINER：内部查询不受 RLS 限制，避免策略互相引用造成死循环） ====================

-- 能否修改该客户：管理员或负责人
CREATE OR REPLACE FUNCTION public.v4_can_write(p_client uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_admin() OR EXISTS (
        SELECT 1 FROM public.clients WHERE id = p_client AND owner_id = (SELECT auth.uid())
    );
$$;

-- 是否被指派了该客户的（未取消、未删除的）工单
CREATE OR REPLACE FUNCTION public.v4_is_assignee(p_client uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.work_orders
        WHERE client_id = p_client AND assignee_id = (SELECT auth.uid())
          AND status <> 'cancelled' AND deleted_at IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.v4_can_read(p_client uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.v4_can_write(p_client) OR public.v4_is_assignee(p_client);
$$;

-- 成员通讯录：派单时选择同事、显示负责人姓名用（不含角色）
CREATE OR REPLACE FUNCTION public.v4_member_directory()
RETURNS TABLE (uid varchar, username text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT m.uid, m.username FROM public.members m
    WHERE (SELECT auth.uid()) IS NOT NULL
    ORDER BY m.username;
$$;

-- ==================== 触发器 ====================

-- 自动维护创建 / 修改信息与版本号。
-- 网页端（已登录）写入时一律以服务器时间和当前账号为准；没有登录身份时（迁移脚本）才保留传入的 created_at
CREATE OR REPLACE FUNCTION public.v4_touch_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_uid text := auth.uid();
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF v_uid IS NOT NULL THEN
            NEW.created_at := now();
        END IF;
        NEW.created_at := COALESCE(NEW.created_at, now());
        NEW.created_by := COALESCE(v_uid, NEW.created_by);
        NEW.updated_at := now();
        NEW.updated_by := NEW.created_by;
        NEW.version := 1;
    ELSE
        NEW.id := OLD.id;
        NEW.created_at := OLD.created_at;
        NEW.created_by := OLD.created_by;
        NEW.updated_at := now();
        NEW.updated_by := COALESCE(v_uid, NEW.updated_by);
        NEW.version := OLD.version + 1;
    END IF;
    RETURN NEW;
END;
$$;

-- 子表的 client_id 跟随所属设备 / 应收款，网页端不用也不能自行指定
CREATE OR REPLACE FUNCTION public.v4_fill_client_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row jsonb := to_jsonb(NEW);
    v_client uuid;
BEGIN
    IF TG_TABLE_NAME = 'payments' THEN
        SELECT client_id INTO v_client FROM public.receivables WHERE id = NEW.receivable_id;
    ELSIF v_row ->> 'device_id' IS NOT NULL THEN
        SELECT client_id INTO v_client FROM public.devices WHERE id = (v_row ->> 'device_id')::uuid;
    END IF;
    IF v_client IS NOT NULL THEN
        NEW.client_id := v_client;
    END IF;
    RETURN NEW;
END;
$$;

-- 设备换到另一个客户名下时，它的子记录跟着走
CREATE OR REPLACE FUNCTION public.v4_cascade_device_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
        UPDATE public.filter_stages SET client_id = NEW.client_id WHERE device_id = NEW.id;
        UPDATE public.replacements SET client_id = NEW.client_id WHERE device_id = NEW.id;
        UPDATE public.follow_ups SET client_id = NEW.client_id WHERE device_id = NEW.id;
        UPDATE public.work_orders SET client_id = NEW.client_id WHERE device_id = NEW.id;
        UPDATE public.receivables SET client_id = NEW.client_id WHERE device_id = NEW.id;
        UPDATE public.payments p SET client_id = NEW.client_id
            FROM public.receivables r WHERE p.receivable_id = r.id AND r.device_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

-- 工单：被指派人（非负责人、非管理员）只能改状态和结果；完成时自动记录完成人和时间
CREATE OR REPLACE FUNCTION public.v4_guard_work_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL AND NOT public.v4_can_write(OLD.client_id) THEN
        IF (NEW.client_id, NEW.device_id, NEW.type, NEW.assignee_id, NEW.scheduled_on, NEW.title, NEW.description, NEW.deleted_at)
           IS DISTINCT FROM
           (OLD.client_id, OLD.device_id, OLD.type, OLD.assignee_id, OLD.scheduled_on, OLD.title, OLD.description, OLD.deleted_at) THEN
            RAISE EXCEPTION '只能修改工单的状态和处理结果' USING ERRCODE = '42501';
        END IF;
        IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
            RAISE EXCEPTION '取消工单请联系派单人' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF NEW.status = 'done' AND (TG_OP = 'INSERT' OR OLD.status <> 'done') THEN
        NEW.completed_at := COALESCE(NEW.completed_at, now());
        NEW.completed_by := COALESCE(auth.uid(), NEW.completed_by);
    ELSIF NEW.status <> 'done' THEN
        NEW.completed_at := NULL;
        NEW.completed_by := NULL;
    END IF;
    RETURN NEW;
END;
$$;

-- 操作日志。修改时只记录变化的字段：{"字段": [旧值, 新值]}
-- 迁移脚本会在事务内设置 app.skip_audit = on，避免为每一条历史数据写日志
CREATE OR REPLACE FUNCTION public.v4_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old     jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
    v_new     jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
    v_row     jsonb := COALESCE(v_new, v_old);
    v_meta    text[] := ARRAY['updated_at', 'updated_by', 'version'];
    v_changes jsonb := '{}';
    v_action  text := lower(TG_OP);
    v_key     text;
BEGIN
    IF current_setting('app.skip_audit', true) = 'on' THEN
        RETURN NULL;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
            IF v_key <> ALL (v_meta) AND (v_new -> v_key) IS DISTINCT FROM (v_old -> v_key) THEN
                v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_array(v_old -> v_key, v_new -> v_key));
            END IF;
        END LOOP;
        IF v_changes = '{}' THEN
            RETURN NULL;
        END IF;
        IF v_changes ? 'deleted_at' THEN
            v_action := CASE WHEN v_new ->> 'deleted_at' IS NULL THEN 'restore' ELSE 'soft_delete' END;
        END IF;
    ELSE
        v_changes := v_row - v_meta;
    END IF;

    INSERT INTO public.audit_log (actor_id, table_name, row_id, client_id, action, changes)
    VALUES (
        auth.uid(),
        TG_TABLE_NAME,
        (v_row ->> 'id')::uuid,
        CASE WHEN TG_TABLE_NAME = 'clients' THEN (v_row ->> 'id')::uuid ELSE (v_row ->> 'client_id')::uuid END,
        v_action,
        v_changes
    );
    RETURN NULL;
END;
$$;

-- 给所有业务表挂上触发器（触发器按名称顺序执行：a_ 先填 client_id，b_ 再维护版本号）
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['clients', 'devices', 'filter_stages', 'work_orders', 'replacements', 'follow_ups', 'receivables', 'payments'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS b_touch ON public.%I', t);
        EXECUTE format('CREATE TRIGGER b_touch BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.v4_touch_row()', t);
        EXECUTE format('DROP TRIGGER IF EXISTS z_audit ON public.%I', t);
        EXECUTE format('CREATE TRIGGER z_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.v4_audit()', t);
    END LOOP;
    FOREACH t IN ARRAY ARRAY['filter_stages', 'work_orders', 'replacements', 'follow_ups', 'receivables', 'payments'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS a_fill_client ON public.%I', t);
        EXECUTE format('CREATE TRIGGER a_fill_client BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.v4_fill_client_id()', t);
    END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS c_cascade_client ON public.devices;
CREATE TRIGGER c_cascade_client AFTER UPDATE OF client_id ON public.devices
    FOR EACH ROW EXECUTE FUNCTION public.v4_cascade_device_client();

DROP TRIGGER IF EXISTS c_guard ON public.work_orders;
CREATE TRIGGER c_guard BEFORE INSERT OR UPDATE ON public.work_orders
    FOR EACH ROW EXECUTE FUNCTION public.v4_guard_work_order();

-- ==================== 行级安全 ====================
DO $$
DECLARE
    t text;
    p record;
BEGIN
    FOREACH t IN ARRAY ARRAY['app_settings', 'clients', 'devices', 'filter_stages', 'work_orders', 'replacements', 'follow_ups', 'receivables', 'payments', 'audit_log'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
        FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
            EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
        END LOOP;
    END LOOP;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients, public.devices, public.filter_stages, public.work_orders,
    public.replacements, public.follow_ups, public.receivables, public.payments TO authenticated;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT SELECT, UPDATE ON public.app_settings TO authenticated;

-- 系统设置：所有人可读，管理员可改
CREATE POLICY app_settings_select ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY app_settings_update ON public.app_settings FOR UPDATE TO authenticated
    USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

-- 客户：负责人只能是自己（管理员可指定任何人）；彻底删除只有管理员
-- 直接用本行的 owner_id 判断（而不是按 id 回查表）：新建时 INSERT ... RETURNING 要能读到刚插入、尚未提交的这一行
CREATE POLICY clients_select ON public.clients FOR SELECT TO authenticated
    USING (owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()) OR public.v4_is_assignee(id));
CREATE POLICY clients_insert ON public.clients FOR INSERT TO authenticated
    WITH CHECK (owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
CREATE POLICY clients_update ON public.clients FOR UPDATE TO authenticated
    USING (public.v4_can_write(id))
    WITH CHECK (owner_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
CREATE POLICY clients_delete ON public.clients FOR DELETE TO authenticated
    USING ((SELECT public.is_admin()));

-- 设备、滤芯分级、应收款：负责人和管理员可改；被指派人只读
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['devices', 'filter_stages', 'receivables'] LOOP
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.v4_can_read(client_id))', t || '_select', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.v4_can_write(client_id))', t || '_insert', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.v4_can_write(client_id)) WITH CHECK (public.v4_can_write(client_id))', t || '_update', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ((SELECT public.is_admin()))', t || '_delete', t);
    END LOOP;

    -- 换芯、跟踪、收款：被指派人上门时也要能登记；只能修改自己登记的记录
    FOREACH t IN ARRAY ARRAY['replacements', 'follow_ups', 'payments'] LOOP
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.v4_can_read(client_id))', t || '_select', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.v4_can_read(client_id))', t || '_insert', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.v4_can_write(client_id) OR (public.v4_can_read(client_id) AND created_by = (SELECT auth.uid()))) WITH CHECK (public.v4_can_read(client_id))', t || '_update', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ((SELECT public.is_admin()))', t || '_delete', t);
    END LOOP;
END;
$$;

-- 工单：负责人和管理员管理；被指派人可看、可更新自己的工单（字段限制见 v4_guard_work_order）
CREATE POLICY work_orders_select ON public.work_orders FOR SELECT TO authenticated
    USING (public.v4_can_write(client_id) OR assignee_id = (SELECT auth.uid()));
CREATE POLICY work_orders_insert ON public.work_orders FOR INSERT TO authenticated
    WITH CHECK (public.v4_can_write(client_id));
CREATE POLICY work_orders_update ON public.work_orders FOR UPDATE TO authenticated
    USING (public.v4_can_write(client_id) OR assignee_id = (SELECT auth.uid()))
    WITH CHECK (public.v4_can_write(client_id) OR assignee_id = (SELECT auth.uid()));
CREATE POLICY work_orders_delete ON public.work_orders FOR DELETE TO authenticated
    USING ((SELECT public.is_admin()));

-- 操作日志：管理员看全部，成员看自己的操作；任何人都不能改
CREATE POLICY audit_log_select ON public.audit_log FOR SELECT TO authenticated
    USING ((SELECT public.is_admin()) OR actor_id = (SELECT auth.uid()));

REVOKE ALL ON FUNCTION public.v4_can_write(uuid), public.v4_is_assignee(uuid), public.v4_can_read(uuid),
    public.v4_member_directory(), public.v4_setting_int(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.v4_can_write(uuid), public.v4_is_assignee(uuid), public.v4_can_read(uuid),
    public.v4_member_directory(), public.v4_setting_int(text, integer) TO authenticated;
