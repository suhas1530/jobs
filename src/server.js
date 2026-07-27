import express from "express";
import "dotenv/config";
import http from "http";
import app from "./app.js";
import connectDB from "./config/db.js";
import { initInterviewSignaling } from "./realtime/interviewSignaling.js";





const PORT = process.env.PORT || 5000;

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));


async function start() {
  try {
    await connectDB(process.env.MONGO_URI);
    const server = http.createServer(app);
    initInterviewSignaling(server);
    server.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start backend:", err?.message || err);
    process.exit(1);
  }
}

start();

process.on("unhandledRejection", (err) => {
  console.error("Unhandled promise rejection:", err?.message || err);
});
