/* Pécule — petits graphiques SVG sans dépendance. */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const money = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(n));
  const compact = (n) => {
    const a = Math.abs(n);
    if (a >= 1000) return `${(n / 1000).toFixed(a >= 10000 ? 0 : 1).replace('.', ',')} k€`;
    return `${Math.round(n)} €`;
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function niceMax(v) {
    if (v <= 0) return 100;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * p;
  }

  /** Donut : items = [{label, value, color}] */
  function donut(items, opts) {
    opts = opts || {};
    const total = items.reduce((a, i) => a + i.value, 0);
    const size = 180, r = 70, stroke = 26, c = 2 * Math.PI * r;
    let offset = 0;
    const segs = total > 0 ? items.map((i) => {
      const len = i.value / total * c;
      const gap = items.length > 1 ? Math.min(2, len / 3) : 0;
      const seg = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${i.color}" stroke-width="${stroke}"
        stroke-dasharray="${Math.max(0, len - gap)} ${c}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${size / 2} ${size / 2})">
        <title>${esc(i.label)} : ${money(i.value)} (${Math.round(i.value / total * 100)} %)</title></circle>`;
      offset += len;
      return seg;
    }).join('') : `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/>`;
    return `<svg class="chart donut" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(opts.title || 'Répartition')}">
      ${segs}
      <text x="50%" y="47%" text-anchor="middle" class="donut-total">${compact(total)}</text>
      <text x="50%" y="60%" text-anchor="middle" class="donut-sub">${esc(opts.subtitle || 'au total')}</text>
    </svg>`;
  }

  /** Barres groupées : data = [{label, values:[...]}], series = [{name,color}] */
  function bars(data, series, opts) {
    opts = opts || {};
    const W = opts.width || 560, H = opts.height || 220, pl = 46, pr = 8, pt = 12, pb = 26;
    const max = niceMax(Math.max(1, ...data.flatMap((d) => d.values)));
    const iw = W - pl - pr, ih = H - pt - pb;
    const gw = iw / data.length;
    const bw = Math.min(22, (gw * 0.7) / series.length);
    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const y = pt + ih - (ih * i) / 4;
      grid += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" class="grid"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end" class="axis">${compact(max * i / 4)}</text>`;
    }
    let body = '';
    data.forEach((d, gi) => {
      const gx = pl + gi * gw + (gw - bw * series.length - 4 * (series.length - 1)) / 2;
      d.values.forEach((v, si) => {
        const h = Math.max(v > 0 ? 2 : 0, (v / max) * ih);
        const x = gx + si * (bw + 4);
        body += `<rect x="${x}" y="${pt + ih - h}" width="${bw}" height="${h}" rx="4" fill="${series[si].color}"><title>${esc(d.label)} — ${esc(series[si].name)} : ${money(v)}</title></rect>`;
      });
      body += `<text x="${pl + gi * gw + gw / 2}" y="${H - 8}" text-anchor="middle" class="axis${d.highlight ? ' strong' : ''}">${esc(d.label)}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(opts.title || 'Graphique')}">${grid}${body}</svg>`;
  }

  /** Courbes : labels = [...], series = [{name,color,values,area?,dashed?}] */
  function lines(labels, series, opts) {
    opts = opts || {};
    const W = opts.width || 560, H = opts.height || 240, pl = 52, pr = 12, pt = 14, pb = 26;
    const all = series.flatMap((s) => s.values);
    const minV = Math.min(0, ...all);
    const maxV = niceMax(Math.max(1, ...all));
    const lo = minV < 0 ? -niceMax(-minV) : 0;
    const iw = W - pl - pr, ih = H - pt - pb;
    const x = (i) => pl + (labels.length === 1 ? iw / 2 : (i * iw) / (labels.length - 1));
    const y = (v) => pt + ih - ((v - lo) / (maxV - lo)) * ih;
    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const v = lo + ((maxV - lo) * i) / 4;
      grid += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end" class="axis">${compact(v)}</text>`;
    }
    if (lo < 0) grid += `<line x1="${pl}" x2="${W - pr}" y1="${y(0)}" y2="${y(0)}" class="zero"/>`;
    const every = Math.ceil(labels.length / 12);
    const xl = labels.map((l, i) => (i % every === 0 || i === labels.length - 1) ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="axis">${esc(l)}</text>` : '').join('');
    const paths = series.map((s) => {
      const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
      const area = s.area ? `<path d="M${x(0)},${y(Math.max(lo, 0))} L${pts.join(' L')} L${x(s.values.length - 1)},${y(Math.max(lo, 0))} Z" fill="${s.color}" opacity="0.14"/>` : '';
      const dots = s.values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${s.color}"><title>${esc(labels[i])} — ${esc(s.name)} : ${money(v)}</title></circle>`).join('');
      return `${area}<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" ${s.dashed ? 'stroke-dasharray="6 5"' : ''}/>${s.values.length <= 24 ? dots : ''}`;
    }).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(opts.title || 'Graphique')}">${grid}${xl}${paths}</svg>`;
  }

  function legend(series) {
    return `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
  }

  root.Charts = { donut, bars, lines, legend, NS };
})(window);
