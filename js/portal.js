// ==================================================================
// MÓDULO PORTAL DO PACIENTE (CORRIGIDO)
// ==================================================================
(function() {
    var config = window.AppConfig;
    var appId = config.APP_ID;
    var db, auth, currentUser, myProfile, myDentistUid, selectedFile;

    function init() {
        if (!firebase.apps.length) firebase.initializeApp(config.firebaseConfig);
        db = firebase.database();
        auth = firebase.auth();

        auth.onAuthStateChanged(function(user) {
            if (user) {
                currentUser = user;
                findMyData(user.email);
            } else {
                showLogin();
            }
        });

        document.getElementById('p-login-form').addEventListener('submit', handleLogin);
        document.getElementById('p-logout').addEventListener('click', function() { auth.signOut(); });
        document.getElementById('p-send').addEventListener('click', sendMessage);
        
        var fileInput = document.getElementById('file-input');
        document.getElementById('btn-camera').addEventListener('click', function() { fileInput.click(); });
        fileInput.addEventListener('change', function(e) {
            if (e.target.files[0]) {
                selectedFile = e.target.files[0];
                document.getElementById('img-preview-area').classList.remove('hidden');
                document.getElementById('img-name').textContent = selectedFile.name;
            }
        });
        document.getElementById('remove-img').addEventListener('click', function() {
            selectedFile = null; fileInput.value = '';
            document.getElementById('img-preview-area').classList.add('hidden');
        });
    }

    async function handleLogin(e) {
        e.preventDefault();
        var email = document.getElementById('p-email').value;
        var pass = document.getElementById('p-pass').value;
        try { await auth.signInWithEmailAndPassword(email, pass); } 
        catch (error) { alert("Erro: " + error.message); }
    }

    function showLogin() {
        document.getElementById('patient-login').classList.remove('hidden');
        document.getElementById('patient-app').classList.add('hidden');
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
                            }
                        }
                    }
                });
            }
            if (found) loadInterface();
            else { alert("Email não encontrado na base."); auth.signOut(); }
        });
    }

    function loadInterface() {
        document.getElementById('patient-login').classList.add('hidden');
        document.getElementById('patient-app').classList.remove('hidden');
        document.getElementById('p-name').textContent = myProfile.name;
        document.getElementById('p-treatment').textContent = myProfile.treatmentType;
        document.getElementById('p-status').textContent = 'Ativo';
        loadTimeline();
        loadFinance();
    }

    function loadTimeline() {
        var timelineDiv = document.getElementById('p-timeline');
        var journalRef = db.ref('artifacts/' + appId + '/patients/' + myProfile.id + '/journal');
        
        journalRef.on('value', function(snap) {
            timelineDiv.innerHTML = ''; // LIMPEZA CRÍTICA
            if (snap.exists()) {
                snap.forEach(function(c) {
                    var msg = c.val();
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
        var text = input.value;
        if (!text && !selectedFile) return;

        var mediaData = null;
        if (selectedFile && window.uploadToCloudinary) {
            try { mediaData = await window.uploadToCloudinary(selectedFile); } catch (e) { alert("Erro ao enviar imagem."); return; }
        }

        db.ref('artifacts/' + appId + '/patients/' + myProfile.id + '/journal').push({
            text: text || (mediaData ? "Anexo" : ""),
            author: 'Paciente',
            media: mediaData,
            timestamp: new Date().toISOString()
        });
        
        input.value = '';
        selectedFile = null;
        document.getElementById('img-preview-area').classList.add('hidden');

        if (window.callGeminiAPI && text) {
            var reply = await window.callGeminiAPI(`Paciente ${myProfile.name} disse: "${text}". Responda curto.`, text);
            db.ref('artifacts/' + appId + '/patients/' + myProfile.id + '/journal').push({
                text: reply, author: 'IA (Auto)', timestamp: new Date().toISOString()
            });
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
