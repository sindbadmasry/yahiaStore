const API_URL = "https://script.google.com/macros/s/AKfycbzYDr5aXwVmcz2rHfPNyitXtZvt1RRPAo_poZZqq9EkurFOMZdU9iArXZNT2mMW7vff/exec";

document.addEventListener('alpine:init', () => {
    Alpine.data('erpApp', () => ({
        // State
        loading: false, isLoggedIn: false, user: { username: '', role: '' },
        currentTab: 'pos', activeView: '',
        
        // Data Store
        data: { Inventory: [], Maintenance: [], Wallets: [], Sales: [], Settings: [], Users: [], Expenses: [], Customers: [] },
        
        // Modals / Panels
        showPanel: false, showCart: false, showScannerModal: false, showProductModal: false,
        isEditingProduct: false, showMaintenanceModal: false, showEditMaintenanceModal: false,
        showWalletTxModal: false, showAddExpenseModal: false, showAddUserModal: false,
        showCustomersModal: false, showAddCustomerModal: false, showDebtorsModal: false,
        editPaymentModal: false, showExpensesReportsModal: false,

        modalAddWallet: { show: false, name: '', limit: 200000 }, 
        modalUpdateCash: { show: false, amount: 0 }, 
        modalConfirm: { show: false, message: '', onConfirm: null },

        // Forms
        loginForm: { username: '', password: '' },
        checkout: { customer: '', type: 'Cash', paid: '', walletName: '', isPurchase: false, updateCashOrWallet: true },
        pForm: { Category: '', Code: '', Product_Name: '', Cost_Price: '', Selling_Price: '', Stock: 1, Min_Stock: 1, hasBox: false, hasCharger: false, hasHeadphone: false, paymentType: 'Cash', walletName: '', updateCashOrWallet: true, Details: '' },
        wTxForm: { type: 'وارد', wallet: '', amount: '', profit: '', notes: '', fromCash: false },
        mForm: { Client_Name: '', Phone_Number: '', Phone_Type: '', Issue: '', Expected_Cost: '' },
        mEditForm: { Ticket_ID: '', Status: '', Expected_Cost: '', paid: '', Cost_Price: '' },
        addUserForm: { username: '', password: '', role: 'worker' },
        addCustomerForm: { name: '', phone: '', address: '' },
        expenseForm: { description: '', amount: '', notes: '', paymentMethod: 'Cash', walletName: '', updateCashOrWallet: true },
        editPaymentForm: { saleId: '', paid: 0 },

        // Variables
        search: '', invSearch: '', posFilter: 'all', invFilter: 'all', searchWallet: '',
        mFilter: 'قيد الانتظار', customerSearch: '', 
        cart: [], shopCash: 0, debtors: [], customers: [], scanTarget: '', html5QrcodeScanner: null,
        
        filterDate: { from: '', to: '', month: '' },

        // ======== INIT & DATE FUNCTIONS ========
        init() {
            this.setTodayFilter();
            const saved = localStorage.getItem('sa7by_session');
            if (saved) { 
                try { 
                    this.user = JSON.parse(saved); 
                    this.isLoggedIn = true; 
                    this.fetchData(); 
                } catch (e) { this.logout(); } 
            }
        },
        getLocalDate() {
            const d = new Date(); return d.toLocaleDateString('en-CA');
        },
        getFirstDayOfMonth() {
            const d = new Date();
            const year = d.getFullYear(); const month = String(d.getMonth() + 1).padStart(2, '0');
            return `${year}-${month}-01`;
        },
        setTodayFilter() {
            const today = this.getLocalDate();
            this.filterDate.from = today; this.filterDate.to = today; this.filterDate.month = '';
        },
        setMonthFilter() {
            const d = new Date();
            this.filterDate.from = this.getFirstDayOfMonth();
            const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
            this.filterDate.to = lastDay.toLocaleDateString('en-CA');
            this.filterDate.month = '';
        },
        isDateInRange(dateString) {
            if (!dateString) return false;
            const dStr = new Date(dateString).toLocaleDateString('en-CA');
            return dStr >= this.filterDate.from && dStr <= this.filterDate.to;
        },
        showConfirm(message, callback) { 
            this.modalConfirm = { show: true, message: message, onConfirm: callback }; 
        },
        executeConfirm() { 
            if(this.modalConfirm.onConfirm) this.modalConfirm.onConfirm(); 
            this.modalConfirm.show = false; 
        },

        // ======== API & AUTH ========
        async callApi(action, dataObj = {}) {
            try { 
                const response = await fetch(API_URL, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, 
                    body: JSON.stringify({ action: action, data: dataObj }) 
                });
                return await response.json(); 
            } catch (error) { return { success: false, error: "فشل الاتصال." }; }
        },
        async login() {
            if (!this.loginForm.username || !this.loginForm.password) return alert("أدخل البيانات!");
            this.loading = true; 
            const res = await this.callApi('login', this.loginForm); 
            this.loading = false;
            if (res && res.success) { 
                this.user = res.user; this.isLoggedIn = true; 
                localStorage.setItem('sa7by_session', JSON.stringify(res.user)); 
                this.fetchData();
            } else { alert(res ? res.error : "خطأ في تسجيل الدخول"); }
        },
        logout() { localStorage.removeItem('sa7by_session'); location.reload(); },
        async fetchData() {
            this.loading = true; const res = await this.callApi('getAllData');
            if (res && !res.error) { 
                this.data = res; 
                const cash = (res.Settings || []).find(s => s.Key === "Shop_Cash" || s.Setting_Name === "Shop_Cash" || s[0] === "Shop_Cash");
                this.shopCash = cash ? Number(cash.Value || cash[1] || 0) : 0; 
            }
            this.loading = false;
        },

        // ======== INVENTORY & POS ========
        get inventory() { return this.data.Inventory || []; },
        get processedInventory() {
            let list = this.inventory;
            if (this.invSearch.trim() !== '') {
                const q = this.invSearch.toLowerCase().trim();
                list = list.filter(i => String(i.Product_Name || '').toLowerCase().includes(q) || String(i.Code || '').includes(q));
            }
            if (this.invFilter === 'shortages') return list.filter(i => Number(i.Stock) <= Number(i.Min_Stock || 1));
            return list;
        },
        get filteredInventoryPOS() {
            const q = this.search.toLowerCase().trim();
            return this.inventory.filter(i => {
                const matchesSearch = !q || String(i.Product_Name || '').toLowerCase().includes(q) || String(i.Code || '').includes(q);
                const category = String(i.Category || '');
                const matchesTab = this.posFilter === 'all' ? !category.includes('هاتف') : this.posFilter === 'new' ? category === 'هاتف جديد' : this.posFilter === 'used' ? category === 'هاتف مستعمل' : true;
                return matchesSearch && matchesTab;
            });
        },
        addToCart(product) {
            if (product.Stock <= 0) return alert('هذا المنتج نفد من المخزن!');
            const item = this.cart.find(c => c.code === product.Code);
            if (item) item.qty++; else this.cart.push({ code: product.Code, name: product.Product_Name, price: product.Selling_Price, qty: 1 });
            this.checkout.paid = this.cartTotal;
        },
        get cartTotal() { return this.cart.reduce((s, i) => s + (Number(i.price) * Number(i.qty)), 0); },
        async confirmSale() {
            if (!this.cart.length) return; 
            if (this.checkout.type === 'Wallet' && !this.checkout.walletName) return alert('برجاء اختيار المحفظة');
            this.loading = true;
            const saleData = { total: this.cartTotal, paid: this.checkout.paid === '' ? this.cartTotal : this.checkout.paid, customer: this.checkout.customer || 'عميل نقدي', paymentType: this.checkout.type, Payment_Type: this.checkout.type, walletName: this.checkout.walletName, Wallet_Name: this.checkout.walletName, isPurchase: false, updateCashOrWallet: this.checkout.updateCashOrWallet, items: this.cart, user: this.user.username };
            await this.callApi('processSale', saleData);
            this.cart = []; this.showCart = false; this.checkout = { customer: '', type: 'Cash', paid: '', walletName: '', isPurchase: false, updateCashOrWallet: true };
            this.fetchData();
        },
        openProductModal(cat) { 
            this.isEditingProduct = false; 
            this.pForm = { Category: cat, Code: '', Product_Name: '', Cost_Price: '', Selling_Price: '', Stock: 1, Min_Stock: 1, paymentType: 'Cash', walletName: '', updateCashOrWallet: true };
            this.showProductModal = true; 
        },
        openInventoryProduct(item) {
            this.isEditingProduct = true;
            this.pForm = { Category: item.Category || '', Code: item.Code || '', Product_Name: item.Product_Name || '', Cost_Price: item.Cost_Price || '', Selling_Price: item.Selling_Price || '', Stock: item.Stock || 0, Min_Stock: item.Min_Stock || 1, paymentType: 'Cash', walletName: '', updateCashOrWallet: false };
            this.showProductModal = true;
        },
        async saveProduct() {
            if (!this.pForm.Code || !this.pForm.Product_Name || !this.pForm.Selling_Price) return alert("أدخل البيانات الأساسية");
            this.loading = true;
            this.pForm.Total_Cost = (Number(this.pForm.Cost_Price) || 0) * (Number(this.pForm.Stock) || 1); 
            this.pForm.Payment_Type = this.pForm.paymentType; 
            this.pForm.Wallet_Name = this.pForm.walletName;
            await this.callApi('saveProduct', this.pForm); 
            this.showProductModal = false; this.fetchData();
        },
        checkExistingProduct() {
            if(!this.pForm.Code) return;
            const existing = this.inventory.find(i => i.Code === this.pForm.Code);
            if (existing) {
                this.pForm.Product_Name = existing.Product_Name || this.pForm.Product_Name; 
                this.pForm.Selling_Price = existing.Selling_Price || this.pForm.Selling_Price; 
                this.pForm.Cost_Price = existing.Cost_Price || this.pForm.Cost_Price; 
                this.pForm.Min_Stock = existing.Min_Stock || this.pForm.Min_Stock;
            }
        },

        // ======== FINANCIAL STATS & REVENUE ========
        getTodaySales() {
            const today = this.getLocalDate();
            return (this.data.Sales || []).reduce((total, sale) => {
                if (sale.Date && new Date(sale.Date).toLocaleDateString('en-CA') === today) return total + Number(sale.Total || 0);
                return total;
            }, 0);
        },
        getFilteredProfits() {
            let newPhone = 0, usedPhone = 0, general = 0, wallet = 0;
            (this.data.Wallets || []).forEach(w => { if (this.isDateInRange(w.Date)) wallet += Number(w.Profit_Margin || w.profit || 0); });
            (this.data.Sales || []).forEach(sale => {
                if (this.isDateInRange(sale.Date)) {
                    try {
                        let items = JSON.parse(sale.Items_JSON || "[]");
                        items.forEach(item => {
                            let invItem = (this.data.Inventory || []).find(i => i.Code == item.code); 
                            let cost = invItem ? Number(invItem.Cost_Price || 0) : 0;
                            let profit = (Number(item.price) - cost) * Number(item.qty);
                            if (invItem) { 
                                if (invItem.Category === 'هاتف جديد') newPhone += profit; 
                                else if (invItem.Category === 'هاتف مستعمل') usedPhone += profit;
                                else general += profit; 
                            } else general += profit;
                        }); 
                    } catch (e) { }
                } 
            }); 
            return { newPhone, usedPhone, general, wallet };
        },
        getTotalExpenses() {
            return (this.data.Expenses || []).filter(e => this.isDateInRange(e.Date)).reduce((sum, e) => sum + Number(e.Amount || 0), 0);
        },

        // ======== WALLETS & CASH ========
        get dynamicWallets() { 
            return (this.data.Settings || []).filter(s => { 
                const key = s.Key || s.Setting_Name || s[0]; return key && key.toString().startsWith("Limit_"); 
            }).map(s => { 
                const key = s.Key || s.Setting_Name || s[0]; const val = s.Value || s[1] || 0; 
                return { name: key.replace("Limit_", ""), limit: Number(val) }; 
            });
        },
        calcWallet(name) { 
            const txs = (this.data.Wallets || []).filter(w => String(w.Wallet_Name || "").trim() === String(name).trim()); 
            let incoming = 0, outgoing = 0;
            txs.forEach(t => { 
                const amt = Number(t.Amount || 0); 
                if (String(t.Type || "").trim() === 'وارد') incoming += amt; else if (String(t.Type || "").trim() === 'صادر') outgoing += amt; 
            });
            return { incoming, outgoing, balance: incoming - outgoing }; 
        },
        calcWalletFiltered(name) { 
            const txs = (this.data.Wallets || []).filter(w => String(w.Wallet_Name || "").trim() === String(name).trim() && this.isDateInRange(w.Date));
            let incoming = 0, outgoing = 0; 
            txs.forEach(t => { 
                const amt = Number(t.Amount || 0); 
                if (String(t.Type || "").trim() === 'وارد') incoming += amt; else if (String(t.Type || "").trim() === 'صادر') outgoing += amt; 
            });
            return { incoming, outgoing }; 
        },
        getTotalWalletBalance() { 
            let total = 0; this.dynamicWallets.forEach(w => { total += this.calcWallet(w.name).balance; }); return total; 
        },
        get filteredWallets() {
            const q = this.searchWallet.toLowerCase(); 
            if (!q) return this.dynamicWallets;
            return this.dynamicWallets.filter(w => String(w.name || '').toLowerCase().includes(q));
        },
        openWalletTxModal(type) { 
            this.wTxForm = { type: type, wallet: '', amount: '', profit: '', notes: '', fromCash: false };
            this.showWalletTxModal = true; 
        },
        async submitWalletTx() { 
            if (!this.wTxForm.wallet || !this.wTxForm.amount) return alert("الرجاء اختيار المحفظة وكتابة المبلغ"); 
            this.loading = true; 
            await this.callApi('saveWalletTransaction', { wallet: this.wTxForm.wallet, type: this.wTxForm.type, amount: Number(this.wTxForm.amount), notes: this.wTxForm.notes, user: this.user.username, profit: Number(this.wTxForm.profit || 0), fromCash: this.wTxForm.fromCash });
            this.showWalletTxModal = false; this.fetchData(); 
        },
        addNewWallet() { this.modalAddWallet = { show: true, name: '', limit: 50000 }; },
        async submitNewWallet() { 
            if(!this.modalAddWallet.name) return; 
            this.modalAddWallet.show = false; this.loading = true; 
            await this.callApi('saveWalletConfig', { name: this.modalAddWallet.name, limit: this.modalAddWallet.limit }); this.fetchData();
        },
        async deleteWallet(name) { 
            this.showConfirm('متأكد من حذف محفظة ' + name + ' بالكامل؟', async () => { 
                this.loading = true; await this.callApi('deleteWallet', { name: name }); this.fetchData(); 
            });
        },
        updateShopCash() { this.modalUpdateCash = { show: true, amount: this.shopCash }; },
        async submitUpdateCash() { 
            this.modalUpdateCash.show = false; this.loading = true; 
            await this.callApi('setShopCash', { amount: Number(this.modalUpdateCash.amount) }); this.fetchData(); 
        },

        // ======== DEBTORS & CUSTOMERS ========
        getTotalDebts() { 
            return (this.data.Sales || []).reduce((total, sale) => {
                if (this.isDateInRange(sale.Date) && sale.Payment_Type === 'Credit') return total + (Number(sale.Total || 0) - Number(sale.Paid || 0));
                return total;
            }, 0); 
        },
        showDebtors() { 
            const debts = {}; 
            (this.data.Sales || []).forEach(sale => { 
                if (sale.Payment_Type === 'Credit') { 
                    const customer = sale.Customer || 'عميل نقدي'; const debt = Number(sale.Total || 0) - Number(sale.Paid || 0); 
                    if (debt > 0) debts[customer] = (debts[customer] || 0) + debt; 
                } 
            });
            this.debtors = Object.keys(debts).map(name => ({ name, totalDebt: debts[name] })); 
            this.showDebtorsModal = true; 
        },
        get filteredCustomers() {
            if (!this.customerSearch || this.customerSearch.length < 2) return []; 
            const search = this.customerSearch.toLowerCase(); const customers = new Set();
            (this.data.Sales || []).forEach(sale => { if (sale.Customer && sale.Customer.toLowerCase().includes(search)) customers.add(sale.Customer); });
            (this.data.Customers || []).forEach(customer => { if (customer.Name && customer.Name.toLowerCase().includes(search)) customers.add(customer.Name); });
            return Array.from(customers).filter(name => name.toLowerCase().includes(search));
        },
        showCustomers() { 
            this.customers = (this.data.Customers || []).map(customer => { 
                const customerSales = (this.data.Sales || []).filter(sale => sale.Customer === customer.Name); 
                const totalDebt = customerSales.filter(sale => sale.Payment_Type === 'Credit').reduce((sum, sale) => sum + (Number(sale.Total || 0) - Number(sale.Paid || 0)), 0); 
                return { ...customer, totalDebt }; 
            });
            this.showCustomersModal = true; 
        },
        openAddCustomerModal() { this.addCustomerForm = { name: '', phone: '', address: '' }; this.showAddCustomerModal = true; },
        async addNewCustomer() { 
            if (!this.addCustomerForm.name) return alert("أدخل اسم العميل"); 
            this.loading = true; await this.callApi('addCustomer', this.addCustomerForm); 
            this.showAddCustomerModal = false; this.fetchData(); 
        },
        async updateSalePayment() { 
            this.loading = true; await this.callApi('updateSalePayment', this.editPaymentForm); 
            this.editPaymentModal = false; this.fetchData(); 
        },

        // ======== MAINTENANCE ========
        get filteredMaintenance() {
            if (!this.data.Maintenance) return [];
            return this.data.Maintenance.filter(m => String(m.Status || '').trim() === this.mFilter).reverse();
        },
        getMClass(status) { 
            status = String(status).trim(); 
            if (status === 'قيد الانتظار') return 'm-pending'; if (status === 'تم التصليح') return 'm-repaired';
            if (status === 'تم التسليم') return 'm-delivered'; return 'm-rejected'; 
        },
        getFilteredMaintStats() {
            let totalPaid = 0, totalCost = 0;
            (this.data.Maintenance || []).forEach(m => { 
                if (m.Status === 'تم التسليم' && this.isDateInRange(m.Date)) { 
                    totalPaid += Number(m.paid || m.Paid || 0); totalCost += Number(m.Cost_Price || 0); 
                } 
            });
            return { totalPaid, totalCost, netProfit: totalPaid - totalCost };
        },
        openMaintenanceModal() { this.mForm = { Client_Name: '', Phone_Number: '', Phone_Type: '', Issue: '', Expected_Cost: '' }; this.showMaintenanceModal = true; },
        async saveNewMaintenance() { 
            this.loading = true; 
            await this.callApi('saveMaintenance', { Ticket_ID: "T-" + Date.now().toString().slice(-6), Status: 'قيد الانتظار', Client_Name: this.mForm.Client_Name || "بدون اسم", Phone_Number: this.mForm.Phone_Number || "", Phone_Type: this.mForm.Phone_Type || "غير محدد", Issue: this.mForm.Issue || "غير محدد", Expected_Cost: this.mForm.Expected_Cost || 0, paid: 0, Cost_Price: 0, User: this.user.username });
            this.showMaintenanceModal = false; this.fetchData(); 
        },
        openEditMaintenanceModal(m) { 
            this.mEditForm = { Ticket_ID: m.Ticket_ID, Status: m.Status || 'قيد الانتظار', Expected_Cost: m.Expected_Cost || 0, paid: m.paid || m.Paid || 0, Cost_Price: m.Cost_Price || 0 }; 
            this.showEditMaintenanceModal = true; 
        },
        async submitEditMaintenance() { 
            this.loading = true; 
            await this.callApi('updateMaintenance', { Ticket_ID: this.mEditForm.Ticket_ID, Status: this.mEditForm.Status, Expected_Cost: this.mEditForm.Expected_Cost || 0, paid: this.mEditForm.paid || 0, Cost_Price: this.mEditForm.Cost_Price || 0 });
            this.showEditMaintenanceModal = false; this.fetchData(); 
        },

        // ======== EXPENSES & USERS ========
        openAddExpenseModal() {
            this.expenseForm = { description: '', amount: '', notes: '', paymentMethod: 'Cash', walletName: '', updateCashOrWallet: true };
            this.showAddExpenseModal = true;
        },
        async submitExpense() {
            if(!this.expenseForm.description || !this.expenseForm.amount) return alert("يرجى إدخال بيان المصروف والمبلغ.");
            this.loading = true;
            await this.callApi('saveExpense', { ...this.expenseForm, user: this.user.username });
            this.showAddExpenseModal = false; this.fetchData();
        },
        openAddUserModal() { this.addUserForm = { username: '', password: '', role: 'worker' }; this.showAddUserModal = true; },
        async addNewUser() { 
            if (!this.addUserForm.username || !this.addUserForm.password) return alert("أدخل اسم المستخدم"); 
            this.loading = true; await this.callApi('addUser', this.addUserForm);
            this.showAddUserModal = false; this.fetchData(); 
        },

        // ======== QR SCANNER ========
        openScanner(target) {
            this.scanTarget = target; this.showScannerModal = true;
            this.$nextTick(() => {
                this.html5QrcodeScanner = new Html5Qrcode("reader");
                this.html5QrcodeScanner.start(
                    { facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } },
                    (decodedText) => { 
                        if(this.scanTarget === 'pos') this.search = decodedText; 
                        else if(this.scanTarget === 'invSearch') this.invSearch = decodedText;
                        else if(this.scanTarget === 'pForm.Code') { this.pForm.Code = decodedText; this.checkExistingProduct(); }
                        this.closeScanner(); 
                    },
                    (errorMessage) => { }
                ).catch(err => { alert("يرجى إعطاء صلاحية الكاميرا للمتصفح."); this.closeScanner(); });
            });
        },
        closeScanner() {
            if (this.html5QrcodeScanner) { this.html5QrcodeScanner.stop().then(() => { this.html5QrcodeScanner.clear(); }).catch(err => console.log(err)); }
            this.showScannerModal = false;
        }
    }));
});
