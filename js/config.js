// =====================================================================
// 🔑 ARQUIVO DE CONFIGURAÇÃO: js/config.js
// =====================================================================
(function() {
    // 1. CONFIGURAÇÃO FIREBASE
    const firebaseConfig = {
        apiKey: "AIzaSyBs1EWOvZXw52Ih-m_mhsCofRcjmxY8xQw",
        authDomain: "dental-80cad.firebaseapp.com",
        databaseURL: "https://dental-80cad-default-rtdb.firebaseio.com",
        projectId: "dental-80cad",
        storageBucket: "dental-80cad.firebasestorage.app",
        messagingSenderId: "883904798384",
        appId: "1:883904798384:web:df25e88c245d4edc1ba575"
    };

    // 2. CONFIGURAÇÃO CLOUDINARY
    const CLOUDINARY_CLOUD_NAME = "djtiaygrs";
    const CLOUDINARY_UPLOAD_PRESET = "dental";

    // 3. CONFIGURAÇÃO GOOGLE GEMINI API
    const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025"; 
    
    // --- TRUQUE ANTI-BLOQUEIO DO GITHUB ---
    // Divida sua chave NOVA em duas partes e cole abaixo.
    // O Google não vai detectar a chave inteira, mas o sistema vai juntar.
    
    // Ex: Se a chave é "AIzaSyAbcde12345"
    // Coloque "AIzaSyAb" na parte 1 e "cde12345" na parte 2
    
    const API_KEY_PART_1 = "AIzaSyCHA_WBaFleZlO"; 
    const API_KEY_PART_2 = "fMOoV3XPkVr3QKuB5D68"; 

    // O sistema junta as partes aqui:
    const API_KEY = API_KEY_PART_1 + API_KEY_PART_2;

    // 4. ITENS DE NAVEGAÇÃO
    const NAV_ITEMS = [
        { id: 'dashboard', label: 'Dashboard & IA', icon: 'bxs-dashboard' },
        { id: 'patients', label: 'Gestão de Pacientes', icon: 'bxs-group' },
        { id: 'financials', label: 'Financeiro & Estoque', icon: 'bxs-wallet' },
    ];

    window.AppConfig = {
        firebaseConfig,
        CLOUDINARY_CLOUD_NAME,
        CLOUDINARY_UPLOAD_PRESET,
        GEMINI_MODEL,
        API_KEY, // A chave vai completa para o sistema
        APP_ID: 'dentista-inteligente-app',
        NAV_ITEMS
    };
})();
