#!/usr/bin/env python3
"""Gera o PDF "Análise de engajamento das campanhas Lever" a partir do snapshot da coleta.

Uso: python3 gerar_relatorio_campanhas.py [campanhas.json] [saida.pdf]
Requer: reportlab. O snapshot vem de coletar_campanhas.py (campanhas_AAAA-MM-DD.json).
"""
import glob, json, os, re, sys, unicodedata
from collections import defaultdict

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (Flowable, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle)

AQUI = os.path.dirname(os.path.abspath(__file__))
DADOS = sys.argv[1] if len(sys.argv) > 1 else sorted(glob.glob(os.path.join(AQUI, "campanhas_*.json")))[-1]

FD = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("DV", FD + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DV-B", FD + "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFontFamily("DV", normal="DV", bold="DV-B", italic="DV", boldItalic="DV-B")

PINK, PINK_L = colors.HexColor("#d6588c"), colors.HexColor("#e8a9c5")
INK, MUTED, LINE = colors.HexColor("#2b2b2b"), colors.HexColor("#777777"), colors.HexColor("#e6e6e6")
STATUS = {
    "Forte": (colors.HexColor("#1f7a44"), colors.HexColor("#e1f1e6")),
    "Regular": (colors.HexColor("#557a1c"), colors.HexColor("#eef2dc")),
    "Atenção": (colors.HexColor("#b07a12"), colors.HexColor("#fdf0d6")),
    "Crítico": (colors.HexColor("#c0392b"), colors.HexColor("#fbe0dd")),
}
BG_BEST, BG_WORST = colors.HexColor("#e1f1e6"), colors.HexColor("#fbe0dd")

# ---------------------------------------------------------------- dados
snap = json.load(open(DADOS, encoding="utf-8"))
DATA_TXT = "/".join(reversed(snap["coletado_em"].split("-")))
SAIDA = sys.argv[2] if len(sys.argv) > 2 else os.path.join(AQUI, f"Analise_Campanhas_Lever_{snap['coletado_em']}.pdf")
TPL, FLX = snap["templates"], snap["fluxos"]


def norm(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def segmento(r):
    n = norm(f"{r['name']} {r['modelo']}")
    nome = norm(r["name"])
    if re.search(r"cobran|inadimpl", n):
        return "Cobrança"
    if re.search(r"evento|expoeduc|be\.move|forjadas|corrida|conexao espaco|panobianca|processo seletivo|selecao desenvolvedor|laser disparo|confirmacao laser", n):
        return "Eventos e outros"
    if re.search(r"inativ|reativ|relac", n) and not nome.startswith("sdr - "):
        return "Inativos / Reativação"
    if re.search(r"call center|24 ?horas?|48 ?h", n):
        return "Campanha 24h / Call center"
    if re.search(r"faltou|fatlou|falhou|remarcacao", n):
        return "SDR - Faltou AV"
    if re.search(r"negoc|veio e nao fechou|convertidos avulsos", n):
        return "SDR - Negociação"
    if re.search(r"sem resp|semres|semrep|leads frios|sresp|s\.resp|s resposta|cont.* e sem|correria|procura-se|metodo drenesse|teste", n) and "sdr - contato - " not in n:
        return "SDR - Sem resposta / Leads frios"
    return "SDR - Contato / Ofertas"


R = []
for c in snap["campanhas"]:
    if not c.get("env"):
        continue
    t = TPL.get(c["tid"]) if c["tid"] else None
    modelo = t["name"] if t else (FLX.get(c["chatbot"]) or c["name"])
    r = dict(c, modelo=modelo, texto=t["text"] if t else None, cat=t["cat"] if t else None, media=t["media"] if t else None,
             eh_bot=t is None, ent=c["ent"] or 0, lid=c["lid"] or 0, inter=c["inter"] or 0, obj=c["obj"] or 0)
    r["seg"] = segmento(r)
    R.append(r)
n_total_camp, n_sem_envio = len(snap["campanhas"]), len(snap["campanhas"]) - len(R)


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


def trecho(t, n=150):
    t = limpa(t)
    return t if len(t) <= n else t[:n].rsplit(" ", 1)[0].rstrip(",.;:!? ") + "…"


def agg(rows):
    e = sum(r["env"] for r in rows)
    return dict(n=len(rows), env=e, lid=rate(sum(r["lid"] for r in rows), e), resp=rate(sum(r["inter"] for r in rows), e),
                obj=rate(sum(r["obj"] for r in rows), e), ent=rate(sum(r["ent"] for r in rows), e))


TOT = agg(R)
SEGS = defaultdict(list)
for r in R:
    SEGS[r["seg"]].append(r)
ORDEM_SEG = sorted(SEGS, key=lambda s: -sum(r["env"] for r in SEGS[s]))

# modelos (template ou fluxo) por segmento
def modelos(seg, minimo=100):
    g = defaultdict(list)
    for r in SEGS[seg]:
        g[r["modelo"]].append(r)
    out = []
    for nome, v in g.items():
        a = agg(v)
        if a["env"] >= minimo:
            out.append(dict(nome=nome, rows=v, texto=v[0]["texto"], bot=v[0]["eh_bot"], media=v[0]["media"], **a))
    return sorted(out, key=lambda m: -m["resp"])


def mod(sub, seg=None, exato=False):
    """Métricas agregadas de um modelo pelo nome (trecho, ou nome exato)."""
    rows = [r for r in (SEGS[seg] if seg else R) if (sub.lower() == r["modelo"].lower() if exato else sub.lower() in r["modelo"].lower())]
    return agg(rows) if rows else dict(n=0, env=0, lid=0, resp=0, obj=0, ent=0)


def M(sub, seg=None, exato=False):
    a = mod(sub, seg, exato)
    return pct(a["resp"])


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
S_CR = st("cr", fontSize=7.4, leading=9.4, alignment=TA_CENTER)
S_CRB = st("crb", fontSize=7.6, leading=9.4, fontName="DV-B", alignment=TA_CENTER)
S_HD = st("hd", fontSize=7.2, leading=9, fontName="DV-B", textColor=colors.white)
S_HDC = st("hdc", fontSize=7.2, leading=9, fontName="DV-B", textColor=colors.white, alignment=TA_CENTER)
S_NOTE = st("note", fontSize=8, leading=11.2, spaceBefore=3, spaceAfter=7)
H3 = st("h3x", fontName="DV-B", fontSize=10, leading=13, spaceBefore=6, spaceAfter=2)


def P(t, s=S_P):
    return Paragraph(t, s)


def bullets(itens, s=S_BUL):
    return [Paragraph(i, s, bulletText="•") for i in itens]


def cor(f):
    return STATUS[f][0].hexval().replace("0x", "#")


def status_span(f, texto=None):
    return f"<font color='{cor(f)}'><b>{texto or f}</b></font>"


class Barras(Flowable):
    """Barras horizontais (vetorial) no estilo do ranking das sequências."""

    def __init__(self, linhas, media, largura=17 * cm, altura_linha=0.5 * cm, x0=6.4 * cm):
        super().__init__()
        self.linhas, self.media, self.w, self.h_lin, self.x0 = linhas, media, largura, altura_linha, x0
        self.height = altura_linha * len(linhas) + 0.9 * cm

    def wrap(self, *_):
        return self.w, self.height

    def draw(self):
        c, x0, xmax = self.canv, self.x0, 7.0 * cm
        vmax = max(t for _, t in self.linhas)
        for i, (nome, t) in enumerate(self.linhas):
            y = self.height - 0.3 * cm - (i + 1) * self.h_lin + 0.1 * cm
            c.setFont("DV", 7.2)
            c.setFillColor(INK)
            c.drawRightString(x0 - 0.2 * cm, y + 0.07 * cm, nome)
            c.setFillColor(PINK if t >= 0.10 else PINK_L)
            c.rect(x0, y, xmax * t / vmax, 0.34 * cm, stroke=0, fill=1)
            c.setFont("DV", 6.8)
            c.setFillColor(MUTED)
            c.drawString(x0 + xmax * t / vmax + 0.2 * cm, y + 0.08 * cm, f"{pct(t)}  ·  {faixa(t)}")
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
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BACKGROUND", (0, 0), (-1, 0), INK),
                           ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE), ("TOPPADDING", (0, 0), (-1, -1), 3.2),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2), ("LEFTPADDING", (0, 0), (-1, -1), 4),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 4)] + (extra or [])))
    return t


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
    return KeepTogether([caixa, Spacer(1, 8)])


# ---------------------------------------------------------------- análises
SDR_SEGS = [s for s in SEGS if s.startswith("SDR")]
sdr_base = [r for r in R if r["seg"] in SDR_SEGS and r["texto"] and r["env"] >= 50]
FEATS = {
    "presente": lambda t: bool(re.search(r"presente|brinde|gr[aá]tis|gratuit|mimo|spa face|sorteio|cortesia|ganhou|sem custo", t, re.I)),
    "preco": lambda t: bool(re.search(r"r\$|\d+[,.]\d{2}|por apenas|reais", t, re.I)),
    "escassez": lambda t: bool(re.search(r"hoje|amanh[aã]|s[oó] at[eé]|[uú]ltim|vagas|apenas|encerr|prazo|acaba|limitad", t, re.I)),
    "curiosidade": lambda t: bool(re.search(r"voc[eê] sabia|segredo|curiosidade|descobr|por que|porque", t, re.I)),
}


def feat(nome, seg):
    """Compara campanhas COM e SEM a característica de texto, dentro de um segmento (evita misturar públicos)."""
    base = [r for r in SEGS[seg] if r["texto"] and r["env"] >= 50]
    a = agg([r for r in base if FEATS[nome](r["texto"])])
    b = agg([r for r in base if not FEATS[nome](r["texto"])])
    return a, b


def delta(a, b):
    return f"{(a['resp'] - b['resp']) * 100:+.1f} pp".replace(".", ",")


def audio():
    seg = "SDR - Sem resposta / Leads frios"
    a = agg([r for r in SEGS[seg] if "audio" in norm(r["name"] + " " + r["modelo"])])
    b = agg([r for r in SEGS[seg] if "audio" not in norm(r["name"] + " " + r["modelo"])])
    return a, b


def desgaste():
    g = defaultdict(list)
    for r in SEGS.get("SDR - Sem resposta / Leads frios", []):
        g[r["criada"][:7]].append(r)
    return {k: agg(v) for k, v in sorted(g.items())}


def faixa_repeticoes():
    rep = repetidos_inativos()
    taxas = [rate(r["inter"], r["env"]) for r in rep]
    return len(rep), pct(min(taxas), 0), pct(max(taxas), 0), rep[0]["criada"], rep[-1]["criada"]


def repetidos_inativos():
    rows = [r for r in SEGS.get("Inativos / Reativação", []) if re.search(r"inativos? (2020|20-26|22-26)", norm(r["name"])) and r["env"] >= 300]
    return sorted(rows, key=lambda r: r["criada"])


COMENT = lambda seg: {
    "Inativos / Reativação":
        f"É o maior volume e o que mais converte (objetivos ganhos: {pct(agg(SEGS[seg])['obj'], 1)}). Melhores modelos: lembrete “passando para confirmar a sua sessão?” ({M('confirmar sessao 01', 'Inativos / Reativação')}, base 4 a 12 meses e 1 a 3 meses), "
        f"“sessão em aberto perto de vencer” ({M('DISPARO INATIVOS 18/08')}) e o PRESENTE ESPECIAL ({M('Campanha 06 / 08', seg)} em {mod('Campanha 06 / 08', seg)['n']} campanhas). "
        f"Piores: os fluxos de chatbot de “Disparo 14.04.26” ({M('Disparo 14.04.26')}), “Disparo 16.04.26” ({M('Disparo 16.04.26')}) e o vídeo da Aisi ({M('Disparo 31.03')}), "
        f"todos para a mesma base Inativos 2020-2026, repetida {faixa_repeticoes()[0]} vezes (de {faixa_repeticoes()[3][8:]}/{faixa_repeticoes()[3][5:7]} a {faixa_repeticoes()[4][8:]}/{faixa_repeticoes()[4][5:7]}), com resposta de só {faixa_repeticoes()[1]} a {faixa_repeticoes()[2]}.",
    "SDR - Contato / Ofertas":
        f"Melhores: o fluxo “Ativo Sem Imposto” ({M('ATIVO SEM IMPOSTO')}), o presente “Spa Face Dia das Mães” ({M('SPA FACE DIA DAS MAES')} em {fnum(mod('SPA FACE DIA DAS MAES')['env'])} envios, o maior disparo do período) e a ligação “preciso falar com você” ({M('LIGAÇÃO 28/05')}). "
        f"Piores: as ofertas de preço da Drenagem, que foram caindo: “Drenagem 98,90” {M('Drenagem 98,90', seg, True)} ({fnum(mod('Drenagem 98,90', seg, True)['env'])} envios), “Drenagem Novo” {M('Drenagem Novo', seg)}, "
        f"“Oferta Drenagem 98,90” {M('Oferta Drenagem', seg)} e “combo drenagem e limpeza” {M('contato combo', seg)}.",
    "SDR - Sem resposta / Leads frios":
        f"Melhores: mensagens de áudio (COPA áudio {M('COPA audio')}, “Áudio 26/08” {M('DISPARO AUDIO 26/08')}) e a campanha da Copa ({M('COPA SDR 11/06')}). "
        f"Piores: ofertas de preço (“MÉTODO DRENESSE por R$ 98,70/89,90”: {M('DISPARO 23/07')} e {M('DISPARO 10/09')}), “Gatilho: Oportunidade limitada” ({M('Oportunidade')}), "
        f"“Seu corpo não precisa de mais um tratamento genérico” ({M('DISPARO 06/10', seg)}, leitura {pct(mod('DISPARO 06/10', seg)['lid'], 0)}) e “Procura-se” ({M('PROCURA-SE', seg)}). "
        f"Exceção: o combo de 2 sessões por R$ 189,90 de junho ({M('Disparo 16.05')}), enviado no embalo da Copa. Desgaste da base: veja a tabela na página “O que funciona × o que não funciona”.",
    "SDR - Faltou AV":
        f"Melhores: lembrete de sessão (“confirmar sessão 24/07”, {M('confirmar sessão 24/07')}, com objetivos de {pct(mod('confirmar sessão 24/07')['obj'], 1)}), “Procura-se” ({M('DISPARO 01/09', seg)}–{M('Disparo 18/08', seg)}) e Sexta da Transformação ({M('FALTOU AVALIAÇÃO - SEXTA', seg)}). "
        f"Piores: remarcação direta (“vamos remarcar sua avaliação”, {M('Dsparo 29/09')}), “Presente na remarcação” ({M('Presente na remarcação')}, leitura {pct(mod('Presente na remarcação')['lid'], 0)}, base antiga de jan–jun) e Páscoa ({M('PASCOA')}).",
    "SDR - Negociação":
        f"Melhores: campanhas com data/evento (Sexta da Transformação, {M('SEXTA DA TRASNFORMAÇÃO 14/08')} e {M('NEGOCIAÇÃO - SEXTA')}) e Sem Imposto ({M('NEGOCIAÇÃO sdr CAMPANHA 27')}). "
        f"Piores: ofertas de preço (combo R$ 596,10 em 3x de 99: {M('DISPARO 24/07 NEGOCIAÇÃO')}; oferta relâmpago: {M('13/08 PROMOÇÃO DRENAGEM', seg)}) e o fluxo da Copa ({M('COPA SDR NEGOCIAÇÃO')}).",
    "Campanha 24h / Call center":
        f"O mesmo conceito de 24 horas rende muito mais para a base de clientes (fluxo “Call center”, {M('24 Horas - Campanha')}, objetivos {pct(mod('24 Horas - Campanha')['obj'], 1)}) do que para leads SDR ({M('24 Horas - SDR')}, objetivos {pct(mod('24 Horas - SDR')['obj'], 1)}).",
    "Eventos e outros":
        "Públicos pequenos e já interessados (inscritos em evento, agenda de laser): respondem muito acima de qualquer disparo frio. Não servem de referência de taxa para as demais campanhas, mas mostram que contexto específico + convite direto funciona.",
    "Cobrança":
        "Volume muito pequeno para concluir.",
}.get(seg, "")


# ---------------------------------------------------------------- blocos
def bloco_segmento(seg):
    ms = modelos(seg)
    if not ms:
        return None
    a = agg(SEGS[seg])
    f = faixa(a["resp"])
    cab = P(f"<b>{esc(seg)}</b> &nbsp; <font size='7.6'>{status_span(f, '● ' + f)} · <b>{pct(a['resp'])} de resposta · {fnum(a['env'])} envios · {a['n']} campanhas</b></font>", S_H2)
    if len(ms) > 10:
        ms = ms[:6] + ms[-4:]
    melhor, pior = (ms[0], ms[-1]) if len(ms) > 1 else (None, None)
    linhas = [[P("#", S_HD), P("Modelo / trecho da mensagem", S_HD), P("Camp.", S_HDC), P("Envios", S_HDC), P("Leitura", S_HDC),
               P("Resp.", S_HDC), P("Objetivo", S_HDC)]]
    extra = []
    for i, m in enumerate(ms, start=1):
        tag = {"IMAGE": " [IMAGEM]", "VIDEO": " [VÍDEO]", "DOCUMENT": " [DOCUMENTO]"}.get(m["media"] or "", "")
        trecho_txt = f"“{esc(trecho(m['texto']))}”" if m["texto"] else "fluxo de chatbot (texto não disponível pela API)"
        cel = P(f"<b>{esc(m['nome'])}</b><font color='#777777'>{tag}</font><br/><font color='#777777'>{trecho_txt}</font>", S_C)
        marca = " ▲" if m is melhor else " ▼" if m is pior else ""
        linhas.append([P(str(i), S_C), cel, P(str(m["n"]), S_CR), P(fnum(m["env"]), S_CR), P(pct(m["lid"], 0), S_CR),
                       P(pct(m["resp"]) + marca, S_CRB), P(pct(m["obj"]), S_CR)])
        if m is melhor:
            extra.append(("BACKGROUND", (0, i), (-1, i), BG_BEST))
        elif m is pior:
            extra.append(("BACKGROUND", (0, i), (-1, i), BG_WORST))
    tab = tabela(linhas, [0.7 * cm, 8.3 * cm, 1.5 * cm, 1.6 * cm, 1.5 * cm, 1.8 * cm, 1.6 * cm], extra)
    nota = "" if len(modelos(seg)) <= 10 else f" Mostrando os 6 melhores e os 4 piores de {len(modelos(seg))} modelos com 100+ envios."
    return KeepTogether([cab, tab, P(f"<b>Leitura:</b> {COMENT(seg)}{nota}", S_NOTE)])


# ---------------------------------------------------------------- montagem
def montar():
    F = []
    inat, sdr = agg(SEGS["Inativos / Reativação"]), agg([r for r in R if r["seg"] in SDR_SEGS])
    SC, SF, SN, SA = "SDR - Contato / Ofertas", "SDR - Sem resposta / Leads frios", "SDR - Negociação", "SDR - Faltou AV"
    pc, pc0 = feat("presente", SC)
    pn, pn0 = feat("presente", SN)
    pf, pf0 = feat("presente", SF)
    rc, rc0 = feat("preco", SC)
    rn, rn0 = feat("preco", SN)
    rf, rf0 = feat("preco", SF)
    cc, cc0 = feat("curiosidade", SC)
    au, au0 = audio()
    des = desgaste()
    meses = list(des)
    pico = max((m for m in meses if des[m]["env"] >= 1000), key=lambda m: des[m]["lid"], default=meses[0])
    ultimo = [m for m in meses if des[m]["env"] >= 500][-1]

    # ------------------------------------------------ capa
    F += [Spacer(1, 0.9 * cm), P("Análise de engajamento das campanhas Lever", S_T),
          P(f"Quais campanhas e quais modelos de mensagem geram mais (e menos) retorno · dados extraídos da API do Lever em {DATA_TXT}", S_SUB)]

    def card(valor, rot):
        return [P(f"<font color='#d6588c'><b>{valor}</b></font>", st("kv", fontSize=19, leading=23)), P(rot, st("kl", fontSize=7.2, leading=9.5, textColor=MUTED))]

    kp = Table([[card(fnum(TOT["env"]), f"mensagens enviadas<br/>({len(R)} campanhas com envio)"), card(pct(TOT["lid"]), "taxa média de leitura"),
                 card(pct(TOT["resp"]), "taxa média de resposta<br/>(conversas iniciadas ÷ envios)"),
                 card(fnum(sum(r["obj"] for r in R)), f"objetivos ganhos<br/>({pct(TOT['obj'])} dos envios)")]], colWidths=[4.25 * cm] * 4)
    kp.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f6f6f6")), ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                            ("LINEAFTER", (0, 0), (2, 0), 0.5, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    F += [kp, Spacer(1, 0.6 * cm), P("Resumo em 30 segundos", S_H1), Spacer(1, 3)]
    utili = agg([r for r in R if r["cat"] == "UTILITY" and r["env"] >= 50])
    mkt = agg([r for r in R if r["cat"] == "MARKETING" and r["env"] >= 50])
    F += bullets([
        f"<b>O que mais engaja:</b> campanhas para quem já conhece a clínica — Inativos/Reativação ({pct(inat['resp'])} de resposta e {pct(inat['obj'])} de objetivos ganhos, o melhor retorno em vendas entre os públicos de maior volume) — "
        f"e mensagens de <b>confirmação de sessão</b> (“passando para confirmar a sua sessão?”: {M('confirmar sessao 01', 'Inativos / Reativação')}). Também se destacam o <b>presente Spa Face de Dia das Mães</b> ({M('SPA FACE DIA DAS MAES')} em {fnum(mod('SPA FACE DIA DAS MAES')['env'])} envios), "
        f"o fluxo “Ativo Sem Imposto” ({M('ATIVO SEM IMPOSTO')}) e os áudios.",
        f"<b>Presente ajuda onde há interesse, não na base fria:</b> no Contato, textos com presente fazem {pct(pc['resp'])} contra {pct(pc0['resp'])} sem; na Negociação, {pct(pn['resp'])} contra {pct(pn0['resp'])}. "
        f"Na base fria (Sem resposta / Leads frios) não muda nada: {pct(pf['resp'])} com presente e {pct(pf0['resp'])} sem. Ali só o <b>áudio</b> se destacou ({pct(au['resp'])} contra {pct(au0['resp'])}).",
        f"<b>O que menos engaja:</b> <b>preço no texto</b> derruba a resposta no Contato ({pct(rc['resp'])} com valor contra {pct(rc0['resp'])} sem, {delta(rc, rc0)}) e na Negociação ({pct(rn['resp'])} contra {pct(rn0['resp'])}); "
        f"curiosidade/gatilho também ({pct(cc['resp'])} contra {pct(cc0['resp'])} no Contato). Na base fria nenhuma característica do texto mudou o resultado: são ~{pct(agg(SEGS[SF])['resp'])} de resposta qualquer que seja a copy.",
        f"<b>Base desgastada:</b> nos disparos Sem resposta / Leads frios a leitura caiu de {pct(des[pico]['lid'], 0)} ({pico[5:]}/{pico[2:4]}) para {pct(des[ultimo]['lid'], 0)} ({ultimo[5:]}/{ultimo[2:4]}) "
        f"e a resposta de {pct(des[pico]['resp'])} para {pct(des[ultimo]['resp'])}. A base Inativos 2020-2026 foi disparada {faixa_repeticoes()[0]} vezes e rendeu só {faixa_repeticoes()[1]} a {faixa_repeticoes()[2]} (contra 12,5% nos primeiros disparos de março).",
        "<b>Limite dos dados:</b> a API não entrega o texto dos fluxos de chatbot, então essas campanhas aparecem pelo nome do fluxo. As conclusões sobre texto valem para as campanhas de template.",
        "<b>Ação:</b> a última página lista o que parar, o que mudar e o que replicar.",
    ])
    F += [Spacer(1, 6), P("Como ler os números", H3),
          P("<b>Taxa de resposta</b> = conversas iniciadas pelo contato depois do disparo ÷ mensagens enviadas (métrica do ranking). <b>Leitura</b> = lidas ÷ enviadas. <b>Objetivo</b> = objetivos ganhos ÷ enviadas (venda/agendamento marcado no Lever). "
            f"Faixas de resposta: {status_span('Forte', 'Forte ≥ 15%')} · {status_span('Regular', 'Regular')} 10–15% · {status_span('Atenção', 'Atenção')} 7–10% · {status_span('Crítico', 'Crítico &lt; 7%')}. "
            f"Entram {len(R)} campanhas com envio ({n_sem_envio} das {n_total_camp} cadastradas não enviaram). Modelos com menos de 100 envios não entram nas tabelas. "
            "Públicos diferentes respondem de forma muito diferente (inativos × leads novos), por isso a comparação de modelos é feita dentro de cada tipo de público.", S_GRAY)]

    # ------------------------------------------------ panorama por público
    F += [PageBreak(), P("Panorama: engajamento por tipo de público", S_H1),
          P(f"Resposta média por tipo de campanha, da maior para a menor. Linha tracejada = média geral ({pct(TOT['resp'])}).", S_GRAY), Spacer(1, 4)]
    ordem_resp = sorted([s for s in SEGS if sum(r["env"] for r in SEGS[s]) >= 200], key=lambda s: -agg(SEGS[s])["resp"])
    F += [Barras([(s, agg(SEGS[s])["resp"]) for s in ordem_resp], TOT["resp"]), Spacer(1, 4)]
    linhas = [[P("Tipo de público", S_HD), P("Campanhas", S_HDC), P("Envios", S_HDC), P("Leitura", S_HDC), P("Resposta", S_HDC), P("Objetivo", S_HDC), P("Status", S_HDC)]]
    extra = []
    for i, s in enumerate(ORDEM_SEG, start=1):
        a = agg(SEGS[s])
        f = faixa(a["resp"])
        linhas.append([P(esc(s), S_C), P(str(a["n"]), S_CR), P(fnum(a["env"]), S_CR), P(pct(a["lid"]), S_CR), P(pct(a["resp"]), S_CRB),
                       P(pct(a["obj"], 2), S_CR), P(f"<font color='{cor(f)}'><b>{f}</b></font>", S_CR)])
        extra.append(("BACKGROUND", (6, i), (6, i), STATUS[f][1]))
    F += [tabela(linhas, [5.2 * cm, 2.2 * cm, 1.9 * cm, 1.8 * cm, 1.9 * cm, 1.9 * cm, 2.1 * cm], extra), Spacer(1, 8)]

    por_mes = defaultdict(list)
    for r in R:
        por_mes[r["criada"][:7]].append(r)
    linhas = [[P("Mês", S_HD), P("Envios", S_HDC), P("Leitura", S_HDC), P("Resposta", S_HDC), P("Objetivo", S_HDC), P("Resposta SDR", S_HDC), P("Resposta Inativos", S_HDC)]]
    for mth in sorted(por_mes):
        a = agg(por_mes[mth])
        s1 = agg([r for r in por_mes[mth] if r["seg"] in SDR_SEGS])
        s2 = agg([r for r in por_mes[mth] if r["seg"] == "Inativos / Reativação"])
        linhas.append([P(f"{mth[5:]}/{mth[:4]}", S_C), P(fnum(a["env"]), S_CR), P(pct(a["lid"], 0), S_CR), P(pct(a["resp"]), S_CRB), P(pct(a["obj"], 2), S_CR),
                       P(pct(s1["resp"]) if s1["env"] >= 100 else "—", S_CR), P(pct(s2["resp"]) if s2["env"] >= 100 else "—", S_CR)])
    F += [P("Evolução mês a mês", S_H2), tabela(linhas, [2.4 * cm, 2.2 * cm, 2.2 * cm, 2.4 * cm, 2.4 * cm, 2.7 * cm, 2.7 * cm]),
          P("Mês = data de criação da campanha. “—” = menos de 100 envios no mês.", S_GRAY)]

    # ------------------------------------------------ ranking de campanhas
    grandes = [r for r in R if r["env"] >= 200]
    por_resp = sorted(grandes, key=lambda r: -rate(r["inter"], r["env"]))

    def tab_camp(rows):
        linhas = [[P("Campanha", S_HD), P("Criada", S_HDC), P("Envios", S_HDC), P("Leitura", S_HDC), P("Resp.", S_HDC), P("Objetivo", S_HDC)]]
        ex = []
        for i, r in enumerate(rows, start=1):
            f = faixa(rate(r["inter"], r["env"]))
            linhas.append([P(f"<b>{esc(r['name'][:52])}</b><br/><font color='#777777'>{esc(r['seg'])} · {esc(r['modelo'][:40])}</font>", S_C), P(f"{r['criada'][8:]}/{r['criada'][5:7]}/{r['criada'][2:4]}", S_CR),
                           P(fnum(r["env"]), S_CR), P(pct(rate(r["lid"], r["env"]), 0), S_CR), P(pct(rate(r["inter"], r["env"])), S_CRB), P(pct(rate(r["obj"], r["env"])), S_CR)])
            ex.append(("BACKGROUND", (4, i), (4, i), STATUS[f][1]))
        return tabela(linhas, [8.0 * cm, 1.9 * cm, 1.6 * cm, 1.6 * cm, 1.8 * cm, 2.1 * cm], ex)

    F += [PageBreak(), P("Ranking de campanhas", S_H1),
          P(f"Campanhas com 200+ envios ({len(grandes)}). Cada campanha é um disparo; o mesmo modelo pode aparecer em várias.", S_GRAY), Spacer(1, 3),
          P("As 10 com mais resposta", S_H2), tab_camp(por_resp[:10]), Spacer(1, 6), P("As 10 com menos resposta", S_H2), tab_camp(por_resp[::-1][:10][::-1])]

    # ------------------------------------------------ modelo a modelo
    F += [PageBreak(), P("Análise modelo a modelo, dentro de cada tipo de público", S_H1),
          P("Para cada tipo de público: o modelo de mensagem (template ou fluxo de chatbot) com os resultados somados de todas as campanhas em que foi usado, com o <b>melhor (▲)</b> e o <b>pior (▼)</b> destacados.", S_GRAY), Spacer(1, 4)]
    for s in ORDEM_SEG:
        b = bloco_segmento(s)
        if b:
            F.append(b)

    # ------------------------------------------------ funciona x não funciona
    F += [PageBreak(), P("O que funciona × o que não funciona", S_H1), Spacer(1, 2)]

    def quadro(titulo, cor_titulo, bg, linhas_q):
        F.append(P(f"<font color='{cor_titulo}'><b>{titulo}</b></font>", st("qt", fontSize=10.5, leading=14, spaceAfter=3, spaceBefore=4)))
        dados = [[P(f"<b>{a}</b>", st("qa", fontSize=7.6, leading=10)), P(b, st("qb", fontSize=7.8, leading=10.6))] for a, b in linhas_q]
        t = Table(dados, colWidths=[4.0 * cm, 13.0 * cm])
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, -1), bg), ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                               ("TOPPADDING", (0, 0), (-1, -1), 3.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2), ("LEFTPADDING", (0, 0), (-1, -1), 6)]))
        F.append(t)

    quadro("Funciona — replicar", "#1f7a44", STATUS["Forte"][1], [
        ("Presente em público com interesse", f"Contato: {pct(pc['resp'])} com presente contra {pct(pc0['resp'])} sem; Negociação: {pct(pn['resp'])} contra {pct(pn0['resp'])}. Exemplos: Spa Face Dia das Mães {M('SPA FACE DIA DAS MAES')}; “PRESENTE ESPECIAL” para inativos {M('Campanha 06 / 08')}; presente + avaliação sem custo no Faltou AV (09/09) {M('Disparo 09/09 faltou')}."),
        ("Lembrete / confirmação de sessão", f"“Passando para confirmar a sua sessão?” {M('confirmar sessao 01', 'Inativos / Reativação')} nos inativos e {M('confirmar sessão 24/07')} no Faltou AV, com os maiores índices de objetivo ganho ({pct(mod('confirmar sessao 01', 'Inativos / Reativação')['obj'], 1)})."),
        ("Áudio e contato humano", f"Áudios no Sem resposta: {pct(au['resp'])} contra {pct(au0['resp'])} nas demais ({M('COPA audio')} e {M('DISPARO AUDIO 26/08')}). Convite para ligação (“posso te ligar agora?”): {M('LIGAÇÃO 28/05')}."),
        ("Data/evento com motivo para agir", f"Dia das Mães, Sem Imposto ({M('ATIVO SEM IMPOSTO')}), Sexta da Transformação ({M('SEXTA DA TRASNFORMAÇÃO 14/08')} na Negociação) e Copa ({M('COPA SDR 11/06')})."),
        ("Público que já conhece a clínica", f"Inativos/Reativação com {pct(inat['resp'])} de resposta e {pct(inat['obj'])} de objetivo, contra {pct(sdr['resp'])} e {pct(sdr['obj'])} nos disparos SDR."),
    ])
    quadro("Não funciona — evitar", "#c0392b", STATUS["Crítico"][1], [
        ("Preço no texto (Contato e Negociação)", f"Contato: {pct(rc['resp'])} com valor contra {pct(rc0['resp'])} sem ({delta(rc, rc0)}); Negociação: {pct(rn['resp'])} contra {pct(rn0['resp'])}. A Drenagem caiu de {M('Drenagem 98,90', 'SDR - Contato / Ofertas', True)} para {M('Oferta Drenagem')}."),
        ("Curiosidade / gatilho / “oportunidade limitada”", f"No Contato, {pct(cc['resp'])} contra {pct(cc0['resp'])} sem gatilho; “Gatilho: Oportunidade limitada” {M('Oportunidade')}."),
        ("Reescrever só o texto da base fria", f"Em Sem resposta / Leads frios, preço, presente, prazo, curiosidade e pergunta final não alteraram a resposta (todas as diferenças dentro de ±1,5 ponto): o desgaste da base pesa mais que a copy."),
        ("Repetir o mesmo modelo na mesma base", f"Inativos 2020-2026 foi disparado {faixa_repeticoes()[0]} vezes (3 a 4 mil contatos cada) e rendeu só {faixa_repeticoes()[1]} a {faixa_repeticoes()[2]}, contra 12,5% nos primeiros disparos de março."),
        ("“Seu corpo não precisa de mais um tratamento genérico”", f"{M('DISPARO 06/10', 'SDR - Sem resposta / Leads frios')} com leitura de {pct(mod('DISPARO 06/10', 'SDR - Sem resposta / Leads frios')['lid'], 0)} nas campanhas de 06/10. O mesmo texto passou a ser usado nas sequências em 13/10 e também não superou o anterior."),
        ("Remarcação direta e sem motivo", f"“Vamos remarcar sua avaliação… hoje ou amanhã” {M('Dsparo 29/09')} e “Presente na remarcação” {M('Presente na remarcação')} em base antiga."),
    ])
    F += [Spacer(1, 6), P("Desgaste da base nos disparos Sem resposta / Leads frios", H3)]
    linhas = [[P("Mês", S_HD), P("Campanhas", S_HDC), P("Envios", S_HDC), P("Leitura", S_HDC), P("Resposta", S_HDC), P("Objetivo", S_HDC)]]
    for mth, a in des.items():
        if a["env"] >= 300:
            linhas.append([P(f"{mth[5:]}/{mth[:4]}", S_C), P(str(a["n"]), S_CR), P(fnum(a["env"]), S_CR), P(pct(a["lid"], 0), S_CR), P(pct(a["resp"]), S_CRB), P(pct(a["obj"], 2), S_CR)])
    F += [tabela(linhas, [3.0 * cm, 2.4 * cm, 2.4 * cm, 2.4 * cm, 2.4 * cm, 2.4 * cm]), Spacer(1, 6)]
    linhas = [[P("Data", S_HD), P("Campanha", S_HD), P("Envios", S_HDC), P("Leitura", S_HDC), P("Resposta", S_HDC), P("Objetivo", S_HDC)]]
    for r in repetidos_inativos():
        linhas.append([P(f"{r['criada'][8:]}/{r['criada'][5:7]}", S_C), P(f"{esc(r['name'])} <font color='#777777'>· {esc(r['modelo'][:30])}</font>", S_C), P(fnum(r["env"]), S_CR),
                       P(pct(rate(r["lid"], r["env"]), 0), S_CR), P(pct(rate(r["inter"], r["env"])), S_CRB), P(pct(rate(r["obj"], r["env"])), S_CR)])
    F += [KeepTogether([P("Disparos repetidos para Inativos 2020-2026", H3), tabela(linhas, [1.8 * cm, 8.4 * cm, 1.7 * cm, 1.7 * cm, 1.7 * cm, 1.7 * cm])])]

    # ------------------------------------------------ cadências a mudar
    ina, i14 = mod("Disparo 14.04.26"), mod("Disparo 20/03")
    d1, d2 = mod("Drenagem 98,90", "SDR - Contato / Ofertas", True), mod("Oferta Drenagem")
    F += [PageBreak(), P("Campanhas e modelos que você deve mudar", st("h1b", fontName="DV-B", fontSize=17, leading=21, spaceAfter=3, textColor=INK)),
          P("Ordenados por impacto (volume × distância da média), com o que trocar e o modelo que já funciona no próprio Lever.", S_GRAY), Spacer(1, 8)]
    itens = [
        ("1", "Disparos SDR Sem resposta / Leads frios", "Crítico",
         f"{fnum(sum(r['env'] for r in SEGS[SF]))} envios · resposta {pct(agg(SEGS[SF])['resp'])}",
         f"É o maior segmento SDR e o que mais perdeu fôlego (leitura {pct(des[pico]['lid'], 0)} → {pct(des[ultimo]['lid'], 0)}). Em {len([r for r in SEGS[SF] if r['texto'] and r['env'] >= 50])} campanhas com textos variados (preço, presente, prazo, curiosidade, pergunta) a resposta ficou em 6–7% de forma consistente; "
         f"o que mudou o resultado foi o formato (<b>áudio: {pct(au['resp'])}</b>) e o contexto (Copa, datas). Os piores modelos devem sair: “Oportunidade limitada” ({M('Oportunidade')}), “MÉTODO DRENESSE por R$ 98,70 / 89,90” ({M('DISPARO 23/07')} e {M('DISPARO 10/09')}) e “Seu corpo não precisa de mais um tratamento genérico” ({M('DISPARO 06/10', SF)}).",
         [f"<b>Priorizar áudio</b> no primeiro toque (COPA áudio {M('COPA audio')}; Áudio 26/08 {M('DISPARO AUDIO 26/08')}): base de só {fnum(au['env'])} envios, então teste em escala maior antes de concluir.",
          "<b>Reduzir a frequência e segmentar por tempo sem contato</b>: com leitura de 36%, a base está cansada e o ganho vem de falar com menos gente, mais recente.",
          f"<b>Se usar presente, faça A/B com controle</b>: neste segmento os textos com presente fizeram {pct(pf['resp'])} contra {pct(pf0['resp'])} sem. O presente rende mais no Contato e na Negociação."]),
        ("2", "Inativos 2020-2026 (fluxos “Disparo 14.04.26”, “Disparo 16.04.26”, “Disparo 20/03”)", "Crítico",
         f"{fnum(ina['env'])} envios no fluxo 14.04.26 · {pct(ina['resp'])} de resposta",
         f"Mesma base disparada {faixa_repeticoes()[0]} vezes entre março e maio, com resposta de só {faixa_repeticoes()[1]} a {faixa_repeticoes()[2]} (contra 12,5% nos primeiros disparos) e leitura de 44%. O template “Disparo 20/03” ({M('Disparo 20/03')}) e os fluxos “Disparo 14.04.26” ({M('Disparo 14.04.26')}) e “Disparo 16.04.26” ({M('Disparo 16.04.26')}) devem ser aposentados.",
         [f"Usar os modelos que dão 23% a 40% nessa mesma frente: “passando para confirmar a sua sessão?” ({M('confirmar sessao 01', 'Inativos / Reativação')}), “sessão em aberto perto de vencer” ({M('DISPARO INATIVOS 18/08')}) e o PRESENTE ESPECIAL ({M('Campanha 06 / 08')}).",
          "Não repetir a mesma base em menos de 30 dias; dividir por tempo de inatividade (1–3 meses respondeu 57,9%; 4–12 meses 32,9%)."]),
        ("3", "Ofertas de preço da Drenagem (SDR Contato e Negociação)", "Atenção",
         f"“Drenagem 98,90” {pct(d1['resp'])} em {fnum(d1['env'])} envios → “Oferta Drenagem 98,90” {pct(d2['resp'])}",
         f"A oferta perdeu força a cada reedição (98,90 → 97,90 → 98,70 → 89,90) e na Negociação o combo R$ 596,10 em 3x e a oferta relâmpago ficaram em ~5%. No Contato, textos com valor fazem {pct(rc['resp'])} contra {pct(rc0['resp'])} sem; na Negociação, {pct(rn['resp'])} contra {pct(rn0['resp'])}.",
         [f"Na Negociação, usar o modelo de data/evento (Sexta da Transformação, {M('SEXTA DA TRASNFORMAÇÃO 14/08')}) com presente e prazo.",
          f"No Contato, repetir a lógica do Spa Face de Dia das Mães ({M('SPA FACE DIA DAS MAES')}): presente + motivo (data) em vez de preço."]),
        ("4", "Faltou AV: remarcação direta e “Presente na remarcação”", "Atenção",
         f"“Vamos remarcar…” {M('Dsparo 29/09')} · “Presente na remarcação” {M('Presente na remarcação')}",
         f"As campanhas recentes de Faltou AV caíram (de {M('confirmar sessão 24/07')} em julho para ~6–7% em setembro/outubro), com leitura de 46–49%. Faltam motivo e contexto na mensagem.",
         ["Voltar ao modelo “passando para confirmar a sua sessão?” (16,6%) e ao “Procura-se” (14,6–15,0%), com motivo claro e botões HOJE/AMANHÃ. O presente sozinho já foi usado na remarcação e rendeu 6,1%; teste a avaliação gratuita como diferencial.",
          "Segmentar por data da falta: base de jan–jun já respondeu pouco."]),
        ("5", "Fluxos de chatbot com baixa resposta (Copa SDR Negociação, 24 Horas SDR, Carnaval SDR)", "Crítico",
         f"Copa SDR Negociação {M('COPA SDR NEGOCIAÇÃO')} · 24 Horas SDR {M('24 Horas - SDR')}",
         "Fluxos com 2,7% a 9% de resposta e quase nenhum objetivo ganho. A mesma ideia de 24 horas rende 21,9% quando enviada à base de clientes (Call center).",
         ["Reservar o conceito de 24 horas para a base de clientes; não usar em leads SDR.", "Como a API não mostra o texto dos fluxos, revisar o fluxo pelo painel do Lever antes de reaproveitar."]),
    ]
    for it in itens:
        F.append(item_mudar(*it))

    F += [KeepTogether([P("Replicar (não mexer)", H3)] + bullets([
        f"<b>Spa Face Dia das Mães</b> ({M('SPA FACE DIA DAS MAES')}, {fnum(mod('SPA FACE DIA DAS MAES')['env'])} envios): presente + data. Repetir em Dia dos Namorados, Dia da Mulher e aniversário da clínica.",
        f"<b>“Passando para confirmar a sua sessão?”</b> ({M('confirmar sessao 01', 'Inativos / Reativação')}, objetivo {pct(mod('confirmar sessao 01', 'Inativos / Reativação')['obj'], 1)}).",
        f"<b>PRESENTE ESPECIAL para inativos</b> ({M('Campanha 06 / 08')} em {mod('Campanha 06 / 08')['n']} campanhas) e os fluxos de relacionamento da Copa e do Dia dos Namorados (objetivos de 12–16%).",
        f"<b>Ativo Sem Imposto</b> ({M('ATIVO SEM IMPOSTO')}) e <b>áudios</b> no Sem resposta."])),
        KeepTogether([P("Como medir depois da troca", H3),
                      P("Rodar <b>coletar_campanhas.py</b> e este relatório de novo em 15 a 30 dias. Compare o modelo novo com o antigo na mesma base e período; os totais por modelo somam todas as campanhas em que ele foi usado.", S_P)])]
    return F


def pagina(c, d):
    c.saveState()
    c.setFillColor(PINK)
    c.rect(0, A4[1] - 0.2 * cm, A4[0], 0.2 * cm, stroke=0, fill=1)
    c.setFont("DV", 6.8)
    c.setFillColor(MUTED)
    c.drawString(1.8 * cm, 1.1 * cm, f"Drenesse · Setor de Processos · Análise de engajamento das campanhas Lever · dados de {DATA_TXT}")
    c.drawRightString(A4[0] - 1.8 * cm, 1.1 * cm, str(d.page))
    c.restoreState()


if __name__ == "__main__":
    doc = SimpleDocTemplate(SAIDA, pagesize=A4, leftMargin=2.0 * cm, rightMargin=2.0 * cm, topMargin=1.6 * cm, bottomMargin=1.9 * cm,
                            title="Análise de Engajamento – Campanhas Lever", author="Setor de Processos – Drenesse")
    doc.build(montar(), onFirstPage=pagina, onLaterPages=pagina)
    print("OK", SAIDA)
