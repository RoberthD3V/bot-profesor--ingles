// Todo lo que habla con la IA (Groq): generar la tarea y corregir la respuesta.
// Le pedimos a la IA que conteste en JSON para poder procesar la respuesta
// por código y darle nosotros el formato al mensaje (así no llegan tablas).

const Groq = require('groq-sdk');

// El catálogo de Groq cambia seguido. Si aparece "model_not_found",
// revisar https://console.groq.com/docs/models y cambiar GROQ_MODEL en el .env
const MODELO = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const TIEMPOS = [
    'Present Simple',
    'Past Simple',
    'Present Perfect',
    'Future Simple (going to)',
];

// Letras iniciales para forzar variedad en el verbo elegido.
const LETRAS = 'abcdefghilmoprstw';

let cliente = null;
function groq() {
    if (!cliente) cliente = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return cliente;
}

function extraerJSON(texto) {
    try {
        return JSON.parse(texto);
    } catch {
        const coincidencia = texto && texto.match(/\{[\s\S]*\}/);
        if (coincidencia) return JSON.parse(coincidencia[0]);
        throw new Error('La IA no devolvió un JSON válido');
    }
}

async function pedirJSON(prompt, temperatura) {
    const respuesta = await groq().chat.completions.create({
        model: MODELO,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: temperatura,
    });
    return extraerJSON(respuesta.choices[0].message.content);
}

async function generarTarea(verbosUsados = []) {
    const letra = LETRAS[Math.floor(Math.random() * LETRAS.length)].toUpperCase();
    const evitar = verbosUsados.length ? verbosUsados.join(', ') : '(ninguno todavía)';

    const prompt = `Eres un profesor de inglés que prepara una tarea diaria para un alumno hispanohablante de nivel intermedio alto.

1. Elige un verbo en inglés útil en el día a día que empiece por la letra "${letra}" (si no encuentras uno bueno, usa otra letra). Que no sea ninguno de estos, ya usados: ${evitar}.
2. Elige 5 palabras de vocabulario en inglés de nivel intermedio (sustantivos, adjetivos o expresiones; no verbos de la lista anterior).

Responde ÚNICAMENTE con un JSON con esta forma exacta:
{
  "verbo": "to grow",
  "traduccion": "crecer",
  "irregular": true,
  "vocabulario": [
    { "palabra": "harvest", "traduccion": "cosecha", "ejemplo": "The harvest was great this year." }
  ]
}
"vocabulario" debe tener exactamente 5 elementos. "ejemplo" es una frase corta en inglés.`;

    const datos = await pedirJSON(prompt, 1);

    if (typeof datos.verbo !== 'string' || !Array.isArray(datos.vocabulario) || datos.vocabulario.length === 0) {
        throw new Error('La tarea generada no tiene el formato esperado');
    }

    let verbo = datos.verbo.trim().toLowerCase();
    if (!verbo.startsWith('to ')) verbo = `to ${verbo}`;

    return {
        verbo,
        traduccion: String(datos.traduccion || '').trim(),
        tiempos: TIEMPOS,
        vocabulario: datos.vocabulario.slice(0, 5).map((v) => ({
            palabra: String(v.palabra || '').trim(),
            traduccion: String(v.traduccion || '').trim(),
            ejemplo: String(v.ejemplo || '').trim(),
        })),
        fecha: new Date().toISOString(),
        origen: 'ia',
    };
}

// Texto que describe la tarea para dársela a la IA al corregir.
function describirTarea(tarea) {
    if (tarea.textoAntiguo) return tarea.textoAntiguo; // tareas guardadas con la versión anterior
    return `Conjugar el verbo "${tarea.verbo}" en estos tiempos: ${tarea.tiempos.join(', ')}.`;
}

async function corregirRespuesta(tarea, respuestaAlumno) {
    const tiempos = tarea.tiempos || TIEMPOS;

    const prompt = `Eres un profesor de inglés paciente y claro. Tu alumno hispanohablante tenía este ejercicio:

${describirTarea(tarea)}

El alumno respondió:
"""
${respuestaAlumno}
"""

Instrucciones:
- Primero decide si el mensaje es un intento de resolver el ejercicio. Si es un saludo, una pregunta o algo que no tiene que ver, pon "esRespuesta": false y deja "resultados" vacío.
- Si es un intento, corrige cada uno de estos tiempos verbales: ${tiempos.join(', ')}.
- El alumno puede haber escrito solo las formas del verbo, la conjugación completa o frases de ejemplo: todo vale si es correcto.
- Si un tiempo no aparece en la respuesta, márcalo como incorrecto y explica que faltó.
- No penalices mayúsculas ni puntuación. Sí penaliza errores de forma verbal, auxiliares y la tercera persona.
- "formaCorrecta": la forma correcta resumida (ej: "I grow / he grows").
- "explicacion": en español, breve (1-2 frases). Si está bien, puedes dejarla vacía o dar un tip corto.
- "comentario": un comentario final motivador y breve en español.

Responde ÚNICAMENTE con un JSON con esta forma:
{
  "esRespuesta": true,
  "resultados": [
    { "tiempo": "Present Simple", "respuestaAlumno": "...", "correcto": true, "formaCorrecta": "...", "explicacion": "..." }
  ],
  "comentario": "..."
}`;

    const datos = await pedirJSON(prompt, 0.2);

    return {
        esRespuesta: datos.esRespuesta !== false,
        resultados: Array.isArray(datos.resultados)
            ? datos.resultados.map((r) => ({
                tiempo: String(r.tiempo || '').trim(),
                respuestaAlumno: String(r.respuestaAlumno || '').trim(),
                correcto: r.correcto === true,
                formaCorrecta: String(r.formaCorrecta || '').trim(),
                explicacion: String(r.explicacion || '').trim(),
            }))
            : [],
        comentario: String(datos.comentario || '').trim(),
    };
}

module.exports = { MODELO, TIEMPOS, generarTarea, corregirRespuesta };
