-- 滤芯更换提醒系统：云开发 PostgreSQL 建表与权限（可重复执行）
-- 数据权限完全由下面的 RLS（行级安全）策略在数据库端保证：
--   * 普通成员只能读写 user_id 等于自己的客户；管理员可以读写全部客户
--   * 新增客户时负责人只能是自己；普通成员不能把客户改给别人
--   * 成员表只有管理员能修改角色；首次登录只能以 member 身份登记自己
--   * 未登录（anon）没有任何权限

-- ---------- 成员与角色 ----------
CREATE TABLE IF NOT EXISTS public.members (
    uid        varchar(64) PRIMARY KEY DEFAULT auth.uid(),
    username   text        NOT NULL DEFAULT '',
    role       text        NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 成员与登录账号联动：在控制台删除账号时，自动删除对应的成员记录
-- auth.users.id 是数字类型、members.uid 是文本，无法直接建外键，所以用触发器
DELETE FROM public.members m WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id::text = m.uid);

CREATE OR REPLACE FUNCTION public.remove_member_on_user_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.members WHERE uid = OLD.id::text;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS remove_member_on_user_delete ON auth.users;
CREATE TRIGGER remove_member_on_user_delete
    AFTER DELETE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.remove_member_on_user_delete();

-- 在控制台新建账号时自动登记为普通成员；账号改名时同步用户名（不会改动角色）
-- 用 to_jsonb 读取用户名，避免依赖 auth.users 的具体列名；出错时只记警告，绝不影响建账号和登录
CREATE OR REPLACE FUNCTION public.sync_member_from_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.members (uid, username, role)
    VALUES (NEW.id::text, COALESCE(to_jsonb(NEW) ->> 'username', to_jsonb(NEW) ->> 'name', ''), 'member')
    ON CONFLICT (uid) DO UPDATE SET username = EXCLUDED.username;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_member_from_user failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_member_from_user ON auth.users;
CREATE TRIGGER sync_member_from_user
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.sync_member_from_user();

-- 补登已有、但还没登录过网站的账号
INSERT INTO public.members (uid, username, role)
SELECT u.id::text, COALESCE(to_jsonb(u) ->> 'username', to_jsonb(u) ->> 'name', ''), 'member'
FROM auth.users u
ON CONFLICT (uid) DO NOTHING;

-- 当前登录用户是否为管理员（SECURITY DEFINER：在策略中读取 members 时不受 members 自身的 RLS 限制）
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.members
        WHERE uid = (SELECT auth.uid()) AND role = 'admin'
    );
$$;

-- ---------- 客户（每个客户一行，客户信息与装机记录保存在 data 中） ----------
CREATE TABLE IF NOT EXISTS public.customers (
    id         text        PRIMARY KEY,
    user_id    varchar(64) NOT NULL DEFAULT auth.uid(),
    data       jsonb       NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_user_id_idx ON public.customers (user_id);

-- ---------- 表级权限 ----------
REVOKE ALL ON public.members, public.customers FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.members TO authenticated;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ---------- 行级安全 ----------
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_select ON public.customers;
DROP POLICY IF EXISTS customers_insert ON public.customers;
DROP POLICY IF EXISTS customers_update ON public.customers;
DROP POLICY IF EXISTS customers_delete ON public.customers;

CREATE POLICY customers_select ON public.customers FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

CREATE POLICY customers_insert ON public.customers FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY customers_update ON public.customers FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
    WITH CHECK (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

CREATE POLICY customers_delete ON public.customers FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS members_select ON public.members;
DROP POLICY IF EXISTS members_insert ON public.members;
DROP POLICY IF EXISTS members_update ON public.members;

CREATE POLICY members_select ON public.members FOR SELECT TO authenticated
    USING (uid = (SELECT auth.uid()) OR (SELECT public.is_admin()));

CREATE POLICY members_insert ON public.members FOR INSERT TO authenticated
    WITH CHECK (uid = (SELECT auth.uid()) AND role = 'member');

CREATE POLICY members_update ON public.members FOR UPDATE TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));
