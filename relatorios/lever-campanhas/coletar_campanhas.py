#!/usr/bin/env python3
"""Coleta as campanhas do Lever (métricas, templates e nomes de fluxos) e grava o snapshot.

Uso: LEVER_TOKEN='<bearer da sessão>' python3 coletar_campanhas.py [saida.json]

- O token (JWT do app, expira em ~1h) vem só da variável de ambiente e nunca é gravado.
- A API do Lever limita as requisições: o script espera e tenta de novo quando recebe 429.
- As listas de telefones das campanhas NÃO são gravadas (dados pessoais).
Fontes: /chat/v1/campaign (lista), /chat/v1/campaign/{id}/summary (métricas),
        /chat/v2/template/{id} (texto do modelo), /chat/v1/chatbot/{key} (nome do fluxo).
"""
import json, os, subprocess, sys, time
from datetime import date

BASE = "https://api.app.leverconversas.com.br"
TOKEN = os.environ["LEVER_TOKEN"]
SAIDA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), f"campanhas_{date.today().isoformat()}.json")
STATUS = "&".join(f"statuses={s}" for s in ("DRAFT", "SUBMITTED", "PREPARING", "PROCESSING", "PAUSED", "COMPLETED", "CANCELED", "FAILED"))


def get(path):
    for _ in range(5):
        r = subprocess.run(["curl", "-sS", "-m", "90", BASE + path, "-H", "accept: application/json",
                            "-H", f"authorization: Bearer {TOKEN}", "-H", "origin: https://app.leverconversas.com.br",
                            "-H", "user-agent: Mozilla/5.0 Chrome/155.0.0.0"], capture_output=True, text=True)
        if not r.stdout.strip():
            return None
        d = json.loads(r.stdout)
        if isinstance(d, dict) and d.get("httpStatusCode") == "TOOMANYREQUESTS":
            time.sleep(25)
            continue
        time.sleep(0.3)
        return d
    sys.exit("Limite de requisições do Lever: tente de novo em alguns minutos.")


camps, pagina = [], 1
while True:
    d = get(f"/chat/v1/campaign?{STATUS}&page={pagina}&pageSize=50&orderByDesc=createdat")
    if d is None or "items" not in d:
        sys.exit(f"Falha ao listar campanhas (token expirado ou sem permissão): {str(d)[:200]}")
    camps += d["items"]
    if d.get("isLastPage") or not d["items"]:
        break
    pagina += 1

linhas = []
for c in camps:
    s = get(f"/chat/v1/campaign/{c['id']}/summary") or {}
    linhas.append(dict(id=c["id"], name=c["name"], status=c["status"], tipo=c["contentType"], criada=c["createdAt"][:10],
                       publico=s.get("publicCount"), env=s.get("sentMessageCount"), ent=s.get("deliveredMessageCount"),
                       lid=s.get("readMessageCount"), inter=s.get("startedInteractionCount"), obj=s.get("wonObjectiveCount"),
                       falhas=s.get("failedMessageCount"), invalidos=s.get("invalidWhatsAppNumberCount"),
                       tid=c.get("templateId"), chatbot=c.get("chatbotKey")))

templates = {}
for tid in sorted({l["tid"] for l in linhas if l["tid"]}):
    t = get(f"/chat/v2/template/{tid}") or {}
    if "text" in t:
        templates[tid] = dict(name=t.get("name"), text=t.get("text"), cat=t.get("categoryName"), media=t.get("fileType") or "texto")
fluxos = {}
for k in sorted({l["chatbot"] for l in linhas if l["chatbot"]}):
    b = get(f"/chat/v1/chatbot/{k}") or {}
    if "name" in b:
        fluxos[k] = b["name"]

json.dump(dict(coletado_em=date.today().isoformat(), fonte="Lever API /chat/v1/campaign + /summary + /chat/v2/template + /chat/v1/chatbot",
               campanhas=linhas, templates=templates, fluxos=fluxos), open(SAIDA, "w"), ensure_ascii=False, indent=1)
print("OK", SAIDA, len(linhas), "campanhas,", len(templates), "templates,", len(fluxos), "fluxos")
