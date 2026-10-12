// Plan B: tareas fijas por si Groq falla al generar la tarea del día.

const { TIEMPOS } = require('./ia');

const TAREAS = [
    { verbo: 'to grow', traduccion: 'crecer', vocabulario: [
        ['harvest', 'cosecha', 'The harvest was great this year.'],
        ['seed', 'semilla', 'She planted a seed in the garden.'],
        ['steady', 'constante', 'He made steady progress.'],
        ['soil', 'tierra', 'This soil is very rich.'],
        ['thrive', 'prosperar', 'Plants thrive in the sun.'],
    ] },
    { verbo: 'to choose', traduccion: 'elegir', vocabulario: [
        ['choice', 'elección', 'It was a difficult choice.'],
        ['option', 'opción', 'We have two options.'],
        ['wise', 'sabio/sensato', 'That was a wise decision.'],
        ['regret', 'arrepentimiento', 'I have no regrets.'],
        ['carefully', 'con cuidado', 'Read the contract carefully.'],
    ] },
    { verbo: 'to build', traduccion: 'construir', vocabulario: [
        ['bricks', 'ladrillos', 'The wall is made of bricks.'],
        ['blueprint', 'plano', 'The architect showed us the blueprint.'],
        ['sturdy', 'resistente', 'This table is very sturdy.'],
        ['site', 'obra / terreno', 'He works on a building site.'],
        ['ceiling', 'techo (interior)', 'The ceiling is very high.'],
    ] },
    { verbo: 'to forget', traduccion: 'olvidar', vocabulario: [
        ['reminder', 'recordatorio', 'I set a reminder on my phone.'],
        ['memory', 'memoria / recuerdo', 'It is my favourite childhood memory.'],
        ['absent-minded', 'despistado', 'My uncle is very absent-minded.'],
        ['on purpose', 'a propósito', 'She did it on purpose.'],
        ['by heart', 'de memoria', 'I know the song by heart.'],
    ] },
    { verbo: 'to spend', traduccion: 'gastar / pasar (tiempo)', vocabulario: [
        ['budget', 'presupuesto', 'We need a monthly budget.'],
        ['bargain', 'ganga', 'This jacket was a bargain.'],
        ['savings', 'ahorros', 'He used his savings to travel.'],
        ['receipt', 'recibo / ticket', 'Keep the receipt.'],
        ['worth', 'que vale la pena', 'The trip was worth it.'],
    ] },
    { verbo: 'to teach', traduccion: 'enseñar', vocabulario: [
        ['lesson', 'lección', 'Today\'s lesson is about verbs.'],
        ['skill', 'habilidad', 'Cooking is a useful skill.'],
        ['patient', 'paciente', 'A good teacher is patient.'],
        ['homework', 'deberes', 'I finished my homework.'],
        ['knowledge', 'conocimiento', 'Knowledge is power.'],
    ] },
    { verbo: 'to fly', traduccion: 'volar', vocabulario: [
        ['luggage', 'equipaje', 'My luggage got lost.'],
        ['boarding pass', 'tarjeta de embarque', 'Show your boarding pass, please.'],
        ['delay', 'retraso', 'There was a two-hour delay.'],
        ['aisle', 'pasillo', 'I prefer an aisle seat.'],
        ['landing', 'aterrizaje', 'The landing was smooth.'],
    ] },
    { verbo: 'to write', traduccion: 'escribir', vocabulario: [
        ['draft', 'borrador', 'This is just a first draft.'],
        ['handwriting', 'letra (a mano)', 'Your handwriting is very neat.'],
        ['spelling', 'ortografía', 'Check your spelling.'],
        ['paragraph', 'párrafo', 'Write one more paragraph.'],
        ['neat', 'ordenado / prolijo', 'Keep your notes neat.'],
    ] },
    { verbo: 'to improve', traduccion: 'mejorar', vocabulario: [
        ['goal', 'meta', 'My goal is to speak fluently.'],
        ['feedback', 'comentarios / retroalimentación', 'Thanks for your feedback.'],
        ['effort', 'esfuerzo', 'It takes a lot of effort.'],
        ['fluent', 'fluido', 'She is fluent in English.'],
        ['weakness', 'punto débil', 'Grammar is my weakness.'],
    ] },
    { verbo: 'to break', traduccion: 'romper', vocabulario: [
        ['fragile', 'frágil', 'Be careful, it\'s fragile.'],
        ['crack', 'grieta', 'There is a crack in the screen.'],
        ['repair', 'reparación', 'The repair was expensive.'],
        ['spare', 'de repuesto', 'Do you have a spare key?'],
        ['careless', 'descuidado', 'It was a careless mistake.'],
    ] },
];

function tareaDeRespaldo(verbosUsados = []) {
    const noUsadas = TAREAS.filter((t) => !verbosUsados.includes(t.verbo));
    const opciones = noUsadas.length ? noUsadas : TAREAS;
    const elegida = opciones[Math.floor(Math.random() * opciones.length)];

    return {
        verbo: elegida.verbo,
        traduccion: elegida.traduccion,
        tiempos: TIEMPOS,
        vocabulario: elegida.vocabulario.map(([palabra, traduccion, ejemplo]) => ({ palabra, traduccion, ejemplo })),
        fecha: new Date().toISOString(),
        origen: 'respaldo',
    };
}

module.exports = { tareaDeRespaldo };
