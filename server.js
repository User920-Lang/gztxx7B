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
  // Prioridade: variável de ambiente > db.json > null
  return process.env.SERVER_HASH || db.data.config?.hash || null;
}

function validateHash(hash) {
  const serverHash = getHash();
  if (!serverHash) return true; // sem hash configurado = livre
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
  // Retorna config sem expor o hash
  const { hash, ...safeConfig } = db.data.config;
  res.json(safeConfig);
});

// ── GET /hash ─────────────────────────────────────────────────
// Mostra o hash atual (use só internamente / painel admin)
app.get("/hash", (req, res) => {
  const currentHash = getHash();
  if (!currentHash) {
    return res.json({ hash: null, message: "Nenhum hash configurado. Acesso livre." });
  }
  res.json({ hash: currentHash });
});

// ── GET /auth ─────────────────────────────────────────────────
app.get("/auth", (req, res) => {
  const username = (req.query.user || "").trim().toLowerCase();

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
// Body: { deviceId, country, hash }
// O campo "hash" deve bater com o hash do db.json ou SERVER_HASH
app.post("/user/login/", async (req, res) => {
  const { deviceId, country, hash } = req.body;

  if (!deviceId) {
    return res.status(400).json({ error: "deviceId required" });
  }

  // Validação do Hash Code
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
      username: "Player_" + nanoid(6),
      crowns: 0,
      gems: 0,
      trophys: 0,
      experience: 0,
      coins: 0,
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
    gems: user.gems,
    coins: user.coins,
    banned: false,
  });
});

// ── POST /admin/ban ───────────────────────────────────────────
app.post("/admin/ban", async (req, res) => {
  const { username, action } = req.body;

  if (!username || !["ban", "unban"].includes(action)) {
    return res.status(400).json({ error: "username and action (ban|unban) required" });
  }

  await db.read();

  const name = username.trim().toLowerCase();

  if (action === "ban") {
    const already = db.data.bans.some((b) => b.trim().toLowerCase() === name);
    if (!already) {
      db.data.bans.push(username.trim());
      await db.write();
    }
    return res.json({ success: true, action: "banned", username });
  }

  db.data.bans = db.data.bans.filter((b) => b.trim().toLowerCase() !== name);
  await db.write();
  return res.json({ success: true, action: "unbanned", username });
});

// ── POST /admin/set-hash ──────────────────────────────────────
// Muda o hash direto pelo db.json em tempo real
app.post("/admin/set-hash", async (req, res) => {
  const { newHash } = req.body;

  if (!newHash || typeof newHash !== "string" || newHash.trim() === "") {
    return res.status(400).json({ error: "newHash is required" });
  }

  await db.read();
  db.data.config.hash = newHash.trim();
  await db.write();

  res.json({ success: true, hash: db.data.config.hash });
});

// ── GET /admin/users ──────────────────────────────────────────
app.get("/admin/users", async (req, res) => {
  await db.read();
  res.json(db.data.users);
});

app.listen(PORT, () => {
  const currentHash = getHash();
  console.log(`\n🚀 Gztxx7Backend rodando em http://localhost:${PORT}`);
  console.log(`🔑 Hash Code: ${currentHash ?? "DESATIVADO (acesso livre)"}\n`);
});
