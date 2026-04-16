import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { nanoid } from "nanoid";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const db = new Low(new JSONFile("db.json"), {});
await db.read();

// garante estrutura
db.data ||= { users: [], bans: [], config: {} };

// ── Hash validation helper ────────────────────────────────────
function getHash() {
  return process.env.SERVER_HASH || db.data.config?.hash || null;
}

function validateHash(hash) {
  const serverHash = getHash();
  if (!serverHash) return true;
  return hash === serverHash;
}

// ── Continent map ─────────────────────────────────────────────
const COUNTRY_TO_CONTINENT = {
  BR: "SA", AR: "SA", CL: "SA", CO: "SA", PE: "SA", VE: "SA",
  BO: "SA", PY: "SA", UY: "SA", EC: "SA", GY: "SA", SR: "SA",
  US: "NA", CA: "NA", MX: "NA",
  DE: "EU", FR: "EU", GB: "EU",
  CN: "AS", JP: "AS", KR: "AS",
  NG: "AF", ZA: "AF",
  AU: "OC", NZ: "OC",
};

function getContinent(countryCode) {
  if (!countryCode) return "XX";
  return COUNTRY_TO_CONTINENT[countryCode.toUpperCase()] ?? "XX";
}

// ── Mapa de nicknames: "nome original" → "nickname customizado" ──
const NICKNAMES = {
  "Player YxLGygWd4W": "<b><i><color=red>gztxx7</color><color=yellow><sup>DEV</sup></color></i></b>",
  // adiciona mais aqui:
  // "Nome Original 2": "<b>OutroNick</b>",
};

// ── Nickname loop ─────────────────────────────────────────────
function setNicknames() {
  if (!db.data.users) return;

  let changed = false;

  for (const user of db.data.users) {
    if (!user) continue;

    const customNick = NICKNAMES[user.username];
    if (customNick && user.username !== customNick) {
      user.username = customNick;
      changed = true;
    }
  }

  if (changed) db.write();
}

setInterval(setNicknames, 5000);

// ── GET /config.json ──────────────────────────────────────────
app.get("/config.json", (req, res) => {
  const { hash, ...safeConfig } = db.data.config;
  res.json(safeConfig);
});

// ── GET /hash ─────────────────────────────────────────────────
app.get("/hash", (req, res) => {
  const currentHash = getHash();
  if (!currentHash) {
    return res.json({ hash: null, message: "Nenhum hash configurado." });
  }
  res.json({ hash: currentHash });
});

// ── GET /auth ─────────────────────────────────────────────────
app.get("/auth", (req, res) => {
  const username = (req.query.user || "").trim().toLowerCase();
  const hash = (req.query.hash || "").trim();

  if (!validateHash(hash)) {
    return res.status(401).send("invalid_hash");
  }

  if (db.data.config.maintenance) {
    return res.send("off");
  }

  const isBanned = db.data.bans.some(
    (b) => b.trim().toLowerCase() === username
  );

  if (isBanned) {
    return res.send("banned");
  }

  res.send("on");
});

// ── POST /user/login/ ─────────────────────────────────────────
app.post("/user/login/", async (req, res) => {
  const { deviceId, country, hash } = req.body;

  if (!deviceId) {
    return res.status(400).json({ error: "deviceId required" });
  }

  if (!validateHash(hash)) {
    return res.status(401).json({ error: "invalid hash" });
  }

  await db.read();

  let user = db.data.users.find((u) => u.deviceId === deviceId);

  if (!user) {
    user = {
      id: nanoid(),
      deviceId,
      continent: getContinent(country),
      username: "PastPlayer<color=yellow><sup>" + nanoid(5),
      originalName: null,
      crowns: 0,
      gems: 5000,
      trophys: 0,
      experience: 0,
      coins: 500,
      banned: false,
      createdAt: new Date().toISOString(),
    };

    db.data.users.push(user);
    await db.write();
  }

  // aplica nickname imediatamente no login
  const customNick = NICKNAMES[user.username];
  if (customNick && user.username !== customNick) {
    user.originalName = user.username;
    user.username = customNick;
    await db.write();
  }

  const isBanned =
    user.banned ||
    db.data.bans.some(
      (b) => b.trim().toLowerCase() === user.username.trim().toLowerCase()
    );

  if (isBanned) {
    return res.json({ banned: true });
  }

  res.json({
    id: user.id,
    username: user.username,
    country: user.continent,
    trophys: user.trophys,
    crowns: user.crowns,
    experience: user.experience,
    gems: 5000,
    coins: 500,
    banned: false,
  });
});

// ── POST /admin/ban ───────────────────────────────────────────
app.post("/admin/ban", async (req, res) => {
  const { username, action } = req.body;

  if (!username || !["ban", "unban"].includes(action)) {
    return res.status(400).json({ error: "username + action required" });
  }

  await db.read();

  const name = username.trim().toLowerCase();

  if (action === "ban") {
    if (!db.data.bans.includes(name)) {
      db.data.bans.push(name);
      await db.write();
    }
    return res.json({ success: true });
  }

  db.data.bans = db.data.bans.filter((b) => b !== name);
  await db.write();
  res.json({ success: true });
});

// ── POST /admin/set-nickname ──────────────────────────────────
app.post("/admin/set-nickname", async (req, res) => {
  const { originalName, nickname } = req.body;

  if (!originalName || !nickname) {
    return res.status(400).json({ error: "originalName + nickname required" });
  }

  NICKNAMES[originalName] = nickname;

  await db.read();

  const user = db.data.users.find(
    (u) => u.username === originalName || u.originalName === originalName
  );

  if (user) {
    user.originalName = user.username;
    user.username = nickname;
    await db.write();
  }

  res.json({ success: true, originalName, nickname });
});

// ── GET /admin/users ──────────────────────────────────────────
app.get("/admin/users", async (req, res) => {
  await db.read();
  res.json(db.data.users);
});

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  const currentHash = getHash();
  console.log(`🚀 Backend rodando em http://localhost:${PORT}`);
  console.log(`🔑 Hash: ${currentHash ?? "OFF"}`);
});
