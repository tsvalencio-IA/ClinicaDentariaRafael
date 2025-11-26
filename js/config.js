// =====================================================================
// 🔑 ARQUIVO DE CONFIGURAÇÃO: js/config.js
// FUNÇÃO DE INICIALIZAÇÃO IMEDIATA (IIFE) PARA EVITAR COLISÃO DE ESCOPO
// =====================================================================

(function() {
    // 1. CONFIGURAÇÃO FIREBASE (SEUS DADOS REAIS: dental-80cad)
    const firebaseConfig = {
        apiKey: "AIzaSyBs1EWOvZXw52Ih-m_mhsCofRcjmxY8xQw",
        authDomain: "dental-80cad.firebaseapp.com",
        databaseURL: "https://dental-80cad-default-rtdb.firebaseio.com", 
        projectId: "dental-80cad",
        storageBucket: "dental-80cad.firebasestorage.app",
        messagingSenderId: "883904798384",
        appId: "1:883904798384:web:df25e88c245d4edc1ba575"
    }; 

    // Token inicial (Null para exigir login manual)
    const initialAuthToken = null; 

    // 2. CONFIGURAÇÃO CLOUDINARY (SEUS DADOS REAIS)
    const CLOUDINARY_CLOUD_NAME = "djtiaygrs";
    const CLOUDINARY_UPLOAD_PRESET = "dental";

    // 3. CONFIGURAÇÃO GOOGLE GEMINI API
    // ATENÇÃO: Cole sua chave do Google AI Studio abaixo
    const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";
    const API_KEY = "AIzaSyDsYMaPEILVKdqeOcgq0hK-2Lw5stRtzIs"; 

    // 4. ID INTERNO DO APP
    const APP_ID = 'dentista-inteligente-app';

    // 5. ITENS DE NAVEGAÇÃO
    const NAV_ITEMS = [
        { id: 'dashboard', label: 'Dashboard & IA', icon: 'bxs-dashboard' },
        { id: 'patients', label: 'Gestão de Pacientes', icon: 'bxs-group' },
        { id: 'financials', label: 'Financeiro & Estoque', icon: 'bxs-wallet' },
    ];

    // Exporta SOMENTE O OBJETO AppConfig para o escopo global (window)
    window.AppConfig = {
        firebaseConfig,
        initialAuthToken,
        CLOUDINARY_CLOUD_NAME,
        CLOUDINARY_UPLOAD_PRESET,
        GEMINI_MODEL,
        API_KEY,
        APP_ID,
        NAV_ITEMS
    };
})();
