import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  ArcElement, LineElement, PointElement, BarElement,
  CategoryScale, LinearScale, Tooltip, Legend, Filler,
} from 'chart.js';
import { Doughnut, Line, Bar } from 'react-chartjs-2';
import { currency } from '../utils/format';

ChartJS.register(ArcElement, LineElement, PointElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

// 已用 dataviz 校驗腳本驗證通過的分類色（固定順序，不循環）。第 9 類折入「其他」灰。
export const CATEGORY_COLORS = ['#2a78d6', '#008300', '#e87ba4', '#eda100', '#1baf7a', '#eb6834', '#4a3aa7', '#e34948'];
const OTHER_COLOR = '#9aa3b0';
const INK = '#52514e';
const MUTED = '#898781';
const GRID = 'rgba(137,135,129,0.16)';

const compactUsd = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1000) return `$${(v / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return `$${Math.round(v)}`;
};

// 在圓環真實圓心（非容器中心）繪製標題+數值，避開圖例造成的偏移
function centerTextPlugin(caption: string, value: string, valueColor = '#172033') {
  return {
    id: `centerText-${caption}`,
    afterDatasetsDraw(chart: { ctx: CanvasRenderingContext2D; getDatasetMeta: (i: number) => { data: Array<{ x: number; y: number }> } }) {
      const arc = chart.getDatasetMeta(0).data[0];
      if (!arc) return;
      const { ctx } = chart;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = MUTED;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText(caption, arc.x, arc.y - 10);
      ctx.fillStyle = valueColor;
      ctx.font = '800 18px system-ui, sans-serif';
      ctx.fillText(value, arc.x, arc.y + 8);
      ctx.restore();
    },
  };
}

// ---------- KPI 卡（漸變底 + sparkline 曲線） ----------
export interface KpiCardProps {
  title: string;
  value: string;
  delta?: number | null;   // 環比百分比
  accent: string;          // CSS 漸變
  spark: number[];
  sparkType?: 'line' | 'area' | 'bar';
  onClick?: () => void;    // 有值時把數字做成連結
}

export function KpiCard({ title, value, delta, accent, spark, sparkType = 'line', onClick }: KpiCardProps) {
  const white = 'rgba(255,255,255,.55)';
  const data = useMemo(() => ({
    labels: spark.map((_, i) => i + 1),
    datasets: [{
      data: spark,
      borderColor: white,
      backgroundColor: sparkType === 'area' ? 'rgba(255,255,255,.20)' : sparkType === 'bar' ? 'rgba(255,255,255,.30)' : 'transparent',
      fill: sparkType === 'area',
      borderWidth: 2,
      tension: 0.4,
      pointRadius: 0,
      pointHoverRadius: 0,
      borderRadius: sparkType === 'bar' ? 3 : undefined,
      borderSkipped: false as const,
    }],
  }), [spark, sparkType]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { display: false, grid: { display: false } },
      y: { display: false, grid: { display: false }, min: sparkType === 'bar' ? 0 : undefined },
    },
    animation: false as const,
  }), [sparkType]);

  const hasDelta = delta !== undefined && delta !== null && Number.isFinite(delta);
  return (
    <article className="kpi-card" style={{ background: accent }}>
      <div className="kpi-head">
        {onClick
          ? <strong role="link" tabIndex={0} onClick={onClick} onKeyDown={e => { if (e.key === 'Enter') onClick(); }} style={{ cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '3px' }}>{value}</strong>
          : <strong>{value}</strong>}
        {hasDelta && (
          <span className="kpi-delta">{delta! >= 0 ? '▲' : '▼'} {Math.abs(delta!).toFixed(1)}%</span>
        )}
      </div>
      <span className="kpi-title">{title}</span>
      <div className="kpi-spark">
        {sparkType === 'bar'
          ? <Bar data={data} options={options} />
          : <Line data={data} options={options} />}
      </div>
    </article>
  );
}

// 一行最多 maxCols 項（窄屏 2、寬屏 3），且各行盡量均分：先定行數 ⌈N/maxCols⌉，再回推列數
function catListCols(n: number, maxCols: number): number {
  if (n <= 1) return 1;
  const rows = Math.ceil(n / maxCols);
  return Math.max(1, Math.ceil(n / rows));
}

// ---------- 支出分類 Doughnut ----------
export function CategoryDoughnut({ items }: { items: Array<{ label: string; value: number }> }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const data = {
    labels: items.map(i => i.label),
    datasets: [{
      data: items.map(i => i.value),
      backgroundColor: items.map((i, idx) => i.label === '其他' ? OTHER_COLOR : CATEGORY_COLORS[idx % CATEGORY_COLORS.length]),
      borderColor: '#ffffff',
      borderWidth: 2,
      hoverOffset: 4,
    }],
  };
  // 依列表容器實際寬度決定每行上限：窄屏/縮放/手機 → 2 項，寬屏 → 3 項
  const listRef = useRef<HTMLUListElement>(null);
  const [maxCols, setMaxCols] = useState(3);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    const update = () => setMaxCols(el.clientWidth < 400 ? 2 : 3);
    update();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener('resize', update);
    return () => { ro?.disconnect(); window.removeEventListener('resize', update); };
  }, []);
  const cols = catListCols(items.length, maxCols);

  const colorOf = (label: string, idx: number) => (label === '其他' ? OTHER_COLOR : CATEGORY_COLORS[idx % CATEGORY_COLORS.length]);
  const options = {
    responsive: true, maintainAspectRatio: false, cutout: '62%',
    plugins: {
      legend: { display: false },   // 改用下方自訂數據列表
      tooltip: {
        callbacks: {
          label: (ctx: { label?: string; parsed: number }) => {
            const pct = total ? Math.round((ctx.parsed / total) * 100) : 0;
            return ` ${ctx.label}: ${currency(ctx.parsed)} (${pct}%)`;
          },
        },
      },
    },
  };
  return (
    <>
      <div className="chart-canvas doughnut-wrap">
        <Doughnut data={data} options={options} plugins={[centerTextPlugin('年度支出', compactUsd(total))]} />
      </div>
      <ul ref={listRef} className="cat-data-list" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {items.map((it, idx) => (
          <li key={it.label}>
            <span className="dot" style={{ background: colorOf(it.label, idx) }} />
            <span className="cat-name" title={it.label}>{it.label}</span>
            <span className="cat-amt">{currency(it.value)}</span>
            <span className="cat-pct">{total ? Math.round((it.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------- 預算 vs 實際 Doughnut ----------
export function BudgetDoughnut({ used, budget }: { used: number; budget: number }) {
  const over = used > budget;
  const remaining = Math.max(0, budget - used);
  const pct = budget ? Math.round((used / budget) * 100) : 0;
  const data = {
    labels: over ? ['已使用', '超支'] : ['已使用', '剩餘'],
    datasets: [{
      data: over ? [budget, used - budget] : [used, remaining],
      backgroundColor: over ? ['#2a78d6', '#e34948'] : ['#2a78d6', '#e6ebf2'],
      borderColor: '#ffffff', borderWidth: 2,
    }],
  };
  const options = {
    responsive: true, maintainAspectRatio: false, cutout: '68%',
    plugins: {
      legend: { position: 'bottom' as const, labels: { color: INK, boxWidth: 12, padding: 10, font: { size: 11 } } },
      tooltip: { callbacks: { label: (ctx: { label?: string; parsed: number }) => ` ${ctx.label}: ${currency(ctx.parsed)}` } },
    },
  };
  return (
    <div className="chart-canvas doughnut-wrap">
      <Doughnut data={data} options={options} plugins={[centerTextPlugin('已使用', `${pct}%`, over ? '#e34948' : '#172033')]} />
    </div>
  );
}

// ---------- 折線（新增記錄趨勢） ----------
export function TrendLine({ labels, series }: { labels: string[]; series: Array<{ label: string; data: number[]; color: string }> }) {
  const data = {
    labels,
    datasets: series.map(s => ({
      label: s.label, data: s.data,
      borderColor: s.color, backgroundColor: s.color,
      borderWidth: 2, tension: 0.4, pointRadius: 2, pointHoverRadius: 5, fill: false,
    })),
  };
  const options = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { position: 'top' as const, align: 'end' as const, labels: { color: INK, boxWidth: 12, padding: 12, font: { size: 11 } } },
      tooltip: { callbacks: { label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => ` ${ctx.dataset.label}: ${currency(ctx.parsed.y ?? 0)}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: MUTED, font: { size: 10 } } },
      y: { grid: { color: GRID }, ticks: { color: MUTED, font: { size: 10 }, callback: (v: number | string) => compactUsd(Number(v)) }, beginAtZero: true },
    },
  };
  return <div className="chart-canvas"><Line data={data} options={options} /></div>;
}

// ---------- 分組柱（現金流） ----------
export function GroupedBar({ labels, series }: { labels: string[]; series: Array<{ label: string; data: number[]; color: string }> }) {
  const data = {
    labels,
    datasets: series.map(s => ({
      label: s.label, data: s.data, backgroundColor: s.color,
      borderRadius: 4, borderSkipped: false as const, maxBarThickness: 22,
    })),
  };
  const options = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { position: 'top' as const, align: 'end' as const, labels: { color: INK, boxWidth: 12, padding: 12, font: { size: 11 } } },
      tooltip: { callbacks: { label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => ` ${ctx.dataset.label}: ${currency(ctx.parsed.y ?? 0)}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: MUTED, font: { size: 10 } } },
      y: { grid: { color: GRID }, ticks: { color: MUTED, font: { size: 10 }, callback: (v: number | string) => compactUsd(Number(v)) }, beginAtZero: true },
    },
  };
  return <div className="chart-canvas"><Bar data={data} options={options} /></div>;
}
