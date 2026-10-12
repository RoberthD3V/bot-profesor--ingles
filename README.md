# 🇬🇧 Bot Profesor de Inglés

Bot de Telegram que cada día envía un verbo para conjugar en varios tiempos y 5 palabras de vocabulario. El alumno responde en el chat y la IA (Groq) corrige la respuesta.

## Estructura

```
bot.js            # arranque, comandos de Telegram y tarea diaria (cron)
src/ia.js         # prompts y llamadas a Groq (generar tarea, corregir)
src/almacen.js    # guardar/leer estado.json (usuarios, tarea pendiente, historial)
src/mensajes.js   # formato de los mensajes (HTML de Telegram)
src/respaldo.js   # tareas fijas por si Groq falla
test-groq.js      # prueba de la IA sin Telegram
.env.example      # plantilla de configuración
```

## Puesta en marcha (local)

1. `npm install`
2. Copia `.env.example` como `.env` y rellena `TELEGRAM_BOT_TOKEN` y `GROQ_API_KEY`.
3. `npm start` para arrancarlo, o `npm run dev` para que se reinicie solo al guardar cambios.
4. En Telegram, envía `/start` al bot y después `/tarea` para recibir la primera.

Para probar solo la IA: `npm run test-ia`.

## Comandos del bot

| Comando | Qué hace |
|---|---|
| `/start` | Registra al usuario y activa la tarea diaria |
| `/tarea` | Muestra la tarea pendiente o genera una nueva |
| `/saltar` | Cambia la tarea pendiente por otra |
| `/historial` | Últimas tareas y resultados |
| `/progreso` | % de aciertos por tiempo verbal |
| `/parar` | Deja de enviar la tarea diaria |
| `/ayuda` | Lista de comandos |

## Configuración (.env)

| Variable | Por defecto | Descripción |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | — | Token de BotFather (obligatorio) |
| `GROQ_API_KEY` | — | API key de Groq (obligatorio) |
| `HORA_TAREA` | `0 9 * * *` | Hora de la tarea en formato cron (`minuto hora * * *`) |
| `ZONA_HORARIA` | `Europe/Madrid` | Zona horaria del cron |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Modelo de Groq. Si da `model_not_found`, mira https://console.groq.com/docs/models |
| `RUTA_ESTADO` | `./estado.json` | Dónde se guardan los datos |

## Despliegue 24/7 (Railway)

El bot usa *polling*, así que necesita un proceso siempre encendido. Además, `estado.json` tiene que guardarse en un disco que sobreviva a los reinicios. Railway cumple las dos cosas con un volumen.

1. Sube el proyecto a GitHub (el `.gitignore` ya excluye `.env`, `node_modules` y `estado.json`):
   ```
   git init
   git add .
   git commit -m "Bot profesor de inglés"
   ```
   Crea un repositorio vacío en GitHub y sigue las instrucciones de `git remote add origin ...` y `git push`.
2. En https://railway.com: **New Project → Deploy from GitHub repo** y elige el repositorio.
3. En el servicio, pestaña **Variables**: añade `TELEGRAM_BOT_TOKEN`, `GROQ_API_KEY` y `RUTA_ESTADO=/data/estado.json`.
4. Clic derecho en el servicio → **Attach Volume** con *mount path* `/data`.
5. Railway detecta Node y ejecuta `npm start`. En **Deployments → Logs** debería salir `🤖 Bot en marcha`.
6. **Apaga el bot en tu PC** antes: si dos copias usan el mismo token a la vez, Telegram da error `409 Conflict`.

Prueba final: envía `/start` y `/tarea`, responde, y en Railway pulsa **Restart**. `/historial` debe seguir mostrando la tarea.

> Render en plan gratuito no sirve: apaga los servicios inactivos y borra los archivos al reiniciar.
