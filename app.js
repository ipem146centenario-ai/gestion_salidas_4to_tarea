const URL =
  "https://script.google.com/macros/s/AKfycbxbAEu9d9joaeUItVH_T0mI_iK7AL2QK8xEGgVGfvu5zdAT6S4EbesydZSk0MXNmfb05g/exec";

let alumnos = [],
  docentes = [],
  salidas = [],
  historial = [];
let usuarioActivo = null;
let timers = {};

// 1. INICIALIZACIÓN
window.addEventListener("load", () => {
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
    document.getElementById("loader").innerHTML =
      `<p style="color:var(--red)">❌ Error de conexión</p>`;
  }
}

// 2. ACCESO
function verificarAcceso() {
  const nom = document.getElementById("docentes").value;
  const pin = document.getElementById("passDocente").value;
  const user = docentes.find(
    (d) => d.nombre === nom && String(d.password) === pin,
  );

  if (user) {
    usuarioActivo = user;
    showToast(`¡Bienvenido/a!`);
    document.querySelector(".grupo-sesion").style.display = "none";
    [
      "logoutBtn",
      "seccion-filtros",
      "contador-container",
      "buscador-box",
      "historial-container",
    ].forEach((id) => {
      document.getElementById(id).style.display = "block";
    });
    render();
  } else {
    const box = document.getElementById("passDocente");
    box.classList.add("shake");
    showToast("PIN incorrecto", "error");
    setTimeout(() => box.classList.remove("shake"), 400);
  }
}

// 3. RENDERIZADO (Uso de clases del CSS)
function render() {
  const grid = document.getElementById("grid");
  const curso = document.getElementById("fCurso").value;
  const busqueda = document.getElementById("buscador").value.toLowerCase();

  if (!curso) {
    grid.innerHTML = `<div class="panel" style="text-align:center; color:var(--muted)">Seleccione un curso.</div>`;
    return;
  }

  const filtrados = alumnos.filter(
    (a) =>
      a.curso == curso &&
      (a.nombre.toLowerCase().includes(busqueda) ||
        String(a.dni).includes(busqueda)),
  );
  actualizarContadores(filtrados);
  grid.innerHTML = "";

  filtrados.forEach((a) => {
    const reg = salidas.find((s) => s.dni == a.dni && !s.regreso);
    const esAusente = a.ausente === "AUSENTE";

    const div = document.createElement("div");
    div.id = `card-${a.dni}`;
    // Clases: alumno + (in/out/ausente) para los bordes de color del CSS
    div.className = `alumno ${esAusente ? "ausente" : reg ? "out" : "in"}`;

    let html = `<span class="nombre">${a.nombre}</span>`;

    if (esAusente) {
      html += `<div class="label-ausente">❌ AUSENTE</div>`;
    } else if (reg) {
      html += `<div class="motivo-destacado">🚪 ${reg.causa.toUpperCase()}</div>`;
      if (reg.causa.toLowerCase() === "baño") {
        html += `<div class="timer-box">⏳ <span id="timer-${a.dni}">15:00</span></div>`;
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

// 4. CRONÓMETRO Y VIBRACIÓN
function iniciarCronometro(dni, inicio) {
  if (timers[dni]) clearInterval(timers[dni]);
  const LIMITE = 15 * 60;

  timers[dni] = setInterval(() => {
    const transcurrido = Math.floor(
      (new Date().getTime() - new Date(inicio).getTime()) / 1000,
    );
    const restante = LIMITE - transcurrido;
    const display = document.getElementById(`timer-${dni}`);
    const card = document.getElementById(`card-${dni}`);

    if (restante <= 0) {
      if (display) display.innerText = "¡AGOTADO!";
      if (card) card.classList.add("tiempo-agotado"); // Dispara animación roja en CSS
      if (navigator.vibrate) navigator.vibrate([500, 200, 500]);
    } else {
      const m = Math.floor(restante / 60),
        s = restante % 60;
      if (display) display.innerText = `${m}:${s < 10 ? "0" : ""}${s}`;
    }
  }, 1000);
}

// 5. ACCIONES
async function procesarAccion(alumno, registro, elemento) {
  const causa = document.getElementById("causa").value;
  if (!registro && !causa) {
    showToast("📍 Selecciona un destino", "error");
    return;
  }

  elemento.classList.add("bloqueado");
  const data = {
    dni: alumno.dni,
    nombre: alumno.nombre,
    docente: usuarioActivo.nombre,
    tipo: registro ? "regreso" : "salida",
    causa: registro ? "" : causa,
    tipoAccion: "movimiento",
  };

  try {
    await fetch(URL, { method: "POST", body: JSON.stringify(data) });
    if (registro) {
      clearInterval(timers[alumno.dni]);
      salidas = salidas.filter((s) => s.dni != alumno.dni);
    } else {
      salidas.push({ dni: alumno.dni, causa, inicioTime: new Date() });
    }
    showToast(registro ? "✅ Regreso registrado" : "🚪 Salida registrada");
    render();
  } catch (e) {
    showToast("❌ Error al guardar", "error");
  } finally {
    elemento.classList.remove("bloqueado");
  }
}

// FUNCIONES AUXILIARES
function showToast(msj, tipo = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${tipo === "error" ? "error" : ""}`;
  toast.innerText = msj;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function actualizarContadores(filtrados) {
  const total = filtrados.length;
  const aus = filtrados.filter((a) => a.ausente === "AUSENTE").length;
  const out = filtrados.filter((a) =>
    salidas.find((s) => s.dni == a.dni),
  ).length;
  document.getElementById("total-alumnos").innerText = total;
  document.getElementById("en-aula").innerText = total - aus - out;
  document.getElementById("afuera").innerText = out;
  document.getElementById("ausentes").innerText = aus;
}

function cargarDocentes() {
  const sel = document.getElementById("docentes");
  docentes.forEach(
    (d) =>
      (sel.innerHTML += `<option value="${d.nombre}">${d.nombre}</option>`),
  );
}

function cargarFiltros() {
  ["fCurso", "fDivision", "fTurno", "fEspecialidad"].forEach((id) => {
    const key = id.replace("f", "").toLowerCase();
    const sel = document.getElementById(id);
    sel.innerHTML = `<option value="">${key.toUpperCase()}</option>`;
    [...new Set(alumnos.map((a) => a[key]))].sort().forEach((v) => {
      if (v) sel.innerHTML += `<option value="${v}">${v}</option>`;
    });
    sel.onchange = render;
  });
}

function toggleTheme() {
  document.body.classList.toggle("light-mode");
  const esClaro = document.body.classList.contains("light-mode");
  localStorage.setItem("modoTema", esClaro ? "claro" : "oscuro");
  document.getElementById("themeToggle").innerHTML = esClaro ? "☀️" : "🌙";
}

function cerrarSesion() {
  location.reload();
}
