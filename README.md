# Gztxx7Backend v1.1.0

Backend com sistema de **Hash Code** para proteger o login da sua aplicação/mod.

---

## 🔑 Como funciona o Hash Code

O hash é uma senha secreta que o seu cliente (mod/app) precisa mandar no corpo da requisição para o `/user/login/` funcionar.

### Onde definir o hash

**Opção 1 — pelo `db.json`** (mais fácil):
```json
{
  "config": {
    "hash": "SEU-HASH-AQUI"
  }
}
```

**Opção 2 — variável de ambiente** (mais seguro):
```
SERVER_HASH=SEU-HASH-AQUI node server.js
```
> A variável de ambiente tem prioridade sobre o `db.json`.

---

## 📡 Endpoints

### `GET /hash`
Retorna o hash atual configurado no servidor.
```json
{ "hash": "GZTXX7-2025-SECRET" }
```

### `POST /user/login/`
Requer o campo `hash` no body:
```json
{
  "deviceId": "abc123",
  "country": "BR",
  "hash": "GZTXX7-2025-SECRET"
}
```
Se o hash estiver errado → `401 { "error": "invalid hash" }`

### `POST /admin/set-hash`
Muda o hash sem precisar reiniciar o servidor:
```json
{ "newHash": "NOVO-HASH-2025" }
```

### `GET /auth?user=<username>`
Verifica se o usuário está banido / servidor em manutenção.

### `GET /config.json`
Retorna as configurações públicas (hash **não** é exposto).

### `GET /admin/users`
Lista todos os usuários cadastrados.

### `POST /admin/ban`
Bane ou desbane um usuário:
```json
{ "username": "Player_abc", "action": "ban" }
```

---

## 🚀 Como rodar

```bash
npm install
npm start
```

No terminal vai aparecer:
```
🚀 Gztxx7Backend rodando em http://localhost:3000
🔑 Hash Code: GZTXX7-2025-SECRET
```

---

## ⚙️ Sem hash (acesso livre)

Se quiser desativar a proteção de hash, remova o campo `hash` do `db.json` e não defina `SERVER_HASH`. O login vai aceitar qualquer requisição.
