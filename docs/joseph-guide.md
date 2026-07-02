# Joseph's Guide to `tickerhub-cli`

A practical guide for using the `tickerhub-cli` wrapper to fetch market data from the terminal.

## What is it?

`tickerhub-cli` wraps the [`tickerhub`](https://github.com/hishamank/tickerhub) npm package and adds a durable SQLite cache. Any agent (or human) can run commands to get quotes, dividends, historical prices, crypto, forex, and more. Output is JSON by default.

## Setup

```bash
git clone git@github.com:hishamank/tickerhub-cli.git
cd tickerhub-cli
pnpm install
pnpm run build
```

Copy the example environment file and ask Rick or Hix for the real keys:

```bash
cp .env.example .env
```

The keys live in `.env` and are **never committed** (`.env` is gitignored).

## Quick start

```bash
# Stock quote
node dist/cli.js quote AAPL --pretty

# Quote with fresh data (skip cache)
node dist/cli.js quote AAPL --refresh --pretty

# Only the data, no metadata wrapper
node dist/cli.js quote AAPL --no-metadata
```

## Global flags

These work on every command:

| Flag | Meaning |
|------|---------|
| `--db <path>` | SQLite cache file (default: `~/.cache/tickerhub-cli/cache.db`) |
| `--refresh` | Bypass cache and fetch fresh data |
| `--pretty` | Pretty-print JSON |
| `--no-metadata` | Return only the `data` field |
| `--user <id>` | User id for credential resolution (default: `system`) |

## Commands

### Equities

```bash
node dist/cli.js quote AAPL
node dist/cli.js dividends MSFT --limit 5
node dist/cli.js earnings AAPL
node dist/cli.js ratings AAPL
node dist/cli.js events AAPL
node dist/cli.js historical AAPL 2025-01-01 2025-06-30
node dist/cli.js profile AAPL
node dist/cli.js news AAPL
node dist/cli.js search Apple
node dist/cli.js insider AAPL
node dist/cli.js technicals AAPL SMA --interval daily
node dist/cli.js movers gainers   # gainers | losers | actives
node dist/cli.js macro GDP
node dist/cli.js ipo
```

### Crypto

```bash
node dist/cli.js crypto quote BTC
node dist/cli.js crypto historical BTC 2025-01-01 2025-06-30
node dist/cli.js crypto markets 20
```

### Forex

```bash
node dist/cli.js forex rate EUR USD
node dist/cli.js forex historical EUR USD 2025-01-01 2025-06-30
```

### Introspection

```bash
node dist/cli.js providers
node dist/cli.js health
node dist/cli.js health finnhub
```

## Agent usage

For agents, the default compact JSON is best. Pipe it to `jq` if you need to extract fields:

```bash
node dist/cli.js quote AAPL --no-metadata | jq '.price'
node dist/cli.js search Apple --no-metadata | jq '.[].symbol'
```

## Cache behavior

- Responses are cached in SQLite.
- A second identical command returns cached data immediately.
- Use `--refresh` when you need live data.
- The cache survives process restarts.

## Troubleshooting

- **Empty results**: Some endpoints (e.g., `movers`, `ipo`) may return `[]` if free-tier providers block the request or have no data. This is expected.
- **No providers available**: Check `.env` has at least one valid key, or rely on keyless Yahoo Finance for quotes and historical prices.
- **SQLite error**: Make sure `~/.cache/tickerhub-cli/` is writable or pass `--db /tmp/tickerhub.db`.

## Add a command

If you need a new market-data command, look at `src/cli.ts` and add a new `.command()`. The underlying method is usually available on `s.service` or `s.service.crypto` / `s.service.forex`.

## Links

- Repo: `https://github.com/hishamank/tickerhub-cli`
- tickerhub docs: `https://github.com/hishamank/tickerhub`
