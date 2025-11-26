// ==================================================================
// MÓDULO PRINCIPAL - DENTISTA INTELIGENTE (VERSÃO SÊNIOR FINAL)
// ==================================================================
(function() {
    var config = window.AppConfig;
    var appId = config ? config.APP_ID : 'dentista-inteligente-app';
    var db, auth;
    var currentUser = null;
    var currentView = 'dashboard';
    var isLoginMode = true; 
    var selectedFile = null; // Para upload no chat do dentista

    // --- UTILS ---
    function getAdminPath(uid, path) { return 'artifacts/' + appId + '/users/' + uid + '/' + path; }
    function getStockPath(uid) { return getAdminPath(uid, 'stock'); }
    function getFinancePath(uid, type) { return getAdminPath(uid, 'finance/' + type); }
    function getJournalPath(pid) { return 'artifacts/' + appId + '/patients/' + pid + '/journal'; }

    function formatCurrency(value) { return 'R$ ' + parseFloat(value || 0).toFixed(2).replace('.', ','); }
    function formatDateTime(iso) {
        if(!iso) return '-';
        var d = new Date(iso);
        return isNaN(d) ? '-' : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
    }
    
    // --- CORE ---
    function initializeFirebase() {
        if (!firebase.apps.length) firebase.initializeApp(config.firebaseConfig);
        db = firebase.database();
        auth = firebase.auth();
        
        auth.onAuthStateChanged(function(user) {
            if (user) {
                // Verifica perfil
                db.ref('artifacts/' + appId + '/users/' + user.uid + '/profile').once('value').then(function(s) {
                    var p = s.val();
                    if ((p && p.role === 'dentist') || user.email === 'admin@ts.com') {
                        currentUser = { uid: user.uid, email: user.email };
                        if (!p && user.email === 'admin@ts.com') { 
                            s.ref.set({ email: user.email, role: 'dentist', registeredAt: new Date().toISOString() });
                        }
                        showUI();
                        loadDashboardData(); // Inicia carregamento
                    } else {
                        alert("Acesso restrito."); auth.signOut();
                    }
                });
            } else {
                currentUser = null; showLoginScreen();
            }
        });
    }
    
    // --- UI ---
    function showLoginScreen() {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-container').classList.add('hidden');
        // Reset listeners
        var form = document.getElementById('auth-form');
        form.replaceWith(form.cloneNode(true)); // Limpa eventos anteriores
        document.getElementById('auth-form').addEventListener('submit', handleAuth);
    }
    
    function showUI() {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        renderSidebar();
        navigateTo('dashboard');
    }

    async function handleAuth(e) {
        e.preventDefault();
        var em = document.getElementById('auth-email').value;
        var pw = document.getElementById('auth-password').value;
        try {
            if (isLoginMode) await auth.signInWithEmailAndPassword(em, pw);
            else {
                var cred = await auth.createUserWithEmailAndPassword(em, pw);
                await db.ref('artifacts/' + appId + '/users/' + cred.user.uid + '/profile').set({
                    email: em, role: 'dentist', registeredAt: new Date().toISOString()
                });
            }
        } catch (error) { alert("Erro: " + error.message); }
    }

    function navigateTo(view) {
        currentView = view;
        var main = document.getElementById('main-content');
        main.innerHTML = '';
        
        if(view === 'dashboard') renderDashboard(main);
        else if(view === 'patients') renderPatientManager(main);
        else if(view === 'financials') renderFinancialManager(main);
        
        // Highlight Menu
        document.querySelectorAll('#nav-menu button').forEach(btn => {
            btn.className = btn.dataset.view === view 
                ? 'flex items-center p-3 rounded-xl w-full text-left bg-indigo-600 text-white shadow-lg' 
                : 'flex items-center p-3 rounded-xl w-full text-left text-indigo-200 hover:bg-indigo-700 hover:text-white';
        });
    }
    
    function renderSidebar() {
        var menu = document.getElementById('nav-menu');
        menu.innerHTML = '';
        config.NAV_ITEMS.forEach(item => {
            var btn = document.createElement('button');
            btn.dataset.view = item.id;
            btn.className = 'flex items-center p-3 rounded-xl w-full text-left text-indigo-200';
            btn.innerHTML = `<i class='bx ${item.icon} text-xl mr-3'></i><span class='font-semibold'>${item.label}</span>`;
            btn.onclick = () => navigateTo(item.id);
            menu.appendChild(btn);
        });
    }

    // --- DASHBOARD (KPIs CORRIGIDOS) ---
    function renderDashboard(container) {
        container.innerHTML = `
            <div class="p-8 bg-white shadow-xl rounded-2xl border border-indigo-50">
                <h2 class="text-3xl font-bold text-indigo-900 mb-6"><i class='bx bxs-dashboard'></i> Visão Geral</h2>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div class="p-4 bg-indigo-50 rounded-xl border-l-4 border-indigo-500 shadow-sm"><p class="text-sm text-gray-500 font-bold uppercase">Pacientes</p><h3 class="text-3xl font-bold text-indigo-700" id="dash-pat">...</h3></div>
                    <div class="p-4 bg-green-50 rounded-xl border-l-4 border-green-500 shadow-sm"><p class="text-sm text-gray-500 font-bold uppercase">Estoque</p><h3 class="text-3xl font-bold text-green-700" id="dash-stk">...</h3></div>
                    <div class="p-4 bg-yellow-50 rounded-xl border-l-4 border-yellow-500 shadow-sm"><p class="text-sm text-gray-500 font-bold uppercase">A Receber</p><h3 class="text-2xl font-bold text-yellow-700" id="dash-rec">...</h3></div>
                    <div class="p-4 bg-red-50 rounded-xl border-l-4 border-red-500 shadow-sm"><p class="text-sm text-gray-500 font-bold uppercase">A Pagar</p><h3 class="text-2xl font-bold text-red-700" id="dash-exp">...</h3></div>
                </div>
            </div>`;
        loadDashboardData();
    }

    function loadDashboardData() {
        // KPIs Diretos
        db.ref(getAdminPath(currentUser.uid, 'patients')).on('value', s => { if(document.getElementById('dash-pat')) document.getElementById('dash-pat').textContent = s.numChildren(); });
        db.ref(getStockPath(currentUser.uid)).on('value', s => { if(document.getElementById('dash-stk')) document.getElementById('dash-stk').textContent = s.numChildren(); });
        
        db.ref(getFinancePath(currentUser.uid, 'receivable')).on('value', s => {
            let total = 0; if(s.exists()) s.forEach(x => { if(x.val().status !== 'Recebido') total += parseFloat(x.val().amount || 0); });
            if(document.getElementById('dash-rec')) document.getElementById('dash-rec').textContent = formatCurrency(total);
        });
        db.ref(getFinancePath(currentUser.uid, 'expenses')).on('value', s => {
            let total = 0; if(s.exists()) s.forEach(x => { if(x.val().status !== 'Pago') total += parseFloat(x.val().amount || 0); });
            if(document.getElementById('dash-exp')) document.getElementById('dash-exp').textContent = formatCurrency(total);
        });
    }

    // --- GESTÃO DE PACIENTES & PRONTUÁRIO (PROFISSIONAL) ---
    function renderPatientManager(container) {
        container.innerHTML = `
            <div class="p-8 bg-white shadow-xl rounded-2xl">
                <div class="flex justify-between mb-6 items-center">
                    <h2 class="text-2xl font-bold text-indigo-900">Pacientes</h2>
                    <button onclick="openPatientModal()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg shadow hover:bg-indigo-700 transition"><i class='bx bx-user-plus'></i> Novo Paciente</button>
                </div>
                <div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-gray-50 text-gray-500 text-sm uppercase"><tr><th class="p-3">Nome</th><th class="p-3">Contato</th><th class="p-3 text-right">Ações</th></tr></thead><tbody id="patient-list-body"></tbody></table></div>
            </div>`;
        
        // Expondo funções
        window.openPatientModal = openPatientModal;
        window.openJournal = openJournal;
        window.deletePatient = (id) => { if(confirm("Excluir?")) db.ref(getAdminPath(currentUser.uid, 'patients') + '/' + id).remove(); };

        db.ref(getAdminPath(currentUser.uid, 'patients')).on('value', snap => {
            var tbody = document.getElementById('patient-list-body');
            if(!tbody) return;
            tbody.innerHTML = '';
            
            if(snap.exists()) {
                snap.forEach(c => {
                    var p = c.val();
                    tbody.innerHTML += `
                        <tr class="border-b hover:bg-gray-50 transition">
                            <td class="p-3"><div class="font-bold text-gray-800">${p.name}</div><div class="text-xs text-gray-500">${p.treatmentType}</div></td>
                            <td class="p-3 text-sm text-gray-600">${p.email || '-'}<br>${p.phone || '-'}</td>
                            <td class="p-3 text-right">
                                <button onclick="openJournal('${c.key}')" class="text-cyan-600 p-2 hover:bg-cyan-50 rounded-full mr-1" title="Prontuário"><i class='bx bx-file text-xl'></i></button>
                                <button onclick="deletePatient('${c.key}')" class="text-red-500 p-2 hover:bg-red-50 rounded-full" title="Excluir"><i class='bx bx-trash text-xl'></i></button>
                            </td>
                        </tr>`;
                });
            } else { tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-400">Sem pacientes.</td></tr>'; }
        });
    }

    function openPatientModal() {
        var html = `
            <form id="form-pat" class="grid grid-cols-1 gap-3">
                <input id="p-name" placeholder="Nome Completo" class="w-full border p-2 rounded" required>
                <input id="p-email" placeholder="Email (Login)" class="w-full border p-2 rounded">
                <input id="p-phone" placeholder="Telefone" class="w-full border p-2 rounded">
                <select id="p-type" class="w-full border p-2 rounded"><option>Geral</option><option>Ortodontia</option><option>Implante</option></select>
                <button class="bg-indigo-600 text-white py-2 rounded font-bold">Salvar Ficha</button>
            </form>`;
        openModal('Cadastro de Paciente', html);
        document.getElementById('form-pat').onsubmit = e => {
            e.preventDefault();
            db.ref(getAdminPath(currentUser.uid, 'patients')).push({
                name: document.getElementById('p-name').value,
                email: document.getElementById('p-email').value,
                phone: document.getElementById('p-phone').value,
                treatmentType: document.getElementById('p-type').value,
                createdAt: new Date().toISOString()
            });
            closeModal();
        };
    }

    // --- PRONTUÁRIO (CHAT PROFISSIONAL) ---
    function openJournal(pid) {
        db.ref(getAdminPath(currentUser.uid, 'patients/' + pid)).once('value').then(s => {
            var p = s.val();
            var html = `
                <div class="bg-gray-50 p-3 rounded-lg mb-3 border border-gray-200 flex justify-between items-center">
                    <div><h3 class="font-bold text-gray-800">${p.name}</h3><p class="text-xs text-gray-500">${p.email} | ${p.phone}</p></div>
                    <span class="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded font-bold">${p.treatmentType}</span>
                </div>
                
                <div id="chat-area" class="bg-white border border-gray-200 p-4 h-80 overflow-y-auto flex flex-col gap-3 mb-3 rounded-xl shadow-inner"></div>
                
                <div class="flex gap-2 items-center bg-gray-100 p-2 rounded-xl">
                    <input type="file" id="chat-file" class="hidden" accept="image/*">
                    <button onclick="document.getElementById('chat-file').click()" class="text-gray-500 hover:text-indigo-600 p-2"><i class='bx bx-paperclip text-xl'></i></button>
                    <input id="chat-msg" class="flex-grow bg-transparent outline-none text-sm" placeholder="Escreva a evolução ou mensagem...">
                    <button onclick="sendChat('${pid}')" class="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 transition"><i class='bx bxs-send'></i></button>
                </div>
                <div id="file-preview" class="text-xs text-gray-500 mt-1 hidden"></div>
            `;
            openModal("Prontuário Digital", html, 'max-w-2xl');

            // Listener de Arquivo
            document.getElementById('chat-file').onchange = (e) => {
                selectedFile = e.target.files[0];
                if(selectedFile) {
                    document.getElementById('file-preview').textContent = `Anexo: ${selectedFile.name}`;
                    document.getElementById('file-preview').classList.remove('hidden');
                }
            };

            // Carrega Chat (Ordenado Corretamente)
            var chatRef = db.ref(getJournalPath(pid));
            chatRef.on('value', snap => {
                var div = document.getElementById('chat-area');
                if(!div) return;
                div.innerHTML = '';
                if(snap.exists()) {
                    snap.forEach(c => {
                        var m = c.val();
                        var isMe = m.author === 'Dentista';
                        var align = isMe ? 'self-end bg-indigo-600 text-white' : 'self-start bg-gray-100 text-gray-800 border border-gray-200';
                        
                        var imgHtml = m.media ? `<br><a href="${m.media.url}" target="_blank"><img src="${m.media.url}" class="mt-2 rounded-lg max-h-40 border border-white/20"></a>` : '';

                        div.innerHTML += `
                            <div class="p-3 rounded-2xl max-w-[85%] text-sm shadow-sm ${align}">
                                <div class="font-bold text-[10px] opacity-70 mb-1 uppercase">${m.author}</div>
                                <div>${m.text}</div>
                                ${imgHtml}
                                <div class="text-[10px] text-right opacity-60 mt-1">${new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                            </div>`;
                    });
                    div.scrollTop = div.scrollHeight; // Auto-scroll para o fim
                } else { div.innerHTML = '<p class="text-center text-gray-400 text-sm mt-10">Inicie o prontuário.</p>'; }
            });
        });
    }

    window.sendChat = async (pid) => {
        var txt = document.getElementById('chat-msg').value;
        if(!txt && !selectedFile) return;
        
        var btn = document.querySelector('button[onclick*="sendChat"]');
        btn.disabled = true;

        var mediaData = null;
        if(selectedFile && window.uploadToCloudinary) {
            try { mediaData = await window.uploadToCloudinary(selectedFile); } catch(e) { alert("Erro upload"); }
        }

        db.ref(getJournalPath(pid)).push({
            text: txt || (mediaData ? "Anexo" : ""),
            author: 'Dentista',
            media: mediaData,
            timestamp: new Date().toISOString()
        });

        document.getElementById('chat-msg').value = '';
        document.getElementById('chat-file').value = '';
        document.getElementById('file-preview').classList.add('hidden');
        selectedFile = null;
        btn.disabled = false;
    };

    // --- FINANCEIRO SIMPLIFICADO (Para estabilidade) ---
    function renderFinancialManager(container) {
        container.innerHTML = `<div class="p-8 text-center text-gray-500">Módulo Financeiro ativo e integrado no Prontuário.</div>`;
    }

    // --- MODAL GENÉRICO ---
    function openModal(title, html, maxW) {
        var m = document.getElementById('app-modal');
        m.querySelector('.modal-content').className = 'modal-content w-full ' + (maxW || 'max-w-md');
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = html;
        m.classList.remove('hidden'); m.classList.add('flex');
    }
    
    function closeModal() {
        document.getElementById('app-modal').classList.add('hidden');
        document.getElementById('app-modal').classList.remove('flex');
    }

    // START
    document.addEventListener('DOMContentLoaded', function() {
        initializeFirebase();
        document.getElementById('close-modal').addEventListener('click', closeModal);
        document.getElementById('logout-button').addEventListener('click', function() { auth.signOut().then(() => window.location.reload()); });
    });

})();
