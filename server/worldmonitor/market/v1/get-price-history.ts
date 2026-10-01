/**
 * RPC: GetPriceHistory
 * Dated daily closes from Yahoo Finance for up to four symbols already carried
 * by the commodity, market and Gulf quote sets.
 */

import type {
  ServerContext,
  GetPriceHistoryRequest,
  GetPriceHistoryResponse,
  PriceSeries,
} from '../../../../src/generated/server/worldmonitor/market/v1/service_server';
import commodityConfig from '../../../../shared/commodities.json';
import stockConfig from '../../../../shared/stocks.json';
import gulfConfig from '../../../../shared/gulf.json';
import { UPSTREAM_TIMEOUT_MS, type YahooChartResponse } from './_shared';
import { CHROME_UA, yahooGate } from '../../../_shared/constants';
import { cachedFetchJson } from '../../../_shared/redis';

const CACHE_TTL_SECONDS = 3 * 60 * 60;
const DEFAULT_RANGE = '3mo';

// Commodities come last so their names win where a symbol is listed twice (CL=F).
export const TRACKED_SYMBOL_NAMES: ReadonlyMap<string, string> = new Map(
  [...gulfConfig.symbols, ...stockConfig.auxiliarySymbols, ...stockConfig.symbols, ...commodityConfig.commodities]
    .map(({ symbol, name }) => [symbol, name]),
);

function fetchSeries(symbol: string, name: string, range: string): Promise<PriceSeries | null> {
  return cachedFetchJson<PriceSeries>(`market:price-history:v1:${symbol}:${range}`, CACHE_TTL_SECONDS, async () => {
    await yahooGate();
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`,
      { headers: { 'User-Agent': CHROME_UA }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) },
    );
    if (!res.ok) return null;

    const data: YahooChartResponse = await res.json();
    const result = data?.chart?.result?.[0];
    const rawCloses = result?.indicators?.quote?.[0]?.close ?? [];
    const timestamps: number[] = [];
    const closes: number[] = [];
    (result?.timestamp ?? []).forEach((seconds, i) => {
      const close = rawCloses[i];
      if (typeof close !== 'number' || !Number.isFinite(close)) return;
      timestamps.push(seconds * 1000);
      closes.push(close);
    });
    if (closes.length === 0) return null;

    return { symbol, name, currency: result?.meta?.currency || 'USD', timestamps, closes };
  });
}

export async function getPriceHistory(
  _ctx: ServerContext,
  req: GetPriceHistoryRequest,
): Promise<GetPriceHistoryResponse> {
  const range = req.range || DEFAULT_RANGE;
  const requested = [...new Set(req.symbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))];

  const results = await Promise.all(requested.map(async (symbol) => {
    const name = TRACKED_SYMBOL_NAMES.get(symbol);
    if (!name) return { symbol, series: null };
    try {
      return { symbol, series: await fetchSeries(symbol, name, range) };
    } catch {
      return { symbol, series: null };
    }
  }));

  return {
    range,
    series: results.flatMap((r) => (r.series ? [r.series] : [])),
    unavailable: results.filter((r) => !r.series).map((r) => r.symbol),
  };
}
