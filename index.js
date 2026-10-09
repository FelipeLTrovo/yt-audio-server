import express from "express";
import { spawn } from "node:child_process";
import cron from "node-cron";

const app = express();
const PORT = process.env.PORT || 8080;

// Configurações do seu site
const SITE_URL = process.env.SITE_URL || "https://pcgamerbarato.com.br";
const CRON_SECRET = process.env.CRON_SECRET;

// Função que dispara o POST para a rota de publicação do Next.js
async function triggerPublishCron() {
  if (!CRON_SECRET) {
    console.error("❌ CRON_SECRET não foi configurado nas variáveis de ambiente!");
    return;
  }

  try {
    console.log("⏰ Disparando Cron de publicação de artigos...");
    const response = await fetch(`${SITE_URL}/api/cron/publish`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CRON_SECRET}`,
        "Content-Type": "application/json"
      }
    });

    const status = response.status;
    const data = await response.text();
    console.log(`✅ Resposta da Cron (${status}):`, data);
  } catch (error) {
    console.error("❌ Erro ao disparar a Cron de publicação:", error);
  }
}

// AGENDAMENTO: Roda a cada hora no minuto 0 (Ex: 09:00, 10:00, 11:00...)
// Sintaxe do Cron: (minuto hora dia-do-mês mês dia-da-semana)
cron.schedule("0 * * * *", () => {
  triggerPublishCron();
});

/* =========================================================
   ROTA DE ÁUDIO DO YOUTUBE (CÓDIGO ANTERIOR)
   ========================================================= */
app.get("/audio", (req, res) => {
  const id = String(req.query.id ?? "");

  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) {
    return res.status(400).send("ID de vídeo do YouTube inválido.");
  }

  res.setHeader("Content-Type", "audio/mpeg");

  const ytdlp = spawn("yt-dlp", [
    "-f", "ba*",
    "-o", "-",
    `https://www.youtube.com/watch?v=${id}`
  ]);

  const ffmpeg = spawn("ffmpeg", [
    "-i", "pipe:0",
    "-f", "mp3",
    "-ac", "1",
    "-ar", "16000",
    "-b:a", "64k",
    "-"
  ]);

  ytdlp.stdout.pipe(ffmpeg.stdin);
  ffmpeg.stdout.pipe(res);

  ytdlp.on("error", (err) => {
    console.error("Erro no yt-dlp:", err);
    if (!res.headersSent) res.sendStatus(500);
  });

  ffmpeg.on("error", (err) => {
    console.error("Erro no ffmpeg:", err);
    if (!res.headersSent) res.sendStatus(500);
  });

  req.on("close", () => {
    ytdlp.kill("SIGTERM");
    ffmpeg.kill("SIGTERM");
  });
});

app.listen(PORT, () => {
  console.log(`Servidor de áudio e Cron rodando na porta ${PORT}`);
});