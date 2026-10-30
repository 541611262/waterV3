// 腾讯云开发 CloudBase 数据层：登录、客户数据同步、成员角色
// 只有在 config.js 中填写了 cloudbaseEnv 时才会启用；数据存放在云开发 PostgreSQL，
// 数据权限由数据库的 RLS 行级安全策略保证（见 cloudbase/schema.sql）
const CloudStore = (() => {
    // 必须用 v3：新建环境的账号在 {env}.api.tcloudbasegateway.com 网关上，
    // v2 SDK 连接的是旧网关，登录会一直返回“用户名或密码不正确”
    const SDK_URL = 'https://static.cloudbase.net/cloudbase-js-sdk/3.10.4/cloudbase.full.js';
    const PAGE_SIZE = 500;
    const MAX_CONCURRENT_WRITES = 5;

    let auth = null;
    let rdb = null;
    const syncedJson = new Map(); // 客户ID → 上次成功写入云端时的 JSON，用于只上传有变化的客户
    let syncing = false;
    let syncQueued = false;
    let lastSyncError = null;
    let statusListener = () => {};

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error('云开发 SDK 加载失败，请检查网络'));
            document.head.appendChild(script);
        });
    }

    async function init(config) {
        if (typeof cloudbase === 'undefined') await loadScript(SDK_URL);
        const app = cloudbase.init({ env: config.cloudbaseEnv, region: config.cloudbaseRegion || 'ap-shanghai' });
        auth = typeof app.auth === 'function' ? app.auth({ persistence: 'local' }) : app.auth;
        rdb = app.rdb();
    }

    // 兼容 SDK 不同版本的返回值：{ data, error } 或直接抛出异常
    function unwrap(result) {
        if (result && result.error) throw new Error(describeError(result.error));
        if (result && result.code) throw new Error(describeError(result));
        return result && 'data' in result ? result.data : result;
    }

    function describeError(error) {
        const code = String(error.code || error.error || '');
        if (/password|credential|invalid_grant|not_found|user_not/i.test(code + (error.message || ''))) return '用户名或密码错误';
        if (/PERMISSION_DENIED|42501|row-level security|permission denied/i.test(code + (error.message || ''))) return '没有权限访问这些数据';
        return error.message || error.error_description || code || '未知错误';
    }

    function readUser(user) {
        if (!user) return null;
        const uid = user.id || user.ID || user.uid || user.sub;
        if (!uid || user.is_anonymous || user.isAnonymous || user.loginType === 'ANONYMOUS') return null;
        const username = user.username || user.name || (user.user_metadata && user.user_metadata.username) || '';
        return { uid: String(uid), username };
    }

    // 当前登录用户；未登录或匿名登录时返回 null
    async function getCurrentUser() {
        if (typeof auth.getSession === 'function') {
            try {
                const result = await auth.getSession();
                const session = result && result.data && result.data.session;
                const user = session && readUser(session.user);
                if (user) return user;
            } catch (error) {
                // 未登录时部分 SDK 版本会报错，按“未登录”处理
            }
        }
        if (typeof auth.getUser === 'function') {
            const result = await auth.getUser();
            if (result && result.error) return null;
            const data = result && 'data' in result ? result.data : result;
            const user = readUser(data && 'user' in data ? data.user : data);
            if (user) return user;
        }
        return readUser(auth.currentUser);
    }

    async function signIn(username, password) {
        if (typeof auth.signInWithPassword === 'function') {
            unwrap(await auth.signInWithPassword({ username, password }));
        } else {
            await auth.signIn({ username, password });
        }
        const user = await getCurrentUser();
        if (!user) throw new Error('登录失败，请重试');
        if (!user.username) user.username = username;
        return user;
    }

    async function signOut() {
        syncedJson.clear();
        await auth.signOut();
    }

    async function changePassword(oldPassword, newPassword) {
        if (typeof auth.resetPasswordForOld === 'function') {
            unwrap(await auth.resetPasswordForOld({ old_password: oldPassword, new_password: newPassword }));
        } else if (auth.currentUser && typeof auth.currentUser.updatePassword === 'function') {
            await auth.currentUser.updatePassword(newPassword, oldPassword);
        } else {
            throw new Error('当前 SDK 不支持在线修改密码，请联系管理员在控制台重置');
        }
    }

    // ---------- 成员与角色 ----------
    // members 表：{ uid, username, role: 'admin' | 'member', created_at }；角色只有管理员能修改
    function toMember(row) {
        return { uid: row.uid, username: row.username, role: row.role, createdAt: row.created_at };
    }
    
    async function loadMember(user) {
        const rows = unwrap(await rdb.from('members').select('*').eq('uid', user.uid));
        if (rows && rows.length) return toMember(rows[0]);
        
        // 第一次登录：登记为普通成员（RLS 只允许本人以 member 身份登记）
        const member = { uid: user.uid, username: user.username, role: 'member' };
        try {
            unwrap(await rdb.from('members').insert(member));
        } catch (error) {
            console.warn('登记成员信息失败:', error);
        }
        return { ...member, createdAt: new Date().toISOString() };
    }
    
    async function listMembers() {
        return (await fetchAll('members', 'uid', '*')).map(toMember);
    }
    
    async function setMemberRole(uid, role) {
        // RLS 拒绝的 UPDATE 不会报错，只是影响 0 行，所以用返回的行判断是否成功
        const rows = unwrap(await rdb.from('members').update({ role }).eq('uid', uid).select('uid'));
        if (!rows || !rows.length) throw new Error('没有权限修改该成员的角色');
    }
    
    // ---------- 客户数据 ----------
    async function fetchAll(table, orderColumn, columns) {
        const all = [];
        for (let from = 0; ; from += PAGE_SIZE) {
            const rows = unwrap(await rdb.from(table).select(columns).order(orderColumn, { ascending: true }).range(from, from + PAGE_SIZE - 1)) || [];
            all.push(...rows);
            if (rows.length < PAGE_SIZE) break;
        }
        return all;
    }
    
    // RLS 自动过滤：普通成员只会拿到自己的客户，管理员拿到全部
    // normalize 用于补齐默认字段，使“已同步内容”与页面中的数据完全一致
    async function loadCustomers(normalize = customer => customer) {
        const rows = await fetchAll('customers', 'id', 'id,user_id,data');
        syncedJson.clear();
        return rows.map(row => {
            const customer = normalize({ ...row.data, userId: row.user_id });
            syncedJson.set(String(customer.id), JSON.stringify(customer));
            return customer;
        });
    }
    
    async function runLimited(tasks, limit) {
        const errors = [];
        let index = 0;
        const worker = async () => {
            while (index < tasks.length) {
                const task = tasks[index++];
                try {
                    await task();
                } catch (error) {
                    errors.push(error);
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
        if (errors.length) throw errors[0];
    }

    // 新客户 INSERT（RLS 要求负责人 user_id 是本人）；已有客户只 UPDATE 内容，不修改负责人。
    // RLS 拒绝的 UPDATE / DELETE 不会报错，只会影响 0 行，所以通过返回的行判断是否真正写入
    async function writeCustomer(id, customer, isNew) {
        const updatedAt = new Date().toISOString();
        if (isNew) {
            const result = await rdb.from('customers').insert({ id, user_id: customer.userId, data: customer, updated_at: updatedAt });
            if (!result.error) return;
            // 上一次同步可能已经创建成功但没收到响应，改为更新
            console.warn('新增客户失败，尝试更新:', result.error);
        }
        const rows = unwrap(await rdb.from('customers').update({ data: customer, updated_at: updatedAt }).eq('id', id).select('id'));
        if (!rows || !rows.length) throw new Error('没有权限保存该客户，或该客户已在云端被删除');
    }
    
    async function deleteCustomer(id) {
        unwrap(await rdb.from('customers').delete().eq('id', id));
    }
    
    // 把内存中的客户列表与云端对比：只上传有变化的客户、删除已删除的客户
    // getCustomers 是函数：排队重试时总是取最新的客户列表
    async function sync(getCustomers) {
        if (syncing) {
            syncQueued = true;
            return;
        }
        syncing = true;
        statusListener('saving');

        try {
            const current = new Map(getCustomers().map(customer => [String(customer.id), JSON.stringify(customer)]));
            const tasks = [];
            current.forEach((json, id) => {
                if (syncedJson.get(id) === json) return;
                const isNew = !syncedJson.has(id);
                tasks.push(async () => {
                    await writeCustomer(id, JSON.parse(json), isNew);
                    syncedJson.set(id, json);
                });
            });
            syncedJson.forEach((json, id) => {
                if (current.has(id)) return;
                tasks.push(async () => {
                    await deleteCustomer(id);
                    syncedJson.delete(id);
                });
            });
            await runLimited(tasks, MAX_CONCURRENT_WRITES);
            lastSyncError = null;
        } catch (error) {
            console.error('云端保存失败:', error);
            lastSyncError = error;
        } finally {
            syncing = false;
        }

        if (syncQueued) {
            syncQueued = false;
            return sync(getCustomers);
        }
        statusListener(lastSyncError ? 'error' : 'saved', lastSyncError);
    }

    function hasPendingChanges(customerList) {
        if (syncing || lastSyncError) return true;
        if (customerList.length !== syncedJson.size) return true;
        return customerList.some(customer => syncedJson.get(String(customer.id)) !== JSON.stringify(customer));
    }

    return {
        init,
        getCurrentUser,
        signIn,
        signOut,
        changePassword,
        loadMember,
        listMembers,
        setMemberRole,
        loadCustomers,
        sync,
        hasPendingChanges,
        onStatusChange(listener) { statusListener = listener; }
    };
})();
