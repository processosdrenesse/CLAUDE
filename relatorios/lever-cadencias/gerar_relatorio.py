#!/usr/bin/env python3
"""Gera o PDF "Análise de engajamento das sequências Lever" (modelo de 25/09/2026).

Uso: python3 gerar_relatorio.py [dados.json] [saida.pdf]
Requer: reportlab. Os dados vêm do snapshot da API do Lever (dados_AAAA-MM-DD.json).
"""
import json, os, re, sys
from collections import Counter, defaultdict

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (Flowable, KeepTogether, PageBreak, Paragraph,
                                SimpleDocTemplate, Spacer, Table, TableStyle)

AQUI = os.path.dirname(os.path.abspath(__file__))
import glob
DADOS = sys.argv[1] if len(sys.argv) > 1 else sorted(glob.glob(os.path.join(AQUI, "dados_*.json")))[-1]

FD = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("DV", FD + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DV-B", FD + "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFontFamily("DV", normal="DV", bold="DV-B", italic="DV", boldItalic="DV-B")

# ---------------------------------------------------------------- paleta (igual ao modelo)
PINK, PINK_L = colors.HexColor("#d6588c"), colors.HexColor("#e8a9c5")
INK, MUTED, LINE = colors.HexColor("#2b2b2b"), colors.HexColor("#777777"), colors.HexColor("#e6e6e6")
STATUS = {  # cor do texto, cor de fundo
    "Forte": (colors.HexColor("#1f7a44"), colors.HexColor("#e1f1e6")),
    "Regular": (colors.HexColor("#557a1c"), colors.HexColor("#eef2dc")),
    "Atenção": (colors.HexColor("#b07a12"), colors.HexColor("#fdf0d6")),
    "Crítico": (colors.HexColor("#c0392b"), colors.HexColor("#fbe0dd")),
}
BG_BEST, BG_WORST = colors.HexColor("#e1f1e6"), colors.HexColor("#fbe0dd")

# ---------------------------------------------------------------- dados
snap = json.load(open(DADOS, encoding="utf-8"))
DATA_TXT = "/".join(reversed(snap["coletado_em"].split("-")))
SAIDA = sys.argv[2] if len(sys.argv) > 2 else os.path.join(AQUI, f"Analise_Sequencias_Lever_{snap['coletado_em']}.pdf")
SEQS = snap["sequencias"]
PASSOS = snap["passos"]
por_seq = defaultdict(list)
for p in PASSOS:
    por_seq[p["seq"]].append(p)
for v in por_seq.values():
    v.sort(key=lambda p: p["pos"])
info = {s["name"]: s for s in SEQS}


def fnum(n):
    return f"{n:,}".replace(",", ".")


def pct(x, d=1):
    return f"{x * 100:.{d}f}%".replace(".", ",")


def rate(a, b):
    return a / b if b else 0.0


def faixa(t):
    return "Forte" if t >= 0.15 else "Regular" if t >= 0.10 else "Atenção" if t >= 0.07 else "Crítico"


def limpa(t):
    t = re.sub(r"[\U00010000-\U0010ffff☀-➿️‍⬀-⯿*]", "", t or "")
    return re.sub(r"\s+", " ", t).strip()


def esc(t):
    return limpa(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def trecho(t, n=165):
    t = limpa(t)
    if len(t) <= n:
        return t
    return t[:n].rsplit(" ", 1)[0].rstrip(",.;:!? ") + "…"


def nome_bonito(n):
    return re.sub(r"\s*[|/]\s*", lambda m: " | " if "|" in m.group() else " / ", n).replace("  ", " ")


def T(seq, pos):
    """Taxa de resposta do passo `pos` da sequência (texto)."""
    p = next(p for p in por_seq[seq] if p["pos"] == pos)
    return pct(rate(p["it"], p["ex"]))


def L(seq, pos):
    p = next(p for p in por_seq[seq] if p["pos"] == pos)
    return pct(rate(p["rd"], p["ex"]), 0)


def faixa_leitura(*nomes):
    v = [info[n]["stats"]["executionReadRate"] * 100 for n in nomes]
    return f"{round(min(v))}–{round(max(v))}%"


def N(seq, pos):
    return next(p for p in por_seq[seq] if p["pos"] == pos)["ex"]


S7 = "Sem resposta | SDR 7853"; LF = "Leads frios| SDR 7853"; NEG7 = "Negociação| SDR 7853"
FAL7 = "Faltou AV| SDR 7853"; EV = "Cadência Eventos- Social Selling- 7853"; SR17 = "Sem resposta | SDR 1727"
FAL17 = "Faltou AV| SDR 1727"; NEG17 = "Negociação| SDR 1727"; PRE17 = "Pré AV SDR 1727"; PRE7 = "Pré AV SDR 7853"

com_envio = [s for s in SEQS if s["stats"] and s["stats"]["executionCount"] > 0]
sem_envio = [s for s in SEQS if not s["stats"] or s["stats"]["executionCount"] == 0]
tot_ex = sum(s["stats"]["executionCount"] for s in com_envio)
tot_rd = sum(s["stats"]["executionReadCount"] for s in com_envio)
tot_it = sum(s["stats"]["executionInteractionCount"] for s in com_envio)
MEDIA = rate(tot_it, tot_ex)
ranking = sorted([s for s in com_envio if s["stats"]["executionCount"] >= 30],
                 key=lambda s: -rate(s["stats"]["executionInteractionCount"], s["stats"]["executionCount"]))
poucos = sorted([s for s in com_envio if s["stats"]["executionCount"] < 30], key=lambda s: -s["stats"]["executionCount"])
leads_frios_pct = rate(info[LF]["stats"]["executionCount"], tot_ex)


def taxa_seq(s):
    return rate(s["stats"]["executionInteractionCount"], s["stats"]["executionCount"])


# ---------------------------------------------------------------- comparação entre coletas (efeito dos textos novos)
import difflib
MARCO = "2026-10-13"  # dia em que vários textos foram reescritos


def _carrega(p):
    d = json.load(open(p, encoding="utf-8"))
    return d["coletado_em"], {(x["seq"], x["pos"]): x for x in d["passos"]}, {s["name"]: s for s in d["sequencias"]}


_snaps = sorted((_carrega(p) for p in glob.glob(os.path.join(AQUI, "dados_*.json"))), key=lambda t: t[0])
_pre = [s for s in _snaps if s[0] < MARCO]
_pos = [s for s in _snaps if MARCO <= s[0] < snap["coletado_em"]]
if _pre and _pos:
    PRE_D, PRE, PRE_S = _pre[-1]
    POS_D, POS, POS_S = _pos[0]
else:
    PRE = POS = None


def dm(d):
    return f"{d[8:10]}/{d[5:7]}"


def mud(seq, pos):
    """Compara o passo entre as coletas: janela A (antes da troca) e B (depois). None sem base."""
    if PRE is None:
        return None
    k = (seq, pos)
    cur = next((p for p in por_seq[seq] if p["pos"] == pos), None)
    if cur is None or k not in PRE or k not in POS:
        return None
    a, b = PRE[k], POS[k]
    sim = difflib.SequenceMatcher(None, limpa(a["text"]).lower(), limpa(cur["text"]).lower()).ratio()
    alt = cur["updated"][:10]
    return dict(novo=sim < 0.9, alt=alt, limpo=alt < POS_D, cur=cur,
                A=(b["ex"] - a["ex"], b["it"] - a["it"], b["rd"] - a["rd"]),
                B=(cur["ex"] - b["ex"], cur["it"] - b["it"], cur["rd"] - b["rd"]))


def jan(j):
    """Texto 'taxa (n envios)' de uma janela (ex, it, rd)."""
    return f"{pct(rate(j[1], j[0]))} ({j[0]} envios)" if j[0] else "sem envios"


def ativos(nome, quando="cur"):
    if quando == "pos" and PRE is not None:
        return POS_S[nome]["executing"] if nome in POS_S else 0
    return info[nome]["executing"]


# ---------------------------------------------------------------- estilos
def st(nome, **kw):
    base = dict(fontName="DV", fontSize=8.4, leading=11.6, textColor=INK, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(nome, **base)


S_T = st("t", fontName="DV-B", fontSize=21, leading=26, spaceAfter=5)
S_SUB = st("sub", fontSize=8.2, leading=11.5, textColor=MUTED, spaceAfter=8)
S_H1 = st("h1", fontName="DV-B", fontSize=14.5, leading=18, textColor=PINK, spaceAfter=3)
S_H2 = st("h2", fontName="DV-B", fontSize=10.5, leading=14, spaceBefore=4, spaceAfter=3)
S_P = st("p", spaceAfter=3)
S_BUL = st("bul", leftIndent=10, bulletIndent=0, spaceAfter=3.2, leading=12.2)
S_GRAY = st("gray", fontSize=7.8, leading=11.2, textColor=MUTED)
S_C = st("c", fontSize=7.4, leading=9.4)
S_CB = st("cb", fontSize=7.4, leading=9.4, fontName="DV-B")
S_CR = st("cr", fontSize=7.4, leading=9.4, alignment=TA_CENTER)
S_CRB = st("crb", fontSize=7.6, leading=9.4, fontName="DV-B", alignment=TA_CENTER)
S_HD = st("hd", fontSize=7.2, leading=9, fontName="DV-B", textColor=colors.white)
S_HDC = st("hdc", fontSize=7.2, leading=9, fontName="DV-B", textColor=colors.white, alignment=TA_CENTER)
S_NOTE = st("note", fontSize=8, leading=11.2, spaceBefore=3, spaceAfter=7)


def P(t, s=S_P):
    return Paragraph(t, s)


def bullets(itens, s=S_BUL):
    return [Paragraph(i, s, bulletText="•") for i in itens]


def status_span(f, texto=None):
    c = STATUS[f][0].hexval().replace("0x", "#")
    return f"<font color='{c}'><b>{texto or f}</b></font>"


# ---------------------------------------------------------------- flowables
class Ranking(Flowable):
    """Gráfico de barras horizontais do ranking (vetorial, como no modelo)."""

    def __init__(self, linhas, media, largura=17 * cm, altura_linha=0.48 * cm):
        super().__init__()
        self.linhas, self.media, self.w, self.h_lin = linhas, media, largura, altura_linha
        self.height = altura_linha * len(linhas) + 0.9 * cm

    def wrap(self, *_):
        return self.w, self.height

    def draw(self):
        c = self.canv
        x0, xmax = 6.0 * cm, 7.6 * cm
        vmax = max(t for _, t in self.linhas)
        n = len(self.linhas)
        for i, (nome, t) in enumerate(self.linhas):
            y = self.height - 0.3 * cm - (i + 1) * self.h_lin + 0.1 * cm
            c.setFont("DV", 7.2)
            c.setFillColor(INK)
            c.drawRightString(x0 - 0.2 * cm, y + 0.07 * cm, nome if len(nome) < 36 else nome[:36].rsplit(" ", 1)[0])
            c.setFillColor(PINK if t >= 0.10 else PINK_L)
            c.rect(x0, y, xmax * t / vmax, 0.32 * cm, stroke=0, fill=1)
            c.setFont("DV", 6.8)
            c.setFillColor(MUTED)
            c.drawString(x0 + xmax * t / vmax + 0.2 * cm, y + 0.07 * cm, f"{pct(t)}  ·  {faixa(t)}")
        xm = x0 + xmax * self.media / vmax
        c.setStrokeColor(PINK)
        c.setDash(1.5, 1.5)
        c.line(xm, self.height - 0.15 * cm, xm, 0.55 * cm)
        c.setDash()
        c.setFont("DV", 6.8)
        c.setFillColor(INK)
        c.drawCentredString(xm, 0.28 * cm, f"média {pct(self.media)}")


def tabela(dados, larguras, extra=None):
    t = Table(dados, colWidths=larguras, repeatRows=1)
    est = [("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BACKGROUND", (0, 0), (-1, 0), INK),
           ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE),
           ("TOPPADDING", (0, 0), (-1, -1), 3.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2),
           ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]
    t.setStyle(TableStyle(est + (extra or [])))
    return t


# ---------------------------------------------------------------- comentários "Leitura:"
def leitura(nome):
    s = info[nome]["stats"]
    m2, m3 = mud(S7, 2), mud(S7, 3)
    r1727 = [mud(SR17, i) for i in range(1, 6)]
    r1727 = [x for x in r1727 if x]
    env_b, lid_b = sum(x["B"][0] for x in r1727), sum(x["B"][2] for x in r1727)
    R = "Sem resposta / REATIV 7853"
    return {
    "Agendados / REATIV 7853":
        "Mensagem única de confirmação + orientação. Melhor taxa do Lever: mensagem útil, sem pedido de venda, gera resposta natural. <b>Manter.</b>",
    PRE7:
        f"Confirmação curta ({T(PRE7, 1)}) e o lembrete de 22h ({T(PRE7, 5)}) são os melhores. O vídeo da Aisi ({T(PRE7, 4)}) é o mais fraco, mas ainda passa de 20%; "
        f"o Stimullus ({T(PRE7, 6)}) também vai bem porque a cliente já está agendada. <b>Manter.</b>",
    "Falhou / REATIV 7853":
        "Tom de utilidade (“antes de reorganizar nossa agenda”) + “hoje e amanhã”. Funciona. <b>Manter.</b>",
    PRE17:
        f"Lembrete simples vai bem ({T(PRE17, 1)}). O passo 3 (foto de resultado, {T(PRE17, 3)}) foi trocado em 13/10 pelo lembrete “sua avaliação está agendada”; a taxa mostrada é da foto e o texto novo ainda não tem envios.",
    "Sem resposta / Social Selling 7853":
        f"Passo 3 reescrito em 14/10 com Spa Face gratuito + avaliação gratuita e pergunta de escolha (antes não tinha pergunta). Amostra pequena ({s['executionCount']} envios): acompanhar antes de concluir.",
    "Pré AV SDR 6554":
        "Canal sem confirmação de leitura; amostra pequena (37 envios). A foto de resultado teve 0 respostas.",
    R:
        f"Motor de conversas do Lever: {fnum(s['executionInteractionCount'])} respostas. Os passos 1 e 2 foram reescritos em 14/10 com a <b>Reavaliação gratuita</b>; a taxa mostrada ({T(R, 1)} e {T(R, 2)}) é dos textos anteriores. "
        f"<b>Atenção:</b> os contatos em execução caíram de {ativos(R, 'pos')} para {ativos(R)} e o passo 1 não recebeu nenhum contato novo — a cadência que mais funciona parou de ser alimentada.",
    NEG17:
        f"1ª mensagem boa ({T(NEG17, 1)}). Os passos 2 e 3 foram reescritos em 13/10 (protocolo inicial; “condição vale só até amanhã”); as taxas {T(NEG17, 2)} e {T(NEG17, 3)} são dos textos anteriores e os novos quase não têm envios.",
    FAL17:
        f"Mensagem 1 ok ({T(FAL17, 1)}). Os passos 2, 3 e 4 foram reescritos em 13/10 (agora: “hoje ou amanhã”, Spa Face de presente e “antes de reorganizar nossa agenda”); as taxas mostradas são dos textos anteriores e a leitura do último toque era de {L(FAL17, 4)}.",
    FAL7:
        f"Utilidades 1 e 2 seguram {T(FAL7, 1)} e {T(FAL7, 2)}. Em 13/10 o presente (Spa Face gratuito) subiu para o passo 3 e o passo 4 virou “antes de reorganizar nossa agenda”. "
        f"As taxas dos passos 3 ({T(FAL7, 3)}) e 4 ({T(FAL7, 4)}) são dos textos anteriores; os novos têm só {mud(FAL7, 3)['B'][0]} e {mud(FAL7, 4)['B'][0]} envios.",
    NEG7:
        f"1ª mensagem forte ({T(NEG7, 1)}). Os passos 2 e 3 foram reescritos em 13/10 (protocolo inicial; “condição vale só até amanhã”). As taxas {T(NEG7, 2)} e {T(NEG7, 3)} são dos textos anteriores; "
        f"os novos têm {mud(NEG7, 2)['B'][0]} e {mud(NEG7, 3)['B'][0]} envios, pouco para concluir.",
    "Faltou AV| SDR 6554":
        "Canal sem confirmação de leitura; amostra pequena. Após a 1ª mensagem, 1 resposta por toque.",
    "Negociação| SDR 6554":
        "Canal sem confirmação de leitura; amostra pequena. A foto de resultado teve nenhuma resposta.",
    S7:
        f"Maior volume do Lever ({fnum(s['executionCount'])} envios, {fnum(info[S7]['executing'])} contatos em execução). A pergunta curta do passo 1 segue como a melhor abertura ({T(S7, 1)}). "
        f"Em 13/10 os passos 2 e 3 ganharam textos novos e, na semana seguinte, <b>não melhoraram</b>: passo 2 com {jan(m2['B'])} contra {jan(m2['A'])} antes; passo 3 com {jan(m3['B'])} contra {jan(m3['A'])}. "
        "Nenhum passo desta cadência oferece presente.",
    SR17:
        f"Leitura de apenas {pct(s['executionReadRate'], 0)} e, desde a coleta de 14/10, só {lid_b} leituras em {env_b} envios. É problema de entrega do número, não de texto: "
        f"os passos 2, 3 e 4 foram reescritos em 13/10 e continuam sem resposta ({T(SR17, 2)}, {T(SR17, 3)} e {T(SR17, 4)}, taxas dos textos anteriores).",
    "Sem resposta | SDR 6554":
        "Canal sem confirmação de leitura; amostra pequena. Nenhuma mensagem passou de 12%.",
    EV:
        f"10 toques em 10 dias é longo demais: a leitura cai de 63% para 46% e as mensagens 4, 5, 8 e 9 ficam abaixo de 5%. Os toques 1 e 2 (abertura com o Glow Up Premium) não têm nenhum envio registrado. "
        f"Sem envios desde 14/10 e {ativos(EV)} contatos em execução.",
    LF:
        f"Os 3 textos foram reescritos em 13/10 (agora: avaliação “sem compromisso” hoje ou amanhã; “o que mais te incomoda hoje?”; encerramento) e a cadência <b>não enviou nada desde então</b> ({ativos(LF)} contatos em execução). "
        f"Os {pct(taxa_seq(info[LF]))} de resposta e os {pct(s['executionReadRate'], 0)} de leitura são todos dos textos anteriores, que somaram {fnum(sum(p['ex'] for p in por_seq[LF]))} envios. Nenhum texto novo traz presente.",
    }.get(nome, "")


# ---------------------------------------------------------------- blocos
def bloco_sequencia(s):
    nome = s["name"]
    t = taxa_seq(s)
    f = faixa(t)
    cab = P(f"<b>{esc(nome)}</b> &nbsp; <font size='7.6'>{status_span(f, '● ' + f)} · <b>{pct(t)} de resposta · {fnum(s['stats']['executionCount'])} envios</b></font>", S_H2)
    ps = [p for p in por_seq[nome] if p["ex"] > 0]
    cab_t = [P("#", S_HD), P("Modelo / trecho da mensagem", S_HD), P("Após", S_HDC), P("Envios", S_HDC),
             P("Leitura", S_HDC), P("Resp.", S_HDC), P("Taxa", S_HDC)]
    linhas = [cab_t]
    extra = []
    melhor = max(ps, key=lambda p: rate(p["it"], p["ex"])) if len(ps) > 1 else None
    pior = min(ps, key=lambda p: rate(p["it"], p["ex"])) if len(ps) > 1 else None
    for i, p in enumerate(ps, start=1):
        v, u = p["off"]
        apos = "-" if not v else (f"{v}h" if u == "HOURS" else f"{v}min" if u == "MINUTES" else f"{v} dia{'s' if v > 1 else ''}")
        tag = {"VIDEO": " [VÍDEO]", "IMAGE": " [IMAGEM]", "DOCUMENT": " [DOCUMENTO]"}.get(p["media"], "")
        mm = mud(nome, p["pos"])
        aviso = ""
        if mm and mm["novo"]:
            aviso = (f"<br/><font color='#b07a12'><b>TEXTO NOVO desde {dm(mm['alt'])}</b> — envios e taxa ao lado são do texto anterior"
                     + (f" · após a troca: {mm['B'][0]} envios" if mm["limpo"] and mm["B"][0] else "") + "</font>")
        cel = P(f"<b>{esc(p['tname'])}</b><font color='#777777'>{tag}</font><br/><font color='#777777'>“{esc(trecho(p['text']))}”</font>{aviso}", S_C)
        marca = " ▲" if p is melhor else " ▼" if p is pior else ""
        linhas.append([P(str(p["pos"]), S_C), cel, P(apos, S_CR), P(fnum(p["ex"]), S_CR),
                       P(pct(rate(p["rd"], p["ex"])), S_CR), P(str(p["it"]), S_CR),
                       P(pct(rate(p["it"], p["ex"])) + marca, S_CRB)])
        if p is melhor:
            extra.append(("BACKGROUND", (0, i), (-1, i), BG_BEST))
        elif p is pior:
            extra.append(("BACKGROUND", (0, i), (-1, i), BG_WORST))
    tab = tabela(linhas, [0.8 * cm, 8.1 * cm, 1.5 * cm, 1.6 * cm, 1.7 * cm, 1.4 * cm, 1.9 * cm], extra)
    return KeepTogether([cab, tab, P(f"<b>Leitura:</b> {leitura(nome)}", S_NOTE)])


def item_mudar(n, titulo, f, dados, desc, acoes):
    corpo = [P(f"<b>{titulo}</b>", st("it", fontSize=10, leading=13)),
             P(f"{status_span(f, f)} <font color='#777777'>· {dados}</font>", st("its", fontSize=7.6, leading=11)),
             Spacer(1, 3), P(desc, S_P)]
    for a in acoes:
        corpo.append(Paragraph(a, st("ar", leftIndent=12, bulletIndent=0, spaceAfter=2.5, leading=11.6, fontSize=8.2), bulletText="→"))
    num = Table([[P(f"<b>{n}</b>", st("nn", fontName="DV-B", fontSize=11, textColor=colors.white, alignment=TA_CENTER, leading=13))]],
                colWidths=[0.75 * cm], rowHeights=[0.75 * cm])
    num.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), PINK), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                             ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    caixa = Table([[num, corpo]], colWidths=[0.85 * cm, 16.15 * cm])
    caixa.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (0, 0), 0), ("LEFTPADDING", (1, 0), (1, 0), 8),
                               ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    # o quadrado rosa só até a altura do título
    return KeepTogether([caixa, Spacer(1, 8)])


def m(seq, pos, texto, novo):
    return f"<b>M{pos} (hoje {T(seq, pos)}) → </b>{novo}" if not texto else f"<b>M{pos} {texto} ({T(seq, pos)}) → </b>{novo}"


# ---------------------------------------------------------------- seção: efeito das mudanças
def passos_novos():
    out = []
    for s in SEQS:
        for p in por_seq[s["name"]]:
            mm = mud(s["name"], p["pos"])
            if mm and mm["novo"]:
                out.append((s["name"], p["pos"], mm))
    return out


def semana_1727():
    r = [mud(SR17, i) for i in range(1, 6)]
    r = [x for x in r if x]
    return sum(x["B"][0] for x in r), sum(x["B"][2] for x in r)


def secao_mudancas():
    novos = passos_novos()
    F = [PageBreak(), P("O que mudou em 13/10: efeito dos textos novos", S_H1),
         P(f"{len(novos)} passos tiveram o texto reescrito em {dm(MARCO)} e {dm(POS_D)} (Leads frios, Sem resposta, Negociação, Faltou AV, Pré AV 1727 e a Reativação com a reavaliação gratuita). "
           "Como o Lever acumula as taxas por passo, a análise mensagem a mensagem mostra, nesses passos, o desempenho do <b>texto anterior</b> (marcados como TEXTO NOVO). "
           f"Para medir o texto novo, comparei as coletas de {dm(POS_D)} e {dm(snap['coletado_em'])} (envios feitos depois da troca) com a janela anterior, {dm(PRE_D)} a {dm(POS_D)}. "
           "Respostas tardias entram nas duas janelas, por isso só vale comparar janela com janela, nunca com a taxa acumulada.", S_GRAY), Spacer(1, 6)]

    fortes = [(n, p, mm) for n, p, mm in novos if mm["limpo"] and mm["B"][0] >= 100]
    controles = []
    for s in SEQS:
        for p in por_seq[s["name"]]:
            mm = mud(s["name"], p["pos"])
            if mm and not mm["novo"] and mm["B"][0] >= 100 and mm["A"][0] >= 100:
                controles.append((s["name"], p["pos"], mm))
    linhas = [[P("Passo", S_HD), P("Texto novo", S_HD), P("Antes (05→14/10)", S_HDC), P("Depois (14→20/10)", S_HDC), P("Leitura", S_HDC), P("Veredito", S_HDC)]]
    extra = []
    i = 0
    for grupo, rot in ((fortes, None), (controles, "controle")):
        for n, pos, mm in sorted(grupo, key=lambda x: (x[0], x[1])):
            i += 1
            ta, tb = rate(mm["A"][1], mm["A"][0]), rate(mm["B"][1], mm["B"][0])
            d = (tb - ta) * 100
            if rot:
                ver, cor = f"controle (texto igual): {d:+.1f} pp".replace(".", ","), "Atenção"
            elif d >= 3:
                ver, cor = f"Melhor: {d:+.1f} pp".replace(".", ","), "Forte"
            elif d <= -3:
                ver, cor = f"Pior: {d:+.1f} pp".replace(".", ","), "Crítico"
            else:
                ver, cor = f"Sem diferença: {d:+.1f} pp".replace(".", ","), "Atenção"
            ra, rb = rate(mm["A"][2], mm["A"][0]), rate(mm["B"][2], mm["B"][0])
            nome_p = f"{esc(n)} #{pos}"
            linhas.append([P(nome_p, S_C), P(f"“{esc(trecho(mm['cur']['text'], 90))}”" if not rot else "mesmo texto", S_C),
                           P(jan(mm["A"]).replace(" (", "<br/>("), S_CR), P(jan(mm["B"]).replace(" (", "<br/>("), S_CR),
                           P(f"{pct(ra, 0)} → {pct(rb, 0)}", S_CR), P(f"<font color='{STATUS[cor][0].hexval().replace('0x', '#')}'><b>{ver}</b></font>", S_CR)])
            extra.append(("BACKGROUND", (5, i), (5, i), STATUS[cor][1]))
    if i:
        F += [P("Passos com volume suficiente (100+ envios novos)", S_H2), tabela(linhas, [3.4 * cm, 4.4 * cm, 2.2 * cm, 2.2 * cm, 1.7 * cm, 3.1 * cm], extra),
              P("Os passos de controle não mudaram de texto: se eles também subiram, parte da variação é da semana e não do texto. "
                "Leia “Pior/Melhor” só como indício: cada janela tem de 150 a 300 envios (margem de erro de uns 3 pontos).", S_NOTE)]

    poucos_n = [(n, p, mm) for n, p, mm in novos if mm["limpo"] and mm["B"][0] < 100]
    por = defaultdict(list)
    for n, p, mm in poucos_n:
        por[n].append(f"#{p} ({mm['B'][0]})")
    linhas = [[P("Cadência", S_HD), P("Passos com texto novo (envios desde 14/10)", S_HD)]]
    for n in sorted(por, key=lambda n: -info[n]["stats"]["executionCount"]):
        linhas.append([P(esc(n), S_C), P(" · ".join(por[n]), S_C)])
    mist = [(n, p) for n, p, mm in novos if not mm["limpo"]]
    F += [P("Passos reescritos ainda sem volume (menos de 100 envios novos)", S_H2), tabela(linhas, [7.0 * cm, 10.0 * cm]),
          P("Regra sugerida: só concluir quando o passo tiver 100+ envios após a troca. Se continuar abaixo de 8% de resposta na janela, trocar pelo texto de presente + reavaliação (página final).", S_NOTE)]
    if mist:
        F += [P("Alterados em 14/10, depois da coleta: " + "; ".join(f"{esc(n)} #{p}" for n, p in mist) +
                ". Nesses passos a janela mistura texto antigo e novo, então não separei o efeito.", S_GRAY), Spacer(1, 4)]

    # contatos em execução
    nomes = sorted({n for n in info if info[n]["stats"] and (ativos(n, "pos") or ativos(n))}, key=lambda n: -max(ativos(n, "pos"), ativos(n)))
    linhas = [[P("Cadência", S_HD), P(f"Em execução {dm(POS_D)}", S_HDC), P(f"Em execução {dm(snap['coletado_em'])}", S_HDC), P("Envios novos", S_HDC)]]
    for n in nomes[:6]:
        novos_env = info[n]["stats"]["executionCount"] - (POS_S[n]["stats"]["executionCount"] if n in POS_S and POS_S[n]["stats"] else 0)
        linhas.append([P(esc(n), S_C), P(str(ativos(n, "pos")), S_CR), P(str(ativos(n)), S_CRB), P(fnum(novos_env), S_CR)])
    F += [P("Quem está recebendo mensagens agora", S_H2), tabela(linhas, [8.2 * cm, 3.0 * cm, 3.0 * cm, 2.8 * cm]),
          P("Em execução = contatos dentro da cadência aguardando o próximo toque; com 0 contatos, nada é enviado.", S_NOTE)]
    return F


# ---------------------------------------------------------------- montagem
def montar():
    F = []
    # ------------------------------------------------ capa
    F += [Spacer(1, 0.9 * cm), P("Análise de engajamento das sequências Lever", S_T),
          P(f"Quais sequências e quais mensagens geram mais (e menos) resposta · dados extraídos da API do Lever em {DATA_TXT}", S_SUB)]

    def card(valor, rot):
        return [P(f"<font color='#d6588c'><b>{valor}</b></font>", st("kv", fontSize=19, leading=23)), P(rot, st("kl", fontSize=7.2, leading=9.5, textColor=MUTED))]

    kp = Table([[card(fnum(tot_ex), f"mensagens disparadas<br/>({len(com_envio)} sequências com envio)"), card(pct(rate(tot_rd, tot_ex)), "taxa média de leitura"),
                 card(pct(MEDIA), "taxa média de resposta<br/>(interações ÷ envios)"), card(str(len(sem_envio)), "sequências criadas<br/>e nunca usadas")]],
               colWidths=[4.25 * cm] * 4)
    kp.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f6f6f6")), ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                            ("LINEAFTER", (0, 0), (2, 0), 0.5, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    F += [kp, Spacer(1, 0.6 * cm), P("Resumo em 30 segundos", S_H1), Spacer(1, 3)]
    R = "Sem resposta / REATIV 7853"
    rea = info[R]["stats"]["executionInteractionCount"]
    nn = len(passos_novos()) if PRE is not None else 0
    m2, m3 = mud(S7, 2), mud(S7, 3)
    env_s, lid_s = semana_1727()
    F += bullets([
        f"<b>O que mais engaja:</b> mensagens curtas de <b>confirmação/utilidade</b> (Agendados {pct(taxa_seq(info['Agendados / REATIV 7853']))}, Pré AV 7853 {pct(taxa_seq(info[PRE7]))}, "
        f"Falhou {pct(taxa_seq(info['Falhou / REATIV 7853']))}) e a <b>oferta de Spa Face gratuito com prazo “hoje ou amanhã”</b> na Reativação "
        f"({T(R, 1)}–{T(R, 2)} por mensagem, {fnum(rea)} respostas — a sequência que mais gera conversas).",
        f"<b>O que menos engaja:</b> mensagens “educativas/curiosidade” (“Você sabia…”, “60% das pessoas…”, combo Stimullus), perguntas abertas de objeção no 2º/3º toque da Negociação e toda a sequência de "
        f"<b>Leads frios | SDR 7853 ({pct(taxa_seq(info[LF]))})</b>, que acumula {fnum(info[LF]['stats']['executionCount'])} envios — {pct(leads_frios_pct, 0)} de todo o volume.",
        f"<b>Mudanças de 13/10:</b> {nn} passos foram reescritos (Leads frios, Sem resposta, Negociação, Faltou AV…). A maioria ainda não tem volume para concluir. "
        f"Na Sem resposta 7853, onde há volume, os textos novos dos passos 2 e 3 <b>não melhoraram</b> ({pct(rate(m2['B'][1], m2['B'][0]), 1)} e {pct(rate(m3['B'][1], m3['B'][0]), 1)} depois, contra "
        f"{pct(rate(m2['A'][1], m2['A'][0]), 1)} e {pct(rate(m3['A'][1], m3['A'][0]), 1)} antes).",
        f"<b>Cadências paradas:</b> a Reativação (a melhor) caiu de {ativos(R, 'pos')} para {ativos(R)} contatos em execução; Leads frios e Eventos não enviaram nada na última semana.",
        f"<b>Canal 1727:</b> {pct(info[SR17]['stats']['executionReadRate'], 0)} de leitura no Sem resposta e, desde 14/10, só {lid_s} leituras em {env_s} envios — problema de entrega do número, "
        f"contra {faixa_leitura(S7, NEG7, FAL7)} de leitura no 7853 nas mesmas etapas.",
        "<b>Ação:</b> a lista final (página “Cadências que você deve mudar”) traz o que mudar agora, o que aguardar e os textos sugeridos, incluindo presente + reavaliação gratuita.",
    ])
    F += [Spacer(1, 6), P("Como ler os números", st("h3", fontName="DV-B", fontSize=10, leading=13, spaceAfter=3)),
          P("<b>Taxa de resposta</b> = interações ÷ envios (é a métrica de engajamento usada no ranking). <b>Taxa de leitura</b> = lidas ÷ envios. Faixas: "
            f"{status_span('Forte', 'Forte ≥ 15%')} · {status_span('Regular', 'Regular')} 10–15% · {status_span('Atenção', 'Atenção')} 7–10% · {status_span('Crítico', 'Crítico &lt; 7%')}. "
            "Sequências com menos de 30 envios não entram no ranking (amostra pequena demais). O canal <b>6554</b> marca 100% de leitura em tudo — ele não devolve confirmação de leitura, "
            "então ali só vale a taxa de resposta. Os totais por sequência incluem mensagens antigas já removidas; por isso a soma das etapas atuais pode ser menor que o total.", S_GRAY)]

    # ------------------------------------------------ ranking
    F += [PageBreak(), P("Ranking das sequências por engajamento", S_H1),
          P(f"Sequências com 30+ envios, da maior para a menor taxa de resposta. Linha tracejada = média geral ({pct(MEDIA)}).", S_GRAY), Spacer(1, 4),
          Ranking([(s["name"], taxa_seq(s)) for s in ranking], MEDIA), Spacer(1, 4)]
    linhas = [[P("#", S_HD), P("Sequência", S_HD), P("Envios", S_HDC), P("Leitura", S_HDC), P("Respostas", S_HDC), P("Taxa", S_HDC), P("Status", S_HDC), P("Ativos", S_HDC)]]
    extra = []
    for i, s in enumerate(ranking, start=1):
        a = s["stats"]
        f = faixa(taxa_seq(s))
        linhas.append([P(str(i), S_CR), P(esc(s["name"]), S_C), P(fnum(a["executionCount"]), S_CR), P(pct(a["executionReadRate"]), S_CR),
                       P(fnum(a["executionInteractionCount"]), S_CR), P(pct(taxa_seq(s)), S_CRB),
                       P(f"<font color='{STATUS[f][0].hexval().replace('0x', '#')}'><b>{f}</b></font>", S_CR), P(str(s["executing"]), S_CR)])
        extra.append(("BACKGROUND", (6, i), (6, i), STATUS[f][1]))
        if i % 2 == 0:
            extra.append(("BACKGROUND", (0, i), (5, i), colors.HexColor("#f7f7f7")))
            extra.append(("BACKGROUND", (7, i), (7, i), colors.HexColor("#f7f7f7")))
    F += [tabela(linhas, [0.8 * cm, 6.0 * cm, 1.7 * cm, 1.8 * cm, 1.9 * cm, 1.6 * cm, 1.9 * cm, 1.3 * cm], extra)]

    # ------------------------------------------------ mensagem a mensagem
    F += [PageBreak(), P("Análise mensagem a mensagem", S_H1),
          P("Para cada sequência: taxa de cada mensagem, com a <b>melhor (▲)</b> e a <b>pior (▼)</b> destacadas. Só entram mensagens com envios.", S_GRAY), Spacer(1, 4)]
    for s in ranking:
        F.append(bloco_sequencia(s))

    if PRE is not None:
        F += secao_mudancas()

    # ------------------------------------------------ funciona x não funciona
    F += [PageBreak(), P("O que funciona × o que não funciona", S_H1), Spacer(1, 2)]

    def quadro(titulo, cor_titulo, bg, linhas_q):
        F.append(P(f"<font color='{cor_titulo}'><b>{titulo}</b></font>", st("qt", fontSize=10.5, leading=14, spaceAfter=3, spaceBefore=4)))
        dados = [[P(f"<b>{a}</b>", st("qa", fontSize=7.6, leading=10)), P(b, st("qb", fontSize=7.8, leading=10.6))] for a, b in linhas_q]
        t = Table(dados, colWidths=[4.0 * cm, 13.0 * cm])
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, -1), bg), ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                               ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("LEFTPADDING", (0, 0), (-1, -1), 6)]))
        F.append(t)

    R = "Sem resposta / REATIV 7853"
    ok_bg, bad_bg = STATUS["Forte"][1], STATUS["Crítico"][1]
    quadro("Funciona — replicar", "#1f7a44", ok_bg, [
        ("Confirmação / utilidade curta", f"“Sua sessão está confirmada…” {T(PRE7, 1)} · “Passando para lembrar que sua sessão está agendada” {T(PRE7, 5)} · Agendados {pct(taxa_seq(info['Agendados / REATIV 7853']))}"),
        ("Oferta concreta + prazo curto + escolha", f"Spa Face GRATUITO “hoje ou amanhã” na Reativação: {T(R, 1)} e {T(R, 2)} — as duas mensagens com maior taxa entre as cadências de contato frio"),
        ("Tom de “atualização de atendimento”", f"“Antes de reorganizar nossa agenda…” {T(FAL7, 1)} (Faltou 7853) e {T('Falhou / REATIV 7853', 1)} (Falhou)"),
        ("Pergunta curta e aberta na 1ª mensagem", f"“Oii [NOME], o que te incomoda hoje?” {T(S7, 1)} sobre {fnum(N(S7, 1))} envios"),
        ("Reconhecer a visita antes de perguntar", f"Negociação 10/09 “Que bom que você veio à clínica!… o que faltou?” {T(NEG7, 1)}"),
    ])
    quadro("Não funciona — evitar", "#c0392b", bad_bg, [
        ("Conteúdo educativo / curiosidade", f"“Você sabia… combo Stimullus” {T(S7, 3)} · “60% das pessoas têm inchaço” {T(LF, 2)} · “Uma curiosidade…” {T(EV, 4)} (textos anteriores a 13/10)"),
        ("Repetir a pergunta de objeção", f"Negociação 7853: os textos antigos dos toques 2 e 3 perguntavam de novo “o que te impede / o que falta” → {T(NEG7, 2)} e {T(NEG7, 3)} (foram reescritos em 13/10)"),
        ("Foto de “resultado de cliente”", f"Pré AV 1727 {T(PRE17, 3)} · Pré AV 6554 {T('Pré AV SDR 6554', 3)} · Negociação 6554 {T('Negociação| SDR 6554', 3)} · Faltou 6554 {T('Faltou AV| SDR 6554', 3)}"),
        ("Cadência longa demais", "Eventos: 10 toques, leitura cai de 63% para 46%; 4 toques abaixo de 5%"),
        ("“Posso te fazer uma pergunta?” / pré-pergunta", f"Evento 8: {T(EV, 8)} — pede permissão em vez de dar motivo para responder"),
    ])
    F += [Spacer(1, 6), P("Sequências com pouco volume (sem conclusão ainda)", st("h3", fontName="DV-B", fontSize=10, leading=13, spaceAfter=2)),
          P("Menos de 30 envios — acompanhar antes de mexer: " + "; ".join(
              f"{esc(s['name'])} ({s['stats']['executionCount']} envios, {pct(taxa_seq(s))})" for s in poucos) + ".", S_GRAY), Spacer(1, 4)]
    nomes = Counter(s["name"] for s in sem_envio)
    lista = "; ".join(esc(n) if c == 1 else f"{esc(n)} ({c} sequências)" for n, c in sorted(nomes.items()))
    F += [P(f"Sequências criadas e nunca disparadas (0 envios) — sugestão de limpeza", st("h3b", fontName="DV-B", fontSize=10, leading=13, spaceAfter=2)),
          P(lista + ". Arquivar ou excluir evita que o time dispare por engano uma cadência não validada.", S_GRAY)]

    # ------------------------------------------------ cadências a mudar
    F += [PageBreak(), P("Cadências que você deve mudar", st("h1b", fontName="DV-B", fontSize=17, leading=21, spaceAfter=3, textColor=INK)),
          P("Ordenadas por impacto (volume × distância da média), já considerando os textos reescritos em 13/10. Em cada uma: o que trocar e o texto sugerido, "
            "baseado nos modelos que já performam bem no próprio Lever.", S_GRAY), Spacer(1, 8)]

    def dados(s_nome, extra=""):
        s = info[s_nome]["stats"]
        return f"resposta {pct(taxa_seq(info[s_nome]))} · {fnum(s['executionCount'])} envios" + extra

    R = "Sem resposta / REATIV 7853"
    m2, m3 = mud(S7, 2), mud(S7, 3)
    env_s, lid_s = semana_1727()
    ganho = round(sum(p["ex"] for p in por_seq[LF]) * 0.075 - sum(p["it"] for p in por_seq[LF]))
    itens = [
        ("1", "Sem resposta | SDR 7853", faixa(taxa_seq(info[S7])), dados(S7, f" · {fnum(info[S7]['executing'])} em execução"),
         f"É a única cadência de volume em operação, então é onde está o maior ganho. Os passos 1 e 4 seguem como estavam; os textos novos de 13/10 <b>não superaram</b> os anteriores "
         f"(passo 2: {jan(m2['B'])} contra {jan(m2['A'])}; passo 3: {jan(m3['B'])} contra {jan(m3['A'])}). Nenhum passo oferece presente, e a Reativação rende 17–21% com presente + escolha de horário.",
         [f"<b>M2 (texto de 13/10, {pct(rate(m2['B'][1], m2['B'][0]))} na semana) →</b> trocar pelo presente: “Oiie, [Nome]! ❤️ Separei um PRESENTE EXCLUSIVO para você: um Spa Face totalmente GRATUITO "
          "e uma AVALIAÇÃO GRATUITA com nossa especialista, para entender o que seu corpo precisa. São poucas vagas, apenas HOJE e AMANHÃ. Qual você prefere?” + botões HOJE e AMANHÃ.",
          f"<b>M3 (“o que mais pesa pra você agora?”, {pct(rate(m3['B'][1], m3['B'][0]))} na semana) →</b> manter por mais uma semana e decidir com 300+ envios novos.",
          f"<b>M1 ({T(S7, 1)}) e M4 ({T(S7, 4)})</b> → manter como estão."]),
        ("2", "Sem resposta | SDR 1727", faixa(taxa_seq(info[SR17])), dados(SR17, f" · leitura {pct(info[SR17]['stats']['executionReadRate'], 0)}"),
         f"Desde 14/10 foram só {lid_s} leituras em {env_s} envios. Reescrever o texto não resolve: o número não está entregando (os passos 2, 3 e 4 já foram reescritos em 13/10 e seguem sem resposta). "
         f"Negociação e Faltou AV do 1727 também leem pouco ({faixa_leitura(NEG17, FAL17)}).",
         ["Pausar os envios por este número e checar a qualidade/limite de envio dele no painel do WhatsApp (Meta).",
          f"Mover os contatos desta cadência para a do 7853, que lê {pct(info[S7]['stats']['executionReadRate'], 0)}.",
          "Depois de a leitura voltar a 60% ou mais, retomar com a sequência do 7853 (incluindo o texto de presente do item 1)."]),
        ("3", "Leads frios | SDR 7853", faixa(taxa_seq(info[LF])), dados(LF, f" · {ativos(LF)} em execução"),
         f"Os 3 textos foram reescritos em 13/10, mas a cadência não enviou nada desde então: os {pct(taxa_seq(info[LF]))} são todos dos textos anteriores. "
         "O texto novo do passo 1 tem “avaliação sem compromisso”, mas ainda sem presente. Antes de disparar para toda a base, rode um lote de teste (~500 contatos).",
         ["<b>M1 →</b> “Oiie, [Nome]! ❤️ Faz um tempinho que você procurou a Drenesse, e eu não esqueci de você! Reservei um PRESENTE EXCLUSIVO: um Spa Face GRATUITO e uma AVALIAÇÃO GRATUITA com nossa especialista. "
          "Só tenho horários HOJE e AMANHÃ, e as vagas são limitadas. Qual você prefere?” + botões HOJE e AMANHÃ.",
          "<b>M2 →</b> manter “o que mais te incomoda hoje?”.",
          "<b>M3 (encerramento) →</b> “Olá, [Nome]. Vou encerrar seu atendimento por aqui, mas antes quero garantir seu presente: Spa Face GRATUITO e AVALIAÇÃO GRATUITA, válidos apenas esta semana. "
          "Quer que eu reserve seu horário?” + botões QUERO MEU PRESENTE e AGORA NÃO.",
          f"Cenário ilustrativo: chegar a 7,5% nos ~{fnum(sum(p['ex'] for p in por_seq[LF]) // 1000 * 1000)} envios que os 3 passos já fizeram traria ~{ganho} respostas a mais."]),
        ("4", "Cadência Eventos – Social Selling 7853", faixa(taxa_seq(info[EV])), dados(EV, f" · {ativos(EV)} em execução"),
         "Reduzir de 10 para 4–6 toques e espaçar (hoje são 8 dias seguidos). Antes do próximo evento, reaproveitar só as melhores e conferir por que os toques 1 e 2 (oferta Glow Up Premium) não registram envio.",
         [f"Manter: Evento 3 ({T(EV, 3)}), Evento 6 “áudio” ({T(EV, 6)}), Evento 7 “1 ou 2” ({T(EV, 7)}), Evento 10 encerramento ({T(EV, 10)}).",
          f"Excluir: Evento 4 ({T(EV, 4)}), 5 ({T(EV, 5)}), 8 ({T(EV, 8)}), 9 ({T(EV, 9)}).",
          "<b>Evento 1 →</b> acrescentar a AVALIAÇÃO GRATUITA ao Glow Up Premium e usar botões HOJE e AMANHÃ."]),
    ]
    for it in itens:
        F.append(item_mudar(*it))

    h3 = st("h3x", fontName="DV-B", fontSize=10, leading=13, spaceBefore=6, spaceAfter=2)
    F += [KeepTogether([P("Alimentar a cadência que mais funciona", h3),
          P(f"A <b>Sem resposta / REATIV 7853</b> ({pct(taxa_seq(info[R]))}) foi de {ativos(R, 'pos')} para {ativos(R)} contatos em execução e o passo 1 não recebeu ninguém novo desde 14/10. "
            "É a cadência com melhor taxa entre as de contato frio e já está com a reavaliação gratuita nos dois passos. Coloque mais contatos nela (por exemplo, clientes que não voltam há meses) "
            "e meça o texto novo a partir dos envios depois de 14/10.", S_P)]),
          P("Aguardar volume dos textos de 13/10 (não trocar ainda)", h3)]
    F += bullets([
        f"<b>Negociação 7853 e 1727</b> (passos 2 e 3) e <b>Faltou AV 7853 e 1727</b> (passos 3 e 4): os textos novos têm menos de 60 envios cada. Se, com 100+ envios, o passo continuar abaixo de 8% de resposta, "
        "usar na Negociação: “Oiie, [Nome]! ❤️ Que bom que você veio nos conhecer! Quero te dar um PRESENTE para você começar do jeito que cabe na sua rotina: uma REAVALIAÇÃO GRATUITA com nossa especialista "
        "e um Spa Face totalmente GRATUITO. Os horários são limitados, só tenho HOJE e AMANHÃ. Qual você prefere?” e, no Faltou AV, acrescentar a AVALIAÇÃO GRATUITA ao presente do passo 3.",
        f"<b>Pré AV 1727</b> (passo 3): o lembrete novo ainda não tem envios; comparar com o lembrete do 7853 ({T(PRE7, 5)} de resposta).",
    ])
    c6554 = [s for s in SEQS if "6554" in s["name"] and s["stats"] and s["stats"]["executionCount"] > 0]
    ult = max(s["updated"] for s in c6554)
    F += [KeepTogether([P("Também desativar ou arquivar", h3),
          P(f"Sequências do canal 6554 (Sem resposta, Negociação, Faltou AV, Pré AV): 37 a 117 envios, nenhum contato em execução, sem confirmação de leitura e última alteração em "
            f"{'/'.join(reversed(ult.split('-')[1:]))}/{ult[:4]} — a Sem resposta 6554 está em {pct(taxa_seq(info['Sem resposta | SDR 6554']))} (Crítico). Se não há mais uso, arquivar. "
            f"Também as {len(sem_envio)} sequências com 0 envio listadas na página anterior.", S_P)]),
          KeepTogether([P("Como medir depois da troca", h3),
          P("Rodar <b>coletar_dados.py</b> e este relatório de novo em 15 dias. A seção “O que mudou em 13/10” compara automaticamente a coleta nova com as anteriores e separa os envios feitos depois da troca. "
            "Meta: nenhuma mensagem com volume relevante abaixo de 7% de resposta e Leads frios acima de 7%. Os totais do Lever acumulam o histórico; compare sempre janela com janela.", S_P)])]
    return F


def pagina(c, d):
    c.saveState()
    c.setFillColor(PINK)
    c.rect(0, A4[1] - 0.2 * cm, A4[0], 0.2 * cm, stroke=0, fill=1)
    c.setFont("DV", 6.8)
    c.setFillColor(MUTED)
    c.drawString(1.8 * cm, 1.1 * cm, f"Drenesse · Setor de Processos · Análise de engajamento das sequências Lever · dados de {DATA_TXT}")
    c.drawRightString(A4[0] - 1.8 * cm, 1.1 * cm, str(d.page))
    c.restoreState()


if __name__ == "__main__":
    doc = SimpleDocTemplate(SAIDA, pagesize=A4, leftMargin=2.0 * cm, rightMargin=2.0 * cm, topMargin=1.6 * cm, bottomMargin=1.9 * cm,
                            title="Análise de Engajamento – Sequências Lever", author="Setor de Processos – Drenesse")
    doc.build(montar(), onFirstPage=pagina, onLaterPages=pagina)
    print("OK", SAIDA)
