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
  GT: "NA", HN: "NA", SV: "NA", NI: "NA", CR: "NA", PA: "NA",
  CU: "NA", DO: "NA", HT: "NA", JM: "NA", PR: "NA",
  DE: "EU", FR: "EU", GB: "EU", IT: "EU", ES: "EU", PT: "EU",
  NL: "EU", BE: "EU", CH: "EU", AT: "EU", SE: "EU", NO: "EU",
  DK: "EU", FI: "EU", PL: "EU", CZ: "EU", SK: "EU", HU: "EU",
  RO: "EU", BG: "EU", HR: "EU", RS: "EU", GR: "EU", TR: "EU",
  UA: "EU", RU: "EU",
  CN: "AS", JP: "AS", KR: "AS", IN: "AS", ID: "AS", TH: "AS",
  VN: "AS", PH: "AS", MY: "AS", SG: "AS", PK: "AS", BD: "AS",
  NG: "AF", ZA: "AF", EG: "AF", KE: "AF", GH: "AF", ET: "AF",
  AU: "OC", NZ: "OC",
  SA: "ME", AE: "ME", IL: "ME", IR: "ME", IQ: "ME",
};

function getContinent(countryCode) {
  if (!countryCode) return "XX";
  return COUNTRY_TO_CONTINENT[countryCode.toUpperCase()] ?? "XX";
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

// ── GET /auth (AGORA COM HASH 🔒) ─────────────────────────────
app.get("/auth", (req, res) => {
  const username = (req.query.user || "").trim().toLowerCase();
  const hash = (req.query.hash || "").trim();

  // 🔒 valida hash aqui
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
      username: "StumblePast" + nanoid(8),
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

app.post("/admin/set-hash", async (req, res) => {
  const { newHash } = req.body;

  if (!newHash) {
    return res.status(400).json({ error: "newHash required" });
  }

  await db.read();
  db.data.config.hash = newHash.trim();
  await db.write();

  res.json({ success: true });
});

app.get("/admin/users", async (req, res) => {
  await db.read();
  res.json(db.data.users);
});

app.listen(PORT, () => {
  const currentHash = getHash();
  console.log(`🚀 Backend rodando em http://localhost:${PORT}`);
  console.log(`🔑 Hash: ${currentHash ?? "OFF"}`);
});
