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

// 客户管理相关元素
const customerNameInput = document.getElementById('customerName');
const contactPersonInput = document.getElementById('contactPerson');
const phoneNumberInput = document.getElementById('phoneNumber');
const regionInput = document.getElementById('region');
const filterPurchaseDateInput = document.getElementById('filterPurchaseDate');
const customIntervalInput = document.getElementById('customInterval');
const notesInput = document.getElementById('notes');
const addCustomerBtn = document.getElementById('addCustomer');
const reminderList = document.getElementById('reminderList');
const showAllCheckbox = document.getElementById('showAll');
const importBtn = document.getElementById('importBtn');
const exportBtn = document.getElementById('exportBtn');
const downloadSample = document.getElementById('downloadSample');
const csvFile = document.getElementById('csvFile');
const importStatus = document.getElementById('importStatus');

// 搜索和筛选相关元素
const customerSearch = document.getElementById('customerSearch');
const regionFilter = document.getElementById('regionFilter');
const followupMonthFilter = document.getElementById('followupMonthFilter');

// 编辑模态框相关元素
const editCustomerModal = document.getElementById('editCustomerModal');
const editCustomerName = document.getElementById('editCustomerName');
const editContactPerson = document.getElementById('editContactPerson');
const editPhoneNumber = document.getElementById('editPhoneNumber');
const editRegion = document.getElementById('editRegion');
const editFilterPurchaseDate = document.getElementById('editFilterPurchaseDate');
const editCustomInterval = document.getElementById('editCustomInterval');
const editNotes = document.getElementById('editNotes');
const saveCustomerBtn = document.getElementById('saveCustomerBtn');
const editCustomerError = document.getElementById('editCustomerError');
const closeEditBtn = document.querySelector('.close-edit');

// 当前编辑的客户ID
let currentEditingCustomerId = null;

// 历史记录管理相关变量
let currentHistoryCustomerId = null;
let currentEditingHistoryId = null;
let currentReplacementCustomerId = null;

// 初始化：设置默认日期为今天
document.addEventListener('DOMContentLoaded', () => {
    // 确保DOM元素存在
    if (filterPurchaseDateInput) {
        const today = new Date().toISOString().split('T')[0];
        filterPurchaseDateInput.value = today;
    }
    
    // 从localStorage加载用户和客户数据
    loadUsersFromStorage();
    loadCustomersFromStorage();
    
    // 检查是否有已登录用户
    checkLoggedInUser();
    
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
    if (exportBtn) exportBtn.addEventListener('click', exportCSV);
    if (downloadSample) downloadSample.addEventListener('click', downloadSampleCSV);
    if (showAllCheckbox) showAllCheckbox.addEventListener('change', renderReminderList);
    if (customerSearch) customerSearch.addEventListener('input', renderReminderList);
    if (regionFilter) regionFilter.addEventListener('change', renderReminderList);
    if (followupMonthFilter) followupMonthFilter.addEventListener('change', renderReminderList);
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    if (changePasswordBtn) changePasswordBtn.addEventListener('click', showChangePasswordModal);
    
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
            });
        }
    }, 200);
}

// 从localStorage加载用户数据
function loadUsersFromStorage() {
    try {
        const storedUsers = localStorage.getItem('waterFilterUsersV3');
        if (storedUsers) {
            users = JSON.parse(storedUsers);
        } else {
            // 如果没有用户，创建默认管理员账户
            createDefaultAdmin();
        }
    } catch (error) {
        console.error('Error loading users from storage:', error);
        users = [];
        createDefaultAdmin();
    }
}

// 创建默认管理员账户
function createDefaultAdmin() {
    const adminUser = {
        id: 1,
        username: 'admin',
        password: 'admin123',
        securityQuestion: '默认管理员账户',
        securityAnswer: 'admin123',
        role: 'admin',
        createdAt: new Date().toISOString()
    };
    users.push(adminUser);
    saveUsersToStorage();
    console.log('默认管理员账户已创建 (用户名: admin, 密码: admin123)');
}

// 保存用户数据到localStorage
function saveUsersToStorage() {
    try {
        localStorage.setItem('waterFilterUsersV3', JSON.stringify(users));
    } catch (error) {
        console.error('Error saving users to storage:', error);
    }
}

// 从localStorage加载客户数据
function loadCustomersFromStorage() {
    try {
        const storedCustomers = localStorage.getItem('waterFilterCustomersV3');
        if (storedCustomers) {
            customers = JSON.parse(storedCustomers);
        }
    } catch (error) {
        console.error('Error loading customers from storage:', error);
        customers = [];
    }
}

// 保存客户数据到localStorage
function saveCustomersToStorage() {
    try {
        localStorage.setItem('waterFilterCustomersV3', JSON.stringify(customers));
    } catch (error) {
        console.error('Error saving customers to storage:', error);
    }
}

// 检查是否有已登录用户
function checkLoggedInUser() {
    try {
        const loggedInUser = localStorage.getItem('waterFilterCurrentUserV3');
        showLogin();
    } catch (error) {
        console.error('Error checking logged in user:', error);
        showLogin();
    }
}

// 显示登录界面
function showLogin() {
    loginSection.style.display = 'block';
    registerSection.style.display = 'none';
    recoverySection.style.display = 'none';
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
    e.preventDefault();
    loginSection.style.display = 'none';
    registerSection.style.display = 'block';
    registerError.textContent = '';
    registerUsername.value = '';
    registerPassword.value = '';
    confirmPassword.value = '';
    if (securityQuestion) securityQuestion.value = '';
    if (securityAnswer) securityAnswer.value = '';
}

// 显示密码恢复界面
function showRecovery(e) {
    if (e) e.preventDefault();
    loginSection.style.display = 'none';
    recoverySection.style.display = 'block';
    recoveryError.textContent = '';
    recoveryUsername.value = '';
    recoverySecurityAnswer.value = '';
    newRecoveryPassword.value = '';
    confirmRecoveryPassword.value = '';
}

// 密码恢复功能
function recoverPassword(e) {
    e.preventDefault();
    const username = recoveryUsername.value.trim();
    const securityAnswer = recoverySecurityAnswer.value.trim();
    const newPassword = newRecoveryPassword.value;
    const confirmNewPassword = confirmRecoveryPassword.value;
    
    if (!username || !securityAnswer || !newPassword || !confirmNewPassword) {
        recoveryError.textContent = '请填写所有字段';
        return;
    }
    
    if (newPassword !== confirmNewPassword) {
        recoveryError.textContent = '新密码和确认密码不一致';
        return;
    }
    
    if (newPassword.length < 6) {
        recoveryError.textContent = '新密码长度至少为6位';
        return;
    }
    
    const user = users.find(u => u.username === username);
    if (!user) {
        recoveryError.textContent = '用户不存在';
        return;
    }
    
    if (user.securityAnswer !== securityAnswer) {
        recoveryError.textContent = '安全问题答案错误';
        return;
    }
    
    const userIndex = users.findIndex(u => u.id === user.id);
    if (userIndex !== -1) {
        users[userIndex].password = newPassword;
        saveUsersToStorage();
        alert('密码恢复成功，请使用新密码登录');
        showLogin();
    } else {
        recoveryError.textContent = '用户不存在';
    }
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
    renderReminderList();
    
    if (currentUser.role === 'admin') {
        const userManagementBtn = document.createElement('button');
        userManagementBtn.textContent = '用户管理';
        userManagementBtn.id = 'userManagementBtn';
        userManagementBtn.style.marginLeft = '10px';
        userManagementBtn.addEventListener('click', showAdminUserManagement);
        
        if (!document.getElementById('userManagementBtn')) {
            document.querySelector('.user-info').appendChild(userManagementBtn);
        }
    }
}

// 显示管理员用户管理界面
function showAdminUserManagement(e) {
    if (e) e.preventDefault();
    mainApp.style.display = 'none';
    adminUserManagement.style.display = 'block';
    renderUserList();
}

// 渲染用户列表
function renderUserList() {
    userList.innerHTML = '';
    
    if (!currentUser || currentUser.role !== 'admin') {
        userList.innerHTML = '<p>您没有权限访问此页面</p>';
        return;
    }
    
    if (users.length === 0) {
        userList.innerHTML = '<p>暂无用户记录</p>';
        return;
    }
    
    users.forEach(user => {
        const isDefaultAdmin = user.username === 'admin' && user.id === 1;
        
        const item = document.createElement('div');
        item.className = 'user-item';
        item.innerHTML = `
            <div class="user-item-info">
                <h3>${user.username}</h3>
                <p>角色: ${user.role === 'admin' ? '管理员' : '普通用户'}</p>
                <p>创建时间: ${new Date(user.createdAt).toLocaleDateString()}</p>
            </div>
            <div class="user-item-actions">
                ${!isDefaultAdmin ? `
                    ${user.role === 'admin' ? 
                        `<button class="demote-user-btn" data-id="${user.id}">降级为普通用户</button>` : 
                        `<button class="promote-user-btn" data-id="${user.id}">提升为管理员</button>`}
                    <button class="delete-user-btn" data-id="${user.id}">删除用户</button>
                ` : '<span>默认管理员账户</span>'}
            </div>
        `;
        userList.appendChild(item);
    });
    
    document.querySelectorAll('.promote-user-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const userId = parseInt(e.target.getAttribute('data-id'));
            promoteUser(userId);
        });
    });
    
    document.querySelectorAll('.demote-user-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const userId = parseInt(e.target.getAttribute('data-id'));
            demoteUser(userId);
        });
    });
    
    document.querySelectorAll('.delete-user-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const userId = parseInt(e.target.getAttribute('data-id'));
            deleteUser(userId);
        });
    });
}

// 提升用户为管理员
function promoteUser(userId) {
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
        users[userIndex].role = 'admin';
        saveUsersToStorage();
        renderUserList();
        if (currentUser.id === userId) {
            currentUser.role = 'admin';
            localStorage.setItem('waterFilterCurrentUserV3', JSON.stringify(currentUser));
            showMainApp();
        }
    }
}

// 降级管理员为普通用户
function demoteUser(userId) {
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
        users[userIndex].role = 'user';
        saveUsersToStorage();
        renderUserList();
        if (currentUser.id === userId) {
            currentUser.role = 'user';
            localStorage.setItem('waterFilterCurrentUserV3', JSON.stringify(currentUser));
            showMainApp();
        }
    }
}

// 删除用户
function deleteUser(userId) {
    if (userId === 1 && users.find(u => u.id === 1).username === 'admin') {
        alert('不能删除默认管理员账户');
        return;
    }
    
    if (confirm('确定要删除这个用户吗？这将同时删除该用户的所有客户数据。')) {
        const userIndex = users.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
            users.splice(userIndex, 1);
        }
        
        customers = customers.filter(customer => customer.userId !== userId);
        saveCustomersToStorage();
        saveUsersToStorage();
        renderUserList();
        
        if (currentUser.id === userId) {
            logout();
        }
    }
}

// 登录功能
function login(e) {
    e.preventDefault();
    const username = loginUsername.value.trim();
    const password = loginPassword.value;
    
    if (!username || !password) {
        loginError.textContent = '请输入用户名和密码';
        return;
    }
    
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        currentUser = user;
        localStorage.setItem('waterFilterCurrentUserV3', JSON.stringify(currentUser));
        showMainApp();
    } else {
        loginError.textContent = '用户名或密码错误';
    }
}

// 注册功能
function register(e) {
    e.preventDefault();
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
        password,
        securityQuestion: secQuestion,
        securityAnswer: secAnswer,
        role: 'user',
        createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    saveUsersToStorage();
    
    currentUser = newUser;
    localStorage.setItem('waterFilterCurrentUserV3', JSON.stringify(currentUser));
    showMainApp();
}

// 退出登录
function logout() {
    currentUser = null;
    localStorage.removeItem('waterFilterCurrentUserV3');
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
function changePassword(e) {
    e.preventDefault();
    const currentPwd = currentPassword.value;
    const newPwd = newPassword.value;
    const confirmNewPwd = confirmNewPassword.value;
    
    if (!currentPwd || !newPwd || !confirmNewPwd) {
        changePasswordError.textContent = '请填写所有字段';
        return;
    }
    
    if (currentPwd !== currentUser.password) {
        changePasswordError.textContent = '当前密码错误';
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
    
    const userIndex = users.findIndex(u => u.id === currentUser.id);
    if (userIndex !== -1) {
        users[userIndex].password = newPwd;
        currentUser.password = newPwd;
        saveUsersToStorage();
        localStorage.setItem('waterFilterCurrentUserV3', JSON.stringify(currentUser));
        closeChangePasswordModal();
        alert('密码修改成功');
    } else {
        changePasswordError.textContent = '用户不存在';
    }
}

// 获取当前用户的数据
function getCurrentUserCustomers() {
    if (!currentUser) return [];
    
    if (currentUser.role === 'admin') {
        return customers;
    }
    
    return customers.filter(customer => customer.userId === currentUser.id);
}

// 添加新客户
function addCustomer() {
    const name = customerNameInput.value.trim();
    const contactPerson = contactPersonInput.value.trim();
    const phoneNumber = phoneNumberInput.value.trim();
    const region = regionInput.value.trim();
    const filterDate = filterPurchaseDateInput.value;
    const customInterval = customIntervalInput.value ? parseInt(customIntervalInput.value) : null;
    const notes = notesInput.value.trim();
    
    if (!name || !contactPerson || !phoneNumber || !filterDate) {
        alert('请填写所有必填字段');
        return;
    }
    
    if (customInterval !== null && (isNaN(customInterval) || customInterval <= 0)) {
        alert('请输入有效的间隔天数');
        return;
    }
    
    const newCustomer = {
        id: Date.now(),
        name,
        contactPerson,
        phoneNumber,
        region,
        filterPurchaseDate: filterDate,
        customInterval,
        notes,
        userId: currentUser.id,
        createdAt: new Date().toISOString(),
        replacementHistory: [
            {
                id: Date.now(),
                date: filterDate,
                filterModel: '标准滤芯',
                quantity: 1,
                cost: 0,
                notes: '初始购买记录',
                operator: currentUser.username,
                timestamp: new Date().toISOString()
            }
        ]
    };
    
    customers.push(newCustomer);
    saveCustomersToStorage();
    renderReminderList();
    
    // 清空表单
    customerNameInput.value = '';
    contactPersonInput.value = '';
    phoneNumberInput.value = '';
    regionInput.value = '';
    filterPurchaseDateInput.value = new Date().toISOString().split('T')[0];
    customIntervalInput.value = '';
    notesInput.value = '';
}

// 【方案四】增强的表格式导入功能 - 解决Windows WPS兼容性问题
function importData() {
    if (!csvFile.files.length) {
        importStatus.textContent = '请选择文件';
        importStatus.style.color = '#e74c3c';
        return;
    }
    
    const file = csvFile.files[0];
    const fileName = file.name.toLowerCase();
    
    // 显示正在处理状态
    importStatus.textContent = '正在处理文件，请稍候...';
    importStatus.style.color = '#3498db';
    
    console.log('开始导入文件:', fileName, '文件大小:', file.size, 'bytes');
    
    if (fileName.endsWith('.csv')) {
        importCSVWithDebug(file);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        importExcelWithDebug(file);
    } else {
        importStatus.textContent = '不支持的文件格式，请选择CSV或Excel文件';
        importStatus.style.color = '#e74c3c';
    }
}

// 带调试信息的CSV导入
function importCSVWithDebug(file) {
    console.log('开始导入CSV文件:', file.name, '类型:', file.type, '大小:', file.size);
    
    // 检查文件是否为空
    if (file.size === 0) {
        importStatus.textContent = 'CSV文件为空，请检查文件内容';
        importStatus.style.color = '#e74c3c';
        return;
    }
    
    // 尝试多种编码方式读取文件
    tryMultipleEncodings(file, (content, encoding) => {
        console.log('成功使用编码读取文件:', encoding);
        console.log('文件内容预览(前200字符):', content.substring(0, 200));
        
        let cleanContent = content;
        
        // 移除各种BOM标记
        if (cleanContent.charCodeAt(0) === 0xFEFF) {
            cleanContent = cleanContent.slice(1);
            console.log('移除UTF-8 BOM');
        } else if (cleanContent.startsWith('\uFEFF')) {
            cleanContent = cleanContent.slice(1);
            console.log('移除Unicode BOM');
        }
        
        // 统一行结束符处理
        const originalLineCount = cleanContent.split(/\r\n|\r|\n/).length;
        cleanContent = cleanContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        console.log('原始行数:', originalLineCount, '处理后行数:', cleanContent.split('\n').length);
        
        // 移除空行和只包含空白字符的行
        const lines = cleanContent.split('\n').filter(line => line.trim() !== '');
        console.log('过滤后有效行数:', lines.length);
        
        if (lines.length === 0) {
            importStatus.textContent = 'CSV文件无有效数据行';
            importStatus.style.color = '#e74c3c';
            return;
        }
        
        // 显示文件解析信息
        console.log('文件解析完成，开始处理数据...');
        processTableImportDataWithDebug(lines, ',');
    });
}

// 带调试信息的Excel导入
function importExcelWithDebug(file) {
    console.log('开始导入Excel文件:', file.name, '类型:', file.type, '大小:', file.size);
    
    if (file.size === 0) {
        importStatus.textContent = 'Excel文件为空，请检查文件内容';
        importStatus.style.color = '#e74c3c';
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = (e) => {
        try {
            console.log('开始解析Excel文件...');
            const data = new Uint8Array(e.target.result);
            
            // 使用更宽松的解析选项
            const workbook = XLSX.read(data, { 
                type: 'array',
                cellDates: true,
                cellNF: false,
                cellText: false,
                raw: false,
                codepage: 65001, // UTF-8
                // 处理Windows WPS Excel的特殊情况
                WTF: true, // 允许更宽松的解析
                cellStyles: false,
                sheetRows: 0 // 读取所有行
            });
            
            console.log('Excel工作簿信息:', {
                sheetNames: workbook.SheetNames,
                sheets: Object.keys(workbook.Sheets).length
            });
            
            if (workbook.SheetNames.length === 0) {
                importStatus.textContent = 'Excel文件没有工作表';
                importStatus.style.color = '#e74c3c';
                return;
            }
            
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            console.log('使用工作表:', firstSheetName);
            
            // 获取工作表范围
            const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
            console.log('工作表范围:', range);
            
            // 使用多种方式尝试读取数据
            let jsonData;
            try {
                // 方式1：标准转换
                jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                    header: 1, 
                    raw: false,
                    dateNF: 'yyyy-mm-dd',
                    defval: '',
                    blankrows: false
                });
                console.log('使用标准转换成功');
            } catch (e1) {
                console.log('标准转换失败，尝试原始转换:', e1.message);
                try {
                    // 方式2：原始转换
                    jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                        header: 1, 
                        raw: true,
                        defval: '',
                        blankrows: false
                    });
                    console.log('使用原始转换成功');
                } catch (e2) {
                    console.log('原始转换也失败，使用基础转换:', e2.message);
                    // 方式3：基础转换
                    jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                        header: 1,
                        defval: ''
                    });
                    console.log('使用基础转换成功');
                }
            }
            
            console.log('Excel数据行数:', jsonData.length);
            console.log('前3行数据预览:', jsonData.slice(0, 3));
            
            if (jsonData.length === 0) {
                importStatus.textContent = 'Excel文件无数据';
                importStatus.style.color = '#e74c3c';
                return;
            }
            
            // 转换为CSV格式进行处理
            const lines = jsonData.map((row, rowIndex) => {
                return row.map((cell, colIndex) => {
                    if (cell === null || cell === undefined) {
                        return '';
                    }
                    
                    // 处理Excel数字格式的电话号码
                    if (typeof cell === 'number' && cell > 999999999) {
                        const phoneStr = Math.round(cell).toString();
                        console.log(`第${rowIndex}行第${colIndex}列：数字${cell}转换为电话号码${phoneStr}`);
                        return phoneStr;
                    }
                    
                    // 处理日期
                    if (cell instanceof Date) {
                        const dateStr = cell.toISOString().split('T')[0];
                        console.log(`第${rowIndex}行第${colIndex}列：日期${cell}转换为${dateStr}`);
                        return dateStr;
                    } else if (typeof cell === 'number' && cell > 1 && cell < 100000) {
                        // Excel日期序列号
                        try {
                            const date = new Date((cell - 25569) * 86400 * 1000);
                            if (!isNaN(date.getTime())) {
                                const dateStr = date.toISOString().split('T')[0];
                                console.log(`第${rowIndex}行第${colIndex}列：Excel日期序列号${cell}转换为${dateStr}`);
                                return dateStr;
                            }
                        } catch (e) {
                            console.log(`日期转换失败:`, cell, e.message);
                        }
                    }
                    
                    // 处理其他数据类型
                    if (typeof cell === 'number') {
                        return cell.toString();
                    }
                    
                    const cellStr = String(cell).trim();
                    
                    // 如果包含特殊字符，用引号包围
                    if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                        return `"${cellStr.replace(/"/g, '""')}"`;
                    }
                    return cellStr;
                }).join(',');
            }).filter(line => line.trim() !== '');
            
            console.log('Excel转CSV完成，有效行数:', lines.length);
            processTableImportDataWithDebug(lines, ',');
            
        } catch (error) {
            console.error('Excel解析错误:', error);
            importStatus.textContent = `Excel文件解析失败: ${error.message}`;
            importStatus.style.color = '#e74c3c';
        }
    };
    
    reader.onerror = () => {
        console.error('Excel文件读取失败');
        importStatus.textContent = 'Excel文件读取失败，请检查文件是否损坏';
        importStatus.style.color = '#e74c3c';
    };
    
    reader.readAsArrayBuffer(file);
}

// 尝试多种编码读取文件
function tryMultipleEncodings(file, onSuccess) {
    const encodings = ['UTF-8', 'GBK', 'GB2312', 'GB18030', 'ISO-8859-1', 'Windows-1252'];
    let currentIndex = 0;
    
    function tryNextEncoding() {
        if (currentIndex >= encodings.length) {
            // 所有编码都尝试失败，尝试默认读取
            console.log('所有编码尝试失败，使用默认读取');
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                if (content && content.trim()) {
                    onSuccess(content, 'default');
                } else {
                    importStatus.textContent = 'CSV文件读取失败，无法识别文件编码';
                    importStatus.style.color = '#e74c3c';
                }
            };
            reader.onerror = () => {
                importStatus.textContent = 'CSV文件读取失败，文件可能损坏';
                importStatus.style.color = '#e74c3c';
            };
            reader.readAsText(file);
            return;
        }
        
        const encoding = encodings[currentIndex];
        console.log(`尝试编码 ${currentIndex + 1}/${encodings.length}: ${encoding}`);
        
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const content = e.target.result;
            
            // 检查内容是否有效
            if (content && content.trim() && !containsGarbledText(content)) {
                console.log(`编码 ${encoding} 读取成功`);
                onSuccess(content, encoding);
            } else {
                console.log(`编码 ${encoding} 读取失败或包含乱码`);
                currentIndex++;
                tryNextEncoding();
            }
        };
        
        reader.onerror = () => {
            console.log(`编码 ${encoding} 读取出错`);
            currentIndex++;
            tryNextEncoding();
        };
        
        try {
            reader.readAsText(file, encoding);
        } catch (e) {
            console.log(`编码 ${encoding} 不支持:`, e.message);
            currentIndex++;
            tryNextEncoding();
        }
    }
    
    tryNextEncoding();
}

// 检查文本是否包含乱码
function containsGarbledText(text) {
    // 检查是否包含大量的问号、方块字符等乱码特征
    const garbledPatterns = [
        /\?{3,}/,           // 连续的问号
        /\ufffd{2,}/,       // 连续的替换字符
        /[^\x00-\x7F\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]{10,}/, // 大量非常用字符
    ];
    
    return garbledPatterns.some(pattern => pattern.test(text));
}

// 带调试信息的数据处理
function processTableImportDataWithDebug(lines, defaultDelimiter) {
    let importedCount = 0;
    let skippedCount = 0;
    let historyCount = 0;
    
    console.log('开始处理表格式导入数据，总行数:', lines.length);
    
    if (lines.length < 1) {
        importStatus.textContent = '文件为空或格式不正确';
        importStatus.style.color = '#e74c3c';
        return;
    }
    
    // 智能检测分隔符
    let delimiter = defaultDelimiter;
    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    
    if (tabCount > commaCount && tabCount > semicolonCount) {
        delimiter = '\t';
    } else if (semicolonCount > commaCount && semicolonCount > tabCount) {
        delimiter = ';';
    }
    
    console.log('检测到的分隔符:', delimiter === ',' ? '逗号' : delimiter === ';' ? '分号' : '制表符');
    console.log('分隔符统计 - 逗号:', commaCount, '分号:', semicolonCount, '制表符:', tabCount);
    
    // 智能检测列结构
    const headerColumns = parseCSVLine(firstLine, delimiter);
    console.log('表头列数:', headerColumns.length);
    console.log('表头内容:', headerColumns);
    
    const columnMapping = detectColumnMapping(headerColumns);
    console.log('检测到的列映射:', columnMapping);
    
    // 验证必要列是否存在
    if (columnMapping.name === -1 || columnMapping.contact === -1 || columnMapping.phone === -1) {
        const missingColumns = [];
        if (columnMapping.name === -1) missingColumns.push('客户名称');
        if (columnMapping.contact === -1) missingColumns.push('联系人');
        if (columnMapping.phone === -1) missingColumns.push('电话');
        
        importStatus.textContent = `缺少必要列: ${missingColumns.join(', ')}。请检查表头格式。`;
        importStatus.style.color = '#e74c3c';
        console.log('列映射验证失败，缺少必要列:', missingColumns);
        return;
    }
    
    // 从第二行开始处理数据（跳过表头）
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) {
            console.log(`第${i}行为空，跳过`);
            continue;
        }
        
        console.log(`处理第${i}行:`, line.substring(0, 100) + (line.length > 100 ? '...' : ''));
        
        const columns = parseCSVLine(line, delimiter);
        console.log(`第${i}行解析结果(${columns.length}列):`, columns);
        
        // 验证基本客户信息
        if (columns.length >= 3 && 
            columns[columnMapping.name] && columns[columnMapping.name].trim() && 
            columns[columnMapping.contact] && columns[columnMapping.contact].trim() && 
            columns[columnMapping.phone] && columns[columnMapping.phone].trim()) {
            
            const customerName = columns[columnMapping.name].trim();
            console.log(`处理客户: ${customerName}`);
            
            // 检查客户是否已存在
            let existingCustomer = customers.find(c => c.name === customerName && c.userId === currentUser.id);
            
            if (!existingCustomer) {
                // 创建新客户
                const newCustomer = {
                    id: Date.now() + i * 1000 + Math.random() * 1000,
                    name: customerName,
                    contactPerson: columns[columnMapping.contact] ? columns[columnMapping.contact].trim() : '',
                    phoneNumber: formatPhoneNumber(columns[columnMapping.phone]),
                    region: columnMapping.region !== -1 ? (columns[columnMapping.region] ? columns[columnMapping.region].trim() : '') : '',
                    filterPurchaseDate: columnMapping.purchaseDate !== -1 ? (columns[columnMapping.purchaseDate] || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0],
                    customInterval: columnMapping.interval !== -1 ? (columns[columnMapping.interval] ? parseInt(columns[columnMapping.interval]) : null) : null,
                    notes: columnMapping.notes !== -1 ? (columns[columnMapping.notes] ? columns[columnMapping.notes].trim() : '') : '',
                    userId: currentUser.id,
                    createdAt: new Date().toISOString(),
                    replacementHistory: []
                };
                
                customers.push(newCustomer);
                existingCustomer = newCustomer;
                console.log('创建新客户:', customerName);
                importedCount++;
            } else {
                // 更新现有客户基本信息
                existingCustomer.contactPerson = columns[columnMapping.contact] ? columns[columnMapping.contact].trim() : existingCustomer.contactPerson;
                existingCustomer.phoneNumber = formatPhoneNumber(columns[columnMapping.phone]);
                if (columnMapping.region !== -1 && columns[columnMapping.region]) {
                    existingCustomer.region = columns[columnMapping.region].trim();
                }
                if (columnMapping.notes !== -1 && columns[columnMapping.notes]) {
                    existingCustomer.notes = columns[columnMapping.notes].trim();
                }
                console.log('更新现有客户:', customerName);
            }
            
            // 处理历史记录
            const historyRecords = extractHistoryRecords(columns, columnMapping, existingCustomer);
            historyRecords.forEach(record => {
                const existingRecord = existingCustomer.replacementHistory.find(r => 
                    r.date === record.date && r.filterModel === record.filterModel
                );
                
                if (!existingRecord) {
                    existingCustomer.replacementHistory.push(record);
                    historyCount++;
                    console.log('添加历史记录:', record.date, record.filterModel);
                }
            });
            
            // 确保至少有一条初始记录
            if (existingCustomer.replacementHistory.length === 0) {
                const initialRecord = {
                    id: Date.now() + i * 1000,
                    date: existingCustomer.filterPurchaseDate,
                    filterModel: '标准滤芯',
                    quantity: 1,
                    cost: 0,
                    notes: '初始购买记录',
                    operator: currentUser.username,
                    timestamp: new Date().toISOString()
                };
                existingCustomer.replacementHistory.push(initialRecord);
                console.log('创建初始购买记录');
            }
            
        } else {
            console.log(`第${i}行客户信息不完整，跳过:`, {
                name: columns[columnMapping.name],
                contact: columns[columnMapping.contact],
                phone: columns[columnMapping.phone],
                columnsLength: columns.length
            });
            skippedCount++;
        }
    }
    
    saveCustomersToStorage();
    renderReminderList();
    
    let statusMessage = `导入完成: 成功导入 ${importedCount} 个客户`;
    if (historyCount > 0) {
        statusMessage += `，${historyCount} 条历史记录`;
    }
    statusMessage += `，跳过 ${skippedCount} 条无效记录`;
    
    importStatus.textContent = statusMessage;
    importStatus.style.color = importedCount > 0 ? '#27ae60' : '#e74c3c';
    
    console.log('导入完成:', statusMessage);
    csvFile.value = '';
}

// 导入CSV数据 - 优化版本，解决Mac/Windows兼容性问题
function importCSV(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        const content = e.target.result;
        let cleanContent = content;
        
        // 移除BOM标记
        if (cleanContent.charCodeAt(0) === 0xFEFF) {
            cleanContent = cleanContent.slice(1);
        }
        
        // 统一行结束符 - Windows使用\r\n，Mac使用\n，老Mac使用\r
        cleanContent = cleanContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        const lines = cleanContent.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length === 0) {
            importStatus.textContent = 'CSV文件为空或格式不正确';
            importStatus.style.color = '#e74c3c';
            return;
        }
        
        processTableImportData(lines, ',');
    };
    
    reader.onerror = () => {
        importStatus.textContent = '读取CSV文件失败，请重试';
        importStatus.style.color = '#e74c3c';
    };
    
    // 智能编码检测和读取
    detectFileEncodingAndRead(file, reader);
}

// 检测文件编码并读取
function detectFileEncodingAndRead(file, reader) {
    // 首先尝试UTF-8编码
    reader.readAsText(file, 'UTF-8');
    
    // 如果UTF-8失败，创建新的FileReader尝试其他编码
    reader.addEventListener('error', () => {
        console.log('UTF-8读取失败，尝试其他编码');
        
        const reader2 = new FileReader();
        reader2.onload = (e) => {
            const content = e.target.result;
            let cleanContent = content;
            
            // 移除BOM标记
            if (cleanContent.charCodeAt(0) === 0xFEFF) {
                cleanContent = cleanContent.slice(1);
            }
            
            // 统一行结束符
            cleanContent = cleanContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            
            const lines = cleanContent.split('\n').filter(line => line.trim() !== '');
            
            if (lines.length === 0) {
                importStatus.textContent = 'CSV文件为空或格式不正确';
                importStatus.style.color = '#e74c3c';
                return;
            }
            
            processTableImportData(lines, ',');
        };
        
        reader2.onerror = () => {
            // 最后尝试默认编码
            const reader3 = new FileReader();
            reader3.onload = (e) => {
                const content = e.target.result;
                let cleanContent = content;
                
                if (cleanContent.charCodeAt(0) === 0xFEFF) {
                    cleanContent = cleanContent.slice(1);
                }
                
                cleanContent = cleanContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                const lines = cleanContent.split('\n').filter(line => line.trim() !== '');
                
                if (lines.length > 0) {
                    processTableImportData(lines, ',');
                } else {
                    importStatus.textContent = 'CSV文件读取失败，请检查文件格式和编码';
                    importStatus.style.color = '#e74c3c';
                }
            };
            
            reader3.onerror = () => {
                importStatus.textContent = 'CSV文件读取失败，请检查文件格式';
                importStatus.style.color = '#e74c3c';
            };
            
            reader3.readAsText(file); // 使用默认编码
        };
        
        // Windows常用的GBK/GB2312编码
        try {
            reader2.readAsText(file, 'GBK');
        } catch (e) {
            try {
                reader2.readAsText(file, 'GB2312');
            } catch (e2) {
                reader2.readAsText(file, 'ISO-8859-1');
            }
        }
    }, { once: true });
}

// Excel日期转换函数
function excelDateToJSDate(excelDate) {
    if (typeof excelDate === 'number' && excelDate > 1) {
        const date = new Date((excelDate - 25569) * 86400 * 1000);
        return date.toISOString().split('T')[0];
    }
    return excelDate;
}

// 电话号码格式化函数
function formatPhoneNumber(phoneNumber) {
    if (typeof phoneNumber === 'number') {
        const phoneStr = phoneNumber.toFixed(0);
        
        if (phoneStr.length >= 11 && phoneStr.length <= 15) {
            return phoneStr;
        }
        
        if (phoneStr.length >= 10) {
            return phoneStr;
        }
    }
    
    if (typeof phoneNumber === 'string') {
        return phoneNumber;
    }
    
    return String(phoneNumber);
}

// 导入Excel数据
function importExcel(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                header: 1, 
                raw: true,
                dateNF: 'yyyy-mm-dd'
            });
            
            if (jsonData.length === 0) {
                importStatus.textContent = 'Excel文件为空';
                importStatus.style.color = '#e74c3c';
                return;
            }
            
            const lines = jsonData.map(row => {
                return row.map((cell, colIndex) => {
                    if (cell === null || cell === undefined) {
                        return '';
                    }
                    
                    // 处理电话号码列
                    if (typeof cell === 'number' && cell > 999999999) {
                        return formatPhoneNumber(cell);
                    }
                    
                    // 处理日期列
                    if (cell instanceof Date) {
                        return cell.toISOString().split('T')[0];
                    } else if (typeof cell === 'number' && cell > 1 && cell < 100000) {
                        // 可能是Excel日期
                        return excelDateToJSDate(cell);
                    }
                    
                    if (typeof cell === 'number') {
                        return cell.toString();
                    }
                    
                    const cellStr = String(cell);
                    if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                        return `"${cellStr.replace(/"/g, '""')}"`;
                    }
                    return cellStr;
                }).join(',');
            });
            
            processTableImportData(lines, ',');
        } catch (error) {
            console.error('Excel解析错误:', error);
            importStatus.textContent = '解析Excel文件失败，请确保文件格式正确';
            importStatus.style.color = '#e74c3c';
        }
    };
    
    reader.onerror = () => {
        importStatus.textContent = '读取Excel文件失败，请重试';
        importStatus.style.color = '#e74c3c';
    };
    
    reader.readAsArrayBuffer(file);
}

// CSV行解析函数
function parseCSVLine(line, delimiter = ',') {
    const result = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                i += 2;
                continue;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
        i++;
    }
    
    result.push(current.trim());
    
    return result.map(field => {
        return field.replace(/\uFEFF/g, '').replace(/^["']|["']$/g, '');
    });
}

// 【方案三】处理表格式导入数据 - 智能列检测和多历史记录支持
function processTableImportData(lines, defaultDelimiter) {
    let importedCount = 0;
    let skippedCount = 0;
    let historyCount = 0;
    
    console.log('开始处理表格式导入数据，总行数:', lines.length);
    
    if (lines.length < 1) {
        importStatus.textContent = '文件为空或格式不正确';
        importStatus.style.color = '#e74c3c';
        return;
    }
    
    // 检测分隔符
    let delimiter = defaultDelimiter;
    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    
    if (tabCount > commaCount && tabCount > semicolonCount) {
        delimiter = '\t';
    } else if (semicolonCount > commaCount && semicolonCount > tabCount) {
        delimiter = ';';
    }
    
    console.log('使用分隔符:', delimiter === ',' ? '逗号' : delimiter === ';' ? '分号' : '制表符');
    
    // 智能检测列结构
    const headerColumns = parseCSVLine(firstLine, delimiter);
    const columnMapping = detectColumnMapping(headerColumns);
    
    console.log('检测到的列映射:', columnMapping);
    
    // 从第二行开始处理数据（跳过表头）
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        
        console.log(`处理第${i}行:`, line);
        
        const columns = parseCSVLine(line, delimiter);
        console.log(`第${i}行解析结果:`, columns);
        
        // 验证基本客户信息
        if (columns.length >= 3 && 
            columns[columnMapping.name] && columns[columnMapping.name].trim() && 
            columns[columnMapping.contact] && 
            columns[columnMapping.phone]) {
            
            const customerName = columns[columnMapping.name].trim();
            
            // 检查客户是否已存在
            let existingCustomer = customers.find(c => c.name === customerName && c.userId === currentUser.id);
            
            if (!existingCustomer) {
                // 创建新客户
                const newCustomer = {
                    id: Date.now() + i * 1000 + Math.random() * 1000,
                    name: customerName,
                    contactPerson: columns[columnMapping.contact] ? columns[columnMapping.contact].trim() : '',
                    phoneNumber: formatPhoneNumber(columns[columnMapping.phone]),
                    region: columnMapping.region !== -1 ? (columns[columnMapping.region] ? columns[columnMapping.region].trim() : '') : '',
                    filterPurchaseDate: columnMapping.purchaseDate !== -1 ? (columns[columnMapping.purchaseDate] || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0],
                    customInterval: columnMapping.interval !== -1 ? (columns[columnMapping.interval] ? parseInt(columns[columnMapping.interval]) : null) : null,
                    notes: columnMapping.notes !== -1 ? (columns[columnMapping.notes] ? columns[columnMapping.notes].trim() : '') : '',
                    userId: currentUser.id,
                    createdAt: new Date().toISOString(),
                    replacementHistory: []
                };
                
                customers.push(newCustomer);
                existingCustomer = newCustomer;
                console.log('创建新客户:', customerName);
                importedCount++;
            } else {
                // 更新现有客户基本信息
                existingCustomer.contactPerson = columns[columnMapping.contact] ? columns[columnMapping.contact].trim() : existingCustomer.contactPerson;
                existingCustomer.phoneNumber = formatPhoneNumber(columns[columnMapping.phone]);
                if (columnMapping.region !== -1 && columns[columnMapping.region]) {
                    existingCustomer.region = columns[columnMapping.region].trim();
                }
                if (columnMapping.notes !== -1 && columns[columnMapping.notes]) {
                    existingCustomer.notes = columns[columnMapping.notes].trim();
                }
                console.log('更新现有客户:', customerName);
            }
            
            // 处理历史记录 - 支持多列历史记录
            const historyRecords = extractHistoryRecords(columns, columnMapping, existingCustomer);
            historyRecords.forEach(record => {
                // 检查是否已存在相同的历史记录
                const existingRecord = existingCustomer.replacementHistory.find(r => 
                    r.date === record.date && r.filterModel === record.filterModel
                );
                
                if (!existingRecord) {
                    existingCustomer.replacementHistory.push(record);
                    historyCount++;
                    console.log('添加历史记录:', record.date, record.filterModel);
                }
            });
            
            // 确保至少有一条初始记录
            if (existingCustomer.replacementHistory.length === 0) {
                const initialRecord = {
                    id: Date.now() + i * 1000,
                    date: existingCustomer.filterPurchaseDate,
                    filterModel: '标准滤芯',
                    quantity: 1,
                    cost: 0,
                    notes: '初始购买记录',
                    operator: currentUser.username,
                    timestamp: new Date().toISOString()
                };
                existingCustomer.replacementHistory.push(initialRecord);
                console.log('创建初始购买记录');
            }
            
        } else {
            console.log('客户信息不完整，跳过:', columns);
            skippedCount++;
        }
    }
    
    saveCustomersToStorage();
    renderReminderList();
    
    let statusMessage = `表格式导入完成: 成功导入 ${importedCount} 个客户`;
    if (historyCount > 0) {
        statusMessage += `，${historyCount} 条历史记录`;
    }
    statusMessage += `，跳过 ${skippedCount} 条无效记录`;
    
    importStatus.textContent = statusMessage;
    importStatus.style.color = importedCount > 0 ? '#27ae60' : '#e74c3c';
    
    csvFile.value = '';
}

// 智能检测列映射
function detectColumnMapping(headers) {
    const mapping = {
        name: -1,
        contact: -1,
        phone: -1,
        region: -1,
        purchaseDate: -1,
        interval: -1,
        notes: -1,
        historyColumns: []
    };
    
    headers.forEach((header, index) => {
        const lowerHeader = header.toLowerCase().replace(/\s+/g, '');
        
        // 客户名称
        if (lowerHeader.includes('客户') || lowerHeader.includes('姓名') || lowerHeader.includes('名称') || lowerHeader.includes('name')) {
            mapping.name = index;
        }
        // 联系人
        else if (lowerHeader.includes('联系人') || lowerHeader.includes('contact') || lowerHeader.includes('负责人')) {
            mapping.contact = index;
        }
        // 电话
        else if (lowerHeader.includes('电话') || lowerHeader.includes('手机') || lowerHeader.includes('phone') || lowerHeader.includes('tel')) {
            mapping.phone = index;
        }
        // 区域
        else if (lowerHeader.includes('区域') || lowerHeader.includes('地区') || lowerHeader.includes('region') || lowerHeader.includes('area')) {
            mapping.region = index;
        }
        // 购买日期
        else if (lowerHeader.includes('购买') || lowerHeader.includes('purchase') || lowerHeader.includes('date') || lowerHeader.includes('日期')) {
            mapping.purchaseDate = index;
        }
        // 间隔
        else if (lowerHeader.includes('间隔') || lowerHeader.includes('天数') || lowerHeader.includes('interval')) {
            mapping.interval = index;
        }
        // 备注
        else if (lowerHeader.includes('备注') || lowerHeader.includes('notes') || lowerHeader.includes('说明')) {
            mapping.notes = index;
        }
        // 历史记录相关列
        else if (lowerHeader.includes('历史') || lowerHeader.includes('更换') || lowerHeader.includes('history') || 
                 lowerHeader.includes('记录') || lowerHeader.includes('滤芯') || lowerHeader.includes('filter')) {
            mapping.historyColumns.push({
                index: index,
                type: detectHistoryColumnType(lowerHeader),
                header: header
            });
        }
    });
    
    return mapping;
}

// 检测历史记录列类型
function detectHistoryColumnType(header) {
    if (header.includes('日期') || header.includes('date') || header.includes('时间')) {
        return 'date';
    } else if (header.includes('型号') || header.includes('model') || header.includes('类型')) {
        return 'model';
    } else if (header.includes('数量') || header.includes('quantity') || header.includes('个数')) {
        return 'quantity';
    } else if (header.includes('费用') || header.includes('价格') || header.includes('cost') || header.includes('money')) {
        return 'cost';
    } else if (header.includes('备注') || header.includes('notes') || header.includes('说明')) {
        return 'notes';
    } else if (header.includes('操作') || header.includes('operator') || header.includes('人员')) {
        return 'operator';
    } else {
        return 'unknown';
    }
}

// 从行数据中提取历史记录
function extractHistoryRecords(columns, mapping, customer) {
    const records = [];
    
    // 方式1：从历史记录列中提取（如果有专门的历史记录列）
    mapping.historyColumns.forEach(historyCol => {
        if (columns[historyCol.index] && columns[historyCol.index].trim()) {
            const historyData = columns[historyCol.index].trim();
            
            // 尝试解析复合历史记录格式（分号分隔的多条记录）
            if (historyData.includes(';')) {
                const historyEntries = historyData.split(';').filter(entry => entry.trim());
                
                historyEntries.forEach((entry, index) => {
                    const record = parseHistoryEntry(entry.trim(), customer, index);
                    if (record) {
                        records.push(record);
                    }
                });
            } else {
                // 单条历史记录
                const record = parseHistoryEntry(historyData, customer, 0);
                if (record) {
                    records.push(record);
                }
            }
        }
    });
    
    // 方式2：从其他列推断历史记录（如果购买日期列存在且不是今天）
    if (mapping.purchaseDate !== -1 && columns[mapping.purchaseDate]) {
        const purchaseDate = columns[mapping.purchaseDate];
        const today = new Date().toISOString().split('T')[0];
        
        if (purchaseDate !== today && isValidDate(purchaseDate)) {
            const inferredRecord = {
                id: Date.now() + Math.random() * 1000,
                date: purchaseDate,
                filterModel: '标准滤芯',
                quantity: 1,
                cost: 0,
                notes: '从购买日期推断的记录',
                operator: currentUser.username,
                timestamp: new Date().toISOString()
            };
            records.push(inferredRecord);
        }
    }
    
    return records;
}

// 解析单条历史记录条目
function parseHistoryEntry(entry, customer, index) {
    try {
        // 尝试解析逗号分隔的历史记录格式：日期,型号,数量,费用,备注,操作人
        const fields = entry.split(',').map(field => field.trim());
        
        if (fields.length >= 1 && isValidDate(fields[0])) {
            return {
                id: Date.now() + index * 100 + Math.random() * 100,
                date: fields[0],
                filterModel: fields[1] || '标准滤芯',
                quantity: fields[2] ? parseInt(fields[2]) || 1 : 1,
                cost: fields[3] ? parseFloat(fields[3]) || 0 : 0,
                notes: fields[4] || '导入的历史记录',
                operator: fields[5] || currentUser.username,
                timestamp: new Date().toISOString()
            };
        }
        
        // 尝试解析其他可能的格式
        // 格式：YYYY-MM-DD 型号名称
        const dateModelMatch = entry.match(/(\d{4}-\d{1,2}-\d{1,2})\s+(.+)/);
        if (dateModelMatch) {
            return {
                id: Date.now() + index * 100 + Math.random() * 100,
                date: dateModelMatch[1],
                filterModel: dateModelMatch[2].trim(),
                quantity: 1,
                cost: 0,
                notes: '导入的历史记录',
                operator: currentUser.username,
                timestamp: new Date().toISOString()
            };
        }
        
        // 如果只是一个日期
        if (isValidDate(entry)) {
            return {
                id: Date.now() + index * 100 + Math.random() * 100,
                date: entry,
                filterModel: '标准滤芯',
                quantity: 1,
                cost: 0,
                notes: '导入的历史记录',
                operator: currentUser.username,
                timestamp: new Date().toISOString()
            };
        }
        
    } catch (error) {
        console.error('解析历史记录条目时出错:', error, entry);
    }
    
    return null;
}

// 日期验证函数
function isValidDate(dateString) {
    const datePatterns = [
        /^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/,
        /^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}$/,
        /^\d{4}\d{2}\d{2}$/,
        /^\d{4}$/
    ];
    
    const hasValidFormat = datePatterns.some(pattern => pattern.test(dateString));
    if (!hasValidFormat) return false;
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return false;
    
    const year = date.getFullYear();
    return year >= 2000 && year <= 2030;
}

// 下载示例CSV（表格式格式）
function downloadSampleCSV(e) {
    e.preventDefault();
    const csvContent = '\uFEFF客户名称,联系人,电话,区域,滤芯购买日期,间隔天数,备注,历史记录1,历史记录2,历史记录3\n' +
        '张三,张经理,13800138000,华北,2025-01-15,90,重要客户,"2024-12-01,标准滤芯,1,100,定期更换,admin","2024-09-01,活性炭滤芯,1,120,紧急更换,admin","2024-06-01,高效滤芯,1,150,升级更换,admin"\n' +
        '李四,李主任,13900139000,华东,2025-02-20,60,普通客户,"2024-11-15,标准滤芯,1,100,上次更换,admin","2024-08-10,标准滤芯,1,100,定期维护,admin",\n' +
        '王五,王师傅,13700137000,华南,2025-03-15,120,VIP客户,"2024-10-01,高效滤芯,2,300,批量更换,admin",,';
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', '客户数据示例_表格式V3.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 导出客户数据
function exportCSV() {
    const userCustomers = getCurrentUserCustomers();
    
    if (userCustomers.length === 0) {
        alert('没有客户数据可导出');
        return;
    }
    
    let csvContent = '\uFEFF客户名称,联系人,联系电话,区域,滤芯购买日期,自定义间隔(天),备注\n';
    
    userCustomers.forEach(customer => {
        const customInterval = customer.customInterval || '';
        csvContent += `${customer.name},${customer.contactPerson},${customer.phoneNumber},${customer.region || ''},${customer.filterPurchaseDate},${customInterval},${customer.notes || ''}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    
    link.setAttribute('href', url);
    link.setAttribute('download', `滤芯客户数据_V3_${date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 计算提醒日期范围
function calculateReminderRange(filterDate, customInterval = null) {
    const date = new Date(filterDate);
    
    if (customInterval && !isNaN(customInterval)) {
        const minDate = new Date(date);
        minDate.setDate(minDate.getDate() + customInterval);
        
        const maxDate = new Date(date);
        maxDate.setDate(maxDate.getDate() + customInterval * 2);
        
        return {
            min: formatDate(minDate),
            max: formatDate(maxDate)
        };
    } else {
        const minDate = new Date(date);
        minDate.setDate(minDate.getDate() + 60);
        
        const maxDate = new Date(date);
        maxDate.setDate(maxDate.getDate() + 120);
        
        return {
            min: formatDate(minDate),
            max: formatDate(maxDate)
        };
    }
}

// 格式化日期为YYYY-MM-DD
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 获取所有区域列表
function getAllRegions() {
    const regions = new Set();
    customers.forEach(customer => {
        if (customer.region && customer.region.trim()) {
            regions.add(customer.region.trim());
        }
    });
    return Array.from(regions).sort();
}

// 更新区域筛选下拉框
function updateRegionFilter() {
    if (!regionFilter) return;
    
    const allRegions = getAllRegions();
    const currentValue = regionFilter.value;
    
    regionFilter.innerHTML = '<option value="">全部区域</option>';
    
    allRegions.forEach(region => {
        const option = document.createElement('option');
        option.value = region;
        option.textContent = region;
        regionFilter.appendChild(option);
    });
    
    if (currentValue && allRegions.includes(currentValue)) {
        regionFilter.value = currentValue;
    }
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

// 渲染提醒列表
function renderReminderList() {
    if (!reminderList) return;
    
    const userCustomers = getCurrentUserCustomers();
    updateRegionFilter();
    
    const searchTerm = customerSearch ? customerSearch.value.toLowerCase() : '';
    let searchFilteredCustomers = userCustomers.filter(customer => 
        customer.name.toLowerCase().includes(searchTerm) ||
        customer.contactPerson.toLowerCase().includes(searchTerm) ||
        customer.phoneNumber.includes(searchTerm) ||
        (customer.notes && customer.notes.toLowerCase().includes(searchTerm))
    );
    
    const selectedRegion = regionFilter ? regionFilter.value : '';
    if (selectedRegion) {
        searchFilteredCustomers = searchFilteredCustomers.filter(customer => 
            customer.region === selectedRegion
        );
    }
    
    const selectedMonth = followupMonthFilter ? followupMonthFilter.value : '';
    if (selectedMonth) {
        searchFilteredCustomers = searchFilteredCustomers.filter(customer => {
            const reminderRange = calculateReminderRange(customer.filterPurchaseDate, customer.customInterval);
            const minDate = new Date(reminderRange.min);
            const month = parseInt(selectedMonth);
            
            // 按照建议更换时间的开始日期（前面那个日期）的月份来筛选
            return minDate.getMonth() + 1 === month;
        });
    }
    
    const showAll = showAllCheckbox ? showAllCheckbox.checked : false;
    let filteredCustomers = searchFilteredCustomers;
    
    filteredCustomers.sort((a, b) => {
        const today = new Date();
        const aRange = calculateReminderRange(a.filterPurchaseDate, a.customInterval);
        const bRange = calculateReminderRange(b.filterPurchaseDate, b.customInterval);
        const aMinDate = new Date(aRange.min);
        const bMinDate = new Date(bRange.min);
        const aMaxDate = new Date(aRange.max);
        const bMaxDate = new Date(bRange.max);
        
        const aInPeriod = today >= aMinDate && today <= aMaxDate;
        const bInPeriod = today >= bMinDate && today <= bMaxDate;
        
        if (aInPeriod && !bInPeriod) return -1;
        if (!aInPeriod && bInPeriod) return 1;
        
        if (aInPeriod && bInPeriod) {
            return aMinDate - bMinDate;
        }
        
        return aMinDate - bMinDate;
    });
    
    if (!showAll) {
        filteredCustomers = filteredCustomers.filter(customer => {
            const reminderRange = calculateReminderRange(customer.filterPurchaseDate, customer.customInterval);
            const today = new Date();
            const minReminderDate = new Date(reminderRange.min);
            const maxReminderDate = new Date(reminderRange.max);
            
            return today >= minReminderDate && today <= maxReminderDate;
        });
    }
    
    reminderList.innerHTML = '';
    
    if (filteredCustomers.length === 0) {
        reminderList.innerHTML = '<p>暂无客户数据</p>';
        return;
    }
    
    filteredCustomers.forEach(customer => {
        const reminderRange = calculateReminderRange(customer.filterPurchaseDate, customer.customInterval);
        const customerDiv = document.createElement('div');
        customerDiv.className = 'customer-item';
        
        const today = new Date();
        const minReminderDate = new Date(reminderRange.min);
        const maxReminderDate = new Date(reminderRange.max);
        const isInReminderPeriod = today >= minReminderDate && today <= maxReminderDate;
        
        if (isInReminderPeriod) {
            customerDiv.classList.add('reminder-active');
        }
        
        const history = customer.replacementHistory || [];
        const historyCount = history.length;
        const avgInterval = calculateAverageInterval(customer.id);
        const lastReplacement = history.length > 1 ? history.sort((a, b) => new Date(b.date) - new Date(a.date))[1] : null;

        customerDiv.innerHTML = `
            <div class="customer-header">
                <h3>${customer.name}</h3>
                <div class="customer-actions">
                    <button onclick="showEditCustomerModal(${customer.id})" class="edit-btn" style="background-color: #3498db; color: white; margin-right: 5px;">编辑</button>
                    <button onclick="showReplacementHistory(${customer.id})" class="history-btn" style="background-color: #9b59b6; color: white; margin-right: 5px;">历史记录</button>
                    <button onclick="showAddReplacementModal(${customer.id})" class="add-record-btn" style="background-color: #f39c12; color: white; margin-right: 5px;">添加记录</button>
                    <button onclick="deleteCustomer(${customer.id})" class="delete-btn" style="background-color: #e74c3c; color: white;">删除</button>
                </div>
            </div>
            <div class="customer-info">
                <p><strong>联系人:</strong> ${customer.contactPerson}</p>
                <p><strong>电话:</strong> ${customer.phoneNumber}</p>
                <p><strong>区域:</strong> ${customer.region || '未设置'}</p>
                <p><strong>滤芯购买日期:</strong> ${customer.filterPurchaseDate}</p>
                <p><strong>建议更换时间:</strong> ${reminderRange.min} - ${reminderRange.max}</p>
                <p><strong>自定义间隔:</strong> ${customer.customInterval ? customer.customInterval + '天' : '默认(60-120天)'}</p>
                <p><strong>备注:</strong> ${customer.notes || '无'}</p>
                <div class="history-summary" style="background-color: #f8f9fa; padding: 10px; margin-top: 10px; border-radius: 4px; border-left: 4px solid #9b59b6;">
                    <p><strong>📊 历史统计:</strong></p>
                    <p>• 更换次数: ${historyCount}次</p>
                    ${avgInterval ? `<p>• 平均间隔: ${avgInterval}天</p>` : '<p>• 平均间隔: 数据不足</p>'}
                    ${lastReplacement ? `<p>• 上次更换: ${lastReplacement.date}</p>` : '<p>• 上次更换: 无记录</p>'}
                </div>
            </div>
        `;
        
        reminderList.appendChild(customerDiv);
    });
}

// 删除客户
function deleteCustomer(customerId) {
    if (confirm('确定要删除这个客户吗？')) {
        const customerIndex = customers.findIndex(c => c.id === customerId);
        if (customerIndex !== -1) {
            if (currentUser.role !== 'admin' && customers[customerIndex].userId !== currentUser.id) {
                alert('您没有权限删除此客户信息');
                return;
            }
            
            customers.splice(customerIndex, 1);
            saveCustomersToStorage();
            renderReminderList();
        }
    }
}

// 显示编辑客户模态框
function showEditCustomerModal(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) {
        alert('客户不存在');
        return;
    }
    
    if (currentUser.role !== 'admin' && customer.userId !== currentUser.id) {
        alert('您没有权限编辑此客户信息');
        return;
    }
    
    currentEditingCustomerId = customerId;
    
    if (editCustomerName) editCustomerName.value = customer.name || '';
    if (editContactPerson) editContactPerson.value = customer.contactPerson || '';
    if (editPhoneNumber) editPhoneNumber.value = customer.phoneNumber || '';
    if (editRegion) editRegion.value = customer.region || '';
    if (editFilterPurchaseDate) editFilterPurchaseDate.value = customer.filterPurchaseDate || '';
    if (editCustomInterval) editCustomInterval.value = customer.customInterval || '';
    if (editNotes) editNotes.value = customer.notes || '';
    
    if (editCustomerModal) {
        editCustomerModal.style.display = 'block';
    }
    
    if (editCustomerError) {
        editCustomerError.textContent = '';
    }
}

// 关闭编辑客户模态框
function closeEditCustomerModal() {
    editCustomerModal.style.display = 'none';
    currentEditingCustomerId = null;
    editCustomerError.textContent = '';
}

// 保存编辑的客户信息
function saveEditedCustomer(e) {
    e.preventDefault();
    
    if (!currentEditingCustomerId) {
        editCustomerError.textContent = '无效的客户ID';
        return;
    }
    
    const name = editCustomerName.value.trim();
    const contactPerson = editContactPerson.value.trim();
    const phoneNumber = editPhoneNumber.value.trim();
    const region = editRegion.value.trim();
    const filterDate = editFilterPurchaseDate.value;
    const customInterval = editCustomInterval.value ? parseInt(editCustomInterval.value) : null;
    const notes = editNotes.value.trim();
    
    if (!name || !contactPerson || !phoneNumber || !filterDate) {
        editCustomerError.textContent = '请填写所有必填字段';
        return;
    }
    
    if (customInterval !== null && (isNaN(customInterval) || customInterval <= 0)) {
        editCustomerError.textContent = '请输入有效的间隔天数';
        return;
    }
    
    const customerIndex = customers.findIndex(c => c.id === currentEditingCustomerId);
    if (customerIndex !== -1) {
        if (currentUser.role !== 'admin' && customers[customerIndex].userId !== currentUser.id) {
            editCustomerError.textContent = '您没有权限编辑此客户信息';
            return;
        }
        
        customers[customerIndex].name = name;
        customers[customerIndex].contactPerson = contactPerson;
        customers[customerIndex].phoneNumber = phoneNumber;
        customers[customerIndex].region = region;
        customers[customerIndex].filterPurchaseDate = filterDate;
        customers[customerIndex].customInterval = customInterval;
        customers[customerIndex].notes = notes;
        
        saveCustomersToStorage();
        renderReminderList();
        closeEditCustomerModal();
    } else {
        editCustomerError.textContent = '客户不存在';
    }
}

// 计算平均更换间隔
function calculateAverageInterval(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer || !customer.replacementHistory || customer.replacementHistory.length < 2) {
        return null;
    }
    
    const history = customer.replacementHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
    let totalDays = 0;
    let intervals = 0;
    
    for (let i = 1; i < history.length; i++) {
        const prevDate = new Date(history[i-1].date);
        const currDate = new Date(history[i].date);
        const daysDiff = Math.floor((currDate - prevDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff > 0) {
            totalDays += daysDiff;
            intervals++;
        }
    }
    
    return intervals > 0 ? Math.round(totalDays / intervals) : null;
}

// 显示更换历史记录管理界面
function showReplacementHistory(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) {
        alert('客户不存在');
        return;
    }
    
    // 验证用户权限
    if (currentUser.role !== 'admin' && customer.userId !== currentUser.id) {
        alert('您没有权限查看此客户信息');
        return;
    }
    
    currentHistoryCustomerId = customerId;
    
    // 更新模态框标题
    const historyModalTitle = document.getElementById('historyModalTitle');
    if (historyModalTitle) {
        historyModalTitle.textContent = `${customer.name} - 历史记录管理`;
    }
    
    // 渲染历史记录列表
    renderHistoryList();
    
    // 显示模态框
    const historyModal = document.getElementById('historyManagementModal');
    if (historyModal) {
        historyModal.style.display = 'block';
    }
}

// 渲染历史记录列表
function renderHistoryList() {
    const historyListDiv = document.getElementById('historyList');
    if (!historyListDiv || !currentHistoryCustomerId) return;
    
    const customer = customers.find(c => c.id === currentHistoryCustomerId);
    if (!customer) return;
    
    const history = customer.replacementHistory || [];
    
    if (history.length === 0) {
        historyListDiv.innerHTML = '<p style="text-align: center; color: #666;">暂无更换历史记录</p>';
        return;
    }
    
    // 按日期倒序排列
    const sortedHistory = history.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    let historyHTML = `
        <div style="margin-bottom: 20px;">
            <button onclick="showAddReplacementModal(${currentHistoryCustomerId})" style="background-color: #27ae60; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;">
                + 添加新记录
            </button>
        </div>
        <div style="max-height: 400px; overflow-y: auto;">
    `;
    
    sortedHistory.forEach((record, index) => {
        historyHTML += `
            <div class="history-item" style="border: 1px solid #ddd; margin-bottom: 10px; padding: 15px; border-radius: 5px; background-color: #f9f9f9;">
                <div class="history-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h4 style="margin: 0; color: #2c3e50;">记录 #${index + 1}</h4>
                    <div class="history-actions">
                        <button onclick="editHistoryRecord(${record.id})" style="background-color: #3498db; color: white; padding: 5px 10px; border: none; border-radius: 3px; cursor: pointer; margin-right: 5px;">
                            编辑
                        </button>
                        <button onclick="deleteHistoryRecord(${record.id})" style="background-color: #e74c3c; color: white; padding: 5px 10px; border: none; border-radius: 3px; cursor: pointer;">
                            删除
                        </button>
                    </div>
                </div>
                <div class="history-details" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
                    <div><strong>更换日期:</strong> ${record.date}</div>
                    <div><strong>滤芯型号:</strong> ${record.filterModel || '未设置'}</div>
                    <div><strong>数量:</strong> ${record.quantity || 1}</div>
                    <div><strong>费用:</strong> ${record.cost ? record.cost + '元' : '未记录'}</div>
                    <div><strong>操作人:</strong> ${record.operator || '未知'}</div>
                    <div style="grid-column: 1 / -1;"><strong>备注:</strong> ${record.notes || '无'}</div>
                </div>
                <div style="margin-top: 10px; font-size: 12px; color: #666;">
                    记录时间: ${record.timestamp ? new Date(record.timestamp).toLocaleString() : '未知'}
                </div>
            </div>
        `;
    });
    
    historyHTML += '</div>';
    historyListDiv.innerHTML = historyHTML;
}

// 关闭历史记录管理模态框
function closeHistoryManagementModal() {
    const historyModal = document.getElementById('historyManagementModal');
    if (historyModal) {
        historyModal.style.display = 'none';
    }
    currentHistoryCustomerId = null;
}

// 编辑历史记录
function editHistoryRecord(recordId) {
    if (!currentHistoryCustomerId) return;
    
    const customer = customers.find(c => c.id === currentHistoryCustomerId);
    if (!customer) return;
    
    const record = customer.replacementHistory.find(r => r.id === recordId);
    if (!record) {
        alert('记录不存在');
        return;
    }
    
    // 验证用户权限
    if (currentUser.role !== 'admin' && customer.userId !== currentUser.id) {
        alert('您没有权限编辑此记录');
        return;
    }
    
    currentEditingHistoryId = recordId;
    
    // 填充编辑表单
    const editHistoryDate = document.getElementById('editHistoryDate');
    const editHistoryFilterModel = document.getElementById('editHistoryFilterModel');
    const editHistoryQuantity = document.getElementById('editHistoryQuantity');
    const editHistoryCost = document.getElementById('editHistoryCost');
    const editHistoryNotes = document.getElementById('editHistoryNotes');
    const editHistoryError = document.getElementById('editHistoryError');
    
    if (editHistoryDate) editHistoryDate.value = record.date || '';
    if (editHistoryFilterModel) editHistoryFilterModel.value = record.filterModel || '';
    if (editHistoryQuantity) editHistoryQuantity.value = record.quantity || 1;
    if (editHistoryCost) editHistoryCost.value = record.cost || '';
    if (editHistoryNotes) editHistoryNotes.value = record.notes || '';
    if (editHistoryError) editHistoryError.textContent = '';
    
    // 显示编辑模态框
    const editHistoryModal = document.getElementById('editHistoryModal');
    if (editHistoryModal) {
        editHistoryModal.style.display = 'block';
    }
}

// 保存编辑的历史记录
function saveEditedHistoryRecord() {
    if (!currentHistoryCustomerId || !currentEditingHistoryId) {
        alert('无效的记录ID');
        return;
    }
    
    const editHistoryDate = document.getElementById('editHistoryDate');
    const editHistoryFilterModel = document.getElementById('editHistoryFilterModel');
    const editHistoryQuantity = document.getElementById('editHistoryQuantity');
    const editHistoryCost = document.getElementById('editHistoryCost');
    const editHistoryNotes = document.getElementById('editHistoryNotes');
    const editHistoryError = document.getElementById('editHistoryError');
    
    const date = editHistoryDate ? editHistoryDate.value : '';
    const filterModel = editHistoryFilterModel ? editHistoryFilterModel.value.trim() : '';
    const quantity = editHistoryQuantity ? parseInt(editHistoryQuantity.value) || 1 : 1;
    const cost = editHistoryCost ? parseFloat(editHistoryCost.value) || 0 : 0;
    const notes = editHistoryNotes ? editHistoryNotes.value.trim() : '';
    
    // 验证输入
    if (!date) {
        if (editHistoryError) editHistoryError.textContent = '请选择更换日期';
        return;
    }
    
    if (!filterModel) {
        if (editHistoryError) editHistoryError.textContent = '请输入滤芯型号';
        return;
    }
    
    // 查找客户和记录
    const customerIndex = customers.findIndex(c => c.id === currentHistoryCustomerId);
    if (customerIndex === -1) {
        if (editHistoryError) editHistoryError.textContent = '客户不存在';
        return;
    }
    
    // 验证用户权限
    if (currentUser.role !== 'admin' && customers[customerIndex].userId !== currentUser.id) {
        if (editHistoryError) editHistoryError.textContent = '您没有权限编辑此记录';
        return;
    }
    
    const recordIndex = customers[customerIndex].replacementHistory.findIndex(r => r.id === currentEditingHistoryId);
    if (recordIndex === -1) {
        if (editHistoryError) editHistoryError.textContent = '记录不存在';
        return;
    }
    
    // 更新记录
    customers[customerIndex].replacementHistory[recordIndex] = {
        ...customers[customerIndex].replacementHistory[recordIndex],
        date: date,
        filterModel: filterModel,
        quantity: quantity,
        cost: cost,
        notes: notes,
        lastModified: new Date().toISOString(),
        lastModifiedBy: currentUser.username
    };
    
    // 保存数据
    saveCustomersToStorage();
    renderReminderList();
    renderHistoryList();
    closeEditHistoryModal();
    
    alert('历史记录已成功更新');
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
    if (!currentHistoryCustomerId) return;
    
    const customer = customers.find(c => c.id === currentHistoryCustomerId);
    if (!customer) return;
    
    const record = customer.replacementHistory.find(r => r.id === recordId);
    if (!record) {
        alert('记录不存在');
        return;
    }
    
    // 验证用户权限
    if (currentUser.role !== 'admin' && customer.userId !== currentUser.id) {
        alert('您没有权限删除此记录');
        return;
    }
    
    // 确认删除
    if (!confirm(`确定要删除这条更换记录吗？\n\n日期: ${record.date}\n型号: ${record.filterModel}\n费用: ${record.cost ? record.cost + '元' : '未记录'}`)) {
        return;
    }
    
    // 查找并删除记录
    const customerIndex = customers.findIndex(c => c.id === currentHistoryCustomerId);
    if (customerIndex !== -1) {
        const recordIndex = customers[customerIndex].replacementHistory.findIndex(r => r.id === recordId);
        if (recordIndex !== -1) {
            customers[customerIndex].replacementHistory.splice(recordIndex, 1);
            
            // 保存数据
            saveCustomersToStorage();
            renderReminderList();
            renderHistoryList();
            
            alert('历史记录已成功删除');
        }
    }
}

// 显示添加更换记录模态框
function showAddReplacementModal(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) {
        alert('客户不存在');
        return;
    }
    
    // 验证用户权限
    if (currentUser.role !== 'admin' && customer.userId !== currentUser.id) {
        alert('您没有权限添加此客户的更换记录');
        return;
    }
    
    currentReplacementCustomerId = customerId;
    
    // 获取模态框元素
    const modal = document.getElementById('addReplacementModal');
    const dateInput = document.getElementById('replacementDate');
    const filterModelInput = document.getElementById('replacementFilterModel');
    const quantityInput = document.getElementById('replacementQuantity');
    const costInput = document.getElementById('replacementCost');
    const notesInput = document.getElementById('replacementNotes');
    const errorDiv = document.getElementById('replacementError');
    
    // 设置默认值
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    if (filterModelInput) filterModelInput.value = '标准滤芯';
    if (quantityInput) quantityInput.value = '1';
    if (costInput) costInput.value = '';
    if (notesInput) notesInput.value = '';
    if (errorDiv) errorDiv.textContent = '';
    
    // 显示模态框
    if (modal) {
        modal.style.display = 'block';
    }
}

// 关闭添加更换记录模态框
function closeAddReplacementModal() {
    const modal = document.getElementById('addReplacementModal');
    if (modal) {
        modal.style.display = 'none';
    }
    currentReplacementCustomerId = null;
}

// 保存更换记录
function saveReplacementRecord() {
    if (!currentReplacementCustomerId) {
        alert('无效的客户ID');
        return;
    }
    
    const dateInput = document.getElementById('replacementDate');
    const filterModelInput = document.getElementById('replacementFilterModel');
    const quantityInput = document.getElementById('replacementQuantity');
    const costInput = document.getElementById('replacementCost');
    const notesInput = document.getElementById('replacementNotes');
    const errorDiv = document.getElementById('replacementError');
    
    const date = dateInput ? dateInput.value : '';
    const filterModel = filterModelInput ? filterModelInput.value.trim() : '';
    const quantity = quantityInput ? parseInt(quantityInput.value) || 1 : 1;
    const cost = costInput ? parseFloat(costInput.value) || 0 : 0;
    const notes = notesInput ? notesInput.value.trim() : '';
    
    // 验证输入
    if (!date) {
        if (errorDiv) errorDiv.textContent = '请选择更换日期';
        return;
    }
    
    if (!filterModel) {
        if (errorDiv) errorDiv.textContent = '请输入滤芯型号';
        return;
    }
    
    // 查找客户
    const customerIndex = customers.findIndex(c => c.id === currentReplacementCustomerId);
    if (customerIndex === -1) {
        if (errorDiv) errorDiv.textContent = '客户不存在';
        return;
    }
    
    // 验证用户权限
    if (currentUser.role !== 'admin' && customers[customerIndex].userId !== currentUser.id) {
        if (errorDiv) errorDiv.textContent = '您没有权限添加此客户的更换记录';
        return;
    }
    
    const customer = customers[customerIndex];
    
    // 确保有历史记录数组
    if (!customer.replacementHistory) {
        customer.replacementHistory = [];
    }
    
    // 创建新的更换记录
    const newRecord = {
        id: Date.now(),
        date: date,
        filterModel: filterModel,
        quantity: quantity,
        cost: cost,
        notes: notes,
        operator: currentUser.username,
        timestamp: new Date().toISOString()
    };
    
    // 添加记录到历史
    customer.replacementHistory.push(newRecord);
    
    // 更新客户的滤芯购买日期为最新更换日期
    customer.filterPurchaseDate = date;
    
    // 保存数据
    saveCustomersToStorage();
    renderReminderList();
    
    // 如果历史记录管理模态框是打开的，刷新列表
    if (currentHistoryCustomerId === currentReplacementCustomerId) {
        renderHistoryList();
    }
    
    closeAddReplacementModal();
    
    alert('更换记录已成功添加');
}
