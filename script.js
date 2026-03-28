// فاصلة منقوطة للحماية
;

// !! هام جداً: ضع رابط تطبيق Google Apps Script الخاص بك هنا !!
const SCRIPT_URL = "ضع_رابط_الـ_Web_App_هنا"; 

document.addEventListener('alpine:init', () => {
    Alpine.data('erpApp', () => ({
        // ==========================================
        // 1. حالة النظام (State)
        // ==========================================
        loading: false,
        isLoggedIn: false,
        user: { username: '', role: '' },
        
        // التبويبات والواجهات
        currentTab: 'home',
        activeView: '',
        
        // الفلاتر والبحث
        posFilter: 'new',
        search: '',
        invSearch: '',
        invFilter: 'all',
        mFilter: 'قيد الانتظار',
        searchWallet: '',
        filterDate: { from: '', to: '' },
        customerSearch: '',

        // النوافذ المنبثقة (Modals)
        showPanel: false, showDebtorsModal: false, editPaymentModal: false,
        showWalletTxModal: false, showEditMaintenanceModal: false,
        showAddExpenseModal: false, showAddUserModal: false,
        showScannerModal: false, showCart: false, showProductModal: false,
        showCustomersModal: false, showAddCustomerModal: false,
        showMaintenanceModal: false, showExpensesReportsModal: false,

        // النماذج (Forms)
        loginForm: { username: '', password: '' },
        checkout: { customer: '', type: 'Cash', paid: 0, walletName: '' },
        pForm: {}, isEditingProduct: false,
        mForm: { Client_Name: '', Phone_Number: '', Phone_Type: '', Issue: '', Expected_Cost: 0 },
        mEditForm: {},
        expenseForm: { description: '', amount: 0, notes: '', paymentMethod: 'Cash', walletName: '' },
        wTxForm: { type: 'وارد', wallet: '', amount: 0, notes: '' },
        modalAddWallet: { show: false, name: '', limit: 0 },
        modalUpdateCash: { show: false, amount: 0 },
        addUserForm: { username: '', password: '', role: 'worker' },
        addCustomerForm: { name: '', phone: '' },
        editPaymentForm: { paid: 0, saleId: '' },
        modalConfirm: { show: false, message: '', action: null },

        // البيانات الآتية من السيرفر
        inventory: [], sales: [], maintenance: [], wallets: [],
        expenses: [], customers: [], users: [], settings: [],
        
        // بيانات محلية
        cart: [],
        shopCash: 0,
        debtors: [],
        html5QrcodeScanner: null,

        // ==========================================
        // 2. التهيئة (Initialization)
        // ==========================================
        init() {
            const savedUser = localStorage.getItem('2m_user');
            if (savedUser) {
                this.user = JSON.parse(savedUser);
                this.isLoggedIn = true;
                this.fetchData();
            }
            this.setTodayFilter();
        },

        // ==========================================
        // 3. الاتصال بالسيرفر (API Integration)
        // ==========================================
        async apiCall(action, data = {}) {
            if (!SCRIPT_URL || SCRIPT_URL === "ضع_رابط_الـ_Web_App_هنا") {
                alert("يرجى إضافة رابط الـ Web App في ملف script.js");
                return null;
            }
            
            this.loading = true;
            try {
                const response = await fetch(SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: action, data: data }),
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' }
                });
                const result = await response.json();
                if (!result.success) throw new Error(result.error);
                return result;
            } catch (error) {
                alert('حدث خطأ: ' + error.message);
                console.error(error);
                return null;
            } finally {
                this.loading = false;
            }
        },

        async login() {
            if (!this.loginForm.username || !this.loginForm.password) return alert("أدخل البيانات");
            const res = await this.apiCall('login', this.loginForm);
            if (res && res.user) {
                this.user = res.user;
                this.isLoggedIn = true;
                localStorage.setItem('2m_user', JSON.stringify(this.user));
                this.fetchData();
            }
        },

        logout() {
            this.isLoggedIn = false;
            this.user = { username: '', role: '' };
            localStorage.removeItem('2m_user');
            this.currentTab = 'home';
        },

        async fetchData() {
            const res = await this.apiCall('getAllData');
            if (res) {
                this.inventory = res.Inventory || [];
                this.sales = res.Sales || [];
                this.maintenance = res.Maintenance || [];
                this.wallets = res.Wallets || [];
                this.expenses = res.Expenses || [];
                this.customers = res.Customers || [];
                this.users = res.Users || [];
                this.settings = res.Settings || [];
                
                const cashSetting = this.settings.find(s => s.Key === 'Shop_Cash');
                this.shopCash = cashSetting ? Number(cashSetting.Value) : 0;
                
                this.calculateDebtors();
            }
        },

        // ==========================================
        // 4. الدوال الحسابية (Getters)
        // ==========================================
        get cartTotal() {
            return this.cart.reduce((sum, item) => sum + (Number(item.price) * Number(item.qty)), 0);
        },

        getTotalWalletBalance() {
            return this.dynamicWallets.reduce((sum, w) => sum + this.calcWallet(w.name).balance, 0);
        },

        getTodaySales() {
            const today = this.getTodayString();
            return this.sales
                .filter(s => s.Date === today)
                .reduce((sum, s) => sum + Number(s.Total || 0), 0);
        },

        getTotalDebts() {
            return this.debtors.reduce((sum, d) => sum + Number(d.totalDebt), 0);
        },

        get filteredInventoryPOS() {
            let items = this.inventory;
            if (this.search) {
                items = items.filter(i => String(i.Product_Name).includes(this.search) || String(i.Code).includes(this.search));
            }
            if (this.posFilter === 'new') return items.filter(i => String(i.Category).includes('جديد'));
            if (this.posFilter === 'used') return items.filter(i => String(i.Category).includes('مستعمل'));
            return items.filter(i => !String(i.Category).includes('جديد') && !String(i.Category).includes('مستعمل'));
        },

        get processedInventory() {
            let items = this.inventory;
            if (this.invSearch) {
                const s = this.invSearch.toLowerCase();
                items = items.filter(i => String(i.Product_Name).toLowerCase().includes(s) || String(i.Code).toLowerCase().includes(s));
            }
            if (this.invFilter === 'shortages') items = items.filter(i => Number(i.Stock) <= Number(i.Min_Stock || 1));
            return items;
        },

        get filteredMaintenance() {
            return this.maintenance.filter(m => m.Status === this.mFilter).reverse();
        },

        get dynamicWallets() {
            const walletNames = [...new Set(this.wallets.map(w => w.Wallet_Name).filter(n => n))];
            return walletNames.map(name => {
                const limitSetting = this.settings.find(s => s.Key === 'Limit_' + name);
                return { name: name, limit: limitSetting ? Number(limitSetting.Value) : 0 };
            });
        },

        // الدالة التي تسببت في الخطأ (تم إضافتها الآن)
        get filteredWallets() {
            if (!this.searchWallet) return this.dynamicWallets;
            return this.dynamicWallets.filter(w => String(w.name).includes(this.searchWallet));
        },

        get filteredCustomers() {
            if (!this.customerSearch) return [];
            return this.customers.filter(c => String(c.Name).includes(this.customerSearch)).map(c => c.Name);
        },

        calcWallet(name) {
            let incoming = 0, outgoing = 0;
            this.wallets.filter(w => w.Wallet_Name === name).forEach(w => {
                if (w.Type === 'وارد') incoming += Number(w.Amount || 0);
                if (w.Type === 'صادر') outgoing += Number(w.Amount || 0);
            });
            return { incoming, outgoing, balance: incoming - outgoing };
        },

        calcWalletFiltered(name) {
            let incoming = 0, outgoing = 0;
            this.wallets.filter(w => w.Wallet_Name === name && this.isDateInRange(w.Date)).forEach(w => {
                if (w.Type === 'وارد') incoming += Number(w.Amount || 0);
                if (w.Type === 'صادر') outgoing += Number(w.Amount || 0);
            });
            return { incoming, outgoing };
        },

        // ==========================================
        // 5. العمليات والمبيعات (Operations)
        // ==========================================
        addToCart(item) {
            if (Number(item.Stock) <= 0) return alert("هذا المنتج نفد من المخزن");
            const existing = this.cart.find(c => c.code === item.Code);
            if (existing) {
                if (existing.qty >= item.Stock) return alert("الكمية المتاحة لا تكفي");
                existing.qty++;
            } else {
                this.cart.push({ code: item.Code, name: item.Product_Name, price: item.Selling_Price, cost: item.Cost_Price, qty: 1, category: item.Category });
            }
        },

        async confirmSale() {
            if (this.cart.length === 0) return alert("السلة فارغة");
            if (this.checkout.type === 'Wallet' && !this.checkout.walletName) return alert("اختر المحفظة");
            
            const total = this.cartTotal;
            const paid = Number(this.checkout.paid);
            if (this.checkout.type === 'Credit' && paid >= total) this.checkout.type = 'Cash';

            const payload = {
                total: total, paid: paid, customer: this.checkout.customer || 'عميل نقدي',
                paymentType: this.checkout.type, walletName: this.checkout.walletName,
                items: this.cart, user: this.user.username, updateCashOrWallet: true
            };

            const res = await this.apiCall('processSale', payload);
            if (res) {
                alert("تمت عملية البيع بنجاح!");
                this.cart = []; this.showCart = false;
                this.checkout = { customer: '', type: 'Cash', paid: 0, walletName: '' };
                this.fetchData();
            }
        },

        async updateSalePayment() {
            if(!this.editPaymentForm.paid || !this.editPaymentForm.saleId) return;
            const res = await this.apiCall('updateSalePayment', this.editPaymentForm);
            if(res) {
                alert("تم تحصيل المبلغ");
                this.editPaymentModal = false;
                this.fetchData();
            }
        },

        // ==========================================
        // 6. إدارة النظام (Management & Helpers)
        // ==========================================
        getMClass(status) {
            switch(status) {
                case 'قيد الانتظار': return 'border-l-4 border-amber-500';
                case 'تم التصليح': return 'border-l-4 border-blue-500';
                case 'تم التسليم': return 'border-l-4 border-emerald-500 opacity-70';
                case 'مرفوض': return 'border-l-4 border-rose-500 opacity-70';
                default: return 'border-l-4 border-slate-300';
            }
        },

        setTodayFilter() {
            const today = this.getTodayString();
            this.filterDate = { from: today, to: today };
        },

        setMonthFilter() {
            const date = new Date();
            this.filterDate = { from: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`, to: this.getTodayString() };
        },

        getTodayString() {
            const date = new Date();
            return (new Date(date.getTime() - date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        },

        isDateInRange(dateStr) {
            if (!this.filterDate.from && !this.filterDate.to) return true;
            const d = new Date(dateStr);
            const from = this.filterDate.from ? new Date(this.filterDate.from) : new Date('2000-01-01');
            const to = this.filterDate.to ? new Date(this.filterDate.to) : new Date('2100-01-01');
            return d >= from && d <= to;
        },

        calculateDebtors() {
            const debts = {};
            this.sales.forEach(s => {
                if (s.Payment_Type === 'Credit') {
                    const debt = Number(s.Total) - Number(s.Paid);
                    if (debt > 0) {
                        const cust = s.Customer || 'غير محدد';
                        debts[cust] = (debts[cust] || 0) + debt;
                    }
                }
            });
            this.debtors = Object.keys(debts).map(k => ({ name: k, totalDebt: debts[k] }));
        },

        showDebtors() { this.calculateDebtors(); this.showDebtorsModal = true; },
        
        showCustomers() {
            this.calculateDebtors();
            this.customers = this.customers.map(c => {
                const debtObj = this.debtors.find(d => d.name === c.Name);
                return { ...c, totalDebt: debtObj ? debtObj.totalDebt : 0 };
            });
            this.showCustomersModal = true;
        },

        openAddCustomerModal() {
            this.addCustomerForm = { name: '', phone: '' };
            this.showAddCustomerModal = true;
        },

        async addNewCustomer() {
            if(!this.addCustomerForm.name) return alert("أدخل اسم العميل");
            const res = await this.apiCall('addCustomer', this.addCustomerForm);
            if(res) {
                alert("تم إضافة العميل بنجاح");
                this.showAddCustomerModal = false;
                this.fetchData();
            }
        },

        // ==========================================
        // 7. المنتجات والمخزن (Products & Inventory)
        // ==========================================
        openProductModal(category) {
            this.isEditingProduct = false;
            this.pForm = { Code: '', Product_Name: '', Category: category, Cost_Price: '', Selling_Price: '', Stock: 1, Min_Stock: 1 };
            this.showProductModal = true;
        },

        openInventoryProduct(item) {
            this.isEditingProduct = true;
            this.pForm = JSON.parse(JSON.stringify(item));
            this.showProductModal = true;
        },

        checkExistingProduct() {
            if (!this.pForm.Code) return;
            const existing = this.inventory.find(i => String(i.Code) === String(this.pForm.Code));
            if (existing && !this.isEditingProduct) {
                if (confirm('المنتج موجود بالفعل! هل تريد تعديله بدلاً من إضافته؟')) {
                    this.isEditingProduct = true;
                    this.pForm = JSON.parse(JSON.stringify(existing));
                }
            }
        },

        async saveProduct() {
            if (!this.pForm.Product_Name || !this.pForm.Code || !this.pForm.Selling_Price) return alert("يرجى إكمال البيانات الأساسية");
            if (!this.isEditingProduct) {
                const totalCost = Number(this.pForm.Cost_Price || 0) * Number(this.pForm.Stock || 1);
                if (totalCost > 0) {
                    const payMethod = prompt(`إجمالي التكلفة: ${totalCost} ج.\nاكتب 'كاش' للدفع من الدرج، أو اكتب اسم المحفظة للدفع منها:`, "كاش");
                    if (payMethod === null) return;
                    this.pForm.updateCashOrWallet = true;
                    if (payMethod === 'كاش') this.pForm.paymentType = 'Cash';
                    else { this.pForm.paymentType = 'Wallet'; this.pForm.walletName = payMethod; }
                }
            }
            this.pForm.User = this.user.username;
            const res = await this.apiCall('saveProduct', this.pForm);
            if (res) { alert("تم الحفظ بنجاح"); this.showProductModal = false; this.fetchData(); }
        },

        // ==========================================
        // 8. الصيانة والمستخدمين (Maintenance & Users)
        // ==========================================
        openMaintenanceModal() {
            this.mForm = { Client_Name: '', Phone_Number: '', Phone_Type: '', Issue: '', Expected_Cost: '' };
            this.showMaintenanceModal = true;
        },

        async saveNewMaintenance() {
            if (!this.mForm.Phone_Type || !this.mForm.Issue) return alert("أدخل نوع الجهاز والعطل");
            this.mForm.User = this.user.username;
            const res = await this.apiCall('saveMaintenance', this.mForm);
            if (res) { alert("تم فتح تذكرة الصيانة"); this.showMaintenanceModal = false; this.fetchData(); }
        },

        openEditMaintenanceModal(m) { this.mEditForm = JSON.parse(JSON.stringify(m)); this.showEditMaintenanceModal = true; },

        async submitEditMaintenance() {
            const res = await this.apiCall('updateMaintenance', this.mEditForm);
            if (res) { alert("تم التحديث"); this.showEditMaintenanceModal = false; this.fetchData(); }
        },

        openAddUserModal() {
            this.addUserForm = { username: '', password: '', role: 'worker' };
            this.showAddUserModal = true;
        },

        async addNewUser() {
            if(!this.addUserForm.username || !this.addUserForm.password) return alert("أكمل البيانات");
            const res = await this.apiCall('addUser', this.addUserForm);
            if(res) { alert("تمت إضافة المستخدم"); this.showAddUserModal = false; this.fetchData(); }
        },

        // ==========================================
        // 9. المحافظ والمصروفات (Wallets & Expenses)
        // ==========================================
        updateShopCash() { this.modalUpdateCash.amount = this.shopCash; this.modalUpdateCash.show = true; },

        async submitUpdateCash() {
            const res = await this.apiCall('setShopCash', { amount: Number(this.modalUpdateCash.amount) });
            if (res) { this.modalUpdateCash.show = false; this.fetchData(); }
        },

        openWalletTxModal(type) { this.wTxForm = { type: type, wallet: '', amount: '', notes: '' }; this.showWalletTxModal = true; },

        async submitWalletTx() {
            if (!this.wTxForm.wallet || !this.wTxForm.amount) return alert("أكمل البيانات");
            this.wTxForm.user = this.user.username; this.wTxForm.fromCash = true;
            const res = await this.apiCall('saveWalletTransaction', this.wTxForm);
            if (res) { alert("تم التنفيذ"); this.showWalletTxModal = false; this.fetchData(); }
        },

        addNewWallet() { this.modalAddWallet = { show: true, name: '', limit: '' }; },

        async submitNewWallet() {
            if(!this.modalAddWallet.name) return alert("أدخل اسم المحفظة");
            const res = await this.apiCall('saveWalletConfig', { name: this.modalAddWallet.name, limit: this.modalAddWallet.limit || 0 });
            if(res) { this.modalAddWallet.show = false; this.fetchData(); }
        },

        async deleteWallet(name) {
            if(confirm(`هل أنت متأكد من حذف محفظة ${name}؟`)) {
                const res = await this.apiCall('deleteWallet', { name });
                if(res) { alert("تم الحذف"); this.fetchData(); }
            }
        },

        openAddExpenseModal() {
            this.expenseForm = { description: '', amount: '', notes: '', paymentMethod: 'Cash', walletName: '' };
            this.showAddExpenseModal = true;
        },

        async submitExpense() {
            if (!this.expenseForm.description || !this.expenseForm.amount) return alert("البيانات ناقصة");
            this.expenseForm.user = this.user.username; this.expenseForm.updateCashOrWallet = true;
            const res = await this.apiCall('saveExpense', this.expenseForm);
            if (res) { alert("تم التسجيل"); this.showAddExpenseModal = false; this.fetchData(); }
        },

        executeConfirm() {
            if(typeof this.modalConfirm.action === 'function') this.modalConfirm.action();
            this.modalConfirm.show = false;
        },

        // ==========================================
        // 10. التقارير (Reports)
        // ==========================================
        getFilteredProfits() {
            let p = { newPhone: 0, usedPhone: 0, wallet: 0, general: 0 };
            this.sales.filter(s => this.isDateInRange(s.Date)).forEach(s => {
                try {
                    JSON.parse(s.Items_JSON || '[]').forEach(item => {
                        const profit = (Number(item.price) - Number(item.cost)) * Number(item.qty);
                        if (String(item.category).includes('جديد')) p.newPhone += profit;
                        else if (String(item.category).includes('مستعمل')) p.usedPhone += profit;
                        else p.general += profit;
                    });
                } catch(e) {}
            });
            this.wallets.filter(w => this.isDateInRange(w.Date) && w.Type === 'وارد').forEach(w => p.wallet += Number(w.Profit_Margin || 0));
            return p;
        },

        getFilteredMaintStats() {
            let revenue = 0, costs = 0;
            this.maintenance.filter(m => this.isDateInRange(m.Date) && m.Status === 'تم التسليم').forEach(m => {
                revenue += Number(m.paid || 0); costs += Number(m.Cost_Price || 0);
            });
            return { revenue, costs, netProfit: revenue - costs };
        },

        getTotalExpenses() {
            return this.expenses.filter(e => this.isDateInRange(e.Date)).reduce((sum, e) => sum + Number(e.Amount || 0), 0);
        },

        // ==========================================
        // 11. الماسح الضوئي (QR Scanner)
        // ==========================================
        openScanner(targetModel) {
            this.showScannerModal = true;
            setTimeout(() => {
                if (!this.html5QrcodeScanner) {
                    this.html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 250} }, false);
                }
                this.html5QrcodeScanner.render((decodedText) => {
                    if (targetModel === 'pos') {
                        this.search = decodedText;
                        const item = this.inventory.find(i => String(i.Code) === decodedText);
                        if(item) this.addToCart(item);
                    } else if (targetModel === 'invSearch') {
                        this.invSearch = decodedText;
                    } else if (targetModel === 'pForm.Code') {
                        this.pForm.Code = decodedText;
                        this.checkExistingProduct();
                    }
                    this.closeScanner();
                }, () => {});
            }, 300);
        },

        closeScanner() {
            this.showScannerModal = false;
            if (this.html5QrcodeScanner) this.html5QrcodeScanner.clear().catch(e => console.error("Scanner clear error", e));
        }
    }))
})
