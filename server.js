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
// /config — le dice al frontend si el servidor ya tiene una key
// (para decidir si mostrar la pantalla de configuración o no)
// ─────────────────────────────────────────────────────────────
const envKey = process.env.OPENAI_API_KEY;
const serverHasKey = envKey && envKey !== "sk-proj-TU_CLAVE_AQUI";

app.get("/config", (req, res) => {
  res.json({ serverHasKey: !!serverHasKey });
});

// ─────────────────────────────────────────────────────────────
// /session — genera token efímero para el cliente
// Usa la key del .env si existe; si no, la acepta del browser
// vía el header x-api-key (guardada en localStorage del usuario)
// ─────────────────────────────────────────────────────────────
app.get("/session", async (req, res) => {
  const apiKey = serverHasKey ? envKey : req.headers["x-api-key"];

  if (!apiKey) {
    return res.status(401).json({
      error: "no_key",
      message: "No hay clave de API configurada.",
    });
  }

  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session: {
            model: "gpt-4o-realtime-preview-2024-12-17"
          }
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      if (response.status === 403 || response.status === 401) {
        return res.status(403).json({
          error: "no_realtime_access",
          message:
            "La clave de OpenAI no tiene acceso a la Realtime API. Verificá que tengas billing activo en platform.openai.com",
          details: error,
        });
      }
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Error al crear sesión:", err);
    res.status(500).json({ error: "Error interno del servidor", details: err.message });
  }
});

// Ruta fallback — sirve el frontend
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log("\n🎤  Tutor de voz con IA listo!");
  console.log(`   Abrí tu navegador en: http://localhost:${PORT}`);
  if (!serverHasKey) {
    console.log("   (La clave de OpenAI se ingresa desde el navegador)\n");
  }
});
