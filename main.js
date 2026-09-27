import { createModel } from "vosk-browser";


// ======================================================
// ELEMENTOS
// ======================================================

const botonMicrofono = document.getElementById("microfono");
const botonCargar = document.getElementById("cargarAlumnos");
const botonCopiar = document.getElementById("copiarNotas");

const dictado = document.getElementById("dictado");
const resultadoFinal = document.getElementById("resultadoFinal");
const panelResultado = document.getElementById("panelResultado");
const estadoModelo = document.getElementById("estadoModelo");
const contador = document.getElementById("contador");

const tabla = document.getElementById("tabla");
const tbody = tabla.querySelector("tbody");
const sinAlumnos = document.getElementById("sinAlumnos");

const miniEstado = document.getElementById("miniEstado");
const miniTexto = document.getElementById("miniTexto");


// ======================================================
// VARIABLES
// ======================================================

let alumnos = [];

let model = null;
let recognizer = null;

let mediaStream = null;
let audioContext = null;
let source = null;
let processor = null;
let gain = null;

let analyser = null;
let datosVolumen = null;
let animacionVolumen = null;

let escuchando = false;


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

    let t = normalizar(texto);

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

    // QU
    t = t.replace(/qu/g, "k");

    // C fuerte
    t = t.replace(/c/g, "k");

    // Q
    t = t.replace(/q/g, "k");

    // X
    t = t.replace(/x/g, "ks");

    // W
    t = t.replace(/w/g, "u");

    // RR / R
    t = t.replace(/rr/g, "r");

    return t;
}


// ======================================================
// LEVENSHTEIN
// ======================================================

function levenshtein(a, b) {

    const matriz = Array.from(
        {
            length: b.length + 1
        },
        () =>
            Array(a.length + 1)
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
                b[i - 1] === a[j - 1]
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
// SIMILITUD GENERAL
// ======================================================

function similitud(a, b) {

    a = fonetizar(a);
    b = fonetizar(b);


    if (!a || !b)
        return 0;


    if (a === b)
        return 1;


    const distancia =
        levenshtein(a, b);


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
// SIMILITUD DE PALABRAS
// ======================================================

function similitudPalabra(a, b) {

    a = fonetizar(a);
    b = fonetizar(b);


    if (!a || !b)
        return 0;


    if (a === b)
        return 1;


    // ------------------------------------------
    // UNA CONTIENE A LA OTRA
    // ------------------------------------------

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


    // ------------------------------------------
    // LEVENSHTEIN
    // ------------------------------------------

    const distancia =
        levenshtein(a, b);


    const maximo =
        Math.max(
            a.length,
            b.length
        );


    let score =
        1 -
        distancia /
        maximo;


    // ------------------------------------------
    // UN ERROR EN PALABRAS LARGAS
    // ------------------------------------------

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


    // ------------------------------------------
    // DOS ERRORES EN PALABRAS LARGAS
    // ------------------------------------------

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


    // ------------------------------------------
    // PREFIJO COMÚN
    //
    // ROLLET -> ROLEX
    // ------------------------------------------

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


    /*
        Si Vosk entendió bien una raíz
        suficientemente larga pero inventó
        la terminación, no castigamos tanto.

        Ejemplo:

        ROLLET
        ROLEX

        comparten "rol".
    */

    if (
        inicioComun >= 3 &&
        proporcionInicio >= 0.60
    ) {

        score =
            Math.max(

                score,

                0.72 +
                proporcionInicio * 0.18
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
// GENERAR VARIANTES DE PALABRAS
// ======================================================

function generarVariantesPalabras(palabras) {

    const variantes =
        new Set();


    // ------------------------------------------
    // PALABRAS ORIGINALES
    // ------------------------------------------

    for (
        const palabra of palabras
    ) {

        variantes.add(
            palabra
        );
    }


    // ------------------------------------------
    // UNIR DOS PALABRAS CONSECUTIVAS
    //
    // berry no -> berryno
    // ------------------------------------------

    for (
        let i = 0;
        i < palabras.length - 1;
        i++
    ) {

        variantes.add(

            palabras[i] +
            palabras[i + 1]

        );
    }


    // ------------------------------------------
    // UNIR TRES
    // ------------------------------------------

    for (
        let i = 0;
        i < palabras.length - 2;
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
// COMPARAR CONJUNTO DE PALABRAS
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
// PALABRAS RUIDO
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
                normalizar(palabra)
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

        return Number(texto);
    }


    return NaN;
}


// ======================================================
// CARGAR MODELO VOSK
// ======================================================

async function cargarModelo() {

    try {

        estadoModelo.textContent =
            "⏳ Cargando modelo de voz...";


        model =
            await createModel(
    import.meta.env.BASE_URL + "model.tar.gz"
);


        estadoModelo.textContent =
            "✅ Reconocimiento de voz listo";


        actualizarBoton();

    }

    catch (error) {

        console.error(
            error
        );


        estadoModelo.textContent =
            "❌ No se pudo cargar el modelo";
    }
}


// ======================================================
// CARGAR DESDE PORTAPAPELES
// ======================================================

botonCargar.addEventListener(

    "click",

    async () => {

        try {

            const texto =
                await navigator.clipboard
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


// ======================================================
// CARGAR ALUMNOS
// ======================================================

function cargarAlumnos(texto) {

    const lineas =
        texto.split(
            /\r?\n/
        );


    const nuevos =
        [];


    for (
        const linea of lineas
    ) {

        if (
            !linea.trim()
        ) {

            continue;
        }


        let partes =
            linea.split(
                "\t"
            );


        /*
            Google Sheets normalmente
            nos da TAB.

            Como respaldo permitimos
            múltiples espacios.
        */

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

            nota: ""

        });
    }


    alumnos =
        nuevos;


    renderTabla();


    panelResultado
        .classList
        .remove(
            "ok",
            "error"
        );


    dictado.textContent =
        "Lista cargada";


    resultadoFinal.textContent =
        alumnos.length +
        " alumnos";


    actualizarBoton();
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

        (alumno, index) => {

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
// BOTÓN
// ======================================================

function actualizarBoton() {

    botonMicrofono.disabled =

        !model ||
        alumnos.length === 0;
}


// ======================================================
// MICROFONO
// ======================================================

botonMicrofono.addEventListener(

    "click",

    async () => {

        if (
            escuchando
        ) {

            detener();

        }

        else {

            await iniciar();
        }
    }
);


// ======================================================
// MEDIDOR DE VOLUMEN
// ======================================================

function iniciarMedidorVolumen() {

    if (
        !audioContext ||
        !source
    ) {

        return;
    }


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


    function actualizar() {

        if (
            !escuchando ||
            !analyser
        ) {

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
            (promedio - 5) / 45;


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


        animacionVolumen =
            requestAnimationFrame(
                actualizar
            );
    }


    actualizar();
}


// ======================================================
// INICIAR VOSK
// ======================================================

async function iniciar() {

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

                sampleRate:
                    16000

            });


        await audioContext.resume();


        recognizer =
            new model.KaldiRecognizer(
                audioContext.sampleRate
            );


        // ==========================================
        // RESULTADO PARCIAL
        // ==========================================

        recognizer.on(

            "partialresult",

            mensaje => {

                const parcial =
                    mensaje
                        ?.result
                        ?.partial
                    || "";


                if (
                    parcial.trim()
                ) {

                    dictado.textContent =
                        parcial;


                    if (
                        miniTexto
                    ) {

                        miniTexto.textContent =
                            "“" +
                            parcial +
                            "”";
                    }
                }
            }
        );


        // ==========================================
        // RESULTADO FINAL
        // ==========================================

        recognizer.on(

            "result",

            mensaje => {

                const texto =
                    mensaje
                        ?.result
                        ?.text
                    || "";


                if (
                    !texto.trim()
                ) {

                    return;
                }


                dictado.textContent =
                    texto;


                procesarDictado(
                    texto
                );
            }
        );


        // ==========================================
        // AUDIO
        // ==========================================

        source =
            audioContext
                .createMediaStreamSource(
                    mediaStream
                );


        processor =
            audioContext
                .createScriptProcessor(
                    4096,
                    1,
                    1
                );


        processor.onaudioprocess =
            evento => {

                if (
                    !escuchando ||
                    !recognizer
                ) {

                    return;
                }


                try {

                    recognizer
                        .acceptWaveform(
                            evento.inputBuffer
                        );

                }

                catch (error) {

                    console.error(
                        "Error enviando audio:",
                        error
                    );
                }
            };


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


        // IMPORTANTE:
        // primero escuchando = true

        escuchando =
            true;


        iniciarMedidorVolumen();


        botonMicrofono
            .classList
            .add(
                "activo"
            );


        botonMicrofono.textContent =
            "■";


        panelResultado
            .classList
            .remove(
                "ok",
                "error"
            );


        dictado.textContent =
            "Escuchando...";


        resultadoFinal.textContent =
            "Decí, por ejemplo: Berrino ocho";


        if (
            miniTexto
        ) {

            miniTexto.textContent =
                "Escuchando...";
        }


        actualizarMiniEstado();

    }

    catch (error) {

        console.error(
            error
        );


        mostrarError(
            "No pude iniciar el micrófono."
        );


        detener();
    }
}


// ======================================================
// DETENER
// ======================================================

function detener() {

    escuchando =
        false;


    // ------------------------------------------
    // ANIMACIÓN VOLUMEN
    // ------------------------------------------

    if (
        animacionVolumen
    ) {

        cancelAnimationFrame(
            animacionVolumen
        );


        animacionVolumen =
            null;
    }


    if (
        analyser
    ) {

        try {

            analyser.disconnect();

        }

        catch {}


        analyser =
            null;
    }


    botonMicrofono
        .style
        .setProperty(
            "--nivel",
            0
        );


    // ------------------------------------------
    // PROCESSOR
    // ------------------------------------------

    if (
        processor
    ) {

        processor.onaudioprocess =
            null;


        try {

            processor.disconnect();

        }

        catch {}


        processor =
            null;
    }


    // ------------------------------------------
    // SOURCE
    // ------------------------------------------

    if (
        source
    ) {

        try {

            source.disconnect();

        }

        catch {}


        source =
            null;
    }


    // ------------------------------------------
    // GAIN
    // ------------------------------------------

    if (
        gain
    ) {

        try {

            gain.disconnect();

        }

        catch {}


        gain =
            null;
    }


    // ------------------------------------------
    // STREAM
    // ------------------------------------------

    if (
        mediaStream
    ) {

        mediaStream
            .getTracks()
            .forEach(

                track => {

                    try {

                        track.stop();

                    }

                    catch {}

                }

            );


        mediaStream =
            null;
    }


    // ------------------------------------------
    // AUDIO CONTEXT
    // ------------------------------------------

    if (
        audioContext
    ) {

        try {

            audioContext.close();

        }

        catch {}


        audioContext =
            null;
    }


    // ------------------------------------------
    // RECOGNIZER
    // ------------------------------------------

    if (
        recognizer
    ) {

        try {

            recognizer.remove();

        }

        catch {}


        recognizer =
            null;
    }


    botonMicrofono
        .classList
        .remove(
            "activo"
        );


    botonMicrofono.textContent =
        "🎤";


    if (
        miniEstado
    ) {

        miniEstado
            .classList
            .remove(
                "visible"
            );
    }
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


    // ==================================================
    // BUSCAR NOTA
    // ==================================================

    let nota =
        NaN;


    let indiceNota =
        -1;


    /*
        Buscamos desde el final porque normalmente
        decimos:

        Berrino tres
        Rollet cuatro
        Banic Baena ocho
    */

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


    // ==================================================
    // SACAR LA NOTA
    // ==================================================

    palabras.splice(
        indiceNota,
        1
    );


    const nombreDicho =
        palabras.join(" ");


    if (
        !nombreDicho
    ) {

        mostrarError(
            "No reconocí el alumno."
        );

        return;
    }


    // ==================================================
    // LIMPIAR PALABRAS
    // ==================================================

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


    // ==================================================
    // BUSCAR ALUMNO
    // ==================================================

    const candidatos =
        alumnos.map(

            (alumno, index) => {

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


                // --------------------------------------
                // APELLIDO
                // --------------------------------------

                const scoreApellido =
                    compararConjuntoPalabras(

                        palabrasDichas,

                        palabrasApellido

                    );


                // --------------------------------------
                // NOMBRE
                // --------------------------------------

                const scoreNombre =
                    compararConjuntoPalabras(

                        palabrasDichas,

                        palabrasNombre

                    );


                // --------------------------------------
                // VARIANTES
                // --------------------------------------

                const variantesDichas =
                    generarVariantesPalabras(
                        palabrasDichas
                    );


                const variantesApellido =
                    generarVariantesPalabras(
                        palabrasApellido
                    );


                // --------------------------------------
                // MEJOR APELLIDO INDIVIDUAL
                // --------------------------------------

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


                // --------------------------------------
                // BONUS EXACTO
                // --------------------------------------

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


                // --------------------------------------
                // APELLIDO COMPLETO
                // --------------------------------------

                const scoreApellidoCompleto =
                    similitud(

                        palabrasDichas.join(" "),

                        apellido

                    );


                /*
                    El apellido representa prácticamente
                    toda la decisión.

                    60% coincidencia general del apellido
                    30% mejor coincidencia individual
                     5% nombre
                     5% apellido completo

                    Esto evita casos como:

                    ROLEX

                    donde ROCHA ganaba sobre ROLLET
                    solamente porque "Felipe" producía
                    accidentalmente mejor score.
                */

                let score =

                    scoreApellido
                        * 0.60

                    +

                    mejorApellidoIndividual
                        * 0.30

                    +

                    scoreNombre
                        * 0.05

                    +

                    scoreApellidoCompleto
                        * 0.05

                    +

                    bonusExacto;


                // --------------------------------------
                // APELLIDO MUY FUERTE
                // --------------------------------------

                const fuerzaApellido =
                    Math.max(

                        scoreApellido,

                        mejorApellidoIndividual

                    );


                if (
                    fuerzaApellido >= 0.88
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


    // ==================================================
    // ORDENAR
    // ==================================================

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


    // ==================================================
    // DEBUG
    // ==================================================

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
            .slice(0, 5)
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


    // ==================================================
    // CONFIANZA
    // ==================================================

    const confianza =
        primero.score;


    const diferencia =
        segundo

            ? primero.score -
              segundo.score

            : 1;


    // ==================================================
    // MUY POCA CONFIANZA
    // ==================================================

    if (
        confianza < 0.58 &&
        primero.mejorApellidoIndividual < 0.82
    ) {

        mostrarError(

            "No estoy seguro del alumno. " +
            "Entendí: “" +
            nombreDicho +
            "”"

        );

        return;
    }


    // ==================================================
    // DOS CANDIDATOS MUY PARECIDOS
    // ==================================================

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


    // ==================================================
    // ASIGNAR
    // ==================================================

    asignarNota(
        primero.index,
        nota
    );
}


// ======================================================
// ASIGNAR NOTA
// ======================================================

function asignarNota(
    index,
    nota
) {

    alumnos[index].nota =
        nota;


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
            " " +
            alumno.nombre +

            " · " +

            nota;
    }


    hablar(

        alumno.nombre +
        ", " +
        nota

    );
}


// ======================================================
// ERROR
// ======================================================

function mostrarError(mensaje) {

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


    if (
        miniTexto
    ) {

        miniTexto.textContent =
            "⚠️ " +
            mensaje;
    }
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
            NO FILTRAMOS VACÍOS.

            Si el alumno 5 no tiene nota,
            la línea 5 queda vacía.
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


    if (
        !escuchando
    ) {

        miniEstado
            .classList
            .remove(
                "visible"
            );


        return;
    }


    const rect =
        botonMicrofono
            .getBoundingClientRect();


    const fueraDeVista =

        rect.bottom < 80 ||

        rect.top >
            window.innerHeight - 80;


    miniEstado
        .classList
        .toggle(
            "visible",
            fueraDeVista
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
// INICIO
// ======================================================

cargarModelo();