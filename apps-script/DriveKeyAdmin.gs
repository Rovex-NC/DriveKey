/**
 * DriveKey · Admin (borrar archivos desde el área Rovex)
 *
 * Proyecto de Apps Script NUEVO e independiente del de subidas.
 * Instalación paso a paso en el README del repositorio ("Modo administrador").
 *
 * Seguridad:
 *  - La clave NO está en este código ni en la web: se guarda en
 *    Configuración del proyecto → Propiedades del script → ADMIN_PASSWORD.
 *  - Solo puede tocar archivos que estén DENTRO de las carpetas de ALLOWED_ROOTS.
 *    Las propias carpetas raíz no se pueden borrar.
 *  - Nada se elimina para siempre: todo va a la papelera de Drive (30 días).
 *  - Tras MAX_FAILS claves incorrectas se bloquea durante LOCK_MINUTES.
 */

const ALLOWED_ROOTS = [
  '1yfYEp-k3k0OpLcewOFSoP3MryzsD5YRH', // ROMs Pokémon
  '1osB40eDY9Kjz50H6BII2vjsEIufPo6d-', // Minecraft Mods
  '1OMG15Q-0wZWEE3tnaQ0renZ_Atrp2Pyr', // Emuladores
  '1w5ETzF7gdpXCAnUgiLdgUCfX166sgQ5G'  // Rovex
];

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const MAX_ITEMS_PER_REQUEST = 50;

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }

  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('fails') || 0);
  if (fails >= MAX_FAILS) return json_({ ok: false, error: 'locked' });

  const password = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!password) return json_({ ok: false, error: 'not_configured' });

  if (typeof req.password !== 'string' || !safeEquals_(req.password, password)) {
    cache.put('fails', String(fails + 1), LOCK_MINUTES * 60);
    Utilities.sleep(800); // frena los intentos automáticos
    return json_({ ok: false, error: 'bad_password' });
  }
  cache.remove('fails');

  if (req.action === 'verify') return json_({ ok: true });

  if (req.action === 'delete') {
    const ids = [].concat(req.ids || []).filter(id => typeof id === 'string').slice(0, MAX_ITEMS_PER_REQUEST);
    const results = ids.map(trashItem_);
    return json_({ ok: true, results: results });
  }

  return json_({ ok: false, error: 'unknown_action' });
}

// Permite comprobar en el navegador que el despliegue funciona.
function doGet() {
  return json_({ ok: true, service: 'DriveKey Admin' });
}

function trashItem_(id) {
  try {
    if (ALLOWED_ROOTS.indexOf(id) !== -1) return { id: id, ok: false, error: 'root' };

    let item;
    try {
      item = DriveApp.getFileById(id);
    } catch (err) {
      item = DriveApp.getFolderById(id);
    }

    if (!isInsideAllowed_(item)) return { id: id, ok: false, error: 'forbidden' };

    item.setTrashed(true); // papelera, recuperable 30 días
    return { id: id, ok: true, name: item.getName() };
  } catch (err) {
    return { id: id, ok: false, error: 'not_found' };
  }
}

// Sube por las carpetas padre hasta encontrar una de ALLOWED_ROOTS.
function isInsideAllowed_(item) {
  const seen = {};
  let level = [item];
  for (let depth = 0; depth < 25 && level.length; depth++) {
    const next = [];
    for (let i = 0; i < level.length; i++) {
      const parents = level[i].getParents();
      while (parents.hasNext()) {
        const p = parents.next();
        const pid = p.getId();
        if (ALLOWED_ROOTS.indexOf(pid) !== -1) return true;
        if (!seen[pid]) { seen[pid] = true; next.push(p); }
      }
    }
    level = next;
  }
  return false;
}

function safeEquals_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
