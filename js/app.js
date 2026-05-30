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
// 2. BANCOS DE DATOS ADAPTADOS AL DOCUMENTO UIC
// ==========================================
const bancoPreguntas = [
    {
        category: "Casos de Estudio Históricos",
        q: "Según la investigación del incidente de julio de 2025 en el Hospital Civil de Jalandhar (India), ¿cuál fue la causa de la muerte de tres pacientes en ventiladores?",
        options: [
            "Un error de programación del personal médico en la interfaz",
            "Una falla en la planta de oxígeno que afectó el suministro crítico",
            "Un cortocircuito masivo por falta de mantenimiento en el cableado"
        ],
        correct: 1
    },
    {
        category: "Calibración de Monitores",
        q: "Durante la prueba neumática de NIBP (Presión Arterial No Invasiva), ¿cuál es la tolerancia legal exacta que debe marcar el monitor ante el simulador?",
        options: [
            "± 3 mmHg",
            "± 5 mmHg",
            "± 10 mmHg"
        ],
        correct: 0
    },
    {
        category: "Soporte Vital e Infusión",
        q: "En una bomba de infusión, ¿qué tipo de componente técnico mide constantemente la presión dentro del tubo para detectar oclusiones e interrupciones?",
        options: [
            "Un sensor óptico infrarrojo de caída de gotas",
            "Un transductor piezoeléctrico acoplado al tubo",
            "Un electrodo galvánico de flujo continuo"
        ],
        correct: 1
    },
    {
        category: "Tecnología Quirúrgica",
        q: "En un electrobisturí, ¿qué tipo de onda eléctrica genera el calor rápido e intenso capaz de hacer explotar el agua intracelular para realizar un corte puro?",
        options: [
            "Una onda senoidal continua",
            "Una onda modulada intermitente",
            "Una onda cuadrada de baja frecuencia"
        ],
        correct: 0
    },
    {
        category: "Roles de la Unidad (UIC)",
        q: "¿Qué función del ingeniero biomédico se encarga de vigilar el comportamiento diario de los equipos e investigar fallas que casi causan un accidente?",
        options: [
            "La negociación de contratos con proveedores externos",
            "La Tecnovigilancia activa del equipamiento",
            "La actualización del inventario en el software GMAO"
        ],
        correct: 1
    }
];

const bancoMinijuegos = [
    {
        category: "Calibración de Imagen (Ecógrafo)",
        text: "El ecógrafo requiere una prueba de resolución axial y lateral para verificar si el software puede distinguir dos filamentos metálicos extremadamente juntos. ¿Qué objeto debes escanear?",
        correctAnswerId: "tool-fantasma",
        chassisLabel: "Unidad de Ultrasonido <br><small class='text-warning'>(Aguardando Fantasma de Calibración)</small>",
        tools: [
            { id: "tool-fantasma", name: "🧬 Fantasma con filamentos metálicos" },
            { id: "tool-ase", name: "⚡ Analizador de Seguridad Eléctrica" },
            { id: "tool-lux", name: "☀️ Luxómetro Digital de Precisión" }
        ]
    },
    {
        category: "Soporte Vital y Anestesia",
        text: "Al realizar la rutina de calibración de una máquina de anestesia, se debe comprobar de manera crítica que el sistema neumático no pierda presión. ¿Qué test debes aplicar?",
        correctAnswerId: "tool-fuga",
        chassisLabel: "Bloque Neumático de Anestesia <br><small class='text-warning'>(Slot de Prueba Hermética Vacío)</small>",
        tools: [
            { id: "tool-burbuja", name: "🧼 Detector ultrasónico de burbujas" },
            { id: "tool-fuga", name: "🔒 Pruebas de fuga en circuito sellado" },
            { id: "tool-perf", name: "📈 Simulador de perfusión baja" }
        ]
    },
    {
        category: "Terapia de Reemplazo Renal",
        text: "Un equipo de hemodiálisis reporta alarmas críticas debido al riesgo de paros cardíacos por desbalance de sodio y potasio en el paciente. ¿Qué sensor del taller debes auditar?",
        correctAnswerId: "tool-cond",
        chassisLabel: "Módulo Hidráulico de Electrolitos <br><small class='text-warning'>(Falta verificar concentración de mezcla)</small>",
        tools: [
            { id: "tool-cond", name: "🧪 Sensor de conductividad eléctrica de líquidos" },
            { id: "tool-pres", name: "🎛️ Transductor electrónico de presión venosa" },
            { id: "tool-ox", name: "🩸 Celda de medición de oxígeno disuelto" }
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
        e.preventDefault();
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
                    window.location.href = 'game.html';
                }
            } else {
                await setDoc(docRef, { name: nameInput, score: 0, status: "Activo", timestamp: Date.now() });
                localStorage.setItem('currentPlayer', nameInput);
                window.location.href = 'game.html';
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
if (document.getElementById('questionContainer')) {
    window.addEventListener('DOMContentLoaded', async () => {
        playerGlobalName = localStorage.getItem('currentPlayer');
        if (!playerGlobalName) {
            window.location.href = 'index.html';
            return;
        }
        
        document.getElementById('displayPlayerName').textContent = playerGlobalName;
        
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

    if (!questionContainer || !minigameContainer) return;

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
    else if (currentMinigameIndex < bancoMinijuegos.length) {
        questionContainer.classList.add('hidden');
        minigameContainer.classList.remove('hidden');
        setupHardwareMinigame();
    } 
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
    document.getElementById('minigameText').textContent = `${gameData.category}`;
    
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