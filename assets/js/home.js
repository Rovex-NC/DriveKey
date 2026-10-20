// ============================================
// DriveKey · Portada
// ============================================
(() => {
    const { CATEGORIES, SCRIPT_URL, ROVEX_CODE_HASH, UPLOAD_WARN_MB } = window.DRIVEKEY;
    const { el, icon, sha256, formatSize, toast, callScript } = window.DK;
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
    const fileFields = $('fileFields');
    const linkFields = $('linkFields');
    const linkName = $('linkName');
    const linkUrlInput = $('linkUrl');
    const uploadSub = $('uploadSub');
    const modeTabs = [...stepUpload.querySelectorAll('.mode-tab')];
    let uploading = false;
    let selectedFile = null;
    let uploadCode = ''; // código ya validado por el Apps Script (solo en memoria)
    let mode = 'file';   // 'file' = subir archivo · 'link' = añadir enlace externo

    function setMode(next) {
        mode = next;
        modeTabs.forEach(t => {
            const on = t.dataset.mode === next;
            t.classList.toggle('active', on);
            t.setAttribute('aria-selected', String(on));
        });
        fileFields.hidden = next !== 'file';
        linkFields.hidden = next !== 'link';
        uploadError.hidden = true;
        uploadSub.textContent = next === 'link'
            ? 'Se añadirá un enlace a una descarga externa en la carpeta elegida.'
            : 'El archivo se guardará en la carpeta de Drive elegida.';
        if (next === 'link') sizeWarn.hidden = true; else setFile(selectedFile);
        setUploading(false);
    }
    modeTabs.forEach(t => t.addEventListener('click', () => {
        setMode(t.dataset.mode);
        (t.dataset.mode === 'link' ? linkName : folderSelect).focus();
    }));

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
        linkName.value = '';
        linkUrlInput.value = '';
        setFile(null);
        setMode('file');
    }

    function openUpload() {
        if (!SCRIPT_URL) { toast(DK.scriptError('not_deployed').message, 'error', 6000); return; }
        resetUpload();
        uploadModal.showModal();
        accessCode.focus();
    }
    $('openUpload').addEventListener('click', openUpload);

    // El código lo comprueba el Apps Script (ya no está en la web)
    const verifyCodeBtn = stepCode.querySelector('button[type=submit]');
    stepCode.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = accessCode.value.trim();
        if (!code) return fail(accessCode, codeError, 'Escribe el código');
        verifyCodeBtn.disabled = true;
        verifyCodeBtn.replaceChildren(icon('fa-spinner', 'fa-spin'), ' Comprobando…');
        try {
            await callScript({ action: 'checkUploadCode', code });
            uploadCode = code;
            codeError.hidden = true;
            showStep(stepUpload);
            folderSelect.focus();
        } catch (err) {
            fail(accessCode, codeError, err.message);
        } finally {
            verifyCodeBtn.disabled = false;
            verifyCodeBtn.textContent = 'Verificar';
        }
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
        linkName.disabled = on;
        linkUrlInput.disabled = on;
        modeTabs.forEach(t => { t.disabled = on; });
        const idle = mode === 'link' ? ['fa-link', 'Añadir enlace'] : ['fa-upload', 'Confirmar subida'];
        confirmUpload.replaceChildren(icon(on ? 'fa-spinner' : idle[0], on ? 'fa-spin' : ''), ' ' + (label || idle[1]));
    }

    // Devuelve la URL normalizada si es https://, o null
    function validHttpsUrl(value) {
        try {
            const u = new URL(value.trim());
            return u.protocol === 'https:' && u.hostname.includes('.') ? u.href : null;
        } catch { return null; }
    }

    async function submitLink(folder) {
        const name = linkName.value.trim();
        const url = validHttpsUrl(linkUrlInput.value);
        if (!name) { showUploadError('Escribe un nombre para el enlace'); linkName.focus(); return; }
        if (!url) { showUploadError('El enlace no es válido. Tiene que empezar por https://'); linkUrlInput.focus(); return; }

        setUploading(true, 'Añadiendo enlace…');
        const result = await callScript({ action: 'addLink', code: uploadCode, folder, name, url });
        setUploading(false);
        const cat = Object.values(CATEGORIES).find(c => c.uploadKey === folder);
        stepDone.querySelector('.modal-title').textContent = '¡Enlace añadido!';
        $('doneText').textContent = `"${result.name || name}" ya aparece en ${cat ? cat.name : folder} como enlace a ${new URL(url).hostname.replace(/^www\./, '')}.`;
        showStep(stepDone);
        toast('Enlace añadido correctamente', 'success');
    }

    function readAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
            reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
            reader.readAsDataURL(file);
        });
    }

    stepUpload.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (uploading) return;
        const folder = folderSelect.value;
        if (!folder) { showUploadError('Selecciona una carpeta de destino'); folderSelect.focus(); return; }
        uploadError.hidden = true;

        if (mode === 'link') {
            try {
                await submitLink(folder);
            } catch (err) {
                console.error(err);
                setUploading(false);
                if (err.code === 'bad_password' || err.code === 'locked') {
                    showStep(stepCode);
                    fail(accessCode, codeError, err.message);
                    return;
                }
                showUploadError(err.message || 'Error al añadir el enlace');
            }
            return;
        }

        if (!selectedFile) { showUploadError('Selecciona un archivo'); return; }
        const file = selectedFile;
        try {
            setUploading(true, 'Preparando archivo…');
            const base64 = await readAsBase64(file);
            setUploading(true, 'Subiendo… no cierres la página');
            // Formulario (no JSON) para que Google descodifique bien el nombre del archivo
            const result = await callScript(new URLSearchParams({
                action: 'upload',
                code: uploadCode,
                folder,
                fileName: file.name,
                mimeType: file.type || 'application/octet-stream',
                fileData: base64
            }));
            setUploading(false);
            const cat = Object.values(CATEGORIES).find(c => c.uploadKey === folder);
            stepDone.querySelector('.modal-title').textContent = '¡Archivo subido!';
            $('doneText').textContent = `"${result.name || file.name}" se ha subido a ${cat ? cat.name : folder}.`;
            showStep(stepDone);
            toast('Archivo subido correctamente', 'success');
        } catch (err) {
            console.error(err);
            setUploading(false);
            if (err.code === 'bad_password' || err.code === 'locked') {
                // El código dejó de ser válido: vuelve a pedirlo
                showStep(stepCode);
                fail(accessCode, codeError, err.message);
                return;
            }
            showUploadError(err.message || 'Error al subir el archivo');
        }
    });

    $('uploadAnother').addEventListener('click', () => resetUpload(true));

    // Enlaces directos: index.html#rovex o index.html#subir
    if (location.hash === '#rovex') openRovex();
    if (location.hash === '#subir') openUpload();
})();
