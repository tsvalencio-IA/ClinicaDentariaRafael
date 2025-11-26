// ==================================================================
// MÓDULO PORTAL DO PACIENTE (ISOLADO)
// ==================================================================
(function() {
    const config = window.AppConfig;
    const appId = config.APP_ID;
    
    let db, auth, currentUser;
    let myProfile = null;   // Dados do paciente
    let myDentistUid = null; // UID do dentista dono deste paciente
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

        // Listeners
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

    // --- LÓGICA DE BUSCA DE DADOS ---
    // Como o paciente não sabe o UID do dentista, procuramos em todos os dentistas
    // onde este email está cadastrado como paciente.
    async function findMyData(email) {
        const usersRef = db.ref(`artifacts/${appId}/users`);
        const snapshot = await usersRef.once('value');
        
        let found = false;
        if (snapshot.exists()) {
            snapshot.forEach(dentistSnap => {
                const patients = dentistSnap.val().patients;
                if (patients) {
                    for (const [pid, pData] of Object.entries(patients)) {
                        if (pData.email && pData.email.toLowerCase() === email.toLowerCase()) {
                            myProfile = { ...pData, id: pid };
                            myDentistUid = dentistSnap.key;
                            found = true;
                            return true; // Break forEach
                        }
                    }
                }
            });
        }

        if (found) {
            loadInterface();
        } else {
            alert("Seu cadastro não foi encontrado. Peça ao seu dentista para verificar o e-mail na sua ficha.");
            auth.signOut();
        }
    }

    function loadInterface() {
        document.getElementById('patient-login').classList.add('hidden');
        document.getElementById('patient-app').classList.remove('hidden');

        // Preenche dados básicos
        document.getElementById('p-name').textContent = myProfile.name;
        document.getElementById('p-treatment').textContent = myProfile.treatmentType || 'Tratamento Geral';
        document.getElementById('p-status').textContent = myProfile.status || 'Ativo';

        // Carrega Chat/Timeline
        const journalRef = db.ref(`artifacts/${appId}/patients/${myProfile.id}/journal`);
        const timelineDiv = document.getElementById('p-timeline');

        journalRef.limitToLast(20).on('value', snap => {
            timelineDiv.innerHTML = '';
            if (snap.exists()) {
                const msgs = [];
                snap.forEach(c => msgs.push(c.val()));
                
                // Ordena e exibe
                msgs.forEach(msg => {
                    const isMe = msg.author === 'Paciente';
                    const align = isMe ? 'ml-auto bg-blue-600 text-white' : 'mr-auto bg-gray-100 text-gray-800';
                    
                    // Verifica se tem imagem
                    let mediaHtml = '';
                    if (msg.media && msg.media.url) {
                        mediaHtml = `<a href="${msg.media.url}" target="_blank"><img src="${msg.media.url}" class="mt-2 rounded-lg border border-white/20 max-h-32 object-cover"></a>`;
                    }

                    const el = document.createElement('div');
                    el.className = `p-3 rounded-2xl max-w-[80%] mb-2 text-sm ${align}`;
                    el.innerHTML = `
                        <div class="font-bold text-xs opacity-70 mb-1">${msg.author}</div>
                        <div>${msg.text}</div>
                        ${mediaHtml}
                    `;
                    timelineDiv.appendChild(el);
                });
                // Auto scroll
                const main = document.querySelector('main');
                main.scrollTop = main.scrollHeight;
            } else {
                timelineDiv.innerHTML = '<p class="text-center text-gray-400 text-sm mt-10">Inicie a conversa com seu dentista.</p>';
            }
        });
    }

    // --- ENVIO DE MENSAGENS E FOTOS ---
    async function sendMessage() {
        const input = document.getElementById('p-input');
        const text = input.value;
        const btn = document.getElementById('p-send');

        if (!text && !selectedFile) return;

        btn.disabled = true;
        
        let mediaData = null;

        // 1. Upload de Imagem (se houver)
        if (selectedFile && window.uploadToCloudinary) {
            try {
                // Feedback visual
                input.value = "Enviando imagem...";
                mediaData = await window.uploadToCloudinary(selectedFile);
            } catch (err) {
                alert("Erro no envio da imagem: " + err.message);
                btn.disabled = false;
                input.value = text; // restaura texto
                return;
            }
        }

        // 2. Salva no Firebase
        const journalRef = db.ref(`artifacts/${appId}/patients/${myProfile.id}/journal`);
        await journalRef.push({
            text: text || (mediaData ? "Enviou um arquivo" : ""),
            author: 'Paciente',
            media: mediaData,
            timestamp: new Date().toISOString()
        });

        // 3. Resposta da IA (Opcional/Imediata)
        if (window.callGeminiAPI && text) {
            const prompt = `Você é a recepção virtual da clínica. O paciente ${myProfile.name} disse: "${text}". Responda de forma curta e acolhedora. Se for emergência, peça para ligar.`;
            const reply = await window.callGeminiAPI(prompt, text);
            await journalRef.push({
                text: reply,
                author: 'IA (Auto)',
                timestamp: new Date().toISOString()
            });
        }

        // Reset
        input.value = '';
        selectedFile = null;
        document.getElementById('img-preview-area').classList.add('hidden');
        btn.disabled = false;
    }

    // Inicializa
    document.addEventListener('DOMContentLoaded', init);
})();
