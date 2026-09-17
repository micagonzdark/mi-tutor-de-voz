// ─────────────────────────────────────────────────────────────
// Tutor de Voz con IA — Cliente WebRTC
// ─────────────────────────────────────────────────────────────

const KEY_STORAGE = "tutor_openai_key";

let pc = null;
let dc = null;
let audioEl = null;
let partialUserMsg = null;
let partialAiMsg = null;

// ── Elementos del DOM ────────────────────────────────────────
const setupScreen = document.getElementById("setup-screen");
const appScreen   = document.getElementById("app-screen");
const orb         = document.getElementById("orb");
const statusEl    = document.getElementById("status");
const transcript  = document.getElementById("transcript");
const connectBtn  = document.getElementById("connect-btn");
const disconnBtn  = document.getElementById("disconnect-btn");
const errorBox    = document.getElementById("error-box");

// ── Al cargar la página ──────────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  // Primero preguntamos al servidor si ya tiene la key (via .env)
  try {
    const cfg = await fetch("/config").then(r => r.json());
    if (cfg.serverHasKey) {
      // El servidor tiene la clave — vamos directo a la app
      showApp();
      return;
    }
  } catch {}

  // Si el usuario ya guardó la clave en el navegador, también vamos directo
  const saved = localStorage.getItem(KEY_STORAGE);
  if (saved && saved.startsWith("sk-")) {
    showApp();
  } else {
    showSetup();
  }
});

// ── Setup screen ─────────────────────────────────────────────
function showSetup() {
  setupScreen.style.display = "flex";
  appScreen.style.display   = "none";
}

function showApp() {
  setupScreen.style.display = "none";
  appScreen.style.display   = "flex";
}

function toggleKeyVisibility() {
  const input = document.getElementById("api-key-input");
  const btn   = document.getElementById("toggle-key-btn");
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "🙈";
  } else {
    input.type = "password";
    btn.textContent = "👁️";
  }
}

function saveKey() {
  const input = document.getElementById("api-key-input");
  const key = input.value.trim();

  if (!key || !key.startsWith("sk-")) {
    input.style.borderColor = "#f87171";
    input.placeholder = "La clave debe empezar con sk-";
    setTimeout(() => {
      input.style.borderColor = "";
      input.placeholder = "sk-proj-...";
    }, 2500);
    return;
  }

  localStorage.setItem(KEY_STORAGE, key);
  input.value = "";
  showApp();
}

function changeKey() {
  disconnect();
  localStorage.removeItem(KEY_STORAGE);
  document.getElementById("api-key-input").value = "";
  showSetup();
}

// Permite guardar la clave con Enter
document.getElementById("api-key-input")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveKey();
});

// ── UI helpers ───────────────────────────────────────────────
function setStatus(text, type = "") {
  statusEl.className = "status " + type;
  statusEl.innerHTML = `<span class="dot"></span>${text}`;
}
function setOrbState(state) { orb.className = "orb " + state; }
function showError(html) { errorBox.style.display = "block"; errorBox.innerHTML = html; }
function clearError()    { errorBox.style.display = "none";  errorBox.innerHTML = ""; }

function addMessage(role, text, partial = false) {
  const div = document.createElement("div");
  div.className = `msg ${role}${partial ? " partial" : ""}`;
  div.textContent = text;
  transcript.appendChild(div);
  transcript.scrollTop = transcript.scrollHeight;
  return div;
}
function updateMessage(el, text) {
  el.textContent = text;
  transcript.scrollTop = transcript.scrollHeight;
}

// ── Conexión principal ───────────────────────────────────────
async function connect() {
  clearError();
  connectBtn.disabled = true;
  setStatus("Obteniendo sesión...", "");
  setOrbState("connecting");

  try {
    // Enviamos la clave guardada en localStorage (si el servidor no la tiene)
    const savedKey = localStorage.getItem(KEY_STORAGE);
    const headers  = savedKey ? { "x-api-key": savedKey } : {};

    const sessionRes = await fetch("/session", { headers });

    if (!sessionRes.ok) {
      const err = await sessionRes.json();
      if (err.error === "no_realtime_access") {
        showError(`
          <strong>⚠️ Sin acceso a la Realtime API</strong><br><br>
          Tu clave de OpenAI no tiene acceso a la Realtime API todavía.<br>
          <strong>Qué hacer:</strong>
          <ol style="margin:.6rem 0 0 1.2rem">
            <li>Entrá a <a href="https://platform.openai.com/settings/billing" target="_blank" style="color:#fca5a5">platform.openai.com → Billing</a></li>
            <li>Verificá que tengas crédito cargado (mínimo \$5)</li>
            <li>Confirmá acceso al modelo <em>gpt-4o-realtime-preview</em></li>
          </ol>
        `);
        setStatus("Sin acceso a Realtime API", "error");
      } else if (err.error === "no_key") {
        showError(`<strong>❌ Falta la clave</strong><br>Hacé clic en "Cambiar clave" y volvé a ingresarla.`);
        setStatus("Sin clave configurada", "error");
      } else {
        // Intentamos sacar el error real que nos manda OpenAI o el backend
        let errorMsg = err.message || err.details;
        if (err.error && typeof err.error === 'object' && err.error.error) {
           errorMsg = err.error.error.message;
        } else if (typeof err.error === 'string') {
           errorMsg = err.error + (err.details ? ": " + JSON.stringify(err.details) : "");
        }
        throw new Error(errorMsg || JSON.stringify(err) || "Error al crear sesión");
      }
      setOrbState("");
      connectBtn.disabled = false;
      return;
    }

    const session = await sessionRes.json();
    const ephemeralKey = session.client_secret?.value || session.client_secret || session.value;
    if (!ephemeralKey) throw new Error("El servidor no devolvió un token válido. Respuesta: " + JSON.stringify(session));

    // Crear conexión WebRTC
    setStatus("Conectando con la IA...", "");
    pc = new RTCPeerConnection();

    audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    pc.ontrack = (e) => {
      audioEl.srcObject = e.streams[0];
      setOrbState("speaking");
    };

    // Capturar micrófono
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      throw new Error("No se pudo acceder al micrófono. Verificá los permisos del navegador.");
    }
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    // DataChannel para eventos JSON
    dc = pc.createDataChannel("oai-events");
    dc.onopen = () => {
      setStatus("Conectado — hablá cuando quieras 🎙️", "connected");
      setOrbState("listening");
      connectBtn.style.display = "none";
      disconnBtn.style.display = "inline-block";

      const TUTOR_PROMPT = `Sos un paciente y amigable tutor de INGLÉS para un estudiante cuyo idioma nativo es el español.
Comportamiento clave:
1. Hablá usando una mezcla de los dos idiomas. Usá oraciones en inglés para practicar, e inmediatamente después explicale en español qué significa.
2. Hablá a un ritmo natural de conversación. 
3. Sé tolerante con los errores menores. Corrígelo en español SOLO si comete un error muy grave o incomprensible, de lo contrario dejá pasar los pequeños errores para mantener la fluidez.
4. Mantené tus respuestas muy cortas.
5. Hacé preguntas básicas en inglés (seguidas de su traducción al español) para mantener la conversación activa.`;

      dc.send(JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          instructions: TUTOR_PROMPT,
          audio: {
            input: {
              transcription: {
                model: "whisper-1",
                language: "en"
              }
            },
            output: {
              voice: "alloy"
            }
          }
        }
      }));
    };
    dc.onmessage = handleEvent;

    // SDP handshake con OpenAI
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpRes = await fetch(
      "https://api.openai.com/v1/realtime/calls",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${ephemeralKey}`, "Content-Type": "application/sdp" },
        body: offer.sdp,
      }
    );

    if (!sdpRes.ok) {
      const text = await sdpRes.text();
      throw new Error(`OpenAI rechazó la conexión (${sdpRes.status}): ${text}`);
    }

    await pc.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() });
    setStatus("Estableciendo audio...", "");

  } catch (err) {
    console.error("Error en connect():", err);
    showError(`<strong>❌ Error al conectar</strong><br>${err.message}`);
    setStatus("Error — intentá de nuevo", "error");
    setOrbState("");
    connectBtn.disabled = false;
    cleanup(false);
  }
}

// ── Eventos del DataChannel ──────────────────────────────────
function handleEvent(e) {
  let event;
  try { event = JSON.parse(e.data); } catch { return; }

  switch (event.type) {
    case "input_audio_buffer.speech_started":
      setOrbState("listening");
      partialUserMsg = addMessage("user", "...", true);
      break;

    case "conversation.item.input_audio_transcription.completed":
      if (partialUserMsg) {
        updateMessage(partialUserMsg, event.transcript);
        partialUserMsg.classList.remove("partial");
        partialUserMsg = null;
      } else if (event.transcript?.trim()) {
        addMessage("user", event.transcript);
      }
      setOrbState("listening");
      break;

    case "response.audio_transcript.delta":
      if (!partialAiMsg) {
        partialAiMsg = addMessage("ai", event.delta, true);
      } else {
        updateMessage(partialAiMsg, partialAiMsg.textContent + event.delta);
      }
      setOrbState("speaking");
      break;

    case "response.audio_transcript.done":
      if (partialAiMsg) {
        updateMessage(partialAiMsg, event.transcript);
        partialAiMsg.classList.remove("partial");
        partialAiMsg = null;
      }
      setOrbState("listening");
      break;

    case "error":
      console.error("OpenAI Realtime error:", event.error);
      showError(`<strong>Error de OpenAI:</strong> ${event.error?.message || JSON.stringify(event.error)}`);
      break;
  }
}

// ── Desconexión ──────────────────────────────────────────────
function disconnect() { cleanup(true); }

function cleanup(showMsg = true) {
  if (dc)      { try { dc.close();  } catch {} dc = null; }
  if (pc)      { try { pc.close();  } catch {} pc = null; }
  if (audioEl) { audioEl.srcObject = null; audioEl = null; }
  partialUserMsg = null;
  partialAiMsg   = null;

  setOrbState("");
  connectBtn.disabled = false;
  connectBtn.style.display = "inline-block";
  disconnBtn.style.display = "none";

  if (showMsg) setStatus("Sesión terminada — podés empezar una nueva", "");
}
