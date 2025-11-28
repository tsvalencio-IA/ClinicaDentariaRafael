// ==================================================================
// MÓDULO CORE: Gerencia Estado Global, Banco de Dados e Rotas
// ==================================================================
(function() {
    // 1. ESTADO GLOBAL
    window.DentistaApp = {
        db: null, auth: null, currentUser: null, currentView: 'dashboard',
        data: { patients: [], receivables: [], stock: [], expenses: [] },
        utils: {
            formatCurrency: v => 'R$ ' + parseFloat(v||0).toFixed(2).replace('.', ','),
            formatDate: d => d ? new Date(d).toLocaleDateString('pt-BR') : '-',
            formatDateTime: d => d ? new Date(d).toLocaleString('pt-BR') : '-',
            getAdminPath: (uid, path) => `artifacts/${window.AppConfig.APP_ID}/users/${uid}/${path}`,
            
            openModal: (title, html, maxW) => {
                const m = document.getElementById('app-modal');
                const content = m.querySelector('.modal-content');
                content.className = `modal-content bg-white rounded-xl shadow-2xl flex flex-col max-h-[90vh] w-full ${maxW || 'max-w-md'}`;
                document.getElementById('modal-title').textContent = title;
                document.getElementById('modal-body').innerHTML = html;
                m.classList.remove('hidden'); m.classList.add('flex');
            },
            closeModal: () => { 
                const m = document.getElementById('app-modal');
                m.classList.add('hidden'); m.classList.remove('flex');
            }
        }
    };

    const App = window.DentistaApp;
    let isLoginMode = true;

    function init() {
        if (!firebase.apps.length) firebase.initializeApp(window.AppConfig.firebaseConfig);
        App.db = firebase.database();
        App.auth = firebase.auth();
        setupAuth();
        setupUIListeners();
    }

    // 2. AUTENTICAÇÃO
    function setupAuth() {
        App.auth.onAuthStateChanged(user => {
            if (user) {
                const ref = App.db.ref(App.utils.getAdminPath(user.uid, 'profile'));
                ref.once('value').then(s => {
                    const p = s.val();
                    if ((p && p.role === 'dentist') || !p) {
                        App.currentUser = { uid: user.uid, email: user.email };
                        if (!p) ref.set({ email: user.email, role: 'dentist', registeredAt: new Date().toISOString() });
                        
                        startDataListeners();
                        showAppInterface();
                    } else { 
                        alert("Acesso negado. Apenas dentistas."); App.auth.signOut(); 
                    }
                });
            } else { App.currentUser = null; showLoginInterface(); }
        });
    }

    // 3. LISTENERS DADOS
    function startDataListeners() {
        if (!App.currentUser || !App.currentUser.uid) return;

        const uid = App.currentUser.uid;
        const maps = { 
            'patients': 'patients', 
            'stock': 'stock', 
            'finance/receivable': 'receivables', 
            'finance/expenses': 'expenses' 
        };
        
        Object.keys(maps).forEach(path => {
            App.db.ref(App.utils.getAdminPath(uid, path)).on('value', s => {
                App.data[maps[path]] = [];
                if(s.exists()) {
                    s.forEach(c => { 
                        let item = c.val(); 
                        item.id = c.key; 
                        App.data[maps[path]].push(item); 
                    });
                }
                refreshCurrentView();
            });
        });
    }

    // 4. NAVEGAÇÃO
    function refreshCurrentView() {
        if (App.currentView === 'dashboard') renderDashboard();
        else if (App.currentView === 'patients' && window.renderPatientManager) window.renderPatientManager();
        else if (App.currentView === 'financials' && window.initFinanceView) window.initFinanceView();
    }

    function renderDashboard() {
        if (!App.currentUser || !App.currentUser.uid) return;

        // CÁLCULO DE SALDO: (Receitas Pagas) - (Despesas Pagas)
        const totalRec = App.data.receivables.reduce((acc, r) => r.status === 'Recebido' ? acc + parseFloat(r.amount||0) : acc, 0);
        const totalExp = App.data.expenses.reduce((acc, e) => e.status === 'Pago' ? acc + parseFloat(e.amount||0) : acc, 0);
        const balance = totalRec - totalExp;
        
        // Define a cor do saldo
        const balanceColor = balance >= 0 ? 'text-green-800' : 'text-red-600';
        const balanceBg = balance >= 0 ? 'bg-green-100' : 'bg-red-100';

        document.getElementById('main-content').innerHTML = `
            <div class="p-4 md:p-8 overflow-y-auto h-full">
                <div class="bg-white shadow-xl rounded-2xl border border-indigo-100 animate-fade-in p-6">
                    <h2 class="text-2xl md:text-3xl font-bold text-indigo-800 mb-6">Dashboard Geral</h2>
                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
                        <div class="p-4 bg-indigo-100 rounded-lg"><p class="font-bold text-[10px] md:text-xs uppercase text-indigo-600">Pacientes</p><h3 class="text-xl md:text-3xl font-bold text-indigo-900">${App.data.patients.length}</h3></div>
                        <div class="p-4 bg-blue-100 rounded-lg"><p class="font-bold text-[10px] md:text-xs uppercase text-blue-600">Estoque</p><h3 class="text-xl md:text-3xl font-bold text-blue-900">${App.data.stock.length}</h3></div>
                        
                        <div class="p-4 ${balanceBg} rounded-lg">
                            <p class="font-bold text-[10px] md:text-xs uppercase ${balanceColor.replace('800','700').replace('600','700')}">Saldo Líquido</p>
                            <h3 class="text-lg md:text-2xl font-bold ${balanceColor}">${App.utils.formatCurrency(balance)}</h3>
                        </div>

                        <div class="p-4 bg-red-100 rounded-lg"><p class="font-bold text-[10px] md:text-xs uppercase text-red-600">Total Pago</p><h3 class="text-lg md:text-2xl font-bold text-red-800">${App.utils.formatCurrency(totalExp)}</h3></div>
                    </div>
                    
                    <div class="bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <h3 class="font-bold text-gray-700 mb-2 flex items-center"><i class='bx bxs-brain text-purple-600 mr-2'></i> Diretrizes da IA</h3>
                        <textarea id="brain-input" class="w-full p-3 border rounded text-sm focus:ring-2 focus:ring-purple-500 outline-none" rows="2" placeholder="Ex: Priorize tratamentos estéticos nas sugestões..."></textarea>
                        <button id="save-brain" class="mt-2 bg-purple-600 text-white px-4 py-2 rounded text-sm hover:bg-purple-700 transition w-full md:w-auto">Salvar Cérebro</button>
                    </div>

                    <div class="mt-6 border-t pt-4 text-right">
                         <button onclick="window.hardResetSystem()" class="text-xs text-red-400 hover:text-red-600 underline">Resetar Dados (Cuidado!)</button>
                    </div>
                </div>
                <footer class="text-center py-6 text-xs text-gray-400 mt-4">
                    Desenvolvido com 🤖 por <strong>thIAguinho Soluções</strong>
                </footer>
            </div>`;
            
        const brainRef = App.db.ref(App.utils.getAdminPath(App.currentUser.uid, 'aiConfig/directives'));
        brainRef.once('value', s => { 
            const input = document.getElementById('brain-input');
            if(s.exists() && input) input.value = s.val().promptDirectives; 
        });
        
        const btnSave = document.getElementById('save-brain');
        if(btnSave) {
            btnSave.onclick = () => { 
                brainRef.update({ promptDirectives: document.getElementById('brain-input').value }); 
                alert("IA Atualizada!"); 
            };
        }
    }

    // 5. INTERFACE & MOBILE MENU
    function showLoginInterface() { 
        document.getElementById('login-screen').classList.remove('hidden'); 
        document.getElementById('app-container').classList.add('hidden'); 
        document.querySelector('header').classList.add('hidden'); 
    }
    
    function showAppInterface() { 
        document.getElementById('login-screen').classList.add('hidden'); 
        document.getElementById('app-container').classList.remove('hidden'); 
        document.querySelector('header').classList.remove('hidden'); 
        renderSidebar(); 
        navigateTo('dashboard'); 
    }

    function navigateTo(view) {
        App.currentView = view;
        refreshCurrentView();
        
        // Fecha menu mobile
        const sb = document.getElementById('sidebar');
        const overlay = document.getElementById('mobile-overlay');
        sb.classList.add('-translate-x-full'); 
        overlay.classList.add('hidden'); 

        document.querySelectorAll('#nav-menu button').forEach(btn => {
            const active = btn.dataset.view === view;
            btn.className = active ? 'flex items-center p-3 rounded-xl w-full text-left bg-indigo-600 text-white shadow-lg transition' : 'flex items-center p-3 rounded-xl w-full text-left text-indigo-200 hover:bg-indigo-700 hover:text-white transition';
        });
    }

    function renderSidebar() {
        const menu = document.getElementById('nav-menu'); menu.innerHTML = '';
        window.AppConfig.NAV_ITEMS.forEach(item => {
            const btn = document.createElement('button');
            btn.dataset.view = item.id;
            btn.className = 'flex items-center p-3 rounded-xl w-full text-left text-indigo-200';
            btn.innerHTML = `<i class='bx ${item.icon} text-xl mr-3'></i><span class='font-semibold'>${item.label}</span>`;
            btn.onclick = () => navigateTo(item.id);
            menu.appendChild(btn);
        });
    }

    function setupUIListeners() {
        document.getElementById('close-modal').addEventListener('click', App.utils.closeModal);
        document.getElementById('logout-button').addEventListener('click', () => App.auth.signOut().then(() => window.location.reload()));

        const btnMobile = document.getElementById('mobile-menu-btn');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobile-overlay');

        if(btnMobile) {
            btnMobile.addEventListener('click', () => {
                const isClosed = sidebar.classList.contains('-translate-x-full');
                if(isClosed) {
                    sidebar.classList.remove('-translate-x-full'); 
                    overlay.classList.remove('hidden');
                } else {
                    sidebar.classList.add('-translate-x-full');
                    overlay.classList.add('hidden');
                }
            });
        }

        if(overlay) {
            overlay.addEventListener('click', () => {
                sidebar.classList.add('-translate-x-full');
                overlay.classList.add('hidden');
            });
        }

        const form = document.getElementById('auth-form');
        const newForm = form.cloneNode(true); form.parentNode.replaceChild(newForm, form);
        
        newForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const em = document.getElementById('auth-email').value;
            const pw = document.getElementById('auth-password').value;
            try {
                if (isLoginMode) await App.auth.signInWithEmailAndPassword(em, pw);
                else await App.auth.createUserWithEmailAndPassword(em, pw);
            } catch(err) { alert("Erro: " + err.message); }
        });

        document.getElementById('toggle-auth-mode').addEventListener('click', () => {
            isLoginMode = !isLoginMode;
            document.getElementById('auth-submit-btn').textContent = isLoginMode ? 'Entrar' : 'Cadastrar';
        });
    }

    window.hardResetSystem = () => {
        const pwd = prompt("ATENÇÃO: Isso apagará TODOS os pacientes, finanças e estoque.\nDigite 'CONFIRMAR' para prosseguir:");
        if(pwd === 'CONFIRMAR') {
            App.db.ref(App.utils.getAdminPath(App.currentUser.uid, '')).remove()
                .then(() => {
                    alert("Sistema resetado com sucesso.");
                    window.location.reload();
                })
                .catch(e => alert("Erro ao resetar: " + e.message));
        }
    };

    document.addEventListener('DOMContentLoaded', init);
})();
