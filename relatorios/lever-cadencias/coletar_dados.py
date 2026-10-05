#!/usr/bin/env python3
"""Coleta sequências, passos, templates e estatísticas na API do Lever e grava o snapshot.

Uso: LEVER_TOKEN='<bearer>' python3 coletar_dados.py [saida.json]
O token (JWT do app, expira em ~1h) vem só da variável de ambiente; nunca é gravado.
"""
import json, os, re, subprocess, sys
from datetime import date

BASE = "https://api.app.leverconversas.com.br/chat/v1/sequence"
TOKEN = os.environ["LEVER_TOKEN"]
SAIDA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), f"dados_{date.today().isoformat()}.json")


def get(url):
    r = subprocess.run(["curl", "-sS", "-m", "90", "-w", "\n%{http_code}", url, "-H", "accept: application/json",
                        "-H", f"authorization: Bearer {TOKEN}", "-H", "origin: https://app.leverconversas.com.br",
                        "-H", "referer: https://app.leverconversas.com.br/", "-H", "user-agent: Mozilla/5.0 Chrome/153.0.0.0"],
                       capture_output=True, text=True)
    corpo, _, status = r.stdout.rpartition("\n")
    if status != "200":
        sys.exit(f"HTTP {status} em {url.split('?')[0]}: {corpo[:200]}")
    return json.loads(corpo)


def num(n):
    m = re.search(r"(\d{4})", n)
    return m.group(1) if m else "—"


def etapa(n):
    l = n.lower()
    for chave, nome in (("evento", "Eventos"), ("leads frios", "Leads frios"), ("faltou", "Faltou AV"), ("negocia", "Negociação"),
                        ("pré av", "Pré AV"), ("pre av", "Pré AV"), ("pre agendados", "Pré AV"), ("agendados", "Pré AV"),
                        ("sem resposta", "Sem resposta"), ("falhou", "Falhou")):
        if chave in l:
            return nome
    return "Outros"


def origem(n):
    l = n.lower()
    return "Reativação" if "reativ" in l else "Social Selling" if ("social selling" in l or "evento" in l) else "Serviços Avulsos" if "avulsos" in l else "SDR"


lista = get(f"{BASE}?page=1&pageSize=100&orderBy=name&includeDetails=ContentStepCount,ContactExecutingCount,ExecutionStats&name=")
sequencias, passos = [], []
for s in lista["items"]:
    d = get(f"{BASE}/{s['id']}?includeDetails=Steps,StepsExecutionStats,StepsTemplates,ExecutionStats")
    sequencias.append(dict(name=s["name"], steps=len(d["steps"] or []), executing=s["contactExecutingCount"],
                           stats=s["stats"], updated=s["updatedAt"][:10]))
    for st in sorted(d["steps"] or [], key=lambda z: z["position"]):
        t, e = st["template"] or {}, st["stats"]
        passos.append(dict(seq=s["name"], stage=etapa(s["name"]), origem=origem(s["name"]), num=num(s["name"]), pos=st["position"],
                           off=[st["schedule"]["offsetValue"], st["schedule"]["offsetUnit"]],
                           ex=e["executionCount"], rd=e["executionReadCount"], it=e["executionInteractionCount"],
                           cat=t.get("categoryName") or "s/ cat.", media=t.get("fileType") or "texto", tname=t.get("name"),
                           text=t.get("text") or "", created=st["createdAt"], updated=st["updatedAt"]))
json.dump(dict(coletado_em=date.today().isoformat(),
               fonte="Lever API /chat/v1/sequence (includeDetails=Steps,StepsExecutionStats,StepsTemplates,ExecutionStats)",
               sequencias=sequencias, passos=passos), open(SAIDA, "w"), ensure_ascii=False, indent=1)
print("OK", SAIDA, len(sequencias), "sequências,", len(passos), "passos")
