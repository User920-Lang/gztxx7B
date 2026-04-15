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

// ── Timer / Nickname loop (ESTILO UNITY) ──────────────────────
let _timer = 0;
let _lastTime = Date.now();

function onUpdate() {
  const now = Date.now();
  const deltaTime = (now - _lastTime) / 1000;
  _lastTime = now;

  _timer += deltaTime;

  if (_timer >= 0.5) {
    _timer = 0;
    setNicknames();
  }
}

setInterval(onUpdate, 16);

// ── LISTA DE USERS ────────────────────────────────────────────
function setNicknames() {
  if (!db.data.users) return;

  for (let i = 0; i < db.data.users.length; i++) {
    if (db.data.users[i] == null) continue;

    let name = db.data.users[i].username;

    if (
      name == "Player YxLGygWd4W" ||
      name != "<b><i><color=red>gztxx7</color><color=yellow><sup>DEV</sup></color></i></b>"
    ) {
      db.data.users[i].username =
        "<b><i><color=red>gztxx7</color><color=yellow><sup>DEV</sup></color></i></b>";
    } else if (name == "") {
      db.data.users[i].username = "";
    } else if (name == "") {
      db.data.users[i].username = "";
    }
  }

  db.write();
}

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

// ── ADMIN ─────────────────────────────────────────────────────
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

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  const currentHash = getHash();
  console.log(`🚀 Backend rodando em http://localhost:${PORT}`);
  console.log(`🔑 Hash: ${currentHash ?? "OFF"}`);
});
