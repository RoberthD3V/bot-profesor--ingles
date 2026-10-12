// Formato de los mensajes que envía el bot.
// Se usa el modo HTML de Telegram (<b>, <i>) porque se ve bien en el móvil
// y es más fácil de escapar que Markdown.

const LIMITE_TELEGRAM = 4000; // el máximo real es 4096 caracteres

// Lo que viene de la IA o del usuario se escapa para que no rompa el HTML.
function esc(texto) {
    return String(texto ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function formatearFecha(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function formatearTarea(tarea) {
    if (tarea.textoAntiguo) {
        return `📚 <b>Tu tarea pendiente</b>\n\n${esc(tarea.textoAntiguo)}`;
    }

    const traduccion = tarea.traduccion ? ` <i>(${esc(tarea.traduccion)})</i>` : '';
    const tiempos = tarea.tiempos.map((t) => `• ${esc(t)}`).join('\n');
    const vocabulario = tarea.vocabulario
        .map((v) => {
            const ejemplo = v.ejemplo ? `\n   <i>${esc(v.ejemplo)}</i>` : '';
            return `• <b>${esc(v.palabra)}</b> — ${esc(v.traduccion)}${ejemplo}`;
        })
        .join('\n');

    return [
        '📚 <b>Tarea del día</b>',
        `🔤 <b>Verbo:</b> ${esc(tarea.verbo)}${traduccion}`,
        `✍️ <b>Conjúgalo en estos tiempos:</b>\n${tiempos}`,
        `📖 <b>Vocabulario nuevo:</b>\n${vocabulario}`,
        '💬 Escríbeme tus conjugaciones en un solo mensaje, por ejemplo:\n<i>Present Simple: I grow, he grows\nPast Simple: I grew\n...</i>',
    ].join('\n\n');
}

function formatearCorreccion(tarea, correccion) {
    const { resultados, comentario } = correccion;
    const aciertos = resultados.filter((r) => r.correcto).length;
    const titulo = tarea.verbo ? ` — ${esc(tarea.verbo)}` : '';

    const bloques = [`📝 <b>Corrección${titulo}</b>\nResultado: <b>${aciertos}/${resultados.length}</b> correctos`];

    for (const r of resultados) {
        const lineas = [`${r.correcto ? '✅' : '❌'} <b>${esc(r.tiempo)}</b>`];
        if (r.respuestaAlumno) lineas.push(`Tu respuesta: <i>${esc(r.respuestaAlumno)}</i>`);
        else if (!r.correcto) lineas.push('Tu respuesta: — <i>(faltó)</i>');
        if (!r.correcto && r.formaCorrecta) lineas.push(`Forma correcta: <b>${esc(r.formaCorrecta)}</b>`);
        if (r.explicacion) lineas.push(`💡 ${esc(r.explicacion)}`);
        bloques.push(lineas.join('\n'));
    }

    if (comentario) bloques.push(`🎯 ${esc(comentario)}`);
    return bloques.join('\n\n');
}

function formatearHistorial(historial, cantidad = 7) {
    if (!historial.length) {
        return '📭 Todavía no tienes tareas en tu historial. ¡Responde tu primera tarea!';
    }

    const lineas = historial.slice(-cantidad).reverse().map((h) => {
        const fecha = formatearFecha(h.fecha);
        const verbo = esc(h.verbo || 'tarea');
        if (h.sinResponder) return `⏭️ ${fecha} · <b>${verbo}</b> · sin responder`;
        const total = h.resultados.length;
        const aciertos = h.resultados.filter((r) => r.correcto).length;
        const icono = aciertos === total ? '🌟' : aciertos >= total / 2 ? '👍' : '💪';
        return `${icono} ${fecha} · <b>${verbo}</b> · ${aciertos}/${total}`;
    });

    return `🗂️ <b>Tus últimas tareas</b>\n\n${lineas.join('\n')}`;
}

function formatearProgreso(historial) {
    const respondidas = historial.filter((h) => !h.sinResponder);
    if (!respondidas.length) {
        return '📊 Aún no hay datos de progreso. ¡Responde tu primera tarea!';
    }

    const porTiempo = {};
    let aciertos = 0;
    let total = 0;
    for (const h of respondidas) {
        for (const r of h.resultados) {
            porTiempo[r.tiempo] = porTiempo[r.tiempo] || { bien: 0, total: 0 };
            porTiempo[r.tiempo].total++;
            total++;
            if (r.correcto) {
                porTiempo[r.tiempo].bien++;
                aciertos++;
            }
        }
    }

    const filas = Object.entries(porTiempo)
        .sort(([, a], [, b]) => a.bien / a.total - b.bien / b.total)
        .map(([tiempo, d]) => `• ${esc(tiempo)}: <b>${Math.round((d.bien / d.total) * 100)}%</b> (${d.bien}/${d.total})`);

    const peor = Object.entries(porTiempo).sort(([, a], [, b]) => a.bien / a.total - b.bien / b.total)[0];
    const consejo = peor && peor[1].bien < peor[1].total
        ? `\n\n🔎 Donde más fallas: <b>${esc(peor[0])}</b>. ¡Dale un repaso!`
        : '\n\n🌟 ¡Vas perfecto en todos los tiempos!';

    const sinResponder = historial.length - respondidas.length;
    return [
        '📊 <b>Tu progreso</b>',
        `Tareas respondidas: <b>${respondidas.length}</b>${sinResponder ? ` · sin responder: ${sinResponder}` : ''}`,
        `Aciertos totales: <b>${Math.round((aciertos / total) * 100)}%</b> (${aciertos}/${total})`,
        `<b>Por tiempo verbal</b> (de peor a mejor):\n${filas.join('\n')}${consejo}`,
    ].join('\n\n');
}

// Telegram no acepta mensajes de más de 4096 caracteres. Se corta por
// párrafos para no partir una etiqueta HTML por la mitad.
function dividir(texto) {
    if (texto.length <= LIMITE_TELEGRAM) return [texto];

    const partes = [];
    let actual = '';
    for (const bloque of texto.split('\n\n')) {
        const candidato = actual ? `${actual}\n\n${bloque}` : bloque;
        if (candidato.length <= LIMITE_TELEGRAM) {
            actual = candidato;
            continue;
        }
        if (actual) partes.push(actual);
        actual = bloque;
        while (actual.length > LIMITE_TELEGRAM) {
            partes.push(actual.slice(0, LIMITE_TELEGRAM));
            actual = actual.slice(LIMITE_TELEGRAM);
        }
    }
    if (actual) partes.push(actual);
    return partes;
}

function quitarHTML(texto) {
    return texto
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

module.exports = {
    esc,
    formatearTarea,
    formatearCorreccion,
    formatearHistorial,
    formatearProgreso,
    dividir,
    quitarHTML,
};
