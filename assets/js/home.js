// ============================================
// DriveKey · Portada
// ============================================
(() => {
    const { CATEGORIES, SCRIPT_URL, UPLOAD_CODE_HASH, ROVEX_CODE_HASH, UPLOAD_WARN_MB } = window.DRIVEKEY;
    const { el, icon, sha256, formatSize, toast } = window.DK;
    const $ = (id) => document.getElementById(id);

    document.getElementById('year').textContent = new Date().getFullYear();

    // ==========================================
    // TARJETAS DE CATEGORÍA
    // ==========================================
    const cardsHost = $('categoryCards');
    // Rovex no sale como tarjeta: es privado y solo se accede desde la barra superior.
    Object.values(CATEGORIES).filter(c => !c.private).forEach((cat, i) => {
        const count = el('span', { class: 'card-count' }, icon(cat.private ? 'fa-lock' : 'fa-spinner', cat.private ? '' : 'fa-spin'), cat.private ? 'Protegido' : 'Cargando…');
        const card = el('a', {
            href: cat.page,
            class: `card fade-up${cat.private ? ' locked' : ''}`,
            style: { '--accent': cat.accent, animationDelay: `${0.05 * i + 0.1}s` },
            onclick: cat.private ? (e) => { e.preventDefault(); openRovex(); } : null
        },
            el('div', { class: 'card-icon' }, icon(cat.icon)),
            el('h3', {}, cat.name),
            el('p', {}, cat.description),
            el('div', { class: 'card-foot' }, count, icon('fa-arrow-right', 'card-arrow'))
        );
        cardsHost.append(card);

        if (!cat.private) {
            DK.listFolder(cat.folderId)
                .then(files => {
                    const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder').length;
                    const docs = files.length - folders;
                    const parts = [];
                    if (folders) parts.push(`${folders} carpeta${folders === 1 ? '' : 's'}`);
                    if (docs) parts.push(`${docs} archivo${docs === 1 ? '' : 's'}`);
                    count.replaceChildren(icon('fa-folder-open'), parts.join(' · ') || 'Vacío');
                })
                .catch(() => count.replaceChildren(icon('fa-folder-open'), 'Abrir'));
        }
    });

    // ==========================================
    // UTILIDADES DE MODAL
    // ==========================================
    function wireDialog(dialog, { canClose = () => true } = {}) {
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog && canClose()) dialog.close(); // clic fuera
            if (e.target.closest('[data-close]') && canClose()) dialog.close();
        });
        dialog.addEventListener('cancel', (e) => { if (!canClose()) e.preventDefault(); }); // tecla Esc
    }

    function fail(input, errorEl, message) {
        if (message) errorEl.lastChild.textContent = ' ' + message;
        errorEl.hidden = false;
        input.value = '';
        input.classList.remove('shake');
        void input.offsetWidth; // reinicia la animación
        input.classList.add('shake');
        input.focus();
    }

    // ==========================================
    // ROVEX
    // ==========================================
    const rovexModal = $('rovexModal');
    const rovexPassword = $('rovexPassword');
    const rovexError = $('rovexError');
    wireDialog(rovexModal);

    function openRovex() {
        rovexPassword.value = '';
        rovexError.hidden = true;
        rovexModal.showModal();
        rovexPassword.focus();
    }
    $('openRovex').addEventListener('click', openRovex);

    $('rovexForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const ok = (await sha256(rovexPassword.value.trim())) === ROVEX_CODE_HASH;
        if (!ok) return fail(rovexPassword, rovexError);
        try { sessionStorage.setItem('dk-rovex', '1'); } catch { /* modo privado */ }
        window.location.href = CATEGORIES.rovex.page;
    });

    // ==========================================
    // SUBIDA DE ARCHIVOS
    // ==========================================
    const uploadModal = $('uploadModal');
    const stepCode = $('stepCode');
    const stepUpload = $('stepUpload');
    const stepDone = $('stepDone');
    const accessCode = $('accessCode');
    const codeError = $('codeError');
    const folderSelect = $('folderSelect');
    const fileInput = $('fileInput');
    const dropzone = $('dropzone');
    const fileInfo = $('fileInfo');
    const sizeWarn = $('sizeWarn');
    const uploadError = $('uploadError');
    const confirmUpload = $('confirmUpload');
    let uploading = false;
    let selectedFile = null;

    // Opciones del desplegable desde config.js (mismo valor que espera el Apps Script)
    Object.values(CATEGORIES).filter(c => c.uploadKey).forEach(c => {
        folderSelect.append(el('option', { value: c.uploadKey }, c.name));
    });

    wireDialog(uploadModal, {
        canClose: () => {
            if (uploading) toast('Espera a que termine la subida', 'info');
            return !uploading;
        }
    });

    function showStep(step) {
        [stepCode, stepUpload, stepDone].forEach(s => { s.hidden = s !== step; });
    }

    function resetUpload(keepAccess = false) {
        showStep(keepAccess ? stepUpload : stepCode);
        accessCode.value = '';
        codeError.hidden = true;
        uploadError.hidden = true;
        folderSelect.value = '';
        setFile(null);
    }

    function openUpload() {
        resetUpload();
        uploadModal.showModal();
        accessCode.focus();
    }
    $('openUpload').addEventListener('click', openUpload);

    stepCode.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ok = (await sha256(accessCode.value.trim())) === UPLOAD_CODE_HASH;
        if (!ok) return fail(accessCode, codeError);
        codeError.hidden = true;
        showStep(stepUpload);
        folderSelect.focus();
    });

    function setFile(file) {
        selectedFile = file;
        uploadError.hidden = true;
        if (!file) {
            fileInput.value = '';
            fileInfo.hidden = true;
            sizeWarn.hidden = true;
            return;
        }
        fileInfo.replaceChildren(icon('fa-file'), el('span', { class: 'name' }, file.name), el('span', { class: 'size' }, formatSize(file.size)));
        fileInfo.hidden = false;
        const tooBig = file.size > UPLOAD_WARN_MB * 1024 * 1024;
        sizeWarn.hidden = !tooBig;
        if (tooBig) sizeWarn.querySelector('span').textContent =
            `Este archivo pesa más de ${UPLOAD_WARN_MB} MB. Puede que Google Apps Script lo rechace; si falla, súbelo directamente a Drive.`;
    }

    fileInput.addEventListener('change', () => setFile(fileInput.files[0] || null));

    ['dragenter', 'dragover'].forEach(ev => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('over'); }));
    dropzone.addEventListener('drop', (e) => {
        const file = e.dataTransfer?.files?.[0];
        if (file) setFile(file);
    });

    function showUploadError(message) {
        uploadError.replaceChildren(icon('fa-triangle-exclamation'), ' ' + message);
        uploadError.hidden = false;
    }

    function setUploading(on, label) {
        uploading = on;
        confirmUpload.disabled = on;
        folderSelect.disabled = on;
        fileInput.disabled = on;
        confirmUpload.replaceChildren(icon(on ? 'fa-spinner' : 'fa-upload', on ? 'fa-spin' : ''), ' ' + (label || 'Confirmar subida'));
    }

    function readAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
            reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
            reader.readAsDataURL(file);
        });
    }

    // Envía el formulario al Apps Script a través de un iframe oculto
    // (mismos campos que antes: folder, fileName, mimeType, fileData).
    function postToAppsScript(fields) {
        return new Promise((resolve) => {
            const name = `dk-upload-${Date.now()}`;
            const iframe = el('iframe', { name, hidden: true, title: 'upload' });
            const form = el('form', { method: 'POST', action: SCRIPT_URL, target: name, hidden: true },
                Object.entries(fields).map(([k, v]) => {
                    const input = el('input', { type: 'hidden', name: k });
                    input.value = v; // propiedad, no atributo: más ligero con archivos grandes
                    return input;
                }));
            document.body.append(iframe, form);

            // El iframe vacío dispara un "load" inicial (about:blank). Antes eso marcaba la
            // subida como terminada antes de tiempo; ahora solo escuchamos después de enviar.
            setTimeout(() => {
                iframe.addEventListener('load', () => {
                    resolve();
                    setTimeout(() => { iframe.remove(); form.remove(); }, 1000);
                }, { once: true });
                form.submit();
            }, 50);
        });
    }

    stepUpload.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (uploading) return;
        const folder = folderSelect.value;
        if (!folder) { showUploadError('Selecciona una carpeta de destino'); folderSelect.focus(); return; }
        if (!selectedFile) { showUploadError('Selecciona un archivo'); return; }

        const file = selectedFile;
        uploadError.hidden = true;
        try {
            setUploading(true, 'Preparando archivo…');
            const base64 = await readAsBase64(file);
            setUploading(true, 'Subiendo… no cierres la página');
            await postToAppsScript({
                folder,
                fileName: file.name,
                mimeType: file.type || 'application/octet-stream',
                fileData: base64
            });
            setUploading(false);
            const cat = Object.values(CATEGORIES).find(c => c.uploadKey === folder);
            $('doneText').textContent = `"${file.name}" se ha enviado a ${cat ? cat.name : folder}. Puede tardar unos segundos en aparecer en Drive.`;
            showStep(stepDone);
            toast('Archivo subido correctamente', 'success');
        } catch (err) {
            console.error(err);
            setUploading(false);
            showUploadError(err.message || 'Error al subir el archivo');
        }
    });

    $('uploadAnother').addEventListener('click', () => resetUpload(true));

    // Enlaces directos: index.html#rovex o index.html#subir
    if (location.hash === '#rovex') openRovex();
    if (location.hash === '#subir') openUpload();
})();
