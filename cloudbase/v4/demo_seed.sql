-- 试用演示数据：给测试同事账号 staff01–staff15 各生成 3 个虚构客户（只在测试环境执行！）
--   客户、电话、地址全部是虚构的；客户备注里写明「演示数据」，legacy_id 以 demo: 开头
--   每人覆盖各种情况：已超期、7 天内到期、本月到期、下月到期、没有日期；一笔待催款、一张待上门工单、一条跟踪记录
--   可以重复执行：已经生成过的账号会跳过。清除：DELETE FROM public.clients WHERE legacy_id LIKE 'demo:%';
DO $$
DECLARE
    prefixes text[] := ARRAY['安和','百川','晨光','德润','恒信','嘉禾','锦程','乐康','美达','宁远','鹏达','清源','荣盛','顺发','泰和'];
    suffixes text[] := ARRAY['科技有限公司','实验学校','酒店管理有限公司'];
    regions  text[] := ARRAY['深圳','东莞','广州','惠州','佛山','珠海','中山','江门'];
    surnames text[] := ARRAY['陈','李','王','张','刘','黄','林','周','吴','郑','何','罗','梁','谢','邓'];
    titles   text[] := ARRAY['经理','主任','先生','女士'];
    models   text[] := ARRAY['RO-400G','UF-2000','商用 RO-1T','管线机 GX-5'];
    today    date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
    m        record;
    i        int;
    j        int;
    k        int;
    cid      uuid;
    did      uuid;
    first_device uuid;
    n        int;
BEGIN
    FOR m IN SELECT uid, username FROM public.members WHERE username ~ '^staff[0-9]{2}$' ORDER BY username LOOP
        i := substring(m.username FROM 6)::int;
        CONTINUE WHEN EXISTS (SELECT 1 FROM public.clients WHERE legacy_id = 'demo:' || m.username || ':1');
        FOR j IN 1..3 LOOP
            n := (i - 1) * 3 + j;
            INSERT INTO public.clients (owner_id, name, province, region, long_term_partner, notes, legacy_id)
            VALUES (m.uid,
                    prefixes[i] || suffixes[j],
                    '广东',
                    regions[1 + (n % array_length(regions, 1))],
                    j = 1,
                    '演示数据（测试用，可随意修改、删除）',
                    'demo:' || m.username || ':' || j)
            RETURNING id INTO cid;

            -- 第 1 个客户 2 台设备，其余 1 台；到期情况轮流分布
            first_device := NULL;
            FOR k IN 1..(CASE WHEN j = 1 THEN 2 ELSE 1 END) LOOP
                INSERT INTO public.devices (client_id, address, contact_person, phone, install_date, model, quantity, location,
                                            filter_purchase_date, interval_days, need_water_test, notes, legacy_id)
                VALUES (cid,
                        regions[1 + (n % array_length(regions, 1))] || '市演示路 ' || (n * 10 + k) || ' 号',
                        surnames[1 + ((n + k) % 15)] || titles[1 + ((n + k) % 4)],
                        '1380000' || lpad(((n * 2 + k) % 10000)::text, 4, '0'),
                        CASE
                            WHEN j = 1 AND k = 1 THEN today - 87                         -- 3 天后到期
                            WHEN j = 1 THEN NULL                                         -- 没有日期（数据待补全）
                            WHEN j = 2 THEN today - 100                                  -- 已超期 10 天
                            WHEN i % 2 = 0 THEN today - 40                               -- 50 天后到期
                            ELSE today - 70                                              -- 20 天后到期
                        END,
                        models[1 + ((n + k) % 4)],
                        1 + (n + k) % 3,
                        CASE k WHEN 1 THEN '一楼大厅' ELSE '员工饭堂' END,
                        NULL, 90, (n + k) % 4 = 0, '',
                        'demo:' || m.username || ':' || j || ':' || k)
                RETURNING id INTO did;
                first_device := COALESCE(first_device, did);
            END LOOP;

            IF j = 1 THEN
                -- 一条历史换芯记录 + 一条跟踪记录
                INSERT INTO public.replacements (client_id, device_id, replaced_on, filter_model, quantity, cost, operator_name, notes)
                VALUES (cid, first_device, today - 200, 'RO-400G 滤芯套装', 1, 380, m.username, '演示：上一次换芯');
                INSERT INTO public.follow_ups (client_id, device_id, followed_on, content, operator_name)
                VALUES (cid, first_device, today - 5, '演示：电话联系客户，约好下周上门换芯', m.username);
            ELSIF j = 2 THEN
                -- 一笔应收：40 天前开单，每 30 天催一次 → 已到催款日
                INSERT INTO public.receivables (client_id, device_id, title, amount, billed_on, remind_interval_days, notes)
                VALUES (cid, first_device, '滤芯更换费用', 680, today - 40, 30, '演示数据');
            ELSE
                -- 一张指派给自己的待上门工单（明天）
                INSERT INTO public.work_orders (client_id, device_id, type, status, assignee_id, scheduled_on, title, description)
                VALUES (cid, first_device, 'replacement', 'pending', m.uid, today + 1, '上门换芯（演示）', '演示工单：可以试试「开始处理」和「完成」');
            END IF;
        END LOOP;
    END LOOP;
END $$;

SELECT m.username, count(c.id) AS clients
FROM public.members m LEFT JOIN public.clients c ON c.owner_id = m.uid AND c.legacy_id LIKE 'demo:%'
WHERE m.username ~ '^staff[0-9]{2}$'
GROUP BY m.username ORDER BY m.username;
