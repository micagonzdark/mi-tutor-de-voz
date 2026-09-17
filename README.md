# Mi Tutor de Voz con IA 🎤

Un tutor de inglés conversacional que corre en el navegador. Hablás en voz y la IA te responde en tiempo real.

## ¿Cómo funciona?

- **Frontend**: HTML + JS puro, corre en el navegador
- **Backend**: Node.js + Express (sirve el frontend y protege la API key)
- **Voz**: OpenAI Realtime API vía WebRTC (baja latencia, sin interrupciones)

## Configuración inicial

1. **Cloná el repo e instalá dependencias**
   ```sh
   git clone https://github.com/micagonzdark/mi-tutor-de-voz.git
   cd mi-tutor-de-voz
   npm install
   ```

2. **Creá el archivo `.env`** (copiando el ejemplo):
   ```sh
   cp .env.example .env
   ```

3. **Abrí `.env`** y reemplazá `sk-proj-TU_CLAVE_AQUI` con tu clave de OpenAI:
   ```
   OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxx
   ```
   > ⚠️ El archivo `.env` está en `.gitignore` — nunca se sube a GitHub.

## Correr el proyecto

```sh
npm start
```

Abrí tu navegador en **http://localhost:3000**

## Requisitos

- Node.js 18 o superior
- Clave de OpenAI con acceso a la **Realtime API** (`gpt-4o-realtime-preview`)
- Billing activo en [platform.openai.com](https://platform.openai.com/settings/billing)
- Chrome o Edge (mejor soporte de micrófono)

## Cómo saber si el micrófono funciona

1. Abrís `http://localhost:3000`
2. El navegador pide permiso al micrófono → aceptás
3. El **orbe morado** se enciende → la conexión está activa
4. Hablás → el orbe pulsa → escuchás la respuesta de la IA
5. Ves la transcripción de la conversación abajo

## Personalizar el tutor

El prompt del tutor está en `server.js`, variable `TUTOR_PROMPT`. Podés editarla para cambiar el idioma, la personalidad o el nivel de dificultad.
