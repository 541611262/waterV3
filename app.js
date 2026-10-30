// 用户数据存储
let users = [];
let currentUser = null;
let customers = [];

// DOM元素
const loginSection = document.getElementById('loginSection');
const registerSection = document.getElementById('registerSection');
const recoverySection = document.getElementById('recoverySection');
const adminUserManagement = document.getElementById('adminUserManagement');
const mainApp = document.getElementById('mainApp');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginBtn = document.getElementById('loginBtn');
const showRegisterLink = document.getElementById('showRegisterLink');
const showLoginLink = document.getElementById('showLoginLink');
const registerUsername = document.getElementById('registerUsername');
const registerPassword = document.getElementById('registerPassword');
const confirmPassword = document.getElementById('confirmPassword');
const registerBtn = document.getElementById('registerBtn');
const securityQuestion = document.getElementById('securityQuestion');
const securityAnswer = document.getElementById('securityAnswer');
const loginError = document.getElementById('loginError');
const registerError = document.getElementById('registerError');
const recoveryError = document.getElementById('recoveryError');
const currentUsername = document.getElementById('currentUsername');
const currentUserRole = document.getElementById('currentUserRole');
const logoutBtn = document.getElementById('logoutBtn');
const changePasswordBtn = document.getElementById('changePasswordBtn');
const changePasswordModal = document.getElementById('changePasswordModal');
const changePasswordError = document.getElementById('changePasswordError');
const currentPassword = document.getElementById('currentPassword');
const newPassword = document.getElementById('newPassword');
const confirmNewPassword = document.getElementById('confirmNewPassword');
const savePasswordBtn = document.getElementById('savePasswordBtn');
const closeBtn = document.querySelector('.close');

// 密码恢复相关元素
const showRecoveryLink = document.getElementById('showRecoveryLink');
const backToLoginLink = document.getElementById('backToLoginLink');
const recoveryUsername = document.getElementById('recoveryUsername');
const recoverySecurityAnswer = document.getElementById('recoverySecurityAnswer');
const newRecoveryPassword = document.getElementById('newRecoveryPassword');
const confirmRecoveryPassword = document.getElementById('confirmRecoveryPassword');
const recoveryBtn = document.getElementById('recoveryBtn');

// 管理员用户管理相关元素
const userList = document.getElementById('userList');
const backToMainAppLink = document.getElementById('backToMainAppLink');

// 客户管理相关元素（表单字段由 RECORD_FIELDS 动态生成）
const addRecordFields = document.getElementById('addRecordFields');
const addCustomerBtn = document.getElementById('addCustomer');
const reminderList = document.getElementById('reminderList');
const recordCount = document.getElementById('recordCount');
const showAllCheckbox = document.getElementById('showAll');
const importBtn = document.getElementById('importBtn');
const exportBtn = document.getElementById('exportBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const exportHistoryBtn = document.getElementById('exportHistoryBtn');
const downloadSample = document.getElementById('downloadSample');
const csvFile = document.getElementById('csvFile');
const importStatus = document.getElementById('importStatus');

// 搜索和筛选相关元素
const customerSearch = document.getElementById('customerSearch');
const regionFilter = document.getElementById('regionFilter');
const statusFilter = document.getElementById('statusFilter');
const followupMonthFilter = document.getElementById('followupMonthFilter');
const sortOrder = document.getElementById('sortOrder');

// 编辑客户模态框相关元素
const editCustomerModal = document.getElementById('editCustomerModal');
const editCustomerFields = document.getElementById('editCustomerFields');
const saveCustomerBtn = document.getElementById('saveCustomerBtn');
const editCustomerError = document.getElementById('editCustomerError');
const closeEditBtn = document.querySelector('.close-edit');

// 当前编辑的客户 / 装机记录ID
let currentEditingCustomerId = null;
let currentEditingDeviceId = null;

// 历史记录、跟踪记录相关变量
let currentHistoryDeviceId = null;
let currentEditingHistoryId = null;
let currentReplacementDeviceId = null;
let currentFollowUpCustomerId = null;

// 初始化：生成表单、设置默认日期
document.addEventListener('DOMContentLoaded', () => {
    if (addRecordFields) {
        renderForm(addRecordFields, 'add', ADD_FORM_SECTIONS);
        resetAddForm();
        const addNameInput = document.getElementById('add_name');
        if (addNameInput) addNameInput.addEventListener('change', handleAddNameChange);
    }
    if (editCustomerFields) renderForm(editCustomerFields, 'cust', CUSTOMER_FORM_SECTIONS);
    const editDeviceFields = document.getElementById('editDeviceFields');
    if (editDeviceFields) renderForm(editDeviceFields, 'dev', DEVICE_FORM_SECTIONS);
    
    if (IS_CLOUD_MODE) {
        // 云端模式：账号与客户数据都来自云开发
        initCloudMode();
    } else {
        // 单机模式：从localStorage加载用户和客户数据
        loadUsersFromStorage();
        loadCustomersFromStorage();
        checkLoggedInUser();
    }
    
    // 绑定事件监听器
    setTimeout(bindEventListeners, 100);
});

// 绑定所有事件监听器
function bindEventListeners() {
    // 确保DOM元素存在后再绑定事件
    if (!loginBtn || !showRegisterLink || !showLoginLink || !registerBtn) {
        console.error('部分DOM元素未找到，无法绑定事件监听器');
        return;
    }
    
    // 登录相关
    loginBtn.addEventListener('click', login);
    showRegisterLink.addEventListener('click', showRegistration);
    showLoginLink.addEventListener('click', showLogin);
    registerBtn.addEventListener('click', register);
    
    // 确保元素存在后再绑定事件
    if (showRecoveryLink) showRecoveryLink.addEventListener('click', showRecovery);
    if (backToLoginLink) backToLoginLink.addEventListener('click', showLogin);
    if (recoveryBtn) recoveryBtn.addEventListener('click', recoverPassword);
    if (backToMainAppLink) backToMainAppLink.addEventListener('click', showMainApp);
    
    // 主应用相关
    if (addCustomerBtn) addCustomerBtn.addEventListener('click', addCustomer);
    if (importBtn) importBtn.addEventListener('click', importData);
    if (exportBtn) exportBtn.addEventListener('click', () => exportRecords('xlsx'));
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => exportRecords('csv'));
    if (exportHistoryBtn) exportHistoryBtn.addEventListener('click', exportDetailedHistory);
    if (downloadSample) downloadSample.addEventListener('click', downloadTemplate);
    if (showAllCheckbox) showAllCheckbox.addEventListener('change', renderReminderList);
    if (customerSearch) customerSearch.addEventListener('input', debouncedRenderReminderList);
    // 区域 / 标记 / 月份：多选筛选
    if (regionFilter) initMultiSelect(regionFilter, [], renderReminderList);
    if (statusFilter) initMultiSelect(statusFilter, STATUS_FILTER_OPTIONS, renderReminderList);
    if (followupMonthFilter) {
        const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}月` }));
        initMultiSelect(followupMonthFilter, months, renderReminderList);
    }
    if (sortOrder) sortOrder.addEventListener('change', renderReminderList);
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    if (changePasswordBtn) changePasswordBtn.addEventListener('click', showChangePasswordModal);
    
    // 云端模式：同步状态、上传本机数据
    const syncStatus = document.getElementById('syncStatus');
    const uploadLocalDataBtn = document.getElementById('uploadLocalDataBtn');
    const clearLocalDataBtn = document.getElementById('clearLocalDataBtn');
    if (syncStatus) syncStatus.addEventListener('click', retryCloudSync);
    if (uploadLocalDataBtn) uploadLocalDataBtn.addEventListener('click', uploadLocalData);
    if (clearLocalDataBtn) clearLocalDataBtn.addEventListener('click', () => {
        if (confirm('确定清除这台电脑浏览器里的单机版数据吗？清除后无法恢复（云端数据不受影响）。')) clearLocalData();
    });
    
    // 编辑模态框相关
    if (saveCustomerBtn) saveCustomerBtn.addEventListener('click', saveEditedCustomer);
    if (closeEditBtn) closeEditBtn.addEventListener('click', closeEditCustomerModal);
    
    // 修改密码模态框相关
    if (savePasswordBtn) savePasswordBtn.addEventListener('click', changePassword);
    if (closeBtn) closeBtn.addEventListener('click', closeChangePasswordModal);
    
    window.addEventListener('click', (e) => {
        if (changePasswordModal && e.target === changePasswordModal) {
            closeChangePasswordModal();
        }
        if (editCustomerModal && e.target === editCustomerModal) {
            closeEditCustomerModal();
        }
    });
    
    // 绑定历史记录管理相关事件
    bindHistoryManagementEvents();
    bindBatchEvents();
    
    // 绑定新功能事件
    bindDashboardEvents();
    bindNotificationEvents();
    bindReminderModalEvents();
}

// 绑定历史记录管理事件
function bindHistoryManagementEvents() {
    setTimeout(() => {
        const saveReplacementBtn = document.getElementById('saveReplacementBtn');
        const closeReplacementBtn = document.querySelector('.close-replacement');
        const addReplacementModal = document.getElementById('addReplacementModal');
        
        // 历史记录管理相关元素
        const saveEditHistoryBtn = document.getElementById('saveEditHistoryBtn');
        const closeEditHistoryBtn = document.querySelector('.close-edit-history');
        const closeHistoryBtn = document.querySelector('.close-history');
        const editHistoryModal = document.getElementById('editHistoryModal');
        const historyManagementModal = document.getElementById('historyManagementModal');
        
        if (saveReplacementBtn) {
            saveReplacementBtn.addEventListener('click', saveReplacementRecord);
        }
        
        if (closeReplacementBtn) {
            closeReplacementBtn.addEventListener('click', closeAddReplacementModal);
        }
        
        // 历史记录编辑模态框事件
        if (saveEditHistoryBtn) {
            saveEditHistoryBtn.addEventListener('click', saveEditedHistoryRecord);
        }
        
        if (closeEditHistoryBtn) {
            closeEditHistoryBtn.addEventListener('click', closeEditHistoryModal);
        }
        
        if (closeHistoryBtn) {
            closeHistoryBtn.addEventListener('click', closeHistoryManagementModal);
        }
        
        // 编辑装机记录、跟踪记录模态框事件
        const editDeviceModal = document.getElementById('editDeviceModal');
        const saveDeviceBtn = document.getElementById('saveDeviceBtn');
        const closeEditDeviceBtn = document.querySelector('.close-edit-device');
        const followUpModal = document.getElementById('followUpModal');
        const saveFollowUpBtn = document.getElementById('saveFollowUpBtn');
        const closeFollowUpBtn = document.querySelector('.close-followup');
        if (saveDeviceBtn) saveDeviceBtn.addEventListener('click', saveEditedDevice);
        if (closeEditDeviceBtn) closeEditDeviceBtn.addEventListener('click', closeEditDeviceModal);
        if (saveFollowUpBtn) saveFollowUpBtn.addEventListener('click', saveFollowUpRecord);
        if (closeFollowUpBtn) closeFollowUpBtn.addEventListener('click', closeFollowUpModal);
        
        // 点击模态框外部关闭
        if (addReplacementModal) {
            window.addEventListener('click', (e) => {
                if (e.target === addReplacementModal) {
                    closeAddReplacementModal();
                }
                if (e.target === editHistoryModal) {
                    closeEditHistoryModal();
                }
                if (e.target === historyManagementModal) {
                    closeHistoryManagementModal();
                }
                if (e.target === editDeviceModal) {
                    closeEditDeviceModal();
                }
                if (e.target === followUpModal) {
                    closeFollowUpModal();
                }
            });
        }
    }, 200);
}

// ==================== 运行模式 ====================
// config.js 中填写了云开发环境 ID 时为云端模式，否则为单机模式（数据只在当前浏览器）
const APP_CONFIG = window.APP_CONFIG || {};
const IS_CLOUD_MODE = Boolean(APP_CONFIG.cloudbaseEnv);
const memberNames = new Map(); // 云端模式下：uid → 用户名（管理员查看“负责人”用）

// ==================== 单机模式：本地账号 ====================
// 从localStorage加载用户数据
function loadUsersFromStorage() {
    try {
        const storedUsers = localStorage.getItem('waterFilterUsersV3');
        users = storedUsers ? JSON.parse(storedUsers) : [];
    } catch (error) {
        console.error('Error loading users from storage:', error);
        users = [];
    }
    // 旧版本会把含密码的当前用户写入 localStorage，这里顺手清除
    localStorage.removeItem('waterFilterCurrentUserV3');
}

// 保存用户数据到localStorage
function saveUsersToStorage() {
    try {
        localStorage.setItem('waterFilterUsersV3', JSON.stringify(users));
    } catch (error) {
        console.error('Error saving users to storage:', error);
    }
}

function toHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// PBKDF2 加盐哈希；浏览器不支持 Web Crypto（如通过局域网 IP 的 http 访问）时返回 null
async function deriveSecretHash(secret, salt) {
    if (!(window.crypto && crypto.subtle)) return null;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
    return toHex(bits);
}

// 把密码 / 安全问题答案以哈希形式保存到用户对象（field: 'password' | 'securityAnswer'）
async function setUserSecret(user, field, value) {
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await deriveSecretHash(value, salt);
    if (hash === null) {
        user[field] = value;
        return;
    }
    user[`${field}Hash`] = hash;
    user[`${field}Salt`] = salt;
    delete user[field];
}

async function verifyUserSecret(user, field, value) {
    if (user[`${field}Hash`]) {
        return (await deriveSecretHash(value, user[`${field}Salt`])) === user[`${field}Hash`];
    }
    return user[field] === value; // 旧版本的明文数据，验证通过后会转换成哈希
}

// 首次使用时没有任何账号：引导创建管理员
function isFirstRun() {
    return !IS_CLOUD_MODE && users.length === 0;
}

// 检查是否有已登录用户
function checkLoggedInUser() {
    if (isFirstRun()) {
        showRegistration();
    } else {
        showLogin();
    }
}

// 显示登录界面
function showLogin(e) {
    if (e && e.preventDefault) e.preventDefault();
    loginSection.style.display = 'block';
    registerSection.style.display = 'none';
    recoverySection.style.display = 'none';
    adminUserManagement.style.display = 'none';
    mainApp.style.display = 'none';
    loginError.textContent = '';
    loginUsername.value = '';
    loginPassword.value = '';
    if (securityQuestion) securityQuestion.value = '';
    if (securityAnswer) securityAnswer.value = '';
    if (recoveryUsername) recoveryUsername.value = '';
    if (recoverySecurityAnswer) recoverySecurityAnswer.value = '';
    if (newRecoveryPassword) newRecoveryPassword.value = '';
    if (confirmRecoveryPassword) confirmRecoveryPassword.value = '';
    if (recoveryError) recoveryError.textContent = '';
}

// 显示注册界面
function showRegistration(e) {
    if (e) e.preventDefault();
    if (IS_CLOUD_MODE) return;
    loginSection.style.display = 'none';
    registerSection.style.display = 'block';
    registerError.textContent = '';
    registerUsername.value = '';
    registerPassword.value = '';
    confirmPassword.value = '';
    if (securityQuestion) securityQuestion.value = '';
    if (securityAnswer) securityAnswer.value = '';

    const title = registerSection.querySelector('h2');
    const backLink = document.getElementById('showLoginLink');
    if (title) title.textContent = isFirstRun() ? '首次使用：创建管理员账户' : '注册新账户';
    if (backLink) backLink.style.display = isFirstRun() ? 'none' : '';
}

// 显示密码恢复界面
function showRecovery(e) {
    if (e) e.preventDefault();
    if (IS_CLOUD_MODE) return;
    loginSection.style.display = 'none';
    recoverySection.style.display = 'block';
    recoveryError.textContent = '';
    recoveryUsername.value = '';
    recoverySecurityAnswer.value = '';
    newRecoveryPassword.value = '';
    confirmRecoveryPassword.value = '';
}

// 密码恢复功能（单机模式）
async function recoverPassword(e) {
    e.preventDefault();
    const username = recoveryUsername.value.trim();
    const answer = recoverySecurityAnswer.value.trim();
    const newPwd = newRecoveryPassword.value;
    const confirmNewPwd = confirmRecoveryPassword.value;

    if (!username || !answer || !newPwd || !confirmNewPwd) {
        recoveryError.textContent = '请填写所有字段';
        return;
    }

    if (newPwd !== confirmNewPwd) {
        recoveryError.textContent = '新密码和确认密码不一致';
        return;
    }

    if (newPwd.length < 6) {
        recoveryError.textContent = '新密码长度至少为6位';
        return;
    }

    const user = users.find(u => u.username === username);
    if (!user || !(await verifyUserSecret(user, 'securityAnswer', answer))) {
        recoveryError.textContent = '用户名或安全问题答案错误';
        return;
    }

    await setUserSecret(user, 'password', newPwd);
    saveUsersToStorage();
    alert('密码恢复成功，请使用新密码登录');
    showLogin();
}

// 显示主应用
function showMainApp() {
    loginSection.style.display = 'none';
    registerSection.style.display = 'none';
    recoverySection.style.display = 'none';
    adminUserManagement.style.display = 'none';
    mainApp.style.display = 'block';
    currentUsername.textContent = currentUser.username;
    currentUserRole.textContent = currentUser.role === 'admin' ? '管理员' : '普通用户';

    // 初始化所有功能
    renderReminderList();
    updateDashboard();
    updateNotifications();

    if (currentUser.role === 'admin' && !document.getElementById('userManagementBtn')) {
        const userManagementBtn = document.createElement('button');
        userManagementBtn.textContent = '用户管理';
        userManagementBtn.id = 'userManagementBtn';
        userManagementBtn.style.marginLeft = '10px';
        userManagementBtn.addEventListener('click', showAdminUserManagement);
        document.querySelector('.user-actions').appendChild(userManagementBtn);
    }

    // 检查并显示登录提醒（延迟执行，确保界面完全加载）
    setTimeout(checkAndShowLoginReminder, 2000);
}

// 显示管理员用户管理界面
function showAdminUserManagement(e) {
    if (e) e.preventDefault();
    mainApp.style.display = 'none';
    adminUserManagement.style.display = 'block';
    renderUserList();
}

function renderUserItem({ id, username, role, createdAt, actionsHtml }) {
    return `
        <div class="user-item">
            <div class="user-item-info">
                <h3>${escapeHtml(username || '(未命名)')}</h3>
                <p>角色: ${role === 'admin' ? '管理员' : '普通用户'}</p>
                ${createdAt ? `<p>创建时间: ${new Date(createdAt).toLocaleDateString()}</p>` : ''}
            </div>
            <div class="user-item-actions" data-id="${escapeHtml(id)}">${actionsHtml}</div>
        </div>
    `;
}

// 渲染用户列表
async function renderUserList() {
    if (!currentUser || currentUser.role !== 'admin') {
        userList.innerHTML = '<p>您没有权限访问此页面</p>';
        return;
    }

    if (IS_CLOUD_MODE) {
        await renderCloudUserList();
        return;
    }

    if (users.length === 0) {
        userList.innerHTML = '<p>暂无用户记录</p>';
        return;
    }

    userList.innerHTML = users.map(user => {
        const isSelf = user.id === currentUser.id;
        const actionsHtml = isSelf ? '<span>当前登录账户</span>' : `
            ${user.role === 'admin'
                ? '<button class="demote-user-btn">降级为普通用户</button>'
                : '<button class="promote-user-btn">提升为管理员</button>'}
            <button class="delete-user-btn">删除用户</button>`;
        return renderUserItem({ ...user, actionsHtml });
    }).join('');

    const idOf = button => Number(button.closest('.user-item-actions').dataset.id);
    userList.querySelectorAll('.promote-user-btn').forEach(button => button.addEventListener('click', () => setLocalUserRole(idOf(button), 'admin')));
    userList.querySelectorAll('.demote-user-btn').forEach(button => button.addEventListener('click', () => setLocalUserRole(idOf(button), 'user')));
    userList.querySelectorAll('.delete-user-btn').forEach(button => button.addEventListener('click', () => deleteUser(idOf(button))));
}

// 云端模式：账号在云开发控制台创建，这里只调整角色
async function renderCloudUserList() {
    userList.innerHTML = '<p>正在加载成员列表...</p>';
    let members;
    try {
        members = await CloudStore.listMembers();
    } catch (error) {
        userList.innerHTML = `<p class="error-message">加载失败：${escapeHtml(error.message)}</p>`;
        return;
    }
    members.forEach(member => memberNames.set(member.uid, member.username));

    userList.innerHTML = `
        <p class="section-hint">新增账号、重置密码、停用账号请在 腾讯云开发控制台 → 身份认证 → 用户管理 中操作；同事首次登录后会出现在下面的列表里。</p>
        ${members.map(member => renderUserItem({
            id: member.uid,
            username: member.username,
            role: member.role,
            createdAt: member.createdAt,
            actionsHtml: member.uid === currentUser.id ? '<span>当前登录账户</span>'
                : member.role === 'admin'
                    ? '<button class="demote-user-btn">降级为普通用户</button>'
                    : '<button class="promote-user-btn">提升为管理员</button>'
        })).join('')}
    `;

    const update = async (button, role) => {
        button.disabled = true;
        try {
            await CloudStore.setMemberRole(button.closest('.user-item-actions').dataset.id, role);
            await renderCloudUserList();
        } catch (error) {
            alert(`修改失败：${error.message}`);
            button.disabled = false;
        }
    };
    userList.querySelectorAll('.promote-user-btn').forEach(button => button.addEventListener('click', () => update(button, 'admin')));
    userList.querySelectorAll('.demote-user-btn').forEach(button => button.addEventListener('click', () => update(button, 'member')));
}

// 修改本地用户角色
function setLocalUserRole(userId, role) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    user.role = role;
    saveUsersToStorage();
    renderUserList();
}

// 删除用户（单机模式）
function deleteUser(userId) {
    if (userId === currentUser.id) {
        alert('不能删除当前登录的账户');
        return;
    }

    if (confirm('确定要删除这个用户吗？这将同时删除该用户的所有客户数据。')) {
        users = users.filter(u => u.id !== userId);
        customers = customers.filter(customer => customer.userId !== userId);
        saveCustomersToStorage();
        saveUsersToStorage();
        renderUserList();
    }
}

// 登录功能
async function login(e) {
    e.preventDefault();
    const username = loginUsername.value.trim();
    const password = loginPassword.value;

    if (!username || !password) {
        loginError.textContent = '请输入用户名和密码';
        return;
    }

    if (IS_CLOUD_MODE) {
        loginBtn.disabled = true;
        loginError.textContent = '正在登录...';
        try {
            const user = await CloudStore.signIn(username, password);
            await enterCloudSession(user);
            loginError.textContent = '';
        } catch (error) {
            loginError.textContent = error.message || '登录失败';
        } finally {
            loginBtn.disabled = false;
        }
        return;
    }

    const user = users.find(u => u.username === username);
    if (!user || !(await verifyUserSecret(user, 'password', password))) {
        loginError.textContent = '用户名或密码错误';
        return;
    }

    // 旧版本明文保存的密码，登录成功后转换为哈希
    if (!user.passwordHash) {
        await setUserSecret(user, 'password', password);
        if (user.securityAnswer) await setUserSecret(user, 'securityAnswer', user.securityAnswer);
        saveUsersToStorage();
    }

    currentUser = user;
    showMainApp();

    if (username === 'admin' && password === 'admin123') {
        setTimeout(() => alert('您正在使用旧版本的默认密码 admin123，请点击右上角“修改密码”尽快修改。'), 300);
    }
}

// 注册功能（单机模式；首次使用时注册的账户为管理员）
async function register(e) {
    e.preventDefault();
    if (IS_CLOUD_MODE) return;

    const username = registerUsername.value.trim();
    const password = registerPassword.value;
    const confirmPwd = confirmPassword.value;
    const secQuestion = securityQuestion.value.trim();
    const secAnswer = securityAnswer.value.trim();

    if (!username || !password || !secQuestion || !secAnswer) {
        registerError.textContent = '请填写所有字段';
        return;
    }

    if (password !== confirmPwd) {
        registerError.textContent = '两次输入的密码不一致';
        return;
    }

    if (password.length < 6) {
        registerError.textContent = '密码长度至少为6位';
        return;
    }

    if (users.some(u => u.username === username)) {
        registerError.textContent = '用户名已存在';
        return;
    }

    const newUser = {
        id: Date.now(),
        username,
        securityQuestion: secQuestion,
        role: users.length === 0 ? 'admin' : 'user',
        createdAt: new Date().toISOString()
    };
    await setUserSecret(newUser, 'password', password);
    await setUserSecret(newUser, 'securityAnswer', secAnswer);

    users.push(newUser);
    saveUsersToStorage();

    currentUser = newUser;
    showMainApp();
}

// 退出登录
async function logout() {
    if (IS_CLOUD_MODE) {
        if (CloudStore.hasPendingChanges(customers) &&
            !confirm('还有修改没有保存到云端，现在退出会丢失这些修改。确定退出吗？')) {
            return;
        }
        try {
            await CloudStore.signOut();
        } catch (error) {
            console.warn('退出登录失败:', error);
        }
        customers = [];
        memberNames.clear();
    }
    currentUser = null;
    selectedDeviceIds.clear();
    const userManagementBtn = document.getElementById('userManagementBtn');
    if (userManagementBtn) userManagementBtn.remove();
    showLogin();
}

// 显示修改密码模态框
function showChangePasswordModal() {
    changePasswordModal.style.display = 'block';
    changePasswordError.textContent = '';
    currentPassword.value = '';
    newPassword.value = '';
    confirmNewPassword.value = '';
}

// 关闭修改密码模态框
function closeChangePasswordModal() {
    changePasswordModal.style.display = 'none';
}

// 修改密码
async function changePassword(e) {
    e.preventDefault();
    const currentPwd = currentPassword.value;
    const newPwd = newPassword.value;
    const confirmNewPwd = confirmNewPassword.value;

    if (!currentPwd || !newPwd || !confirmNewPwd) {
        changePasswordError.textContent = '请填写所有字段';
        return;
    }

    if (newPwd !== confirmNewPwd) {
        changePasswordError.textContent = '新密码和确认密码不一致';
        return;
    }

    if (newPwd.length < 6) {
        changePasswordError.textContent = '新密码长度至少为6位';
        return;
    }

    if (IS_CLOUD_MODE) {
        try {
            await CloudStore.changePassword(currentPwd, newPwd);
        } catch (error) {
            changePasswordError.textContent = error.message === '用户名或密码错误' ? '当前密码错误' : error.message;
            return;
        }
    } else {
        const user = users.find(u => u.id === currentUser.id);
        if (!user || !(await verifyUserSecret(user, 'password', currentPwd))) {
            changePasswordError.textContent = '当前密码错误';
            return;
        }
        await setUserSecret(user, 'password', newPwd);
        saveUsersToStorage();
    }

    closeChangePasswordModal();
    alert('密码修改成功');
}

// ==================== 云端模式 ====================
async function initCloudMode() {
    document.body.classList.add('cloud-mode');
    CloudStore.onStatusChange(updateSyncStatus);
    showLogin();
    loginBtn.disabled = true;
    loginError.textContent = '正在连接云端...';

    try {
        await CloudStore.init(APP_CONFIG);
        const user = await CloudStore.getCurrentUser();
        loginError.textContent = '';
        if (user) await enterCloudSession(user);
    } catch (error) {
        console.error('云端初始化失败:', error);
        loginError.textContent = `连接云端失败：${error.message}`;
    } finally {
        loginBtn.disabled = false;
    }

    // 有未保存到云端的修改时，关闭页面前提醒
    window.addEventListener('beforeunload', (e) => {
        if (currentUser && CloudStore.hasPendingChanges(customers)) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

// 登录成功后：读取角色和客户数据
async function enterCloudSession(user) {
    const member = await CloudStore.loadMember(user);
    currentUser = { id: user.uid, username: member.username || user.username, role: member.role === 'admin' ? 'admin' : 'user' };
    memberNames.set(currentUser.id, currentUser.username);

    customers = await CloudStore.loadCustomers(normalizeCustomer);
    if (currentUser.role === 'admin') {
        CloudStore.listMembers()
            .then(members => {
                members.forEach(m => memberNames.set(m.uid, m.username));
                renderReminderList();
            })
            .catch(error => console.warn('加载成员列表失败:', error));
    }

    showMainApp();
    updateSyncStatus('saved');
    updateLocalDataNotice();
}

function updateSyncStatus(state, error) {
    const element = document.getElementById('syncStatus');
    if (!element) return;
    const texts = {
        saving: '☁️ 正在保存...',
        saved: '☁️ 已保存到云端',
        error: '⚠️ 云端保存失败，点击重试'
    };
    element.textContent = texts[state] || '';
    element.className = `sync-status sync-${state}`;
    element.title = error ? error.message : '';
}

function retryCloudSync() {
    if (IS_CLOUD_MODE && currentUser) CloudStore.sync(() => customers);
}

// 本机浏览器里还留有单机模式的数据时，提示上传到云端
function readLocalCustomerData() {
    try {
        const v4 = localStorage.getItem(CUSTOMER_STORAGE_KEY);
        if (v4) return JSON.parse(v4).map(normalizeCustomer);
        const v3 = localStorage.getItem(LEGACY_CUSTOMER_STORAGE_KEY);
        if (v3) return migrateLegacyRecords(JSON.parse(v3));
    } catch (error) {
        console.warn('读取本机数据失败:', error);
    }
    return [];
}

function updateLocalDataNotice() {
    const notice = document.getElementById('localDataNotice');
    if (!notice) return;
    const localCustomers = readLocalCustomerData();
    if (!localCustomers.length) {
        notice.style.display = 'none';
        return;
    }
    const deviceCount = localCustomers.reduce((sum, c) => sum + c.devices.length, 0);
    notice.style.display = 'block';
    notice.querySelector('.local-data-summary').textContent =
        `这台电脑的浏览器里还保存着单机版的数据：${localCustomers.length} 个客户、${deviceCount} 条装机记录。`;
}

async function uploadLocalData() {
    const localCustomers = readLocalCustomerData();
    if (!localCustomers.length) return;
    if (!confirm(`将把本机的 ${localCustomers.length} 个客户上传到账号「${currentUser.username}」，同名客户会合并。是否继续？`)) return;

    let added = 0;
    let merged = 0;
    localCustomers.forEach(local => {
        const existing = findCustomerByName(local.name);
        if (existing) {
            const deviceIds = new Set(existing.devices.map(d => d.id));
            local.devices.forEach(device => { if (!deviceIds.has(device.id)) existing.devices.push(device); });
            mergeUnique(existing.followUps, local.followUps, followUpKey);
            merged++;
        } else if (!customers.some(c => c.id === local.id)) {
            customers.push({ ...local, userId: currentUser.id, ownerName: currentUser.username });
            added++;
        }
    });

    refreshAll();
    await CloudStore.sync(() => customers);
    if (CloudStore.hasPendingChanges(customers)) {
        alert('上传没有全部完成，请检查网络后点击右上角的“云端保存失败，点击重试”。本机数据暂时保留。');
        return;
    }

    alert(`上传完成：新增 ${added} 个客户，合并 ${merged} 个同名客户。`);
    if (confirm('为了保护客户信息，建议清除这台电脑浏览器里的单机版数据（云端数据不受影响）。现在清除吗？')) {
        clearLocalData();
    }
    updateLocalDataNotice();
}

function clearLocalData() {
    [CUSTOMER_STORAGE_KEY, LEGACY_CUSTOMER_STORAGE_KEY, 'waterFilterUsersV3'].forEach(key => localStorage.removeItem(key));
    updateLocalDataNotice();
}

// ==================== 客户数据存储 ====================
// 从localStorage加载客户数据（单机模式）
function loadCustomersFromStorage() {
    try {
        const storedCustomers = localStorage.getItem(CUSTOMER_STORAGE_KEY);
        if (storedCustomers) {
            customers = JSON.parse(storedCustomers).map(normalizeCustomer);
        } else {
            // 首次升级：把 V3 的“一客户一条”数据迁移成“客户 → 装机记录”结构，旧数据原样保留作为备份
            const legacyCustomers = localStorage.getItem(LEGACY_CUSTOMER_STORAGE_KEY);
            if (legacyCustomers) {
                customers = migrateLegacyRecords(JSON.parse(legacyCustomers));
                saveCustomersToStorage();
            }
        }
    } catch (error) {
        console.error('Error loading customers from storage:', error);
        customers = [];
    }
}

// 云端模式下合并短时间内的多次修改，再一次性同步
const scheduleCloudSync = debounce(() => CloudStore.sync(() => customers), 400);

// 保存客户数据：单机模式写入 localStorage，云端模式同步到云数据库
function saveCustomersToStorage() {
    if (IS_CLOUD_MODE) {
        updateSyncStatus('saving');
        scheduleCloudSync();
        return;
    }
    try {
        localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(customers));
    } catch (error) {
        console.error('Error saving customers to storage:', error);
    }
}

// ==================== 数据模型 ====================
// 客户(customer) → 多条装机记录(device)。导入导出时，一条装机记录对应《格式样板》里的一行。
// customer: { id, userId, ownerName, createdAt, name, province, region, longTermPartner, followUps[], devices[] }
// device:   { id, createdAt, address, contactPerson, phoneNumber, installDate, model, quantity, location,
//             filterPurchaseDate, customInterval, notes, replacementHistory[], needWaterTest, hasUnpaid, unpaidInterval }
const CUSTOMER_STORAGE_KEY = 'waterFilterCustomersV4';
const LEGACY_CUSTOMER_STORAGE_KEY = 'waterFilterCustomersV3';
const DEFAULT_REPLACEMENT_INTERVAL = 90; // 滤芯默认更换间隔(天)
const DEFAULT_UNPAID_INTERVAL = 30;      // 未收款默认催收间隔(天)

// 列顺序、表头、列宽与《格式样板.xls》一致；level 表示字段属于客户还是装机记录
const RECORD_FIELDS = [
    { key: 'name', header: '客户名称', level: 'customer', type: 'text', width: 27, aliases: ['客户', '名称', '公司', '单位', 'name'] },
    { key: 'province', header: '省份', level: 'customer', type: 'text', width: 6, aliases: ['省'] },
    { key: 'region', header: '区域', level: 'customer', type: 'text', width: 6, aliases: ['区域', '地区', '城市', 'region', 'area'] },
    { key: 'address', header: '详细地址', level: 'device', type: 'text', width: 21, aliases: ['地址', 'address'] },
    { key: 'phoneNumber', header: '联系电话', level: 'device', type: 'phone', width: 12, aliases: ['电话', '手机', 'phone', 'tel'] },
    { key: 'contactPerson', header: '联系人', level: 'device', type: 'text', width: 10, aliases: ['联系人', '负责人', 'contact'] },
    { key: 'installDate', header: '装机时间', level: 'device', type: 'date', width: 14, aliases: ['装机', '安装时间', '安装日期'] },
    { key: 'model', header: '型号', level: 'device', type: 'textarea', width: 11, aliases: ['型号', '机型', 'model'] },
    { key: 'quantity', header: '数量', level: 'device', type: 'int', width: 8, aliases: ['数量', '台数', 'quantity'] },
    { key: 'location', header: '安装位置', level: 'device', type: 'text', width: 8, aliases: ['位置', 'location'] },
    { key: 'filterPurchaseDate', header: '滤芯购买日期', level: 'device', type: 'date', width: 17, aliases: ['购买', '日期', 'purchase', 'date'] },
    { key: 'customInterval', header: '更换滤芯自定义间隔(天)', level: 'device', type: 'int', width: 22, aliases: ['间隔', '天数', 'interval'] },
    { key: 'notes', header: '备注', level: 'device', type: 'textarea', width: 8, aliases: ['备注', '说明', 'notes'] },
    { key: 'followUps', header: '最新跟踪记录详情', level: 'customer', type: 'followUps', width: 16, aliases: ['跟踪', '跟进'] },
    { key: 'replacementHistory', header: '历史记录详情', level: 'device', type: 'history', width: 16, multi: true, aliases: ['历史', 'history'] },
    { key: 'needWaterTest', header: '是否需要验水', level: 'device', type: 'bool', width: 14, aliases: ['验水'] },
    { key: 'longTermPartner', header: '是否长期合作', level: 'customer', type: 'bool', width: 13, aliases: ['长期合作'] },
    { key: 'hasUnpaid', header: '是否有未收款', level: 'device', type: 'bool', width: 13, aliases: ['未收款', '欠款'] },
    { key: 'unpaidInterval', header: '未收款自定义间隔(天)', level: 'device', type: 'int', width: 22, aliases: [['收款', '间隔'], ['收款', '天']] }
];
const FIELD_BY_KEY = Object.fromEntries(RECORD_FIELDS.map(field => [field.key, field]));

// 关键字匹配顺序：越具体的越靠前，避免“未收款自定义间隔(天)”被识别成滤芯更换间隔
const ALIAS_MATCH_ORDER = ['unpaidInterval', 'hasUnpaid', 'needWaterTest', 'longTermPartner', 'followUps',
    'replacementHistory', 'installDate', 'filterPurchaseDate', 'customInterval', 'contactPerson', 'phoneNumber',
    'address', 'location', 'province', 'model', 'quantity', 'notes', 'region', 'name'];

// 重复导入时用来认出“同一条装机记录”的字段
const DEVICE_KEY_FIELDS = ['address', 'location', 'installDate', 'model', 'quantity'];

const CUSTOMER_FORM_SECTIONS = [
    { title: '客户信息', keys: ['name', 'province', 'region', 'longTermPartner'] }
];
const DEVICE_FORM_SECTIONS = [
    { title: '现场联系', keys: ['contactPerson', 'phoneNumber', 'address', 'location'] },
    { title: '设备信息', keys: ['installDate', 'model', 'quantity'] },
    { title: '滤芯更换', keys: ['filterPurchaseDate', 'customInterval'] },
    { title: '验水与收款', keys: ['needWaterTest', 'hasUnpaid', 'unpaidInterval'] },
    { title: '备注', keys: ['notes'] }
];
const ADD_FORM_SECTIONS = [...CUSTOMER_FORM_SECTIONS, ...DEVICE_FORM_SECTIONS];
const FORM_PLACEHOLDERS = {
    name: '与已有客户同名时，记录会加到该客户下',
    filterPurchaseDate: '留空则按装机时间计算',
    customInterval: `留空使用默认 ${DEFAULT_REPLACEMENT_INTERVAL} 天`,
    unpaidInterval: `留空使用默认 ${DEFAULT_UNPAID_INTERVAL} 天`
};

function genId() {
    genId.last = Math.max(Date.now(), (genId.last || 0) + 1);
    return genId.last;
}

function createCustomer(fields = {}) {
    return {
        id: genId(),
        userId: currentUser ? currentUser.id : null,
        ownerName: currentUser ? currentUser.username : '',
        createdAt: new Date().toISOString(),
        name: '',
        province: '',
        region: '',
        longTermPartner: false,
        followUps: [],
        devices: [],
        ...fields
    };
}

function createDevice(fields = {}) {
    return {
        id: genId(),
        createdAt: new Date().toISOString(),
        address: '',
        contactPerson: '',
        phoneNumber: '',
        installDate: '',
        model: '',
        quantity: null,
        location: '',
        filterPurchaseDate: '',
        customInterval: null,
        notes: '',
        replacementHistory: [],
        needWaterTest: false,
        hasUnpaid: false,
        unpaidInterval: null,
        ...fields
    };
}

function normalizeCustomer(raw) {
    const customer = createCustomer(raw);
    customer.followUps = Array.isArray(raw.followUps) ? raw.followUps : [];
    customer.devices = (Array.isArray(raw.devices) ? raw.devices : []).map(device => {
        const normalized = createDevice(device);
        normalized.replacementHistory = Array.isArray(device.replacementHistory) ? device.replacementHistory : [];
        return normalized;
    });
    return customer;
}

// V3 数据：每条记录 = 一个客户。同一用户下同名记录合并为一个客户的多条装机记录
function migrateLegacyRecords(records) {
    const migrated = [];
    records.forEach(old => {
        let customer = migrated.find(c => c.name === old.name && c.userId === old.userId);
        if (!customer) {
            customer = normalizeCustomer({
                id: old.id,
                userId: old.userId,
                createdAt: old.createdAt,
                name: old.name || '',
                region: old.region || ''
            });
            migrated.push(customer);
        }
        customer.devices.push(createDevice({
            createdAt: old.createdAt || new Date().toISOString(),
            contactPerson: old.contactPerson || '',
            phoneNumber: old.phoneNumber || '',
            filterPurchaseDate: old.filterPurchaseDate || '',
            customInterval: old.customInterval || null,
            notes: old.notes || '',
            replacementHistory: Array.isArray(old.replacementHistory) ? old.replacementHistory : []
        }));
    });
    return migrated;
}

// 获取当前用户的客户
function getCurrentUserCustomers() {
    if (!currentUser) return [];

    if (currentUser.role === 'admin') {
        return customers;
    }

    return customers.filter(customer => customer.userId === currentUser.id);
}

// 展开为装机记录列表：[{ customer, device }]
function getCurrentUserDevices() {
    const entries = [];
    getCurrentUserCustomers().forEach(customer => {
        customer.devices.forEach(device => entries.push({ customer, device }));
    });
    return entries;
}

function findDevice(deviceId) {
    for (const customer of customers) {
        const device = customer.devices.find(d => d.id === deviceId);
        if (device) return { customer, device };
    }
    return null;
}

// 在当前用户自己的客户中按名称查找
function findCustomerByName(name, excludeId = null) {
    const target = (name || '').trim();
    return customers.find(c => c.userId === currentUser.id && c.name === target && c.id !== excludeId) || null;
}

// 客户负责人（创建该客户的账号）
function getOwnerName(customer) {
    if (memberNames.has(customer.userId)) return memberNames.get(customer.userId);
    const localUser = users.find(u => u.id === customer.userId);
    return localUser ? localUser.username : (customer.ownerName || '');
}

function canEditCustomer(customer) {
    return currentUser && (currentUser.role === 'admin' || customer.userId === currentUser.id);
}

function refreshAll() {
    renderReminderList();
    updateDashboard();
    updateNotifications();
}

// ==================== 通用工具 ====================
function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

// 格式化日期为YYYY-MM-DD（本地时间）
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function todayStr() {
    return formatDate(new Date());
}

// 'YYYY-MM-DD' → 本地零点的 Date
function parseLocalDate(dateStr) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

function addDays(dateStr, days) {
    const date = parseLocalDate(dateStr);
    if (!date) return '';
    date.setDate(date.getDate() + days);
    return formatDate(date);
}

// 距今天的天数，负数表示已过去
function daysUntil(dateStr) {
    const date = parseLocalDate(dateStr);
    if (!date) return null;
    return Math.round((date - parseLocalDate(todayStr())) / 86400000);
}

function latestDate(dates) {
    const valid = dates.filter(Boolean).sort();
    return valid.length ? valid[valid.length - 1] : '';
}

function buildDate(year, month, day) {
    let y = Number(year);
    if (y < 100) y += 2000; // 样板中有 "23.10.11" 这种两位年份
    const m = Number(month);
    const d = Number(day);
    const date = new Date(y, m - 1, d);
    if (y < 1980 || y > 2100 || date.getMonth() !== m - 1 || date.getDate() !== d) return '';
    return formatDate(date);
}

function excelSerialToDate(serial) {
    if (!(serial > 0) || serial > 2958465) return '';
    const date = new Date(Math.round((serial - 25569) * 86400000));
    return buildDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

// 识别各种日期写法：2011.9.9 / 2012.03.02 / 23.10.11 / 2025-01-15 / 2025/1/5 / 2025年1月5日 / 03/15/2025 / 20250115 / Excel 日期序列号
function parseFlexibleDate(value) {
    if (value === null || value === undefined || value === '') return '';
    if (value instanceof Date) return isNaN(value.getTime()) ? '' : formatDate(value);
    if (typeof value === 'number') {
        if (Number.isInteger(value) && value >= 19800101 && value <= 21001231) {
            const s = String(value);
            return buildDate(s.slice(0, 4), s.slice(4, 6), s.slice(6, 8));
        }
        return excelSerialToDate(value);
    }
    const text = String(value).trim().replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    let match = /^(\d{4}|\d{2})\s*[.\-\/年]\s*(\d{1,2})\s*[.\-\/月]\s*(\d{1,2})\s*日?(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(text);
    if (match) return buildDate(match[1], match[2], match[3]);
    match = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(text);
    if (match) {
        // 美式 月/日/年；第一段大于12时按 日/月/年
        return Number(match[1]) > 12 ? buildDate(match[3], match[2], match[1]) : buildDate(match[3], match[1], match[2]);
    }
    if (/^\d{8}$/.test(text)) return buildDate(text.slice(0, 4), text.slice(4, 6), text.slice(6, 8));
    if (/^\d{4,5}(\.\d+)?$/.test(text)) return excelSerialToDate(parseFloat(text));
    return '';
}

// 文本开头的日期，例如 "2024.3.7 电话回访，下月更换"
const LEADING_DATE_RE = /^((?:\d{4}|\d{2})[.\-\/年]\d{1,2}[.\-\/月]\d{1,2}日?)\s*[:：,，、]?\s*([\s\S]*)$/;

// 导出到表格时使用样板中的 2011.09.09 写法
function toSheetDate(dateStr) {
    return dateStr ? dateStr.replace(/-/g, '.') : '';
}

function parsePositiveInt(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = typeof value === 'number' ? value : parseFloat((String(value).match(/\d+(\.\d+)?/) || [''])[0]);
    return number > 0 ? Math.round(number) : null;
}

// 返回 true / false；空白返回 null（表示“未填写”，重复导入时不覆盖已有值）
function parseBool(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const text = String(value === null || value === undefined ? '' : value).trim().toLowerCase();
    if (!text) return null;
    return ['是', '有', '需要', '要', 'y', 'yes', 'true', '1', '√', '✓', '✔'].includes(text);
}

// Excel 中的电话常被存成数字 13800138000，统一转成文本
function normalizePhone(value) {
    if (typeof value === 'number') return String(Math.round(value));
    return String(value === null || value === undefined ? '' : value).trim().replace(/^(\d+)\.0+$/, '$1');
}

function sortByDateDesc(records) {
    return [...records].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// ==================== 提醒计算 ====================
// 最近一次换芯（或装机）日期：取装机时间、滤芯购买日期、更换记录中最晚的一个
function getLatestReplacementDate(device) {
    return latestDate([
        device.installDate,
        device.filterPurchaseDate,
        ...device.replacementHistory.map(record => record.date)
    ]);
}

function getReplacementInterval(device) {
    return device.customInterval || DEFAULT_REPLACEMENT_INTERVAL;
}

function getNextReplacementDate(device) {
    const base = getLatestReplacementDate(device);
    return base ? addDays(base, getReplacementInterval(device)) : '';
}

function getLatestFollowUp(customer) {
    return sortByDateDesc(customer.followUps)[0] || null;
}

// 未收款：从最近一次跟踪（或销售/换芯日期）起，每隔 N 天提醒催收一次；都没有时才按录入日期
function getNextUnpaidDate(customer, device) {
    if (!device.hasUnpaid) return '';
    const latestFollowUp = getLatestFollowUp(customer);
    const base = latestDate([latestFollowUp ? latestFollowUp.date : '', getLatestReplacementDate(device)]) ||
        (device.createdAt ? formatDate(new Date(device.createdAt)) : '');
    return base ? addDays(base, device.unpaidInterval || DEFAULT_UNPAID_INTERVAL) : '';
}

function describeDue(days) {
    if (days === null || days === undefined) return { level: 'none', text: '未设置日期' };
    if (days < 0) return { level: 'overdue', text: `已超期 ${-days} 天` };
    if (days === 0) return { level: 'today', text: '今日到期' };
    if (days <= 7) return { level: 'week', text: `${days} 天后到期` };
    if (days <= 30) return { level: 'month', text: `${days} 天后到期` };
    return { level: 'normal', text: `${days} 天后到期` };
}

function describeUnpaid(days) {
    if (days < 0) return `应催款（已过 ${-days} 天）`;
    if (days === 0) return '今日催款';
    return `${days} 天后催款`;
}

function isEntryDue(customer, device) {
    const next = getNextReplacementDate(device);
    if (next && daysUntil(next) <= 0) return true;
    const unpaid = getNextUnpaidDate(customer, device);
    return Boolean(unpaid) && daysUntil(unpaid) <= 0;
}

// 计算平均更换间隔
function calculateAverageInterval(device) {
    const dates = device.replacementHistory.map(record => record.date).filter(Boolean).sort();
    let totalDays = 0;
    let intervals = 0;

    for (let i = 1; i < dates.length; i++) {
        const daysDiff = Math.round((parseLocalDate(dates[i]) - parseLocalDate(dates[i - 1])) / 86400000);
        if (daysDiff > 0) {
            totalDays += daysDiff;
            intervals++;
        }
    }

    return intervals > 0 ? Math.round(totalDays / intervals) : null;
}

// ==================== 表单 ====================
function renderFormField(field, prefix) {
    const id = `${prefix}_${field.key}`;
    const placeholder = FORM_PLACEHOLDERS[field.key] ? ` placeholder="${escapeHtml(FORM_PLACEHOLDERS[field.key])}"` : '';
    const isRequired = field.key === 'name';
    const label = `${escapeHtml(field.header)}${isRequired ? ' <span class="required-mark">*</span>' : ''}`;

    switch (field.type) {
        case 'bool':
            return `<div class="form-group checkbox-group"><label><input type="checkbox" id="${id}"> ${escapeHtml(field.header)}</label></div>`;
        case 'date':
            return `<div class="form-group"><label for="${id}">${label}</label><input type="date" id="${id}"></div>`;
        case 'int':
            return `<div class="form-group"><label for="${id}">${label}</label><input type="number" id="${id}" min="1" step="1"${placeholder}></div>`;
        case 'phone':
            return `<div class="form-group"><label for="${id}">${label}</label><input type="tel" id="${id}"${placeholder}></div>`;
        case 'textarea':
            return `<div class="form-group${field.key === 'notes' ? ' full-width' : ''}"><label for="${id}">${label}</label><textarea id="${id}" rows="2"></textarea></div>`;
        default: {
            const list = prefix === 'add' && field.key === 'name' ? ' list="customerNameOptions" autocomplete="off"' : '';
            return `<div class="form-group"><label for="${id}">${label}</label><input type="text" id="${id}"${placeholder}${list}${isRequired ? ' required' : ''}></div>`;
        }
    }
}

function renderForm(container, prefix, sections) {
    container.innerHTML = sections.map(section => `
        <fieldset class="form-section">
            <legend>${escapeHtml(section.title)}</legend>
            <div class="form-grid">
                ${section.keys.map(key => renderFormField(FIELD_BY_KEY[key], prefix)).join('')}
            </div>
        </fieldset>
    `).join('');
}

function fillForm(prefix, sections, values) {
    sections.forEach(section => section.keys.forEach(key => {
        const element = document.getElementById(`${prefix}_${key}`);
        if (!element) return;
        const value = values[key];
        if (FIELD_BY_KEY[key].type === 'bool') {
            element.checked = Boolean(value);
        } else {
            element.value = value === null || value === undefined ? '' : value;
        }
    }));
}

// 返回 { data } 或 { error }
function readForm(prefix, sections) {
    const data = {};
    for (const section of sections) {
        for (const key of section.keys) {
            const field = FIELD_BY_KEY[key];
            const element = document.getElementById(`${prefix}_${key}`);
            if (!element) continue;

            if (field.type === 'bool') {
                data[key] = element.checked;
            } else if (field.type === 'int') {
                const text = element.value.trim();
                if (!text) {
                    data[key] = null;
                } else {
                    const number = Number(text);
                    if (!Number.isInteger(number) || number <= 0) {
                        return { error: `「${field.header}」请输入正整数` };
                    }
                    data[key] = number;
                }
            } else {
                data[key] = element.value.trim();
            }
        }
    }
    if ('name' in data && !data.name) {
        return { error: '请填写客户名称' };
    }
    return { data };
}

function splitByLevel(data) {
    const customerData = {};
    const deviceData = {};
    Object.keys(data).forEach(key => {
        (FIELD_BY_KEY[key].level === 'customer' ? customerData : deviceData)[key] = data[key];
    });
    return { customerData, deviceData };
}

function resetAddForm() {
    fillForm('add', ADD_FORM_SECTIONS, { installDate: todayStr() });
    const hint = document.getElementById('addCustomerHint');
    if (hint) hint.textContent = '';
}

// 输入已有客户名称时，自动带出客户信息
function handleAddNameChange() {
    const hint = document.getElementById('addCustomerHint');
    const existing = findCustomerByName(document.getElementById('add_name').value);
    if (!existing) {
        if (hint) hint.textContent = '';
        return;
    }
    const province = document.getElementById('add_province');
    const region = document.getElementById('add_region');
    const partner = document.getElementById('add_longTermPartner');
    if (province && !province.value) province.value = existing.province || '';
    if (region && !region.value) region.value = existing.region || '';
    if (partner) partner.checked = Boolean(existing.longTermPartner);
    if (hint) hint.textContent = `将添加到现有客户「${existing.name}」（已有 ${existing.devices.length} 条装机记录）`;
}

function updateCustomerNameOptions() {
    const datalist = document.getElementById('customerNameOptions');
    if (!datalist || !currentUser) return;
    const names = [...new Set(customers.filter(c => c.userId === currentUser.id).map(c => c.name))].sort((a, b) => a.localeCompare(b, 'zh'));
    datalist.innerHTML = names.map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
}

// 添加客户 / 装机记录
function addCustomer() {
    const result = readForm('add', ADD_FORM_SECTIONS);
    if (result.error) {
        alert(result.error);
        return;
    }

    const { customerData, deviceData } = splitByLevel(result.data);
    let customer = findCustomerByName(customerData.name);
    const isExisting = Boolean(customer);

    if (customer) {
        if (customerData.province) customer.province = customerData.province;
        if (customerData.region) customer.region = customerData.region;
        customer.longTermPartner = customerData.longTermPartner;
    } else {
        customer = createCustomer(customerData);
        customers.push(customer);
    }
    customer.devices.push(createDevice(deviceData));

    saveCustomersToStorage();
    refreshAll();
    resetAddForm();

    alert(isExisting
        ? `已添加到现有客户「${customer.name}」，该客户共 ${customer.devices.length} 条装机记录`
        : `已添加新客户「${customer.name}」`);
}

// ==================== 导入 ====================
function setImportStatus(message, type) {
    importStatus.textContent = message;
    importStatus.style.color = { error: '#e74c3c', success: '#27ae60', info: '#3498db' }[type] || '';
}

// 支持 CSV / Excel(.xlsx/.xls)，兼容 Windows WPS
function importData() {
    if (!csvFile.files.length) {
        setImportStatus('请选择文件', 'error');
        return;
    }

    const file = csvFile.files[0];
    const fileName = file.name.toLowerCase();
    const isCsv = fileName.endsWith('.csv') || fileName.endsWith('.txt');
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (!isCsv && !isExcel) {
        setImportStatus('不支持的文件格式，请选择 CSV 或 Excel 文件', 'error');
        return;
    }
    if (file.size === 0) {
        setImportStatus('文件为空，请检查文件内容', 'error');
        return;
    }

    setImportStatus('正在处理文件，请稍候...', 'info');

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const rows = isCsv ? parseDelimitedText(decodeText(e.target.result)) : readWorkbookRows(e.target.result);
            processImportRows(rows);
        } catch (error) {
            console.error('导入解析错误:', error);
            setImportStatus(`文件解析失败: ${error.message}`, 'error');
        }
    };
    reader.onerror = () => setImportStatus('文件读取失败，请检查文件是否损坏', 'error');
    reader.readAsArrayBuffer(file);
}

// 先按 UTF-8 解码，失败时按 GBK(GB18030) 解码（WPS / 旧版 Excel 另存的 CSV）
function decodeText(buffer) {
    let text;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch (e) {
        text = new TextDecoder('gb18030').decode(buffer);
    }
    return text.replace(/^﻿/, '');
}

// CSV 解析：支持引号内的逗号、换行和转义引号，自动识别逗号 / 分号 / 制表符
function parseDelimitedText(text) {
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const delimiter = [',', '\t', ';'].reduce((best, candidate) =>
        firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best, ',');

    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                field += ch;
            }
        } else if (ch === '"' && field === '') {
            inQuotes = true;
        } else if (ch === delimiter) {
            row.push(field);
            field = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += ch;
        }
    }
    if (field !== '' || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

function readWorkbookRows(buffer) {
    if (typeof XLSX === 'undefined') {
        throw new Error('Excel 解析组件未加载（需要联网），请联网后重试或改用 CSV 文件');
    }
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const sheetName = workbook.SheetNames.find(name => workbook.Sheets[name]['!ref']);
    if (!sheetName) throw new Error('Excel 文件中没有数据');

    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet['!ref']);
    // raw: 保留数字原值（电话、数量、日期序列号），由各列按类型解析
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '', blankrows: true });

    // 合并单元格：把左上角的值填充到整个合并区域（例如多行共用一个客户名称）
    (sheet['!merges'] || []).forEach(merge => {
        const topLeft = rows[merge.s.r - range.s.r];
        const value = topLeft ? topLeft[merge.s.c - range.s.c] : '';
        for (let r = merge.s.r; r <= merge.e.r; r++) {
            const rowIndex = r - range.s.r;
            if (!rows[rowIndex]) rows[rowIndex] = [];
            for (let c = merge.s.c; c <= merge.e.c; c++) {
                rows[rowIndex][c - range.s.c] = value;
            }
        }
    });
    return rows;
}

function normalizeHeader(header) {
    return String(header === null || header === undefined ? '' : header)
        .replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')').toLowerCase();
}

// 表头 → 字段映射：{ 字段key: [列序号...] }
function detectColumnMapping(headers) {
    const normalized = headers.map(normalizeHeader);
    const mapping = {};
    const usedColumns = new Set();
    const assign = (key, index) => {
        (mapping[key] = mapping[key] || []).push(index);
        usedColumns.add(index);
    };

    // 第一轮：与样板表头完全一致
    RECORD_FIELDS.forEach(field => {
        const target = normalizeHeader(field.header);
        normalized.forEach((header, index) => {
            if (!usedColumns.has(index) && header === target && (field.multi || !mapping[field.key])) assign(field.key, index);
        });
    });

    // 第二轮：关键字匹配，兼容旧格式和手工整理的表格
    ALIAS_MATCH_ORDER.forEach(key => {
        const field = FIELD_BY_KEY[key];
        normalized.forEach((header, index) => {
            if (!header || usedColumns.has(index) || (mapping[key] && !field.multi)) return;
            const matched = field.aliases.some(alias =>
                Array.isArray(alias) ? alias.every(part => header.includes(part)) : header.includes(alias));
            if (matched) assign(key, index);
        });
    });

    // 旧格式“自定义间隔(月)”按每月 30 天换算
    const intervalHeader = mapping.customInterval ? normalized[mapping.customInterval[0]] : '';
    mapping.intervalInMonths = intervalHeader.includes('月') && !intervalHeader.includes('天');
    return mapping;
}

function isRowEmpty(row) {
    return !row || row.every(cell => String(cell === null || cell === undefined ? '' : cell).trim() === '');
}

function makeFollowUp(date, content) {
    return {
        id: genId(),
        date,
        content,
        operator: currentUser.username,
        timestamp: new Date().toISOString()
    };
}

function makeReplacementRecord({ date = '', filterModel = '', quantity = 1, cost = 0, operator = '', notes = '' }) {
    return {
        id: genId(),
        date,
        filterModel,
        quantity: parsePositiveInt(quantity) || 1,
        cost: parseFloat(cost) || 0,
        operator: operator || currentUser.username,
        notes,
        timestamp: new Date().toISOString()
    };
}

// “最新跟踪记录详情”：每行一条，行首可带日期
function parseFollowUpsCell(text) {
    return String(text).split(/\r?\n|[;；]/).map(line => line.trim()).filter(Boolean).map(line => {
        const match = LEADING_DATE_RE.exec(line);
        const date = match ? parseFlexibleDate(match[1]) : '';
        return makeFollowUp(date, date ? match[2].trim() : line);
    });
}

// 解析单条历史记录：日期|型号|数量|费用|操作人|备注，兼容旧的逗号格式和手写的“日期 + 说明”
function parseHistoryEntry(entry) {
    const text = entry.trim();
    if (!text || text === '无历史记录' || text === '无') return null;

    if (text.includes('|')) {
        const f = text.split('|').map(s => s.trim());
        return makeReplacementRecord({ date: parseFlexibleDate(f[0]), filterModel: f[1], quantity: f[2], cost: f[3], operator: f[4], notes: f.slice(5).join('|') });
    }

    const commaFields = text.split(/[,，]/).map(s => s.trim());
    if (commaFields.length > 1 && parseFlexibleDate(commaFields[0])) {
        // 旧格式：日期,型号,数量,费用,备注,操作人
        return makeReplacementRecord({ date: parseFlexibleDate(commaFields[0]), filterModel: commaFields[1], quantity: commaFields[2], cost: commaFields[3], notes: commaFields[4], operator: commaFields[5] });
    }

    const match = LEADING_DATE_RE.exec(text);
    if (match && parseFlexibleDate(match[1])) {
        return makeReplacementRecord({ date: parseFlexibleDate(match[1]), notes: match[2].trim() });
    }

    // 没有日期的文字也保留下来，避免丢数据
    return makeReplacementRecord({ notes: text });
}

function parseHistoryCell(text) {
    return String(text).split(/\r?\n|[;；]/).map(parseHistoryEntry).filter(Boolean);
}

// 把一行数据解析为客户字段 + 装机记录字段（只包含表格里填写了的值）
function parseImportRow(row, mapping, stats, rowNumber) {
    const parsed = { customer: {}, device: {}, followUps: [], history: [] };

    RECORD_FIELDS.forEach(field => {
        (mapping[field.key] || []).forEach(column => {
            const raw = row[column];
            const text = raw === null || raw === undefined ? '' : String(raw).trim();
            const target = field.level === 'customer' ? parsed.customer : parsed.device;

            switch (field.type) {
                case 'date': {
                    if (!text) break;
                    const date = parseFlexibleDate(raw);
                    if (date) target[field.key] = date;
                    else stats.badDates.push(`第${rowNumber}行「${field.header}」${text}`);
                    break;
                }
                case 'int': {
                    const number = parsePositiveInt(raw);
                    if (number !== null) {
                        target[field.key] = field.key === 'customInterval' && mapping.intervalInMonths ? number * 30 : number;
                    }
                    break;
                }
                case 'bool': {
                    const bool = parseBool(raw);
                    if (bool !== null) target[field.key] = bool;
                    break;
                }
                case 'phone':
                    if (text) target[field.key] = normalizePhone(raw);
                    break;
                case 'followUps':
                    if (text) parsed.followUps.push(...parseFollowUpsCell(text));
                    break;
                case 'history':
                    if (text) parsed.history.push(...parseHistoryCell(text));
                    break;
                default:
                    if (text) target[field.key] = text;
            }
        });
    });
    return parsed;
}

function deviceKey(device, keyFields) {
    return keyFields.map(key => String(device[key] === null || device[key] === undefined ? '' : device[key]).trim()).join('|');
}

// 合并记录列表，按 keyFn 去重；返回新增条数
function mergeUnique(target, incoming, keyFn) {
    const existingKeys = new Set(target.map(keyFn));
    let added = 0;
    incoming.forEach(item => {
        const key = keyFn(item);
        if (!existingKeys.has(key)) {
            target.push(item);
            existingKeys.add(key);
            added++;
        }
    });
    return added;
}

const followUpKey = item => `${item.date}|${item.content}`;
const historyKey = item => `${item.date}|${item.filterModel}|${item.quantity}|${item.notes}`;

function processImportRows(rows) {
    // 表头：前 10 行中能识别出“客户名称”列、且识别出的列最多的一行
    // （表格上方常有“XX客户台账”之类的标题行，不能只看是否含“客户”二字）
    let headerIndex = -1;
    let mapping = null;
    let bestScore = 0;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
        if (isRowEmpty(rows[i])) continue;
        const candidate = detectColumnMapping(rows[i]);
        const score = RECORD_FIELDS.filter(field => candidate[field.key]).length;
        if (candidate.name && score > bestScore) {
            headerIndex = i;
            mapping = candidate;
            bestScore = score;
        }
    }
    if (!mapping) {
        setImportStatus('未找到“客户名称”列，请检查表头是否与导入模板一致', 'error');
        return;
    }

    const stats = { newCustomers: 0, newDevices: 0, updatedDevices: 0, skipped: 0, history: 0, followUps: 0, badDates: [] };
    const customerByName = new Map(customers.filter(c => c.userId === currentUser.id).map(c => [c.name, c]));
    const keyFields = DEVICE_KEY_FIELDS.filter(key => mapping[key]);
    const unmatchedDevices = new Map(); // 客户ID → 导入前已有、尚未匹配的装机记录
    const partnerConfirmed = new Set();

    for (let i = headerIndex + 1; i < rows.length; i++) {
        if (isRowEmpty(rows[i])) continue;
        const parsed = parseImportRow(rows[i], mapping, stats, i + 1);
        const name = parsed.customer.name;
        if (!name) {
            stats.skipped++;
            continue;
        }

        let customer = customerByName.get(name);
        if (!customer) {
            customer = createCustomer({ name });
            customers.push(customer);
            customerByName.set(name, customer);
            stats.newCustomers++;
        }
        if (!unmatchedDevices.has(customer.id)) unmatchedDevices.set(customer.id, [...customer.devices]);

        // 客户级字段
        if (parsed.customer.province) customer.province = parsed.customer.province;
        if (parsed.customer.region) customer.region = parsed.customer.region;
        if (parsed.customer.longTermPartner === true) {
            customer.longTermPartner = true;
            partnerConfirmed.add(customer.id);
        } else if (parsed.customer.longTermPartner === false && !partnerConfirmed.has(customer.id)) {
            customer.longTermPartner = false;
        }
        stats.followUps += mergeUnique(customer.followUps, parsed.followUps, followUpKey);

        // 装机记录：与导入前已有的记录匹配则更新，否则新增（同一文件中的相同行视为不同记录）
        const pool = unmatchedDevices.get(customer.id);
        const key = deviceKey(parsed.device, keyFields);
        const matchIndex = keyFields.length ? pool.findIndex(device => deviceKey(device, keyFields) === key) : -1;
        if (matchIndex >= 0) {
            const device = pool.splice(matchIndex, 1)[0];
            Object.assign(device, parsed.device);
            stats.history += mergeUnique(device.replacementHistory, parsed.history, historyKey);
            stats.updatedDevices++;
        } else {
            customer.devices.push(createDevice({ ...parsed.device, replacementHistory: parsed.history }));
            stats.history += parsed.history.length;
            stats.newDevices++;
        }
    }

    saveCustomersToStorage();
    refreshAll();

    const parts = [`新增客户 ${stats.newCustomers} 个`, `新增装机记录 ${stats.newDevices} 条`];
    if (stats.updatedDevices) parts.push(`更新已有记录 ${stats.updatedDevices} 条`);
    if (stats.history) parts.push(`更换记录 ${stats.history} 条`);
    if (stats.followUps) parts.push(`跟踪记录 ${stats.followUps} 条`);
    if (stats.skipped) parts.push(`跳过无客户名称的行 ${stats.skipped} 行`);
    let message = `导入完成：${parts.join('，')}`;
    if (stats.badDates.length) {
        message += `。以下 ${stats.badDates.length} 个日期无法识别，已留空：${stats.badDates.slice(0, 3).join('；')}${stats.badDates.length > 3 ? ' 等' : ''}`;
    }
    setImportStatus(message, stats.newDevices + stats.updatedDevices > 0 ? 'success' : 'error');
    csvFile.value = '';
}

// ==================== 导出 ====================
function csvCell(value) {
    const text = String(value === null || value === undefined ? '' : value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// 导出二维表：优先 .xlsx（Excel 组件未加载时自动改为 CSV）
function downloadTable(rows, fileBaseName, { widths = null, format = 'xlsx' } = {}) {
    if (format === 'xlsx' && typeof XLSX !== 'undefined') {
        const sheet = XLSX.utils.aoa_to_sheet(rows);
        if (widths) sheet['!cols'] = widths.map(wch => ({ wch }));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
        XLSX.writeFile(workbook, `${fileBaseName}.xlsx`);
        return;
    }
    const csv = '﻿' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${fileBaseName}.csv`);
}

// 格式化历史记录用于导出：每行一条，日期|型号|数量|费用|操作人|备注
function formatHistoryForExport(history) {
    return sortByDateDesc(history).map(record =>
        `${record.date || ''}|${record.filterModel || ''}|${record.quantity || 1}|${record.cost || 0}|${record.operator || ''}|${record.notes || ''}`
    ).join('\n');
}

// 跟踪记录：最新的在最上面，每行“日期 内容”
function formatFollowUpsForExport(followUps) {
    return sortByDateDesc(followUps).map(item => `${toSheetDate(item.date)} ${item.content}`.trim()).join('\n');
}

function deviceToSheetRow(customer, device) {
    return RECORD_FIELDS.map(field => {
        const value = (field.level === 'customer' ? customer : device)[field.key];
        switch (field.type) {
            case 'date': return toSheetDate(value);
            case 'int': return value || '';
            case 'bool': return value ? '是' : '否';
            case 'followUps': return formatFollowUpsForExport(value);
            case 'history': return formatHistoryForExport(value);
            default: return value === null || value === undefined ? '' : String(value);
        }
    });
}

// 导出客户数据：列与《格式样板》一致，可直接重新导入
// entries 为空时导出全部；传入 [{ customer, device }] 时只导出这些记录
function exportRecords(format = 'xlsx', entries = null, { fileBaseName = `滤芯客户数据_${todayStr()}`, silent = false } = {}) {
    const list = entries || getCurrentUserCustomers().flatMap(customer =>
        (customer.devices.length ? customer.devices : [createDevice()]).map(device => ({ customer, device })));
    if (list.length === 0) {
        alert('没有客户数据可导出');
        return;
    }

    const rows = [RECORD_FIELDS.map(field => field.header), ...list.map(({ customer, device }) => deviceToSheetRow(customer, device))];
    downloadTable(rows, fileBaseName, { widths: RECORD_FIELDS.map(field => field.width), format });
    if (!silent) {
        const customerCount = new Set(list.map(entry => entry.customer.id)).size;
        alert(`导出完成！共 ${customerCount} 个客户、${list.length} 条装机记录，可直接重新导入`);
    }
}

// 下载导入模板（示例数据均为虚构）
function downloadTemplate(e) {
    if (e) e.preventDefault();
    const sampleCustomerA = { name: '示例科技有限公司', province: '广东', region: '深圳', longTermPartner: true,
        followUps: [makeFollowUp('2025-09-20', '电话回访，下月安排换芯')] };
    const sampleCustomerB = { name: '示例新能源（宿舍）', province: '广东', region: '惠州', longTermPartner: false, followUps: [] };
    const rows = [
        RECORD_FIELDS.map(field => field.header),
        deviceToSheetRow(sampleCustomerA, createDevice({ address: '南山区科技园1号A栋3楼', phoneNumber: '13800138000', contactPerson: '张经理（行政）',
            installDate: '2023-03-22', model: 'CY-2H', quantity: 2, location: '3楼茶水间', filterPurchaseDate: '2025-06-01', customInterval: 120,
            replacementHistory: [makeReplacementRecord({ date: '2025-06-01', filterModel: 'CY-2H 滤芯', quantity: 2, cost: 300, notes: '定期更换' })] })),
        deviceToSheetRow(sampleCustomerA, createDevice({ address: '南山区科技园1号B栋', phoneNumber: '13900139000', contactPerson: '李工',
            installDate: '2024-01-03', model: 'CY-3BJ', quantity: 1, location: 'B栋大厅', needWaterTest: true, hasUnpaid: true, unpaidInterval: 15 })),
        deviceToSheetRow(sampleCustomerB, createDevice({ address: '潼湖', installDate: '2025-09-29', model: 'CY-2H', quantity: 3, location: '新租宿舍',
            notes: '联系人待补充' }))
    ];
    downloadTable(rows, '客户数据导入模板', { widths: RECORD_FIELDS.map(field => field.width) });
}

// 导出滤芯更换记录明细（每条更换记录一行）
function exportDetailedHistory() {
    const rows = [['客户名称', '区域', '详细地址', '安装位置', '型号', '更换日期', '滤芯型号', '数量', '费用(元)', '操作人', '备注', '记录时间']];
    getCurrentUserDevices().forEach(({ customer, device }) => {
        sortByDateDesc(device.replacementHistory).forEach(record => {
            rows.push([customer.name, customer.region, device.address, device.location, device.model,
                toSheetDate(record.date), record.filterModel || '', record.quantity || 1, record.cost || 0,
                record.operator || '', record.notes || '', record.timestamp ? new Date(record.timestamp).toLocaleString() : '']);
        });
    });

    if (rows.length === 1) {
        alert('没有更换记录可导出');
        return;
    }
    downloadTable(rows, `滤芯更换记录明细_${todayStr()}`, { widths: [27, 8, 21, 10, 12, 12, 14, 6, 9, 10, 20, 20] });
    alert(`导出完成！共 ${rows.length - 1} 条更换记录`);
}

// ==================== 列表 ====================
function getAllRegions() {
    const regions = new Set();
    getCurrentUserCustomers().forEach(customer => {
        if (customer.region && customer.region.trim()) {
            regions.add(customer.region.trim());
        }
    });
    return Array.from(regions).sort((a, b) => a.localeCompare(b, 'zh'));
}

// 更新区域筛选选项（保留仍然存在的已选区域）
function updateRegionFilter() {
    if (!regionFilter) return;
    setMultiSelectOptions(regionFilter, getAllRegions().map(region => ({ value: region, label: region })));
}

// ==================== 多选筛选下拉框 ====================
// 同一筛选内多个选项为“或”，不同筛选之间为“且”；不选任何项表示全部
const STATUS_FILTER_OPTIONS = [
    { value: 'unpaid', label: '有未收款' },
    { value: 'waterTest', label: '需要验水' },
    { value: 'partner', label: '长期合作客户' }
];

function matchesStatus(status, customer, device) {
    if (status === 'unpaid') return device.hasUnpaid;
    if (status === 'waterTest') return device.needWaterTest;
    if (status === 'partner') return customer.longTermPartner;
    return false;
}

function initMultiSelect(container, options, onChange) {
    container.innerHTML = '<button type="button" class="multi-select-toggle"></button><div class="multi-select-panel"></div>';
    container._selected = new Set();
    container._options = [];
    container._onChange = onChange;

    container.querySelector('.multi-select-toggle').addEventListener('click', () => {
        const willOpen = !container.classList.contains('open');
        document.querySelectorAll('.multi-select.open').forEach(el => el.classList.remove('open'));
        container.classList.toggle('open', willOpen);
    });

    const panel = container.querySelector('.multi-select-panel');
    panel.addEventListener('change', (e) => {
        if (!e.target.matches('input[type="checkbox"]')) return;
        if (e.target.checked) container._selected.add(e.target.value);
        else container._selected.delete(e.target.value);
        updateMultiSelectLabel(container);
        container._onChange();
    });
    panel.addEventListener('click', (e) => {
        if (e.target.matches('.multi-select-clear')) {
            clearMultiSelect(container);
            container._onChange();
        }
    });

    if (!initMultiSelect.outsideListenerBound) {
        document.addEventListener('click', (e) => {
            document.querySelectorAll('.multi-select.open').forEach(el => {
                if (!el.contains(e.target)) el.classList.remove('open');
            });
        });
        initMultiSelect.outsideListenerBound = true;
    }

    setMultiSelectOptions(container, options);
}

function setMultiSelectOptions(container, options) {
    if (!container._selected) return;
    const signature = options.map(option => option.value).join('\n');
    if (container._signature === signature) return; // 选项没变时不重绘，避免打断正在进行的勾选
    container._signature = signature;
    container._options = options;

    // 去掉已不存在的选项
    const values = new Set(options.map(option => option.value));
    container._selected.forEach(value => { if (!values.has(value)) container._selected.delete(value); });

    const panel = container.querySelector('.multi-select-panel');
    panel.innerHTML = `
        <button type="button" class="multi-select-clear">清除选择</button>
        ${options.length ? options.map(option => `
            <label class="multi-select-option">
                <input type="checkbox" value="${escapeHtml(option.value)}"${container._selected.has(option.value) ? ' checked' : ''}>
                ${escapeHtml(option.label)}
            </label>`).join('') : '<div class="multi-select-empty">暂无选项</div>'}
    `;
    updateMultiSelectLabel(container);
}

function updateMultiSelectLabel(container) {
    const labels = container._options.filter(option => container._selected.has(option.value)).map(option => option.label);
    const toggle = container.querySelector('.multi-select-toggle');
    toggle.textContent = labels.length === 0 ? container.dataset.allLabel
        : labels.length <= 2 ? labels.join('、') : `已选 ${labels.length} 项`;
    toggle.title = labels.join('、');
    container.classList.toggle('has-selection', labels.length > 0);
}

function getMultiSelectValues(container) {
    return container && container._selected ? [...container._selected] : [];
}

function clearMultiSelect(container) {
    if (!container || !container._selected) return;
    container._selected.clear();
    container.querySelectorAll('.multi-select-panel input[type="checkbox"]').forEach(input => { input.checked = false; });
    updateMultiSelectLabel(container);
}

// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 创建防抖版本的渲染函数
const debouncedRenderReminderList = debounce(renderReminderList, 300);

function matchesSearch(customer, device, term) {
    if (!term) return true;
    const haystack = [customer.name, customer.province, customer.region, device.contactPerson, device.phoneNumber,
        device.address, device.location, device.model, device.notes].join('\n').toLowerCase();
    return haystack.includes(term);
}

// 渲染装机记录列表
function renderReminderList() {
    if (!reminderList) return;

    updateRegionFilter();
    updateCustomerNameOptions();

    const term = customerSearch ? customerSearch.value.trim().toLowerCase() : '';
    const selectedRegions = getMultiSelectValues(regionFilter);
    const selectedStatuses = getMultiSelectValues(statusFilter);
    const selectedMonths = getMultiSelectValues(followupMonthFilter);
    const showAll = showAllCheckbox ? showAllCheckbox.checked : false;
    const selectedSortOrder = sortOrder ? sortOrder.value : 'desc';

    const allEntries = getCurrentUserDevices();
    const entries = allEntries.filter(({ customer, device }) => {
        if (!matchesSearch(customer, device, term)) return false;
        if (selectedRegions.length && !selectedRegions.includes(customer.region)) return false;
        if (selectedStatuses.length && !selectedStatuses.some(status => matchesStatus(status, customer, device))) return false;
        if (selectedMonths.length) {
            // 按照建议更换时间的月份来筛选
            const next = parseLocalDate(getNextReplacementDate(device));
            if (!next || !selectedMonths.includes(String(next.getMonth() + 1))) return false;
        }
        // 默认只显示需要处理的记录：滤芯已到期或到了催款时间
        return showAll || isEntryDue(customer, device);
    });

    entries.sort((a, b) => {
        if (selectedSortOrder === 'name') {
            return a.customer.name.localeCompare(b.customer.name, 'zh') ||
                (a.device.installDate || '').localeCompare(b.device.installDate || '');
        }
        const dateA = getNextReplacementDate(a.device);
        const dateB = getNextReplacementDate(b.device);
        if (!dateA || !dateB) return dateA ? -1 : dateB ? 1 : 0; // 没有日期的排最后
        return selectedSortOrder === 'asc' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    });

    if (recordCount) {
        recordCount.textContent = `显示 ${entries.length} 条装机记录（共 ${getCurrentUserCustomers().length} 个客户、${allEntries.length} 条记录）`;
    }

    reminderList.innerHTML = entries.length
        ? entries.map(renderDeviceCard).join('')
        : `<p class="empty-list">${showAll ? '暂无符合条件的记录' : '暂无需要处理的记录，勾选“显示所有记录”查看全部'}</p>`;

    visibleDeviceIds = entries.map(entry => entry.device.id);
    updateBatchBar();
}

// ==================== 批量选择 / 导出 / 删除 ====================
const selectedDeviceIds = new Set();
let visibleDeviceIds = []; // 当前列表中显示的记录（受搜索和筛选影响）

function getSelectedEntries() {
    return getCurrentUserDevices().filter(entry => selectedDeviceIds.has(entry.device.id));
}

function updateBatchBar() {
    const summary = document.getElementById('batchSummary');
    if (!summary) return;

    // 去掉已经不存在的记录
    const existing = new Set(getCurrentUserDevices().map(entry => entry.device.id));
    selectedDeviceIds.forEach(id => { if (!existing.has(id)) selectedDeviceIds.delete(id); });

    const selected = getSelectedEntries();
    const customerCount = new Set(selected.map(entry => entry.customer.id)).size;
    const visibleSet = new Set(visibleDeviceIds);
    const hiddenCount = selected.filter(entry => !visibleSet.has(entry.device.id)).length;

    summary.innerHTML = selected.length
        ? `已选 <strong>${selected.length}</strong> 条装机记录（${customerCount} 个客户）` +
          (hiddenCount ? `<span class="batch-hidden-warning">，其中 ${hiddenCount} 条不在当前列表中</span>` : '')
        : '未选择记录';
    ['batchExportBtn', 'batchClearBtn', 'batchDeleteBtn'].forEach(id => {
        const button = document.getElementById(id);
        if (button) button.disabled = selected.length === 0;
    });

    const selectAll = document.getElementById('selectAllVisible');
    const visibleSelected = visibleDeviceIds.filter(id => selectedDeviceIds.has(id)).length;
    selectAll.disabled = visibleDeviceIds.length === 0;
    selectAll.checked = visibleDeviceIds.length > 0 && visibleSelected === visibleDeviceIds.length;
    selectAll.indeterminate = visibleSelected > 0 && !selectAll.checked;

    document.querySelectorAll('.record-select').forEach(box => {
        box.checked = selectedDeviceIds.has(Number(box.dataset.deviceId));
        box.closest('.customer-item').classList.toggle('selected', box.checked);
    });
}

function bindBatchEvents() {
    reminderList.addEventListener('change', (e) => {
        if (!e.target.matches('.record-select')) return;
        const id = Number(e.target.dataset.deviceId);
        if (e.target.checked) selectedDeviceIds.add(id);
        else selectedDeviceIds.delete(id);
        updateBatchBar();
    });

    document.getElementById('selectAllVisible').addEventListener('change', (e) => {
        visibleDeviceIds.forEach(id => (e.target.checked ? selectedDeviceIds.add(id) : selectedDeviceIds.delete(id)));
        updateBatchBar();
    });
    document.getElementById('batchClearBtn').addEventListener('click', () => {
        selectedDeviceIds.clear();
        updateBatchBar();
    });
    document.getElementById('batchExportBtn').addEventListener('click', () => {
        exportRecords('xlsx', getSelectedEntries(), { fileBaseName: `所选客户数据_${todayStr()}` });
    });
    document.getElementById('batchDeleteBtn').addEventListener('click', showBatchDeleteModal);

    const confirmInput = document.getElementById('batchDeleteConfirmInput');
    confirmInput.addEventListener('input', () => {
        document.getElementById('batchDeleteConfirmBtn').disabled = confirmInput.value.trim() !== '删除';
    });
    document.getElementById('batchDeleteConfirmBtn').addEventListener('click', confirmBatchDelete);
    document.getElementById('batchDeleteCancelBtn').addEventListener('click', closeBatchDeleteModal);
    document.querySelector('.close-batch-delete').addEventListener('click', closeBatchDeleteModal);
}

// 删除确认：列出将要删除的内容，必须手动输入“删除”才能确认；默认先导出备份。点击弹窗外部不会关闭
function showBatchDeleteModal() {
    const selected = getSelectedEntries().filter(entry => canEditCustomer(entry.customer));
    if (!selected.length) return;

    const byCustomer = new Map();
    selected.forEach(({ customer }) => byCustomer.set(customer, (byCustomer.get(customer) || 0) + 1));
    const wholeCustomers = [...byCustomer].filter(([customer, count]) => count === customer.devices.length);
    const othersCount = selected.filter(entry => entry.customer.userId !== currentUser.id).length;
    const visibleSet = new Set(visibleDeviceIds);
    const hiddenCount = selected.filter(entry => !visibleSet.has(entry.device.id)).length;

    const list = [...byCustomer].slice(0, 10).map(([customer, count]) =>
        `<li>${escapeHtml(customer.name)}：${count} 条${count === customer.devices.length ? '<span class="danger-text">（全部记录，客户将被删除）</span>' : ''}</li>`).join('');

    document.getElementById('batchDeleteSummary').innerHTML = `
        <p>将删除 <strong class="danger-text">${selected.length}</strong> 条装机记录，涉及 ${byCustomer.size} 个客户。
           ${wholeCustomers.length ? `其中 <strong class="danger-text">${wholeCustomers.length}</strong> 个客户的全部记录都被选中，这些客户及其跟踪记录会一并删除。` : ''}</p>
        ${othersCount ? `<p class="danger-text">⚠️ 其中 ${othersCount} 条属于其他同事负责的客户。</p>` : ''}
        ${hiddenCount ? `<p class="danger-text">⚠️ 其中 ${hiddenCount} 条不在当前列表中（被搜索或筛选隐藏了），也会被删除。</p>` : ''}
        <ul class="batch-delete-list">${list}${byCustomer.size > 10 ? `<li>……还有 ${byCustomer.size - 10} 个客户</li>` : ''}</ul>
        <p class="muted">删除后无法撤销${IS_CLOUD_MODE ? '，云端数据会同步删除' : ''}。</p>
    `;
    document.getElementById('batchDeleteBackup').checked = true;
    document.getElementById('batchDeleteConfirmInput').value = '';
    document.getElementById('batchDeleteConfirmBtn').disabled = true;
    document.getElementById('batchDeleteModal').style.display = 'block';
    setTimeout(() => document.getElementById('batchDeleteConfirmInput').focus(), 50);
}

function closeBatchDeleteModal() {
    document.getElementById('batchDeleteModal').style.display = 'none';
}

function confirmBatchDelete() {
    if (document.getElementById('batchDeleteConfirmInput').value.trim() !== '删除') return;
    const selected = getSelectedEntries().filter(entry => canEditCustomer(entry.customer));
    if (!selected.length) return;

    if (document.getElementById('batchDeleteBackup').checked) {
        exportRecords('xlsx', selected, { fileBaseName: `删除前备份_${todayStr()}`, silent: true });
    }

    const ids = new Set(selected.map(entry => entry.device.id));
    const touched = new Set(selected.map(entry => entry.customer.id));
    customers.forEach(customer => {
        if (touched.has(customer.id)) customer.devices = customer.devices.filter(device => !ids.has(device.id));
    });
    const before = customers.length;
    customers = customers.filter(customer => !(touched.has(customer.id) && customer.devices.length === 0));
    const removedCustomers = before - customers.length;

    selectedDeviceIds.clear();
    saveCustomersToStorage();
    refreshAll();
    closeBatchDeleteModal();
    alert(`已删除 ${ids.size} 条装机记录${removedCustomers ? `、${removedCustomers} 个客户` : ''}。`);
}

function renderDeviceCard({ customer, device }) {
    const next = getNextReplacementDate(device);
    const due = describeDue(next ? daysUntil(next) : null);
    const unpaidNext = getNextUnpaidDate(customer, device);
    const unpaidDays = unpaidNext ? daysUntil(unpaidNext) : null;
    const latestFollowUp = getLatestFollowUp(customer);
    const avgInterval = calculateAverageInterval(device);

    // 本条记录没有联系人时，借用同客户其他记录的联系人，方便打电话
    const hasOwnContact = device.contactPerson || device.phoneNumber;
    const contactSource = hasOwnContact ? device : customer.devices.find(d => d.contactPerson || d.phoneNumber);
    const borrowedNote = contactSource && !hasOwnContact ? '<span class="muted">（同客户其他记录）</span>' : '';

    // 管理员查看其他同事的客户时，显示负责人
    const showOwner = currentUser.role === 'admin' && customer.userId !== currentUser.id;
    const badges = [
        showOwner ? `<span class="badge badge-owner">负责人：${escapeHtml(getOwnerName(customer) || '未知')}</span>` : '',
        customer.longTermPartner ? '<span class="badge badge-partner">长期合作</span>' : '',
        device.needWaterTest ? '<span class="badge badge-water">需验水</span>' : '',
        device.hasUnpaid ? `<span class="badge badge-unpaid${unpaidDays !== null && unpaidDays <= 0 ? ' badge-alert' : ''}">未收款</span>` : ''
    ].join('');

    const fields = [
        ['联系人', contactSource ? contactSource.contactPerson : '', borrowedNote],
        ['联系电话', contactSource ? contactSource.phoneNumber : '', borrowedNote],
        ['省份 / 区域', [customer.province, customer.region].filter(Boolean).join(' · ')],
        ['详细地址', device.address],
        ['安装位置', device.location],
        ['型号', device.model],
        ['数量', device.quantity],
        ['装机时间', device.installDate],
        ['上次换芯', getLatestReplacementDate(device)],
        ['建议更换', next],
        ['更换间隔', device.customInterval ? `${device.customInterval} 天` : `默认 ${DEFAULT_REPLACEMENT_INTERVAL} 天`]
    ];
    if (device.hasUnpaid && unpaidNext) {
        fields.push(['催款提醒', `${unpaidNext}（${describeUnpaid(unpaidDays)}）`]);
    }

    const fieldHtml = fields
        .filter(([, value]) => value !== '' && value !== null && value !== undefined)
        .map(([label, value, extra]) => `
            <div class="record-field">
                <span class="record-label">${label}</span>
                <span class="record-value">${escapeHtml(value)}${extra && value ? extra : ''}</span>
            </div>`).join('');

    return `
        <div class="customer-item due-${due.level}" data-device-id="${device.id}">
            <div class="customer-header">
                <div class="customer-title">
                    <input type="checkbox" class="record-select" data-device-id="${device.id}" title="选择这条记录"${selectedDeviceIds.has(device.id) ? ' checked' : ''}>
                    <h3>${escapeHtml(customer.name)}</h3>
                    ${badges}
                </div>
                <span class="due-pill due-${due.level}">${due.text}</span>
            </div>
            <div class="record-grid">${fieldHtml}</div>
            ${device.notes ? `<p class="record-notes"><strong>备注：</strong>${escapeHtml(device.notes)}</p>` : ''}
            ${latestFollowUp ? `<p class="record-followup"><strong>最新跟踪（${escapeHtml(latestFollowUp.date || '日期未知')}）：</strong>${escapeHtml(latestFollowUp.content)}</p>` : ''}
            <div class="history-summary">
                换芯记录 ${device.replacementHistory.length} 条 · 平均间隔 ${avgInterval ? avgInterval + ' 天' : '数据不足'} ·
                跟踪记录 ${customer.followUps.length} 条 · 该客户共 ${customer.devices.length} 条装机记录
            </div>
            <div class="customer-actions">
                <button onclick="showEditDeviceModal(${device.id})" class="edit-btn">编辑记录</button>
                <button onclick="showEditCustomerModal(${customer.id})" class="customer-btn">编辑客户</button>
                <button onclick="showFollowUpModal(${customer.id})" class="followup-btn">添加跟踪</button>
                <button onclick="showAddReplacementModal(${device.id})" class="add-record-btn">记录换芯</button>
                <button onclick="showReplacementHistory(${device.id})" class="history-btn">历史记录</button>
                <button onclick="deleteDevice(${device.id})" class="delete-btn">删除</button>
            </div>
        </div>
    `;
}

// 删除装机记录；客户的最后一条记录被删除时，客户一并删除
function deleteDevice(deviceId) {
    const found = findDevice(deviceId);
    if (!found) return;
    const { customer, device } = found;

    if (!canEditCustomer(customer)) {
        alert('您没有权限删除此记录');
        return;
    }

    const label = [device.location, device.model, device.installDate].filter(Boolean).join(' / ') || '这条记录';
    const isLast = customer.devices.length === 1;
    const message = isLast
        ? `确定要删除「${customer.name}」的${label}吗？\n\n这是该客户的最后一条装机记录，客户及其跟踪记录会一起删除。`
        : `确定要删除「${customer.name}」的${label}吗？`;
    if (!confirm(message)) return;

    customer.devices = customer.devices.filter(d => d.id !== deviceId);
    if (isLast) {
        customers = customers.filter(c => c.id !== customer.id);
    }
    saveCustomersToStorage();
    refreshAll();
}

// ==================== 编辑客户 / 装机记录 ====================
function showEditCustomerModal(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) {
        alert('客户不存在');
        return;
    }
    if (!canEditCustomer(customer)) {
        alert('您没有权限编辑此客户信息');
        return;
    }

    currentEditingCustomerId = customerId;
    fillForm('cust', CUSTOMER_FORM_SECTIONS, customer);
    if (editCustomerError) editCustomerError.textContent = '';
    if (editCustomerModal) editCustomerModal.style.display = 'block';
}

function closeEditCustomerModal() {
    editCustomerModal.style.display = 'none';
    currentEditingCustomerId = null;
    editCustomerError.textContent = '';
}

function saveEditedCustomer(e) {
    if (e) e.preventDefault();

    const customer = customers.find(c => c.id === currentEditingCustomerId);
    if (!customer) {
        editCustomerError.textContent = '客户不存在';
        return;
    }

    const result = readForm('cust', CUSTOMER_FORM_SECTIONS);
    if (result.error) {
        editCustomerError.textContent = result.error;
        return;
    }
    if (result.data.name !== customer.name && customers.some(c => c.userId === customer.userId && c.id !== customer.id && c.name === result.data.name)) {
        editCustomerError.textContent = '已存在同名客户，请换一个名称';
        return;
    }

    Object.assign(customer, result.data);
    saveCustomersToStorage();
    refreshAll();
    closeEditCustomerModal();
}

function showEditDeviceModal(deviceId) {
    const found = findDevice(deviceId);
    if (!found) {
        alert('记录不存在');
        return;
    }
    if (!canEditCustomer(found.customer)) {
        alert('您没有权限编辑此记录');
        return;
    }

    currentEditingDeviceId = deviceId;
    fillForm('dev', DEVICE_FORM_SECTIONS, found.device);
    document.getElementById('editDeviceTitle').textContent = `编辑装机记录 - ${found.customer.name}`;
    document.getElementById('editDeviceError').textContent = '';
    document.getElementById('editDeviceModal').style.display = 'block';
}

function closeEditDeviceModal() {
    document.getElementById('editDeviceModal').style.display = 'none';
    currentEditingDeviceId = null;
}

function saveEditedDevice() {
    const errorDiv = document.getElementById('editDeviceError');
    const found = findDevice(currentEditingDeviceId);
    if (!found) {
        errorDiv.textContent = '记录不存在';
        return;
    }

    const result = readForm('dev', DEVICE_FORM_SECTIONS);
    if (result.error) {
        errorDiv.textContent = result.error;
        return;
    }

    Object.assign(found.device, result.data);
    saveCustomersToStorage();
    refreshAll();
    closeEditDeviceModal();
}

// ==================== 跟踪记录 ====================
function showFollowUpModal(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    if (!canEditCustomer(customer)) {
        alert('您没有权限为此客户添加跟踪记录');
        return;
    }

    currentFollowUpCustomerId = customerId;
    const hasUnpaid = customer.devices.some(d => d.hasUnpaid);
    document.getElementById('followUpModalTitle').textContent = `添加跟踪记录 - ${customer.name}`;
    document.getElementById('followUpDate').value = todayStr();
    document.getElementById('followUpContent').value = '';
    document.getElementById('followUpClearUnpaid').checked = false;
    document.getElementById('followUpClearUnpaidGroup').style.display = hasUnpaid ? 'block' : 'none';
    document.getElementById('followUpError').textContent = '';
    document.getElementById('followUpModal').style.display = 'block';
}

function closeFollowUpModal() {
    document.getElementById('followUpModal').style.display = 'none';
    currentFollowUpCustomerId = null;
}

function saveFollowUpRecord() {
    const errorDiv = document.getElementById('followUpError');
    const customer = customers.find(c => c.id === currentFollowUpCustomerId);
    if (!customer) {
        errorDiv.textContent = '客户不存在';
        return;
    }

    const date = document.getElementById('followUpDate').value;
    const content = document.getElementById('followUpContent').value.trim();
    if (!date) {
        errorDiv.textContent = '请选择跟踪日期';
        return;
    }
    if (!content) {
        errorDiv.textContent = '请填写跟踪内容';
        return;
    }

    customer.followUps.push(makeFollowUp(date, content));
    if (document.getElementById('followUpClearUnpaid').checked) {
        customer.devices.forEach(device => { device.hasUnpaid = false; });
    }

    saveCustomersToStorage();
    refreshAll();
    if (currentHistoryDeviceId && customer.devices.some(d => d.id === currentHistoryDeviceId)) {
        renderHistoryList();
    }
    closeFollowUpModal();
}

function deleteFollowUp(customerId, followUpId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer || !canEditCustomer(customer)) return;
    if (!confirm('确定要删除这条跟踪记录吗？')) return;

    customer.followUps = customer.followUps.filter(item => item.id !== followUpId);
    saveCustomersToStorage();
    refreshAll();
    renderHistoryList();
}

// ==================== 历史记录 ====================
// 显示历史记录管理界面（换芯记录 + 客户跟踪记录）
function showReplacementHistory(deviceId) {
    const found = findDevice(deviceId);
    if (!found) {
        alert('记录不存在');
        return;
    }

    if (!canEditCustomer(found.customer)) {
        alert('您没有权限查看此客户信息');
        return;
    }

    currentHistoryDeviceId = deviceId;

    const label = [found.device.location, found.device.model].filter(Boolean).join(' · ');
    document.getElementById('historyModalTitle').textContent = `${found.customer.name}${label ? ' · ' + label : ''} - 历史记录`;

    renderHistoryList();
    document.getElementById('historyManagementModal').style.display = 'block';
}

// 渲染历史记录列表
function renderHistoryList() {
    const historyListDiv = document.getElementById('historyList');
    const found = findDevice(currentHistoryDeviceId);
    if (!historyListDiv || !found) return;
    const { customer, device } = found;

    const replacementHtml = device.replacementHistory.length
        ? sortByDateDesc(device.replacementHistory).map((record, index) => `
            <div class="history-item">
                <div class="history-header">
                    <h4>换芯记录 #${index + 1}</h4>
                    <div class="history-actions">
                        <button onclick="editHistoryRecord(${record.id})" class="edit-btn">编辑</button>
                        <button onclick="deleteHistoryRecord(${record.id})" class="delete-btn">删除</button>
                    </div>
                </div>
                <div class="history-details">
                    <div><strong>更换日期:</strong> ${escapeHtml(record.date || '日期未知')}</div>
                    <div><strong>滤芯型号:</strong> ${escapeHtml(record.filterModel || '未设置')}</div>
                    <div><strong>数量:</strong> ${escapeHtml(record.quantity || 1)}</div>
                    <div><strong>费用:</strong> ${record.cost ? escapeHtml(record.cost) + '元' : '未记录'}</div>
                    <div><strong>操作人:</strong> ${escapeHtml(record.operator || '未知')}</div>
                    <div class="full-width"><strong>备注:</strong> ${escapeHtml(record.notes || '无')}</div>
                </div>
            </div>`).join('')
        : '<p class="empty-list">暂无换芯记录</p>';

    const followUpHtml = customer.followUps.length
        ? sortByDateDesc(customer.followUps).map(item => `
            <div class="history-item followup-item">
                <div class="history-header">
                    <h4>${escapeHtml(item.date || '日期未知')}</h4>
                    <div class="history-actions">
                        <button onclick="deleteFollowUp(${customer.id}, ${item.id})" class="delete-btn">删除</button>
                    </div>
                </div>
                <div>${escapeHtml(item.content)}</div>
                <div class="history-meta">记录人: ${escapeHtml(item.operator || '未知')}</div>
            </div>`).join('')
        : '<p class="empty-list">暂无跟踪记录</p>';

    historyListDiv.innerHTML = `
        <div class="history-section">
            <div class="history-section-header">
                <h3>🔧 换芯记录（本条装机记录）</h3>
                <button onclick="showAddReplacementModal(${device.id})" class="add-record-btn">+ 记录换芯</button>
            </div>
            ${replacementHtml}
        </div>
        <div class="history-section">
            <div class="history-section-header">
                <h3>📞 跟踪记录（${escapeHtml(customer.name)}）</h3>
                <button onclick="showFollowUpModal(${customer.id})" class="followup-btn">+ 添加跟踪</button>
            </div>
            ${followUpHtml}
        </div>
    `;
}

// 关闭历史记录管理模态框
function closeHistoryManagementModal() {
    const historyModal = document.getElementById('historyManagementModal');
    if (historyModal) {
        historyModal.style.display = 'none';
    }
    currentHistoryDeviceId = null;
}

// 编辑历史记录
function editHistoryRecord(recordId) {
    const found = findDevice(currentHistoryDeviceId);
    if (!found) return;

    const record = found.device.replacementHistory.find(r => r.id === recordId);
    if (!record) {
        alert('记录不存在');
        return;
    }

    if (!canEditCustomer(found.customer)) {
        alert('您没有权限编辑此记录');
        return;
    }

    currentEditingHistoryId = recordId;

    document.getElementById('editHistoryDate').value = record.date || '';
    document.getElementById('editHistoryFilterModel').value = record.filterModel || '';
    document.getElementById('editHistoryQuantity').value = record.quantity || 1;
    document.getElementById('editHistoryCost').value = record.cost || '';
    document.getElementById('editHistoryNotes').value = record.notes || '';
    document.getElementById('editHistoryError').textContent = '';
    document.getElementById('editHistoryModal').style.display = 'block';
}

// 保存编辑的历史记录
function saveEditedHistoryRecord() {
    const errorDiv = document.getElementById('editHistoryError');
    const found = findDevice(currentHistoryDeviceId);
    const record = found ? found.device.replacementHistory.find(r => r.id === currentEditingHistoryId) : null;
    if (!record) {
        errorDiv.textContent = '记录不存在';
        return;
    }

    const date = document.getElementById('editHistoryDate').value;
    const filterModel = document.getElementById('editHistoryFilterModel').value.trim();

    if (!date) {
        errorDiv.textContent = '请选择更换日期';
        return;
    }
    if (!filterModel) {
        errorDiv.textContent = '请输入滤芯型号';
        return;
    }

    Object.assign(record, {
        date,
        filterModel,
        quantity: parseInt(document.getElementById('editHistoryQuantity').value) || 1,
        cost: parseFloat(document.getElementById('editHistoryCost').value) || 0,
        notes: document.getElementById('editHistoryNotes').value.trim(),
        lastModified: new Date().toISOString(),
        lastModifiedBy: currentUser.username
    });

    saveCustomersToStorage();
    refreshAll();
    renderHistoryList();
    closeEditHistoryModal();
}

// 关闭编辑历史记录模态框
function closeEditHistoryModal() {
    const editHistoryModal = document.getElementById('editHistoryModal');
    if (editHistoryModal) {
        editHistoryModal.style.display = 'none';
    }
    currentEditingHistoryId = null;
}

// 删除历史记录
function deleteHistoryRecord(recordId) {
    const found = findDevice(currentHistoryDeviceId);
    if (!found) return;

    const record = found.device.replacementHistory.find(r => r.id === recordId);
    if (!record) {
        alert('记录不存在');
        return;
    }

    if (!canEditCustomer(found.customer)) {
        alert('您没有权限删除此记录');
        return;
    }

    if (!confirm(`确定要删除这条换芯记录吗？\n\n日期: ${record.date || '日期未知'}\n型号: ${record.filterModel}\n费用: ${record.cost ? record.cost + '元' : '未记录'}`)) {
        return;
    }

    found.device.replacementHistory = found.device.replacementHistory.filter(r => r.id !== recordId);
    saveCustomersToStorage();
    refreshAll();
    renderHistoryList();
}

// 显示记录换芯模态框
function showAddReplacementModal(deviceId) {
    const found = findDevice(deviceId);
    if (!found) {
        alert('记录不存在');
        return;
    }

    if (!canEditCustomer(found.customer)) {
        alert('您没有权限添加此客户的更换记录');
        return;
    }

    currentReplacementDeviceId = deviceId;

    // 默认带出本条记录的型号和台数
    document.getElementById('replacementDate').value = todayStr();
    document.getElementById('replacementFilterModel').value = found.device.model || '标准滤芯';
    document.getElementById('replacementQuantity').value = found.device.quantity || 1;
    document.getElementById('replacementCost').value = '';
    document.getElementById('replacementNotes').value = '';
    document.getElementById('replacementError').textContent = '';
    document.getElementById('addReplacementModal').style.display = 'block';
}

// 关闭记录换芯模态框
function closeAddReplacementModal() {
    const modal = document.getElementById('addReplacementModal');
    if (modal) {
        modal.style.display = 'none';
    }
    currentReplacementDeviceId = null;
}

// 保存换芯记录
function saveReplacementRecord() {
    const errorDiv = document.getElementById('replacementError');
    const found = findDevice(currentReplacementDeviceId);
    if (!found) {
        errorDiv.textContent = '记录不存在';
        return;
    }

    const date = document.getElementById('replacementDate').value;
    const filterModel = document.getElementById('replacementFilterModel').value.trim();

    if (!date) {
        errorDiv.textContent = '请选择更换日期';
        return;
    }
    if (!filterModel) {
        errorDiv.textContent = '请输入滤芯型号';
        return;
    }

    const { device } = found;
    device.replacementHistory.push(makeReplacementRecord({
        date,
        filterModel,
        quantity: document.getElementById('replacementQuantity').value,
        cost: document.getElementById('replacementCost').value,
        notes: document.getElementById('replacementNotes').value.trim()
    }));

    // 自动更新滤芯购买日期为最新的换芯日期
    device.filterPurchaseDate = latestDate([device.filterPurchaseDate, ...device.replacementHistory.map(r => r.date)]);

    saveCustomersToStorage();
    refreshAll();

    // 如果历史记录管理模态框是打开的，刷新列表
    if (currentHistoryDeviceId === currentReplacementDeviceId) {
        renderHistoryList();
    }

    closeAddReplacementModal();
}

// ==================== 仪表板 ====================
function bindDashboardEvents() {
    setTimeout(() => {
        const buttons = {
            exportTodayBtn: 'today',
            exportWeekBtn: 'week',
            exportMonthBtn: 'month',
            exportNextMonthBtn: 'nextMonth',
            exportUnpaidBtn: 'unpaid'
        };
        Object.entries(buttons).forEach(([id, type]) => {
            const button = document.getElementById(id);
            if (button) button.addEventListener('click', () => exportDashboardData(type));
        });

        // 初始化仪表板数据
        updateDashboard();
    }, 200);
}

// 绑定通知中心事件
function bindNotificationEvents() {
    setTimeout(() => {
        const notificationBtn = document.getElementById('notificationBtn');
        const markAllReadBtn = document.getElementById('markAllReadBtn');
        const notificationDropdown = document.getElementById('notificationDropdown');

        if (notificationBtn) {
            notificationBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleNotificationDropdown();
            });
        }

        if (markAllReadBtn) {
            markAllReadBtn.addEventListener('click', markAllNotificationsRead);
        }

        // 点击其他地方关闭下拉框
        document.addEventListener('click', (e) => {
            if (notificationDropdown && !notificationDropdown.contains(e.target) && e.target !== notificationBtn) {
                notificationDropdown.style.display = 'none';
            }
        });

        // 初始化通知
        updateNotifications();
    }, 200);
}

// 绑定登录提醒模态框事件
function bindReminderModalEvents() {
    setTimeout(() => {
        const closeReminderBtn = document.querySelector('.close-reminder');
        const laterReminderBtn = document.getElementById('laterReminderBtn');
        const closeReminderModalBtn = document.getElementById('closeReminderBtn');
        const noRemindTodayCheckbox = document.getElementById('noRemindToday');
        const loginReminderModal = document.getElementById('loginReminderModal');

        if (closeReminderBtn) {
            closeReminderBtn.addEventListener('click', closeLoginReminderModal);
        }

        if (laterReminderBtn) {
            laterReminderBtn.addEventListener('click', () => {
                closeLoginReminderModal();
                // 30分钟后再次提醒
                setTimeout(checkAndShowLoginReminder, 30 * 60 * 1000);
            });
        }

        if (closeReminderModalBtn) {
            closeReminderModalBtn.addEventListener('click', closeLoginReminderModal);
        }

        if (noRemindTodayCheckbox) {
            noRemindTodayCheckbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    localStorage.setItem('noRemindDate', todayStr());
                }
            });
        }

        // 点击模态框外部关闭
        if (loginReminderModal) {
            window.addEventListener('click', (e) => {
                if (e.target === loginReminderModal) {
                    closeLoginReminderModal();
                }
            });
        }

        // 登录后检查是否需要显示提醒
        setTimeout(checkAndShowLoginReminder, 1000);
    }, 200);
}

// 按到期时间分组：已到期(含今日)、7天内、30天内、60天内，以及7天内需要催款的记录
function categorizeEntries() {
    const groups = { today: [], week: [], month: [], nextMonth: [], unpaid: [] };

    getCurrentUserDevices().forEach(entry => {
        const next = getNextReplacementDate(entry.device);
        if (next) {
            const days = daysUntil(next);
            const item = { ...entry, days, date: next };
            if (days <= 0) groups.today.push(item);
            else if (days <= 7) groups.week.push(item);
            else if (days <= 30) groups.month.push(item);
            else if (days <= 60) groups.nextMonth.push(item);
        }

        const unpaid = getNextUnpaidDate(entry.customer, entry.device);
        if (unpaid) {
            const days = daysUntil(unpaid);
            if (days <= 7) groups.unpaid.push({ ...entry, days, date: unpaid });
        }
    });

    Object.values(groups).forEach(list => list.sort((a, b) => a.days - b.days));
    return groups;
}

function describeEntry({ customer, device }) {
    const detail = [device.location, device.model].filter(Boolean).join(' · ');
    return { name: customer.name, detail, phone: device.phoneNumber || (customer.devices.find(d => d.phoneNumber) || {}).phoneNumber || '' };
}

// 更新仪表板数据
function updateDashboard() {
    if (!currentUser) return;

    const groups = categorizeEntries();

    updateDashboardCount('todayCount', groups.today.length);
    updateDashboardCount('thisWeekCount', groups.week.length);
    updateDashboardCount('thisMonthCount', groups.month.length);
    updateDashboardCount('nextMonthCount', groups.nextMonth.length);
    updateDashboardCount('unpaidCount', groups.unpaid.length);

    updateDashboardList('todayList', groups.today, 'urgent');
    updateDashboardList('thisWeekList', groups.week, 'warning');
    updateDashboardList('thisMonthList', groups.month, 'info');
    updateDashboardList('nextMonthList', groups.nextMonth, 'next');
    updateDashboardList('unpaidList', groups.unpaid, 'unpaid', describeUnpaid);
}

// 更新仪表板计数
function updateDashboardCount(elementId, count) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = count;
    }
}

// 更新仪表板列表（只显示前5条）
function updateDashboardList(elementId, items, urgencyClass, describeDays = days => describeDue(days).text) {
    const element = document.getElementById(elementId);
    if (!element) return;

    if (items.length === 0) {
        element.innerHTML = '<div class="empty-state">暂无记录</div>';
        return;
    }

    let html = items.slice(0, 5).map(item => {
        const info = describeEntry(item);
        return `
            <div class="customer-list-item ${urgencyClass}" onclick="scrollToDevice(${item.device.id})">
                <div class="customer-name">${escapeHtml(info.name)}</div>
                ${info.detail ? `<div class="customer-detail">${escapeHtml(info.detail)}</div>` : ''}
                <div class="customer-phone">${escapeHtml(info.phone)}</div>
                <div class="customer-days">${describeDays(item.days)}</div>
            </div>
        `;
    }).join('');

    if (items.length > 5) {
        html += `<div class="customer-list-item more-item">还有 ${items.length - 5} 条记录...</div>`;
    }

    element.innerHTML = html;
}

// 滚动到指定装机记录
function scrollToDevice(deviceId) {
    // 清除筛选条件并显示所有记录，确保目标可见
    if (showAllCheckbox) showAllCheckbox.checked = true;
    if (customerSearch) customerSearch.value = '';
    [regionFilter, statusFilter, followupMonthFilter].forEach(clearMultiSelect);
    renderReminderList();

    setTimeout(() => {
        const element = document.querySelector(`[data-device-id="${deviceId}"]`);
        if (!element) return;
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('highlight');
        setTimeout(() => element.classList.remove('highlight'), 3000);
    }, 100);
}

// 导出仪表板数据
function exportDashboardData(type) {
    const titles = {
        today: '已到期客户',
        week: '本周到期客户',
        month: '本月到期客户',
        nextMonth: '下月到期客户',
        unpaid: '待催款客户'
    };
    const items = categorizeEntries()[type];

    if (!items.length) {
        alert('没有符合条件的记录');
        return;
    }

    const isUnpaid = type === 'unpaid';
    const rows = [['客户名称', '省份', '区域', '详细地址', '联系人', '联系电话', '安装位置', '型号', '数量', '上次换芯',
        isUnpaid ? '催款日期' : '建议更换日期', isUnpaid ? '催款状态' : '到期状态', '最新跟踪', '备注']];
    items.forEach(({ customer, device, days, date }) => {
        const latestFollowUp = getLatestFollowUp(customer);
        rows.push([customer.name, customer.province, customer.region, device.address, device.contactPerson, device.phoneNumber,
            device.location, device.model, device.quantity || '', toSheetDate(getLatestReplacementDate(device)), toSheetDate(date),
            isUnpaid ? describeUnpaid(days) : describeDue(days).text,
            latestFollowUp ? `${toSheetDate(latestFollowUp.date)} ${latestFollowUp.content}`.trim() : '', device.notes]);
    });

    downloadTable(rows, `${titles[type]}_${todayStr()}`, { widths: [27, 6, 6, 21, 10, 14, 10, 12, 6, 12, 14, 16, 24, 16] });
    alert(`${titles[type]}导出完成！共 ${items.length} 条记录`);
}

// ==================== 通知 ====================
function updateNotifications() {
    if (!currentUser) return;

    const notifications = generateNotifications();
    updateNotificationBadge(notifications.length);
    renderNotificationList(notifications);
}

// 生成通知
function generateNotifications() {
    const notifications = [];
    const now = new Date().toISOString();

    getCurrentUserDevices().forEach(entry => {
        const { customer, device } = entry;
        const { name, detail } = describeEntry(entry);
        const label = detail ? `${name}（${detail}）` : name;
        const next = getNextReplacementDate(device);
        const days = next ? daysUntil(next) : null;

        if (days !== null && days < -7) {
            notifications.push({ type: 'urgent', title: '严重超期提醒', content: `${label} 的滤芯已超期 ${-days} 天，请尽快联系更换`, deviceId: device.id, time: now });
        } else if (days !== null && days <= 0) {
            notifications.push({ type: 'warning', title: days === 0 ? '今日到期提醒' : '超期提醒',
                content: `${label} 的滤芯${days === 0 ? '今日到期' : `已超期 ${-days} 天`}，建议及时更换`, deviceId: device.id, time: now });
        } else if (days !== null && days <= 3) {
            notifications.push({ type: 'info', title: '即将到期提醒', content: `${label} 的滤芯将在 ${days} 天后到期，请提前准备`, deviceId: device.id, time: now });
        }

        const unpaid = getNextUnpaidDate(customer, device);
        if (unpaid && daysUntil(unpaid) <= 0) {
            notifications.push({ type: 'warning', title: '催收款提醒', content: `${label} 有未收款，${describeUnpaid(daysUntil(unpaid))}`, deviceId: device.id, time: now });
        }
    });

    // 按紧急程度排序
    const priority = { urgent: 3, warning: 2, info: 1 };
    notifications.sort((a, b) => priority[b.type] - priority[a.type]);

    return notifications;
}

// 更新通知徽章
function updateNotificationBadge(count) {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

// 渲染通知列表
function renderNotificationList(notifications) {
    const notificationList = document.getElementById('notificationList');
    if (!notificationList) return;

    if (notifications.length === 0) {
        notificationList.innerHTML = '<div class="empty-state">暂无通知</div>';
        return;
    }

    notificationList.innerHTML = notifications.map(notification => `
        <div class="notification-item unread" onclick="handleNotificationClick(${notification.deviceId})">
            <div class="notification-title">${escapeHtml(notification.title)}</div>
            <div class="notification-content">${escapeHtml(notification.content)}</div>
            <div class="notification-time">${formatNotificationTime(notification.time)}</div>
        </div>
    `).join('');
}

// 格式化通知时间
function formatNotificationTime(timeString) {
    const time = new Date(timeString);
    const now = new Date();
    const diffMinutes = Math.floor((now - time) / (1000 * 60));

    if (diffMinutes < 1) return '刚刚';
    if (diffMinutes < 60) return `${diffMinutes}分钟前`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}小时前`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}天前`;

    return time.toLocaleDateString();
}

// 切换通知下拉框
function toggleNotificationDropdown() {
    const dropdown = document.getElementById('notificationDropdown');
    if (dropdown) {
        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';

        if (!isVisible) {
            updateNotifications(); // 打开时刷新通知
        }
    }
}

// 处理通知点击
function handleNotificationClick(deviceId) {
    const dropdown = document.getElementById('notificationDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
    scrollToDevice(deviceId);
}

// 标记所有通知为已读
function markAllNotificationsRead() {
    updateNotificationBadge(0);
    const notificationItems = document.querySelectorAll('.notification-item.unread');
    notificationItems.forEach(item => {
        item.classList.remove('unread');
    });
}

// ==================== 登录提醒 ====================
function checkAndShowLoginReminder() {
    if (!currentUser) return;

    // 检查今日是否已设置不再提醒
    if (localStorage.getItem('noRemindDate') === todayStr()) {
        return;
    }

    const groups = categorizeEntries();
    const urgent = groups.today.filter(item => item.days < 0);
    const today = groups.today.filter(item => item.days === 0);
    const unpaid = groups.unpaid.filter(item => item.days <= 0);

    if (urgent.length || today.length || groups.week.length || unpaid.length) {
        showLoginReminderModal({ urgent, today, week: groups.week, unpaid });
    }
}

function renderReminderItems(elementId, items, emptyText, itemClass, describeDays, limit = Infinity) {
    const element = document.getElementById(elementId);
    if (!element) return;

    if (items.length === 0) {
        element.innerHTML = `<div class="empty-state">${emptyText}</div>`;
        return;
    }

    let html = items.slice(0, limit).map(item => {
        const info = describeEntry(item);
        return `
            <div class="reminder-customer-item ${itemClass}" onclick="handleReminderCustomerClick(${item.device.id})">
                <div class="reminder-customer-info">
                    <div class="reminder-customer-name">${escapeHtml(info.name)}${info.detail ? ` <span class="muted">${escapeHtml(info.detail)}</span>` : ''}</div>
                    <div class="reminder-customer-phone">${escapeHtml(info.phone)}</div>
                </div>
                <div class="reminder-days ${itemClass === 'urgent' ? 'overdue' : ''}">${describeDays(item.days)}</div>
            </div>
        `;
    }).join('');

    if (items.length > limit) {
        html += `<div class="reminder-customer-item more-item">还有 ${items.length - limit} 条记录...</div>`;
    }
    element.innerHTML = html;
}

// 显示登录提醒模态框
function showLoginReminderModal({ urgent, today, week, unpaid }) {
    const modal = document.getElementById('loginReminderModal');
    if (!modal) return;

    renderReminderItems('urgentList', urgent, '无超期记录', 'urgent', days => `超期${-days}天`, 10);
    renderReminderItems('todayReminderList', today, '今日无到期记录', 'warning', () => '今日到期');
    renderReminderItems('weekReminderList', week, '本周无到期记录', '', days => `${days}天后`, 5);
    renderReminderItems('unpaidReminderList', unpaid, '暂无需要催款的记录', 'warning', describeUnpaid, 10);

    modal.style.display = 'block';
}

// 处理提醒客户点击
function handleReminderCustomerClick(deviceId) {
    closeLoginReminderModal();
    scrollToDevice(deviceId);
}

// 关闭登录提醒模态框
function closeLoginReminderModal() {
    const modal = document.getElementById('loginReminderModal');
    if (modal) {
        modal.style.display = 'none';
    }
}
