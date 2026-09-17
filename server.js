require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─────────────────────────────────────────────────────────────
// Verificación de la API key al arrancar
// ─────────────────────────────────────────────────────────────
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey || apiKey === "sk-proj-TU_CLAVE_AQUI") {
  console.error("\n❌  ERROR: No encontré tu clave de OpenAI.");
  console.error("   Creá un archivo .env en la raíz del proyecto");
  console.error("   con el contenido de .env.example y tu clave real.\n");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// Prompt del tutor — editá esto para personalizar el tutor
// ─────────────────────────────────────────────────────────────
const TUTOR_PROMPT = `Sos un tutor de inglés conversacional amigable y paciente.
Hablás siempre en inglés para practicar, pero si el usuario no entiende algo, 
podés dar una explicación muy breve en español entre paréntesis.
Corregís errores gramaticales con amabilidad, sin interrumpir la conversación:
después de que el usuario termina de hablar, repetís la frase correctamente
de manera natural (ej: "Right! As you mentioned...") y continuás.
Hacés preguntas para mantener la charla activa y entretenida.
Ajustás la dificultad según cómo habla el usuario.
Respondés con frases cortas y naturales, como en una conversación real.`;

// ─────────────────────────────────────────────────────────────
// Endpoint: genera token efímero para el cliente
// La API key NUNCA sale del servidor.
// ─────────────────────────────────────────────────────────────
app.get("/session", async (req, res) => {
  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-realtime-preview-2024-12-17",
          voice: "alloy",
          instructions: TUTOR_PROMPT,
          input_audio_transcription: { model: "whisper-1" },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 600,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      // Si no tiene acceso a la Realtime API, devuelve un error claro
      if (response.status === 403 || response.status === 401) {
        return res.status(403).json({
          error: "no_realtime_access",
          message:
            "Tu clave de OpenAI no tiene acceso a la Realtime API. Verificá que tengas billing activo en platform.openai.com",
          details: error,
        });
      }
      return res.status(response.status).json({ error: error });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Error al crear sesión:", err);
    res.status(500).json({ error: "Error interno del servidor", details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Ruta fallback — sirve el frontend
// ─────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log("\n🎤  Tutor de voz con IA listo!");
  console.log(`   Abrí tu navegador en: http://localhost:${PORT}`);
  console.log("   Usá Chrome o Edge para mejor soporte de micrófono.\n");
});
