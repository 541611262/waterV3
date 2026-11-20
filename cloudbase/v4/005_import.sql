-- 表格导入：在一个事务里执行网页端算好的导入计划（web/src/lib/import/plan.ts），要么全部成功，要么全部不生效
-- SECURITY INVOKER：以导入人自己的身份执行，行级权限照常生效，不能借导入改别人的数据
-- 任何一条记录的版本号不匹配（导入期间别人改过）都会整体回滚并提示重新导入

CREATE OR REPLACE FUNCTION public.v4_apply_import(p_plan jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_clients jsonb := '{}';   -- 计划中的临时编号 → 新客户 id
    v_devices jsonb := '{}';   -- 计划中的临时编号 → 新设备 id
    v_item    jsonb;
    v_id      uuid;
    v_count   integer;
    v_result  jsonb := '{}';
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '请先登录' USING ERRCODE = '42501';
    END IF;

    -- 新客户（负责人默认为导入人）
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_plan -> 'newClients', '[]')) LOOP
        INSERT INTO public.clients (name, province, region, long_term_partner)
        VALUES (v_item ->> 'name', COALESCE(v_item ->> 'province', ''), COALESCE(v_item ->> 'region', ''),
                COALESCE((v_item ->> 'long_term_partner')::boolean, false))
        RETURNING id INTO v_id;
        v_clients := v_clients || jsonb_build_object(v_item ->> 'ref', v_id);
    END LOOP;

    -- 已有客户的更新
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_plan -> 'clientUpdates', '[]')) LOOP
        UPDATE public.clients SET
            province = CASE WHEN v_item -> 'patch' ? 'province' THEN v_item -> 'patch' ->> 'province' ELSE province END,
            region = CASE WHEN v_item -> 'patch' ? 'region' THEN v_item -> 'patch' ->> 'region' ELSE region END,
            long_term_partner = CASE WHEN v_item -> 'patch' ? 'long_term_partner'
                                     THEN (v_item -> 'patch' ->> 'long_term_partner')::boolean ELSE long_term_partner END
        WHERE id = (v_item ->> 'id')::uuid AND version = (v_item ->> 'version')::integer;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN
            RAISE EXCEPTION '导入期间有客户被其他人修改过，请重新导入' USING ERRCODE = '40001';
        END IF;
    END LOOP;

    -- 新设备
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_plan -> 'newDevices', '[]')) LOOP
        INSERT INTO public.devices (client_id, address, contact_person, phone, install_date, model, quantity, location,
                                    filter_purchase_date, interval_days, need_water_test, notes)
        VALUES (
            COALESCE((v_item -> 'client' ->> 'id')::uuid, (v_clients ->> (v_item -> 'client' ->> 'ref'))::uuid),
            COALESCE(v_item -> 'fields' ->> 'address', ''),
            COALESCE(v_item -> 'fields' ->> 'contact_person', ''),
            COALESCE(v_item -> 'fields' ->> 'phone', ''),
            (v_item -> 'fields' ->> 'install_date')::date,
            COALESCE(v_item -> 'fields' ->> 'model', ''),
            (v_item -> 'fields' ->> 'quantity')::integer,
            COALESCE(v_item -> 'fields' ->> 'location', ''),
            (v_item -> 'fields' ->> 'filter_purchase_date')::date,
            (v_item -> 'fields' ->> 'interval_days')::integer,
            COALESCE((v_item -> 'fields' ->> 'need_water_test')::boolean, false),
            COALESCE(v_item -> 'fields' ->> 'notes', '')
        )
        RETURNING id INTO v_id;
        v_devices := v_devices || jsonb_build_object(v_item ->> 'ref', v_id);
    END LOOP;

    -- 已有设备的更新：只改表格里填了值的字段
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_plan -> 'deviceUpdates', '[]')) LOOP
        UPDATE public.devices d SET
            address = COALESCE(v_item -> 'patch' ->> 'address', d.address),
            contact_person = COALESCE(v_item -> 'patch' ->> 'contact_person', d.contact_person),
            phone = COALESCE(v_item -> 'patch' ->> 'phone', d.phone),
            install_date = COALESCE((v_item -> 'patch' ->> 'install_date')::date, d.install_date),
            model = COALESCE(v_item -> 'patch' ->> 'model', d.model),
            quantity = COALESCE((v_item -> 'patch' ->> 'quantity')::integer, d.quantity),
            location = COALESCE(v_item -> 'patch' ->> 'location', d.location),
            filter_purchase_date = COALESCE((v_item -> 'patch' ->> 'filter_purchase_date')::date, d.filter_purchase_date),
            interval_days = COALESCE((v_item -> 'patch' ->> 'interval_days')::integer, d.interval_days),
            need_water_test = COALESCE((v_item -> 'patch' ->> 'need_water_test')::boolean, d.need_water_test),
            notes = COALESCE(v_item -> 'patch' ->> 'notes', d.notes)
        WHERE d.id = (v_item ->> 'id')::uuid AND d.version = (v_item ->> 'version')::integer;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN
            RAISE EXCEPTION '导入期间有装机记录被其他人修改过，请重新导入' USING ERRCODE = '40001';
        END IF;
    END LOOP;

    -- 换芯记录
    INSERT INTO public.replacements (device_id, replaced_on, filter_model, quantity, cost, operator_name, notes)
    SELECT
        COALESCE((r -> 'device' ->> 'id')::uuid, (v_devices ->> (r -> 'device' ->> 'ref'))::uuid),
        (r ->> 'replaced_on')::date,
        COALESCE(r ->> 'filter_model', ''),
        GREATEST(COALESCE((r ->> 'quantity')::integer, 1), 1),
        GREATEST(COALESCE((r ->> 'cost')::numeric, 0), 0),
        COALESCE(r ->> 'operator_name', ''),
        COALESCE(r ->> 'notes', '')
    FROM jsonb_array_elements(COALESCE(p_plan -> 'replacements', '[]')) r;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := v_result || jsonb_build_object('replacements', v_count);

    -- 跟踪记录
    INSERT INTO public.follow_ups (client_id, followed_on, content, operator_name)
    SELECT
        COALESCE((f -> 'client' ->> 'id')::uuid, (v_clients ->> (f -> 'client' ->> 'ref'))::uuid),
        (f ->> 'followed_on')::date,
        COALESCE(f ->> 'content', ''),
        COALESCE(f ->> 'operator_name', '')
    FROM jsonb_array_elements(COALESCE(p_plan -> 'followUps', '[]')) f;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := v_result || jsonb_build_object('follow_ups', v_count);

    -- 未收款 → 应收款（金额未登记）
    INSERT INTO public.receivables (client_id, device_id, title, remind_interval_days)
    SELECT
        d.client_id, d.id, '未收款（表格导入）', (r ->> 'remind_interval_days')::integer
    FROM jsonb_array_elements(COALESCE(p_plan -> 'newReceivables', '[]')) r
    JOIN public.devices d ON d.id = COALESCE((r -> 'device' ->> 'id')::uuid, (v_devices ->> (r -> 'device' ->> 'ref'))::uuid);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := v_result || jsonb_build_object('receivables', v_count);

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_plan -> 'receivableUpdates', '[]')) LOOP
        UPDATE public.receivables SET
            remind_interval_days = COALESCE((v_item ->> 'remind_interval_days')::integer, remind_interval_days),
            closed_at = CASE WHEN (v_item ->> 'close')::boolean THEN now() ELSE closed_at END
        WHERE id = (v_item ->> 'id')::uuid AND version = (v_item ->> 'version')::integer;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count = 0 THEN
            RAISE EXCEPTION '导入期间有应收款被其他人修改过，请重新导入' USING ERRCODE = '40001';
        END IF;
    END LOOP;

    RETURN v_result || jsonb_build_object(
        'clients', jsonb_array_length(COALESCE(p_plan -> 'newClients', '[]')),
        'devices', jsonb_array_length(COALESCE(p_plan -> 'newDevices', '[]')),
        'updated_devices', jsonb_array_length(COALESCE(p_plan -> 'deviceUpdates', '[]')));
END;
$$;

REVOKE ALL ON FUNCTION public.v4_apply_import(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.v4_apply_import(jsonb) TO authenticated;
