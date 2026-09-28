// ======================================================
// CONFIGURACIÓN
// ======================================================

const WHISPER_URL =
    "https://notas-whisper.laperladegranvalor.workers.dev/";

    // =====================================================
// COLA DE AUDIOS PARA WHISPER
// =====================================================

const colaAudios = [];

let procesandoCola = false;

let contadorAudios = 0;

// ======================================================
// ELEMENTOS
// ======================================================

const botonMicrofono =
    document.getElementById("microfono");

const botonMicrofonoFlotante =
    document.getElementById("microfonoFlotante");

const botonCargar =
    document.getElementById("cargarAlumnos");

const botonCopiar =
    document.getElementById("copiarNotas");

    const botonCopiarComentarios =
    document.getElementById(
        "copiarComentarios"
    );


botonCopiarComentarios
    ?.addEventListener(
        "click",
        copiarComentarios
    );

    function actualizarEstadoCola() {

    const pendientes =
        colaAudios.length;


    if (
        procesandoCola &&
        pendientes > 0
    ) {

        miniTexto.textContent =
            `Procesando · ${pendientes} en cola`;

        return;
    }


    if (procesandoCola) {

        miniTexto.textContent =
            "Procesando dictado…";

        return;
    }


    if (pendientes > 0) {

        miniTexto.textContent =
            `${pendientes} en cola`;

        return;
    }
}

async function copiarComentarios() {

    if (
        !alumnos ||
        alumnos.length === 0
    ) {

        mostrarError(
            "No hay alumnos cargados."
        );

        return;
    }


    // IMPORTANTE:
    // no filtramos los vacíos.
    // Cada alumno conserva su fila.

    const texto =
        alumnos
            .map(
                alumno =>
                    alumno.comentario || ""
            )
            .join("\n");


    try {

        await navigator.clipboard.writeText(
            texto
        );


        // Mensaje principal

        panelResultado
            .classList
            .remove("error");

        panelResultado
            .classList
            .add("ok");


        resultadoFinal.textContent =
            "✓ Comentarios copiados";


        // Mensaje flotante

        if (miniTexto) {

            miniTexto.textContent =
                "✓ Comentarios copiados";
        }


        miniMensajePersistente =
            true;

        actualizarMiniEstado();


    } catch (error) {

        console.error(
            "Error copiando comentarios:",
            error
        );


        mostrarError(
            "No pude copiar los comentarios."
        );
    }
}

const dictado =
    document.getElementById("dictado");

const resultadoFinal =
    document.getElementById("resultadoFinal");

const panelResultado =
    document.getElementById("panelResultado");

const estadoModelo =
    document.getElementById("estadoModelo");

const contador =
    document.getElementById("contador");

const tabla =
    document.getElementById("tabla");

const tbody =
    tabla.querySelector("tbody");

const sinAlumnos =
    document.getElementById("sinAlumnos");

const miniEstado =
    document.getElementById("miniEstado");

const miniTexto =
    document.getElementById("miniTexto");


// ======================================================
// VARIABLES
// ======================================================

let alumnos = [];

let mediaStream = null;
let audioContext = null;

let source = null;
let processor = null;
let gain = null;

let analyser = null;
let datosVolumen = null;
let animacionVolumen = null;

let escuchando = false;
let procesando = false;
let presionado = false;

let audioPreparado = false;
let preparandoAudio = false;

let temporizadorGrabacion = null;
let inicioGrabacion = 0;

let fragmentosAudio = [];
let muestrasGrabadas = 0;

// Hace que la barra flotante pueda mostrar
// errores incluso después de terminar la grabación.
let miniMensajePersistente = false;


// ======================================================
// NORMALIZAR
// ======================================================

function normalizar(texto) {

    return String(texto)

        .toLowerCase()

        .normalize("NFD")

        .replace(
            /[\u0300-\u036f]/g,
            ""
        )

        .replace(
            /[^a-z0-9ñ\s]/g,
            " "
        )

        .replace(
            /\s+/g,
            " "
        )

        .trim();
}


// ======================================================
// FONETIZAR
// ======================================================

function fonetizar(texto) {

    let t =
        normalizar(texto);

    // H muda
    t = t.replace(/h/g, "");

    // B / V
    t = t.replace(/v/g, "b");

    // Z / S / C suave
    t = t.replace(/z/g, "s");
    t = t.replace(/ce/g, "se");
    t = t.replace(/ci/g, "si");

    // GE / GI / J
    t = t.replace(/ge/g, "je");
    t = t.replace(/gi/g, "ji");

    // LL / Y
    t = t.replace(/ll/g, "y");

    // QU / Q / C fuerte
    t = t.replace(/qu/g, "k");
    t = t.replace(/c/g, "k");
    t = t.replace(/q/g, "k");

    // X
    t = t.replace(/x/g, "ks");

    // W
    t = t.replace(/w/g, "u");

    // RR
    t = t.replace(/rr/g, "r");

    return t;
}


// ======================================================
// LEVENSHTEIN
// ======================================================

function levenshtein(a, b) {

    const matriz =
        Array.from(
            {
                length:
                    b.length + 1
            },
            () =>
                Array(
                    a.length + 1
                )
        );

    for (
        let i = 0;
        i <= b.length;
        i++
    ) {
        matriz[i][0] = i;
    }

    for (
        let j = 0;
        j <= a.length;
        j++
    ) {
        matriz[0][j] = j;
    }

    for (
        let i = 1;
        i <= b.length;
        i++
    ) {

        for (
            let j = 1;
            j <= a.length;
            j++
        ) {

            const costo =
                b[i - 1] ===
                a[j - 1]
                    ? 0
                    : 1;

            matriz[i][j] =
                Math.min(
                    matriz[i - 1][j] + 1,
                    matriz[i][j - 1] + 1,
                    matriz[i - 1][j - 1] + costo
                );
        }
    }

    return matriz[b.length][a.length];
}


// ======================================================
// SIMILITUD
// ======================================================

function similitud(a, b) {

    a = fonetizar(a);
    b = fonetizar(b);

    if (!a || !b)
        return 0;

    if (a === b)
        return 1;

    const distancia =
        levenshtein(
            a,
            b
        );

    return Math.max(
        0,

        1 -
        distancia /
        Math.max(
            a.length,
            b.length
        )
    );
}


// ======================================================
// SIMILITUD DE PALABRA
// ======================================================

function similitudPalabra(a, b) {

    a = fonetizar(a);
    b = fonetizar(b);

    if (!a || !b)
        return 0;

    if (a === b)
        return 1;


    // Una contiene a la otra

    if (
        a.length >= 4 &&
        b.length >= 4 &&
        (
            a.includes(b) ||
            b.includes(a)
        )
    ) {
        return 0.92;
    }


    const distancia =
        levenshtein(
            a,
            b
        );

    const maximo =
        Math.max(
            a.length,
            b.length
        );

    let score =
        1 -
        distancia /
        maximo;


    // Un error en palabra larga

    if (
        maximo >= 6 &&
        distancia === 1
    ) {

        score =
            Math.max(
                score,
                0.90
            );
    }


    // Dos errores en palabra larga

    if (
        maximo >= 8 &&
        distancia === 2
    ) {

        score =
            Math.max(
                score,
                0.78
            );
    }


    // Prefijo común:
    // ROLLET -> ROLEX

    let inicioComun = 0;

    const limiteInicio =
        Math.min(
            a.length,
            b.length
        );

    for (
        let i = 0;
        i < limiteInicio;
        i++
    ) {

        if (
            a[i] !== b[i]
        ) {
            break;
        }

        inicioComun++;
    }

    const proporcionInicio =
        inicioComun /
        Math.min(
            a.length,
            b.length
        );

    if (
        inicioComun >= 3 &&
        proporcionInicio >= 0.60
    ) {

        score =
            Math.max(
                score,

                0.72 +
                proporcionInicio *
                0.18
            );
    }

    return Math.max(
        0,
        Math.min(
            1,
            score
        )
    );
}


// ======================================================
// VARIANTES
// ======================================================

function generarVariantesPalabras(
    palabras
) {

    const variantes =
        new Set();

    for (
        const palabra
        of palabras
    ) {

        variantes.add(
            palabra
        );
    }


    // "berry no" -> "berryno"

    for (
        let i = 0;
        i <
        palabras.length - 1;
        i++
    ) {

        variantes.add(
            palabras[i] +
            palabras[i + 1]
        );
    }


    // Unir tres palabras

    for (
        let i = 0;
        i <
        palabras.length - 2;
        i++
    ) {

        variantes.add(
            palabras[i] +
            palabras[i + 1] +
            palabras[i + 2]
        );
    }

    return [
        ...variantes
    ];
}


// ======================================================
// COMPARAR CONJUNTO
// ======================================================

function compararConjuntoPalabras(
    palabrasDichas,
    palabrasObjetivo
) {

    if (
        palabrasDichas.length === 0 ||
        palabrasObjetivo.length === 0
    ) {
        return 0;
    }

    const variantesDichas =
        generarVariantesPalabras(
            palabrasDichas
        );

    const variantesObjetivo =
        generarVariantesPalabras(
            palabrasObjetivo
        );

    let total = 0;

    for (
        const objetivo
        of variantesObjetivo
    ) {

        let mejor = 0;

        for (
            const dicha
            of variantesDichas
        ) {

            mejor =
                Math.max(
                    mejor,

                    similitudPalabra(
                        dicha,
                        objetivo
                    )
                );
        }

        total += mejor;
    }

    return (
        total /
        variantesObjetivo.length
    );
}


// ======================================================
// PALABRAS DE RUIDO
// ======================================================

const PALABRAS_RUIDO =
    new Set([
        "el",
        "la",
        "los",
        "las",
        "de",
        "del",
        "a",
        "al",
        "un",
        "una",
        "y",
        "en",
        "es"
    ]);


function limpiarPalabrasDictadas(
    palabras
) {

    return palabras.filter(

        palabra =>

            !PALABRAS_RUIDO.has(
                normalizar(
                    palabra
                )
            )
    );
}


// ======================================================
// CONVERTIR NOTA
// ======================================================

function convertirNumero(texto) {

    const mapa = {

        cero: 0,

        uno: 1,
        una: 1,

        dos: 2,
        tres: 3,
        cuatro: 4,
        cinco: 5,
        seis: 6,
        siete: 7,
        ocho: 8,
        nueve: 9,
        diez: 10
    };

    texto =
        normalizar(texto);

    if (
        Object.prototype
            .hasOwnProperty
            .call(
                mapa,
                texto
            )
    ) {
        return mapa[texto];
    }

    if (
        /^(10|[0-9])$/
            .test(texto)
    ) {

        return Number(
            texto
        );
    }

    return NaN;
}


// ======================================================
// ESTADO INICIAL
// ======================================================

if (estadoModelo) {

    estadoModelo.textContent =
        "☁️ Reconocimiento por Whisper";
}


// ======================================================
// PORTAPAPELES - BOTÓN
// ======================================================

if (botonCargar) {

    botonCargar.addEventListener(

        "click",

        async () => {

            try {

                const texto =
                    await navigator
                        .clipboard
                        .readText();

                cargarAlumnos(
                    texto
                );

            }

            catch (error) {

                console.error(
                    error
                );

                mostrarError(
                    "No pude leer el portapapeles."
                );
            }
        }
    );
}


// ======================================================
// CARGAR ALUMNOS
// ======================================================

function cargarAlumnos(texto) {

    const lineas =
        texto.split(
            /\r?\n/
        );

    const nuevos = [];

    for (
        const linea
        of lineas
    ) {

        if (
            !linea.trim()
        ) {
            continue;
        }

        let partes =
            linea.split("\t");


        // También admite columnas separadas
        // por dos o más espacios.

        if (
            partes.length < 2
        ) {

            partes =
                linea
                    .trim()
                    .split(
                        /\s{2,}/
                    );
        }

        if (
            partes.length < 2
        ) {
            continue;
        }

        const apellido =
            partes[0].trim();

        const nombre =
            partes[1].trim();

        if (
            !apellido ||
            !nombre
        ) {
            continue;
        }

        nuevos.push({

            apellido,

            nombre,

            nota: "",
            comentario: ""
        });
    }

    alumnos =
        nuevos;

    renderTabla();

    panelResultado
        ?.classList
        .remove(
            "ok",
            "error"
        );

    dictado.textContent =
        "Lista cargada";

    resultadoFinal.textContent =
        alumnos.length +
        " alumnos";

    if (miniTexto) {

        miniTexto.textContent =
            "✓ " +
            alumnos.length +
            " alumnos";
    }

    miniMensajePersistente =
        false;

    actualizarBoton();

    console.log(
        "📋 Alumnos cargados:",
        alumnos
    );

    // Pedimos el micrófono de antemano para
    // que la primera grabación sea inmediata.
    prepararAudio();
}


// ======================================================
// TABLA
// ======================================================

function renderTabla() {

    tbody.innerHTML =
        "";

    if (
        alumnos.length === 0
    ) {

        tabla.style.display =
            "none";

        sinAlumnos.style.display =
            "block";

        actualizarContador();

        return;
    }

    tabla.style.display =
        "table";

    sinAlumnos.style.display =
        "none";

    alumnos.forEach(
        (
            alumno,
            index
        ) => {

            const tr =
                document.createElement(
                    "tr"
                );

            const tdApellido =
                document.createElement(
                    "td"
                );

            const tdNombre =
                document.createElement(
                    "td"
                );

            const tdNota =
                document.createElement(
                    "td"
                );

            const tdComentario = document.createElement("td");

            const inputComentario =
    document.createElement("input");

inputComentario.className =
    "inputComentario";

inputComentario.type =
    "text";

inputComentario.placeholder =
    "Sin comentario";

inputComentario.value =
    alumno.comentario || "";

inputComentario.addEventListener(
    "change",
    () => {
        alumno.comentario =
            inputComentario.value.trim();
    }
);

            tdApellido.textContent =
                alumno.apellido;

            tdNombre.textContent =
                alumno.nombre;

            tdNota.className =
                "nota";

            const input =
                document.createElement(
                    "input"
                );

            input.className =
                "inputNota";

            input.type =
                "number";

            input.min =
                "0";

            input.max =
                "10";

            input.value =
                alumno.nota;

            input.addEventListener(

                "change",

                () => {

                    const valor =
                        input.value;

                    if (
                        valor === ""
                    ) {

                        alumno.nota =
                            "";
                    }

                    else {

                        const numero =
                            Number(
                                valor
                            );

                        if (
                            numero < 0 ||
                            numero > 10
                        ) {

                            input.value =
                                alumno.nota;

                            return;
                        }

                        alumno.nota =
                            numero;
                    }

                    actualizarFila(
                        index
                    );

                    actualizarContador();
                }
            );

            tdNota.appendChild(
                input
            );

            tr.appendChild(
                tdApellido
            );

            tr.appendChild(
                tdNombre
            );

            tr.appendChild(
                tdNota
            );

            tdComentario.appendChild(inputComentario);

            tr.appendChild(
                tdComentario
            );

            tbody.appendChild(
                tr
            );

            actualizarFila(
                index
            );
        }
    );

    actualizarContador();
}


// ======================================================
// ACTUALIZAR FILA
// ======================================================

function actualizarFila(index) {

    const fila =
        tbody.children[index];

    if (!fila)
        return;

    fila.classList.remove(
        "asignado",
        "desaprobado"
    );

    const nota =
        alumnos[index].nota;

    if (
        nota === ""
    ) {
        return;
    }

    if (
        Number(nota) >= 6
    ) {

        fila.classList.add(
            "asignado"
        );
    }

    else {

        fila.classList.add(
            "desaprobado"
        );
    }
}


// ======================================================
// CONTADOR
// ======================================================

function actualizarContador() {

    const cargadas =
        alumnos.filter(

            alumno =>
                alumno.nota !== ""

        ).length;

    contador.textContent =

        alumnos.length +
        " alumnos · " +

        cargadas +
        " notas cargadas";
}


// ======================================================
// BOTONES
// ======================================================

function actualizarBoton() {

    // Ya NO esperamos ningún modelo.
    // Solo necesitamos alumnos.

    const deshabilitado =
        alumnos.length === 0;

    botonMicrofono.disabled =
        deshabilitado;

    if (
        botonMicrofonoFlotante
    ) {

        botonMicrofonoFlotante.disabled =
            deshabilitado;
    }
}


actualizarBoton();


// ======================================================
// PREPARAR MICRÓFONO
// ======================================================

async function prepararAudio() {

    if (
        audioPreparado ||
        preparandoAudio ||
        alumnos.length === 0
    ) {
        return;
    }

    preparandoAudio =
        true;

    try {

        mediaStream =
            await navigator
                .mediaDevices
                .getUserMedia({

                    video: false,

                    audio: {

                        echoCancellation:
                            true,

                        noiseSuppression:
                            true,

                        autoGainControl:
                            true,

                        channelCount:
                            1
                    }
                });


        audioContext =
            new AudioContext({
                sampleRate: 16000
            });


        await audioContext.resume();


        console.log(
            "AudioContext:",
            audioContext.sampleRate,
            "Hz"
        );


        source =
            audioContext
                .createMediaStreamSource(
                    mediaStream
                );


        // ==========================================
        // ANALIZADOR DE VOLUMEN
        // ==========================================

        analyser =
            audioContext
                .createAnalyser();

        analyser.fftSize =
            256;

        analyser.smoothingTimeConstant =
            0.75;

        datosVolumen =
            new Uint8Array(
                analyser.frequencyBinCount
            );

        source.connect(
            analyser
        );


        // ==========================================
        // CAPTURA PCM
        // ==========================================

        processor =
            audioContext
                .createScriptProcessor(
                    4096,
                    1,
                    1
                );

        gain =
            audioContext
                .createGain();

        gain.gain.value =
            0;

        source.connect(
            processor
        );

        processor.connect(
            gain
        );

        gain.connect(
            audioContext.destination
        );


        processor.onaudioprocess =
            evento => {

                if (
                    !escuchando
                ) {
                    return;
                }

                try {

                    const canal =
                        evento
                            .inputBuffer
                            .getChannelData(
                                0
                            );

                    const copia =
                        new Float32Array(
                            canal.length
                        );

                    copia.set(
                        canal
                    );

                    fragmentosAudio.push(
                        copia
                    );

                    muestrasGrabadas +=
                        copia.length;

                }

                catch (error) {

                    console.error(
                        "Error guardando audio:",
                        error
                    );
                }
            };


        audioPreparado =
            true;

        console.log(
            "✅ Micrófono preparado"
        );

    }

    catch (error) {

        console.error(
            "Error preparando audio:",
            error
        );

        audioPreparado =
            false;

        mostrarError(
            "No pude acceder al micrófono."
        );

    }

    finally {

        preparandoAudio =
            false;
    }
}


// ======================================================
// CONVERTIR PCM → WAV
// ======================================================

function convertirPCMawav(
    pcm,
    sampleRate
) {

    const canales = 1;

    const bitsPorMuestra =
        16;

    const bytesPorMuestra =
        bitsPorMuestra / 8;

    const dataLength =
        pcm.length *
        bytesPorMuestra;

    const buffer =
        new ArrayBuffer(
            44 +
            dataLength
        );

    const view =
        new DataView(
            buffer
        );


    escribirTexto(
        view,
        0,
        "RIFF"
    );

    view.setUint32(
        4,
        36 + dataLength,
        true
    );

    escribirTexto(
        view,
        8,
        "WAVE"
    );

    escribirTexto(
        view,
        12,
        "fmt "
    );

    view.setUint32(
        16,
        16,
        true
    );

    view.setUint16(
        20,
        1,
        true
    );

    view.setUint16(
        22,
        canales,
        true
    );

    view.setUint32(
        24,
        sampleRate,
        true
    );

    view.setUint32(
        28,

        sampleRate *
        canales *
        bytesPorMuestra,

        true
    );

    view.setUint16(
        32,

        canales *
        bytesPorMuestra,

        true
    );

    view.setUint16(
        34,
        bitsPorMuestra,
        true
    );

    escribirTexto(
        view,
        36,
        "data"
    );

    view.setUint32(
        40,
        dataLength,
        true
    );


    let offset = 44;

    for (
        let i = 0;
        i < pcm.length;
        i++
    ) {

        let muestra =
            Math.max(
                -1,
                Math.min(
                    1,
                    pcm[i]
                )
            );

        muestra =
            muestra < 0
                ? muestra * 32768
                : muestra * 32767;

        view.setInt16(
            offset,
            muestra,
            true
        );

        offset += 2;
    }


    return new Blob(
        [buffer],
        {
            type:
                "audio/wav"
        }
    );
}


function escribirTexto(
    view,
    offset,
    texto
) {

    for (
        let i = 0;
        i < texto.length;
        i++
    ) {

        view.setUint8(
            offset + i,
            texto.charCodeAt(i)
        );
    }
}


// ======================================================
// CONTEXTO PARA WHISPER
// ======================================================

function obtenerContextoAlumnos() {

    return alumnos.map(
        alumno => ({

            apellido:
                alumno.apellido,

            nombre:
                alumno.nombre
        })
    );
}


// ======================================================
// ENVIAR AUDIO A WHISPER
// ======================================================
async function procesarAudioDeCola(trabajo) {

    const chunks = trabajo.audio;

    if (!chunks || chunks.length === 0) {
        throw new Error(
            "El audio de la cola está vacío."
        );
    }


    // ==========================================
    // 1. UNIR FRAGMENTOS PCM
    // ==========================================

    let totalMuestras = 0;

    for (const chunk of chunks) {
        totalMuestras += chunk.length;
    }


    const pcm =
        new Float32Array(
            totalMuestras
        );


    let offset = 0;

    for (const chunk of chunks) {

        pcm.set(
            chunk,
            offset
        );

        offset += chunk.length;
    }


    // ==========================================
    // 2. SAMPLE RATE
    // ==========================================

    const sampleRate =
        audioContext?.sampleRate ||
        16000;


    const duracion =
        pcm.length /
        sampleRate;


    console.log(
        `🎧 Audio ${trabajo.id}:`,
        duracion.toFixed(2),
        "segundos"
    );


    console.log(
        "🎧 Sample rate:",
        sampleRate
    );


    if (duracion < 0.15) {

        throw new Error(
            "El audio fue demasiado corto."
        );
    }


    // ==========================================
    // 3. PCM → WAV
    // ==========================================

    const wavBlob =
        convertirPCMawav(
            pcm,
            sampleRate
        );


    console.log(
        `📦 WAV ${trabajo.id}:`,
        wavBlob.size,
        "bytes"
    );


    // ==========================================
    // 4. CREAR FORMDATA
    // ==========================================

    const formData =
        new FormData();


    formData.append(
        "audio",
        wavBlob,
        `dictado-${trabajo.id}.wav`
    );


    // Mandamos también los alumnos
    // para darle contexto al Worker.

    formData.append(
        "alumnos",
        JSON.stringify(
            obtenerContextoAlumnos()
        )
    );


    console.log(
        `☁️ Enviando audio ${trabajo.id} a Whisper`
    );


    const inicio =
        performance.now();


    // ==========================================
    // 5. ENVIAR AL WORKER
    // ==========================================

    const respuesta =
        await fetch(
            WHISPER_URL,
            {
                method: "POST",

                // MUY IMPORTANTE:
                // NO poner Content-Type acá.
                //
                // El navegador genera automáticamente:
                //
                // multipart/form-data;
                // boundary=....

                body: formData
            }
        );


    console.log(
        `Whisper ${trabajo.id}:`,
        (
            performance.now() -
            inicio
        ).toFixed(0),
        "ms"
    );


    // ==========================================
    // 6. LEER RESPUESTA
    // ==========================================

    let datos;


    try {

        datos =
            await respuesta.json();

    }

    catch (error) {

        const texto =
            await respuesta.text()
                .catch(() => "");

        throw new Error(
            texto ||
            "Whisper devolvió una respuesta inválida."
        );
    }


    console.log(
        `☁️ Respuesta Whisper ${trabajo.id}:`,
        datos
    );


    // ==========================================
    // 7. CONTROLAR ERRORES
    // ==========================================

    if (
        !respuesta.ok ||
        datos?.ok === false
    ) {

        throw new Error(
            datos?.error ||
            `Error HTTP ${respuesta.status}`
        );
    }


    // ==========================================
    // 8. OBTENER TRANSCRIPCIÓN
    // ==========================================

    const texto =
        String(
            datos?.text ??
            datos?.texto ??
            datos?.transcription ??
            ""
        )
        .trim();


    if (!texto) {

        throw new Error(
            "Whisper no devolvió texto."
        );
    }


    console.log(
        `📝 Dictado ${trabajo.id}:`,
        texto
    );


    // ==========================================
    // 9. MOSTRAR Y PROCESAR
    // ==========================================

    dictado.textContent =
        texto;


    procesarDictado(
        texto
    );


    return texto;
}

// ======================================================
// MEDIDOR DE VOLUMEN
// ======================================================

function iniciarMedidorVolumen() {

    if (
        !analyser
    ) {
        return;
    }


    if (
        animacionVolumen
    ) {

        cancelAnimationFrame(
            animacionVolumen
        );
    }


    function actualizar() {

        if (
            !escuchando ||
            !analyser
        ) {

            botonMicrofono
                .style
                .setProperty(
                    "--nivel",
                    0
                );


            if (
                botonMicrofonoFlotante
            ) {

                botonMicrofonoFlotante
                    .style
                    .setProperty(
                        "--nivel",
                        0
                    );
            }

            return;
        }


        analyser
            .getByteFrequencyData(
                datosVolumen
            );


        let suma = 0;


        for (
            let i = 0;
            i < datosVolumen.length;
            i++
        ) {

            suma +=
                datosVolumen[i];
        }


        const promedio =
            suma /
            datosVolumen.length;


        let nivel =
            (
                promedio - 5
            ) / 45;


        nivel =
            Math.max(
                0,
                Math.min(
                    nivel,
                    1
                )
            );


        botonMicrofono
            .style
            .setProperty(
                "--nivel",
                nivel
            );


        if (
            botonMicrofonoFlotante
        ) {

            botonMicrofonoFlotante
                .style
                .setProperty(
                    "--nivel",
                    nivel
                );
        }


        animacionVolumen =
            requestAnimationFrame(
                actualizar
            );
    }


    actualizar();
}


// ======================================================
// TEMPORIZADOR
// ======================================================

function iniciarTemporizador() {

    inicioGrabacion =
        Date.now();


    if (
        temporizadorGrabacion
    ) {

        clearInterval(
            temporizadorGrabacion
        );
    }


    function actualizar() {

        if (
            !escuchando
        ) {
            return;
        }


        const segundos =
            Math.floor(
                (
                    Date.now() -
                    inicioGrabacion
                ) /
                1000
            );


        const minutos =
            Math.floor(
                segundos / 60
            );


        const resto =
            segundos % 60;


        const tiempo =

            String(minutos)
                .padStart(
                    2,
                    "0"
                )

            +

            ":"

            +

            String(resto)
                .padStart(
                    2,
                    "0"
                );


        resultadoFinal.textContent =
            "🔴 " +
            tiempo +
            " · Grabando";


        if (
            miniTexto
        ) {

            miniTexto.textContent =
                "🔴 " +
                tiempo +
                " · Grabando";
        }
    }


    actualizar();


    temporizadorGrabacion =
        setInterval(
            actualizar,
            250
        );
}


// ======================================================
// EMPEZAR DICTADO
// ======================================================

async function empezarDictado() {

    if (
        presionado ||
        escuchando ||
        procesando ||
        botonMicrofono.disabled
    ) {
        return;
    }


    presionado =
        true;


    miniMensajePersistente =
        false;


    try {

        if (
            !audioPreparado
        ) {

            dictado.textContent =
                "Preparando micrófono...";


            if (
                miniTexto
            ) {

                miniTexto.textContent =
                    "🎤 Preparando...";
            }


            await prepararAudio();
        }


        // El usuario pudo soltar mientras
        // se pedía permiso.

        if (
            !presionado
        ) {
            return;
        }


        if (
            !audioPreparado
        ) {

            presionado =
                false;

            return;
        }


        if (
            audioContext.state ===
            "suspended"
        ) {

            await audioContext.resume();
        }


        fragmentosAudio =
            [];

        muestrasGrabadas =
            0;


        escuchando =
            true;


        panelResultado
            .classList
            .remove(
                "ok",
                "error"
            );


        botonMicrofono
            .classList
            .add(
                "activo"
            );




        if (
            botonMicrofonoFlotante
        ) {

            botonMicrofonoFlotante
                .classList
                .add(
                    "activo"
                );


        }


        dictado.textContent =
            "Grabando...";


        resultadoFinal.textContent =
            "🔴 00:00 · Grabando";


        if (
            miniTexto
        ) {

            miniTexto.textContent =
                "🎙️ Grabando...";
        }


        iniciarMedidorVolumen();

        iniciarTemporizador();

        actualizarMiniEstado();

    }

    catch (error) {

        console.error(
            "Error iniciando dictado:",
            error
        );


        presionado =
            false;

        escuchando =
            false;


        mostrarError(
            "No pude iniciar el dictado."
        );
    }
}

async function procesarCola() {

    // Ya hay otro audio procesándose.
    if (procesandoCola) {
        return;
    }


    // No queda nada.
    if (colaAudios.length === 0) {

        actualizarEstadoCola();

        return;
    }


    procesandoCola =
        true;


    const trabajo =
        colaAudios.shift();


    actualizarEstadoCola();


    console.log(
        `☁️ Procesando audio ${trabajo.id}`
    );


    try {

        await procesarAudioDeCola(
            trabajo
        );

    } catch (error) {

        console.error(
            `Error procesando audio ${trabajo.id}:`,
            error
        );


        mostrarError(
            "Error procesando un dictado."
        );

    } finally {

        procesandoCola =
            false;


        actualizarEstadoCola();


        // Procesamos automáticamente
        // el siguiente.

        procesarCola();
    }
}

function encolarAudioGrabado() {

    if (
        !fragmentosAudio ||
        fragmentosAudio.length === 0
    ) {
        console.warn(
            "⚠️ No hay audio para encolar"
        );

        return false;
    }


    const id =
        ++contadorAudios;


    // ==========================================
    // COPIAR AUDIO
    // ==========================================
    //
    // Cada grabación necesita su propia copia.
    // Así podemos limpiar fragmentosAudio y
    // empezar otra grabación inmediatamente.

    const audio =
        fragmentosAudio.map(
            fragmento =>
                new Float32Array(
                    fragmento
                )
        );


    const totalMuestras =
        muestrasGrabadas;


    // ==========================================
    // AGREGAR A LA COLA
    // ==========================================

    colaAudios.push({

        id,

        audio,

        muestrasGrabadas:
            totalMuestras

    });


    console.log(
        `📥 Audio ${id} agregado a la cola`
    );

    console.log(
        `📚 Audios pendientes: ${colaAudios.length}`
    );


    // ==========================================
    // IMPORTANTE:
    // LIBERAMOS EL BUFFER ACTUAL
    // ==========================================

    fragmentosAudio =
        [];

    muestrasGrabadas =
        0;


    actualizarEstadoCola();


    // No usamos await.
    //
    // Whisper empieza a trabajar en segundo
    // plano mientras nosotros podemos volver
    // a grabar.

    procesarCola();


    return true;
}
// ======================================================
// TERMINAR DICTADO
// ======================================================

async function terminarDictado() {

    presionado =
        false;


    if (
        !escuchando ||
        procesando
    ) {
        return;
    }


    /*
        Pequeña cola.

        Si soltás justo después de decir:

        "tres"

        dejamos 180 ms para no cortar
        el final de la palabra.
    */

    procesando =
        true;


    await new Promise(
        resolve =>
            setTimeout(
                resolve,
                180
            )
    );


    escuchando =
        false;


    // ==========================================
    // DETENER UI DE GRABACIÓN
    // ==========================================

    if (
        temporizadorGrabacion
    ) {

        clearInterval(
            temporizadorGrabacion
        );

        temporizadorGrabacion =
            null;
    }


    if (
        animacionVolumen
    ) {

        cancelAnimationFrame(
            animacionVolumen
        );

        animacionVolumen =
            null;
    }


    botonMicrofono
        .style
        .setProperty(
            "--nivel",
            0
        );


    if (
        botonMicrofonoFlotante
    ) {

        botonMicrofonoFlotante
            .style
            .setProperty(
                "--nivel",
                0
            );
    }


    botonMicrofono
        .classList
        .remove(
            "activo"
        );



    if (
        botonMicrofonoFlotante
    ) {

        botonMicrofonoFlotante
            .classList
            .remove(
                "activo"
            );


    }


    // ==========================================
    // PROCESANDO
    // ==========================================

    dictado.textContent =
        "Procesando audio...";


    resultadoFinal.textContent =
        "⏳ Reconociendo...";


    if (
        miniTexto
    ) {

        miniTexto.textContent =
            "⏳ Reconociendo...";
    }


    miniMensajePersistente =
        true;


    actualizarMiniEstado();


    try {

    const agregado =
        encolarAudioGrabado();


    if (!agregado) {

        mostrarError(
            "No se grabó audio."
        );

        return;
    }


    console.log(
        "🎧 Audio enviado a la cola"
    );


    dictado.textContent =
        "Audio en cola";


    resultadoFinal.textContent =
        "✓ Podés seguir dictando";


    if (miniTexto) {

        miniTexto.textContent =
            "✓ Audio en cola";
    }


    miniMensajePersistente =
        true;


    actualizarMiniEstado();

}

catch (error) {

    console.error(
        "Error agregando audio a la cola:",
        error
    );


    mostrarError(
        error?.message ||
        "No pude guardar el audio."
    );

}

finally {

    // NO limpiamos fragmentosAudio acá.
    //
    // encolarAudioGrabado() ya hizo una copia
    // y limpió los buffers.


    // Esto libera inmediatamente
    // el micrófono para otro dictado.

    procesando =
        false;


    actualizarMiniEstado();
}
}


// ======================================================
// POINTER EVENTS
// ======================================================

function configurarBotonMantener(
    boton
) {

    if (
        !boton
    ) {
        return;
    }


    boton.addEventListener(

        "pointerdown",

        async evento => {

            if (
                botonMicrofono.disabled ||
                procesando
            ) {
                return;
            }


            evento.preventDefault();


            try {

                boton.setPointerCapture(
                    evento.pointerId
                );

            }

            catch {}


            await empezarDictado();
        }
    );


    boton.addEventListener(

        "pointerup",

        evento => {

            evento.preventDefault();

            terminarDictado();
        }
    );


    boton.addEventListener(

        "pointercancel",

        () => {

            terminarDictado();
        }
    );


    boton.addEventListener(

        "contextmenu",

        evento => {

            evento.preventDefault();
        }
    );
}


configurarBotonMantener(
    botonMicrofono
);


configurarBotonMantener(
    botonMicrofonoFlotante
);


// ======================================================
// BOTÓN FLOTANTE
// ======================================================

if (
    botonMicrofonoFlotante
) {

    const observadorMicrofono =
        new IntersectionObserver(

            entradas => {

                const visible =
                    entradas[0]
                        .isIntersecting;


                botonMicrofonoFlotante
                    .classList
                    .toggle(
                        "visible",
                        !visible
                    );


                actualizarMiniEstado();
            },

            {
                threshold: 0.2
            }
        );


    observadorMicrofono.observe(
        botonMicrofono
    );
}


// ======================================================
// PROCESAR DICTADO
// ======================================================

function procesarDictado(texto) {

    const palabras =
        normalizar(texto)
            .split(/\s+/)
            .filter(Boolean);


    if (
        palabras.length < 2
    ) {

        mostrarError(
            "No escuché alumno y nota."
        );

        return;
    }


    // ==========================================
    // BUSCAR NOTA
    // ==========================================

    let nota =
        NaN;

    let indiceNota =
        -1;


    for (
        let i =
            palabras.length - 1;

        i >= 0;

        i--
    ) {

        const posible =
            convertirNumero(
                palabras[i]
            );


        if (
            !Number.isNaN(
                posible
            )
        ) {

            nota =
                posible;

            indiceNota =
                i;

            break;
        }
    }


    if (
        Number.isNaN(
            nota
        )
    ) {

        mostrarError(
            "No reconocí una nota del 0 al 10."
        );

        return;
    }


    // Sacamos la nota para buscar alumno.

    // Todo lo anterior a la nota = alumno
const palabrasAlumno =
    palabras.slice(
        0,
        indiceNota
    );

// Todo lo posterior = comentario
const palabrasComentario =
    palabras.slice(
        indiceNota + 1
    );

const nombreDicho =
    palabrasAlumno.join(" ");

const comentario =
    palabrasComentario
        .join(" ")
        .trim();

console.log(
    "Comentario:",
    comentario
);


    if (
        !nombreDicho
    ) {

        mostrarError(
            "No reconocí el alumno."
        );

        return;
    }


    const palabrasDichas =
        limpiarPalabrasDictadas(

            normalizar(
                nombreDicho
            )

                .split(/\s+/)

                .filter(Boolean)
        );


    if (
        palabrasDichas.length === 0
    ) {

        mostrarError(
            "No reconocí el apellido."
        );

        return;
    }


    // ==========================================
    // CANDIDATOS
    // ==========================================

    const candidatos =
        alumnos.map(

            (
                alumno,
                index
            ) => {

                const apellido =
                    normalizar(
                        alumno.apellido
                    );


                const nombre =
                    normalizar(
                        alumno.nombre
                    );


                const palabrasApellido =
                    apellido
                        .split(/\s+/)
                        .filter(Boolean);


                const palabrasNombre =
                    nombre
                        .split(/\s+/)
                        .filter(Boolean);


                const scoreApellido =
                    compararConjuntoPalabras(
                        palabrasDichas,
                        palabrasApellido
                    );


                const scoreNombre =
                    compararConjuntoPalabras(
                        palabrasDichas,
                        palabrasNombre
                    );


                const variantesDichas =
                    generarVariantesPalabras(
                        palabrasDichas
                    );


                const variantesApellido =
                    generarVariantesPalabras(
                        palabrasApellido
                    );


                let mejorApellidoIndividual =
                    0;


                for (
                    const dicha
                    of variantesDichas
                ) {

                    for (
                        const ap
                        of variantesApellido
                    ) {

                        mejorApellidoIndividual =
                            Math.max(

                                mejorApellidoIndividual,

                                similitudPalabra(
                                    dicha,
                                    ap
                                )
                            );
                    }
                }


                // BONUS POR COINCIDENCIA FONÉTICA

                let bonusExacto =
                    0;


                for (
                    const dicha
                    of variantesDichas
                ) {

                    for (
                        const ap
                        of variantesApellido
                    ) {

                        if (
                            fonetizar(dicha) ===
                            fonetizar(ap)
                        ) {

                            bonusExacto =
                                Math.max(
                                    bonusExacto,
                                    0.15
                                );
                        }
                    }
                }


                const scoreApellidoCompleto =
                    similitud(

                        palabrasDichas
                            .join(" "),

                        apellido
                    );


                /*
                    El apellido domina.

                    El nombre ayuda, pero no debería
                    hacer que ROCHA gane a ROLLET
                    simplemente por ruido.
                */

                let score =

                    scoreApellido *
                    0.60

                    +

                    mejorApellidoIndividual *
                    0.30

                    +

                    scoreNombre *
                    0.05

                    +

                    scoreApellidoCompleto *
                    0.05

                    +

                    bonusExacto;


                const fuerzaApellido =
                    Math.max(

                        scoreApellido,

                        mejorApellidoIndividual
                    );


                if (
                    fuerzaApellido >=
                    0.88
                ) {

                    score =
                        Math.max(

                            score,

                            0.88 +

                            (
                                fuerzaApellido -
                                0.88
                            )

                            * 0.5
                        );
                }


                score =
                    Math.min(
                        score,
                        1
                    );


                return {

                    index,

                    score,

                    scoreApellido,

                    scoreNombre,

                    mejorApellidoIndividual,

                    scoreApellidoCompleto,

                    alumno
                };
            }
        );


    candidatos.sort(

        (a, b) =>
            b.score -
            a.score
    );


    const primero =
        candidatos[0];

    const segundo =
        candidatos[1];


    if (
        !primero
    ) {

        mostrarError(
            "No encontré ningún alumno."
        );

        return;
    }


    // ==========================================
    // DEBUG
    // ==========================================

    console.log(
        "Dictado:",
        texto
    );


    console.log(
        "Alumno dicho:",
        nombreDicho
    );


    console.log(
        "Mejor:",
        primero.alumno,
        primero.score
    );


    console.log(
        "Segundo:",
        segundo?.alumno,
        segundo?.score
    );


    console.table(

        candidatos
            .slice(
                0,
                5
            )

            .map(

                c => ({

                    alumno:
                        c.alumno.apellido +
                        " " +
                        c.alumno.nombre,

                    total:
                        c.score
                            .toFixed(3),

                    apellido:
                        c.scoreApellido
                            .toFixed(3),

                    nombre:
                        c.scoreNombre
                            .toFixed(3),

                    mejorApellido:
                        c.mejorApellidoIndividual
                            .toFixed(3)
                })
            )
    );


    // ==========================================
    // CONFIANZA
    // ==========================================

    const confianza =
        primero.score;


    const diferencia =
        segundo

            ? primero.score -
              segundo.score

            : 1;


    if (
        confianza < 0.58 &&
        primero.mejorApellidoIndividual <
            0.82
    ) {

        mostrarError(

            "No estoy seguro del alumno. " +

            "Entendí: “" +

            nombreDicho +

            "”"
        );

        return;
    }


    if (
        segundo &&
        diferencia < 0.06 &&
        confianza < 0.88
    ) {

        mostrarError(

            "¿" +

            primero.alumno.apellido +
            " " +
            primero.alumno.nombre +

            " o " +

            segundo.alumno.apellido +
            " " +
            segundo.alumno.nombre +

            "?"
        );

        return;
    }


    asignarNota(
        primero.index,
        nota,
        comentario
    );
}


// ======================================================
// ASIGNAR NOTA
// ======================================================

function asignarNota(
    index,
    nota,
    comentario = ""
) {

    alumnos[index].nota =
        nota;
    
    alumnos[index].comentario = comentario;


    const fila =
        tbody.children[index];


    if (
        fila
    ) {

        const input =
            fila.querySelector(
                ".inputNota"
            );


        if (
            input
        ) {

            input.value =
                nota;
        }
        const inputComentario =
    fila.querySelector(
        ".inputComentario"
    );

if (inputComentario) {
    inputComentario.value =
        comentario;
}


        actualizarFila(
            index
        );


        fila.scrollIntoView({

            behavior:
                "smooth",

            block:
                "center"

        });
    }


    actualizarContador();


    const alumno =
        alumnos[index];


    panelResultado
        .classList
        .remove(
            "error"
        );


    panelResultado
        .classList
        .add(
            "ok"
        );


    resultadoFinal.textContent =

        "✅ " +

        alumno.apellido +
        " " +
        alumno.nombre +

        " → " +

        nota;


    if (
        miniTexto
    ) {

        miniTexto.textContent =

            "✓ " +

            alumno.apellido +

            " · " +

            nota;
    }


    // También queda visible al lado
    // del botón flotante.

    miniMensajePersistente =
        true;


    actualizarMiniEstado();


    hablar(
        alumno.nombre + " " + alumno.apellido + " " + nota
    );
}


// ======================================================
// ERROR
// ======================================================

function mostrarError(
    mensaje
) {

    panelResultado
        .classList
        .remove(
            "ok"
        );


    panelResultado
        .classList
        .add(
            "error"
        );


    resultadoFinal.textContent =
        "⚠️ " +
        mensaje;


    // IMPORTANTE:
    // también aparece en la barra
    // junto al micrófono flotante.

    if (
        miniTexto
    ) {

        miniTexto.textContent =
            "⚠️ " +
            mensaje;
    }


    miniMensajePersistente =
        true;


    actualizarMiniEstado();
}


// ======================================================
// HABLAR
// ======================================================

function hablar(texto) {

    if (
        !(
            "speechSynthesis"
            in window
        )
    ) {
        return;
    }


    speechSynthesis.cancel();


    const voz =
        new SpeechSynthesisUtterance(
            texto
        );


    voz.lang =
        "es-AR";


    voz.rate =
        1.1;


    speechSynthesis.speak(
        voz
    );
}


// ======================================================
// COPIAR NOTAS
// ======================================================

botonCopiar.addEventListener(

    "click",

    async () => {

        if (
            alumnos.length === 0
        ) {

            mostrarError(
                "No hay alumnos cargados."
            );

            return;
        }


        /*
            Conservamos espacios vacíos.

            Ejemplo:

            8

            6
            9

            para pegar directamente en
            la columna del sistema.
        */

        const texto =
            alumnos

                .map(

                    alumno =>

                        alumno.nota === ""

                            ? ""

                            : alumno.nota
                )

                .join("\n");


        try {

            await navigator
                .clipboard
                .writeText(
                    texto
                );


            panelResultado
                .classList
                .remove(
                    "error"
                );


            panelResultado
                .classList
                .add(
                    "ok"
                );


            resultadoFinal.textContent =
                "📋 Notas copiadas";


            if (
                miniTexto
            ) {

                miniTexto.textContent =
                    "📋 Notas copiadas";
            }


            miniMensajePersistente =
                true;


            actualizarMiniEstado();

        }

        catch (error) {

            console.error(
                error
            );


            mostrarError(
                "No pude copiar las notas."
            );
        }
    }
);


// ======================================================
// MINI ESTADO
// ======================================================

function actualizarMiniEstado() {

    if (
        !miniEstado
    ) {
        return;
    }


    const rect =
        botonMicrofono
            .getBoundingClientRect();


    const botonPrincipalFuera =

        rect.bottom < 80 ||

        rect.top >
        window.innerHeight - 80;


    /*
        Ahora la barra aparece si:

        - estamos grabando
        - estamos procesando
        - hubo un error
        - acabamos de poner una nota

        PERO solamente cuando el micrófono
        principal quedó fuera de pantalla.
    */

    const mostrar =

        botonPrincipalFuera &&

        (
            escuchando ||
            procesando ||
            miniMensajePersistente
        );


    miniEstado
        .classList
        .toggle(
            "visible",
            mostrar
        );
}


// ======================================================
// SCROLL
// ======================================================

window.addEventListener(

    "scroll",

    actualizarMiniEstado,

    {
        passive: true
    }
);


// ======================================================
// SEGURIDAD AL PERDER FOCO
// ======================================================

window.addEventListener(

    "blur",

    () => {

        if (
            escuchando
        ) {

            terminarDictado();
        }
    }
);


// ======================================================
// ATAJOS PC
// ======================================================

document.addEventListener(

    "keydown",

    async evento => {

        const elemento =
            document.activeElement;


        const escribiendo =
            elemento &&
            (
                elemento.tagName ===
                    "INPUT" ||

                elemento.tagName ===
                    "TEXTAREA"
            );


        // ==========================================
        // CTRL + V → CARGAR LISTA
        // ==========================================

        if (
            evento.ctrlKey &&
            evento.key
                .toLowerCase() ===
                "v" &&
            !escribiendo
        ) {

            evento.preventDefault();


            try {

                const texto =
                    await navigator
                        .clipboard
                        .readText();


                if (
                    !texto.trim()
                ) {
                    return;
                }


                cargarAlumnos(
                    texto
                );


                console.log(
                    "📋 Alumnos cargados con Ctrl+V"
                );

            }

            catch (error) {

                console.error(
                    error
                );


                mostrarError(
                    "No pude leer el portapapeles."
                );
            }


            return;
        }


        // ==========================================
        // ESPACIO → EMPEZAR
        // ==========================================

        if (
            evento.code ===
            "Space" &&
            !escribiendo
        ) {

            evento.preventDefault();


            if (
                evento.repeat
            ) {
                return;
            }


            if (
                !presionado &&
                !escuchando &&
                !procesando &&
                !botonMicrofono.disabled
            ) {

                empezarDictado();
            }
        }
    }
);


// ======================================================
// SOLTAR ESPACIO → TERMINAR
// ======================================================

document.addEventListener(

    "keyup",

    evento => {

        if (
            evento.code !==
            "Space"
        ) {
            return;
        }


        const elemento =
            document.activeElement;


        const escribiendo =
            elemento &&
            (
                elemento.tagName ===
                    "INPUT" ||

                elemento.tagName ===
                    "TEXTAREA"
            );


        if (
            escribiendo
        ) {
            return;
        }


        evento.preventDefault();


        if (
            presionado ||
            escuchando
        ) {

            terminarDictado();
        }
    }
);


// ======================================================
// INICIO
// ======================================================

if (estadoModelo) {

    estadoModelo.textContent =
        "☁️ Whisper listo";
}

actualizarBoton();