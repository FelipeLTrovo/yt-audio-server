import express from "express";
import { spawn } from "node:child_process";

const app = express();
const PORT = process.env.PORT || 8080;

app.get("/audio", (req, res) => {
  const id = String(req.query.id ?? "");

  // Validação do formato padrão de ID de vídeo do YouTube (11 carateres)
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) {
    return res.status(400).send("ID de vídeo do YouTube inválido.");
  }

  // Define os cabeçalhos para resposta de áudio MP3 em fluxo (stream)
  res.setHeader("Content-Type", "audio/mpeg");

  // Inicia o yt-dlp para extrair o áudio bruto
  const ytdlp = spawn("yt-dlp", [
    "-f", "ba*",
    "-o", "-",
    `https://www.youtube.com/watch?v=${id}`
  ]);

  // Inicia o ffmpeg para converter a entrada em MP3 mono e leve (ideal para a Groq/Whisper)
  const ffmpeg = spawn("ffmpeg", [
    "-i", "pipe:0",
    "-f", "mp3",
    "-ac", "1",          // Canal Mono
    "-ar", "16000",      // Amostragem de 16kHz
    "-b:a", "64k",       // Bitrate de 64kbps (garante arquivo < 25MB)
    "-"
  ]);

  // Encadeamento dos processos: yt-dlp -> ffmpeg -> Resposta HTTP
  ytdlp.stdout.pipe(ffmpeg.stdin);
  ffmpeg.stdout.pipe(res);

  // Tratamento de erros
  ytdlp.on("error", (err) => {
    console.error("Erro no yt-dlp:", err);
    if (!res.headersSent) res.sendStatus(500);
  });

  ffmpeg.on("error", (err) => {
    console.error("Erro no ffmpeg:", err);
    if (!res.headersSent) res.sendStatus(500);
  });

  // Encerra os processos caso o cliente/Vercel cancele a requisição
  req.on("close", () => {
    ytdlp.kill("SIGTERM");
    ffmpeg.kill("SIGTERM");
  });
});

app.listen(PORT, () => {
  console.log(`Servidor de áudio em execução na porta ${PORT}`);
});