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
DADOS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, "dados_2026-09-30.json")
SAIDA = sys.argv[2] if len(sys.argv) > 2 else os.path.join(AQUI, "Analise_Sequencias_Lever_2026-09-30.pdf")

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
    return {
    "Agendados / REATIV 7853":
        "Mensagem única de confirmação + orientação. Melhor taxa do Lever: mensagem útil, sem pedido de venda, gera resposta natural. <b>Manter.</b>",
    PRE7:
        f"Confirmação curta ({T(PRE7, 1)}) e o lembrete de 22h ({T(PRE7, 5)}) são os melhores. O vídeo da Aisi ({T(PRE7, 4)}) é o mais fraco, mas ainda passa de 20%; "
        f"o Stimullus ({T(PRE7, 6)}) também vai bem porque a cliente já está agendada. <b>Manter.</b>",
    "Falhou / REATIV 7853":
        "Tom de utilidade (“antes de reorganizar nossa agenda”) + “hoje e amanhã”. Funciona. <b>Manter.</b>",
    PRE17:
        f"Lembrete simples vai bem ({T(PRE17, 1)}). A foto de resultado ({T(PRE17, 3)}) é o ponto fraco — trocar pelo lembrete “sua sessão está agendada” usado no 7853 ({T(PRE7, 5)}).",
    "Pré AV SDR 6554":
        "Canal sem confirmação de leitura; amostra pequena (37 envios). A foto de resultado teve 0 respostas.",
    "Sem resposta / REATIV 7853":
        f"Motor de conversas do Lever: {fnum(s['executionInteractionCount'])} respostas. A 2ª mensagem responde MAIS que a 1ª ({T('Sem resposta / REATIV 7853', 2)} × {T('Sem resposta / REATIV 7853', 1)}) — "
        "escassez + escolha de horário. <b>Modelo a copiar para outras cadências.</b>",
    NEG17:
        f"1ª mensagem boa ({T(NEG17, 1)}); cai forte nas seguintes e a leitura despenca (36% no 3º toque).",
    FAL17:
        f"Mensagem 1 ok ({T(FAL17, 1)}); 2 a 4 abaixo de 10% e leitura de só 32% no último toque.",
    FAL7:
        f"Utilidades 1 e 2 seguram {T(FAL7, 1)}/{T(FAL7, 2)}. O 3º toque (“empurrãozinho”) cai para {T(FAL7, 3)}; o Spa Face do 4º toque recupera ({T(FAL7, 4)}).",
    NEG7:
        f"1ª mensagem forte ({T(NEG7, 1)}), mas os toques 2 e 3 repetem a mesma pergunta de objeção e caem para ~{T(NEG7, 3)}.",
    "Faltou AV| SDR 6554":
        "Canal sem confirmação de leitura; amostra pequena. Após a 1ª mensagem, 1 resposta por toque.",
    "Negociação| SDR 6554":
        "Canal sem confirmação de leitura; amostra pequena. A foto de resultado teve nenhuma resposta.",
    S7:
        f"Maior volume do Lever ({fnum(s['executionCount'])} envios, {fnum(info[S7]['executing'])} contatos em execução). A pergunta curta “o que te incomoda hoje?” é a melhor abertura fria ({T(S7, 1)}). "
        f"O conteúdo educativo do combo Stimullus é o pior toque ({T(S7, 3)}).",
    SR17:
        f"Leitura de apenas {pct(s['executionReadRate'], 0)} e duas mensagens quase sem resposta ({T(SR17, 2)} e {T(SR17, 5)}). Cadência desatualizada em relação à versão 7853.",
    "Sem resposta | SDR 6554":
        "Canal sem confirmação de leitura; amostra pequena. Nenhuma mensagem passou de 12%.",
    EV:
        "10 toques em 10 dias é longo demais: a leitura cai de 63% para 46% e as mensagens 4, 5, 8 e 9 ficam abaixo de 5%. "
        "Os toques 1 e 2 (abertura com o Glow Up Premium) não têm nenhum envio registrado — conferir no Lever se disparam.",
    LF:
        f"{pct(leads_frios_pct, 0)} de todos os disparos com {pct(taxa_seq(info[LF]))} de resposta e {pct(s['executionReadRate'], 0)} de leitura. Nenhuma das 3 mensagens passa de {T(LF, 3)}. "
        "A melhor é a pergunta binária “aqui ou por ligação?”. Os 19,9 mil do total incluem mensagens antigas já removidas (as 3 atuais somam 11,7 mil).",
    }[nome]


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
        cel = P(f"<b>{esc(p['tname'])}</b><font color='#777777'>{tag}</font><br/><font color='#777777'>“{esc(trecho(p['text']))}”</font>", S_C)
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
    rea = info["Sem resposta / REATIV 7853"]["stats"]["executionInteractionCount"]
    F += bullets([
        f"<b>O que mais engaja:</b> mensagens curtas de <b>confirmação/utilidade</b> (Agendados {pct(taxa_seq(info['Agendados / REATIV 7853']))}, Pré AV 7853 {pct(taxa_seq(info[PRE7]))}, "
        f"Falhou {pct(taxa_seq(info['Falhou / REATIV 7853']))}) e a <b>oferta de Spa Face gratuito com prazo “hoje ou amanhã”</b> na Reativação "
        f"({T('Sem resposta / REATIV 7853', 1)}–{T('Sem resposta / REATIV 7853', 2)} por mensagem, {fnum(rea)} respostas — a sequência que mais gera conversas).",
        f"<b>O que menos engaja:</b> mensagens “educativas/curiosidade” (“Você sabia…”, “60% das pessoas…”, combo Stimullus), perguntas abertas de objeção no 2º/3º toque da Negociação e toda a sequência de "
        f"<b>Leads frios | SDR 7853 ({pct(taxa_seq(info[LF]))})</b>, que consome {fnum(info[LF]['stats']['executionCount'])} envios — {pct(leads_frios_pct, 0)} de todo o volume.",
        "<b>Padrão de queda:</b> em quase toda cadência a 1ª mensagem responde 2 a 3× mais que as seguintes. Os toques 2–4 precisam trocar de abordagem (oferta concreta + escolha simples), não repetir a pergunta.",
        f"<b>Canal 1727 lê pouco:</b> {pct(info[SR17]['stats']['executionReadRate'], 0)} de leitura no Sem resposta e 47–52% em Negociação e Faltou AV, contra 67–75% no 7853 nas mesmas etapas. "
        "A mesma mensagem performa pior nele — vale revisar a qualidade/saúde desse número.",
        "<b>Ação:</b> a lista final (página “Cadências que você deve mudar”) traz 9 cadências priorizadas, qual mensagem trocar e o texto sugerido para substituir.",
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
        ("Conteúdo educativo / curiosidade", f"“Você sabia… combo Stimullus” {T(S7, 3)} · “60% das pessoas têm inchaço” {T(LF, 2)} · “Uma curiosidade…” {T(EV, 4)}"),
        ("Repetir a pergunta de objeção", f"Negociação 7853: toques 2 e 3 perguntam de novo “o que te impede / o que falta” → {T(NEG7, 2)} e {T(NEG7, 3)}"),
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
          P("Ordenadas por impacto (volume × distância da média). Em cada uma: o que trocar e o texto sugerido, baseado nos modelos que já performam bem no próprio Lever.", S_GRAY), Spacer(1, 8)]

    def dados(s_nome):
        s = info[s_nome]["stats"]
        return f"resposta {pct(taxa_seq(info[s_nome]))} · {fnum(s['executionCount'])} envios"

    ganho = round(sum(p["ex"] for p in por_seq[LF]) * 0.075 - sum(p["it"] for p in por_seq[LF]))
    itens = [
        ("1", "Leads frios | SDR 7853", faixa(taxa_seq(info[LF])), dados(LF),
         f"Trocar as 3 mensagens. Reduzir o volume diário até a taxa subir (leitura de {pct(info[LF]['stats']['executionReadRate'], 0)} indica base desgastada). "
         f"Cenário ilustrativo: chegar a 7,5% nos ~11,7 mil envios dos passos atuais traria ~{ganho} respostas a mais por ciclo.",
         [m(LF, 1, "", "“Oii [NOME]! Sentimos sua falta! Separei um Spa Face GRATUITO pra você usar hoje ou amanhã. Qual horário fica melhor?”"),
          m(LF, 2, "", "“Oii [NOME], o que te incomoda hoje?”"),
          m(LF, 3, "", "manter a pergunta binária “aqui ou por ligação?” como último toque.")]),
        ("2", "Sem resposta | SDR 7853", faixa(taxa_seq(info[S7])), dados(S7),
         f"Manter M1 ({T(S7, 1)}). Trocar M3 e reforçar M2 — é a cadência de maior volume, cada ponto percentual na sequência = ~{round(info[S7]['stats']['executionCount'] / 100 / 10) * 10} respostas.",
         [m(S7, 3, "“combo Stimullus”", "“Oii [NOME]! Liberei poucas vagas de sessão experimental essa semana. Prefere hoje ou amanhã?”"),
          m(S7, 2, "", "encurtar e dar opções: “[NOME], o que te trouxe até a Drenesse? Inchaço, gordura localizada ou flacidez?”"),
          f"<b>M4 ({T(S7, 4)})</b> manter (utilidade) e reavaliar após a troca da M3."]),
        ("3", "Negociação | SDR 7853", faixa(taxa_seq(info[NEG7])), "toques 2–3 críticos · " + dados(NEG7),
         f"M1 é ótima ({T(NEG7, 1)}). Toques 2 e 3 repetem a objeção — trocar por oferta concreta.",
         [m(NEG7, 2, "", "“Separei um mimo pra você, [NOME]! Como você já fez sua avaliação, quero te dar prioridade antes de abrir pra mais gente. Posso te contar?”"),
          m(NEG7, 3, "", "“[NOME], consegui segurar a condição da sua avaliação até amanhã. Quer que eu reserve seu primeiro horário?”")]),
        ("4", "Faltou AV | SDR 7853", faixa(taxa_seq(info[FAL7])), "toque 3 crítico · " + dados(FAL7),
         f"Trocar só a M3 (“empurrãozinho”, {T(FAL7, 3)}). O Spa Face ({T(FAL7, 4)}) funciona — antecipar.",
         ["<b>M3 →</b> mover o “Consegui um presente… Spa Face gratuito na sua avaliação” para a posição 3.",
          "<b>M4 →</b> usar o modelo do Falhou/REATIV: “Antes de reorganizar nossa agenda, você ainda deseja remarcar? Tenho horários hoje e amanhã.”"]),
        ("5", "Cadência Eventos – Social Selling 7853", faixa(taxa_seq(info[EV])), dados(EV),
         "Reduzir de 10 para 4–6 toques. Antes do próximo evento, reaproveitar só as melhores e conferir por que os toques 1 e 2 (oferta Glow Up Premium) não registram envio.",
         [f"Manter: Evento 3 ({T(EV, 3)}), Evento 6 “áudio” ({T(EV, 6)}), Evento 7 “1 ou 2” ({T(EV, 7)}), Evento 10 encerramento ({T(EV, 10)}).",
          f"Excluir: Evento 4 ({T(EV, 4)}), 5 ({T(EV, 5)}), 8 ({T(EV, 8)}), 9 ({T(EV, 9)})."]),
        ("6", "Sem resposta | SDR 1727", faixa(taxa_seq(info[SR17])), dados(SR17),
         f"Leitura de {pct(info[SR17]['stats']['executionReadRate'], 0)} e duas mensagens mortas. Alinhar com a versão 7853 e checar a saúde do número 1727.",
         [f"Excluir M2 ({T(SR17, 2)}) e M5 ({T(SR17, 5)}).",
          "Usar a sequência: “o que te incomoda hoje?” → sessão experimental 2 dias → utilidade “seu atendimento segue em aberto”."]),
        ("7", "Faltou AV | SDR 1727", faixa(taxa_seq(info[FAL17])), "toques 2–4 fracos · " + dados(FAL17),
         f"Substituir M2 a M4 (8–10%) pelas utilidades do 7853 ({T(FAL7, 1)} e {T(FAL7, 2)}).",
         ["<b>M2 →</b> “UTILIDADE FALTOU AV 2”; <b>M3 →</b> Spa Face; <b>M4 →</b> excluir (32% de leitura)."]),
        ("8", "Negociação | SDR 1727", faixa(taxa_seq(info[NEG17])), "toque 3 crítico · " + dados(NEG17),
         f"Mesmo ajuste da Negociação 7853: M3 ({T(NEG17, 3)}, 36% de leitura) → oferta concreta.", []),
        ("9", "Pré AV SDR 1727", faixa(taxa_seq(info[PRE17])), "toque 3 fraco · " + dados(PRE17),
         f"Trocar só a M3, foto de resultado ({T(PRE17, 3)}).",
         [f"<b>M3 →</b> “Oi, [NOME]. Tudo bem? Passando para lembrar que sua sessão está agendada.” ({T(PRE7, 5)} no 7853)"]),
    ]
    for it in itens:
        F.append(item_mudar(*it))

    c6554 = [s for s in SEQS if "6554" in s["name"] and s["stats"] and s["stats"]["executionCount"] > 0]
    ult = max(s["updated"] for s in c6554)
    F += [P("Também desativar ou arquivar", st("h3c", fontName="DV-B", fontSize=10, leading=13, spaceBefore=4, spaceAfter=2)),
          P(f"Sequências do canal 6554 (Sem resposta, Negociação, Faltou AV, Pré AV): 37 a 117 envios, nenhum contato em execução, sem confirmação de leitura e última alteração em "
            f"{'/'.join(reversed(ult.split('-')[1:]))}/{ult[:4]} — se não há mais uso, arquivar. Também as {len(sem_envio)} sequências com 0 envio listadas na página anterior.", S_P),
          P("Como medir depois da troca", st("h3d", fontName="DV-B", fontSize=10, leading=13, spaceBefore=4, spaceAfter=2)),
          P("Rodar esta mesma análise em 15 dias. Meta: nenhuma mensagem com volume relevante abaixo de 7% de resposta, e Leads frios acima de 7%. "
            "Como os totais do Lever acumulam o histórico, comparar pela taxa de cada mensagem nova, não pelo total da sequência.", S_P)]
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
