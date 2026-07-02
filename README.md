# tickerhub-cli

CLI wrapper around [`tickerhub`](https://github.com/hishamank/tickerhub) with SQLite caching. Built so any agent can fetch market data from the shell.

## Setup

```bash
cp .env.example .env   # fill in optional provider keys
pnpm install
pnpm run build
```

## Usage

Default output is JSON (great for agents). Use `--pretty` for human-readable JSON.

```bash
# quotes
pnpm dev quote AAPL
pnpm dev quote AAPL --refresh

# equity data
pnpm dev dividends MSFT --limit 5
pnpm dev earnings AAPL
pnpm dev profile AAPL
pnpm dev news AAPL
pnpm dev historical AAPL 2025-01-01 2025-06-01
pnpm dev technicals AAPL SMA --interval daily
pnpm dev movers gainers
pnpm dev search Apple
pnpm dev ipo

# crypto
pnpm dev crypto quote BTC
pnpm dev crypto historical BTC 2025-01-01 2025-06-01
pnpm dev crypto markets 20

# forex
pnpm dev forex rate EUR USD
pnpm dev forex historical EUR USD 2025-01-01 2025-06-01

# introspection
pnpm dev providers
pnpm dev health
pnpm dev health finnhub
```

Global flags:

- `--db <path>` — SQLite cache path (default: `~/.cache/tickerhub-cli/cache.db`)
- `--refresh` — bypass cache
- `--pretty` — pretty-print JSON
- `--no-metadata` — return only the `data` field
- `--user <id>` — user id for credential resolution

After `pnpm run build` the binary is available as `dist/cli.js` or `tickerhub` if linked.

## SQLite cache

The CLI wires `tickerhub` with durable SQLite stores for cache, rate limits, config, and health metrics. One DB file survives restarts and shared use.

## License

MIT
