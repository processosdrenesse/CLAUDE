#!/usr/bin/env python3
"""Gera o PDF de análise de engajamento das cadências (sequências) do Lever.

Uso: python3 gerar_relatorio.py [dados.json] [saida.pdf]
Requer: reportlab, matplotlib.
"""
import json, os, re, sys
from collections import defaultdict

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (Image, KeepTogether, PageBreak, Paragraph,
                                SimpleDocTemplate, Spacer, Table, TableStyle)

AQUI = os.path.dirname(os.path.abspath(__file__))
DADOS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, "dados_2026-09-30.json")
SAIDA = sys.argv[2] if len(sys.argv) > 2 else os.path.join(AQUI, "Analise_Cadencias_Lever_2026-09-30.pdf")
TMP = os.path.join(AQUI, ".graficos")
os.makedirs(TMP, exist_ok=True)

FD = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("DV", FD + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DV-B", FD + "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFontFamily("DV", normal="DV", bold="DV-B", italic="DV", boldItalic="DV-B")

# ---------------------------------------------------------------- paleta
INK, MUTED, GRID = "#1f2937", "#6b7280", "#e5e7eb"
OK, WARN, CRIT = "#2f6fb0", "#d98a00", "#c0392b"
BG_OK, BG_BAD, BG_HEAD = colors.HexColor("#e3f0e6"), colors.HexColor("#fbe3df"), colors.HexColor("#1f2937")

# ---------------------------------------------------------------- dados
snap = json.load(open(DADOS, encoding="utf-8"))
SEQS, PASSOS = snap["sequencias"], snap["passos"]
seq_by_name = defaultdict(list)
for s in SEQS:
    seq_by_name[s["name"]].append(s)


def pct(x, d=1):
    return f"{x * 100:.{d}f}%".replace(".", ",")


def milhar(n):
    return f"{n:,}".replace(",", ".")


def limpa(t):
    """Remove emojis/símbolos que a fonte do PDF não desenha."""
    t = re.sub(r"[\U00010000-\U0010ffff☀-➿️‍⬀-⯿]", "", t or "")
    return re.sub(r"[ \t]+", " ", t).strip()


def esc(t):
    return limpa(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def rate(a, b):
    return a / b if b else 0.0


tot_ex = sum(p["ex"] for p in PASSOS)
tot_rd = sum(p["rd"] for p in PASSOS)
tot_it = sum(p["it"] for p in PASSOS)

ativas = sorted([s for s in SEQS if s["stats"] and s["stats"]["executionCount"] > 0],
                key=lambda s: -s["stats"]["executionCount"])
passos_seq = defaultdict(list)
for p in PASSOS:
    passos_seq[p["seq"]].append(p)
for v in passos_seq.values():
    v.sort(key=lambda p: p["pos"])


def soma_atual(nome):
    ps = passos_seq[nome]
    return sum(p["ex"] for p in ps), sum(p["rd"] for p in ps), sum(p["it"] for p in ps)


# classificação de prioridade (critério explícito, veja "Como ler")
PRIORIDADE = {
    "Leads frios| SDR 7853": "crit",
    "Cadência Eventos- Social Selling- 7853": "crit",
    "Sem resposta | SDR 1727": "crit",
    "Sem resposta | SDR 7853": "ajust",
    "Negociação| SDR 7853": "ajust",
    "Faltou AV| SDR 7853": "ajust",
    "Negociação| SDR 1727": "ajust",
    "Faltou AV| SDR 1727": "ajust",
    "Sem resposta | SDR 6554": "ajust",
}
COR = {"crit": CRIT, "ajust": WARN, "ok": OK}
ROT = {"crit": "Mudar já", "ajust": "Ajustar passos", "ok": "Manter"}

# ---------------------------------------------------------------- gráficos
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 8, "axes.edgecolor": GRID,
                     "axes.labelcolor": MUTED, "xtick.color": MUTED, "ytick.color": INK})


def grafico_sequencias():
    linhas = [s for s in ativas if s["stats"]["executionCount"] >= 100][::-1]
    fig, ax = plt.subplots(figsize=(7.4, 0.36 * len(linhas) + 0.9))
    for i, s in enumerate(linhas):
        v = s["stats"]["executionInteractionRate"] * 100
        cor = COR[PRIORIDADE.get(s["name"], "ok")]
        ax.barh(i, v, color=cor, height=0.62)
        ax.text(v + 0.6, i, f"{v:.1f}%".replace(".", ",") + f"   ({milhar(s['stats']['executionCount'])} envios)",
                va="center", fontsize=7, color=INK)
    ax.set_yticks(range(len(linhas)))
    ax.set_yticklabels([s["name"].replace("  ", " ") for s in linhas], fontsize=7)
    ax.set_xlim(0, 80)
    ax.set_xlabel("Taxa de interação (% dos envios que geraram resposta/interação do lead)")
    ax.xaxis.grid(True, color=GRID, lw=0.6)
    ax.set_axisbelow(True)
    for sp in ("top", "right"):
        ax.spines[sp].set_visible(False)
    ax.axvline(tot_it / tot_ex * 100, color=MUTED, ls="--", lw=0.8)
    ax.text(tot_it / tot_ex * 100 + 0.4, len(linhas) - 0.35, f"média geral {pct(tot_it / tot_ex)}", fontsize=6.5, color=MUTED)
    from matplotlib.patches import Patch
    ax.legend(handles=[Patch(color=CRIT, label="Mudar já"), Patch(color=WARN, label="Ajustar passos"),
                       Patch(color=OK, label="Manter")], loc="lower right", frameon=False, fontsize=7)
    fig.tight_layout()
    f = os.path.join(TMP, "g1.png")
    fig.savefig(f, dpi=200)
    plt.close(fig)
    return f


def grafico_passos():
    alvo = ["Sem resposta | SDR 7853", "Leads frios| SDR 7853", "Faltou AV| SDR 7853",
            "Negociação| SDR 7853", "Cadência Eventos- Social Selling- 7853", "Sem resposta / REATIV 7853"]
    fig, axs = plt.subplots(2, 3, figsize=(7.4, 4.4), sharey=True)
    for ax, nome in zip(axs.flat, alvo):
        ps = [p for p in passos_seq[nome] if p["ex"] > 0]
        vals = [rate(p["it"], p["ex"]) * 100 for p in ps]
        xs = [str(p["pos"]) for p in ps]
        cs = [OK if v >= 10 else (WARN if v >= 6 else CRIT) for v in vals]
        ax.bar(xs, vals, color=cs, width=0.65)
        for x, v in zip(xs, vals):
            ax.text(x, v + 0.5, f"{v:.1f}".replace(".", ","), ha="center", fontsize=6.5, color=INK)
        ax.set_title(nome.replace("Cadência Eventos- Social Selling- 7853", "Eventos / Social Selling 7853"),
                     fontsize=7.5, color=INK, loc="left")
        ax.set_ylim(0, 27)
        ax.yaxis.grid(True, color=GRID, lw=0.6)
        ax.set_axisbelow(True)
        for sp in ("top", "right"):
            ax.spines[sp].set_visible(False)
        ax.tick_params(labelsize=7)
    for ax in axs[:, 0]:
        ax.set_ylabel("% interação", fontsize=7)
    fig.text(0.5, 0.005, "Número do passo dentro da cadência   (azul ≥10%  ·  âmbar 6–10%  ·  vermelho <6%)",
             ha="center", fontsize=7, color=MUTED)
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    f = os.path.join(TMP, "g2.png")
    fig.savefig(f, dpi=200)
    plt.close(fig)
    return f


def grafico_ranking():
    base = [p for p in PASSOS if p["ex"] >= 60]
    base.sort(key=lambda p: rate(p["it"], p["ex"]))
    piores, melhores = base[:9], base[::-1][:9][::-1]
    fig, axs = plt.subplots(2, 1, figsize=(7.4, 5.4))
    for ax, grupo, cor, tit in ((axs[0], melhores, OK, "9 mensagens com MAIS retorno"),
                                (axs[1], piores, CRIT, "9 mensagens com MENOS retorno")):
        for i, p in enumerate(grupo):
            v = rate(p["it"], p["ex"]) * 100
            ax.barh(i, v, color=cor, height=0.6)
            ax.text(v + 0.5, i, f"{v:.1f}%".replace(".", ",") + f" (n={p['ex']})", va="center", fontsize=6.3, color=INK)
        ax.set_yticks(range(len(grupo)))
        ax.set_yticklabels([limpa(f"{p['tname']}")[:44] for p in grupo], fontsize=6.5)
        ax.set_xlim(0, max(rate(p["it"], p["ex"]) * 100 for p in grupo) * 1.6 + 2)
        ax.set_title(tit, fontsize=8, loc="left", color=INK)
        for sp in ("top", "right"):
            ax.spines[sp].set_visible(False)
        ax.xaxis.grid(True, color=GRID, lw=0.6)
        ax.set_axisbelow(True)
    fig.tight_layout()
    f = os.path.join(TMP, "g3.png")
    fig.savefig(f, dpi=200)
    plt.close(fig)
    return f


# ---------------------------------------------------------------- estilos
def st(nome, **kw):
    base = dict(fontName="DV", fontSize=8.6, leading=12, textColor=colors.HexColor(INK), alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(nome, **base)


S_T = st("t", fontName="DV-B", fontSize=20, leading=25, spaceAfter=4)
S_H1 = st("h1", fontName="DV-B", fontSize=13.5, leading=17, spaceBefore=10, spaceAfter=6, textColor=colors.HexColor("#111827"))
S_H2 = st("h2", fontName="DV-B", fontSize=10, leading=13, spaceBefore=9, spaceAfter=3)
S_P = st("p", spaceAfter=4)
S_SM = st("sm", fontSize=7.4, leading=10, textColor=colors.HexColor(MUTED))
S_CELL = st("c", fontSize=7, leading=8.8)
S_CELLB = st("cb", fontSize=7, leading=8.8, fontName="DV-B")
S_HEAD = st("hd", fontSize=7, leading=8.8, fontName="DV-B", textColor=colors.white)
S_BUL = st("bul", leftIndent=10, bulletIndent=0, spaceAfter=2.5)


def P(t, s=S_P):
    return Paragraph(t, s)


def bullets(itens):
    return [Paragraph(i, S_BUL, bulletText="•") for i in itens]


def tabela(dados, larguras, extra=None, cabecalho=True):
    t = Table(dados, colWidths=larguras, repeatRows=1 if cabecalho else 0)
    est = [("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d1d5db")),
           ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
           ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3)]
    if cabecalho:
        est.append(("BACKGROUND", (0, 0), (-1, 0), BG_HEAD))
    t.setStyle(TableStyle(est + (extra or [])))
    return t


def tabela_passos(nome):
    ps = passos_seq[nome]
    linhas = [[P(h, S_HEAD) for h in ("#", "Atraso", "Mensagem (modelo)", "Tipo", "Envios", "Lida", "Interação", "Resp./lida")]]
    elegiveis = [p for p in ps if p["ex"] >= 30]
    melhor = max(elegiveis, key=lambda p: rate(p["it"], p["ex"]), default=None) if len(elegiveis) > 1 else None
    pior = min(elegiveis, key=lambda p: rate(p["it"], p["ex"]), default=None) if len(elegiveis) > 1 else None
    extra = []
    for i, p in enumerate(ps, start=1):
        off = p["off"]
        atraso = "início" if not off[0] else f"+{off[0]}{ {'DAYS': 'd', 'HOURS': 'h', 'MINUTES': 'min'}.get(off[1], '') }"
        tipo = {"MARKETING": "Marketing", "UTILITY": "Utilidade"}.get(p["cat"], "—")
        if p["media"] != "texto":
            tipo += " + " + {"IMAGE": "imagem", "VIDEO": "vídeo", "DOCUMENT": "doc."}.get(p["media"], p["media"])
        sem = p["ex"] == 0
        linhas.append([P(str(p["pos"]), S_CELL), P(atraso, S_CELL), P(esc(p["tname"]), S_CELL), P(tipo, S_CELL),
                       P(milhar(p["ex"]), S_CELL),
                       P("—" if sem else pct(rate(p["rd"], p["ex"]), 0), S_CELL),
                       P("sem envios" if sem else pct(rate(p["it"], p["ex"])), S_CELLB),
                       P("—" if sem else pct(rate(p["it"], p["rd"]), 0), S_CELL)])
        if melhor is p:
            extra.append(("BACKGROUND", (0, i), (-1, i), BG_OK))
        if pior is p and rate(p["it"], p["ex"]) < 0.10:
            extra.append(("BACKGROUND", (0, i), (-1, i), BG_BAD))
    return tabela(linhas, [0.6 * cm, 1.3 * cm, 6.3 * cm, 2.6 * cm, 1.4 * cm, 1.2 * cm, 1.9 * cm, 1.7 * cm], extra)


def bloco_seq(nome, comentario, n_passos_extra=None):
    s = seq_by_name[nome][0]
    a, b = s["stats"], soma_atual(nome)
    prio = PRIORIDADE.get(nome, "ok")
    cab = P(f"<font color='{COR[prio]}'>■</font> {esc(nome)} "
            f"<font size='7.5' color='{MUTED}'>— {ROT[prio]} · histórico: {milhar(a['executionCount'])} envios, "
            f"lida {pct(a['executionReadRate'], 0)}, interação {pct(a['executionInteractionRate'])}</font>", S_H2)
    corpo = [cab, tabela_passos(nome), Spacer(1, 3), P(comentario), Spacer(1, 3)]
    return KeepTogether(corpo)


# ---------------------------------------------------------------- comentários por sequência
COM = {
"Sem resposta | SDR 7853": (
    "<b>Melhor:</b> passo 1, a pergunta curta \"o que te incomoda hoje?\" (36 caracteres): 13,2% de interação e 84% de leitura. "
    "<b>Menos retorno:</b> a partir do passo 2 a interação cai para 8,2%, 6,8% e 7,5% e a leitura cai de 84% para 64%. "
    "O passo 3 (educativo: drenagem + Stimullus Sculp) é o mais fraco e o passo 4 (utilidade, \"atendimento segue em aberto\") "
    "tem a pior leitura. É a cadência de maior volume: cada ponto percentual a mais no passo 3 vale ~50 respostas por ciclo."),
"Leads frios| SDR 7853": (
    "<b>Todos os passos ficam entre 3,4% e 5,2%</b> e a leitura é a mais baixa dos números principais (48–60%). "
    "O melhor é o passo 3, a pergunta binária de utilidade (\"prefere que a equipe siga por aqui ou por ligação?\": 5,2%, o maior retorno por mensagem lida, 11%). "
    "Passo 1 (pergunta com 3 opções: sim / às vezes / não é prioridade) faz 3,4% e o passo 2 (estatística \"60% têm a mesma queixa\") 4,0%. "
    "Nenhuma mensagem traz oferta, prazo ou vaga, exatamente o que faz a Reativação render 17–20%. "
    "Obs.: o histórico da sequência (19,9 mil) é maior que a soma dos passos atuais (11,7 mil) porque passos antigos foram substituídos."),
"Sem resposta / REATIV 7853": (
    "<b>É a melhor cadência de captura:</b> 16,9% e 20,2% de interação com Spa Face gratuito, prazo (\"hoje e amanhã\"), vagas limitadas "
    "e pergunta de escolha (\"qual horário você prefere?\"). A leitura (61–66%) é menor que a do SDR, mas quem lê responde: 26% e 33% das mensagens lidas."),
"Faltou AV| SDR 7853": (
    "<b>Melhor:</b> passos 1 e 2, ambos categoria Utilidade (15,4% e 14,0%). <b>Menos retorno:</b> passo 3 (Marketing, \"empurrãozinho pra remarcar\"): 6,7%. "
    "O passo 4, com presente/sorteio de Spa Face, recupera para 12,6% mesmo com leitura de 68%."),
"Pré AV SDR 7853": (
    "<b>Melhor sequência do Lever (34%).</b> Lembretes curtos de Utilidade dominam: passo 5 (\"passando para lembrar que sua sessão está agendada\"): 50,7% (n=67) "
    "e passo 1 (\"sua sessão está confirmada\"): 33,2% (n=521). Vídeo do passo 4 e imagem do passo 6 também passam de 20%. Nenhum passo exige mudança."),
"Negociação| SDR 7853": (
    "<b>Melhor:</b> passo 1, pergunta aberta logo após a visita à clínica (\"o que aconteceu? o que faltou para começarmos?\"): 22,5%. "
    "<b>Menos retorno:</b> passos 2 e 3 (6,8% e 6,6%) repetem a pergunta de forma mais genérica (\"o que está te impedindo / o que falta hoje\") sem oferta, condição ou prazo."),
"Cadência Eventos- Social Selling- 7853": (
    "<b>Atenção:</b> os passos 1 e 2 (abertura com o Glow Up Premium e \"5 vagas\") não têm nenhum envio registrado; as 8 mensagens seguintes somam exatamente os 696 envios da sequência. "
    "Vale conferir no Lever se esses dois passos realmente disparam. Entre os que têm dados, <b>melhor:</b> passo 3 (vaga sem compromisso, 10,6%) e passo 6 (áudio, 9,3%). "
    "<b>Menos retorno:</b> passo 8 (\"posso te fazer uma pergunta?\", 2,2%), passo 9 (\"encerrando a lista\", 3,3%) e passos 4–5 (4,3% e 4,4%). "
    "A leitura cai de 63% para 46% ao longo dos passos: são 8 mensagens em 8 dias seguidos, o que cansa o contato."),
"Faltou AV| SDR 1727": (
    "<b>Melhor:</b> passo 1 (19,2%). A interação oscila entre 8% e 10% nos passos 2–4, e a leitura despenca para 32% no passo 4. "
    "A interação geral (12,3%) é igual à do 7853, mas com leitura de 52% contra 74%: o número 1727 é lido bem menos, então há mensagens boas sendo desperdiçadas."),
"Sem resposta | SDR 1727": (
    "<b>Problema de entrega, não só de texto:</b> leitura de 38% (contra 75% no 7853). O passo 2 fez 0 respostas em 50 envios e o passo 5 (Spa Face gratuito) 2,8% com leitura de 29%, "
    "enquanto o mesmo texto/tema no 7853 e na Reativação passa de 8%. Melhor passo: 4 (\"se cuidar ainda é prioridade?\", 11,9%)."),
"Negociação| SDR 1727": (
    "<b>Melhor:</b> passo 1 (21,7%). A leitura cai a cada passo (57% → 47% → 36%) e a interação do passo 3 (6,2%) acompanha a queda."),
"Pré AV SDR 1727": (
    "<b>Melhor:</b> passo 1 (28,6%). <b>Menos retorno:</b> passo 3, imagem com depoimento (\"essa cliente chegou sem saber…\"): 7,3%. Amostra pequena (55 envios)."),
"Agendados / REATIV 7853": (
    "<b>Maior retorno de todas as mensagens</b>: 58,9% (n=168). Confirmação de horário na categoria Utilidade, com orientação prática (beber água). Manter."),
"Falhou / REATIV 7853": (
    "31,7% (n=60) com mensagem de Utilidade tratando o não comparecimento. Manter."),
}

# ---------------------------------------------------------------- montagem
def montar():
    g1, g2, g3 = grafico_sequencias(), grafico_passos(), grafico_ranking()
    F = []
    # ---- capa / resumo
    F += [P("Análise de engajamento das cadências do Lever", S_T),
          P("Drenesse · dados acumulados coletados em 30/09/2026 · 44 sequências cadastradas, 25 com envios", S_SM), Spacer(1, 6)]
    F += [P("Resumo executivo", S_H1)]
    resumo = [
        f"<b>{milhar(tot_ex)} mensagens</b> enviadas pelos passos atuais das cadências: {pct(rate(tot_rd, tot_ex), 0)} lidas e "
        f"<b>{pct(rate(tot_it, tot_ex))} geraram resposta/interação</b> ({milhar(tot_it)}).",
        "<b>O que mais rende:</b> lembretes curtos de confirmação de sessão (Pré AV 34%, Agendados 59%), mensagens de <b>oferta concreta com prazo e escolha de horário</b> "
        "(Reativação com Spa Face gratuito, 17–20%) e a <b>pergunta aberta curta</b> no primeiro contato (\"o que te incomoda hoje?\", 13%; \"o que aconteceu?\" na Negociação, 22%).",
        "<b>O que menos rende:</b> mensagens educativas/genéricas e passos finais das cadências. A interação cai a cada passo (11,5% no 1º, 9,3% no 2º, 6,2% no 3º nas cadências do SDR 7853) "
        "e a leitura cai junto (73% → 64%).",
        "<b>Cadências para mudar já:</b> Leads frios SDR 7853 (3,4%, a maior perda de volume), Cadência Eventos Social Selling (6,0%, 10 passos) e Sem resposta SDR 1727 (7,7%, leitura de 38%). "
        "Lista completa e o que fazer em cada uma na <b>última seção</b>.",
    ]
    F += bullets(resumo)
    F += [Spacer(1, 4), P("Como ler os números", S_H2)]
    F += bullets([
        "<b>Envios</b>: mensagens enviadas pelo passo. <b>Lida</b>: % dos envios lidos. <b>Interação</b>: % dos envios que geraram resposta/interação do lead (métrica principal). "
        "<b>Resp./lida</b>: interação ÷ lidas, mede a qualidade do texto separada da entrega.",
        "Os percentuais por passo vêm das estatísticas de cada passo no Lever e valem para o modelo (template) atualmente configurado; "
        "os totais da sequência incluem também passos antigos já trocados, por isso podem diferir da soma dos passos.",
        "O número no fim do nome (7853, 1727, 6554…) foi tratado como o número/canal de envio. Amostras com menos de ~60 envios são indicativas, não conclusivas.",
        "Linha verde na tabela = melhor passo da cadência; linha vermelha = pior, só quando ficou abaixo de 10% (passos com 30+ envios).",
        "Critério de prioridade: <b>Mudar já</b> = interação abaixo de ~7% com volume relevante em quase todos os passos; "
        "<b>Ajustar</b> = cadência boa no início, mas com passos específicos abaixo de ~7% ou leitura em queda.",
    ])
    F += [PageBreak(), KeepTogether([P("1. Panorama: quais sequências têm mais engajamento", S_H1),
          P("Ranking das sequências com 100+ envios pela taxa de interação. Volume e taxa precisam ser lidos juntos: "
            "Leads frios e Sem resposta do 7853 concentram 75% dos envios, então pequenas diferenças de taxa pesam muito."),
          Image(g1, width=15.5 * cm, height=15.5 * cm * (0.36 * len([s for s in ativas if s['stats']['executionCount'] >= 100]) + 0.9) / 7.4)])]

    linhas = [[P(h, S_HEAD) for h in ("Sequência", "Envios (hist.)", "Lida", "Interação", "Resp./lida", "Situação")]]
    extra = []
    for i, s in enumerate([x for x in ativas if x["stats"]["executionCount"] >= 60], start=1):
        a = s["stats"]
        pr = PRIORIDADE.get(s["name"], "ok")
        small = a["executionCount"] < 60
        linhas.append([P(esc(s["name"]), S_CELL), P(milhar(a["executionCount"]), S_CELL), P(pct(a["executionReadRate"], 0), S_CELL),
                       P(pct(a["executionInteractionRate"]), S_CELLB),
                       P(pct(rate(a["executionInteractionCount"], a["executionReadCount"]), 0), S_CELL),
                       P(("amostra pequena" if small else ROT[pr]), S_CELL)])
        if pr == "crit":
            extra.append(("BACKGROUND", (0, i), (-1, i), BG_BAD))
    F += [P("Sequências com 60+ envios (as demais estão na tabela de amostras pequenas, na seção 2)", S_H2), tabela(linhas, [7.2 * cm, 2.2 * cm, 1.5 * cm, 2 * cm, 2 * cm, 3 * cm], extra)]
    F += [Spacer(1, 3), P("Sequências cadastradas sem nenhum envio (19): ver seção de limpeza no final.", S_SM)]

    # ---- por sequência
    F += [PageBreak(), P("2. Dentro de cada sequência: qual mensagem rende mais e qual rende menos", S_H1),
          P("O gráfico mostra a taxa de interação passo a passo nas seis cadências de maior volume. "
            "O padrão é claro: o 1º passo é o mais forte e há queda nos seguintes. A exceção é a Reativação, que mantém 17–20% nos dois passos porque ambos trazem oferta.")]
    F += [Image(g2, width=17.4 * cm, height=17.4 * cm * 4.4 / 7.4)]
    F += [Spacer(1, 4)]
    ordem = ["Sem resposta | SDR 7853", "Leads frios| SDR 7853", "Sem resposta / REATIV 7853", "Faltou AV| SDR 7853",
             "Pré AV SDR 7853", "Negociação| SDR 7853", "Cadência Eventos- Social Selling- 7853",
             "Sem resposta | SDR 1727", "Faltou AV| SDR 1727", "Negociação| SDR 1727", "Pré AV SDR 1727",
             "Agendados / REATIV 7853", "Falhou / REATIV 7853"]
    for nome in ordem:
        F.append(bloco_seq(nome, COM[nome]))

    # sequências pequenas
    F += [P("Sequências com volume pequeno (menos de 130 envios)", S_H2),
          P("Resultados por passo (interação % · envios entre parênteses). Com amostras tão pequenas, leia como tendência.", S_SM)]
    pequenas = [s for s in ativas if s["name"] not in ordem]
    linhas = [[P(h, S_HEAD) for h in ("Sequência", "Envios", "Interação geral", "Interação por passo (envios)")]]
    for s in pequenas:
        ps = passos_seq[s["name"]]
        por = " · ".join(f"#{p['pos']}: {pct(rate(p['it'], p['ex']), 0)} ({p['ex']})" for p in ps)
        linhas.append([P(esc(s["name"]), S_CELL), P(str(s["stats"]["executionCount"]), S_CELL),
                       P(pct(s["stats"]["executionInteractionRate"]), S_CELLB), P(por, S_CELL)])
    F += [tabela(linhas, [5.6 * cm, 1.4 * cm, 2.3 * cm, 8.6 * cm])]

    # ---- ranking + padrões
    F += [PageBreak(), P("3. Ranking de mensagens e o que os dados ensinam", S_H1),
          P("Considerando somente passos com 60+ envios.")]
    F += [Image(g3, width=12.6 * cm, height=12.6 * cm * 5.4 / 7.4), Spacer(1, 4)]
    # números agregados
    def agg(f):
        ex = sum(p["ex"] for p in PASSOS if f(p)); it = sum(p["it"] for p in PASSOS if f(p)); rd = sum(p["rd"] for p in PASSOS if f(p))
        return ex, rate(rd, ex), rate(it, ex)
    cats = [("Utilidade (UTILITY)", lambda p: p["cat"] == "UTILITY"), ("Marketing", lambda p: p["cat"] == "MARKETING"),
            ("Só texto", lambda p: p["media"] == "texto"), ("Com imagem/vídeo/doc.", lambda p: p["media"] != "texto")]
    linhas = [[P(h, S_HEAD) for h in ("Recorte", "Envios", "Lida", "Interação")]]
    for nome, f in cats:
        ex, rd, it = agg(f)
        linhas.append([P(nome, S_CELL), P(milhar(ex), S_CELL), P(pct(rd, 0), S_CELL), P(pct(it), S_CELLB)])
    F += [P("Categoria e formato (todas as cadências)", S_H2), tabela(linhas, [6 * cm, 3 * cm, 3 * cm, 3 * cm])]
    F += [Spacer(1, 4), P("O que está dando mais retorno", S_H2)]
    F += bullets([
        "<b>Oferta concreta + prazo + escolha de horário</b> (Reativação: 16,9% e 20,2%; Faltou AV 7853 passo 4 com sorteio de Spa Face: 12,6%).",
        "<b>Mensagens de Utilidade sobre a sessão do próprio lead</b> (confirmação, lembrete, atendimento não realizado): 12–59%. "
        "Em Faltou AV 7853 os passos de Utilidade (15% e 14%) superam o passo de Marketing (6,7%).",
        "<b>Pergunta aberta curta e pessoal</b> no início: \"o que te incomoda hoje?\" (13,2%), \"o que aconteceu?\" após a avaliação (22,5%).",
        "<b>Mídia</b> (vídeo, imagem) tem interação média maior (~18%) que texto puro (9,7%), mas com base muito pequena (280 envios); vale testar em mais cadências.",
    ])
    F += [P("O que está dando menos retorno", S_H2)]
    F += bullets([
        "<b>Mensagens educativas ou de estatística sem chamada para ação clara</b> (\"60% têm a mesma queixa\": 4,0%; \"drenagem + Stimullus\": 6,8%).",
        "<b>Perguntas genéricas repetidas</b> (\"o que falta para dar o próximo passo?\" 6,6%; \"posso te fazer uma pergunta?\" 2,2%).",
        "<b>Mensagens de fechamento/pressão no fim da cadência</b> (\"estou encerrando a lista\": 3,3%; \"vou encerrar seu atendimento\": 5,5%).",
        "<b>Passos tardios</b>: a interação média cai de 11,5% (1º passo) para 6,2% (3º) e a leitura de 73% para 64%. Cadências longas diárias (Eventos: 8 dias seguidos) perdem leitura.",
        "<b>Número 1727</b>: mesmas mensagens rendem menos por leitura baixa (38% no Sem resposta vs 75% no 7853). Ex.: passo 2 do Sem resposta = 8,2% no 7853 e 0% no 1727.",
    ])
    F += [Spacer(1, 3), P("Ressalva: categoria, etapa do funil e número de envio estão misturados nos dados (por exemplo, Utilidade concentra Pré AV, que naturalmente engaja mais). "
                          "As comparações acima foram feitas preferencialmente dentro da mesma cadência; para confirmar, o ideal é testar A/B.", S_SM)]

    # ---- final: cadências a mudar
    F += [PageBreak(), P("4. Cadências que devem ser mudadas", S_H1),
          P("Ordenadas por impacto (volume × distância do que já funciona nas suas melhores cadências).")]
    leads_ex, _, leads_it = soma_atual("Leads frios| SDR 7853")[0], 0, soma_atual("Leads frios| SDR 7853")[2]
    ganho = round(leads_ex * 0.075 - leads_it)
    F += [P("Mudar já", S_H2)]
    itens = [
        ("1. Leads frios| SDR 7853",
         f"3,4% de interação (histórico 19,9 mil envios); passos atuais: 4,2% em {milhar(leads_ex)} envios; leitura 55%. Passos: 3,4% / 4,0% / 5,2%.",
         "Reescrever os 3 passos. Levar para os passos 1–2 o modelo da Reativação: oferta concreta (ex.: Spa Face gratuito), prazo curto e pergunta de escolha. "
         "Exemplo: <i>\"Oi, [NOME]! Reservei um Spa Face gratuito para você esta semana, só hoje e amanhã. Qual horário fica melhor, manhã ou tarde?\"</i> "
         "Testar a pergunta binária (\"por aqui ou por ligação?\") como 1º passo, pois é a que mais converte lida em resposta. "
         f"Cenário ilustrativo: chegar a 7,5% nesses envios traria ~{ganho} respostas a mais por ciclo."),
        ("2. Cadência Eventos- Social Selling- 7853",
         "6,0% de interação, leitura 55%, 10 passos. Passos 8 e 9: 2,2% e 3,3%; passos 4 e 5: 4,3% e 4,4%. Passos 1 e 2 sem envios registrados.",
         "Enxugar de 10 para 5–6 passos e espaçar (hoje 8 dias seguidos). Remover os passos 8 (pergunta genérica) e 9 (pressão de encerramento) e reescrever 4–5 com oferta específica. "
         "Manter o passo 3 (10,6%) e o 6 (áudio, 9,3%) como base. Conferir no Lever por que os passos 1–2 (oferta Glow Up Premium) não registram envio."),
        ("3. Sem resposta | SDR 1727",
         "7,7% de interação com leitura de 38%. Passo 2: 0% (0/50); passo 5: 2,8% (leitura 29%).",
         "Primeiro investigar a entrega do número 1727 (qualidade/limite de envio, horário, base de contatos), pois a leitura é metade da do 7853. "
         "Depois reescrever os passos 2 e 5: trocar por versões com oferta e prazo (modelo Reativação) e reaproveitar o passo 4 (11,9%)."),
    ]
    for tit, dados, acao in itens:
        F.append(KeepTogether([P(f"<b>{tit}</b>", S_P), P(f"<b>Dados:</b> {dados}", S_P), P(f"<b>O que mudar:</b> {acao}", S_P), Spacer(1, 4)]))
    F += [P("Ajustar passos específicos", S_H2)]
    linhas = [[P(h, S_HEAD) for h in ("Cadência", "Passo(s) fraco(s)", "Sugestão")]]
    ajustes = [
        ("Sem resposta | SDR 7853 (maior volume, 8,6%)", "#3 educativo (6,8%), #2 (8,2%), #4 (7,5%, leitura 64%)",
         "Trocar o passo 3 por oferta com prazo (modelo Reativação); manter o passo 1 como está (13,2%). Testar o passo 4 em Marketing com oferta em vez de \"atendimento em aberto\"."),
        ("Negociação| SDR 7853", "#2 (6,8%) e #3 (6,6%)",
         "Trocar as perguntas genéricas por condição especial de fechamento + prazo; manter o passo 1 (22,5%)."),
        ("Negociação| SDR 1727", "#3 (6,2%, leitura 36%)", "Mesma correção da Negociação 7853, após verificar a entrega do número."),
        ("Faltou AV| SDR 7853", "#3 Marketing \"empurrãozinho\" (6,7%)",
         "Reescrever em formato Utilidade (como os passos 1–2, 14–15%) ou com o sorteio/presente do passo 4 (12,6%)."),
        ("Faltou AV| SDR 1727", "#4 (8,0%, leitura 32%)", "Reescrever e revisar entrega; passo 1 (19,2%) é a referência."),
        ("Sem resposta | SDR 6554 (117 envios)", "#4 (0%), #5 (4,8%)", "Amostra pequena; revisar junto com o 1727, pois usam o mesmo texto."),
    ]
    for c, p, s in ajustes:
        linhas.append([P(c, S_CELLB), P(p, S_CELL), P(s, S_CELL)])
    F += [tabela(linhas, [4.6 * cm, 4.2 * cm, 8.8 * cm]), Spacer(1, 6)]

    F += [P("Manter (não mexer)", S_H2),
          P("Pré AV SDR 7853, Agendados / REATIV, Falhou / REATIV, Sem resposta / REATIV, o 1º passo de Sem resposta, Faltou AV, Negociação e Pré AV em todos os números. "
            "São as mensagens que sustentam o engajamento; use-as como modelo para reescrever as fracas.")]
    F += [P("Monitorar (amostra pequena)", S_H2)]
    F += bullets([
        "Faltou AV / Social Selling 7853: 4,8% em 21 envios (usa os mesmos modelos que rendem 12–15% no SDR 7853).",
        "Pré AV 1727 passo 3 e Pré AV 6554 passo 3 (imagem com depoimento): 7,3% e 0%.",
        "Serviços Avulsos (7853): 3 a 9 envios por sequência; Sem resposta Avulsos com 0% de leitura em 3 envios, conferir se está entregando.",
        "Nos números 6554 a leitura aparece como 100% em todos os passos, o que sugere que a leitura não é medida nesse canal; use só a interação.",
    ])
    F += [P("Limpeza da conta", S_H2)]
    sem_passos = [s["name"] for s in SEQS if s["steps"] == 0]
    sem_envio = [s["name"] for s in SEQS if s["steps"] > 0 and (not s["stats"] or s["stats"]["executionCount"] == 0)]
    F += bullets([
        f"Sem nenhum passo (candidatas a exclusão): {', '.join(esc(n) for n in sem_passos)}.",
        f"Com passos configurados, mas nunca usadas: {', '.join(esc(n) for n in sem_envio)}. "
        "Leads frios do 1727 e do 6554 (esta com 10 passos) nunca enviaram: confirmar se os contatos frios desses números estão sendo associados à cadência.",
    ])
    F += [Spacer(1, 6), P("Fonte: API do Lever (sequências, passos, templates e estatísticas de execução), coleta de 30/09/2026. "
                          "Dados brutos e o script deste relatório estão em relatorios/lever-cadencias/.", S_SM)]
    return F


def rodape(c, d):
    c.saveState()
    c.setFont("DV", 7)
    c.setFillColor(colors.HexColor(MUTED))
    c.drawString(1.6 * cm, 1 * cm, "Drenesse · Análise das cadências do Lever · 30/09/2026")
    c.drawRightString(A4[0] - 1.6 * cm, 1 * cm, f"Página {d.page}")
    c.restoreState()


if __name__ == "__main__":
    doc = SimpleDocTemplate(SAIDA, pagesize=A4, leftMargin=1.6 * cm, rightMargin=1.6 * cm, topMargin=1.5 * cm, bottomMargin=1.6 * cm,
                            title="Análise de engajamento das cadências do Lever", author="Drenesse")
    doc.build(montar(), onFirstPage=rodape, onLaterPages=rodape)
    print("OK", SAIDA)
