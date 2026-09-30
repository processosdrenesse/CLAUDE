# Drenesse — Dashboard de Performance (Belle × Lever)

Dashboard executivo que **não usa mais Google Sheets**: operação vem da API do **Belle** e o comercial da API do **Lever**; o dashboard é a camada de análise e **conciliação** entre os dois.

## Rodar

```bash
cp .env.example .env      # preencher BELLE_API_TOKEN e LEVER_API_TOKEN (só no servidor)
npm install
npm run dev               # API em :8787 + Vite em :5173
npm run build && npm start   # produção: tudo em :8787
npm test                  # regras de negócio (filtros, duplicidades, conciliação)
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

**Belle** (`Authorization: <token>`, 40 req/min): `estabelecimento` (unidades), `relatorios/relatorio_atendimentos` (1 chamada por unidade × mês — a resposta não traz a unidade), `venda_planos?tipoPeriodo=DataVenda`, `clientes?pagina` (Data de Cadastro, busca binária pois é ordenado por código), `cliente/listar` (CPF/telefone/e-mail p/ matching).

**Lever** (`Authorization: Bearer`): o Lever não publica documentação; as rotas foram lidas do próprio app web. `crm/v1/panel` (funis; `?includeDetails=Steps|Tags`), `crm/v1/panel/card?panelId&pageNumber&pageSize=100&includeDetails=CustomFields` (⚠ paginar com **`pageNumber`** — `page` é ignorado), `core/v1/agent`, `core/v1/contact/{id}`.

## Regras de negócio

- **Data de Agendamento** dentro do período torna o registro elegível (inclusão 18/09, agendamento 22/09, filtro 21–26/09 ⇒ incluído). Datas inclusivas até 23:59:59.
- **Remover duplicidades**: um cliente por mês; havendo "Atendido", prevalece o mais recente atendido; senão o mais recente. `idAgendamento` é a chave estrutural.
- **Funil** e **faturamento Lever**: só Lever. Venda = fases *Convertidos*, *Convertidos avulsos* e (Reativação) *Reativados com venda* (`src/config/areas.ts`). Duplicados não contam como lead.
- **Belle × Lever**: matching por ID → CPF → telefone → e-mail → nome+unidade → nome+data; ambíguos = "Correspondência para revisão". Status: Conciliado, Somente Belle/Lever, Divergência de valor/data/unidade.
- Vendas de plano com valor R$ 0 (cortesias) ficam fora da conciliação.

## Limitações conhecidas

1. **Data de Inclusão** não existe na API do Belle (só está no relatório do BI). O filtro está desabilitado até o Belle expor o campo (`Agendamento.dataInclusao`).
2. **Data de fechamento no Lever** = última movimentação do card (`updatedAt`); a API não expõe a data em que entrou na fase de venda.
3. Parcerias = cards do funil SDRs, recortados pelo filtro de Etiquetas (as 24 etiquetas do painel, como no Lever).
4. Equipe oficial de agendamento em `src/config/areas.ts` (`EQUIPE_OFICIAL`).

## Publicar na Vercel

1. Vercel → **Add New → Project** → importe o repositório `processosdrenesse/CLAUDE` (branch `claude/bold-feynman-5l91wk`). O `vercel.json` já configura build, frontend (`dist`) e a API (`api/index.ts`, `maxDuration` 300 s).
2. Em **Environment Variables** cadastre: `BELLE_API_URL`, `BELLE_API_TOKEN`, `LEVER_API_URL`, `LEVER_API_TOKEN` e **`DASHBOARD_PASSWORD`** (senha de acesso; sem ela o endereço fica aberto a qualquer pessoa).
3. Deploy. Ao abrir, o navegador pede usuário (qualquer) e a senha.

Atenção: em serverless o cache é por instância; a 1ª carga de cada página pode levar dezenas de segundos e há limite de tempo por função conforme o plano da Vercel.
