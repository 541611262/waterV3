// AI 小助手：聊天窗口 + 在浏览器中执行的数据工具
// - 工具只使用当前用户页面上已加载的数据（云端模式下已经过数据库 RLS 过滤），看不到同事的客户
// - 发给 AI 的电话号码一律打码，回答中的 [[tel:记录ID]] 由网页在本地还原
// - 修改数据只生成确认卡片，用户点击确认后才通过与手动操作相同的代码保存；没有删除能力
const Assistant = (() => {
    const MAX_TOOL_ROUNDS = 6;
    const MAX_RESULTS = 30;
    const MAX_HISTORY_TURNS = 10;
    const QUICK_PROMPTS = ['今天该联系谁？', '本周到期的有哪些？', '哪些客户该催款了？', '帮我排一下明天的上门计划', '检查一下数据有什么问题'];

    let history = [];
    let busy = false;
    let proposalSeq = 0;
    const proposals = new Map();

    // ---------- 传输 ----------
    // 测试时可以通过 window.__aiTransport 注入模拟的回答
    function getTransport() {
        if (typeof window.__aiTransport === 'function') return window.__aiTransport;
        if (IS_CLOUD_MODE && APP_CONFIG.aiAssistant) return payload => CloudStore.callAssistant(payload);
        return null;
    }

    function isAvailable() {
        return Boolean(getTransport());
    }

    // ---------- 隐私：电话打码 ----------
    function maskDigits(run) {
        return run.length >= 11 ? `${run.slice(0, 3)}****${run.slice(-4)}` : `${run.slice(0, 2)}****${run.slice(-2)}`;
    }

    // 7 位以上的连续数字都视为可能的电话号码（备注、跟踪记录等自由文本里也可能写了电话）
    function maskText(value) {
        return value === null || value === undefined ? undefined : String(value).replace(/\d{7,}/g, maskDigits);
    }

    function contactOf(customer, device) {
        if (device.contactPerson || device.phoneNumber) return device;
        return customer.devices.find(d => d.contactPerson || d.phoneNumber) || device;
    }

    function phoneOfRecord(recordId) {
        const found = findDevice(Number(recordId)) || findDevice(recordId);
        if (!found || !canEditCustomer(found.customer)) return '';
        return contactOf(found.customer, found.device).phoneNumber || '';
    }

    // 把 AI 写在内容里的 [[tel:ID]] 换回真实号码（用于保存跟踪记录等）
    function resolveTelTokens(text) {
        return String(text || '').replace(/\[\[tel:([^\]]+)\]\]/g, (_, id) => phoneOfRecord(id) || '（电话未知）');
    }

    function compact(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    // ---------- 数据摘要（发给 AI 的内容） ----------
    function summarize({ customer, device }) {
        const next = getNextReplacementDate(device);
        const unpaid = getNextUnpaidDate(customer, device);
        const contact = contactOf(customer, device);
        const latest = getLatestFollowUp(customer);
        const showOwner = currentUser.role === 'admin' && customer.userId !== currentUser.id;
        return compact({
            record_id: String(device.id),
            customer_id: String(customer.id),
            customer: customer.name,
            province: customer.province || undefined,
            region: customer.region || undefined,
            address: maskText(device.address) || undefined,
            location: maskText(device.location) || undefined,
            model: maskText(device.model) || undefined,
            quantity: device.quantity || undefined,
            contact: contact.contactPerson || undefined,
            phone: contact.phoneNumber ? maskText(contact.phoneNumber) : undefined,
            phone_ref: contact.phoneNumber ? `[[tel:${device.id}]]` : undefined,
            install_date: device.installDate || undefined,
            last_change: getLatestReplacementDate(device) || undefined,
            next_change: next || undefined,
            due_status: next ? describeDue(daysUntil(next)).text : '未设置日期',
            interval_days: device.customInterval || DEFAULT_REPLACEMENT_INTERVAL,
            water_test: device.needWaterTest || undefined,
            long_term_partner: customer.longTermPartner || undefined,
            unpaid: device.hasUnpaid || undefined,
            unpaid_reminder: unpaid ? `${unpaid}（${describeUnpaid(daysUntil(unpaid))}）` : undefined,
            notes: maskText(device.notes) || undefined,
            latest_follow_up: latest ? `${latest.date || '日期未知'} ${maskText(latest.content)}` : undefined,
            owner: showOwner ? getOwnerName(customer) || '未知' : undefined
        });
    }

    function urgency(entry) {
        const next = getNextReplacementDate(entry.device);
        return next ? daysUntil(next) : Number.MAX_SAFE_INTEGER;
    }

    function pack(entries, limit) {
        const count = Math.min(Math.max(parseInt(limit, 10) || 20, 1), MAX_RESULTS);
        const sorted = [...entries].sort((a, b) => urgency(a) - urgency(b));
        return compact({
            total: sorted.length,
            returned: Math.min(count, sorted.length),
            records: sorted.slice(0, count).map(summarize),
            note: sorted.length > count ? `还有 ${sorted.length - count} 条未列出，可以缩小范围再查` : undefined
        });
    }

    function asArray(value) {
        if (Array.isArray(value)) return value.map(String).filter(Boolean);
        return value ? [String(value)] : [];
    }

    function findCustomer(args) {
        const own = getCurrentUserCustomers();
        if (args.customer_id) {
            const byId = own.find(c => String(c.id) === String(args.customer_id));
            if (byId) return { customer: byId };
        }
        const name = String(args.customer_name || '').trim();
        if (name) {
            const exact = own.filter(c => c.name === name);
            if (exact.length === 1) return { customer: exact[0] };
            const fuzzy = own.filter(c => c.name.includes(name));
            if (fuzzy.length === 1) return { customer: fuzzy[0] };
            if (fuzzy.length > 1) return { candidates: fuzzy.slice(0, 10).map(c => ({ customer_id: String(c.id), name: c.name })) };
        }
        return {};
    }

    function findEntry(recordId) {
        return getCurrentUserDevices().find(entry => String(entry.device.id) === String(recordId)) || null;
    }

    // ---------- 只读工具 ----------
    const readTools = {
        search_records(args) {
            const keyword = String(args.keyword || '').trim().toLowerCase();
            const regions = asArray(args.regions);
            const flags = asArray(args.flags);
            const within = Number.isFinite(Number(args.due_within_days)) && args.due_within_days !== null && args.due_within_days !== undefined
                ? Number(args.due_within_days) : null;
            const list = getCurrentUserDevices().filter(({ customer, device }) => {
                if (keyword && !matchesSearch(customer, device, keyword)) return false;
                if (regions.length && !regions.some(r => customer.region === r || customer.province === r || (customer.region || '').includes(r))) return false;
                if (flags.includes('unpaid') && !device.hasUnpaid) return false;
                if (flags.includes('water_test') && !device.needWaterTest) return false;
                if (flags.includes('long_term_partner') && !customer.longTermPartner) return false;
                if (within !== null) {
                    const next = getNextReplacementDate(device);
                    if (!next || daysUntil(next) > within) return false;
                }
                return true;
            });
            return pack(list, args.limit);
        },

        get_due_list(args) {
            const map = { overdue_or_today: 'today', this_week: 'week', this_month: 'month', next_month: 'nextMonth', unpaid: 'unpaid' };
            const key = map[args.type];
            if (!key) return { error: 'type 必须是 overdue_or_today、this_week、this_month、next_month、unpaid 之一' };
            const items = categorizeEntries()[key];
            return pack(items, MAX_RESULTS);
        },

        get_customer_detail(args) {
            const { customer, candidates } = findCustomer(args);
            if (candidates) return { error: '匹配到多个客户，请指定 customer_id', candidates };
            if (!customer) return { error: '找不到该客户，请先用 search_records 查找' };
            return compact({
                customer_id: String(customer.id),
                name: customer.name,
                province: customer.province || undefined,
                region: customer.region || undefined,
                long_term_partner: customer.longTermPartner || undefined,
                follow_ups: sortByDateDesc(customer.followUps).slice(0, 20).map(f => ({ date: f.date || '日期未知', content: maskText(f.content) })),
                records: customer.devices.map(device => ({
                    ...summarize({ customer, device }),
                    replacement_history: sortByDateDesc(device.replacementHistory).slice(0, 10).map(r => compact({
                        date: r.date || '日期未知', filter_model: maskText(r.filterModel) || undefined,
                        quantity: r.quantity, cost: r.cost || undefined, notes: maskText(r.notes) || undefined
                    }))
                }))
            });
        },

        get_stats() {
            const entries = getCurrentUserDevices();
            const groups = categorizeEntries();
            const byRegion = {};
            entries.forEach(({ customer }) => {
                const key = customer.region || customer.province || '未填写';
                byRegion[key] = (byRegion[key] || 0) + 1;
            });
            return {
                customers: getCurrentUserCustomers().length,
                records: entries.length,
                records_by_region: byRegion,
                overdue_or_today: groups.today.length,
                this_week: groups.week.length,
                this_month: groups.month.length,
                next_month: groups.nextMonth.length,
                unpaid_due_within_7_days: groups.unpaid.length,
                unpaid_records: entries.filter(e => e.device.hasUnpaid).length,
                water_test_records: entries.filter(e => e.device.needWaterTest).length,
                long_term_partner_customers: getCurrentUserCustomers().filter(c => c.longTermPartner).length
            };
        },

        check_data_quality() {
            const issues = { no_contact_or_phone: [], no_dates: [], no_model: [], no_quantity: [], no_address: [] };
            getCurrentUserDevices().forEach(entry => {
                const { customer, device } = entry;
                const ref = { record_id: String(device.id), customer: customer.name, location: maskText(device.location) || undefined };
                const contact = contactOf(customer, device);
                if (!contact.contactPerson && !contact.phoneNumber) issues.no_contact_or_phone.push(ref);
                if (!getLatestReplacementDate(device)) issues.no_dates.push(ref);
                if (!device.model) issues.no_model.push(ref);
                if (!device.quantity) issues.no_quantity.push(ref);
                if (!device.address) issues.no_address.push(ref);
            });
            const result = {};
            Object.entries(issues).forEach(([key, list]) => {
                result[key] = { count: list.length, examples: list.slice(0, 15).map(compact) };
            });
            return result;
        }
    };

    // ---------- 写入工具：只生成确认卡片 ----------
    const EDITABLE_FIELDS = {
        contactPerson: 'text', phoneNumber: 'phone', address: 'text', location: 'text', model: 'text', quantity: 'int',
        notes: 'text', installDate: 'date', filterPurchaseDate: 'date', customInterval: 'int',
        needWaterTest: 'bool', hasUnpaid: 'bool', unpaidInterval: 'int'
    };

    function displayValue(key, value) {
        if (value === null || value === undefined || value === '') return '（空）';
        if (EDITABLE_FIELDS[key] === 'bool') return value ? '是' : '否';
        return String(value);
    }

    function propose({ title, customer, rows, apply }) {
        const id = `p${++proposalSeq}`;
        proposals.set(id, { id, title, customerId: customer.id, rows, apply, status: 'pending' });
        appendProposalCard(proposals.get(id));
        return { status: 'waiting_for_user_confirmation', proposal_id: id, message: '已在界面上生成确认卡片，等待用户点击确认。不要说已经保存。' };
    }

    const writeTools = {
        propose_follow_up(args) {
            const { customer } = findCustomer({ customer_id: args.customer_id });
            if (!customer) return { error: '找不到该客户，请先用 search_records 或 get_customer_detail 查到 customer_id' };
            if (!canEditCustomer(customer)) return { error: '没有权限修改该客户' };
            const content = resolveTelTokens(args.content).trim();
            if (!content) return { error: '跟踪内容不能为空' };
            const date = parseFlexibleDate(args.date) || todayStr();
            const clearUnpaid = Boolean(args.clear_unpaid) && customer.devices.some(d => d.hasUnpaid);
            return propose({
                title: '添加跟踪记录',
                customer,
                rows: [['客户', customer.name], ['日期', date], ['内容', content], ...(clearUnpaid ? [['同时', '取消该客户所有「未收款」标记']] : [])],
                apply: () => {
                    customer.followUps.push(makeFollowUp(date, content));
                    if (clearUnpaid) customer.devices.forEach(device => { device.hasUnpaid = false; });
                }
            });
        },

        propose_replacement(args) {
            const entry = findEntry(args.record_id);
            if (!entry) return { error: '找不到该装机记录，请先用 search_records 查到 record_id' };
            if (!canEditCustomer(entry.customer)) return { error: '没有权限修改该记录' };
            const { customer, device } = entry;
            const date = parseFlexibleDate(args.date) || todayStr();
            const filterModel = String(args.filter_model || device.model || '标准滤芯').trim();
            const quantity = parsePositiveInt(args.quantity) || device.quantity || 1;
            const cost = Number(args.cost) > 0 ? Number(args.cost) : 0;
            const notes = resolveTelTokens(args.notes).trim();
            return propose({
                title: '登记换芯',
                customer,
                rows: [['客户', customer.name], ['装机记录', [device.location, device.model].filter(Boolean).join(' · ') || '（未命名）'],
                    ['更换日期', date], ['滤芯型号', filterModel], ['数量', quantity], ['费用', cost ? `${cost} 元` : '未记录'], ...(notes ? [['备注', notes]] : [])],
                apply: () => {
                    device.replacementHistory.push(makeReplacementRecord({ date, filterModel, quantity, cost, notes }));
                    device.filterPurchaseDate = latestDate([device.filterPurchaseDate, ...device.replacementHistory.map(r => r.date)]);
                }
            });
        },

        propose_record_update(args) {
            const entry = findEntry(args.record_id);
            if (!entry) return { error: '找不到该装机记录，请先用 search_records 查到 record_id' };
            if (!canEditCustomer(entry.customer)) return { error: '没有权限修改该记录' };
            const { customer, device } = entry;
            const changes = {};
            const rows = [['客户', customer.name], ['装机记录', [device.location, device.model].filter(Boolean).join(' · ') || '（未命名）']];
            const input = args.changes && typeof args.changes === 'object' ? args.changes : {};

            for (const [key, raw] of Object.entries(input)) {
                const type = EDITABLE_FIELDS[key];
                if (!type) return { error: `不支持修改字段 ${key}` };
                let value;
                if (type === 'bool') value = Boolean(raw);
                else if (type === 'int') value = raw === null || raw === '' ? null : parsePositiveInt(raw);
                else if (type === 'date') {
                    value = raw ? parseFlexibleDate(raw) : '';
                    if (raw && !value) return { error: `${FIELD_BY_KEY[key].header} 的日期无法识别：${raw}` };
                } else if (type === 'phone') {
                    value = normalizePhone(resolveTelTokens(raw));
                    if (value.includes('*')) return { error: '电话号码不完整（含 *），请让用户提供完整号码' };
                } else value = resolveTelTokens(raw).trim();

                if (displayValue(key, value) === displayValue(key, device[key])) continue;
                changes[key] = value;
                rows.push([FIELD_BY_KEY[key].header, `${displayValue(key, device[key])} → ${displayValue(key, value)}`]);
            }
            if (!Object.keys(changes).length) return { error: '没有需要修改的内容（新值与原值相同）' };
            return propose({ title: '修改装机记录', customer, rows, apply: () => Object.assign(device, changes) });
        }
    };

    function executeTool(name, rawArgs) {
        let args = {};
        try {
            args = rawArgs ? JSON.parse(rawArgs) : {};
        } catch (error) {
            return { error: '工具参数不是有效的 JSON' };
        }
        const fn = readTools[name] || writeTools[name];
        if (!fn) return { error: `未知工具：${name}` };
        try {
            return fn(args || {});
        } catch (error) {
            console.error('assistant tool error', name, error);
            return { error: `工具执行出错：${error.message}` };
        }
    }

    // ---------- 对话 ----------
    // 只保留最近若干轮，截断位置落在用户消息上
    function trimHistory() {
        const userIndexes = history.map((m, i) => (m.role === 'user' ? i : -1)).filter(i => i >= 0);
        if (userIndexes.length > MAX_HISTORY_TURNS) {
            history = history.slice(userIndexes[userIndexes.length - MAX_HISTORY_TURNS]);
        }
    }

    function setRemaining(remaining, limit) {
        const element = document.getElementById('aiRemaining');
        if (element && Number.isFinite(remaining) && Number.isFinite(limit)) {
            element.textContent = `今日剩余 ${remaining} / ${limit} 次`;
        }
    }

    async function ask(text) {
        const question = String(text || '').trim();
        if (!question || busy) return;
        const transport = getTransport();
        if (!transport) {
            appendMessage('error', '小助手只能在云端模式下使用。');
            return;
        }

        busy = true;
        setBusy(true);
        appendMessage('user', question);
        trimHistory();
        const checkpoint = history.length;
        history.push({ role: 'user', content: question });

        try {
            for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
                setStatus(round === 0 ? '思考中...' : '正在查询数据...');
                const response = await transport({ messages: history, userName: currentUser.username });
                if (!response || !response.ok) {
                    history.length = checkpoint;
                    if (response && Number.isFinite(response.remaining)) setRemaining(response.remaining, response.limit);
                    appendMessage('error', (response && response.message) || '小助手暂时不可用，请稍后再试');
                    return;
                }
                setRemaining(response.remaining, response.limit);

                const message = response.message || {};
                const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
                history.push(compact({ role: 'assistant', content: message.content || '', tool_calls: toolCalls.length ? toolCalls : undefined }));

                if (!toolCalls.length) {
                    appendMessage('assistant', message.content || '（没有回答）');
                    return;
                }
                if (message.content) appendMessage('assistant', message.content);
                toolCalls.forEach(call => {
                    const result = executeTool(call.function && call.function.name, call.function && call.function.arguments);
                    history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
                });
            }
            history.length = checkpoint;
            appendMessage('error', '这个问题需要查询的步骤太多了，请换个更具体的问法。');
        } catch (error) {
            console.error('assistant error', error);
            history.length = checkpoint;
            appendMessage('error', error.message || '小助手出错了，请稍后再试');
        } finally {
            busy = false;
            setBusy(false);
            setStatus('');
        }
    }

    // ---------- 确认卡片 ----------
    function confirmProposal(id) {
        const proposal = proposals.get(id);
        if (!proposal || proposal.status !== 'pending') return;
        const customer = customers.find(c => c.id === proposal.customerId);
        if (!customer || !canEditCustomer(customer)) {
            finishProposal(proposal, 'failed', '客户已不存在或没有权限');
            return;
        }
        try {
            proposal.apply();
        } catch (error) {
            finishProposal(proposal, 'failed', error.message);
            return;
        }
        saveCustomersToStorage();
        refreshAll();
        finishProposal(proposal, 'confirmed');
        history.push({ role: 'user', content: `（系统消息：用户已确认，「${proposal.title}」已保存）` });
    }

    function cancelProposal(id) {
        const proposal = proposals.get(id);
        if (!proposal || proposal.status !== 'pending') return;
        finishProposal(proposal, 'cancelled');
        history.push({ role: 'user', content: `（系统消息：用户取消了「${proposal.title}」）` });
    }

    function finishProposal(proposal, status, reason = '') {
        proposal.status = status;
        const card = document.querySelector(`[data-proposal-id="${proposal.id}"]`);
        if (!card) return;
        const texts = { confirmed: '✅ 已保存', cancelled: '已取消', failed: `❌ 保存失败：${reason}` };
        card.classList.add(`proposal-${status}`);
        card.querySelector('.ai-proposal-actions').innerHTML = `<span class="ai-proposal-result">${escapeHtml(texts[status])}</span>`;
    }

    // ---------- 渲染 ----------
    function formatAnswer(text) {
        let html = escapeHtml(text);
        html = html.replace(/\[\[tel:([^\]|]+)\]\]/g, (_, id) => {
            const phone = phoneOfRecord(id);
            return phone ? `<a class="ai-tel" href="tel:${escapeHtml(phone.split(/[\/、,，\s]/)[0])}">${escapeHtml(phone)}</a>` : '（电话未知）';
        });
        html = html.replace(/\[\[rec:([^\]|]+)\|([^\]]+)\]\]/g, (_, id, label) =>
            findEntry(id) ? `<a href="#" class="ai-rec-link" data-device-id="${escapeHtml(id)}">${label}</a>` : label);
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/^#{1,4}\s*(.+)$/gm, '<strong>$1</strong>');
        html = html.replace(/^\s*[-*]\s+/gm, '• ');
        return html.replace(/\n/g, '<br>');
    }

    function listElement() {
        return document.getElementById('aiMessages');
    }

    function scrollToBottom() {
        const list = listElement();
        list.scrollTop = list.scrollHeight;
    }

    function appendMessage(role, text) {
        const div = document.createElement('div');
        div.className = `ai-message ai-${role}`;
        div.innerHTML = role === 'assistant' ? formatAnswer(text) : escapeHtml(text).replace(/\n/g, '<br>');
        listElement().appendChild(div);
        scrollToBottom();
    }

    function appendProposalCard(proposal) {
        const div = document.createElement('div');
        div.className = 'ai-proposal';
        div.dataset.proposalId = proposal.id;
        div.innerHTML = `
            <div class="ai-proposal-title">📝 ${escapeHtml(proposal.title)}（需要你确认）</div>
            <table>${proposal.rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</table>
            <div class="ai-proposal-actions">
                <button type="button" class="secondary-btn" data-action="cancel">取消</button>
                <button type="button" data-action="confirm">确认保存</button>
            </div>`;
        listElement().appendChild(div);
        scrollToBottom();
    }

    function setBusy(value) {
        document.getElementById('aiSendBtn').disabled = value;
        document.querySelectorAll('.ai-chip').forEach(chip => { chip.disabled = value; });
    }

    function setStatus(text) {
        const element = document.getElementById('aiStatus');
        element.textContent = text;
        element.style.display = text ? 'block' : 'none';
    }

    function clearConversation() {
        if (busy) return;
        history = [];
        proposals.clear();
        listElement().innerHTML = '';
        appendMessage('assistant', '你好！我可以帮你查到期客户、排上门计划、写提醒和催款消息，也可以把你说的跟进情况整理成记录（需要你确认后才保存）。');
    }

    function open() {
        document.getElementById('aiPanel').classList.add('open');
        document.getElementById('aiInput').focus();
    }

    function close() {
        document.getElementById('aiPanel').classList.remove('open');
    }

    // 登录后调用：可用时显示悬浮按钮
    function refreshVisibility() {
        const visible = Boolean(currentUser) && isAvailable();
        document.getElementById('aiFab').style.display = visible ? 'flex' : 'none';
        if (!visible) close();
    }

    function reset() {
        history = [];
        proposals.clear();
        if (listElement()) clearConversation();
        refreshVisibility();
    }

    function init() {
        const panel = document.getElementById('aiPanel');
        if (!panel) return;
        document.getElementById('aiChips').innerHTML = QUICK_PROMPTS
            .map(prompt => `<button type="button" class="ai-chip">${escapeHtml(prompt)}</button>`).join('');

        document.getElementById('aiFab').addEventListener('click', open);
        document.getElementById('aiCloseBtn').addEventListener('click', close);
        document.getElementById('aiClearBtn').addEventListener('click', clearConversation);
        document.getElementById('aiChips').addEventListener('click', (e) => {
            if (e.target.matches('.ai-chip')) ask(e.target.textContent);
        });

        const input = document.getElementById('aiInput');
        const send = () => {
            const text = input.value;
            input.value = '';
            ask(text);
        };
        document.getElementById('aiSendBtn').addEventListener('click', send);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                send();
            }
        });

        listElement().addEventListener('click', (e) => {
            const link = e.target.closest('.ai-rec-link');
            if (link) {
                e.preventDefault();
                if (window.innerWidth < 768) close();
                scrollToDevice(Number(link.dataset.deviceId));
                return;
            }
            const button = e.target.closest('.ai-proposal button');
            if (button) {
                const id = button.closest('.ai-proposal').dataset.proposalId;
                if (button.dataset.action === 'confirm') confirmProposal(id);
                else cancelProposal(id);
            }
        });

        clearConversation();
        refreshVisibility();
    }

    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 150));

    return { ask, reset, refreshVisibility, isAvailable, _test: { executeTool, maskText, formatAnswer, getHistory: () => history } };
})();
