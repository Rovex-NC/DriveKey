# DriveKey

¿Quieres emular Pokémon o unos buenos packs de mods? Estás donde tienes que estar.

Web estática (GitHub Pages) que muestra carpetas públicas de Google Drive: ROMs de Pokémon, mods de Minecraft y emuladores.

**Web:** https://rovex-nc.github.io/DriveKey/

## Estructura

```
index.html              Portada (categorías, guía, subida de archivos, acceso a Rovex)
404.html                Página de error
Drives/*.html           Una página por categoría (solo indican data-category)
assets/js/config.js     ⚙️  TODA la configuración: carpetas, API key, Apps Script, códigos
assets/js/explorer.js   Explorador de carpetas compartido por todas las páginas de Drives/
assets/js/home.js       Lógica de la portada
assets/css/             Estilos (main = comunes, home = portada, explorer = explorador)
apps-script/DriveKey.gs Código del Google Apps Script (subidas + borrar desde Rovex)
```

## Configurar Google (o pasar a otra cuenta)

Todo lo de Google tiene que estar en **la misma cuenta**: las carpetas, la clave de API y el Apps Script.

### 1. Carpetas
1. Crea las 4 carpetas en Google Drive: Pokémon, Minecraft, Emuladores y Rovex.
2. En cada una: **Compartir** → Acceso general → **Cualquier persona con el enlace** → **Lector**.
3. Copia el ID de cada carpeta (lo que va después de `/folders/` en el enlace) y pégalo en:
   - `folderId` de cada categoría en `assets/js/config.js`
   - `FOLDERS` al principio de `apps-script/DriveKey.gs`

### 2. Clave de API (para que la web pueda leer las carpetas)
1. Entra en https://console.cloud.google.com → crea un proyecto (por ejemplo `DriveKey`).
2. **APIs y servicios → Biblioteca** → busca **Google Drive API** → **Habilitar**.
3. **APIs y servicios → Credenciales → Crear credenciales → Clave de API**.
4. Edita la clave:
   - Restricciones de aplicación: **Sitios web** → añade `https://rovex-nc.github.io/*` (y `http://localhost:8080/*` si pruebas en local).
   - Restricciones de API: **Restringir clave** → solo **Google Drive API**.
5. Pega la clave en `API_KEY` de `assets/js/config.js`.

### 3. Apps Script (subir y borrar)
1. https://script.google.com → **Nuevo proyecto** → llámalo `DriveKey`.
2. Borra lo que haya en `Código.gs`, pega `apps-script/DriveKey.gs` (con tus IDs en `FOLDERS`) y guarda.
3. ⚙️ **Configuración del proyecto → Propiedades del script → Añadir propiedad**:
   - `UPLOAD_PASSWORD` → el código para subir archivos.
   - `ADMIN_PASSWORD` → la clave de administrador para borrar. Que sea **larga** (12+ caracteres) y distinta de las demás.
4. **Implementar → Nueva implementación** → tipo **Aplicación web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
   - **Implementar** → **Autorizar acceso**. Saldrá "Google no ha verificado esta aplicación": es tu propio script, pulsa *Configuración avanzada → Ir a DriveKey → Permitir*.
5. Copia la **URL de la aplicación web** (termina en `/exec`) y pégala en `SCRIPT_URL` de `assets/js/config.js`.

Si más adelante cambias el código del script: **Implementar → Gestionar implementaciones → ✏️ Editar → Versión: Nueva versión → Implementar**. Así la URL no cambia.

## Tareas habituales

### Añadir un enlace a una descarga externa
Para archivos que no están en tu Drive (MEGA, MediaFire, CurseForge, Modrinth, la web de un emulador…):
**Subir archivos** → pestaña **Enlace** → carpeta, nombre y URL (`https://`).

El Apps Script guarda en la carpeta un acceso directo `Nombre.url` con la URL también en la descripción del archivo. La web lo muestra como **Enlace**, con el dominio de destino y un botón **Abrir**. Se borra desde Rovex como cualquier archivo. Solo se aceptan enlaces `https://`.

### Añadir una categoría nueva
1. Crea la carpeta, hazla pública y copia su ID.
2. Añade una entrada en `CATEGORIES` dentro de `assets/js/config.js`.
3. Copia `Drives/Emuladores.html` con el nombre nuevo y cambia `data-category="..."` por la clave que usaste.
4. Añade la carpeta a `FOLDERS` en el Apps Script. Si quieres poder subir a ella, pon el mismo `uploadKey` en `config.js` y en `UPLOAD_KEYS` del script.

### Cambiar el código de subida o la clave de administrador
En el Apps Script: ⚙️ **Configuración del proyecto → Propiedades del script** → edita `UPLOAD_PASSWORD` o `ADMIN_PASSWORD`. No hay que tocar la web ni volver a implementar.

### Cambiar la contraseña de Rovex
Se guarda como hash SHA-256 en la web. Abre la consola del navegador (F12) en la web, ejecuta:

```js
await DK.sha256('TU_NUEVA_CONTRASEÑA')
```

y pega el resultado en `ROVEX_CODE_HASH` de `config.js`.

## Modo administrador (borrar desde Rovex)

Dentro de **Rovex** hay un botón (icono de persona con escudo, junto a los de vista) que activa el modo administrador: permite navegar por **todas** las carpetas de DriveKey y mover archivos o carpetas a la papelera, uno a uno o varios a la vez. Fuera de Rovex no existe esa opción.

- Lo borrado va a la **papelera** de Drive y se puede recuperar durante 30 días.
- Solo se puede tocar lo que está **dentro** de las 4 carpetas; las carpetas principales no se pueden borrar.
- Tras 5 claves incorrectas se bloquea 15 minutos (también para ti).

## Seguridad: qué protege y qué no

- **Subir y borrar están protegidos de verdad:** el código de subida y la clave de administrador solo los conoce el Apps Script; no aparecen en el código de la web.
- **La carpeta de Rovex es pública en Drive.** Su contraseña solo esconde la página; con el ID de la carpeta se puede ver igualmente. No guardes ahí nada realmente privado.
- **La clave de API es visible** en la web (es normal). Por eso hay que restringirla a `rovex-nc.github.io` y a la Google Drive API, como se explica arriba.

## Probar en local

Cualquier servidor estático sirve, por ejemplo:

```bash
npx serve .
```
