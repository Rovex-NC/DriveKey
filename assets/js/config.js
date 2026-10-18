// ============================================
// DriveKey · Configuración central
// Todo lo que antes estaba repetido en cada página vive aquí.
// ============================================
window.DRIVEKEY = {
    // Clave pública de la API de Google Drive (solo lectura).
    // Recomendado: restringirla por "HTTP referrer" a rovex-nc.github.io en Google Cloud Console.
    API_KEY: 'AIzaSyDWMF7tNTmK-66_8IFAptrtB8TIMQndJLk',

    // Google Apps Script que recibe las subidas.
    SCRIPT_URL: 'https://script.google.com/macros/s/AKfycby18K8YRQKZUBvzdUdUwvl-09md8gElORIGQjVOH0fb8KubIC28FP4vWZBFfBP53hj7WA/exec',

    // Códigos guardados como hash SHA-256 (ya no se ven en texto plano en el código fuente).
    // Para cambiar uno: calcula el SHA-256 del nuevo código y pégalo aquí.
    UPLOAD_CODE_HASH: '61c3268ae4de3061999c69bb3033bf49fb6de96d4485a33fbc502e4dae0d85b9',
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
            accent: '#ef4444',
            folderId: '1yfYEp-k3k0OpLcewOFSoP3MryzsD5YRH',
            page: 'Drives/PokemonROMS.html',
            uploadKey: 'Pokemon'
        },
        minecraft: {
            name: 'Minecraft Mods',
            short: 'Minecraft',
            description: 'Packs de mods (Cobblemon y más), texturas y parches para Forge y Fabric.',
            icon: 'fa-cube',
            accent: '#22c55e',
            folderId: '1osB40eDY9Kjz50H6BII2vjsEIufPo6d-',
            page: 'Drives/Minecraftmods.html',
            uploadKey: 'minecraft'
        },
        emuladores: {
            name: 'Emuladores y herramientas',
            short: 'Emuladores',
            description: 'Emuladores como melonDS y el software necesario para abrir los archivos.',
            icon: 'fa-screwdriver-wrench',
            accent: '#38bdf8',
            folderId: '1OMG15Q-0wZWEE3tnaQ0renZ_Atrp2Pyr',
            page: 'Drives/Emuladores.html',
            uploadKey: 'emuladores'
        },
        rovex: {
            name: 'Rovex',
            short: 'Rovex',
            description: 'Área privada.',
            icon: 'fa-shield-halved',
            accent: '#a78bfa',
            folderId: '1w5ETzF7gdpXCAnUgiLdgUCfX166sgQ5G',
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

    async driveError(res) {
        let reason = '';
        try { reason = (await res.json())?.error?.message || ''; } catch { /* sin cuerpo */ }
        if (res.status === 403) return new Error('Google Drive ha rechazado la petición (límite de uso o clave restringida). Inténtalo en unos minutos.');
        if (res.status === 404) return new Error('No se encontró esta carpeta. Puede que se haya movido o ya no sea pública.');
        return new Error(reason || `Error ${res.status} al conectar con Google Drive`);
    }
};
