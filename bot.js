require('dotenv').config({ quiet: true }); // 
const { Telegraf } = require('telegraf');
const cron = require('node-cron');

const almacen = require('./src/almacen');
const ia = require('./src/ia');
const respaldo = require('./src/respaldo');
const msg = require('./src/mensajes');

// ---------- Configuración (desde el .env) ----------

const faltan = ['TELEGRAM_BOT_TOKEN', 'GROQ_API_KEY'].filter((clave) => !process.env[clave]);
if (faltan.length) {
    console.error(`❌ Faltan variables en el .env: ${faltan.join(', ')}`);
    process.exit(1);
}

const HORA_TAREA = process.env.HORA_TAREA || '0 9 * * *'; // formato cron: minuto hora * * *
const ZONA_HORARIA = process.env.ZONA_HORARIA || 'Europe/Madrid';

if (!cron.validate(HORA_TAREA)) {
    console.error(`❌ HORA_TAREA no es una expresión cron válida: "${HORA_TAREA}"`);
    process.exit(1);
}

// "30 9 * * *" -> "09:30". Si es una expresión más rara, se muestra tal cual.
function horaLegible() {
    const [minuto, hora, ...resto] = HORA_TAREA.split(' ');
    if (/^\d+$/.test(minuto) && /^\d+$/.test(hora) && resto.every((p) => p === '*')) {
        return `${hora.padStart(2, '0')}:${minuto.padStart(2, '0')}`;
    }
    return HORA_TAREA;
}

almacen.cargar();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN, { handlerTimeout: 120_000 });

// Usuarios con una petición a la IA en curso, para no procesar dos a la vez.
const ocupados = new Set();

// ---------- Utilidades ----------

async function enviar(chatId, html) {
    for (const parte of msg.dividir(html)) {
        try {
            await bot.telegram.sendMessage(chatId, parte, { parse_mode: 'HTML' });
        } catch (error) {
            // 400 = Telegram no pudo leer el HTML: se reenvía como texto plano.
            if (error.response && error.response.error_code === 400) {
                await bot.telegram.sendMessage(chatId, msg.quitarHTML(parte));
            } else {
                throw error;
            }
        }
    }
}

// Devuelve el usuario del chat; si no estaba registrado, lo registra.
function usuarioDe(ctx) {
    const chatId = String(ctx.chat.id);
    if (!almacen.obtenerUsuario(chatId)) almacen.registrarUsuario(chatId, ctx.from && ctx.from.first_name);
    return almacen.obtenerUsuario(chatId);
}

async function crearYEnviarTarea(chatId) {
    const usuario = almacen.obtenerUsuario(chatId);
    let tarea;
    try {
        tarea = await ia.generarTarea(usuario.verbosUsados);
    } catch (error) {
        console.error('Groq falló al generar la tarea, uso una de respaldo:', error.message);
        tarea = respaldo.tareaDeRespaldo(usuario.verbosUsados);
    }
    almacen.guardarTareaPendiente(chatId, tarea);
    await enviar(chatId, msg.formatearTarea(tarea));
}

// ---------- Comandos (van antes de bot.on('text')) ----------

bot.command('start', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const esNuevo = almacen.registrarUsuario(chatId, ctx.from && ctx.from.first_name);
    console.log(`/start de ${chatId} (${esNuevo ? 'nuevo' : 'ya registrado'})`);

    await ctx.reply(
        '¡Hola! Soy tu profesor de inglés 🇬🇧\n\n' +
        `Cada día a las ${horaLegible()} te voy a mandar una tarea: un verbo para conjugar ` +
        'en varios tiempos y 5 palabras nuevas de vocabulario. Tú me respondes y yo te corrijo.\n\n' +
        '👉 Escribe /tarea si quieres empezar ya, o /ayuda para ver todo lo que puedo hacer.'
    );
});

bot.command('ayuda', (ctx) =>
    ctx.reply(
        'Comandos disponibles:\n\n' +
        '/tarea – ver tu tarea pendiente o pedir una nueva\n' +
        '/saltar – cambiar la tarea pendiente por otra\n' +
        '/historial – tus últimas tareas y resultados\n' +
        '/progreso – tu porcentaje de aciertos por tiempo verbal\n' +
        '/parar – dejar de recibir la tarea diaria\n' +
        '/start – volver a activar la tarea diaria\n\n' +
        `📅 La tarea diaria llega a las ${horaLegible()} (${ZONA_HORARIA}).\n` +
        '✍️ Para responder, escríbeme las conjugaciones en un solo mensaje.'
    )
);

bot.command('tarea', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const usuario = usuarioDe(ctx);

    if (usuario.tareaPendiente) {
        await ctx.reply('Ya tienes una tarea pendiente 👇 Respóndela, o usa /saltar para cambiarla por otra.');
        return enviar(chatId, msg.formatearTarea(usuario.tareaPendiente));
    }
    if (ocupados.has(chatId)) return ctx.reply('⏳ Un momento, ya estoy preparando algo para ti.');

    ocupados.add(chatId);
    try {
        await ctx.reply('⏳ Preparando tu tarea...');
        await crearYEnviarTarea(chatId);
    } finally {
        ocupados.delete(chatId);
    }
});

bot.command('saltar', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const usuario = usuarioDe(ctx);

    if (!usuario.tareaPendiente) return ctx.reply('No tienes ninguna tarea pendiente. Escribe /tarea para pedir una.');
    if (ocupados.has(chatId)) return ctx.reply('⏳ Un momento, ya estoy preparando algo para ti.');

    ocupados.add(chatId);
    try {
        await ctx.reply('🔄 Vale, te preparo otra tarea...');
        await crearYEnviarTarea(chatId);
    } finally {
        ocupados.delete(chatId);
    }
});

bot.command('historial', (ctx) => enviar(String(ctx.chat.id), msg.formatearHistorial(usuarioDe(ctx).historial)));

bot.command('progreso', (ctx) => enviar(String(ctx.chat.id), msg.formatearProgreso(usuarioDe(ctx).historial)));

bot.command('parar', (ctx) => {
    usuarioDe(ctx);
    almacen.desactivarUsuario(String(ctx.chat.id));
    return ctx.reply('🔕 Listo, ya no te mandaré la tarea diaria. Puedes seguir usando /tarea cuando quieras, y /start para reactivarla.');
});

// ---------- Respuestas del alumno ----------

bot.on('text', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const texto = ctx.message.text.trim();

    if (texto.startsWith('/')) {
        return ctx.reply('No conozco ese comando. Escribe /ayuda para ver la lista.');
    }

    const usuario = usuarioDe(ctx);
    const tarea = usuario.tareaPendiente;

    if (!tarea) {
        return ctx.reply('No tienes ninguna tarea pendiente 🙂\nEscribe /tarea si quieres una ahora, o espera a la de mañana.');
    }
    if (ocupados.has(chatId)) {
        return ctx.reply('⏳ Un momento, todavía estoy con tu mensaje anterior.');
    }

    ocupados.add(chatId);
    try {
        await ctx.reply('🔍 Dame un segundo, estoy revisando tu respuesta...');
        await ctx.sendChatAction('typing');

        const correccion = await ia.corregirRespuesta(tarea, texto);

        if (!correccion.esRespuesta) {
            return ctx.reply(
                '🤔 Eso no parece una respuesta a la tarea. Escríbeme las conjugaciones del verbo ' +
                'en los tiempos que te pedí (o /tarea para volver a verla).'
            );
        }
        if (!correccion.resultados.length) throw new Error('La IA devolvió una corrección vacía');

        // Si mientras la IA corregía llegó una tarea nueva, no se toca el estado.
        if (almacen.obtenerUsuario(chatId).tareaPendiente === tarea) {
            almacen.completarTarea(chatId, texto, correccion);
        }

        await enviar(chatId, msg.formatearCorreccion(tarea, correccion));
        await ctx.reply('✅ ¡Tarea completada! Mañana te mando otra (o pide una ya con /tarea).');
    } catch (error) {
        console.error(`Error corrigiendo la respuesta de ${chatId}:`, error);
        await ctx.reply(
            '⚠️ No pude corregir tu respuesta ahora mismo (problema con la IA). ' +
            'Tu tarea sigue pendiente: vuelve a enviarme la respuesta en un rato.'
        );
    } finally {
        ocupados.delete(chatId);
    }
});

// Cualquier error que se escape de un manejador termina aquí en vez de tumbar el bot.
bot.catch((error, ctx) => {
    console.error(`Error no controlado (update ${ctx.update.update_id}):`, error);
    ctx.reply('⚠️ Algo salió mal. Inténtalo de nuevo en un momento.').catch(() => {});
});

// ---------- Tarea diaria ----------

async function enviarTareasDiarias() {
    const ids = almacen.idsActivos();
    console.log(`[${new Date().toISOString()}] Enviando la tarea diaria a ${ids.length} usuario(s)`);

    for (const chatId of ids) {
        try {
            if (almacen.obtenerUsuario(chatId).tareaPendiente) {
                await enviar(chatId, '⏰ La tarea anterior quedó sin responder (la guardé en tu historial). ¡Aquí va la de hoy!');
            }
            await crearYEnviarTarea(chatId);
        } catch (error) {
            // 403 = el usuario bloqueó el bot: se deja de enviarle tareas.
            if (error.response && error.response.error_code === 403) {
                console.log(`El chat ${chatId} bloqueó el bot, lo desactivo.`);
                almacen.desactivarUsuario(chatId);
            } else {
                console.error(`Error enviando la tarea diaria a ${chatId}:`, error);
            }
        }
    }
}

const tareaDiaria = cron.schedule(HORA_TAREA, enviarTareasDiarias, {
    name: 'tarea-diaria',
    timezone: ZONA_HORARIA,
    noOverlap: true,
});

// ---------- Arranque y apagado ----------

bot.telegram
    .setMyCommands([
        { command: 'tarea', description: 'Ver tu tarea o pedir una nueva' },
        { command: 'saltar', description: 'Cambiar la tarea pendiente por otra' },
        { command: 'historial', description: 'Tus últimas tareas' },
        { command: 'progreso', description: 'Aciertos por tiempo verbal' },
        { command: 'parar', description: 'Dejar de recibir la tarea diaria' },
        { command: 'ayuda', description: 'Ver la ayuda' },
    ])
    .catch((error) => console.error('No se pudo registrar el menú de comandos:', error.message));

bot.launch().catch((error) => {
    console.error('❌ No se pudo iniciar el bot:', error.message);
    process.exit(1);
});

console.log(`🤖 Bot en marcha · tarea diaria a las ${horaLegible()} (${ZONA_HORARIA}) · modelo ${ia.MODELO}`);
console.log(`💾 Datos en ${almacen.RUTA_ESTADO} · usuarios activos: ${almacen.idsActivos().length}`);

function apagar(senal) {
    console.log(`\n${senal} recibido, apagando el bot...`);
    tareaDiaria.stop();
    bot.stop(senal);
}
process.once('SIGINT', () => apagar('SIGINT'));
process.once('SIGTERM', () => apagar('SIGTERM'));
