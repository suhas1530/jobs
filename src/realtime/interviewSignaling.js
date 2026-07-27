import { WebSocketServer, WebSocket } from "ws";
import { URL } from "url";

const rooms = new Map();
let wss = null;
let heartbeat = null;

function roomSet(interviewId) {
  if (!rooms.has(interviewId)) rooms.set(interviewId, new Set());
  return rooms.get(interviewId);
}

function removeClient(ws) {
  const interviewId = ws?.meta?.interviewId;
  if (!interviewId) return;
  const set = rooms.get(interviewId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) rooms.delete(interviewId);
}

function safeSend(ws, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    // ignore broken socket
  }
}

export function initInterviewSignaling(server) {
  if (wss) return wss;
  wss = new WebSocketServer({ server });

  wss.on("connection", (ws, req) => {
    try {
      req.socket?.setNoDelay?.(true);
      req.socket?.setKeepAlive?.(true, 30000);
    } catch {
      // ignore socket tuning failures
    }
    const host = req?.headers?.host || "localhost";
    const rawUrl = String(req?.url || "/ws/interviews");
    let parsed = null;
    try {
      parsed = new URL(rawUrl, `http://${host}`);
    } catch {
      ws.close();
      return;
    }
    const pathname = String(parsed.pathname || "").replace(/\/+$/, "");
    const allowed = /\/ws\/interviews$/i.test(pathname);
    if (!allowed) {
      ws.close();
      return;
    }
    const interviewId = String(parsed.searchParams.get("interviewId") || "").trim();
    const role = String(parsed.searchParams.get("role") || "").trim().toLowerCase();

    if (!interviewId) {
      safeSend(ws, { event: "error", message: "Missing interviewId" });
      ws.close();
      return;
    }

    ws.meta = { interviewId, role };
    ws.isAlive = true;
    roomSet(interviewId).add(ws);
    safeSend(ws, { event: "connected", interviewId, role });

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", (buf) => {
      let payload = null;
      try {
        payload = JSON.parse(String(buf || "{}"));
      } catch {
        return;
      }
      if (payload?.event === "ping") {
        safeSend(ws, { event: "pong", ts: Date.now() });
      }
    });

    ws.on("close", () => removeClient(ws));
    ws.on("error", () => removeClient(ws));
  });

  heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (client.isAlive === false) {
        removeClient(client);
        try {
          client.terminate();
        } catch {
          // ignore broken socket
        }
        continue;
      }
      client.isAlive = false;
      try {
        client.ping();
      } catch {
        removeClient(client);
      }
    }
  }, 30000);
  heartbeat.unref?.();

  wss.on("close", () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
  });

  return wss;
}

export function emitInterviewSignal(interviewId, event, data = {}, options = {}) {
  const id = String(interviewId || "").trim();
  if (!id) return;
  const set = rooms.get(id);
  if (!set || !set.size) return;
  const payload = { event, interviewId: id, data };
  const excludeRole = String(options?.excludeRole || "").trim().toLowerCase();

  for (const ws of set) {
    if (excludeRole && String(ws?.meta?.role || "").toLowerCase() === excludeRole) continue;
    safeSend(ws, payload);
  }
}
