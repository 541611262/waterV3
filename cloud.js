// 腾讯云开发 CloudBase 数据层：登录、客户数据同步、成员角色
// 只有在 config.js 中填写了 cloudbaseEnv 时才会启用；数据权限由云端“安全规则”保证（见 cloudbase/ 目录）
const CloudStore = (() => {
    const SDK_URL = 'https://static.cloudbase.net/cloudbase-js-sdk/2.27.1/cloudbase.full.js';
    const PAGE_SIZE = 100; // Web SDK 单次查询最多返回 100 条
    const MAX_CONCURRENT_WRITES = 5;

    let auth = null;
    let db = null;
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
        db = app.database();
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
        if (/PERMISSION_DENIED/i.test(code)) return '没有权限访问这些数据';
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
            const data = unwrap(await auth.getSession());
            const session = data && data.session;
            if (!session) return null;
            const user = readUser(session.user);
            if (user) return user;
        }
        if (typeof auth.getUser === 'function') {
            const data = unwrap(await auth.getUser());
            const user = readUser(data && data.user ? data.user : data);
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
    // members 集合：文档ID = 用户 uid，{ uid, username, role: 'admin' | 'member' }；角色只有管理员能修改
    async function loadMember(user) {
        const rows = unwrap(await db.collection('members').where({ uid: '{openid}' }).get());
        if (rows && rows.length) return rows[0];

        // 第一次登录：登记为普通成员（安全规则只允许本人以 member 身份创建）
        const member = { uid: user.uid, username: user.username, role: 'member', createdAt: new Date().toISOString() };
        try {
            unwrap(await db.collection('members').add({ _id: user.uid, ...member }));
        } catch (error) {
            console.warn('登记成员信息失败:', error);
        }
        return member;
    }

    async function listMembers() {
        return fetchAll(db.collection('members'));
    }

    async function setMemberRole(uid, role) {
        unwrap(await db.collection('members').doc(uid).update({ role }));
    }

    // ---------- 客户数据 ----------
    async function fetchAll(query) {
        const all = [];
        for (let skip = 0; ; skip += PAGE_SIZE) {
            const rows = unwrap(await query.skip(skip).limit(PAGE_SIZE).get()) || [];
            all.push(...rows);
            if (rows.length < PAGE_SIZE) break;
        }
        return all;
    }

    // 普通成员只查询自己的客户（查询条件必须与安全规则一致），管理员查询全部
    async function loadCustomers(isAdmin) {
        const collection = db.collection('customers');
        const docs = await fetchAll(isAdmin ? collection : collection.where({ userId: '{openid}' }));
        syncedJson.clear();
        return docs.map(doc => {
            const { _id, _openid, ...customer } = doc;
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

    // 新客户用 add（安全规则校验写入的 userId 必须是本人），已有客户用 update（安全规则校验云端原记录的负责人）。
    // 不使用 set：避免有人用自己的 userId 覆盖别人的客户文档
    async function writeCustomer(collection, id, data, isNew) {
        if (isNew) {
            try {
                unwrap(await collection.add({ _id: id, ...data }));
                return;
            } catch (error) {
                // 上一次同步可能已经创建成功但没收到响应，改为更新
                console.warn('新增客户失败，尝试更新:', error);
            }
        }
        unwrap(await collection.doc(id).update(data));
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
            const collection = db.collection('customers');
            const current = new Map(getCustomers().map(customer => [String(customer.id), JSON.stringify(customer)]));
            const tasks = [];
            current.forEach((json, id) => {
                if (syncedJson.get(id) === json) return;
                const isNew = !syncedJson.has(id);
                tasks.push(async () => {
                    await writeCustomer(collection, id, JSON.parse(json), isNew);
                    syncedJson.set(id, json);
                });
            });
            syncedJson.forEach((json, id) => {
                if (current.has(id)) return;
                tasks.push(async () => {
                    unwrap(await collection.doc(id).remove());
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
