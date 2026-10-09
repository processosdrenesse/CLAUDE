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

## Ambientes e publicação (VPS)

| Ambiente | Endereço | Atualiza quando |
|---|---|---|
| **Homologação** | https://homolog.painel.drenesse.com.br | a cada envio para a branch `claude/bold-feynman-5l91wk` (automático) |
| **Produção** | https://painel.drenesse.com.br | alguém roda **Actions → Produção → Run workflow** e o responsável pelo VPS **aprova** |

- **Testar:** envie para a branch, espere o Actions "Homologação" ficar verde e teste no endereço de
  homologação. Ele mostra a faixa amarela HOMOLOGAÇÃO e, no rodapé do menu, a versão (commit).
- **Levar para produção:** Actions → **Produção** → *Run workflow*. Se o campo ficar vazio, vai o último
  commit da branch, que é o que está em homologação. O job fica parado em "Waiting" até o revisor do
  Environment `producao` aprovar.
- **Trocar a chave do Belle** (vence a cada 2 semanas):
  1. Settings → Secrets and variables → Actions → `BELLE_API_TOKEN`;
  2. rode de novo a publicação: Actions → Homologação → *Run workflow*, e Produção do mesmo jeito.
- **Segredos no GitHub:**
  - Repositório: `VPS_HOST`, `VPS_PORT`, `VPS_USER`, `VPS_KNOWN_HOSTS`, `BELLE_API_TOKEN`,
    `LEVER_API_TOKEN`, `BELLE_BI_TOKEN`.
  - Por Environment (`homologacao` e `producao`): `VPS_SSH_KEY` e `DASHBOARD_PASSWORD`.
  - Cada ambiente tem a sua chave SSH, e a chave de produção só publica produção. Por isso produção não
    tem como ser publicada sem a aprovação.
- **No VPS** (montado uma vez com `sudo bash deploy/setup-vps.sh`):
  - `/opt/drenesse/{producao,homologacao}`: serviços `drenesse-painel@producao` (porta 8787) e
    `drenesse-painel@homologacao` (8788), só em 127.0.0.1, atrás do Caddy (`deploy/Caddyfile.exemplo`).
  - Atualização diária do quadro Avaliação × Cabine: timers `drenesse-quadro-producao.timer` (06:00) e
    `drenesse-quadro-homologacao.timer` (06:30). Para rodar na hora:
    `sudo systemctl start drenesse-quadro@producao`.
  - Logs: `journalctl -u drenesse-painel@producao -f`.
  - Publicar à mão, como root: `drenesse-publicar producao <commit>`. Mantém os segredos do `.env` atual.
- **Caddy deste VPS (Docker):** o HTTPS é feito pelo contêiner `n8n-caddy`, o mesmo do n8n e dos outros
  sistemas.
  - O arquivo é `/opt/n8n/Caddyfile`. Os blocos do painel apontam para `172.18.0.1:8787/8788`, o gateway da
    rede `n8n_default`, porque dentro do contêiner `127.0.0.1` é o próprio contêiner.
  - Para isso o painel escuta em `0.0.0.0`, pelo drop-in
    `/etc/systemd/system/drenesse-painel@.service.d/host.conf`.
  - O ufw libera 8787/8788 **só** para `172.18.0.0/16`; para a internet essas portas continuam fechadas.
  - Detalhes e comandos (acrescentar com `tee -a`, `caddy validate`/`reload` via `docker exec`) em
    `deploy/Caddyfile.exemplo`.
- **Saúde:** `GET /api/health` responde `{"ok":true}` sem senha e não mostra dados. É usada pela
  publicação para confirmar que o painel subiu; todo o resto exige a senha.
- **Local, sem VPS:** `npm run quadro:atualizar` atualiza os dados do quadro em `.cache/avaliacao-cabine`.

## Publicar na Vercel (antigo — substituído pelo VPS)

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

## Quadro Avaliação × Cabine SDR (SDR — Novos → Faturamento)
Quadro isolado e removível. Para remover: apague `server/avaliacaoCabine/`, `src/components/avaliacaoCabine/`,
`src/domain/avaliacaoCabine.ts`, `src/lib/__tests__/avaliacaoCabine.test.ts`, as linhas marcadas em `server/app.ts`
e `src/pages/LeverPages.tsx` e o item `crons` do `vercel.json`.

- **Vendas**: cards do painel SDRs nas fases Convertidos/Convertidos avulsos, casados com os planos **aprovados** do Belle
  (`venda_planos`) pelo telefone (8 últimos dígitos; depois e-mail e nome), ±90 dias, um card para um plano.
  Faturamento e data = valor e data da venda no Belle. Fora do quadro: card sem telefone, sem plano aprovado, plano
  suspenso, valor zero/teste, card duplicado, mais de um cliente possível. Outra unidade só é aceita com valor igual.
- **Classificação** (por cliente/dia da venda): Avaliação = avaliação atendida no dia; todo o resto é Cabine SDR. Desde
  09/10/2026 a antiga linha Cabine (quem já tinha plano, compra sem sessão atendida no dia etc.) faz parte da Cabine SDR,
  inclusive no histórico (resultado versão 4; um resultado antigo é convertido na leitura e recalculado em segundo plano).
  Experimental = serviços 22, 56210744, 56260425, 33353403, 56210746, 56210745 **sem** plano; avaliação = tipo
  "Avaliação" ou serviço 52; Retorno/Consulta/sem serviço ficam fora.
- **Agendamentos**: sessões de avaliação e experimentais (todas as situações) dos clientes do funil SDR (telefone de
  qualquer card do painel SDRs). Sessões de tratamento na cabine não entram.
- **Vários planos no mesmo dia**: planos aprovados da mesma cliente no mesmo dia contam como uma venda (valores somados).
- **Comparecimento**: atendidos ÷ (atendidos + faltas "Falhou"); desmarcados/cancelados fora. Avaliação: sessões de
  avaliação; Cabine SDR: experimentais.
- **Conciliação**: abaixo do quadro, cards do topo (Lever, mesmos filtros) → vendas do quadro (Belle), card a card,
  com o motivo de cada diferença (sem plano, venda fora do período, diferença de valor, plano em mais de um card…).
- **Taxa de conversão**: atendidas com plano comprado (> R$ 0) no mesmo dia ÷ atendidas, por cliente/dia; Total = "—".
- **Período**: Data de Fechamento (prioridade, = data da venda no Belle) ou Data de Avaliação do card; sem datas = 2026
  até hoje. Unidade filtra pela unidade do Belle. Outros filtros preenchidos → quadro em branco (com aviso).
- **Pré-cálculo**: `GET /api/avaliacao-cabine/cron` (header `Authorization: Bearer $CRON_SECRET`; a Vercel chama todo
  dia às 06:00 de Brasília). Mês atual e anterior são refeitos todo dia; os demais meses de 2026 1× por semana (rodízio);
  histórico de planos (2020–2025) uma única vez; contatos do Lever em varredura mensal + busca dos novos. Os pedaços
  ficam no Vercel Blob privado (`BLOB_READ_WRITE_TOKEN`) ou em `.cache/avaliacao-cabine` no modo local.
  A tela lê `GET /api/avaliacao-cabine`. `?recalcular=1` no cron refaz o cálculo sem recoletar.
