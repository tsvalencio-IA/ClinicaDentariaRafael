// =====================================================================
// 🖼️ MÓDULO DE UPLOAD CLOUDINARY: js/cloudinary.js
// ENCAPSULADO EM IIFE PARA EVITAR COLISÃO DE ESCOPO GLOBAL.
// =====================================================================

(function() {
    // Desestrutura dentro do escopo local da IIFE
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } = window.AppConfig;

    /**
     * Faz o upload de um arquivo para o Cloudinary.
     * @param {File} file - O objeto File (imagem ou pdf) a ser enviado.
     * @returns {Promise<Object>} Um objeto contendo a URL segura e o tipo do arquivo.
     */
    const uploadToCloudinary = async (file) => {
        if (!file) {
            throw new Error("Nenhum arquivo fornecido para upload.");
        }
        if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
            throw new Error("As credenciais do Cloudinary (CLOUD_NAME ou UPLOAD_PRESET) não estão configuradas em js/config.js.");
        }

        // O Cloudinary utiliza o FormData para uploads
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        
        // Configurações opcionais (recomendado para segurança)
        formData.append('folder', 'dentista_ia_uploads');

        const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorBody = await response.json();
                throw new Error(`Falha no Upload para Cloudinary: ${errorBody.error.message}`);
            }

            const data = await response.json();
            
            // Retorna apenas os dados essenciais
            return { 
                url: data.secure_url, 
                type: data.resource_type === 'image' ? data.format : 'application/pdf',
                name: file.name
            };

        } catch (error) {
            console.error("Erro durante o upload para Cloudinary:", error);
            throw new Error(`Erro de conexão/upload: ${error.message}`);
        }
    };

    // Exporta APENAS a função para o escopo global
    window.uploadToCloudinary = uploadToCloudinary;
})();
