/**
 * DriveKey · Apps Script único (subidas + administración)
 *
 * Sustituye al script de subidas antiguo y al de administración.
 * Instalación paso a paso en el README del repositorio ("Configurar Google").
 *
 * Claves (NO van en este código ni en la web), en
 * Configuración del proyecto → Propiedades del script:
 *   UPLOAD_PASSWORD  → código para subir archivos
 *   ADMIN_PASSWORD   → clave de administrador (borrar desde Rovex)
 *
 * Seguridad:
 *  - Las dos claves se comprueban aquí, en el servidor.
 *  - Solo se sube a las carpetas de UPLOAD_KEYS (nunca a la raíz de tu Drive).
 *  - Borrar solo afecta a lo que está DENTRO de las carpetas de FOLDERS,
 *    y va a la papelera (recuperable 30 días).
 *  - Tras MAX_FAILS claves incorrectas se bloquea durante LOCK_MINUTES.
 */

// IDs de las carpetas (lo que va después de /folders/ en el enlace de Drive)
const FOLDERS = {
  Pokemon:    '1scEmOVW-St9EtRDpKjHEe93CIk8A7RcI',
  minecraft:  '1SPCGjjv_m_K0tTzSNNWNhrC62H1PbjRX',
  emuladores: '1ZbiAsEPNZ-Lsl-1r1-lo7pt5JJAsa9GV',
  rovex:      '1D_qApyuSNSVLYqEmM5i2lmsYZC8-Iu2J'
};

// Carpetas a las que se puede subir desde la web
const UPLOAD_KEYS = ['Pokemon', 'minecraft', 'emuladores'];

// A quién avisar por email de cada subida ('' para no enviar emails)
const EMAIL_DESTINO = 'tarx555yt@gmail.com';

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const MAX_ITEMS_PER_REQUEST = 50;

function doGet() {
  return json_({ ok: true, service: 'DriveKey' });
}

function doPost(e) {
  try {
    const req = readRequest_(e);
    switch (req.action) {
      case 'checkUploadCode': return json_(checkPassword_('UPLOAD_PASSWORD', req.code, 'upload'));
      case 'upload':          return json_(upload_(req));
      case 'verify':          return json_(checkPassword_('ADMIN_PASSWORD', req.password, 'admin'));
      case 'delete':          return json_(delete_(req));
      default:                return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server_error', message: String(err && err.message || err) });
  }
}

// Formularios (subidas) llegan en e.parameter, ya descodificados por Google
// (así los espacios no se convierten en "+"). El resto llega como JSON.
function readRequest_(e) {
  if (e && e.parameter && e.parameter.action) return e.parameter;
  try {
    return JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return {};
  }
}

// ==========================================
// CLAVES
// ==========================================
function checkPassword_(property, given, bucket) {
  const cache = CacheService.getScriptCache();
  const key = 'fails_' + bucket;
  const fails = Number(cache.get(key) || 0);
  if (fails >= MAX_FAILS) return { ok: false, error: 'locked' };

  const expected = PropertiesService.getScriptProperties().getProperty(property);
  if (!expected) return { ok: false, error: 'not_configured' };

  if (typeof given !== 'string' || !safeEquals_(given, expected)) {
    cache.put(key, String(fails + 1), LOCK_MINUTES * 60);
    Utilities.sleep(800); // frena los intentos automáticos
    return { ok: false, error: 'bad_password' };
  }
  cache.remove(key);
  return { ok: true };
}

// ==========================================
// SUBIDAS
// ==========================================
function upload_(req) {
  const auth = checkPassword_('UPLOAD_PASSWORD', req.code, 'upload');
  if (!auth.ok) return auth;

  if (UPLOAD_KEYS.indexOf(req.folder) === -1) return { ok: false, error: 'bad_folder' };
  if (!req.fileName || !req.fileData) return { ok: false, error: 'missing_file' };

  const folder = DriveApp.getFolderById(FOLDERS[req.folder]);
  const blob = Utilities.newBlob(
    Utilities.base64Decode(req.fileData),
    req.mimeType || 'application/octet-stream',
    String(req.fileName).slice(0, 255)
  );
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  if (EMAIL_DESTINO) {
    try {
      MailApp.sendEmail({
        to: EMAIL_DESTINO,
        subject: '✅ Archivo subido - DriveKey',
        htmlBody: '<h2>¡Archivo subido!</h2>' +
                  '<p><strong>Archivo:</strong> ' + escapeHtml_(file.getName()) + '</p>' +
                  '<p><strong>Carpeta:</strong> ' + escapeHtml_(folder.getName()) + '</p>' +
                  '<p><a href="' + file.getUrl() + '">Ver archivo</a></p>'
      });
    } catch (err) {
      console.warn('Email no enviado: ' + err);
    }
  }

  return { ok: true, name: file.getName(), url: file.getUrl(), folder: folder.getName() };
}

// ==========================================
// BORRAR (modo administrador de Rovex)
// ==========================================
function delete_(req) {
  const auth = checkPassword_('ADMIN_PASSWORD', req.password, 'admin');
  if (!auth.ok) return auth;

  const ids = [].concat(req.ids || []).filter(function (id) { return typeof id === 'string'; }).slice(0, MAX_ITEMS_PER_REQUEST);
  return { ok: true, results: ids.map(trashItem_) };
}

function rootIds_() {
  return Object.keys(FOLDERS).map(function (k) { return FOLDERS[k]; });
}

function trashItem_(id) {
  try {
    const roots = rootIds_();
    if (roots.indexOf(id) !== -1) return { id: id, ok: false, error: 'root' };

    let item;
    try {
      item = DriveApp.getFileById(id);
    } catch (err) {
      item = DriveApp.getFolderById(id);
    }

    if (!isInside_(item, roots)) return { id: id, ok: false, error: 'forbidden' };

    item.setTrashed(true); // papelera, recuperable 30 días
    return { id: id, ok: true, name: item.getName() };
  } catch (err) {
    return { id: id, ok: false, error: 'not_found' };
  }
}

// Sube por las carpetas padre hasta encontrar una de las carpetas de DriveKey.
function isInside_(item, roots) {
  const seen = {};
  let level = [item];
  for (let depth = 0; depth < 25 && level.length; depth++) {
    const next = [];
    for (let i = 0; i < level.length; i++) {
      const parents = level[i].getParents();
      while (parents.hasNext()) {
        const p = parents.next();
        const pid = p.getId();
        if (roots.indexOf(pid) !== -1) return true;
        if (!seen[pid]) { seen[pid] = true; next.push(p); }
      }
    }
    level = next;
  }
  return false;
}

// ==========================================
// UTILIDADES
// ==========================================
function safeEquals_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function escapeHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
