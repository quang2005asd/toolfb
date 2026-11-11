import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Biểu đồ trang Báo cáo kênh (SVG thuần, không thư viện):
 *  - StackedColumnChart: cột theo ngày, 1 hoặc 2 phần chồng nhau (vd. Tự nhiên + Trả phí = Tổng lượt xem)
 *  - TrendLineChart2: đường theo ngày (Người xem, Tương tác…)
 * Quy ước: cột ≤ 24px, bo 4px ở đầu cột, vuông ở gốc; khe 2px màu nền giữa các phần; đường 2px; một trục Y;
 * màu chuỗi lấy từ biến --viz-1 / --viz-2 (đã kiểm tra mù màu cho cả nền sáng và tối); chữ luôn dùng màu chữ.
 */

const MARGIN = { top: 12, right: 12, bottom: 26, left: 44 };

export function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Math.round(value).toLocaleString('vi-VN');
}

export function formatCompact(value) {
  if (value === null || value === undefined) return '—';
  const abs = Math.abs(value);
  const trim = (number) => number.toLocaleString('vi-VN', { maximumFractionDigits: number < 10 ? 1 : 0 });
  if (abs >= 1e9) return `${trim(value / 1e9)}T`;
  if (abs >= 1e6) return `${trim(value / 1e6)}Tr`;
  if (abs >= 1e4) return `${trim(value / 1e3)}K`;
  return Math.round(value).toLocaleString('vi-VN');
}

export function formatDay(day, withYear = false) {
  const [year, month, date] = String(day).split('-');
  return withYear ? `${date}/${month}/${year}` : `${date}/${month}`;
}

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const update = () => setWidth(node.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// Trục Y "đẹp": 0 → max làm tròn, 4 khoảng
function niceScale(maxValue) {
  if (!maxValue || maxValue <= 0) return { max: 4, ticks: [0, 1, 2, 3, 4] };
  const rough = maxValue / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  let step = [1, 2, 2.5, 5, 10].map((item) => item * power).find((item) => item >= rough) || rough;
  // Số liệu đều là số đếm: bước trục luôn là số nguyên (tránh nhãn 2,5 bị làm tròn thành "3, 5, 8")
  if (!Number.isInteger(step)) step = Math.max(1, Math.ceil(step));
  const max = step * 4;
  return { max, ticks: [0, step, step * 2, step * 3, max] };
}

// Hình chữ nhật bo 2 góc trên (đầu cột), vuông ở gốc
function topRoundedRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height);
  if (height <= 0) return '';
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

function labelEvery(count, innerWidth) {
  const maxLabels = Math.max(2, Math.floor(innerWidth / 56));
  return Math.max(1, Math.ceil(count / maxLabels));
}

function Tooltip({ x, width, title, rows }) {
  // Đặt tooltip bên phải điểm đang chỉ, sát mép phải thì lật sang trái
  const flip = x > width - 190;
  return (
    <div className="viz-tooltip" style={{ left: flip ? undefined : x + 12, right: flip ? width - x + 12 : undefined }} role="presentation">
      <strong>{title}</strong>
      {rows.map((row) => (
        <span key={row.label} className="viz-tooltip-row">
          {row.color && <i style={{ background: row.color }} aria-hidden="true" />}
          <span>{row.label}</span>
          <b>{row.value}</b>
        </span>
      ))}
    </div>
  );
}

export function Legend({ series }) {
  if (!series || series.length < 2) return null;
  return (
    <ul className="viz-legend">
      {series.map((item) => (
        <li key={item.key}><i style={{ background: item.color }} aria-hidden="true" />{item.label}</li>
      ))}
    </ul>
  );
}

/**
 * data: [{ date: 'YYYY-MM-DD', [key]: number|null }]
 * series: [{ key, label, color }] — vẽ từ dưới lên theo thứ tự
 * totalLabel: nhãn dòng tổng trong tooltip (khi có ≥ 2 phần)
 */
export function StackedColumnChart({ data, series, height = 260, totalLabel = 'Tổng', ariaLabel }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = height - MARGIN.top - MARGIN.bottom;
  const totals = useMemo(() => data.map((point) => series.reduce((sum, item) => sum + (Number(point[item.key]) || 0), 0)), [data, series]);
  const scale = niceScale(Math.max(0, ...totals));
  const band = data.length ? innerWidth / data.length : 0;
  const barWidth = Math.max(3, Math.min(24, band * 0.62));
  const y = (value) => MARGIN.top + innerHeight - (value / scale.max) * innerHeight;
  const every = labelEvery(data.length, innerWidth);
  const GAP = 2;

  return (
    <div className="viz-frame" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? 'viz-baseline' : 'viz-grid'} />
              <text x={MARGIN.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="viz-tick">{formatCompact(tick)}</text>
            </g>
          ))}
          {hover !== null && <rect x={MARGIN.left + band * hover} y={MARGIN.top} width={band} height={innerHeight} className="viz-hover-band" />}
          {data.map((point, index) => {
            const x = MARGIN.left + band * index + (band - barWidth) / 2;
            let base = 0;
            const parts = series.map((item) => ({ ...item, value: Number(point[item.key]) || 0 })).filter((part) => part.value > 0);
            return (
              <g key={point.date}>
                {parts.map((part, partIndex) => {
                  const top = y(base + part.value);
                  const bottom = y(base);
                  base += part.value;
                  // Khe 2px giữa các phần: phần phía trên lùi xuống 2px
                  const segHeight = Math.max(0, bottom - top - (partIndex > 0 ? GAP : 0));
                  const isTop = partIndex === parts.length - 1;
                  return isTop
                    ? <path key={part.key} d={topRoundedRect(x, top, barWidth, segHeight, 4)} fill={part.color} />
                    : <rect key={part.key} x={x} y={top} width={barWidth} height={segHeight} fill={part.color} />;
                })}
              </g>
            );
          })}
          {data.map((point, index) => (index % every === 0 || index === data.length - 1) && (
            <text key={`x-${point.date}`} x={MARGIN.left + band * index + band / 2} y={height - 8} textAnchor="middle" className="viz-tick">{formatDay(point.date)}</text>
          ))}
          {/* Vùng bắt chuột: cả dải của từng ngày (lớn hơn cột) */}
          {data.map((point, index) => (
            <rect
              key={`hit-${point.date}`}
              x={MARGIN.left + band * index}
              y={MARGIN.top}
              width={band}
              height={innerHeight}
              fill="transparent"
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip
          x={MARGIN.left + band * hover + band / 2}
          width={width}
          title={formatDay(data[hover].date, true)}
          rows={[
            ...[...series].reverse().map((item) => ({ label: item.label, color: item.color, value: formatNumber(data[hover][item.key]) })),
            ...(series.length > 1 ? [{ label: totalLabel, value: formatNumber(totals[hover]) }] : [])
          ]}
        />
      )}
    </div>
  );
}

/**
 * Đường theo ngày cho một chỉ số. data: [{ date, [valueKey]: number|null }]
 */
export function TrendLineChart2({ data, valueKey, label, color = 'var(--viz-1)', height = 180, ariaLabel }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = height - MARGIN.top - MARGIN.bottom;
  const values = data.map((point) => (point[valueKey] === null || point[valueKey] === undefined ? null : Number(point[valueKey])));
  const scale = niceScale(Math.max(0, ...values.filter((value) => value !== null)));
  const step = data.length > 1 ? innerWidth / (data.length - 1) : 0;
  const xAt = (index) => MARGIN.left + step * index;
  const y = (value) => MARGIN.top + innerHeight - (value / scale.max) * innerHeight;
  const points = values.map((value, index) => (value === null ? null : [xAt(index), y(value)])).filter(Boolean);
  const line = points.map(([px, py], index) => `${index ? 'L' : 'M'}${px},${py}`).join('');
  const area = points.length > 1 ? `${line}L${points[points.length - 1][0]},${y(0)}L${points[0][0]},${y(0)}Z` : '';
  const every = labelEvery(data.length, innerWidth);
  const last = points[points.length - 1];

  const onMove = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const index = Math.round((event.clientX - box.left - MARGIN.left) / (step || 1));
    setHover(Math.max(0, Math.min(data.length - 1, index)));
  };

  return (
    <div className="viz-frame" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel || label} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? 'viz-baseline' : 'viz-grid'} />
              <text x={MARGIN.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="viz-tick">{formatCompact(tick)}</text>
            </g>
          ))}
          {area && <path d={area} fill={color} opacity={0.1} />}
          {line && <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {last && hover === null && <circle cx={last[0]} cy={last[1]} r={4} fill={color} className="viz-dot" />}
          {hover !== null && values[hover] !== null && (
            <>
              <line x1={xAt(hover)} x2={xAt(hover)} y1={MARGIN.top} y2={MARGIN.top + innerHeight} className="viz-crosshair" />
              <circle cx={xAt(hover)} cy={y(values[hover])} r={4} fill={color} className="viz-dot" />
            </>
          )}
          {data.map((point, index) => (index % every === 0 || index === data.length - 1) && (
            <text key={point.date} x={xAt(index)} y={height - 8} textAnchor={index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'} className="viz-tick">{formatDay(point.date)}</text>
          ))}
          <rect x={MARGIN.left} y={MARGIN.top} width={innerWidth} height={innerHeight} fill="transparent" />
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip x={xAt(hover)} width={width} title={formatDay(data[hover].date, true)} rows={[{ label, color, value: formatNumber(values[hover]) }]} />
      )}
    </div>
  );
}
