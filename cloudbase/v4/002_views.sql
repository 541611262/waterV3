-- V4 查询视图（可重复执行，需先执行 001_schema.sql）
-- 视图使用 security_invoker：按查询者本人的权限过滤，和直接查表的权限完全一致。
-- 到期计算全部在这里完成（唯一的计算口径），网页端、报表、AI 小助手都读这些视图。
--
-- 换芯到期规则（与 V3 一致，并扩展到滤芯分级）：
--   上次服务日 = 装机日期、滤芯购买日期、换芯记录中最晚的一个
--   没有分级：下次到期 = 上次服务日 + 设备周期（未设置时用系统默认周期）
--   有分级：每一级 = max(上次服务日中的装机/购买日期、该级起算日、整机换芯、该级换芯) + 该级周期；
--           设备的下次到期取最早到期的一级
-- 催款规则（与 V3 一致）：
--   从最近一次跟踪、收款、开单日期、设备上次服务日中最晚的一个起，每隔 N 天提醒一次；
--   都没有时从录入日期起算。已结清（手动结清或收款 ≥ 应收）不再提醒

DROP VIEW IF EXISTS public.client_overview;
DROP VIEW IF EXISTS public.receivable_overview;
DROP VIEW IF EXISTS public.device_overview;
DROP VIEW IF EXISTS public.filter_stage_overview;

-- 成员姓名（成员表本身只允许看自己，这里只暴露姓名）
CREATE OR REPLACE FUNCTION public.v4_member_name(p_uid varchar)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT username FROM public.members WHERE uid = p_uid;
$$;
REVOKE ALL ON FUNCTION public.v4_member_name(varchar) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.v4_member_name(varchar) TO authenticated;

-- ---------- 每一级滤芯的到期 ----------
CREATE VIEW public.filter_stage_overview WITH (security_invoker = true) AS
SELECT
    s.id,
    s.client_id,
    s.device_id,
    s.position,
    s.name,
    s.interval_days,
    s.started_on,
    s.notes,
    s.version,
    last.last_service_on,
    last.last_service_on + s.interval_days AS next_due_on,
    last.last_service_on + s.interval_days - public.v4_today() AS days_until_due
FROM public.filter_stages s
JOIN public.devices d ON d.id = s.device_id AND d.deleted_at IS NULL
CROSS JOIN LATERAL (
    SELECT GREATEST(
        d.install_date,
        d.filter_purchase_date,
        s.started_on,
        (SELECT max(r.replaced_on) FROM public.replacements r
         WHERE r.device_id = s.device_id AND r.deleted_at IS NULL AND (r.stage_id IS NULL OR r.stage_id = s.id))
    ) AS last_service_on
) last
WHERE s.deleted_at IS NULL;

-- ---------- 装机记录（设备）总览 ----------
CREATE VIEW public.device_overview WITH (security_invoker = true) AS
SELECT
    d.id,
    d.client_id,
    d.address,
    d.contact_person,
    d.phone,
    d.install_date,
    d.model,
    d.quantity,
    d.location,
    d.filter_purchase_date,
    d.interval_days,
    d.need_water_test,
    d.notes,
    d.created_at,
    d.updated_at,
    d.version,
    c.name AS client_name,
    c.owner_id,
    public.v4_member_name(c.owner_id) AS owner_name,
    c.province,
    c.region,
    c.long_term_partner,
    rep.last_replaced_on,
    rep.replacement_count,
    st.stage_count,
    COALESCE(d.interval_days, public.v4_setting_int('replacement_interval_days', 90)) AS effective_interval_days,
    due.last_service_on,
    due.next_due_on,
    due.next_due_on - public.v4_today() AS days_until_due
FROM public.devices d
JOIN public.clients c ON c.id = d.client_id AND c.deleted_at IS NULL
CROSS JOIN LATERAL (
    SELECT max(r.replaced_on) AS last_replaced_on, count(*) AS replacement_count
    FROM public.replacements r
    WHERE r.device_id = d.id AND r.deleted_at IS NULL
) rep
CROSS JOIN LATERAL (
    SELECT count(*) AS stage_count, min(fs.next_due_on) AS next_due_on
    FROM public.filter_stage_overview fs
    WHERE fs.device_id = d.id
) st
CROSS JOIN LATERAL (
    SELECT
        GREATEST(d.install_date, d.filter_purchase_date, rep.last_replaced_on) AS last_service_on,
        CASE
            WHEN st.stage_count > 0 THEN st.next_due_on
            ELSE GREATEST(d.install_date, d.filter_purchase_date, rep.last_replaced_on)
                 + COALESCE(d.interval_days, public.v4_setting_int('replacement_interval_days', 90))
        END AS next_due_on
) due
WHERE d.deleted_at IS NULL;

-- ---------- 应收款总览 ----------
CREATE VIEW public.receivable_overview WITH (security_invoker = true) AS
SELECT
    rc.id,
    rc.client_id,
    rc.device_id,
    rc.title,
    rc.amount,
    rc.billed_on,
    rc.remind_interval_days,
    rc.closed_at,
    rc.notes,
    rc.created_at,
    rc.version,
    c.name AS client_name,
    c.owner_id,
    public.v4_member_name(c.owner_id) AS owner_name,
    pay.paid_amount,
    pay.payment_count,
    pay.last_paid_on,
    CASE WHEN rc.amount IS NULL THEN NULL ELSE GREATEST(rc.amount - pay.paid_amount, 0) END AS outstanding,
    st.settled,
    CASE WHEN st.settled THEN NULL ELSE st.remind_base + COALESCE(rc.remind_interval_days, public.v4_setting_int('unpaid_interval_days', 30)) END AS next_remind_on,
    CASE WHEN st.settled THEN NULL ELSE st.remind_base + COALESCE(rc.remind_interval_days, public.v4_setting_int('unpaid_interval_days', 30)) - public.v4_today() END AS days_until_remind
FROM public.receivables rc
JOIN public.clients c ON c.id = rc.client_id AND c.deleted_at IS NULL
LEFT JOIN public.device_overview dev ON dev.id = rc.device_id
CROSS JOIN LATERAL (
    SELECT COALESCE(sum(p.amount), 0)::numeric(12,2) AS paid_amount, count(*) AS payment_count, max(p.paid_on) AS last_paid_on
    FROM public.payments p
    WHERE p.receivable_id = rc.id AND p.deleted_at IS NULL
) pay
CROSS JOIN LATERAL (
    SELECT
        (rc.closed_at IS NOT NULL OR (rc.amount IS NOT NULL AND pay.paid_amount >= rc.amount)) AS settled,
        COALESCE(
            GREATEST(
                (SELECT max(f.followed_on) FROM public.follow_ups f WHERE f.client_id = rc.client_id AND f.deleted_at IS NULL),
                pay.last_paid_on,
                rc.billed_on,
                dev.last_service_on
            ),
            (rc.created_at AT TIME ZONE 'Asia/Shanghai')::date
        ) AS remind_base
) st
WHERE rc.deleted_at IS NULL;

-- ---------- 客户总览 ----------
CREATE VIEW public.client_overview WITH (security_invoker = true) AS
SELECT
    c.id,
    c.owner_id,
    public.v4_member_name(c.owner_id) AS owner_name,
    c.name,
    c.province,
    c.region,
    c.long_term_partner,
    c.notes,
    c.created_at,
    c.updated_at,
    c.version,
    dev.device_count,
    dev.next_due_on,
    dev.next_due_on - public.v4_today() AS days_until_due,
    fu.last_followed_on,
    fu.last_follow_up,
    rcv.open_receivable_count,
    rcv.outstanding_total
FROM public.clients c
CROSS JOIN LATERAL (
    SELECT count(*) AS device_count, min(d.next_due_on) AS next_due_on
    FROM public.device_overview d WHERE d.client_id = c.id
) dev
LEFT JOIN LATERAL (
    SELECT f.followed_on AS last_followed_on, f.content AS last_follow_up
    FROM public.follow_ups f
    WHERE f.client_id = c.id AND f.deleted_at IS NULL
    ORDER BY f.followed_on DESC NULLS LAST, f.created_at DESC
    LIMIT 1
) fu ON true
CROSS JOIN LATERAL (
    SELECT count(*) FILTER (WHERE NOT r.settled) AS open_receivable_count,
           COALESCE(sum(r.outstanding) FILTER (WHERE NOT r.settled), 0)::numeric(12,2) AS outstanding_total
    FROM public.receivable_overview r WHERE r.client_id = c.id
) rcv
WHERE c.deleted_at IS NULL;

GRANT SELECT ON public.filter_stage_overview, public.device_overview, public.receivable_overview, public.client_overview TO authenticated;
REVOKE ALL ON public.filter_stage_overview, public.device_overview, public.receivable_overview, public.client_overview FROM anon;
