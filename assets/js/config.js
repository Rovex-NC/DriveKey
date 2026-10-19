// ============================================
// DriveKey · Configuración central
// Todo lo que antes estaba repetido en cada página vive aquí.
// ============================================
window.DRIVEKEY = {
    // Clave pública de la API de Google Drive (solo lectura).
    // Recomendado: restringirla por "HTTP referrer" a rovex-nc.github.io en Google Cloud Console.
    API_KEY: 'AIzaSyCU4I2C3IOKeOpzmTiacU770I8rHukP2zk',

    // Google Apps Script de DriveKey (subidas + borrar desde Rovex).
    // Código en apps-script/DriveKey.gs. Pega aquí la URL de su despliegue (termina en /exec).
    // Vacío = subir y borrar desactivados.
    SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxp89iRMSX1tGctml9TczRKwkigDJ_vkitKPaqqAEvy-SaQqAz0u3NM0TXQM12EwxClTg/exec',

    // Contraseña de Rovex guardada como hash SHA-256 (solo oculta la página).
    // El código de subida y la clave de administrador NO están aquí: los comprueba el Apps Script.
    ROVEX_CODE_HASH: 'b78a31411bf1dfa69210cdba6588da3f6e631e25feea655ddcef638896f6c18b',

    // Por encima de este tamaño la subida vía Apps Script suele fallar.
    UPLOAD_WARN_MB: 35,

    // Categorías. `uploadKey` es el valor exacto que espera el Apps Script.
    CATEGORIES: {
        pokemon: {
            name: 'ROMs Pokémon',
            short: 'Pokémon',
            description: 'De Rojo Fuego a Negro, más hacks como Pokémon Z y Añil. Listas para emular.',
            icon: 'fa-gamepad',
            accent: '#ff5a5f',
            folderId: '1scEmOVW-St9EtRDpKjHEe93CIk8A7RcI',
            page: 'Drives/PokemonROMS.html',
            uploadKey: 'Pokemon'
        },
        minecraft: {
            name: 'Minecraft Mods',
            short: 'Minecraft',
            description: 'Packs de mods (Cobblemon y más), texturas y parches para Forge y Fabric.',
            icon: 'fa-cube',
            accent: '#4ade80',
            folderId: '1SPCGjjv_m_K0tTzSNNWNhrC62H1PbjRX',
            page: 'Drives/Minecraftmods.html',
            uploadKey: 'minecraft'
        },
        emuladores: {
            name: 'Emuladores y herramientas',
            short: 'Emuladores',
            description: 'Emuladores como melonDS y el software necesario para abrir los archivos.',
            icon: 'fa-screwdriver-wrench',
            accent: '#38d6ff',
            folderId: '1ZbiAsEPNZ-Lsl-1r1-lo7pt5JJAsa9GV',
            page: 'Drives/Emuladores.html',
            uploadKey: 'emuladores'
        },
        rovex: {
            name: 'Rovex',
            short: 'Rovex',
            description: 'Área privada.',
            icon: 'fa-shield-halved',
            accent: '#a78bfa',
            folderId: '1D_qApyuSNSVLYqEmM5i2lmsYZC8-Iu2J',
            page: 'Drives/Rovex.html',
            private: true
        }
    }
};

// Utilidades compartidas
window.DK = {
    async sha256(text) {
        const data = new TextEncoder().encode(text);
        const buf = await crypto.subtle.digest('SHA-256', data);
        return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    },

    // Crea elementos sin innerHTML, así los nombres de archivo nunca se interpretan como HTML.
    el(tag, attrs = {}, ...children) {
        const node = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (v === null || v === undefined || v === false) continue;
            if (k === 'class') node.className = v;
            else if (k === 'dataset') Object.assign(node.dataset, v);
            else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
            else if (k === 'style' && typeof v === 'object') {
                for (const [prop, val] of Object.entries(v)) {
                    if (prop.startsWith('--')) node.style.setProperty(prop, val); // variables CSS
                    else node.style[prop] = val;
                }
            }
            else node.setAttribute(k, v === true ? '' : v);
        }
        for (const c of children.flat()) {
            if (c === null || c === undefined || c === false) continue;
            node.append(c instanceof Node ? c : document.createTextNode(String(c)));
        }
        return node;
    },

    icon(name, extra = '') {
        const i = document.createElement('i');
        const style = name.includes('fa-brands') ? '' : 'fa-solid';
        i.className = `${style} ${name} ${extra}`.trim();
        i.setAttribute('aria-hidden', 'true');
        return i;
    },

    formatSize(bytes) {
        bytes = Number(bytes);
        if (!bytes) return '—';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const v = bytes / Math.pow(1024, i);
        return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
    },

    formatDate(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    },

    toast(message, type = 'info', ms = 3500) {
        let host = document.getElementById('toasts');
        if (!host) {
            host = DK.el('div', { id: 'toasts', class: 'toasts', 'aria-live': 'polite' });
            document.body.append(host);
        }
        const icons = { info: 'fa-circle-info', success: 'fa-circle-check', error: 'fa-triangle-exclamation' };
        const t = DK.el('div', { class: `toast toast-${type}` }, DK.icon(icons[type] || icons.info), DK.el('span', {}, message));
        host.append(t);
        setTimeout(() => { t.classList.add('leaving'); setTimeout(() => t.remove(), 300); }, ms);
    },

    storage: {
        get(key, fallback = null) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
        set(key, value) { try { localStorage.setItem(key, value); } catch { /* modo privado */ } }
    },

    // Llamada a la API de Drive con paginación completa (antes se cortaba en 1000 elementos).
    async listFolder(folderId, signal) {
        const { API_KEY } = window.DRIVEKEY;
        const fields = 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink)';
        let files = [];
        let pageToken = '';
        do {
            const params = new URLSearchParams({
                q: `'${folderId}' in parents and trashed = false`,
                key: API_KEY,
                fields,
                pageSize: '1000',
                orderBy: 'folder,name'
            });
            if (pageToken) params.set('pageToken', pageToken);
            const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, { signal });
            if (!res.ok) throw await DK.driveError(res);
            const data = await res.json();
            files = files.concat(data.files || []);
            pageToken = data.nextPageToken || '';
        } while (pageToken);
        return files;
    },

    // Llamada al Apps Script. `body` puede ser:
    //  - un objeto → se envía como JSON en texto plano
    //  - URLSearchParams → se envía como formulario (subidas)
    // Ambos son peticiones "simples" (sin preflight CORS) y la respuesta JSON se puede leer.
    async callScript(body) {
        const { SCRIPT_URL } = window.DRIVEKEY;
        if (!SCRIPT_URL) throw DK.scriptError('not_deployed');
        let res;
        try {
            res = await fetch(SCRIPT_URL, {
                method: 'POST',
                body: body instanceof URLSearchParams ? body : JSON.stringify(body)
            });
        } catch {
            throw new Error('No se pudo conectar con el Apps Script. Revisa tu conexión.');
        }
        if (!res.ok) throw new Error(`El Apps Script respondió con error ${res.status}.`);
        let data;
        try { data = await res.json(); } catch {
            throw new Error('Respuesta inesperada del Apps Script. Revisa que esté desplegado con acceso "Cualquier usuario".');
        }
        if (!data.ok) throw DK.scriptError(data.error, data.message);
        return data;
    },

    scriptError(code, detail) {
        const messages = {
            not_deployed: 'Esta función aún no está configurada (falta SCRIPT_URL en config.js).',
            bad_password: 'Clave incorrecta.',
            locked: 'Demasiados intentos fallidos. Espera 15 minutos.',
            not_configured: 'Falta configurar la clave en las propiedades del Apps Script.',
            bad_folder: 'Carpeta de destino no válida.',
            missing_file: 'No se recibió el archivo.',
            unknown_action: 'El Apps Script no reconoce la acción. ¿Está actualizado?',
            server_error: 'Error en el Apps Script' + (detail ? `: ${detail}` : '.')
        };
        const err = new Error(messages[code] || code || 'Error desconocido');
        err.code = code;
        return err;
    },

    async driveError(res) {
        let reason = '';
        try { reason = (await res.json())?.error?.message || ''; } catch { /* sin cuerpo */ }
        if (res.status === 403) return new Error('Google Drive ha rechazado la petición (límite de uso o clave restringida). Inténtalo en unos minutos.');
        if (res.status === 404) return new Error('No se encontró esta carpeta. Puede que se haya movido o ya no sea pública.');
        return new Error(reason || `Error ${res.status} al conectar con Google Drive`);
    }
};
