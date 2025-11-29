// ==================================================================
// MÓDULO PORTAL: MEMÓRIA DE ELEFANTE & FLUXO CONTÍNUO
// ==================================================================
(function() {
    var config = window.AppConfig;
    var appId = config.APP_ID;
    var db, auth, currentUser, myProfile, myDentistUid, selectedFile;
    var aiDirectives = null;
    var isLoginMode = true; 

    function init() {
        if (!firebase.apps.length) firebase.initializeApp(config.firebaseConfig);
        db = firebase.database();
        auth = firebase.auth();

        auth.onAuthStateChanged(function(user) {
            if (user) {
                currentUser = user;
                var btn = document.getElementById('p-submit-btn');
                if(btn) btn.textContent = "Carregando...";
                setTimeout(() => findMyData(user.email), 1000); 
            } else {
                showLogin();
            }
        });

        var loginForm = document.getElementById('p-login-form');
        if(loginForm) loginForm.addEventListener('submit', handleAuthAction);
        
        var toggleBtn = document.getElementById('p-toggle-mode');
        if(toggleBtn) toggleBtn.addEventListener('click', function() {
            isLoginMode = !isLoginMode;
            var btn = document.getElementById('p-submit-btn');
            var title = document.querySelector('#patient-login h1');
            
            if(isLoginMode) {
                title.textContent = "Bem-vindo, Paciente";
                btn.textContent = "Acessar Meu Portal";
                toggleBtn.textContent = "Não tem senha? Criar conta";
            } else {
                title.textContent = "Criar Acesso";
                btn.textContent = "Criar Minha Senha";
                toggleBtn.textContent = "Já tenho conta. Fazer Login";
            }
            var msg = document.getElementById('p-msg');
            if(msg) msg.textContent = "";
        });

        var logoutBtn = document.getElementById('p-logout');
        if(logoutBtn) logoutBtn.addEventListener('click', function() { auth.signOut(); });
        
        var sendBtn = document.getElementById('p-send');
        if(sendBtn) sendBtn.addEventListener('click', sendMessage);
        
        var fileInput = document.getElementById('file-input');
        var camBtn = document.getElementById('btn-camera');
        if(camBtn) camBtn.addEventListener('click', function() { fileInput.click(); });
        
        if(fileInput) {
            fileInput.addEventListener('change', function(e) {
                if (e.target.files[0]) {
                    selectedFile = e.target.files[0];
                    document.getElementById('img-preview-area').classList.remove('hidden');
                    document.getElementById('img-name').textContent = selectedFile.name;
                }
            });
        }
        
        var removeImgBtn = document.getElementById('remove-img');
        if(removeImgBtn) {
            removeImgBtn.addEventListener('click', function() {
                selectedFile = null; 
                if(fileInput) fileInput.value = '';
                document.getElementById('img-preview-area').classList.add('hidden');
            });
        }
    }

    async function handleAuthAction(e) {
        e.preventDefault();
        var email = document.getElementById('p-email').value;
        var pass = document.getElementById('p-pass').value;
        var msg = document.getElementById('p-msg');
        var btn = document.getElementById('p-submit-btn');
        
        msg.textContent = "";
        btn.disabled = true;
        btn.textContent = "Processando...";

        try { 
            if (isLoginMode) {
                await auth.signInWithEmailAndPassword(email, pass); 
            } else {
                await auth.createUserWithEmailAndPassword(email, pass);
                msg.className = "text-green-600 text-xs mt-3 h-4";
                msg.textContent = "Conta criada! Acessando...";
            }
        } 
        catch (error) { 
            btn.disabled = false;
            btn.textContent = isLoginMode ? "Acessar Meu Portal" : "Criar Minha Senha";
            msg.className = "text-red-500 text-xs mt-3 h-4";
            
            if(error.code === 'auth/email-already-in-use') msg.textContent = "Email já cadastrado. Faça login.";
            else if(error.code === 'auth/weak-password') msg.textContent = "Senha fraca (mínimo 6 dígitos).";
            else msg.textContent = "Erro: " + error.message; 
        }
    }

    function showLogin() {
        document.getElementById('patient-login').classList.remove('hidden');
        document.getElementById('patient-app').classList.add('hidden');
        var btn = document.getElementById('p-submit-btn');
        if(btn) {
            btn.disabled = false;
            btn.textContent = isLoginMode ? "Acessar Meu Portal" : "Criar Minha Senha";
        }
    }

    async function findMyData(email) {
        var usersRef = db.ref('artifacts/' + appId + '/users');
        usersRef.once('value').then(function(snapshot) {
            var found = false;
            if (snapshot.exists()) {
                snapshot.forEach(function(dentistSnap) {
                    var patients = dentistSnap.val().patients;
                    if (patients) {
                        for (var pid in patients) {
                            if (patients[pid].email && patients[pid].email.toLowerCase() === email.toLowerCase()) {
                                myProfile = { ...patients[pid], id: pid };
                                myDentistUid = dentistSnap.key;
                                found = true;
                                
                                db.ref('artifacts/' + appId + '/users/' + myDentistUid + '/aiConfig/directives').on('value', function(brainSnap) {
                                    if(brainSnap.exists()) {
                                        aiDirectives = brainSnap.val().promptDirectives;
                                    }
                                });
                            }
                        }
                    }
                });
            }
            
            if (found) {
                loadInterface();
            } else { 
                var user = auth.currentUser;
                user.delete().catch(function(e){console.log(e)});
                auth.signOut();
                alert("Email não cadastrado pelo dentista.");
                location.reload();
            }
        });
    }

    function loadInterface() {
        document.getElementById('patient-login').classList.add('hidden');
        document.getElementById('patient-app').classList.remove('hidden');
        document.getElementById('p-name').textContent = myProfile.name;
        document.getElementById('p-treatment').textContent = myProfile.treatmentType || 'Geral';
        document.getElementById('p-status').textContent = 'Ativo';
        
        var footer = document.querySelector('#patient-app footer');
        if(!footer) {
             var f = document.createElement('footer');
             f.className = 'text-center py-4 text-xs text-gray-400 bg-white mt-auto w-full border-t border-gray-100';
             f.innerHTML = 'Desenvolvido com 🤖 por <strong>thIAguinho Soluções</strong>';
             document.querySelector('#patient-app main').appendChild(f);
        }

        loadTimeline();
        loadFinance();
    }

    function loadTimeline() {
        var timelineDiv = document.getElementById('p-timeline');
        var journalRef = db.ref('artifacts/' + appId + '/patients/' + myProfile.id + '/journal');
        
        journalRef.limitToLast(50).on('value', function(snap) {
            timelineDiv.innerHTML = '';
            if (snap.exists()) {
                snap.forEach(function(c) {
                    var msg = c.val();
                    if (msg.author === 'Nota Interna') return; 

                    var isMe = msg.author === 'Paciente';
                    var align = isMe ? 'ml-auto bg-blue-600 text-white' : 'mr-auto bg-gray-100 text-gray-800 border';
                    
                    var mediaHtml = '';
                    if (msg.media && msg.media.url) {
                        mediaHtml = `<a href="${msg.media.url}" target="_blank"><img src="${msg.media.url}" class="mt-2 rounded-lg border border-white/20 max-h-40 w-full object-cover"></a>`;
                    }

                    var el = document.createElement('div');
                    el.className = `p-3 rounded-2xl max-w-[85%] mb-2 text-sm shadow-sm ${align}`;
                    el.innerHTML = `<div class="font-bold text-[10px] opacity-80 mb-1 uppercase">${msg.author}</div><div>${msg.text}</div>${mediaHtml}`;
                    timelineDiv.appendChild(el);
                });
                var main = document.querySelector('main');
                main.scrollTop = main.scrollHeight;
            }
        });
    }

    function loadFinance() {
        var finDiv = document.getElementById('p-finance');
        var finRef = db.ref('artifacts/' + appId + '/users/' + myDentistUid + '/finance/receivable').orderByChild('patientId').equalTo(myProfile.id);

        finRef.on('value', function(snap) {
            finDiv.innerHTML = '';
            if (snap.exists()) {
                snap.forEach(function(c) {
                    var item = c.val();
                    var isPaid = item.status === 'Recebido';
                    finDiv.innerHTML += `
                        <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg border-l-4 ${isPaid ? 'border-green-500' : 'border-yellow-500'} mb-2">
                            <div><p class="font-bold text-gray-700 text-sm">${item.description}</p><p class="text-xs text-gray-400">${new Date(item.dueDate).toLocaleDateString()}</p></div>
                            <div class="text-right"><p class="font-bold ${isPaid ? 'text-green-600' : 'text-yellow-600'} text-sm">R$ ${parseFloat(item.amount).toFixed(2)}</p><span class="text-[10px] uppercase font-bold text-gray-400">${item.status}</span></div>
                        </div>`;
                });
            } else { finDiv.innerHTML = '<p class="text-center text-gray-400 text-xs">Sem registros.</p>'; }
        });
    }

    async function sendMessage() {
        var input = document.getElementById('p-input');
        var btnSend = document.getElementById('p-send');
        var text = input.value;
        
        if (!text && !selectedFile) return;

        btnSend.disabled = true;

        var mediaData = null;
        if (selectedFile && window.uploadToCloudinary) {
            try { mediaData = await window.uploadToCloudinary(selectedFile); } 
            catch (e) { 
                alert("Erro no upload da imagem."); 
                btnSend.disabled = false; 
                return; 
            }
        }

        // 1. Salva mensagem no banco PRIMEIRO
        var journalRef = db.ref('artifacts/' + appId + '/patients/' + myProfile.id + '/journal');
        await journalRef.push({
            text: text || (mediaData ? "Anexo" : ""),
            author: 'Paciente',
            media: mediaData,
            timestamp: new Date().toISOString()
        });
        
        input.value = '';
        selectedFile = null;
        document.getElementById('img-preview-area').classList.add('hidden');

        // 2. Agora monta o histórico COM a mensagem nova que acabou de ser enviada
        if (window.callGeminiAPI) {
            var imageUrl = mediaData ? mediaData.url : null;

            // Pega as últimas 20 mensagens para garantir contexto longo
            var snapshot = await journalRef.limitToLast(20).once('value');
            var history = "";
            
            if (snapshot.exists()) {
                snapshot.forEach(function(c) {
                    var msg = c.val();
                    if(msg.author !== 'Nota Interna') {
                        // Formatação de Roteiro de Teatro para a IA não se perder
                        var role = (msg.author === 'IA (Auto)' || msg.author === 'Dentista') ? 'JÚL-IA' : 'PACIENTE';
                        var content = msg.text;
                        if (msg.media) content += " [ENVIOU UMA FOTO]";
                        history += `${role}: ${content}\n`;
                    }
                });
            }

            var now = new Date();
            var timeString = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR');
            var dayOfWeek = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][now.getDay()];

            var context = "";
            if (aiDirectives) {
                context = `
                    ${aiDirectives}
                    
                    === DADOS DO MOMENTO ===
                    DATA ATUAL: ${timeString} (${dayOfWeek}).
                    
                    === ROTEIRO DA CONVERSA ATÉ AGORA ===
                    (Leia isso para saber o que já foi dito e NÃO se repetir)
                    ${history}
                    
                    === SUA VEZ DE FALAR ===
                    Continue a conversa a partir da última fala do PACIENTE acima.
                    Seja fluida, direta e humana.
                `;
            } else {
                context = `ATUE COMO: Secretária. DATA: ${timeString}. HISTÓRICO:\n${history}\nResponda ao paciente.`;
            }

            // Chama a IA
            var reply = await window.callGeminiAPI(context, text, imageUrl);
            
            // Salva resposta
            journalRef.push({
                text: reply, author: 'IA (Auto)', timestamp: new Date().toISOString()
            });
        }

        btnSend.disabled = false;
    }

    document.addEventListener('DOMContentLoaded', init);
})();
