// Persistencia en un archivo JSON (estado.json).
// El estado se carga una vez al arrancar, se mantiene en memoria y se guarda
// en disco después de cada cambio. Como todos los cambios son síncronos,
// nunca se pisan datos entre dos mensajes que llegan a la vez.

const fs = require('fs');
const path = require('path');

const RUTA_ESTADO = process.env.RUTA_ESTADO || path.join(__dirname, '..', 'estado.json');
const MAX_HISTORIAL = 200;       // entradas de historial que se guardan por usuario
const MAX_VERBOS_RECORDADOS = 60; // verbos que se le pasan a la IA para no repetir

let estado = null;

function estadoVacio() {
    return { usuarios: {} };
}

function usuarioNuevo(nombre) {
    return {
        nombre: nombre || '',
        activo: true,
        registrado: new Date().toISOString(),
        tareaPendiente: null,
        historial: [],
        verbosUsados: [],
    };
}

// Convierte el formato antiguo { chatId: { tarea, fecha } } al nuevo.
function migrar(datos) {
    if (datos && typeof datos.usuarios === 'object') return datos;

    const nuevo = estadoVacio();
    for (const [chatId, valor] of Object.entries(datos || {})) {
        const usuario = usuarioNuevo();
        if (valor && valor.tarea) {
            usuario.tareaPendiente = { textoAntiguo: valor.tarea, fecha: valor.fecha };
        }
        nuevo.usuarios[chatId] = usuario;
    }
    return nuevo;
}

function cargar() {
    if (!fs.existsSync(RUTA_ESTADO)) {
        console.log(`No existe ${RUTA_ESTADO}, se crea uno nuevo.`);
        estado = estadoVacio();
        guardar();
        return;
    }

    const contenido = fs.readFileSync(RUTA_ESTADO, 'utf-8');
    try {
        estado = contenido.trim() ? migrar(JSON.parse(contenido)) : estadoVacio();
    } catch (error) {
        // Archivo corrupto: se guarda una copia para no perder nada y se empieza de cero.
        const copia = `${RUTA_ESTADO}.corrupto-${Date.now()}`;
        fs.copyFileSync(RUTA_ESTADO, copia);
        console.error(`⚠️ ${RUTA_ESTADO} estaba corrupto. Copia guardada en ${copia}`);
        estado = estadoVacio();
    }
    guardar();
}

// Escribe primero en un archivo temporal y luego lo renombra: si el proceso
// se corta a mitad de la escritura, estado.json no queda a medias.
function guardar() {
    const temporal = `${RUTA_ESTADO}.tmp`;
    fs.writeFileSync(temporal, JSON.stringify(estado, null, 2));
    fs.renameSync(temporal, RUTA_ESTADO);
}

function obtenerUsuario(chatId) {
    return estado.usuarios[chatId] || null;
}

// Devuelve true si el usuario es nuevo.
function registrarUsuario(chatId, nombre) {
    const existente = estado.usuarios[chatId];
    if (existente) {
        existente.activo = true;
        if (nombre) existente.nombre = nombre;
        guardar();
        return false;
    }
    estado.usuarios[chatId] = usuarioNuevo(nombre);
    guardar();
    return true;
}

function desactivarUsuario(chatId) {
    const usuario = estado.usuarios[chatId];
    if (!usuario) return;
    usuario.activo = false;
    guardar();
}

function idsActivos() {
    return Object.entries(estado.usuarios)
        .filter(([, usuario]) => usuario.activo)
        .map(([chatId]) => chatId);
}

function agregarAlHistorial(usuario, entrada) {
    usuario.historial.push(entrada);
    if (usuario.historial.length > MAX_HISTORIAL) {
        usuario.historial = usuario.historial.slice(-MAX_HISTORIAL);
    }
}

// Guarda una tarea nueva. Si había otra sin responder, queda en el historial
// marcada como "sin responder".
function guardarTareaPendiente(chatId, tarea) {
    const usuario = estado.usuarios[chatId];
    if (usuario.tareaPendiente) {
        agregarAlHistorial(usuario, {
            fecha: usuario.tareaPendiente.fecha,
            verbo: usuario.tareaPendiente.verbo || null,
            sinResponder: true,
        });
    }
    usuario.tareaPendiente = tarea;
    if (tarea.verbo) {
        usuario.verbosUsados.push(tarea.verbo);
        usuario.verbosUsados = usuario.verbosUsados.slice(-MAX_VERBOS_RECORDADOS);
    }
    guardar();
}

// Pasa la tarea pendiente al historial junto con la respuesta y la corrección.
function completarTarea(chatId, respuesta, correccion) {
    const usuario = estado.usuarios[chatId];
    const tarea = usuario.tareaPendiente;
    agregarAlHistorial(usuario, {
        fecha: tarea.fecha,
        fechaRespuesta: new Date().toISOString(),
        verbo: tarea.verbo || null,
        respuesta,
        resultados: correccion.resultados,
        comentario: correccion.comentario,
    });
    usuario.tareaPendiente = null;
    guardar();
}

module.exports = {
    RUTA_ESTADO,
    cargar,
    obtenerUsuario,
    registrarUsuario,
    desactivarUsuario,
    idsActivos,
    guardarTareaPendiente,
    completarTarea,
};
