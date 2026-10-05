# Drenesse — Dashboard de Performance (Belle × Lever)

Dashboard executivo que **não usa mais Google Sheets**: operação vem do **Belle** (API de integração + relatório do BI) e o comercial da API do **Lever**.

## Rodar

```bash
cp .env.example .env      # preencher BELLE_API_TOKEN, LEVER_API_TOKEN e (opcional) BELLE_BI_TOKEN — só no servidor
npm install
npm run dev               # API em :8787 + Vite em :5173
npm run build && npm start   # produção: tudo em :8787
npm test                  # regras de negócio (filtros, datas, duplicidades, funil)
```

## Arquitetura

```
API (Belle/Lever) → server/ (token, fila 40 req/min, paginação, cache) →
src/services (normalização) → src/domain (regras/indicadores) → src/pages (componentes)
```

- `server/` — Express: guarda os tokens (`BELLE_API_URL/TOKEN`, `LEVER_API_URL/TOKEN`), respeita o limite de 40 req/min do Belle, pagina tudo e faz cache (`POST /api/refresh` limpa). O frontend nunca vê tokens.
- `src/services/{belle,lever}` — chamadas + normalização (unidades, status, datas ISO, moeda).
- `src/domain` — filtros, duplicidades, KPIs, funil, qualidade e `conciliacao.ts` (matching).
- TanStack Router + Query (cache, loading, erro, botão **Atualizar dados** invalida Belle e Lever).

## Endpoints usados

**Belle** (`Authorization: <token>`, 40 req/min): `estabelecimento` (unidades), `relatorios/relatorio_atendimentos` (fallback; 1 chamada por unidade × mês — a resposta não traz a unidade), `BI/v1.0/report/build` (opcional, relatório 241251330: Data de Inclusão e Data de Cadastro; unidade via `estab`, paginado por `offsetRecords`, mesmo ID de agendamento da API).

**Lever** (`Authorization: Bearer`): o Lever não publica documentação; as rotas foram lidas do próprio app web. `crm/v1/panel` (funis; `?includeDetails=Steps|Tags`), `crm/v1/panel/card?panelId&pageNumber&pageSize=100&includeDetails=CustomFields` (⚠ paginar com **`pageNumber`** — `page` é ignorado), `core/v1/agent`.

## Regras de negócio

- **Data de Agendamento** dentro do período torna o registro elegível (inclusão 18/09, agendamento 22/09, filtro 21–26/09 ⇒ incluído). Datas inclusivas até 23:59:59.
- **Remover duplicidades**: um cliente por mês; havendo "Atendido", prevalece o mais recente atendido; senão o mais recente. `idAgendamento` é a chave estrutural.
- **Funil** e **faturamento Lever**: só Lever. Venda = fases *Convertidos*, *Convertidos avulsos* e (Reativação) *Reativados com venda* (`src/config/areas.ts`). Duplicados não contam como lead.

## Limitações conhecidas

1. **Data de Inclusão / Data de Cadastro** só existem no relatório do BI do Belle ("Atendimentos Inclusos por Período - Duplicar AGENDA"), que exige o **`BELLE_BI_TOKEN`** (o token de integração recebe 401 nesse endpoint). Sem o token, ou se ele expirar, a tela mostra um aviso, os dois filtros ficam desabilitados e os agendamentos vêm da API de integração — nenhuma data substituta é usada.
2. **Data de Fechamento no Lever** = última movimentação do card (`updatedAt`). Investigado: o histórico do card (`track-log`) e a auditoria (`core/v1/audit`) retornam 404/403 com a chave de integração, e não há campo de data de fechamento no card (só o mês, em "Mês de Fechamento"). O filtro está rotulado explicitamente na tela.
3. Parcerias = cards do funil SDRs, recortados pelo filtro de Etiquetas (as 24 etiquetas do painel, como no Lever).
4. Equipe oficial de agendamento em `src/config/areas.ts` (`EQUIPE_OFICIAL`).

## Publicar na Vercel

1. Vercel → **Add New → Project** → importe o repositório `processosdrenesse/CLAUDE` (branch `claude/bold-feynman-5l91wk`). O `vercel.json` já configura build, frontend (`dist`) e a API (`api/index.ts`, `maxDuration` 300 s).
2. Em **Environment Variables** cadastre (Production): `BELLE_API_TOKEN`, `LEVER_API_TOKEN`, `BELLE_BI_TOKEN` e **`DASHBOARD_PASSWORD`** (as URLs já têm padrão). Depois faça **Redeploy** — variáveis novas só valem em um novo deploy. Confira em `/api/config`.
3. Deploy. Ao abrir, o navegador pede usuário (qualquer) e a senha.

Atenção: em serverless o cache é por instância; a 1ª carga de cada página pode levar dezenas de segundos e há limite de tempo por função conforme o plano da Vercel.

## Datas do Lever (nunca se substituem)

| Filtro | Campo | Observação |
|---|---|---|
| Data de Criação | `createdAt` do card | |
| Data de Avaliação | campo manual do card (`data-avalia-o` no SDR, `data-de-avalia-o-*` nos demais) | leads sem o campo ficam fora do filtro e a tela avisa quantos |
| Data de Fechamento | `updatedAt` do card em fase de venda | rotulada como "última movimentação" |

**Faturamento Comercial** usa somente o Lever (a conciliação Belle × Lever foi removida).
**Taxa de conversão** (Funil, Faturamento, responsáveis e Parcerias) = leads convertidos ÷ leads que **compareceram** (não o total de leads), nos mesmos filtros exceto Data de Fechamento e Situação; a tela mostra as duas quantidades. "Compareceu" = fase Negociação ou de venda (SDR e Social Selling) / "Reativados" com ou sem venda (Reativação, que não tem fase de Negociação). Duplicados não contam.
**Responsáveis** são consolidados na normalização dos cards (`src/config/responsaveis.ts`): Julliane/Juliane → Julliane; Bruna/Bruna Letícia → Bruna.
**Faturamento Comercial** cobre SDR, Reativação e Social Selling (cada venda pertence a uma única origem); Vendas — Serviços Avulsos não tem página de Faturamento.

## Período consultado em Agendamentos

O período buscado no Belle é sempre informado na tela (nunca restringido em silêncio):
- **Data de Agendamento** (de/até completos) → busca por ela;
- **Data de Inclusão** (de/até completos) → busca por inclusão, em **qualquer data de agendamento, inclusive futuros** (o BI trata o filtro de agendamento vazio como "até hoje" e descartaria os agendamentos futuros, por isso o servidor envia uma janela ampla);
- nenhuma data completa → mês atual, com aviso.
Validado contra o sistema antigo (planilhas): inclusão 28/09–03/10 → 127 agendamentos, 64 atendidos.
