/* =========================================================
   app.js - VERSIÓN FINAL INTEGRADA (VIBRACIÓN + CRONÓMETRO)
========================================================= */

const URL = "https://script.google.com/macros/s/AKfycbxbAEu9d9joaeUItVH_T0mI_iK7AL2QK8xEGgVGfvu5zdAT6S4EbesydZSk0MXNmfb05g/exec";

let alumnos = [];
let docentes = [];
let salidas = [];
let historial = [];
let usuarioActivo = null;
let timers = {}; // Almacena los intervalos de cada cronómetro activo

/* =========================
   1. INICIALIZACIÓN
========================= */

window.addEventListener("load", () => {
    // Escuchar tecla Enter en el campo de PIN
    const passInput = document.getElementById("passDocente");
    if (passInput) {
        passInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") verificarAcceso();
        });
    }

    // Cargar tema guardado
    if (localStorage.getItem("modoTema") === "claro") {
        document.body.classList.add("light-mode");
        document.getElementById("themeToggle").innerHTML = "☀️";
    }

    cargarDatos();
});

async function cargarDatos() {
    try {
        const r = await fetch(URL);
        const data = await r.json();
        alumnos = data.alumnos || [];
        docentes = data.docentes || [];
        salidas = data.salidas || [];
        
        cargarDocentes();
        cargarFiltros();
        
        document.getElementById("loader").style.display = "none";
    } catch (err) {
        console.error(err);
        document.getElementById("loader").innerHTML = `
            <p style="color:var(--red); font-weight:800;">❌ ERROR DE CONEXIÓN</p>
            <button onclick="location.reload()" style="margin-top:10px; padding:10px; cursor:pointer;">Reintentar</button>
        `;
    }
}

/* =========================
   2. UI, NOTIFICACIONES Y VIBRACIÓN
========================= */

function showToast(msj, tipo = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    
    const toast = document.createElement("div");
    toast.className = `toast ${tipo === 'error' ? 'error' : ''}`;
    toast.innerText = msj;
    
    container.appendChild(toast);

    // Pequeño pulso táctil al recibir notificación
    if (navigator.vibrate) navigator.vibrate(40);

    setTimeout(() => toast.remove(), 3500);
}

// Función para alerta de tiempo agotado (Vibración persistente)
function triggerAlertaVibracion() {
    if (navigator.vibrate) {
        // Patrón: Vibrar 500ms, pausa 200ms, vibrar 500ms
        navigator.vibrate([500, 200, 500, 200, 500]);
    }
}

function cargarDocentes() {
    const sel = document.getElementById("docentes");
    sel.innerHTML = `<option value="">Seleccione Usuario...</option>`;
    docentes.forEach(d => {
        sel.innerHTML += `<option value="${d.nombre}">${d.nombre}</option>`;
    });
}

function verificarAcceso() {
    const nom = document.getElementById("docentes").value;
    const pinBox = document.getElementById("passDocente");
    const pin = pinBox.value;
    
    const user = docentes.find(d => d.nombre === nom && String(d.password) === String(pin));

    if (user) {
        usuarioActivo = user;
        showToast(`¡Bienvenido/a, ${user.nombre}!`);
        
        document.querySelector(".grupo-sesion").style.display = "none";
        ["logoutBtn", "seccion-filtros", "status-container", "buscador-box", "contador-container", "historial-container"].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.style.display = "block";
        });
        document.getElementById("user-role").innerText = user.tipo.toUpperCase();
        render();
    } else {
        pinBox.classList.add("shake");
        showToast("PIN incorrecto", "error");
        setTimeout(() => pinBox.classList.remove("shake"), 400);
    }
}

/* =========================
   3. FILTROS Y RENDERIZADO
========================= */

function cargarFiltros() {
    ["fCurso", "fDivision", "fTurno", "fEspecialidad"].forEach(id => {
        const key = id.replace("f", "").toLowerCase();
        const sel = document.getElementById(id);
        sel.innerHTML = `<option value="">${key.toUpperCase()}</option>`;
        
        [...new Set(alumnos.map(a => a[key]))].sort().forEach(v => {
            if (v) sel.innerHTML += `<option value="${v}">${v}</option>`;
        });
        sel.onchange = render;
    });
}

function render() {
    const grid = document.getElementById("grid");
    const curso = document.getElementById("fCurso").value;
    const busqueda = document.getElementById("buscador").value.toLowerCase();

    if (!usuarioActivo || !curso) {
        grid.innerHTML = `<div style="text-align:center; padding:40px; color:var(--muted)">Seleccione un curso para comenzar.</div>`;
        return;
    }

    grid.innerHTML = "";
    
    const filtrados = alumnos.filter(a => {
        return (a.curso == curso) &&
               (a.nombre.toLowerCase().includes(busqueda) || String(a.dni).includes(busqueda));
    });

    actualizarContadores(filtrados);

    filtrados.forEach(a => {
        const reg = salidas.find(s => s.dni == a.dni && !s.regreso);
        const esAusente = a.ausente === "AUSENTE";
        
        const div = document.createElement("div");
        div.id = `card-${a.dni}`;
        div.className = `alumno ${reg ? 'out' : 'in'} ${esAusente ? 'ausente' : ''}`;
        
        let html = `<span class="nombre">${a.nombre}</span>`;
        
        if (esAusente) {
            html += `<div class="label-ausente">❌ AUSENTE</div>`;
        } else if (reg) {
            html += `<div class="motivo-destacado">🚪 ${reg.causa.toUpperCase()}</div>`;
            if (reg.causa.toLowerCase() === "baño") {
                html += `<div class="timer-box">⏳ <span id="timer-${a.dni}">1:00</span></div>`;
                iniciarCronometro(a.dni, reg.inicioTime || new Date());
            }
        } else {
            html += `<div class="estado-aula">✅ EN AULA</div>`;
        }

        div.innerHTML = html;
        if (!esAusente) div.onclick = () => procesarAccion(a, reg, div);
        
        grid.appendChild(div);
    });
}

/* =========================
   4. LÓGICA DE CRONÓMETRO
========================= */

function iniciarCronometro(dni, inicio) {
    if (timers[dni]) clearInterval(timers[dni]);

    const inicioMs = new Date(inicio).getTime();
    const LIMITE = 1 * 60; // 15 min

    timers[dni] = setInterval(() => {
        const ahoraMs = new Date().getTime();
        const transcurrido = Math.floor((ahoraMs - inicioMs) / 1000);
        const restante = LIMITE - transcurrido;

        const display = document.getElementById(`timer-${dni}`);
        const card = document.getElementById(`card-${dni}`);

        if (restante <= 0) {
            if (display) display.innerText = "¡TIEMPO AGOTADO!";
            if (card && !card.classList.contains("tiempo-agotado")) {
                card.classList.add("tiempo-agotado");
                triggerAlertaVibracion(); // Alerta táctil
            }
        } else {
            const min = Math.floor(restante / 60);
            const seg = restante % 60;
            if (display) display.innerText = `${min}:${seg < 10 ? '0' : ''}${seg}`;
        }
    }, 1000);
}

/* =========================
   5. ACCIONES (PETICIONES POST)
========================= */

async function procesarAccion(alumno, registro, elemento) {
    const causaSel = document.getElementById("causa");
    
    if (!registro && !causaSel.value) {
        causaSel.classList.add("shake");
        showToast("⚠️ Selecciona un destino", "error");
        setTimeout(() => causaSel.classList.remove("shake"), 400);
        return;
    }

    elemento.classList.add("bloqueado");
    const ahora = new Date();

    const data = {
        dni: alumno.dni,
        nombre: alumno.nombre,
        docente: usuarioActivo.nombre,
        tipo: registro ? "regreso" : "salida",
        causa: registro ? "" : causaSel.value,
        tipoAccion: "movimiento"
    };

    try {
        const resp = await fetch(URL, { method: "POST", body: JSON.stringify(data) });
        if (!resp.ok) throw new Error();

        const horaFormato = ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (registro) {
            registro.regreso = "OK";
            clearInterval(timers[alumno.dni]);
            showToast(`✅ Regresó: ${alumno.nombre}`);
            agregarHistorial(alumno.nombre, "REGRESÓ", "Aula", horaFormato, "regreso");
        } else {
            salidas.push({ 
                dni: alumno.dni, 
                regreso: "", 
                causa: causaSel.value, 
                inicioTime: ahora 
            });
            showToast(`🚪 Salió: ${alumno.nombre}`);
            agregarHistorial(alumno.nombre, "SALIÓ", causaSel.value, horaFormato, "salida");
        }
        render();
    } catch (e) {
        showToast("❌ Error al guardar datos", "error");
    } finally {
        elemento.classList.remove("bloqueado");
    }
}

/* =========================
   6. FUNCIONES AUXILIARES
========================= */

function actualizarContadores(filtrados) {
    const total = filtrados.length;
    const ausentes = filtrados.filter(a => a.ausente === "AUSENTE").length;
    const afuera = filtrados.filter(a => salidas.find(s => s.dni == a.dni && !s.regreso)).length;
    
    document.getElementById("total-alumnos").innerText = total;
    document.getElementById("en-aula").innerText = total - ausentes - afuera;
    document.getElementById("afuera").innerText = afuera;
    document.getElementById("ausentes").innerText = ausentes;
}

function agregarHistorial(alum, acc, cau, hor, tipo) {
    historial.push({ alumno: alum, accion: acc, causa: cau, docente: usuarioActivo.nombre, hora: hor, tipo: tipo });
    renderHistorial();
}

function renderHistorial() {
    const box = document.getElementById("historial");
    if(!box) return;
    box.innerHTML = "";
    historial.slice().reverse().forEach(h => {
        box.innerHTML += `
            <div class="historial-item" style="border-left: 4px solid ${h.tipo === 'salida' ? 'var(--warning)' : 'var(--green)'}">
                <strong>${h.alumno}</strong> <small>(${h.hora})</small><br>
                <span>${h.accion} hacia ${h.causa}</span>
            </div>`;
    });
}

function toggleTheme() {
    const body = document.body;
    body.classList.toggle("light-mode");
    const esClaro = body.classList.contains("light-mode");
    localStorage.setItem("modoTema", esClaro ? "claro" : "oscuro");
    document.getElementById("themeToggle").innerHTML = esClaro ? "☀️" : "🌙";
}

function togglePassword() {
    const input = document.getElementById("passDocente");
    input.type = input.type === "password" ? "text" : "password";
}

function cerrarSesion() {
    if (confirm("¿Cerrar sesión?")) location.reload();
}

function limpiarHistorial() {
    if (confirm("¿Limpiar historial visual?")) {
        historial = [];
        renderHistorial();
    }
}