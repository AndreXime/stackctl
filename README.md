# deploy-panel

TUI para gerenciar projetos na VPS direto do terminal: git pull, Docker Compose, status de containers e logs.

Sem servidor HTTP, sem porta exposta, sem senha. Roda localmente com acesso ao filesystem e aos binários `git` e `docker`.

## Requisitos

- Node.js 22+
- Git
- Docker com Compose v2 (`docker compose`)

## Instalação

```bash
git clone <repo>
cd deploy-panel
npm install
```

Crie um `.env` na raiz do projeto:

```env
PROJECTS_ROOT=/caminho/para/seus/projetos
```

`PROJECTS_ROOT` aponta para a pasta onde ficam os repositórios (cada subpasta = um projeto).

## Uso

**Desenvolvimento** (hot reload com tsx):

```bash
npm run dev
```

**Produção** (bundle único):

```bash
npm run build
npm start
```

O build gera `dist/cli.js`, um único arquivo executável (~1,8 MB) com todas as dependências embutidas.

## Navegação

O painel usa **context switch em tela cheia**: cada tela ocupa 100% do terminal. Ao entrar em um projeto, a lista é desmontada e o dashboard assume o espaço inteiro.

### Lista de projetos

| Tecla | Ação |
|-------|------|
| ↑ ↓ | Navegar |
| Enter | Abrir projeto |
| q | Sair |

### Dashboard do projeto

| Tecla | Ação |
|-------|------|
| ↑ ↓ | Navegar menu |
| Enter | Selecionar ação |
| Y / n | Confirmar ou cancelar ações destrutivas |
| Esc | Voltar para a lista |

**Ações disponíveis:**

- Git Pull
- Subir / derrubar stack (se houver `docker-compose.yml` ou `compose.yaml`)
- Iniciar serviço individual
- Ver logs de container (últimas 100 linhas)
- Atualizar dados do projeto

### Logs

| Tecla | Ação |
|-------|------|
| Enter ou Esc | Voltar ao dashboard |


## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | TUI em modo watch |
| `npm start` | Executa `dist/cli.js` |
| `npm run build` | Bundle com esbuild → `dist/cli.js` |
| `npm run lint` | Biome + typecheck |
| `npm run format` | Formata com Biome |

## Stack

- [Ink](https://github.com/vadimdemedes/ink) + [@inkjs/ui](https://github.com/vadimdemedes/ink-ui)
- TypeScript
- esbuild (bundle single-file)

## Notas

- Projetos com `.env` local usam `--env-file .env` automaticamente no `docker compose`.
- Se `docker compose ps` falhar (ex.: `.env` incompleto), os containers são listados via `docker ps` filtrando pelo label do projeto.
- Arquivos compose suportados: `compose.yaml`, `compose.yml`, `docker-compose.yaml`, `docker-compose.yml`.
