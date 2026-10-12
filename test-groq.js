// Prueba aislada de la IA, sin Telegram: genera una tarea y corrige una respuesta de ejemplo.
// Uso:  node test-groq.js
// Sirve para probar cambios en los prompts de src/ia.js sin arrancar el bot.

require('dotenv').config({ quiet: true });
const ia = require('./src/ia');
const msg = require('./src/mensajes');

async function probar() {
    console.log(`Modelo: ${ia.MODELO}\n`);

    const tarea = await ia.generarTarea(['to grow', 'to choose']);
    console.log('--- TAREA (datos) ---');
    console.log(JSON.stringify(tarea, null, 2));
    console.log('\n--- TAREA (mensaje) ---');
    console.log(msg.quitarHTML(msg.formatearTarea(tarea)));

    // Respuesta con errores a propósito para ver cómo corrige.
    const respuesta = 'Present Simple: I grow, he grow\nPast Simple: I growed\nPresent Perfect: I have grown';
    const correccion = await ia.corregirRespuesta({ verbo: 'to grow', tiempos: ia.TIEMPOS }, respuesta);
    console.log('\n--- CORRECCIÓN (mensaje) ---');
    console.log(msg.quitarHTML(msg.formatearCorreccion({ verbo: 'to grow' }, correccion)));
}

probar().catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
});
