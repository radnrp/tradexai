"use client";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, type SeriesMarker, type UTCTimestamp } from "lightweight-charts";
import { API } from "@/lib/api/client";
import type { Position } from "@/lib/api/types";
import { fmtAgo } from "@/lib/format";
import { Skeleton } from "@/components/ui/primitives";

/** Closed 1-minute candles with this agent's entries/exits marked. Display-only Number conversion. */
export function CandleChart({ symbol, positions }: { symbol: string; positions: Position[] }) {
  const el = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ["candles", symbol], queryFn: () => API.candles(symbol), refetchInterval: 60_000 });

  useEffect(() => {
    if (!el.current || !q.data?.length) return;
    // canvas can't read CSS variables, so the colors below mirror the globals.css tokens
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#a0a4a6", fontFamily: getComputedStyle(document.body).fontFamily, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: "rgba(255,255,255,0.05)" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { horzLine: { labelBackgroundColor: "#24282a" }, vertLine: { labelBackgroundColor: "#24282a" } },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#02e949",
      downColor: "#ff6b6b",
      wickUpColor: "#02e949",
      wickDownColor: "#ff6b6b",
      borderVisible: false,
    });
    series.setData(q.data.map((c) => ({ time: Math.floor(c.time / 1000) as UTCTimestamp, open: +c.open, high: +c.high, low: +c.low, close: +c.close })));

    const first = q.data[0].time;
    const markers: SeriesMarker<UTCTimestamp>[] = [];
    for (const p of positions) {
      const t = new Date(p.opened_at).getTime();
      const short = p.side === "short";
      if (t >= first)
        markers.push({ time: Math.floor(t / 60000) * 60 as UTCTimestamp, position: short ? "aboveBar" : "belowBar", color: "#f6f7f7", shape: short ? "arrowDown" : "arrowUp", text: short ? "Short" : "Long" });
      if (p.closed_at && new Date(p.closed_at).getTime() >= first)
        markers.push({ time: Math.floor(new Date(p.closed_at).getTime() / 60000) * 60 as UTCTimestamp, position: short ? "belowBar" : "aboveBar", color: "#ffb648", shape: short ? "arrowUp" : "arrowDown", text: "Exit" });
    }
    createSeriesMarkers(series, markers.sort((a, b) => a.time - b.time));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [q.data, positions]);

  if (q.isPending) return <Skeleton className="h-56" />;
  if (q.isError || !q.data.length) return <div className="grid h-40 place-items-center px-6 text-center text-body-sm text-muted-foreground">Chart unavailable. Retrying…</div>;
  const last = q.data[q.data.length - 1];
  // the API only returns ~200 recent 1m candles, so an older trade has nothing to mark
  const outOfRange = positions.length > 0 && positions.every((p) => new Date(p.closed_at ?? p.opened_at).getTime() < q.data[0].time);
  return (
    <div>
      <div ref={el} className="h-56 w-full" role="img" aria-label={`${symbol} one-minute candles`} />
      <p className="mt-1 flex justify-between gap-2 text-caption text-muted-foreground">
        <span>{outOfRange ? "Trade is outside the chart range." : "1m candles"}</span>
        <span className="shrink-0">Last candle {fmtAgo(last.closeTime)}</span>
      </p>
    </div>
  );
}
