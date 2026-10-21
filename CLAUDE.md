# CLAUDE.md — Painel Drenesse (Belle × Lever)

Guia para qualquer sessão do Claude Code que for mexer neste repositório. Reúne as especificações dadas pela
gestão da Drenesse, as decisões tomadas, o histórico de alterações e como publicar. O `README.md` tem o
mesmo conteúdo técnico em forma resumida; **em caso de conflito, vale este arquivo**.

> ⚠️ **O repositório é público.** Nunca grave aqui (nem em commits, código ou testes) tokens, senhas, chaves
> SSH, telefones ou e-mails de clientes. Tokens ficam só no `.env` local (ignorado pelo git) e nos Secrets
> do GitHub.

---

## 1. O que é

**Dashboard Executivo de Performance Comercial da Drenesse — by Aisi Medeiros.** Substituiu o sistema antigo,
que lia planilhas do Google Sheets. Agora **nenhum dado vem de planilha**: tudo sai das APIs.

| Fonte | Papel ("fonte da verdade") | Usado em |
|---|---|---|
| **Belle** (sistema da clínica) | operação realizada: agendamentos, atendimentos, comparecimento, unidades, planos vendidos | Agendamentos, quadro Avaliação × Cabine SDR |
| **Lever** (CRM) | comercial registrado: leads, fases, responsáveis, conversões, faturamento do CRM | Funil, Faturamento, Qualidade do CRM, Faturamento Comercial, Parcerias |

Unidades (normalizadas em `src/lib/units.ts`): **Lagoa Nova, Zona Norte, Capim Macio, Petrópolis**.
No Belle: Petrópolis = 1, Lagoa Nova = 2, Capim Macio = 3, Norte Shopping/Zona Norte = 6. A unidade
**Laser (4) fica fora**.

Identidade visual (manter): Peach Coral (destaque principal), Raspberry (comparação), fundo claro, cards
arredondados, sidebar fixa com logo "DRENESSE by Aisi Medeiros", sem azul predominante. Cores com
significado: verde = atendido/positivo, laranja = desmarcado/atenção, vermelho = falha/negativo.

---

## 2. Como trabalhar com a usuária (regras pedidas ao longo do projeto)

1. **Responda em português**, de forma direta, com números e exemplos reais quando houver.
2. **Antes de alterar qualquer indicador:**
   - descubra de qual fonte/campo ele vem hoje;
   - confira se o campo existe de verdade na API;
   - preserve o que já funciona.
3. **Nunca invente** endpoint, campo, dado ou data substituta. Se um dado não existe na API, documente a
   limitação na tela. **Nunca use uma data alternativa em silêncio.**
4. **Escopo é sagrado.** Quando o pedido disser "altere SOMENTE X", não mexa em mais nada: cards do topo,
   filtros, outras páginas, layout e coleta de dados ficam como estão. Se a correção exigir mexer fora do
   escopo, **pare e pergunte antes**.
5. Quando ela pedir "**ainda não mexa no site**" ou "**só levante o dado**", é só consulta: nada de commit
   nem push.
6. Em mudança de regra ou número, **mostre os casos e os números novos antes de publicar** (ex.: a semana
   de referência 28/09–03/10/2026, seção 7). Confira também que nada fora do escopo mudou.
7. **Funcionalidades novas devem ser isoladas e removíveis.** O quadro Avaliação × Cabine SDR é o modelo
   (seção 7).
8. **Filtros não são enfeite.** Todo filtro altera KPIs, gráficos e tabelas da página, sobre o mesmo
   conjunto filtrado. Datas são inclusivas até 23:59:59.
9. Erro de API **nunca vira zero**. Mostre "Não foi possível atualizar os dados do Belle/Lever." com o motivo.
10. Publicação: tudo vai **primeiro para homologação**. Produção só com aprovação (seção 8).

---

## 3. Rodar, testar e conferir

```bash
cp .env.example .env     # preencha BELLE_API_TOKEN, LEVER_API_TOKEN, BELLE_BI_TOKEN (opcional), DASHBOARD_PASSWORD (opcional)
npm install
npm run dev              # API em :8787 + Vite em :5173
npm test                 # regras de negócio (node:test) — devem passar sempre
npm run typecheck
npm run build            # tsc + vite build → dist/
npm start                # serve dist/ + /api em :8787
npm run quadro:atualizar                 # coleta/calcula o quadro Avaliação × Cabine SDR (.cache/avaliacao-cabine)
npm run quadro:atualizar -- --recalcular # refaz o cálculo sem recoletar
```

Antes de qualquer push: `npm run typecheck && npm test && npm run build`. O GitHub Actions roda os mesmos
três e não publica se falhar.

Diagnóstico rápido: `GET /api/health` (sem senha, `{"ok":true}`) e `GET /api/config` (mostra só sim/não
para cada variável, a versão e o ambiente).

---

## 4. Arquitetura e mapa de arquivos

```
API (Belle/Lever) → server/ (tokens, fila 40 req/min, paginação, cache) →
src/services (normalização) → src/domain (regras/indicadores) → src/pages (componentes)
```

Stack: React 19 + Vite, TanStack Router/Query, Tailwind, Recharts, lucide-react, Express 5 (BFF) rodando
com `tsx`, TypeScript, testes com `node:test`.

| Caminho | O que tem |
|---|---|
| `server/app.ts` | rotas `/api/*`, Basic Auth (`DASHBOARD_PASSWORD`; `/api/health` e o cron ficam antes da senha) |
| `server/index.ts` | sobe o servidor (`PORT`, `HOST` opcional) e serve `dist/` |
| `server/env.ts` | variáveis, URLs padrão, versão (`APP_VERSION`) e ambiente (`APP_AMBIENTE`) |
| `server/belle.ts`, `server/lever.ts`, `server/http.ts`, `server/cache.ts` | clientes das APIs, fila/rate limit, cache (`POST /api/refresh` limpa) |
| `server/avaliacaoCabine/` | quadro Avaliação × Cabine SDR: `regras.ts` (cálculo puro), `coleta.ts` (coleta incremental), `store.ts`, `rotas.ts`, `cli.ts` |
| `src/services/{belle,lever}/` | chamadas + normalização (unidade, status, datas ISO, moeda, fases) |
| `src/domain/agendamentos.ts` | filtros, duplicidades, KPIs, janela de busca |
| `src/domain/funil.ts` | filtros do Lever, KPIs do funil, taxa de conversão, qualidade do CRM |
| `src/domain/avaliacaoCabine.ts` | montagem do quadro na tela + conciliação |
| `src/config/areas.ts` | áreas ↔ painéis do Lever, fases de venda, equipe oficial, campos fora da qualidade |
| `src/config/responsaveis.ts` | consolidação de nomes de responsáveis |
| `src/config/nav.ts`, `src/router.tsx` | menu e rotas |
| `src/pages/` | `Agendamentos.tsx`, `FaturamentoComercial.tsx`, `LeverPages.tsx` (Funil/Faturamento/Qualidade), `Parcerias.tsx` |
| `src/components/avaliacaoCabine/` | componente do quadro |
| `src/components/layout/Shell.tsx` | sidebar, botão Atualizar dados, faixa HOMOLOGAÇÃO, versão no rodapé |
| `src/lib/__tests__/` | `domain.test.ts` e `avaliacaoCabine.test.ts` |
| `deploy/`, `.github/workflows/` | publicação no VPS (seção 8) |
| `api/index.ts`, `vercel.json` | sobra da Vercel (desativada; ver pendências) |

---

## 5. APIs

### Belle — API de integração
- Base: `https://app.bellesoftware.com.br/api/release/controller/IntegracaoExterna/v1.0`, header
  `Authorization: <BELLE_API_TOKEN>`. Documentação: Postman "Belle Software".
- Limites: **40 requisições/min** (fila em `server/http.ts`) e **no máximo 3 meses por consulta**.
- **O token vence a cada ~2 semanas.** Troque no Secret `BELLE_API_TOKEN` e republique (seção 8).
- Endpoints usados:
  - `estabelecimento`: unidades;
  - `relatorios/relatorio_atendimentos` (`codEstab`, `dtInicio`, `dtFim`): uma chamada por unidade × mês,
    porque a resposta não traz a unidade. Campos: `idAgendamento`, `tipoAgendamento`, `codigoServico`,
    `statusAgendamento`, `idOrcamento`, cliente;
  - `venda_planos` (`tipoPeriodo=DataVenda`, `codEstab`, `dtInicio`, `dtFim`): `dataVenda`, `statusPlano`, `precoFinal`, cliente.
    Usado pelo quadro;
  - `relatorios/atividade_clientes`: telefone/e-mail dos clientes, usado pelo quadro.

### Belle — BI (Data de Inclusão e Data de Cadastro)
- A API de integração **não tem** Data de Inclusão. Ela vem do relatório do BI **"Atendimentos Inclusos por
  Período – Duplicar AGENDA"**: `BI/v1.0/report/build`, `reportId` 241251330, paginado por `offsetRecords`,
  unidade via `estab`. O ID de agendamento é o mesmo da API.
- Exige o **`BELLE_BI_TOKEN`, que é um token de SESSÃO do navegador, diferente do token da API** (o token da
  API recebe 401 nesse endpoint). Ele também expira. Para pegar um novo:
  1. Abra o Belle → BI → relatório acima.
  2. Aperte F12 → Rede/Network e gere o relatório.
  3. Na requisição `report/build`, copie o header `Authorization`.
  4. Atualize o Secret `BELLE_BI_TOKEN` e republique.
- Sem o token, ou com ele expirado, a tela avisa e desabilita os filtros de Inclusão/Cadastro. Os
  agendamentos continuam vindo da API de integração, **sem data substituta**.

### Lever
- Base `https://api.app.leverconversas.com.br`, header `Authorization: Bearer <LEVER_API_TOKEN>`.
- **Não há documentação pública.** As rotas foram lidas do próprio app web:
  - `crm/v1/panel` (`?includeDetails=Steps|Tags`);
  - `crm/v1/panel/card?panelId&pageNumber&pageSize=100&includeDetails=CustomFields`. ⚠️ Pagine com
    **`pageNumber`**: `page` é ignorado;
  - `core/v1/agent`;
  - `core/v1/contact/filter` (POST, paginado) e `core/v1/contact/{id}`: telefone/e-mail do contato do card.
- Histórico do card (`track-log`) e auditoria (`core/v1/audit`) dão 404/403 com a chave de integração. Por
  isso **não existe data real de fechamento** (ver 6.2).

---

## 6. Regras de negócio por página

### 6.1 Agendamentos (Belle)
- Filtros: Data de Cadastro, Data de Inclusão, Data de Agendamento, Colaborador, Unidade, Status, Tipo,
  Serviço, além de "Somente colaboradores oficiais (Reativação + SDR)" (`EQUIPE_OFICIAL` em
  `src/config/areas.ts`).
- **Regra da Data de Agendamento:** o agendamento dentro do período torna o registro elegível. Exemplo:
  inclusão 18/09, agendamento 22/09, filtro 21–26/09 ⇒ incluído. Não existe filtro "Data de Inclusão
  Considerada".
- **Período consultado no Belle, sempre informado na tela:**
  - Data de Agendamento completa → busca por ela;
  - Data de Inclusão completa → busca por inclusão em **qualquer data de agendamento, inclusive futura**. O BI
    trata o agendamento vazio como "até hoje", por isso o servidor envia uma janela ampla;
  - nenhuma completa → mês atual, com aviso.
- Inclusão e Cadastro (BI) filtram de forma independente. Registro sem a data fica fora quando o filtro
  está ativo.
- **Remover duplicidades** (liga/desliga):
  - cada cliente aparece uma vez por mês;
  - havendo "Atendido", prevalece o atendido mais recente; senão, o registro mais recente;
  - `idAgendamento` repetido é sempre descartado.
- KPIs: total, atendidos, falhou/desmarcado, taxa de comparecimento, taxa de falha. Análises por unidade, por
  colaborador (cards individuais), por status/tipo/serviço e evolução temporal.
- **Validado contra o sistema antigo:** inclusão 28/09–03/10/2026 = 127 agendamentos e 64 atendidos. A
  diferença inicial (80) era a busca limitada em silêncio ao mês atual; foi corrigida em `d196b31`.

### 6.2 Áreas do Lever: Funil, Faturamento e Qualidade do CRM
- Menu → painel do Lever (`src/config/areas.ts`):
  - Reativação = **INATIVOS**;
  - SDR — Novos = **SDRs**;
  - Social Selling = **Social Selling**;
  - Vendas — Serviços Avulsos = **Vendas- Serviços Avulsos**.
- **Fases de venda:** "Convertidos", "Convertidos avulsos" e, na Reativação, "Reativados com venda".
- **Duplicados não contam como lead.**
- **As três datas do Lever nunca substituem uma à outra:**

| Filtro | Campo | Observação |
|---|---|---|
| Data de Criação | `createdAt` do card | |
| Data de Avaliação | campo manual do card: `data-avalia-o` no SDR, `data-de-avalia-o*` nos demais | leads sem o campo ficam fora do filtro, e a tela avisa quantos |
| Data de Fechamento | `updatedAt` do card em fase de venda = **última movimentação do card** | confirmado pela gestão; rotulado assim na tela. "Mês de Fechamento" é outro filtro, pelo campo do card |

- **Taxa de conversão = convertidos ÷ leads que COMPARECERAM** (nunca ÷ total de leads), mostrando as duas
  quantidades. Vale para Funil, Faturamento, tabelas por responsável/etiqueta e Parcerias.
  - "Compareceu" = chegou à Negociação ou a uma fase de venda (SDR e Social Selling). Na Reativação, que não
    tem Negociação, são os "Reativados" com ou sem venda (`compareceuNaEtapa` em
    `src/services/lever/normalize.ts`).
  - Numerador e denominador usam **o mesmo período**, qualquer que seja o filtro de data. Com Data de
    Fechamento, os dois lados contam leads com última movimentação no período (correção `410abb6`: era
    12 de 182; passou a 12 de 14).
  - O filtro de Situação não entra no denominador; senão, filtrar "Convertido" daria 100%.
- **Qualidade do CRM:**
  - filtros de Data de Fechamento e Data de Avaliação independentes;
  - na Reativação, **Potencial de Venda e Interesse ficam fora da análise** (`QUALIDADE_SEM_CAMPOS`).
- **Vendas — Serviços Avulsos não tem página de Faturamento.** A rota redireciona.
- A regra do **Funil da Reativação** deve permanecer como está.

### 6.3 Faturamento Comercial (só Lever)
- 9 filtros combináveis: Data de Criação, Data de Avaliação, Origem/Funil, Responsável, Fase, Situação,
  Unidade, Mês de Fechamento e Data de Fechamento.
- **Faturamento Comercial = SDR + Reativação**, com quantidades:
  - SDR + Reativação;
  - só SDR;
  - só Reativação;
  - Social Selling, à parte e sem somar de novo.
  - Cada venda pertence a uma única origem.
- **Sem card de Taxa de conversão** (removido a pedido). A conciliação Belle × Lever desta página foi
  **removida** a pedido.

### 6.4 Responsáveis
- Consolidados na normalização, antes de qualquer agregação (`src/config/responsaveis.ts`):
  - Julliane/Juliane → **Julliane**;
  - Bruna/Bruna Letícia → **Bruna**.

### 6.5 Parcerias
- Cards do funil **SDRs** recortados pelo **filtro de Etiquetas**, com todas as etiquetas do painel, como no
  filtro "Principais" do Lever.
- KPIs: Agendamento, Falhou AV e Negociação (quantidade e %), além da taxa de conversão.

### 6.6 Removidos a pedido
- Visão Executiva (`/` redireciona para Agendamentos).
- Conciliação Belle × Lever.
- Faturamento de Vendas — Serviços Avulsos.

---

## 7. Quadro "Avaliação × Cabine SDR" (SDR — Novos → Faturamento)

Quadro **isolado e removível**, abaixo dos cards da página de Faturamento do SDR.
- Para remover, apague:
  - `server/avaliacaoCabine/`;
  - `src/components/avaliacaoCabine/`;
  - `src/domain/avaliacaoCabine.ts`;
  - `src/lib/__tests__/avaliacaoCabine.test.ts`.
- Depois apague as linhas marcadas em `server/app.ts` e `src/pages/LeverPages.tsx`.
- Ao mexer nele, **altere só o quadro e o endpoint `/api/avaliacao-cabine`**: nada de cards do topo,
  filtros, outras páginas ou coleta.

**Origem:** a análise "Avaliação × Cabine SDR × Cabine" feita antes só com o Belle (script
`belle_avaliacao.py` e `LEIA-ME_avaliacao.md` no repositório `pedrovictorferreira089-create/Claude`, branch
`claude/fervent-hopper-32n7fs`). No painel, as vendas vêm dos **cards convertidos do Lever**, casados com os
planos do Belle.

### Vendas (colunas Faturamento, % do total, Quantidade)
- Base: cards do painel SDRs em Convertidos/Convertidos avulsos, casados com os planos **aprovados** do Belle
  (`venda_planos`).
- **Casamento card ↔ plano** (um card para um plano, ±90 dias da Data de Fechamento):
  - ordem: telefone (8 últimos dígitos) > e-mail > nome;
  - outra unidade só é aceita com valor igual.
- **Faturamento e data = valor e data da venda no Belle** (não o valor do Lever).
- **Planos aprovados da mesma cliente no mesmo dia = uma venda com os valores somados.** Exemplo: SDRS-14220,
  1.900 + 890 = R$ 2.790.
- Ficam fora do quadro, com motivo listado:
  - card sem telefone;
  - cliente sem plano no Belle;
  - só plano suspenso (**suspenso não conta**);
  - mesmo plano casado com mais de um card (fica com o que casa);
  - mais de um cliente possível.

### Classificação (regra vigente desde 09/10/2026 — resultado versão 4)
- **Avaliação:** no dia da compra, a cliente teve sessão de avaliação "Atendido", com ou sem experimental.
- **Cabine SDR:** todas as demais vendas.
  - Até 09/10 existia uma terceira linha, "Cabine": quem já tinha plano, renovação, compra sem sessão
    atendida no dia, avaliação em outro dia etc.
  - A pedido da gestão, **toda a Cabine foi juntada à Cabine SDR, inclusive o histórico**.
  - Resultados antigos (versão ≤ 3) são convertidos na leitura e recalculados em segundo plano.
- Tipos de sessão do Belle:
  - **Avaliação** = `tipoAgendamento` "Avaliação" ou serviço **52** (AVALIAÇÃO ESTÉTICA);
  - **Experimental** = serviços **22, 56210744, 56260425, 33353403, 56210746, 56210745**, só quando **sem
    plano** (`idOrcamento` vazio);
  - **Cabine** (tratamento) = qualquer outro serviço, inclusive esses IDs dentro de plano;
  - Retorno, Consulta e sem serviço ficam fora.

### Agendamentos, Comparecimento e Taxa de conversão
- Contam **só sessões dos clientes que vieram do funil SDR**, identificados pelo telefone de qualquer card do
  painel SDRs. Sessões de **tratamento na cabine não entram**.
- **Agendamentos:** sessões de avaliação e experimentais (todas as situações), pela data da sessão.
- **Comparecimento:**
  - fórmula: atendidos ÷ (atendidos + faltas). Falta = status "Falhou"; desmarcado e cancelado ficam fora;
  - exibido como "68,0% (34 de 50)";
  - Avaliação usa só sessões de avaliação; Cabine SDR usa as experimentais.
- **Taxa de conversão:**
  - fórmula: sessões atendidas (cliente/dia) com plano comprado **acima de R$ 0** no mesmo dia ÷ sessões
    atendidas;
  - plano de R$ 0 não converte;
  - linha **Total = "—"**.
- O numerador da taxa usa compras reais do Belle, mesmo que o card não esteja em Convertidos. Essas compras
  aparecem na nota **"Compras na taxa de conversão que não estão no quadro"**:
  - colunas: cliente, data, valor, card(s) e fase;
  - motivo: "card fora de Convertidos" ou "renovação – card convertido em <mês>";
  - serve para a equipe corrigir os cards no Lever.

### Período e filtros
- **Data de Fechamento** (prioridade; = data da venda no Belle) ou **Data de Avaliação** do card.
- Sem datas: 2026 até hoje.
- **Unidade** funciona, pela unidade do Belle.
- Qualquer outro filtro preenchido deixa o quadro **em branco, com aviso**.

### Conciliação com os cards do topo
- Fica abaixo do quadro: "Cards no período: N (R$ X no Lever) → no quadro: M (R$ Y no Belle) • R$ Z a menos
  no quadro".
- Tabela card a card com o motivo de cada diferença:
  - sem plano;
  - venda fora do período (com a data);
  - diferença de valor (Lever × Belle);
  - plano em mais de um card etc.
- **Tem que fechar exatamente.**

### Pré-cálculo (não calcula ao abrir a página)
- A coleta respeita o limite de 40 req/min e a janela de 3 meses do Belle. O resultado fica em
  `.cache/avaliacao-cabine/resultado.json` (no VPS: `/opt/drenesse/<ambiente>/.cache/...`).
- Frequência de cada parte:
  - mês atual e anterior: refeitos todo dia, porque o Belle altera registros antigos (plano vira Suspenso,
    Marcado vira Falhou);
  - demais meses de 2026: 1× por semana, em rodízio;
  - histórico de planos (2020–2025): uma única vez;
  - contatos do Lever: varredura mensal + busca dos novos.
- No VPS roda pelos timers diários (seção 8). A tela lê `GET /api/avaliacao-cabine`.
- Para recalcular na hora:
  ```bash
  sudo -u drenesse bash -c 'cd /opt/drenesse/homologacao && node_modules/.bin/tsx server/avaliacaoCabine/cli.ts --recalcular'
  ```

### Números de referência: Data de Fechamento 28/09–03/10/2026
Use para conferir qualquer mudança.

| | Vendas | Faturamento | Agendamentos | Comparecimento | Conversão |
|---|---|---|---|---|---|
| Avaliação | 13 | R$ 47.811,52 | 71 | 68,0% (34 de 50) | 44,1% (15/34) |
| Cabine SDR | 7 | R$ 19.887,00 | 80 | 66,7% (42 de 63) | 14,6% (6/41) |
| Total | 20 | R$ 67.698,52 | 151 | 67,3% (76 de 113) | — |

- **Cards do topo:** 24 / R$ 69.709,52.
- **Conciliação:** R$ 2.011,00 a menos no quadro:
  - SDRS-3349: −2.000, venda em 25/09;
  - SDRS-14220: −10;
  - SDRS-14164: −1;
  - SDRS-14133, SDRS-14119 e SDRS-14058: R$ 0, sem plano.
- **Nota de compras fora do quadro:** 3 compras.
- Antes da junção (até 09/10), a mesma semana dava:
  - Cabine SDR: 3 / R$ 12.349,00;
  - Cabine: 4 / R$ 7.538,00 (SDRS-14070, SDRS-14186, SDRS-13849, SDRS-14178).

---

## 8. Ambientes e publicação (VPS)

A Vercel parou de publicar e o TI saiu dela. Em 08/10/2026 o painel foi para o **VPS da empresa (Hostinger,
`srv1867448`)**, com dois ambientes:

| Ambiente | Endereço | Atualiza quando |
|---|---|---|
| **Homologação** | https://homolog.painel.drenesse.com.br | a cada push na branch `claude/bold-feynman-5l91wk` (branch padrão), automático |
| **Produção** | https://painel.drenesse.com.br | Actions → **Produção** → *Run workflow* + **aprovação** do responsável pelo VPS no Environment `producao` |

- **Fluxo combinado:**
  1. A usuária testa à vontade em homologação, que tem a faixa laranja "HOMOLOGAÇÃO" e a versão (commit) no
     rodapé do menu.
  2. Só depois de ela aprovar, pede-se produção.
  3. O responsável pelo VPS aprova no GitHub.
- **Workflows:**
  - `.github/workflows/homologacao.yml`: `npm ci`, typecheck, test, build, depois publicação via SSH;
  - `.github/workflows/producao.yml`: `workflow_dispatch`; o commit padrão é o da branch.
- **Secrets no GitHub** (só os nomes; os valores nunca vão para o repositório):
  - Repository: `BELLE_API_TOKEN`, `BELLE_BI_TOKEN`, `LEVER_API_TOKEN`, `DASHBOARD_PASSWORD`, `VPS_HOST`,
    `VPS_PORT`, `VPS_USER` (= `deploy`), `VPS_KNOWN_HOSTS` e `VPS_SSH_KEY` (chave de **homologação**).
  - Environment `producao`: `VPS_SSH_KEY` próprio (chave de **produção**) e revisor obrigatório. **Ainda não
    criado** (ver pendências).
  - Trocar um token: atualize o Secret e rode de novo Actions → Homologação (e Produção). O `.env` do VPS só
    muda numa nova publicação.
- **DNS** (HostGator, Editor de Zona): registros A `painel` e `homolog.painel` → IP do VPS.

### No VPS (montado uma vez com `sudo bash deploy/setup-vps.sh`)
- Código e serviços:
  - `/opt/drenesse/{producao,homologacao}`: um clone em cada, com `.env` e `.cache` próprios;
  - serviços systemd `drenesse-painel@producao` (porta 8787) e `drenesse-painel@homologacao` (8788),
    usuário `drenesse`.
- Atualização diária do quadro: `drenesse-quadro-producao.timer` às 06:00 e
  `drenesse-quadro-homologacao.timer` às 06:30.
- Publicação:
  - o usuário `deploy` tem uma chave por ambiente, com comando forçado `/usr/local/sbin/drenesse-publicar-ssh`;
  - `/usr/local/sbin/drenesse-publicar <ambiente> <commit>` (root) faz `git checkout`,
    `npm ci --include=dev`, build, grava o `.env`, reinicia e confere `/api/health`;
  - esses dois scripts são **cópias** instaladas pelo setup. Mudar `deploy/publicar*.sh` no repositório só
    vale depois de reinstalar.
- **HTTPS:** o Caddy roda no contêiner Docker **`n8n-caddy`**, junto com o n8n e outros sistemas.
  - O arquivo é `/opt/n8n/Caddyfile`. Os blocos do painel fazem `reverse_proxy 172.18.0.1:8787/8788` (gateway
    da rede `n8n_default`).
  - Por isso o painel escuta em `0.0.0.0` (drop-in `/etc/systemd/system/drenesse-painel@.service.d/host.conf`).
  - O ufw libera 8787:8788 **só** para `172.18.0.0/16`.
  - Edite o Caddyfile só com `tee -a` e aplique com `docker exec n8n-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile`.
  - Detalhes em `deploy/Caddyfile.exemplo`.
- Comandos úteis:
  - logs: `journalctl -u drenesse-painel@homologacao -f`;
  - reiniciar: `sudo systemctl restart drenesse-painel@homologacao`;
  - quadro agora: `sudo systemctl start drenesse-quadro@homologacao`.
- **"Servidor indisponível" na tela** = o navegador não chegou ao servidor (falha de rede), não é erro do
  Belle. Em 16/10/2026 foi uma queda da Hostinger. Confira:
  - `curl https://homolog.painel.drenesse.com.br/api/health`;
  - o status do VPS no painel da Hostinger;
  - `docker ps | grep caddy`;
  - `systemctl is-active drenesse-painel@homologacao`.
- Sem acesso SSH a partir do Claude Code na nuvem (só HTTPS). Peça à usuária para rodar comandos no VPS e
  colar a saída.

---

## 9. Histórico de alterações

| Data | Commit | O quê e por quê |
|---|---|---|
| 29/09 | `6ebfb60` | Painel novo: Belle + Lever, sem Google Sheets; camadas API → normalização → domínio → páginas |
| 30/09 | `056ebce` | Parcerias = funil SDRs + filtro de Etiquetas (não uma etiqueta fixa) |
| 30/09 | `9a18fec` `07b15ce` `f5f6dcc` | Publicação na Vercel, senha (Basic Auth), `/api/config` |
| 30/09 | `b104194` | Data de Avaliação do SDR (`data-avalia-o`), Faturamento Comercial só Lever com 9 filtros, Parcerias com Agendamento/Falhou AV/Negociação, Visão Executiva removida |
| 30/09 | `1a0553d` | Data de Inclusão/Cadastro pelo BI do Belle; conciliação Belle × Lever removida |
| 30/09 | `190e91f` `ca7fe46` | Taxa de conversão = convertidos ÷ compareceram; responsáveis consolidados; Faturamento Comercial SDR + Reativação e quantidades por origem; Qualidade da Reativação sem Potencial/Interesse; Faturamento de Vendas Avulsas removido |
| 30/09 | `8f24264` | Versão (commit) no rodapé e em `/api/config` |
| 01/10 | `410abb6` | Taxa com Data de Fechamento: denominador no mesmo período |
| 01/10 | `75e5202` | Faturamento Comercial sem card de Taxa de conversão |
| 05/10 | `d196b31` | Agendamentos: período de busca explícito; busca por Inclusão com agendamentos futuros (127/64, igual ao sistema antigo) |
| 06/10 | `ea0da4e` | Quadro Avaliação × Cabine SDR × Cabine (isolado, pré-calculado) |
| 07–08/10 | `41e8659` `86fab31` `6b26ead` | Quadro: planos do mesmo dia somados, comparecimento, conciliação card a card, R$ 0 não converte, nota de compras, Total "—", Cabine com "—" |
| 08/10 | `683e528` `aa22e29` `f74e55b` `8ef4468` `f18a977` | Migração para o VPS: homologação/produção com GitHub Actions, `/api/health` sem senha, Caddy no Docker |
| 09/10 | `875dd8f` | Quadro: Cabine juntada à Cabine SDR (histórico e futuras); versão 4 do resultado |

Consultas pontuais feitas sem mexer no site:
- faturamento 2026 até 26/09;
- contatos de clientes específicos;
- discrepância de agendamentos contra a planilha antiga;
- identificação das vendas de Cabine.

---

## 10. Pendências e cuidados

- [ ] **Produção:**
  1. Criar o Environment `producao` em GitHub → Settings → Environments, com nome exato:
     - revisor obrigatório = responsável pelo VPS;
     - desmarcar o bypass de administradores;
     - secret `VPS_SSH_KEY` = `sudo cat /root/drenesse-chave-producao` no VPS.
  2. Rodar Actions → Produção e esperar a aprovação.
  3. Conferir `https://painel.drenesse.com.br/api/health`.
  4. Depois, apagar as chaves do VPS: `sudo shred -u /root/drenesse-chave-*`.
- [ ] Os Environments `Preview` e `Production` do GitHub são sobras da Vercel e podem ser apagados.
- [ ] Desligar o projeto antigo da Vercel e remover `vercel.json`/`api/`, **só quando a usuária pedir**.
- [ ] O `README.md` ainda cita o cron da Vercel e o Vercel Blob para o quadro. No VPS, valem os timers e o
  disco.
- Tokens que vencem: `BELLE_API_TOKEN` (~2 semanas) e `BELLE_BI_TOKEN` (sessão do navegador). Sintomas:
  - "Não foi possível atualizar os dados do Belle";
  - "token do BI inválido ou expirado".
