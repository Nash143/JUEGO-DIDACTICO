import { db } from './firebase-config.js';
import { collection, doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. MOTOR DE AUDIO SINTETIZADO
// ==========================================
let audioCtx = null;
function playSound(type) {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        if (type === 'correct') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(800, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
            osc.start(); osc.stop(audioCtx.currentTime + 0.2);
        } else if (type === 'error') {
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.3);
            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
            osc.start(); osc.stop(audioCtx.currentTime + 0.3);
        }
    } catch (e) {
        console.warn("Audio bloqueado temporalmente por el navegador.");
    }
}

// ==========================================
// 2. BANCOS DE DATOS (PREGUNTAS Y JUEGOS)
// ==========================================
const bancoPreguntas = [
    {
        category: "Infraestructura Física",
        q: "¿Cuáles son las condiciones ambientales críticas que exige el Laboratorio de Metrología y Calibración de la UIC?",
        options: ["Temperatura variable y humedad menor al 80%", "Temperatura constante a 20°C ± 2°C y humedad <50%", "Presión negativa constante y ambiente criogénico"],
        correct: 1
    },
    {
        category: "Posicionamiento Institucional",
        q: "¿A quién reporta jerárquicamente la Unidad de Ingeniería Clínica en un hospital de alta complejidad?",
        options: ["Al jefe de mantenimiento edilicio e infraestructura", "Directamente a la Dirección General o Financiera", "Al área de informática y sistemas"],
        correct: 1
    },
    {
        category: "Mecánica e Indicadores KPIs",
        q: "Si la UIC busca evaluar la eficiencia operativa de su taller mecánico ante un reporte de falla, ¿qué indicador debe auditar?",
        options: ["MTBF (Mean Time Between Failures)", "Índice de obsolescencia acumulada", "MTTR (Mean Time To Repair)"],
        correct: 2
    },
    {
        category: "Riesgos Eléctricos",
        q: "En una instalación eléctrica hospitalaria tipo Grupo 2 (Quirófanos), ¿qué sistema protege al paciente crítico contra microchoques eléctricos?",
        options: ["Disyuntor termo-magnético estándar de alta velocidad", "Sistema IT con transformador de aislamiento y monitor de línea", "Puesta a tierra básica conectada a la estructura edilicia"],
        correct: 1
    }
];

const bancoMinijuegos = [
    {
        category: "Auditoría de Seguridad Eléctrica",
        text: "Detectamos corrientes de fuga elevadas en el chasis de un Monitor Multiparamétrico. ¿Qué herramienta del taller debes conectar para auditarlo bajo norma IEC 60601-1?",
        correctAnswerId: "tool-ase",
        chassisLabel: "Monitor Multiparamétrico <br><small class='text-warning'>(Aguardando Analizador de Seguridad)</small>",
        tools: [
            { id: "tool-ase", name: "⚡ Analizador de Seguridad Eléctrica (ASE)" },
            { id: "tool-bomba", name: "🧪 Analizador de Infusión / Flujo" },
            { id: "tool-lux", name: "☀️ Luxómetro Digital de Precisión" }
        ]
    },
    {
        category: "Calibración de Soporte Vital",
        text: "Un Desfibrilador Bifásico reporta descargas atenuadas en los chequeos matutinos. ¿Qué componente del chasis interno está sufriendo degradación dieléctrica y debe reemplazarse inmediatamente?",
        correctAnswerId: "tool-cap",
        chassisLabel: "Bloque de Alta Energía Desfibrilador <br><small class='text-warning'>(Slot de Almacenamiento Vacío)</small>",
        tools: [
            { id: "tool-res", name: "🎛️ Banco de Resistencias de Carga" },
            { id: "tool-cap", name: "🔋 Capacitor de Alta Densidad Energética" },
            { id: "tool-ind", name: "🔌 Bobina Inductora de Filtro RFI" }
        ]
    },
    {
        category: "Mitigación de Riesgos Físicos",
        text: "La sala de Rayos X Intervencionista muestra fugas de radiación secundaria en la última auditoría de blindaje. ¿Qué recubrimiento estructural falló en el taller o sala?",
        correctAnswerId: "tool-plomo",
        chassisLabel: "Barrera de Contención de Blindaje <br><small class='text-warning'>(Falta Refuerzo Atómico)</small>",
        tools: [
            { id: "tool-cobre", name: "🟫 Malla de Cobre (Jaula Faraday)" },
            { id: "tool-plomo", name: "⬜ Planchas de Plomo de Alto Espesor (Pb)" },
            { id: "tool-al", name: "⬜ Láminas de Aluminio Anodizado" }
        ]
    }
];

// VARIABLES GLOBALES DE CONTROL
let currentQuestionIndex = 0;
let currentMinigameIndex = 0;
let score = 0;
let timeLeft = 30;
let timerInterval = null;
let playerGlobalName = "";

// ==========================================
// 3. LÓGICA DE REGISTRO (PANTALLA INDEX.HTML)
// ==========================================
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Evita que la página se recargue por defecto
        const nameInput = document.getElementById('fullName').value.trim();
        if(!nameInput) return;
        playSound('correct');

        try {
            const docRef = doc(db, "players", nameInput);
            const docSnap = await getDoc(docRef);
            const errorBox = document.getElementById('errorBox');
            const errorMsg = document.getElementById('errorMessage');

            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.status === "Bloqueado") {
                    errorMsg.innerHTML = `<strong>ACCESO DENEGADO</strong><br>Detectamos irregularidades en tu sesión. Pide al administrador que te libere.`;
                    if(errorBox) errorBox.classList.remove('hidden');
                } else if (data.status === "Finalizado") {
                    errorMsg.innerHTML = `<strong>EVALUACIÓN COMPLETADA</strong><br>Ya has finalizado esta prueba.`;
                    if(errorBox) errorBox.classList.remove('hidden');
                } else {
                    localStorage.setItem('currentPlayer', nameInput);
                    window.location.href = 'game.html'; // REDIRECCIÓN EXITOSA
                }
            } else {
                // Registrar nuevo jugador en Firebase
                await setDoc(docRef, { name: nameInput, score: 0, status: "Activo", timestamp: Date.now() });
                localStorage.setItem('currentPlayer', nameInput);
                window.location.href = 'game.html'; // REDIRECCIÓN EXITOSA
            }
        } catch (error) {
            console.error("Error al registrar: ", error);
            const errorBox = document.getElementById('errorBox');
            if(errorBox) {
                document.getElementById('errorMessage').innerHTML = "Error de comunicación con Firebase. Intenta nuevamente.";
                errorBox.classList.remove('hidden');
            }
        }
    });
}

// ==========================================
// 4. LÓGICA DEL JUEGO (PANTALLA GAME.HTML)
// ==========================================
// Verificamos si estamos dentro de la página del juego
if (document.getElementById('questionContainer')) {
    
    // Inicialización al cargar el HTML del juego
    window.addEventListener('DOMContentLoaded', async () => {
        playerGlobalName = localStorage.getItem('currentPlayer');
        if (!playerGlobalName) {
            window.location.href = 'index.html';
            return;
        }
        
        document.getElementById('displayPlayerName').textContent = playerGlobalName;
        
        // Sincronizar puntaje (por si el usuario refrescó la página)
        try {
            const docRef = doc(db, "players", playerGlobalName);
            const snap = await getDoc(docRef);
            if(snap.exists()) {
                score = snap.data().score || 0;
                document.getElementById('score').textContent = score;
            }
        } catch(e) { console.warn(e); }

        setupAntiCheat();
        loadQuestion();
    });
}

function loadQuestion() {
    resetTimer();
    
    const questionContainer = document.getElementById('questionContainer');
    const minigameContainer = document.getElementById('minigameContainer');
    const optionsContainer = document.getElementById('optionsContainer');

    if (!questionContainer || !minigameContainer) return; // Validación de seguridad

    // Fase 1: Preguntas Clínicas
    if (currentQuestionIndex < bancoPreguntas.length) {
        questionContainer.classList.remove('hidden');
        minigameContainer.classList.add('hidden');
        
        const data = bancoPreguntas[currentQuestionIndex];
        document.getElementById('questionCategory').textContent = data.category;
        document.getElementById('questionText').textContent = data.q;
        
        optionsContainer.innerHTML = '';
        data.options.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.className = "btn btn-option-cyber font-monospace text-start w-100 fw-bold";
            btn.innerHTML = `<span class="text-cyan me-2">[0${idx+1}]</span> ${opt}`;
            btn.addEventListener('click', () => evaluateAnswer(idx, data.correct));
            optionsContainer.appendChild(btn);
        });
    } 
    // Fase 2: Taller de Maquinarias
    else if (currentMinigameIndex < bancoMinijuegos.length) {
        questionContainer.classList.add('hidden');
        minigameContainer.classList.remove('hidden');
        setupHardwareMinigame();
    } 
    // Fin de Simulación
    else {
        endGame();
    }
}

async function evaluateAnswer(selected, correct) {
    clearInterval(timerInterval);
    let pointsEarned = 0;
    
    if (selected === correct) {
        playSound('correct');
        pointsEarned = 500 + (timeLeft * 15);
        score += pointsEarned;
        document.getElementById('score').textContent = score;
        
        try {
            const playerRef = doc(db, "players", playerGlobalName);
            await updateDoc(playerRef, { score: score });
        } catch(e){}
    } else {
        playSound('error');
    }
    
    // Avanzar secuencialmente
    if (currentQuestionIndex < bancoPreguntas.length) {
        currentQuestionIndex++;
    } else {
        currentMinigameIndex++;
    }
    
    loadQuestion();
}

function setupHardwareMinigame() {
    const gameData = bancoMinijuegos[currentMinigameIndex];
    const toolsContainer = document.getElementById('toolsContainer');
    const dropZone = document.getElementById('dropZone');
    
    document.getElementById('minigameCategory').textContent = gameData.category;
    document.getElementById('minigameText').textContent = `Falla Mecánica: ${gameData.category}`;
    
    dropZone.className = "drop-zone-hardware d-flex flex-column justify-content-center align-items-center p-3";
    dropZone.innerHTML = `<i class="bi bi-cpu-fill fs-1 text-cyan mb-2 pulse-icon"></i><span id="dropText" class="font-monospace text-wrap px-2">${gameData.chassisLabel}</span>`;
    
    toolsContainer.innerHTML = '';
    gameData.tools.forEach(tool => {
        const item = document.createElement('div');
        item.className = "hardware-card font-monospace text-start text-truncate";
        item.draggable = true;
        item.id = tool.id;
        item.innerHTML = `<i class="bi bi-grip-vertical me-2 text-muted"></i>${tool.name}`;
        
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', e.target.id);
            item.style.opacity = "0.4";
        });
        item.addEventListener('dragend', () => { item.style.opacity = "1"; });
        toolsContainer.appendChild(item);
    });

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('zone-hover'); });
    dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('zone-hover'); });
    
    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('zone-hover');
        const draggedId = e.dataTransfer.getData('text/plain');
        
        if (draggedId === gameData.correctAnswerId) {
            dropZone.innerHTML = `<i class="bi bi-shield-check display-4 text-green mb-2"></i><span class="text-green fw-bold font-monospace">✅ COMPONENTE INTEGRADO</span>`;
            dropZone.style.borderColor = "var(--neon-green)";
            setTimeout(() => evaluateAnswer(1, 1), 1600);
        } else {
            dropZone.innerHTML = `<i class="bi bi-shield-slash display-4 text-danger mb-2"></i><span class="text-danger fw-bold font-monospace">❌ INCOMPATIBILIDAD</span>`;
            dropZone.style.borderColor = "var(--neon-red)";
            setTimeout(() => evaluateAnswer(0, 1), 1600);
        }
    }, { once: true });
}

function resetTimer() {
    clearInterval(timerInterval);
    timeLeft = 30;
    const timerDisplay = document.getElementById('timer');
    const progressBar = document.getElementById('progressBar');
    
    if(!timerDisplay || !progressBar) return;
    
    timerDisplay.textContent = timeLeft;
    progressBar.style.width = "100%";
    progressBar.className = "progress-bar custom-progress-bar";

    timerInterval = setInterval(() => {
        timeLeft--;
        timerDisplay.textContent = timeLeft;
        
        let pct = (timeLeft / 30) * 100;
        progressBar.style.width = `${pct}%`;

        if (timeLeft <= 10) progressBar.className = "progress-bar bg-danger shadow-danger-progress";

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            if (currentQuestionIndex < bancoPreguntas.length) evaluateAnswer(-1, 0);
            else evaluateAnswer("-1", "0");
        }
    }, 1000);
}

async function endGame() {
    clearInterval(timerInterval);
    try {
        const playerRef = doc(db, "players", playerGlobalName);
        await updateDoc(playerRef, { status: "Finalizado" });
    } catch(e){}
    
    document.getElementById('finalScore').textContent = score;
    document.getElementById('endModal').classList.remove('hidden');
}

function setupAntiCheat() {
    document.addEventListener("visibilitychange", () => { if (document.hidden) triggerCheatLock(); });
    window.addEventListener("blur", () => { triggerCheatLock(); });
}

async function triggerCheatLock() {
    clearInterval(timerInterval);
    if(playerGlobalName) {
        try {
            const playerRef = doc(db, "players", playerGlobalName);
            await updateDoc(playerRef, { status: "Bloqueado" });
        } catch(e) { console.error(e); }
    }
    const cheatModal = document.getElementById('cheatModal');
    if(cheatModal) cheatModal.classList.remove('hidden');
}