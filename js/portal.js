// ==================================================================
// MÓDULO PORTAL DO PACIENTE (CORRIGIDO: CHAT COMPLETO)
// ==================================================================
(function() {
    const config = window.AppConfig;
    const appId = config.APP_ID;
    
    let db, auth, currentUser;
    let myProfile = null;
    let myDentistUid = null;
    let selectedFile = null;

    // --- INICIALIZAÇÃO ---
    function init() {
        if (!firebase.apps.length) firebase.initializeApp(config.firebaseConfig);
        db = firebase.database();
        auth = firebase.auth();

        auth.onAuthStateChanged(user => {
            if (user) {
                currentUser = user;
                findMyData(user.email);
            } else {
                showLogin();
            }
        });

        document.getElementById('p-login-form').addEventListener('submit', handleLogin);
        document.getElementById('p-logout').addEventListener('click', () => auth.signOut());
        document.getElementById('p-send').addEventListener('click', sendMessage);
        
        // Upload de Imagem
        const fileInput = document.getElementById('file-input');
        document.getElementById('btn-camera').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                selectedFile = e.target.files[0];
                document.getElementById('img-preview-area').classList.remove('hidden');
                document.getElementById('img-name').textContent = selectedFile.name;
            }
        });
        document.getElementById('remove-img').addEventListener('click', () => {
            selectedFile = null;
            fileInput.value = '';
            document.getElementById('img-preview-area').classList.add('hidden');
        });
    }

    // --- LOGIN ---
    async function handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('p-email').value;
        const pass = document.getElementById('p-pass').value;
        const btn = document.querySelector('#p-login-form button');
        const msg = document.getElementById('p-msg');

        btn.disabled = true; btn.textContent = "Entrando..."; msg.textContent = "";

        try {
            await auth.signInWithEmailAndPassword(email, pass);
        } catch (error) {
            console.error(error);
            msg.textContent = "Email ou senha incorretos.";
            btn.disabled = false; btn.textContent = "Acessar";
        }
    }

    function showLogin() {
        document.getElementById('patient-login').classList.remove('hidden');
        document.getElementById('patient-app').classList.add('hidden');
    }

    // --- LÓGICA DE BUSCA ---
    async function findMyData(email) {
        const usersRef = db.ref(`artifacts/${appId}/users`);
        const snapshot = await usersRef.once('value');
        
        let found = false;
        if (snapshot.exists()) {
            snapshot.forEach(dentistSnap => {
                const patients = dentistSnap.val().patients;
                if (patients) {
                    for (const [pid, pData] of Object.entries(patients)) {
                        // Verifica email sem case sensitivity e remove espaços
                        if (pData.email && pData.email.trim().toLowerCase() === email.trim().toLowerCase()) {
                            myProfile = { ...pData, id: pid, dentistId: dentistSnap.key };
                            myDentistUid = dentistSnap.key;
                            found = true;
                            return true; 
                        }
                    }
                }
            });
        }

        if (found) {
            loadInterface();
        } else {
            alert("Seu e-mail não foi encontrado na base de pacientes. Verifique com a clínica.");
            auth.signOut();
        }
    }

    function loadInterface() {
        document.getElementById('patient-login').classList.add('hidden');
        document.getElementById('patient-app').classList.remove('hidden');

        document.getElementById('p-name').textContent = myProfile.name;
        document.getElementById('p-treatment').textContent = myProfile.treatmentType || 'Geral';
        document.getElementById('p-status').textContent = myProfile.status || 'Ativo';

        loadTimeline(); // Chat
        loadFinance();  // Financeiro
    }

    // --- CHAT / TIMELINE (CORRIGIDO) ---
    const loadTimeline = () => {
        const timelineDiv = document.getElementById('p-timeline');
        // Removemos o .limitToLast(20) para trazer tudo
        const journalRef = db.ref(`artifacts/${appId}/patients/${myProfile.id}/journal`);
        
        journalRef.on('value', snap => {
            timelineDiv.innerHTML = '';
            if (snap.exists()) {
                const msgs = [];
                snap.forEach(child => msgs.push(child.val()));
                
                // NÃO INVERTER MAIS. Queremos cronológico (Antigo -> Novo)
                msgs.forEach(msg => {
                    const isMe = msg.author === 'Paciente';
                    // Design diferente para Paciente (Direita/Azul) e Dentista/IA (Esquerda/Cinza)
                    const align = isMe ? 'ml-auto bg-blue-600 text-white' : 'mr-auto bg-gray-100 text-gray-800 border';
                    
                    let mediaHtml = '';
                    if (msg.media && msg.media.url) {
                        mediaHtml = `<a href="${msg.media.url}" target="_blank"><img src="${msg.media.url}" class="mt-2 rounded-lg border border-white/20 max-h-40 w-full object-cover"></a>`;
                    }

                    const el = document.createElement('div');
                    el.className = `p-3 rounded-2xl max-w-[85%] mb-2 text-sm shadow-sm ${align}`;
                    el.innerHTML = `
                        <div class="font-bold text-[10px] uppercase tracking-wider opacity-80 mb-1">${msg.author}</div>
                        <div class="leading-relaxed">${msg.text}</div>
                        ${mediaHtml}
                        <div class="text-[10px] text-right opacity-60 mt-1">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                    `;
                    timelineDiv.appendChild(el);
                });
                
                // Rolar para o final (última mensagem)
                setTimeout(() => {
                    const main = document.querySelector('main');
                    main.scrollTop = main.scrollHeight;
                }, 100);

            } else {
                timelineDiv.innerHTML = '<div class="text-center py-10"><i class="bx bx-chat text-4xl text-gray-200"></i><p class="text-gray-400 text-sm mt-2">Inicie a conversa aqui.</p></div>';
            }
        });
    };

    const loadFinance = () => {
        const finDiv = document.getElementById('p-finance');
        const finRef = db.ref(`artifacts/${appId}/users/${myDentistUid}/finance/receivable`)
                         .orderByChild('patientId').equalTo(myProfile.id);

        finRef.on('value', snap => {
            finDiv.innerHTML = '';
            if (snap.exists()) {
                let totalPending = 0;
                snap.forEach(child => {
                    const item = child.val();
                    const isPaid = item.status === 'Recebido';
                    if (!isPaid) totalPending += parseFloat(item.amount || 0);

                    finDiv.innerHTML += `
                        <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg border-l-4 ${isPaid ? 'border-green-500' : 'border-yellow-500'} mb-2">
                            <div>
                                <p class="font-bold text-gray-700 text-sm">${item.description}</p>
                                <p class="text-xs text-gray-400">${new Date(item.dueDate).toLocaleDateString()}</p>
                            </div>
                            <div class="text-right">
                                <p class="font-bold ${isPaid ? 'text-green-600' : 'text-yellow-600'} text-sm">R$ ${parseFloat(item.amount).toFixed(2).replace('.', ',')}</p>
                                <span class="text-[10px] uppercase font-bold text-gray-400">${item.status}</span>
                            </div>
                        </div>
                    `;
                });
                
                // Atualiza status no header
                const statusEl = document.getElementById('p-financial-status');
                if (totalPending > 0) {
                    statusEl.textContent = "Pendente";
                    statusEl.className = "font-bold text-sm mt-1 text-yellow-200";
                } else {
                    statusEl.textContent = "Em dia";
                    statusEl.className = "font-bold text-sm mt-1 text-green-200";
                }

            } else {
                finDiv.innerHTML = '<p class="text-center text-gray-400 text-xs py-4">Nenhum registro financeiro.</p>';
            }
        });
    };

    // --- ENVIO DE MENSAGENS ---
    async function sendMessage() {
        const input = document.getElementById('p-input');
        const text = input.value;
        const btn = document.getElementById('p-send');

        if (!text && !selectedFile) return;

        btn.disabled = true;
        
        let mediaData = null;

        // 1. Upload
        if (selectedFile && window.uploadToCloudinary) {
            try {
                input.value = "Enviando imagem...";
                mediaData = await window.uploadToCloudinary(selectedFile);
            } catch (err) {
                alert("Erro ao enviar imagem.");
                btn.disabled = false;
                input.value = text;
                return;
            }
        }

        // 2. Salvar Mensagem
        const journalRef = db.ref(`artifacts/${appId}/patients/${myProfile.id}/journal`);
        await journalRef.push({
            text: text || (mediaData ? "Anexo de Imagem" : ""),
            author: 'Paciente',
            media: mediaData,
            timestamp: new Date().toISOString()
        });
        
        input.value = '';
        selectedFile = null;
        document.getElementById('img-preview-area').classList.add('hidden');

        // 3. Resposta Automática da IA (Secretária)
        if (window.callGeminiAPI && text) {
            // Prompt específico para o Paciente (Secretária)
            const context = `Atue como a recepcionista virtual da clínica. O paciente ${myProfile.name} (Tratamento: ${myProfile.treatmentType}) disse: "${text}". Responda de forma curta, educada e acolhedora. Não dê diagnósticos médicos. Se for dor ou urgência, peça para ligar.`;
            
            try {
                const reply = await window.callGeminiAPI(context, text);
                await journalRef.push({
                    text: reply,
                    author: 'IA (Auto)',
                    timestamp: new Date().toISOString()
                });
            } catch (e) {
                console.error("Erro IA:", e);
            }
        }
        
        btn.disabled = false;
    }

    document.addEventListener('DOMContentLoaded', init);
})();
