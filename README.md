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
```

## Tareas habituales

### Añadir una categoría nueva
1. Comparte la carpeta de Drive como "Cualquier persona con el enlace" y copia su ID (lo que va después de `/folders/` en la URL).
2. Añade una entrada en `CATEGORIES` dentro de `assets/js/config.js`.
3. Copia `Drives/Emuladores.html` con el nombre nuevo y cambia `data-category="..."` por la clave que usaste.
4. Si quieres poder subir a esa carpeta, añade `uploadKey` y prepara ese valor en el Apps Script.

### Cambiar el código de subida o la contraseña de Rovex
Los códigos se guardan como hash SHA-256. Para generar uno nuevo, abre la consola del navegador (F12) en la web y ejecuta:

```js
await DK.sha256('TU_NUEVO_CODIGO')
```

Pega el resultado en `UPLOAD_CODE_HASH` o `ROVEX_CODE_HASH` de `config.js`.

## Seguridad: qué protege y qué no

Al ser una web estática, todo el código llega al navegador del visitante:

- **El código de subida no es la protección real.** Quien sepa leer el código puede enviar archivos directamente al Apps Script. La verificación de verdad tiene que estar en el propio Apps Script.
- **La carpeta de Rovex es pública en Drive.** La contraseña solo esconde la página; con el ID de la carpeta se puede ver igualmente. No guardes ahí nada realmente privado.
- **API key:** restríngela en Google Cloud Console (*APIs y servicios → Credenciales*) a *HTTP referrers* `https://rovex-nc.github.io/*` y solo a la *Google Drive API*, para que nadie más pueda gastar tu cuota.

## Probar en local

Cualquier servidor estático sirve, por ejemplo:

```bash
npx serve .
```
