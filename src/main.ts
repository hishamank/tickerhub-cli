/**
 * CLI program: command wiring.
 *
 * Loaded (dynamically) by cli.ts AFTER output routing is installed, so any
 * library diagnostics emitted while this module graph evaluates already go
 * to stderr. See src/output.ts and src/cli.ts.
 *
 * Output contract: stdout receives exactly one JSON document per invocation
 * via `print()`. Lifecycle: SQLite stores are NOT closed eagerly after the
 * response — the upstream SWR cache may still be writing a background
 * refresh. Closes are deferred to `beforeExit` via src/lifecycle.ts, so
 * the event loop drains (outstanding fetches settle) before the database
 * is closed exactly once. Errors set `process.exitCode` instead of calling
 * `process.exit()`, letting outstanding work finish instead of aborting
 * native teardown mid-flight.
 */

import { Command } from "commander";
import { createService, wireService } from "./service.js";
import { registerDeferredClose } from "./lifecycle.js";

const program = new Command();

program
  .name("tickerhub")
  .description("CLI wrapper around tickerhub with SQLite caching")
  .version("0.1.0")
  .option("--db <path>", "SQLite database path")
  .option("--refresh", "bypass cache and fetch fresh data")
  .option("--pretty", "pretty-print JSON output")
  .option("--no-metadata", "omit metadata from output")
  .option("--user <id>", "user id for credential resolution", "system");

interface GlobalOpts {
  db?: string;
  refresh?: boolean;
  pretty?: boolean;
  metadata: boolean;
  user: string;
}

function globals(cmd: Command): GlobalOpts {
  return cmd.optsWithGlobals<GlobalOpts>();
}

function print(data: unknown, opts: GlobalOpts): void {
  const out = opts.metadata ? data : extractData(data);
  const space = opts.pretty ? 2 : undefined;
  process.stdout.write(JSON.stringify(out, null, space) + "\n");
}

function extractData(response: unknown): unknown {
  if (response && typeof response === "object" && "data" in response) {
    return (response as { data: unknown }).data;
  }
  return response;
}

function parseDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: "${value}"`);
  }
  return d;
}

/**
 * Run `fn` with a wired service. The service's SQLite handles are closed
 * on `beforeExit` (see src/lifecycle.ts), NOT here: the upstream SWR cache
 * serves stale data while a background refresh promise is still running,
 * and closing the DB in a `finally` right after the response races with
 * that write (the reported exit-134 native abort happened in this window).
 */
async function withService<T>(
  cmd: Command,
  fn: (service: Awaited<ReturnType<typeof createServiceFromCmd>>) => Promise<T>,
): Promise<T> {
  const svc = await createServiceFromCmd(cmd);
  registerDeferredClose(svc.close);
  return fn(svc);
}

async function createServiceFromCmd(cmd: Command) {
  const opts = globals(cmd);
  const { options, close } = await wireService({ dbPath: opts.db });
  const { service } = createService(options);
  return { service, close };
}

// ---- equity commands -------------------------------------------------------

program
  .command("quote <symbol>")
  .description("get a stock quote")
  .action(async (symbol: string, _options: unknown, cmd: Command) => {
    const opts = globals(cmd);
    const response = await withService(cmd, (s) =>
      s.service.getQuote(symbol, opts.user, { forceRefresh: opts.refresh }),
    );
    print(response, opts);
  });

program
  .command("dividends <symbol>")
  .option("--limit <n>", "max results", "20")
  .description("get dividend history")
  .action(async (symbol: string, options: { limit: string }, cmd: Command) => {
    const opts = globals(cmd);
    const response = await withService(cmd, (s) =>
      s.service.getDividends(symbol, opts.user, {
        limit: Number.parseInt(options.limit, 10),
        forceRefresh: opts.refresh,
      }),
    );
    print(response, opts);
  });

program
  .command("earnings <symbol>")
  .description("get earnings history")
  .action(async (symbol: string, _options: unknown, cmd: Command) => {
    const opts = globals(cmd);
    const response = await withService(cmd, (s) =>
      s.service.getEarnings(symbol, opts.user, { forceRefresh: opts.refresh }),
    );
    print(response, opts);
  });

program
  .command("ratings <symbol>")
  .description("get analyst ratings")
  .action(async (symbol: string, _options: unknown, cmd: Command) => {
    const opts = globals(cmd);
    const response = await withService(cmd, (s) =>
      s.service.getRatings(symbol, opts.user, { forceRefresh: opts.refresh }),
    );
    print(response, opts);
  });

program
  .command("events <symbol>")
  .description("get corporate events")
  .action(async (symbol: string, _options: unknown, cmd: Command) => {
    const opts = globals(cmd);
    const response = await withService(cmd, (s) =>
      s.service.getEvents(symbol, opts.user, { forceRefresh: opts.refresh }),
    );
    print(response, opts);
  });

program
  .command("historical <symbol> <from> <to>")
  .description("get historical prices (ISO dates)")
  .action(async (symbol: string, from: string, to: string, _options: unknown, cmd: Command) => {
    const opts = globals(cmd);
    const response = await withService(cmd, (s) =>
      s.service.getHistoricalPrices(symbol, opts.user, parseDate(from), parseDate(to), {
        forceRefresh: opts.refresh,
      }),
    );
    print(response, opts);
  });

program
  .command("profile <symbol>")
  .description("get company profile")
  .action(async (symbol: string, _options: unknown, cmd: Command) => {
    const opts = globals(cmd);
    const response = await withService(cmd, (s) =>
      s.service.getCompanyProfile(symbol, opts.user, { forceRefresh: opts.refresh }),
    );
    print(response, opts);
  });

program
  .command("news <symbol>")
  .description("get company news")
  .action(async (symbol: string, _options: unknown, cmd: Command) => {
    const opts = globals(cmd);
    const response = await withService(cmd, (s) =>
      s.service.getNews(symbol, opts.user, { forceRefresh: opts.refresh }),
    );
    print(response, opts);
  });

program
  .command("ipo")
  .description("get IPO calendar")
  .action(async (_options: unknown, cmd: Command) => {
    const opts = globals(cmd);
    const response = await withService(cmd, (s) =>
      s.service.getIpoCalendar(opts.user, { forceRefresh: opts.refresh }),
    );
    print(response, opts);
  });

program
  .command("search <query>")
  .description("search symbols")
  .action(async (query: string, _options: unknown, cmd: Command) => {
    const opts = globals(cmd);
    const response = await withService(cmd, (s) =>
      s.service.searchSymbols(query, opts.user, { forceRefresh: opts.refresh }),
    );
    print(response, opts);
  });

program
  .command("insider <symbol>")
  .description("get insider transactions")
  .action(async (symbol: string, _options: unknown, cmd: Command) => {
    const opts = globals(cmd);
    const response = await withService(cmd, (s) =>
      s.service.getInsiderTransactions(symbol, opts.user, { forceRefresh: opts.refresh }),
    );
    print(response, opts);
  });

program
  .command("technicals <symbol> <indicator>")
  .option("--interval <interval>", "interval", "daily")
  .description("get technical indicator (e.g. SMA, EMA, RSI, MACD)")
  .action(async (symbol: string, indicator: string, options: { interval: string }, cmd: Command) => {
    const opts = globals(cmd);
    const response = await withService(cmd, (s) =>
      s.service.getTechnicalIndicator(symbol, indicator, opts.user, {
        interval: options.interval,
        forceRefresh: opts.refresh,
      }),
    );
    print(response, opts);
  });

program
  .command("movers <direction>")
  .description("get market movers: gainers | losers | actives")
  .action(async (direction: string, _options: unknown, cmd: Command) => {
    if (!["gainers", "losers", "actives"].includes(direction)) {
      throw new Error("direction must be gainers, losers, or actives");
    }
    const opts = globals(cmd);
    const response = await withService(cmd, (s) =>
      s.service.getMarketMovers(direction as "gainers" | "losers" | "actives", opts.user, {
        forceRefresh: opts.refresh,
      }),
    );
    print(response, opts);
  });

program
  .command("macro <indicator>")
  .description("get macroeconomic indicator")
  .action(async (indicator: string, _options: unknown, cmd: Command) => {
    const opts = globals(cmd);
    const response = await withService(cmd, (s) =>
      s.service.getMacroIndicator(indicator, opts.user, { forceRefresh: opts.refresh }),
    );
    print(response, opts);
  });

// ---- crypto namespace ------------------------------------------------------

const cryptoCmd = program.command("crypto").description("cryptocurrency data");

cryptoCmd
  .command("quote <symbol>")
  .description("get crypto quote")
  .action(async (symbol: string, _options: unknown, cmd: Command) => {
    const opts = globals(cmd);
    const response = await withService(cmd, (s) =>
      s.service.crypto.getQuote(symbol, opts.user, { forceRefresh: opts.refresh }),
    );
    print(response, opts);
  });

cryptoCmd
  .command("historical <symbol> <from> <to>")
  .description("get crypto historical prices (ISO dates)")
  .action(async (symbol: string, from: string, to: string, _options: unknown, cmd: Command) => {
    const opts = globals(cmd);
    const response = await withService(cmd, (s) =>
      s.service.crypto.getHistorical(symbol, parseDate(from), parseDate(to), opts.user, {
        forceRefresh: opts.refresh,
      }),
    );
    print(response, opts);
  });

cryptoCmd
  .command("markets [limit]")
  .description("get crypto markets")
  .action(async (limit: string | undefined, _options: unknown, cmd: Command) => {
    const opts = globals(cmd);
    const n = limit ? Number.parseInt(limit, 10) : 50;
    const response = await withService(cmd, (s) =>
      s.service.crypto.getMarkets(n, opts.user, { forceRefresh: opts.refresh }),
    );
    print(response, opts);
  });

// ---- forex namespace -------------------------------------------------------

const forexCmd = program.command("forex").description("foreign exchange data");

forexCmd
  .command("rate <from> <to>")
  .description("get FX rate")
  .action(async (fromCurrency: string, toCurrency: string, _options: unknown, cmd: Command) => {
    const opts = globals(cmd);
    const response = await withService(cmd, (s) =>
      s.service.forex.getRate(fromCurrency, toCurrency, opts.user, { forceRefresh: opts.refresh }),
    );
    print(response, opts);
  });

forexCmd
  .command("historical <from> <to> <fromDate> <toDate>")
  .description("get FX historical rates (ISO dates)")
  .action(
    async (
      fromCurrency: string,
      toCurrency: string,
      fromDate: string,
      toDate: string,
      _options: unknown,
      cmd: Command,
    ) => {
      const opts = globals(cmd);
      const response = await withService(cmd, (s) =>
        s.service.forex.getHistorical(
          fromCurrency,
          toCurrency,
          parseDate(fromDate),
          parseDate(toDate),
          opts.user,
          { forceRefresh: opts.refresh },
        ),
      );
      print(response, opts);
    },
  );

// ---- introspection ---------------------------------------------------------

program
  .command("providers")
  .description("list registered providers")
  .action(async (_options: unknown, cmd: Command) => {
    const opts = globals(cmd);
    const response = await withService(cmd, async (s) => ({
      data: await s.service.getRegisteredProviders(),
      metadata: { source: "provider" as const },
    }));
    print(response, opts);
  });

program
  .command("health [provider]")
  .description("show provider health")
  .action(async (provider: string | undefined, _options: unknown, cmd: Command) => {
    const opts = globals(cmd);
    const response = await withService(cmd, async (s) => {
      const providers = provider ? [provider] : await s.service.getRegisteredProviders();
      const data = Object.fromEntries(
        providers.map((name) => [name, s.service.getProviderHealth(name)]),
      );
      return { data, metadata: { source: "provider" as const } };
    });
    print(response, opts);
  });

/**
 * Parse and run. Exported for tests; cli.ts (the real entry point) delegates
 * here and owns error reporting / exit-code handling.
 */
export async function run(argv: string[]): Promise<void> {
  await program.parseAsync(argv);
}
