#!/usr/bin/env node
import { Command } from "commander";
import { wireService } from "./service.js";

// Suppress noisy yahoo-finance2 survey/deprecation notices that are not useful
// in an agent-facing CLI. The notices are emitted via console.log/console.warn
// before we can configure the YahooFinance instance, so we filter the streams.
const YAHOO_NOTICE_PATTERNS = [
  /Please consider completing the survey at https:\/\/bit\.ly\/yahoo-finance-api-feedback/,
  /for more info see https:\/\/github\.com\/gadicc\/yahoo-finance2\/issues\/\d+#issuecomment-/,
  /\[Deprecated\] historical\(\) relies on an API that Yahoo have removed/,
  /We'll map this request to chart\(\) for convenience/,
  /please consider using chart\(\) directly instead/,
  /This will only be shown once, but you can suppress this message in future/,
];

function isYahooNotice(chunk: unknown): boolean {
  if (typeof chunk !== "string") return false;
  return YAHOO_NOTICE_PATTERNS.some((pattern) => pattern.test(chunk));
}

function filterStream(stream: NodeJS.WriteStream): void {
  const originalWrite = stream.write.bind(stream);
  stream.write = ((chunk: unknown, encoding?: unknown, cb?: unknown) => {
    if (isYahooNotice(chunk)) return true;
    return (originalWrite as (chunk: unknown, encoding?: unknown, cb?: unknown) => boolean)(
      chunk,
      encoding as BufferEncoding,
      cb as () => void,
    );
  }) as typeof stream.write;
}

filterStream(process.stdout);
filterStream(process.stderr);

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

async function withService<T>(
  cmd: Command,
  fn: (service: Awaited<ReturnType<typeof createServiceFromCmd>>) => Promise<T>,
): Promise<T> {
  const svc = await createServiceFromCmd(cmd);
  try {
    return await fn(svc);
  } finally {
    svc.close();
  }
}

async function createServiceFromCmd(cmd: Command) {
  const opts = globals(cmd);
  const { options, close } = await wireService({ dbPath: opts.db });
  const { service } = createService(options);
  return { service, close };
}

import { createService } from "./service.js";

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

program.parseAsync(process.argv).catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
