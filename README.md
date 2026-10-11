# tickerhub-cli

CLI wrapper around [`tickerhub`](https://github.com/hishamank/tickerhub) with SQLite caching. Built so any agent can fetch market data from the shell.

## Setup

Requires Node.js 22 or newer. The CLI pins validated `better-sqlite3` 13.0.3.
Allow its native build script in your pnpm build
approval configuration.

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

## Output contract

stdout carries exactly one JSON document per invocation — the command result. Console diagnostics go to stderr; known Yahoo survey/deprecation notices are suppressed, so pipes work unchanged:

```bash
tickerhub --no-metadata quote SPY | jq .price
```

Errors exit with code 1 and are reported on stderr only. Help and version output remain on stdout. SQLite stores close when active event-loop work drains; unresolved promises alone do not keep the process alive.

## SQLite cache

The CLI wires `tickerhub` with durable SQLite stores for cache, rate limits, config, and health metrics. One DB file survives restarts and shared use.

## Native compatibility and shutdown limits

Native GC compatibility and SWR store lifetime are separate issues. SQLite 11's
legacy Statement ObjectWrap can abort on the tested Node 24 runtime during GC in
another V8 context, before database close. SQLite 13 uses Node-API wrapping. The
native regression fixture exercises allocation and GC independently of providers
and shutdown. Validate the upgrade with a clean install and read/write checks on
an existing DB copy. A passing result applies to the tested runtime, native binary
and platform; other architectures, prebuilds and major-version APIs carry risk.

The existing `beforeExit` cleanup keeps stores open until active event-loop
handles drain, allowing stale-cache background refresh writes to finish. It does
not await arbitrary promises: handleless promises and unref'ed timers may remain
unfinished when stores close. Forced `process.exit()` and terminating signals can
bypass cleanup entirely. This is not an async drain API or signal/deadline policy.
Fresh reads avoid fetching; expired and forced reads await fetching; coalesced
requests share one in-flight fetch.

## License

MIT
