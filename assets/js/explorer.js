// ============================================
// DriveKey · Explorador de carpetas de Drive
// Una sola implementación para todas las páginas de /Drives.
// Cada página solo indica su categoría: <body data-category="pokemon">
// ============================================
(() => {
    const { CATEGORIES } = window.DRIVEKEY;
    const { el, icon, formatSize, formatDate, toast, storage } = window.DK;

    const ROOT = '../'; // las páginas viven en /Drives
    const FOLDER_MIME = 'application/vnd.google-apps.folder';
    const BIG_FILE = 100 * 1024 * 1024; // a partir de aquí Google muestra el aviso de antivirus

    const catKey = document.body.dataset.category;
    const cat = CATEGORIES[catKey];
    if (!cat) { document.body.textContent = 'Categoría desconocida'; return; }
    document.documentElement.style.setProperty('--accent', cat.accent);

    // ==========================================
    // TIPOS DE ARCHIVO
    // ==========================================
    const TYPES = {
        folder:  { label: 'Carpeta',     icon: 'fa-folder',          color: '#f5b942' },
        rom:     { label: 'ROM',         icon: 'fa-gamepad',         color: '#ef4444' },
        mod:     { label: 'Mod',         icon: 'fa-cube',            color: '#22c55e' },
        archive: { label: 'Comprimido',  icon: 'fa-file-zipper',     color: '#f59e0b' },
        app:     { label: 'Programa',    icon: 'fa-microchip',       color: '#38bdf8' },
        image:   { label: 'Imagen',      icon: 'fa-image',           color: '#ec4899' },
        video:   { label: 'Vídeo',       icon: 'fa-film',            color: '#a855f7' },
        audio:   { label: 'Audio',       icon: 'fa-music',           color: '#14b8a6' },
        pdf:     { label: 'PDF',         icon: 'fa-file-pdf',        color: '#f87171' },
        doc:     { label: 'Documento',   icon: 'fa-file-lines',      color: '#60a5fa' },
        save:    { label: 'Partida/datos', icon: 'fa-floppy-disk',   color: '#a3a9bf' },
        other:   { label: 'Archivo',     icon: 'fa-file',            color: '#8b93ad' }
    };
    const EXT = {
        rom: ['nds', 'gba', 'gb', 'gbc', '3ds', 'cia', 'nes', 'sfc', 'smc', 'n64', 'z64', 'v64', 'iso', 'cso', 'xci', 'nsp', 'wbfs', 'rvz', 'gcm', 'nsz', 'srl'],
        mod: ['jar', 'mrpack', 'mcpack', 'mcaddon', 'mcworld', 'litemod'],
        archive: ['zip', 'rar', '7z', 'tar', 'gz', 'xz', 'bz2'],
        app: ['exe', 'msi', 'apk', 'dmg', 'appimage', 'deb', 'bat'],
        save: ['sav', 'rxdata', 'dsv', 'srm', 'state', 'ips', 'ups', 'bps', 'xdelta'],
        doc: ['txt', 'md', 'doc', 'docx', 'odt', 'rtf', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'json', 'ini', 'cfg']
    };
    const PREVIEWABLE = new Set(['image', 'video', 'audio', 'pdf', 'doc']);
    const THUMB_TYPES = new Set(['image', 'video', 'pdf']); // tipos con miniatura de Drive

    function typeOf(file) {
        if (file.mimeType === FOLDER_MIME) return 'folder';
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        for (const [type, list] of Object.entries(EXT)) if (list.includes(ext)) return type;
        const m = file.mimeType || '';
        if (m.startsWith('image/')) return 'image';
        if (m.startsWith('video/')) return 'video';
        if (m.startsWith('audio/')) return 'audio';
        if (m === 'application/pdf') return 'pdf';
        if (/zip|rar|7z|compressed/.test(m)) return 'archive';
        if (m.startsWith('application/vnd.google-apps') || m.startsWith('text/') || /document|sheet|presentation|msword/.test(m)) return 'doc';
        return 'other';
    }

    const links = {
        download: (f) => `https://drive.google.com/uc?export=download&id=${encodeURIComponent(f.id)}`,
        view: (f) => f.webViewLink || `https://drive.google.com/file/d/${encodeURIComponent(f.id)}/view`,
        preview: (f) => `https://drive.google.com/file/d/${encodeURIComponent(f.id)}/preview`,
        folder: (id) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`
    };

    // ==========================================
    // MODO ADMINISTRADOR (solo en la página de Rovex)
    // La clave se comprueba en el Apps Script de admin, nunca en el navegador.
    // ==========================================
    const { ADMIN_URL } = window.DRIVEKEY;
    const isRovex = catKey === 'rovex';
    const ALL_ID = '__all__'; // raíz virtual con todas las categorías
    const session = {
        get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
        set(k, v) { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* modo privado */ } }
    };
    let adminPass = isRovex && ADMIN_URL ? session.get('dk-admin') : null;
    const isAdmin = () => !!adminPass;
    const rootEntry = () => isAdmin() ? { id: ALL_ID, name: 'Todo DriveKey' } : { id: cat.folderId, name: 'Inicio' };
    const selected = new Map(); // id -> file

    // ==========================================
    // ESTADO
    // ==========================================
    const state = {
        path: [rootEntry()],
        files: [],
        query: '',
        filter: 'all',
        sort: storage.get('dk-sort', 'name'),
        view: storage.get('dk-view', 'grid'),
        loadCtrl: null
    };
    const folderCache = new Map(); // id -> files[]
    const current = () => state.path[state.path.length - 1];

    // ==========================================
    // MAQUETA
    // ==========================================
    const catNav = (extraClass) => el('div', { class: `cat-switch ${extraClass || ''}` },
        Object.entries(CATEGORIES).filter(([, c]) => !c.private || c === cat).map(([k, c]) =>
            el('a', { href: ROOT + c.page, class: `cat-pill${k === catKey ? ' active' : ''}`, style: { '--pill-accent': c.accent }, 'aria-current': k === catKey ? 'page' : null },
                icon(c.icon), c.short)));

    const searchInput = el('input', { type: 'search', class: 'input', placeholder: 'Buscar en esta categoría…', 'aria-label': 'Buscar archivos', autocomplete: 'off' });
    const searchKbd = el('kbd', {}, '/');
    const searchClear = el('button', { type: 'button', class: 'clear', 'aria-label': 'Borrar búsqueda', hidden: true }, icon('fa-xmark'));
    const sortSelect = el('select', { class: 'select select-sm', 'aria-label': 'Ordenar' },
        el('option', { value: 'name' }, 'Nombre (A-Z)'),
        el('option', { value: 'recent' }, 'Más recientes'),
        el('option', { value: 'size' }, 'Más pesados'));
    const btnBack = el('button', { type: 'button', class: 'icon-btn', title: 'Carpeta anterior', 'aria-label': 'Carpeta anterior' }, icon('fa-arrow-left'));
    const btnGrid = el('button', { type: 'button', class: 'icon-btn', title: 'Cuadrícula', 'aria-label': 'Vista de cuadrícula' }, icon('fa-table-cells-large'));
    const btnList = el('button', { type: 'button', class: 'icon-btn', title: 'Lista', 'aria-label': 'Vista de lista' }, icon('fa-list'));
    const btnDrive = el('a', { class: 'icon-btn', title: 'Abrir carpeta en Google Drive', 'aria-label': 'Abrir carpeta en Google Drive', target: '_blank', rel: 'noopener' }, icon('fa-arrow-up-right-from-square'));
    const crumbs = el('nav', { class: 'crumbs', 'aria-label': 'Ruta' });
    const chips = el('div', { class: 'chips', role: 'toolbar', 'aria-label': 'Filtrar por tipo' });
    const searchStatus = el('p', { class: 'search-status', hidden: true });
    const filesHost = el('div', { class: 'files', 'aria-live': 'polite' });
    const statFolders = el('b', {}, '–');
    const statFiles = el('b', {}, '–');
    const statSize = el('b', {}, '–');
    const subtitle = el('p', {}, cat.description);
    const btnAdmin = isRovex ? el('button', { type: 'button', class: 'icon-btn admin-toggle', title: 'Modo administrador', 'aria-label': 'Modo administrador' }, icon('fa-user-shield')) : null;
    const selCount = el('span', {});
    const adminBar = el('div', { class: 'admin-bar', hidden: true },
        el('span', { class: 'admin-badge' }, icon('fa-user-shield'), ' Modo administrador'),
        el('span', { class: 'admin-hint' }, 'Marca archivos o carpetas para borrarlos. Van a la papelera de Drive (30 días).'),
        el('div', { class: 'admin-actions' },
            selCount,
            el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => clearSelection() }, 'Desmarcar'),
            el('button', { type: 'button', class: 'btn btn-danger btn-sm', onclick: () => confirmDelete([...selected.values()]) }, icon('fa-trash-can'), 'Borrar seleccionados')
        )
    );

    const app = document.getElementById('app');
    app.replaceChildren(
        el('nav', { class: 'nav' }, el('div', { class: 'container' },
            el('a', { href: ROOT, class: 'logo' }, el('span', { class: 'logo-mark' }, icon('fa-key')), 'DriveKey'),
            catNav(),
            el('a', { href: ROOT + 'index.html#subir', class: 'btn btn-primary' }, icon('fa-cloud-arrow-up'), el('span', { class: 'label' }, 'Subir'))
        )),
        el('main', { class: 'container' },
            el('header', { class: 'ex-head' },
                el('div', { class: 'ex-icon' }, icon(cat.icon)),
                el('div', { class: 'ex-title' }, el('h1', {}, cat.name), subtitle),
                el('div', { class: 'ex-stats' },
                    el('div', { class: 'stat' }, icon('fa-folder'), el('div', {}, statFolders, ' ', el('span', {}, 'carpetas'))),
                    el('div', { class: 'stat' }, icon('fa-file'), el('div', {}, statFiles, ' ', el('span', {}, 'archivos'))),
                    el('div', { class: 'stat' }, icon('fa-weight-hanging'), el('div', {}, statSize, ' ', el('span', {}, 'en total')))
                ),
                catNav('mobile-cats')
            ),
            el('section', { class: 'panel' },
                el('div', { class: 'toolbar' },
                    btnBack,
                    el('div', { class: 'search' }, icon('fa-magnifying-glass'), searchInput, searchKbd, searchClear),
                    sortSelect,
                    el('div', { class: 'view-toggle' }, btnGrid, btnList, btnDrive, btnAdmin)
                ),
                adminBar,
                el('div', { class: 'subbar' }, crumbs, chips),
                searchStatus,
                filesHost
            )
        ),
        el('footer', { class: 'footer' }, el('div', { class: 'container' },
            el('span', {}, '© ', String(new Date().getFullYear()), ' DriveKey Project'),
            el('a', { href: ROOT }, icon('fa-house'), ' Volver al inicio')
        ))
    );
    document.title = `${cat.name} · DriveKey`;
    sortSelect.value = state.sort;

    // ==========================================
    // CARGA DE CARPETAS
    // ==========================================
    async function getFolder(id, signal) {
        if (id === ALL_ID) {
            return Object.values(CATEGORIES).map(c => ({ id: c.folderId, name: c.name, mimeType: FOLDER_MIME, virtualRoot: true }));
        }
        if (folderCache.has(id)) return folderCache.get(id);
        const files = await DK.listFolder(id, signal);
        folderCache.set(id, files);
        return files;
    }

    async function load() {
        state.loadCtrl?.abort();
        const ctrl = state.loadCtrl = new AbortController();
        const folder = current();
        renderChrome();
        showSkeleton();
        try {
            const files = await getFolder(folder.id, ctrl.signal);
            if (ctrl.signal.aborted) return;
            state.files = files;
            updateStats();
            render();
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.error(err);
            showState('error', 'fa-triangle-exclamation', 'No se pudo cargar la carpeta', err.message,
                el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { folderCache.delete(folder.id); load(); } }, icon('fa-rotate-right'), 'Reintentar'));
        }
    }

    // Navegación con historial del navegador (atrás/adelante y recargar funcionan)
    function writeUrl(replace = false) {
        const id = current().id;
        const hash = id === state.path[0].id ? '' : `#/${id}`;
        const url = location.pathname + location.search + hash;
        const s = { path: state.path };
        replace ? history.replaceState(s, '', url) : history.pushState(s, '', url);
    }

    function openFolder(file, fromPath) {
        state.path = fromPath ? [...fromPath, { id: file.id, name: file.name }] : [...state.path, { id: file.id, name: file.name }];
        resetSearch();
        clearSelection();
        writeUrl();
        load();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function goTo(index) {
        state.path = state.path.slice(0, index + 1);
        resetSearch();
        clearSelection();
        writeUrl();
        load();
    }

    window.addEventListener('popstate', (e) => {
        resetSearch();
        clearSelection();
        // Ignora entradas del historial de otro modo (con/sin admin)
        if (e.state?.path && e.state.path[0]?.id === state.path[0].id) { state.path = e.state.path; load(); return; }
        // Cambio manual del #/id en la barra de direcciones
        state.path = [state.path[0]];
        restoreFromHash().then(load);
    });

    function goHome() {
        state.path = [rootEntry()];
        allIndex = null;
        resetSearch();
        clearSelection();
        writeUrl(true);
        load();
    }

    // Reconstruye la ruta si se entra con un enlace directo (#/idCarpeta)
    async function restoreFromHash() {
        const id = location.hash.startsWith('#/') ? decodeURIComponent(location.hash.slice(2)) : '';
        if (history.state?.path && history.state.path[0]?.id === state.path[0].id) { state.path = history.state.path; return; }
        if (!id || id === state.path[0].id) return;
        // La API no devuelve la carpeta padre en peticiones anónimas, así que
        // recorremos el árbol desde la raíz (el mismo índice que usa la búsqueda).
        try {
            showSkeleton();
            const index = await buildIndex();
            const hit = index.find(({ file }) => file.id === id && file.mimeType === FOLDER_MIME);
            if (hit) state.path = [...hit.path, { id: hit.file.id, name: hit.file.name }];
        } catch (err) {
            console.warn('No se pudo restaurar la ruta', err);
        }
        writeUrl(true);
    }

    // ==========================================
    // BÚSQUEDA EN TODAS LAS SUBCARPETAS
    // ==========================================
    let searchToken = 0;
    let allIndex = null; // [{file, path}]

    async function buildIndex() {
        if (allIndex) return allIndex;
        const out = [];
        const root = state.path[0];
        const queue = [{ id: root.id, path: [root] }];
        let visited = 0;
        while (queue.length && visited < 200) {
            const batch = queue.splice(0, 6); // varias carpetas en paralelo
            visited += batch.length;
            searchStatus.replaceChildren(icon('fa-spinner', 'fa-spin'), ` Indexando carpetas… (${visited})`);
            const results = await Promise.all(batch.map(f => getFolder(f.id).then(files => ({ f, files })).catch(() => ({ f, files: [] }))));
            for (const { f, files } of results) {
                for (const file of files) {
                    out.push({ file, path: f.path });
                    if (file.mimeType === FOLDER_MIME) queue.push({ id: file.id, path: [...f.path, { id: file.id, name: file.name }] });
                }
            }
        }
        allIndex = out;
        return out;
    }

    const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    async function runSearch() {
        const token = ++searchToken;
        const q = normalize(state.query.trim());
        if (!q) { searchStatus.hidden = true; render(); return; }
        searchStatus.hidden = false;
        const index = await buildIndex();
        if (token !== searchToken) return;
        const words = q.split(/\s+/);
        const hits = index.filter(({ file }) => { const n = normalize(file.name); return words.every(w => n.includes(w)); });
        searchStatus.replaceChildren(icon('fa-magnifying-glass'), ` ${hits.length} resultado${hits.length === 1 ? '' : 's'} para "${state.query.trim()}" en todas las carpetas`);
        render(hits);
    }

    function resetSearch() {
        state.query = '';
        searchInput.value = '';
        searchClear.hidden = true;
        searchKbd.hidden = false;
        searchStatus.hidden = true;
        state.filter = 'all';
    }

    let debounce;
    searchInput.addEventListener('input', () => {
        state.query = searchInput.value;
        searchClear.hidden = !state.query;
        searchKbd.hidden = !!state.query;
        clearTimeout(debounce);
        debounce = setTimeout(runSearch, 180);
    });
    searchClear.addEventListener('click', () => { resetSearch(); render(); searchInput.focus(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && !e.target.closest('input, textarea, select, dialog')) { e.preventDefault(); searchInput.focus(); }
        if (e.key === 'Escape' && document.activeElement === searchInput && state.query) { resetSearch(); render(); }
    });

    // ==========================================
    // RENDER
    // ==========================================
    function renderChrome() {
        btnBack.disabled = state.path.length <= 1;
        btnBack.style.display = state.path.length <= 1 ? 'none' : '';
        btnGrid.classList.toggle('active', state.view === 'grid');
        btnList.classList.toggle('active', state.view === 'list');
        btnDrive.href = links.folder(current().id);
        btnDrive.hidden = current().id === ALL_ID;
        filesHost.className = `files ${state.view}`;

        if (btnAdmin) btnAdmin.classList.toggle('active', isAdmin());
        adminBar.hidden = !isAdmin();
        document.body.classList.toggle('admin', isAdmin());
        subtitle.textContent = isAdmin() ? 'Modo administrador: puedes borrar archivos de todas las carpetas de DriveKey.' : cat.description;
        searchInput.placeholder = isAdmin() ? 'Buscar en todas las carpetas…' : 'Buscar en esta categoría…';
        updateSelectionBar();

        crumbs.replaceChildren(...state.path.flatMap((p, i) => {
            const last = i === state.path.length - 1;
            const label = i === 0 ? (p.id === ALL_ID ? [icon('fa-user-shield'), ' Todo DriveKey'] : [icon('fa-house'), ' ', cat.short]) : [p.name];
            const node = el('button', { type: 'button', class: `crumb${last ? ' current' : ''}`, title: p.name, 'aria-current': last ? 'location' : null, onclick: last ? null : () => goTo(i) }, ...label);
            return i === 0 ? [node] : [el('i', { class: 'fa-solid fa-chevron-right crumb-sep', 'aria-hidden': 'true' }), node];
        }));
    }

    function updateStats() {
        const folders = state.files.filter(f => f.mimeType === FOLDER_MIME);
        const files = state.files.filter(f => f.mimeType !== FOLDER_MIME);
        statFolders.textContent = folders.length;
        statFolders.nextElementSibling.textContent = folders.length === 1 ? 'carpeta' : 'carpetas';
        statFiles.textContent = files.length;
        statFiles.nextElementSibling.textContent = files.length === 1 ? 'archivo' : 'archivos';
        statSize.textContent = formatSize(files.reduce((t, f) => t + Number(f.size || 0), 0));
    }

    function sortEntries(entries) {
        const cmp = {
            name: (a, b) => a.file.name.localeCompare(b.file.name, 'es', { numeric: true, sensitivity: 'base' }),
            recent: (a, b) => new Date(b.file.modifiedTime) - new Date(a.file.modifiedTime),
            size: (a, b) => Number(b.file.size || 0) - Number(a.file.size || 0)
        }[state.sort];
        return entries.sort((a, b) => {
            const fa = a.file.mimeType === FOLDER_MIME, fb = b.file.mimeType === FOLDER_MIME;
            if (fa !== fb) return fa ? -1 : 1;
            return cmp(a, b);
        });
    }

    function renderChips(entries) {
        const counts = {};
        entries.forEach(({ file }) => { const t = typeOf(file); counts[t] = (counts[t] || 0) + 1; });
        const types = Object.keys(TYPES).filter(t => counts[t]);
        if (state.filter !== 'all' && !counts[state.filter]) state.filter = 'all';
        if (types.length < 2) { chips.replaceChildren(); return; }
        const chip = (key, label, n, ic) => el('button', {
            type: 'button', class: `chip${state.filter === key ? ' active' : ''}`, 'aria-pressed': String(state.filter === key),
            onclick: () => { state.filter = key; state.query ? runSearch() : render(); }
        }, ic ? icon(ic) : null, label, el('span', { class: 'n' }, n));
        chips.replaceChildren(
            chip('all', 'Todo', entries.length),
            ...types.map(t => chip(t, TYPES[t].label, counts[t], TYPES[t].icon))
        );
    }

    function render(searchHits) {
        renderChrome();
        const isSearch = Array.isArray(searchHits);
        let entries = isSearch ? searchHits.slice() : state.files.map(file => ({ file, path: null }));
        renderChips(entries);
        if (state.filter !== 'all') entries = entries.filter(({ file }) => typeOf(file) === state.filter);
        sortEntries(entries);

        if (!entries.length) {
            if (isSearch) return showState('', 'fa-magnifying-glass', 'Sin resultados', 'Prueba con otro nombre o quita los filtros.');
            return showState('', 'fa-folder-open', 'Carpeta vacía', 'Todavía no hay archivos aquí.');
        }
        filesHost.replaceChildren(...entries.map(({ file, path }, i) => fileCard(file, path, i)));
    }

    function thumb(file, type) {
        const t = TYPES[type];
        const box = el('div', { class: 'file-thumb' }, icon(t.icon));
        if (THUMB_TYPES.has(type) && file.thumbnailLink && state.view === 'grid') {
            // La imagen tiene que estar dentro de la página: con loading="lazy" una imagen
            // suelta nunca se descarga. Se muestra encima del icono cuando termina de cargar.
            const img = el('img', { alt: '', class: 'thumb-img', loading: 'lazy', referrerpolicy: 'no-referrer', src: file.thumbnailLink });
            img.addEventListener('load', () => box.classList.add('has-img'));
            img.addEventListener('error', () => img.remove());
            box.append(img);
        }
        return box;
    }

    function fileCard(file, path, i) {
        const type = typeOf(file);
        const t = TYPES[type];
        const isFolder = type === 'folder';
        const meta = el('div', { class: 'file-meta' }, el('span', { class: 'tag' }, t.label));
        if (!isFolder && file.size) meta.append(el('span', {}, '·'), el('span', {}, formatSize(file.size)));
        if (file.modifiedTime) meta.append(el('span', {}, '·'), el('span', {}, formatDate(file.modifiedTime)));

        const deletable = isAdmin() && !file.virtualRoot;
        const actions = (isFolder && !deletable) ? null : el('div', { class: 'file-actions' },
            isFolder ? null : el('a', { class: 'icon-btn', href: links.download(file), target: '_blank', rel: 'noopener', title: 'Descargar', 'aria-label': `Descargar ${file.name}`, onclick: (e) => { e.stopPropagation(); if (Number(file.size) > BIG_FILE) toast('Archivo grande: Google te pedirá confirmar la descarga', 'info', 5000); } }, icon('fa-download')),
            isFolder ? null : el('button', { type: 'button', class: 'icon-btn', title: 'Copiar enlace', 'aria-label': `Copiar enlace de ${file.name}`, onclick: (e) => { e.stopPropagation(); copyLink(file); } }, icon('fa-link')),
            deletable ? el('button', { type: 'button', class: 'icon-btn danger', title: 'Borrar', 'aria-label': `Borrar ${file.name}`, onclick: (e) => { e.stopPropagation(); confirmDelete([file]); } }, icon('fa-trash-can')) : null
        );

        let check = null;
        if (deletable) {
            check = el('input', { type: 'checkbox', class: 'file-check', 'aria-label': `Seleccionar ${file.name}`, title: 'Seleccionar' });
            check.checked = selected.has(file.id);
            check.addEventListener('click', (e) => e.stopPropagation());
            check.addEventListener('change', () => {
                check.checked ? selected.set(file.id, file) : selected.delete(file.id);
                card.classList.toggle('selected', check.checked);
                updateSelectionBar();
            });
        }

        const card = el('div', {
            class: `file${selected.has(file.id) ? ' selected' : ''}`, role: 'button', tabindex: '0', title: file.name,
            style: { '--tc': t.color, animationDelay: `${Math.min(i, 20) * 15}ms` },
            'aria-label': `${t.label}: ${file.name}`
        },
            check,
            thumb(file, type),
            el('div', { class: 'file-body' },
                el('div', { class: 'file-name' }, file.name),
                meta,
                path && path.length > 1 ? el('div', { class: 'file-path' }, icon('fa-folder-tree'), ' ', path.slice(1).map(p => p.name).join(' / ')) : null
            ),
            actions
        );
        const activate = () => isFolder ? openFolder(file, path) : openPreview(file);
        card.addEventListener('click', activate);
        card.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); activate(); } });
        return card;
    }

    function showSkeleton() {
        filesHost.className = `files ${state.view}`;
        filesHost.replaceChildren(...Array.from({ length: state.view === 'grid' ? 8 : 6 }, () => el('div', { class: 'skeleton' })));
    }

    function showState(kind, ic, title, text, action) {
        filesHost.className = 'files';
        filesHost.replaceChildren(el('div', { class: `state ${kind}` }, icon(ic, 'big'), el('h3', {}, title), el('p', {}, text), action || null));
    }

    async function copyLink(file) {
        try {
            await navigator.clipboard.writeText(links.view(file));
            toast('Enlace copiado', 'success');
        } catch {
            prompt('Copia este enlace:', links.view(file));
        }
    }

    // ==========================================
    // VISTA PREVIA
    // ==========================================
    const pvThumb = el('div', { class: 'file-thumb' });
    const pvName = el('h3', {});
    const pvMeta = el('p', {});
    const pvBody = el('div', { class: 'pv-body' });
    const pvNote = el('span', { class: 'note' });
    const pvDownload = el('a', { class: 'btn btn-primary', target: '_blank', rel: 'noopener' }, icon('fa-download'), 'Descargar');
    const pvOpen = el('a', { class: 'btn btn-ghost', target: '_blank', rel: 'noopener' }, icon('fa-brands fa-google-drive'), 'Abrir en Drive');
    pvDownload.addEventListener('click', () => { if (pvNote.textContent) toast('Google te pedirá confirmar la descarga', 'info', 5000); });
    const pvCopy = el('button', { type: 'button', class: 'btn btn-ghost' }, icon('fa-link'), 'Copiar enlace');
    const preview = el('dialog', { class: 'modal preview', 'aria-label': 'Vista previa' },
        el('div', { class: 'pv-head' }, pvThumb, el('div', { class: 'pv-title' }, pvName, pvMeta),
            el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Cerrar', onclick: () => preview.close() }, icon('fa-xmark'))),
        pvBody,
        el('div', { class: 'pv-foot' }, pvNote, pvCopy, pvOpen, pvDownload)
    );
    document.body.append(preview);
    preview.addEventListener('click', (e) => { if (e.target === preview) preview.close(); });
    preview.addEventListener('close', () => pvBody.replaceChildren()); // detiene vídeos al cerrar

    function openPreview(file) {
        const type = typeOf(file);
        const t = TYPES[type];
        pvThumb.style.setProperty('--tc', t.color);
        pvThumb.replaceChildren(icon(t.icon));
        pvName.textContent = file.name;
        pvMeta.textContent = [t.label, file.size ? formatSize(file.size) : '', formatDate(file.modifiedTime)].filter(Boolean).join(' · ');
        pvDownload.href = links.download(file);
        pvOpen.href = links.view(file);
        pvCopy.onclick = () => copyLink(file);
        pvNote.textContent = Number(file.size) > BIG_FILE
            ? 'Archivo grande: Google mostrará un aviso de antivirus. Pulsa "Descargar de todos modos".'
            : '';

        if (PREVIEWABLE.has(type)) {
            pvBody.className = 'pv-body';
            const loading = el('div', { class: 'pv-loading' }, icon('fa-spinner', 'fa-spin'), ' Cargando vista previa…');
            const frame = el('iframe', { src: links.preview(file), allow: 'autoplay; fullscreen', title: `Vista previa de ${file.name}` });
            frame.addEventListener('load', () => loading.remove(), { once: true });
            pvBody.replaceChildren(loading, frame);
        } else {
            pvBody.className = 'pv-body info';
            const tips = {
                rom: 'Ábrelo con un emulador (melonDS para .nds, mGBA para .gba).',
                archive: 'Descárgalo y descomprímelo con 7-Zip o WinRAR.',
                app: 'Programa para Windows. Descárgalo y ejecútalo.',
                mod: 'Colócalo en la carpeta "mods" de tu instancia de Minecraft.',
                save: 'Archivo de datos o partida guardada.'
            };
            const box = el('div', { class: 'file-thumb', style: { '--tc': t.color } }, icon(t.icon));
            pvBody.replaceChildren(el('div', {}, box,
                el('h3', { style: { color: 'var(--text)', marginBottom: '6px' } }, 'Este archivo no tiene vista previa'),
                el('p', {}, tips[type] || 'Descárgalo para usarlo.')));
        }
        preview.showModal();
    }

    // ==========================================
    // ADMINISTRACIÓN: BORRAR (solo Rovex)
    // ==========================================
    const ADMIN_ERRORS = {
        bad_password: 'Clave de administrador incorrecta.',
        locked: 'Demasiados intentos fallidos. Espera 15 minutos.',
        not_configured: 'Falta la propiedad ADMIN_PASSWORD en el Apps Script.',
        bad_request: 'Petición no válida.',
        unknown_action: 'El Apps Script no reconoce la acción. ¿Está actualizado?',
        root: 'no se puede borrar una carpeta principal',
        forbidden: 'está fuera de las carpetas de DriveKey',
        not_found: 'no existe o ya estaba borrado'
    };

    async function adminRequest(action, extra = {}, password = adminPass) {
        let res;
        try {
            // Cuerpo en texto plano: petición "simple", sin preflight CORS.
            res = await fetch(ADMIN_URL, { method: 'POST', body: JSON.stringify({ action, password, ...extra }) });
        } catch {
            throw new Error('No se pudo conectar con el Apps Script de administración.');
        }
        if (!res.ok) throw new Error(`El Apps Script respondió con error ${res.status}.`);
        let data;
        try { data = await res.json(); } catch { throw new Error('Respuesta inesperada del Apps Script. Revisa que esté desplegado con acceso "Cualquier usuario".'); }
        if (!data.ok) {
            const err = new Error(ADMIN_ERRORS[data.error] || data.error || 'Error desconocido');
            err.code = data.error;
            throw err;
        }
        return data;
    }

    function enterAdmin(password) {
        adminPass = password;
        session.set('dk-admin', password);
        goHome();
        toast('Modo administrador activado', 'success');
    }

    function exitAdmin(message) {
        adminPass = null;
        session.set('dk-admin', null);
        goHome();
        if (message) toast(message, 'error', 5000);
    }

    function clearSelection() {
        selected.clear();
        filesHost.querySelectorAll('.file-check:checked').forEach(c => { c.checked = false; c.closest('.file')?.classList.remove('selected'); });
        updateSelectionBar();
    }

    function updateSelectionBar() {
        const n = selected.size;
        adminBar.classList.toggle('has-selection', n > 0);
        selCount.textContent = n ? `${n} seleccionado${n === 1 ? '' : 's'}` : '';
    }

    // ---- Diálogo de acceso ----
    const loginInput = el('input', { type: 'password', class: 'input', placeholder: 'Clave de administrador', autocomplete: 'off', 'aria-label': 'Clave de administrador' });
    const loginError = el('p', { class: 'form-error', hidden: true });
    const loginBtn = el('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Entrar');
    const loginForm = el('form', { novalidate: true },
        el('div', { class: 'modal-head' },
            el('div', {},
                el('h3', { class: 'modal-title' }, icon('fa-user-shield'), 'Modo administrador'),
                el('p', { class: 'modal-sub' }, 'Permite borrar archivos de todas las carpetas. La clave la comprueba tu Apps Script, no esta web.')),
            el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Cerrar', onclick: () => loginDialog.close() }, icon('fa-xmark'))),
        el('label', { class: 'field' }, loginInput),
        loginError,
        loginBtn
    );
    const loginDialog = el('dialog', { class: 'modal', 'aria-label': 'Modo administrador' }, loginForm);
    document.body.append(loginDialog);
    loginDialog.addEventListener('click', (e) => { if (e.target === loginDialog) loginDialog.close(); });

    function showLoginError(message) {
        loginError.replaceChildren(icon('fa-triangle-exclamation'), ' ' + message);
        loginError.hidden = false;
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pass = loginInput.value;
        if (!pass) return showLoginError('Escribe la clave.');
        loginBtn.disabled = true;
        loginBtn.replaceChildren(icon('fa-spinner', 'fa-spin'), ' Comprobando…');
        try {
            await adminRequest('verify', {}, pass);
            loginDialog.close();
            enterAdmin(pass);
        } catch (err) {
            showLoginError(err.message);
            loginInput.value = '';
            loginInput.focus();
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Entrar';
        }
    });

    btnAdmin?.addEventListener('click', () => {
        if (isAdmin()) {
            if (confirm('¿Salir del modo administrador?')) { exitAdmin(); toast('Has salido del modo administrador', 'info'); }
            return;
        }
        if (!ADMIN_URL) {
            toast('El modo administrador aún no está configurado (falta ADMIN_URL en config.js).', 'error', 6000);
            return;
        }
        loginInput.value = '';
        loginError.hidden = true;
        loginDialog.showModal();
        loginInput.focus();
    });

    // ---- Diálogo de confirmación ----
    const delList = el('ul', { class: 'del-list' });
    const delWarn = el('p', { class: 'del-warn', hidden: true });
    const delBtn = el('button', { type: 'button', class: 'btn btn-danger' });
    const delDialog = el('dialog', { class: 'modal', 'aria-label': 'Confirmar borrado', style: { '--accent': 'var(--danger)' } },
        el('div', { class: 'modal-head' },
            el('div', {},
                el('h3', { class: 'modal-title' }, icon('fa-trash-can'), '¿Mover a la papelera?'),
                el('p', { class: 'modal-sub' }, 'Podrás recuperarlo desde la papelera de Google Drive durante 30 días.')),
            el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Cancelar', 'data-close': '' }, icon('fa-xmark'))),
        delList,
        delWarn,
        el('div', { class: 'del-actions' },
            el('button', { type: 'button', class: 'btn btn-ghost', 'data-close': '' }, 'Cancelar'),
            delBtn)
    );
    document.body.append(delDialog);
    let deleting = false;
    delDialog.addEventListener('click', (e) => {
        if (deleting) return;
        if (e.target === delDialog || e.target.closest('[data-close]')) delDialog.close();
    });
    delDialog.addEventListener('cancel', (e) => { if (deleting) e.preventDefault(); });

    let pendingDelete = [];
    function confirmDelete(files) {
        files = files.filter(f => !f.virtualRoot);
        if (!files.length || !isAdmin()) return;
        pendingDelete = files;
        const shown = files.slice(0, 8);
        delList.replaceChildren(...shown.map(f => {
            const t = TYPES[typeOf(f)];
            return el('li', { style: { '--tc': t.color } }, icon(t.icon), el('span', {}, f.name));
        }));
        if (files.length > shown.length) delList.append(el('li', { class: 'more' }, `y ${files.length - shown.length} más…`));
        const folders = files.filter(f => f.mimeType === FOLDER_MIME).length;
        delWarn.hidden = !folders;
        delWarn.replaceChildren(icon('fa-triangle-exclamation'), folders === 1
            ? ' Incluye 1 carpeta: se borrará con todo su contenido.'
            : ` Incluye ${folders} carpetas: se borrarán con todo su contenido.`);
        delBtn.replaceChildren(icon('fa-trash-can'), files.length === 1 ? ' Mover a la papelera' : ` Mover ${files.length} elementos a la papelera`);
        delBtn.disabled = false;
        delDialog.showModal();
    }

    delBtn.addEventListener('click', async () => {
        const files = pendingDelete;
        deleting = true;
        delBtn.disabled = true;
        delBtn.replaceChildren(icon('fa-spinner', 'fa-spin'), ' Borrando…');
        try {
            const results = [];
            for (let i = 0; i < files.length; i += 50) {
                const data = await adminRequest('delete', { ids: files.slice(i, i + 50).map(f => f.id) });
                results.push(...(data.results || []));
            }
            applyDeletion(files, results);
            deleting = false;
            delDialog.close();
        } catch (err) {
            deleting = false;
            delDialog.close();
            if (err.code === 'bad_password' || err.code === 'locked') exitAdmin(err.message);
            else toast(err.message, 'error', 6000);
        }
    });

    function applyDeletion(files, results) {
        const okIds = new Set(results.filter(r => r.ok).map(r => r.id));
        const failed = results.filter(r => !r.ok);

        // Quita lo borrado de las cachés para no volver a pedirlo a Drive
        for (const [id, list] of folderCache) folderCache.set(id, list.filter(f => !okIds.has(f.id)));
        okIds.forEach(id => { folderCache.delete(id); selected.delete(id); });
        allIndex = null;
        state.files = state.files.filter(f => !okIds.has(f.id));
        updateStats();
        state.query ? runSearch() : render();

        if (okIds.size) toast(okIds.size === 1 ? 'Movido a la papelera' : `${okIds.size} elementos movidos a la papelera`, 'success');
        if (failed.length) {
            const byId = new Map(files.map(f => [f.id, f.name]));
            const first = failed[0];
            toast(`No se pudo borrar ${failed.length === 1 ? `"${byId.get(first.id) || first.id}"` : `${failed.length} elementos`}: ${ADMIN_ERRORS[first.error] || first.error}`, 'error', 7000);
        }
    }

    // ==========================================
    // CONTROLES
    // ==========================================
    btnBack.addEventListener('click', () => { if (state.path.length > 1) goTo(state.path.length - 2); });
    sortSelect.addEventListener('change', () => {
        state.sort = sortSelect.value;
        storage.set('dk-sort', state.sort);
        state.query ? runSearch() : render();
    });
    const setView = (v) => {
        state.view = v;
        storage.set('dk-view', v);
        state.query ? runSearch() : render();
    };
    btnGrid.addEventListener('click', () => setView('grid'));
    btnList.addEventListener('click', () => setView('list'));

    // ==========================================
    // INICIO
    // ==========================================
    restoreFromHash().then(() => {
        if (!history.state?.path) writeUrl(true);
        load();
    });
})();
