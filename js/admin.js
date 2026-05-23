import { db } from './firebase-config.js';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Credencial Maestra (Por si aún no hay administradores creados en la base de datos)
const MASTER_USER = "admin"; 
const MASTER_PASS = "1234";

const adminLoginForm = document.getElementById('adminLoginForm');

if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = document.getElementById('adminUser').value.trim();
        const pass = document.getElementById('adminPass').value.trim();
        const errorText = document.getElementById('adminAuthError');

        try {
            // Verificar si es el usuario maestro
            if (user === MASTER_USER && pass === MASTER_PASS) {
                accesoConcedido();
                return;
            }

            // Si no es el maestro, buscar en la colección "admins" de Firebase
            const adminRef = doc(db, "admins", user);
            const adminSnap = await getDoc(adminRef);

            if (adminSnap.exists() && adminSnap.data().password === pass) {
                accesoConcedido();
            } else {
                errorText.classList.remove('hidden');
            }
        } catch (error) {
            console.error("Error validando admin: ", error);
            errorText.innerHTML = "Error de conexión con el servidor.";
            errorText.classList.remove('hidden');
        }
    });
}

function accesoConcedido() {
    document.getElementById('adminAuth').classList.add('hidden');
    document.getElementById('adminDashboard').classList.remove('hidden');
    initAdminRealTime();
}

function initAdminRealTime() {
    const q = query(collection(db, "players"), orderBy("score", "desc"));
    
    // Escucha en tiempo real de todos los jugadores
    onSnapshot(q, (snapshot) => {
        const todosLosJugadores = [];
        let bloqueados = 0;
        let finalizados = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            todosLosJugadores.push(data);
            if (data.status === "Bloqueado") bloqueados++;
            if (data.status === "Finalizado") finalizados++;
        });

        // Actualizar Contadores Top
        document.getElementById('totalUsersCounter').textContent = todosLosJugadores.length;
        document.getElementById('finishedUsersCounter').textContent = finalizados;
        document.getElementById('blockedUsersCounter').textContent = bloqueados;

        // Renderizar Tablas
        renderRankingCompleto(todosLosJugadores);
        renderTablaBloqueados(todosLosJugadores);
    });
}

function renderRankingCompleto(players) {
    const tbody = document.getElementById('rankingTableBody');
    tbody.innerHTML = '';

    players.forEach((player, index) => {
        const tr = document.createElement('tr');
        
        let statusStyle = "color: var(--neon-green);";
        let statusIcon = "<i class='bi bi-wifi'></i>";

        if(player.status === "Bloqueado") {
            statusStyle = "color: var(--neon-red); font-weight: bold;";
            statusIcon = "<i class='bi bi-exclamation-triangle-fill'></i>";
        } else if(player.status === "Finalizado") {
            statusStyle = "color: var(--neon-cyan);";
            statusIcon = "<i class='bi bi-check-circle-fill'></i>";
        }

        // Botón de eliminar (útil para limpiar pruebas)
        const deleteBtn = `<button onclick="eliminarJugador('${player.name}')" class="btn-action btn-delete" title="Borrar Operador"><i class="bi bi-trash3-fill"></i></button>`;

        tr.innerHTML = `
            <td><strong class="text-cyan">#${index + 1}</strong></td>
            <td class="fw-bold">${player.name}</td>
            <td class="font-monospace fs-5">${player.score}</td>
            <td style="${statusStyle}">${statusIcon} ${player.status}</td>
            <td class="text-end">${deleteBtn}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderTablaBloqueados(players) {
    const tbody = document.getElementById('blockedTableBody');
    tbody.innerHTML = '';
    
    const jugadoresBloqueados = players.filter(p => p.status === "Bloqueado");

    if (jugadoresBloqueados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4"><i class="bi bi-shield-check display-4 d-block mb-2 text-green"></i>No hay operadores bloqueados. El sistema está limpio.</td></tr>`;
        return;
    }

    jugadoresBloqueados.forEach(player => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><i class="bi bi-exclamation-circle-fill text-danger fs-5 pulse-icon"></i></td>
            <td class="fw-bold text-white">${player.name}</td>
            <td class="font-monospace">${player.score} pts</td>
            <td class="text-end">
                <button onclick="liberarJugador('${player.name}')" class="btn-action btn-unlock"><i class="bi bi-unlock-fill me-1"></i> Restaurar Acceso</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- FUNCIONES DE ACCIÓN REMOTA (Globales) ---
window.liberarJugador = async function(playerName) {
    if(confirm(`¿Confirmas la liberación de la terminal para: ${playerName}?`)) {
        try {
            const playerRef = doc(db, "players", playerName);
            await updateDoc(playerRef, { status: "Activo" });
        } catch(e) { console.error("Error al liberar", e); }
    }
};

window.eliminarJugador = async function(playerName) {
    if(confirm(`⚠️ ATENCIÓN: ¿Borrar permanentemente el registro de ${playerName} de la base de datos?`)) {
        try {
            const playerRef = doc(db, "players", playerName);
            await deleteDoc(playerRef);
        } catch(e) { console.error("Error al eliminar", e); }
    }
};

window.crearAdmin = async function() {
    const newUser = document.getElementById('newAdminUser').value.trim();
    const newPass = document.getElementById('newAdminPass').value.trim();

    if(newUser.length < 4 || newPass.length < 4) {
        alert("El usuario y la contraseña deben tener al menos 4 caracteres.");
        return;
    }

    try {
        const adminRef = doc(db, "admins", newUser);
        await setDoc(adminRef, { password: newPass, creadoPor: "Sistema", fecha: Date.now() });
        
        // Cerrar modal y limpiar campos
        const modalElement = document.getElementById('addAdminModal');
        const modal = bootstrap.Modal.getInstance(modalElement);
        modal.hide();
        document.getElementById('newAdminUser').value = '';
        document.getElementById('newAdminPass').value = '';
        
        alert(`✅ Administrador '${newUser}' creado exitosamente.`);
    } catch(error) {
        console.error("Error creando admin:", error);
        alert("Error de permisos en Firebase. Revisa las reglas de seguridad.");
    }
};

// Cierre de Sesión
document.getElementById('btnLogOut').addEventListener('click', () => location.reload());