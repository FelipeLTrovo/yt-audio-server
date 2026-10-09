import express from "express";
import { spawn } from "node:child_process";
import cron from "node-cron";

const app = express();
const PORT = process.env.PORT || 8080;

const SITE_URL = process.env.SITE_URL || "https://pcgamerbarato.com.br";
const CRON_SECRET = process.env.CRON_SECRET;

// Middleware para ver as requisições nos logs do Render
app.use((req, res, next) => {
  console.log(`[LOG] ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

/* =========================================================
   ROTA DE EXTRAÇÃO DE ÁUDIO (CORRIGIDA)
   ========================================================= */
app.get("/audio", (req, res) => {
  const id = String(req.query.id ?? "");

  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) {
    return res.status(400).send("ID de vídeo inválido.");
  }

  // Define os cabeçalhos para download em stream
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Content-Disposition", `attachment; filename="${id}.mp3"`);

  // 1. yt-dlp: extrai áudio em formato bruto e envia via stdout
  const ytdlp = spawn("yt-dlp", [
    "-f", "ba/ba*",
    "--no-playlist",
    "-o", "-",
    `https://www.youtube.com/watch?v=${id}`
  ]);

  // 2. ffmpeg: lê da entrada 'pipe:0' e converte em MP3
  const ffmpeg = spawn("ffmpeg", [
    "-loglevel", "error",
    "-i", "pipe:0",
    "-f", "mp3",
    "-ac", "1",          // Mono
    "-ar", "16000",      // 16kHz (ideal para Groq Whisper)
    "-b:a", "64k",       // Bitrate baixo/leve
    "pipe:1"            // Saída explícita para pipe:1
  ]);

  // Conecta as saídas
  ytdlp.stdout.pipe(ffmpeg.stdin);
  ffmpeg.stdout.pipe(res);

  // Trata erros do yt-dlp
  ytdlp.stderr.on("data", (data) => {
    console.error(`[yt-dlp stderr]: ${data}`);
  });

  // Trata erros do ffmpeg
  ffmpeg.stderr.on("data", (data) => {
    console.error(`[ffmpeg stderr]: ${data}`);
  });

  ytdlp.on("error", (err) => {
    console.error("Erro ao iniciar yt-dlp:", err);
    if (!res.headersSent) res.status(500).send("Erro no yt-dlp");
  });

  ffmpeg.on("error", (err) => {
    console.error("Erro ao iniciar ffmpeg:", err);
    if (!res.headersSent) res.status(500).send("Erro no ffmpeg");
  });

  // Cancela processos se o cliente (Vercel) desconectar
  req.on("close", () => {
    ytdlp.kill("SIGKILL");
    ffmpeg.kill("SIGKILL");
  });
});

/* =========================================================
   CRON JOB (MINUTO :05 DE CADA HORA)
   ========================================================= */
cron.schedule("5 * * * *", async () => {
  if (!CRON_SECRET) return;
  try {
    console.log("⏰ Disparando Cron no Next.js...");
    const response = await fetch(`${SITE_URL}/api/cron/publish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CRON_SECRET}`,
        "Content-Type": "application/json",
      },
    });
    console.log(`✅ Cron finalizada com status ${response.status}`);
  } catch (error) {
    console.error("❌ Erro na Cron:", error);
  }
});

app.listen(PORT, () => {
  console.log(`Servidor de áudio e Cron ativo na porta ${PORT}`);
});