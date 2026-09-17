// ─────────────────────────────────────────────────────────────
// Tutor de Voz con IA — Cliente WebRTC
// Conecta con la OpenAI Realtime API usando un token efímero
// que el servidor genera por nosotros (la API key nunca llega aquí)
// ─────────────────────────────────────────────────────────────

let pc = null;          // RTCPeerConnection
let dc = null;          // DataChannel para eventos JSON
let audioEl = null;     // Elemento de audio para la voz de la IA
let partialUserMsg = null;  // Mensaje parcial del usuario (mientras habla)
let partialAiMsg = null;    // Mensaje parcial de la IA (mientras responde)

// ── UI helpers ──────────────────────────────────────────────
const orb        = document.getElementById("orb");
const statusEl   = document.getElementById("status");
const transcript = document.getElementById("transcript");
const connectBtn = document.getElementById("connect-btn");
const disconnBtn = document.getElementById("disconnect-btn");
const errorBox   = document.getElementById("error-box");

function setStatus(text, type = "") {
  statusEl.className = "status " + type;
  statusEl.innerHTML = `<span class="dot"></span>${text}`;
}

function setOrbState(state) {
  orb.className = "orb " + state;
}

function showError(html) {
  errorBox.style.display = "block";
  errorBox.innerHTML = html;
}

function clearError() {
  errorBox.style.display = "none";
  errorBox.innerHTML = "";
}

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
    // 1. Pedimos el token efímero al servidor
    const sessionRes = await fetch("/session");
    if (!sessionRes.ok) {
      const err = await sessionRes.json();
      if (err.error === "no_realtime_access") {
        showError(`
          <strong>⚠️ Sin acceso a la Realtime API</strong><br><br>
          Tu clave de OpenAI no tiene acceso a la Realtime API todavía.<br>
          <strong>Qué hacer:</strong>
          <ol style="margin:0.6rem 0 0 1.2rem">
            <li>Entrá a <a href="https://platform.openai.com/settings/billing" target="_blank" style="color:#fca5a5">platform.openai.com/settings/billing</a></li>
            <li>Verificá que tengas crédito cargado (mínimo ~\$5)</li>
            <li>Buscá en el catálogo de modelos <em>gpt-4o-realtime-preview</em></li>
          </ol><br>
          Si no tenés acceso, avisame y activamos el <strong>Plan B</strong> (Whisper + TTS).
        `);
        setStatus("Sin acceso a Realtime API", "error");
        setOrbState("");
      } else {
        throw new Error(err.message || "Error al crear sesión");
      }
      connectBtn.disabled = false;
      return;
    }

    const session = await sessionRes.json();
    const ephemeralKey = session.client_secret?.value;
    if (!ephemeralKey) throw new Error("El servidor no devolvió un token válido");

    // 2. Creamos la conexión WebRTC
    setStatus("Conectando con la IA...", "");
    pc = new RTCPeerConnection();

    // 3. Elemento de audio para recibir la voz de la IA
    audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    pc.ontrack = (e) => {
      audioEl.srcObject = e.streams[0];
      setOrbState("speaking");
    };

    // 4. Capturamos el micrófono
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (micErr) {
      throw new Error("No se pudo acceder al micrófono. Verificá los permisos del navegador.");
    }
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    // 5. DataChannel para eventos JSON (transcripciones, etc.)
    dc = pc.createDataChannel("oai-events");
    dc.onopen = () => {
      setStatus("Conectado — hablá cuando quieras!", "connected");
      setOrbState("listening");
      connectBtn.style.display = "none";
      disconnBtn.style.display = "inline-block";
    };
    dc.onmessage = handleEvent;

    // 6. SDP offer → OpenAI → SDP answer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpRes = await fetch(
      "https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      }
    );

    if (!sdpRes.ok) {
      const text = await sdpRes.text();
      throw new Error(`OpenAI rechazó la conexión (${sdpRes.status}): ${text}`);
    }

    const answerSdp = await sdpRes.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

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

// ── Manejo de eventos del DataChannel ───────────────────────
function handleEvent(e) {
  let event;
  try { event = JSON.parse(e.data); } catch { return; }

  switch (event.type) {

    // El usuario terminó de hablar — transcripción final
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

    // Transcripción parcial del usuario (en tiempo real)
    case "input_audio_buffer.speech_started":
      setOrbState("listening");
      partialUserMsg = addMessage("user", "...", true);
      break;

    // La IA empieza a hablar
    case "response.audio_transcript.delta":
      if (!partialAiMsg) {
        partialAiMsg = addMessage("ai", event.delta, true);
      } else {
        updateMessage(partialAiMsg, partialAiMsg.textContent + event.delta);
      }
      setOrbState("speaking");
      break;

    // La IA terminó de hablar
    case "response.audio_transcript.done":
      if (partialAiMsg) {
        updateMessage(partialAiMsg, event.transcript);
        partialAiMsg.classList.remove("partial");
        partialAiMsg = null;
      }
      setOrbState("listening");
      break;

    // Error de la API
    case "error":
      console.error("OpenAI Realtime error:", event.error);
      showError(`<strong>Error de OpenAI:</strong> ${event.error?.message || JSON.stringify(event.error)}`);
      break;
  }
}

// ── Desconexión ──────────────────────────────────────────────
function disconnect() {
  cleanup(true);
}

function cleanup(showMsg = true) {
  if (dc) { try { dc.close(); } catch {} dc = null; }
  if (pc) { try { pc.close(); } catch {} pc = null; }
  if (audioEl) { audioEl.srcObject = null; audioEl = null; }
  partialUserMsg = null;
  partialAiMsg = null;

  setOrbState("");
  connectBtn.disabled = false;
  connectBtn.style.display = "inline-block";
  disconnBtn.style.display = "none";

  if (showMsg) {
    setStatus("Sesión terminada — podés empezar una nueva", "");
  }
}
