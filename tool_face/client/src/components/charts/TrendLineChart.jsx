import { useEffect, useMemo, useRef, useState } from 'react';

const HEIGHT = 260;
const PAD = { top: 30, right: 24, bottom: 36, left: 48 };
const MIN_LABEL_GAP = 58; // khoảng cách tối thiểu giữa 2 nhãn ngày trên trục X (px)

const fullNumber = new Intl.NumberFormat('vi-VN');
const decimalNumber = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

// Rút gọn nhãn trục Y: 1.500 → 1,5K; 2.000.000 → 2M
function compactNumber(value) {
  if (value >= 1e6) return `${decimalNumber.format(value / 1e6)}M`;
  if (value >= 1e3) return `${decimalNumber.format(value / 1e3)}K`;
  return fullNumber.format(value);
}

// Bước chia trục Y tròn số (1, 2, 5 × 10^k), tối thiểu 1 vì đây là số đếm
function niceStep(raw) {
  const exponent = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / exponent;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * exponent;
}

function buildYScale(max) {
  const step = Math.max(1, niceStep(Math.max(max, 1) / 4));
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  return { top, ticks };
}

function formatFullDate(iso) {
  const [year, month, day] = String(iso || '').split('-');
  return year && month && day ? `${day}/${month}/${year}` : String(iso || '');
}

/**
 * Đồ thị đường theo ngày cho một chỉ số (tương tác / lượt xem / cảm xúc).
 * items: [{ date: 'dd/mm', fullDate: 'yyyy-mm-dd', postsCount, reactions, comments, shares, ...valueKey }]
 */
export default function TrendLineChart({ items = [], valueKey, valueLabel, loading = false }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(null);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return undefined;
    const update = () => setWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [items.length > 0]);

  useEffect(() => {
    setActiveIndex(null);
  }, [items, valueKey]);

  const count = items.length;
  const chart = useMemo(() => {
    const values = items.map((item) => Number(item[valueKey]) || 0);
    const max = Math.max(0, ...values);
    const { top, ticks } = buildYScale(max);
    const innerWidth = Math.max(0, width - PAD.left - PAD.right);
    const innerHeight = HEIGHT - PAD.top - PAD.bottom;
    const baseline = PAD.top + innerHeight;
    const xAt = (index) => PAD.left + (values.length <= 1 ? innerWidth / 2 : (index * innerWidth) / (values.length - 1));
    const yAt = (value) => baseline - (value / top) * innerHeight;
    const points = values.map((value, index) => ({ x: xAt(index), y: yAt(value), value }));
    const linePath = points.map((p, index) => `${index ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPath = points.length
      ? `${linePath} L${points[points.length - 1].x.toFixed(1)},${baseline} L${points[0].x.toFixed(1)},${baseline} Z`
      : '';
    // Nhãn ngày giãn đều theo bề rộng, luôn giữ nhãn ngày mới nhất ở cuối trục
    const maxLabels = Math.max(1, Math.floor(innerWidth / MIN_LABEL_GAP));
    const labelStep = Math.max(1, Math.ceil(values.length / maxLabels));
    return {
      values,
      max,
      ticks,
      yAt,
      baseline,
      innerWidth,
      points,
      linePath,
      areaPath,
      labelStep,
      peakIndex: max > 0 ? values.lastIndexOf(max) : -1,
      total: values.reduce((sum, value) => sum + value, 0)
    };
  }, [items, valueKey, width]);

  const indexFromPointer = (clientX) => {
    const rect = svgRef.current.getBoundingClientRect();
    if (count <= 1) return 0;
    const ratio = (clientX - rect.left - PAD.left) / chart.innerWidth;
    return Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))));
  };

  const handleKeyDown = (event) => {
    if (!count) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      setActiveIndex((current) => Math.min(count - 1, Math.max(0, (current ?? count - 1) + delta)));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? 0 : count - 1);
    } else if (event.key === 'Escape') {
      setActiveIndex(null);
    }
  };

  if (count === 0) {
    return (
      <div className="trend-chart trend-chart-empty" ref={wrapRef}>
        {loading ? 'Đang tổng hợp dữ liệu bài viết…' : 'Chưa có bài viết nào trong khoảng thời gian này.'}
      </div>
    );
  }

  const active = activeIndex !== null ? items[activeIndex] : null;
  const activePoint = activeIndex !== null ? chart.points[activeIndex] : null;
  const tooltipOnLeft = activePoint && activePoint.x > width * 0.62;
  const summary = `Đồ thị đường ${valueLabel} theo ngày, ${count} ngày từ ${items[0].date} đến ${items[count - 1].date}. `
    + `Tổng ${fullNumber.format(chart.total)}, cao nhất ${fullNumber.format(chart.max)}`
    + (chart.peakIndex >= 0 ? ` vào ngày ${items[chart.peakIndex].date}.` : '.')
    + ' Dùng phím mũi tên trái phải để xem từng ngày.';

  return (
    <div
      className={`trend-chart${loading ? ' is-refetching' : ''}`}
      ref={wrapRef}
      tabIndex={0}
      role="group"
      aria-label={summary}
      onKeyDown={handleKeyDown}
      onFocus={() => setActiveIndex((current) => current ?? count - 1)}
      onBlur={() => setActiveIndex(null)}
    >
      {width > 0 && (
        <svg
          ref={svgRef}
          width={width}
          height={HEIGHT}
          className="trend-chart-svg"
          aria-hidden="true"
          onPointerMove={(event) => setActiveIndex(indexFromPointer(event.clientX))}
          onPointerLeave={() => setActiveIndex(null)}
        >
          {/* Lưới ngang & trục Y */}
          {chart.ticks.map((tick) => (
            <g key={tick}>
              <line className="trend-grid" x1={PAD.left} x2={width - PAD.right} y1={chart.yAt(tick)} y2={chart.yAt(tick)} />
              <text className="trend-axis-label" x={PAD.left - 10} y={chart.yAt(tick)} textAnchor="end" dominantBaseline="middle">
                {compactNumber(tick)}
              </text>
            </g>
          ))}

          {/* Nhãn ngày trục X */}
          {items.map((item, index) => ((count - 1 - index) % chart.labelStep === 0 ? (
            <text
              key={`x-${item.fullDate}-${index}`}
              className={`trend-axis-label${index === activeIndex ? ' is-active' : ''}`}
              x={chart.points[index].x}
              y={chart.baseline + 22}
              textAnchor="middle"
            >
              {item.date}
            </text>
          ) : null))}

          {/* Vùng nền nhạt + đường */}
          <path className="trend-area" d={chart.areaPath} />
          <path className="trend-line" d={chart.linePath} />

          {/* Đường dóng theo ngày đang chọn */}
          {activePoint && (
            <line className="trend-crosshair" x1={activePoint.x} x2={activePoint.x} y1={PAD.top - 12} y2={chart.baseline} />
          )}

          {/* Điểm dữ liệu: chỉ đánh dấu ngày có số liệu để đường không bị rối */}
          {chart.points.map((point, index) => (point.value > 0 || index === activeIndex ? (
            <circle
              key={`p-${index}`}
              className={`trend-marker${index === activeIndex ? ' is-active' : ''}`}
              cx={point.x}
              cy={point.y}
              r={index === activeIndex ? 5.5 : 4}
            />
          ) : null))}

          {/* Nhãn giá trị cao nhất (chỉ một nhãn, phần còn lại xem qua tooltip); ẩn khi tooltip đang mở để không bị che */}
          {chart.peakIndex >= 0 && activeIndex === null && (
            <text
              className="trend-peak-label"
              x={chart.points[chart.peakIndex].x}
              y={chart.points[chart.peakIndex].y - 12}
              textAnchor="middle"
            >
              {fullNumber.format(chart.max)}
            </text>
          )}
        </svg>
      )}

      {active && activePoint && (
        <div
          className="trend-tooltip"
          style={{
            left: activePoint.x,
            top: PAD.top - 6,
            transform: tooltipOnLeft ? 'translateX(calc(-100% - 14px))' : 'translateX(14px)'
          }}
          aria-live="polite"
        >
          <div className="trend-tooltip-date">Ngày {formatFullDate(active.fullDate)}</div>
          <div className="trend-tooltip-value">
            <span className="trend-tooltip-key" aria-hidden="true" />
            <strong>{fullNumber.format(chart.values[activeIndex])}</strong>
            <span>{valueLabel}</span>
          </div>
          <div className="trend-tooltip-meta">
            {fullNumber.format(active.postsCount || 0)} bài viết · {fullNumber.format(active.reactions || 0)} cảm xúc · {fullNumber.format(active.comments || 0)} bình luận · {fullNumber.format(active.shares || 0)} chia sẻ
          </div>
        </div>
      )}

      {chart.max === 0 && !loading && (
        <div className="trend-chart-note">Chưa có {valueLabel} trong khoảng thời gian này.</div>
      )}

      {/* Bảng số liệu cho trình đọc màn hình */}
      <table className="trend-sr-only">
        <caption>{`Số ${valueLabel} theo ngày`}</caption>
        <thead>
          <tr><th scope="col">Ngày</th><th scope="col">{valueLabel}</th><th scope="col">Bài viết</th></tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={`row-${item.fullDate}-${index}`}>
              <td>{formatFullDate(item.fullDate)}</td>
              <td>{chart.values[index]}</td>
              <td>{item.postsCount || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
