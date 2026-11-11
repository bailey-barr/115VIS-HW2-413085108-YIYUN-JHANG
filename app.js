/* Statistics are extracted from the attached DGBAS report, tables 6 and 3. */
(() => {
  'use strict';
  const REGIONS = [
    { key: '中國大陸(含港澳)', short: '中國大陸（含港澳）', color: '#145c3a', coord: [104, 34], label: [0, -49] },
    { key: '東南亞', short: '東南亞', color: '#527322', coord: [108, 6], label: [0, 48] },
    { key: '美國', short: '美國', color: '#006b68', coord: [-105, 38], label: [0, -43] },
    { key: '日本、南韓', short: '日本、南韓', color: '#86600d', coord: [141, 39], label: [0, -39] },
    { key: '其他', short: '其他', color: '#52665b', coord: null }
  ];
  const KEYS = ['總計', ...REGIONS.map(r => r.key)];
  const $ = id => document.getElementById(id);
  const fmt = v => v === null || v === undefined ? '—' : d3.format(',')(v);
  const percent = v => v === null ? '—' : `${v.toFixed(1)}%`;
  const state = { year: 113, region: null, mode: 'value', playing: null, range: [88, 113] };
  let rows, world, mapSvg, mapLayer, projection, mapZoom, yearBrush, brushGroup, brushScale, brushAnchorYear;
  const color = key => REGIONS.find(r => r.key === key)?.color || '#163e31';
  const displayName = key => REGIONS.find(r => r.key === key)?.short || key;
  const rowAt = year => rows.find(r => r.year === Number(year));
  const share = (row, key) => row.shares?.[key] ?? null;
  const visibleRows = () => rows.filter(r => r.year >= state.range[0] && r.year <= state.range[1]);
  const metric = (row, key) => state.mode === 'share' ? share(row, key) : row[key];

  function tooltip(event, html) {
    const el = $('tooltip'); el.innerHTML = html; el.hidden = false;
    const rect = event.currentTarget?.getBoundingClientRect?.();
    const px = Number.isFinite(event.clientX) && event.clientX !== 0 ? event.clientX : (rect?.x || 30) + 20;
    const py = Number.isFinite(event.clientY) && event.clientY !== 0 ? event.clientY : (rect?.y || 30) + 20;
    el.style.left = `${Math.max(8, Math.min(px + 15, innerWidth - el.offsetWidth - 12))}px`;
    el.style.top = `${Math.max(8, Math.min(py + 15, innerHeight - el.offsetHeight - 12))}px`;
  }
  function hideTooltip() { $('tooltip').hidden = true; }
  function regionTooltip(event, key) {
    const row = rowAt(state.year);
    tooltip(event, `<strong>${displayName(key)}</strong><div>${state.year} 年（${state.year + 1911}）</div><div class="tip-line"><span>人數</span><b>${fmt(row[key])}${row[key] === null ? '（未提供）' : ' 千人'}</b></div><div class="tip-line"><span>占總計</span><b>${percent(share(row, key))}</b></div><div>點選以查看歷年走勢</div>`);
  }
  function stopPlay() {
    clearInterval(state.playing); state.playing = null;
    $('play').textContent = '▶ 播放'; $('play').setAttribute('aria-label', '播放年度變化');
  }
  function setYear(year, manual = true) {
    if (manual) stopPlay();
    if (!rowAt(year) || year < state.range[0] || year > state.range[1]) return;
    state.year = Number(year); hideTooltip(); render();
  }
  function setRegion(key) {
    state.region = state.region === key ? null : key;
    hideTooltip(); render();
  }
  function setupControls() {
    $('year-select').innerHTML = rows.slice().reverse().map(r => `<option value="${r.year}">${r.year} 年 · ${r.year + 1911}</option>`).join('');
    $('year-range').min = rows[0].year; $('year-range').max = rows.at(-1).year;
    $('year-select').addEventListener('change', e => setYear(e.target.value));
    $('year-range').addEventListener('input', e => setYear(e.target.value));
    $('play').addEventListener('click', () => {
      if (state.playing) { stopPlay(); return; }
      if (state.year === state.range[1]) setYear(state.range[0], false);
      $('play').textContent = 'Ⅱ 暫停'; $('play').setAttribute('aria-label', '暫停年度變化');
      state.playing = setInterval(() => {
        const index = rows.findIndex(r => r.year === state.year);
        if (state.year === state.range[1]) { stopPlay(); return; }
        setYear(rows[index + 1].year, false);
      }, 1400);
    });
    d3.select('#region-filters').selectAll('button').data([{key: null, short: '全部'}, ...REGIONS]).join('button')
      .text(d => d.short).attr('data-region', d => d.key || 'all').on('click', (_, d) => setRegion(d.key));
    $('clear-region').addEventListener('click', () => { state.region = null; render(); });
    ['value', 'share'].forEach(mode => $(`mode-${mode}`).addEventListener('click', () => {
      state.mode = mode; hideTooltip(); render();
    }));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTooltip(); });
    window.addEventListener('scroll', hideTooltip, { passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopPlay(); });
    for (const [key, rawUrl] of Object.entries(window.PROJECT_LINKS || {})) {
      const target = $(`${key}-link`); if (!target || !rawUrl) continue;
      try {
        const url = new URL(rawUrl);
        const allowed = key === 'github' ? ['github.com'] : ['youtube.com', 'www.youtube.com', 'youtu.be'];
        if (url.protocol !== 'https:' || !allowed.includes(url.hostname)) continue;
        const a = document.createElement('a'); a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.textContent = key === 'github' ? 'GitHub 專案 ↗' : 'YouTube 展示 ↗'; target.replaceWith(a);
      } catch { /* Unconfigured URLs remain explicitly pending. */ }
    }
  }
  function setupMap() {
    mapSvg = d3.select('#map');
    mapSvg.append('defs').append('clipPath').attr('id', 'map-clip').append('rect').attr('width', 1000).attr('height', 480);
    mapLayer = mapSvg.append('g').attr('clip-path', 'url(#map-clip)').append('g');
    // Pacific-centered schematic: compress the middle ocean band to bring the land masses closer.
    // This display deliberately does not preserve geographical distance or area.
    const base = d3.geoEquirectangular().rotate([-180, 0]).center([0, 8]).scale(245).translate([500, 240]);
    const compressX = x => x < 360 ? x + 110 : x > 640 ? x - 110 : 470 + (x - 360) * (60 / 280);
    projection = coords => { const [x,y] = base(coords); return [compressX(x),y]; };
    projection.stream = sink => base.stream(d3.geoTransform({ point(x,y) { this.stream.point(compressX(x),y); } }).stream(sink));
    const path = d3.geoPath(projection);
    // Only the four requested destination groups are drawn. Southeast Asia follows report table 3's ten-country definition.
    const visibleCountryIds = new Set(['CHN','HKG','MAC','BRN','KHM','IDN','LAO','MYS','MMR','PHL','SGP','THA','VNM','USA','JPN','KOR']);
    mapLayer.append('g').attr('class','destination-land').selectAll('path')
      .data(topojson.feature(world, world.objects.countries).features.filter(d=>visibleCountryIds.has(d.id))).join('path')
      .attr('data-country',d=>d.id).attr('d', path).attr('fill','#7ca56b').attr('stroke','#3f6337').attr('stroke-width',.8);
    mapLayer.append('text').attr('x', 510).attr('y', 260).attr('text-anchor', 'middle').attr('fill', '#78977a').attr('font-size', 21).attr('letter-spacing', 4).text('太平洋');
    mapLayer.append('text').attr('x', 510).attr('y', 281).attr('text-anchor', 'middle').attr('fill', '#8fa791').attr('font-size', 10).attr('letter-spacing', 2).text('PACIFIC');
    mapLayer.append('text').attr('x', 510).attr('y', 302).attr('text-anchor', 'middle').attr('fill', '#6e886f').attr('font-size', 10).text('海域壓縮示意');
    const groups = mapLayer.append('g').attr('class', 'map-regions').selectAll('g').data(REGIONS.filter(r => r.coord)).join('g').attr('data-key', d => d.key)
      .attr('transform', d => `translate(${projection(d.coord)})`);
    groups.append('circle').attr('class', 'map-bubble').attr('tabindex', 0).attr('role', 'button')
      .attr('fill', d => d.color).attr('stroke', d => d.color).on('click', (_, d) => setRegion(d.key))
      .on('keydown', (e, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRegion(d.key); } })
      .on('pointermove', (e, d) => regionTooltip(e, d.key)).on('focus', (e, d) => regionTooltip(e, d.key)).on('blur pointerleave', hideTooltip);
    groups.append('text').attr('class', 'map-label').attr('text-anchor', 'middle').attr('x', d => d.label[0]).attr('y', d => d.label[1]).text(d => d.short);
    groups.append('text').attr('class', 'map-label map-value').attr('text-anchor', 'middle').attr('x', d => d.label[0]).attr('y', d => d.label[1] + 17);
    mapZoom = d3.zoom().scaleExtent([1, 3]).translateExtent([[0, 0], [1000, 480]]).extent([[0, 0], [1000, 480]])
      .filter(e => e.type !== 'wheel' && !(innerWidth <= 760 && e.type.startsWith('touch')) && !e.button && !e.target.closest?.('.map-bubble'))
      .on('zoom', e => mapLayer.attr('transform', e.transform));
    mapSvg.call(mapZoom).on('dblclick.zoom', null);
    $('zoom-in').onclick = () => mapSvg.transition().duration(250).call(mapZoom.scaleBy, 1.35);
    $('zoom-out').onclick = () => mapSvg.transition().duration(250).call(mapZoom.scaleBy, 1 / 1.35);
    $('reset-map').onclick = () => mapSvg.transition().duration(250).call(mapZoom.transform, d3.zoomIdentity);
  }
  function renderMap(row) {
    // A fixed scale across all years keeps the bubble areas comparable through time.
    const max = d3.max(rows, r => d3.max(REGIONS, k => r[k.key]));
    const radius = d3.scaleSqrt().domain([0, max]).range([0, 43]);
    const groups = mapLayer.selectAll('.map-regions>g');
    groups.select('circle').attr('r', d => row[d.key] === null ? 9 : Math.max(0, radius(row[d.key])))
      .attr('fill-opacity', d => row[d.key] === null ? 0 : state.region && state.region !== d.key ? .12 : .32)
      .attr('stroke-dasharray', d => row[d.key] === null ? '3 3' : null)
      .attr('stroke-width', d => state.region === d.key ? 3 : 1.5)
      .attr('aria-pressed', d => state.region === d.key)
      .attr('aria-label', d => `${d.short}，${state.year} 年，${row[d.key] === null ? '未提供資料' : `${row[d.key]} 千人`}，點選查看歷年趨勢`);
    groups.select('.map-value').text(d => row[d.key] === null ? '未提供資料' : `${fmt(row[d.key])} 千人`);
    groups.selectAll('text').attr('opacity', d => !state.region || state.region === d.key ? 1 : .45);
  }
  function renderStats(row) {
    const previous = rowAt(state.year - 1);
    const growth = row.officialGrowth;
    const valid = REGIONS.filter(r => row[r.key] !== null);
    const lead = valid.slice().sort((a,b) => row[b.key] - row[a.key])[0];
    $('total-value').textContent = fmt(row['總計']);
    $('total-note').textContent = row['總計'] === null ? '原始資料未提供總計' : `${state.year} 年（西元 ${state.year + 1911}）`;
    $('growth-value').textContent = growth === null ? '—' : `${growth > 0 ? '+' : ''}${growth.toFixed(1)}`;
    $('growth-unit').textContent = growth === null ? '' : '%';
    $('growth-note').textContent = growth === null ? '新聞稿未提供本年年增率' : `官方年增率 · 較 ${state.year - 1} 年${row['總計'] >= previous['總計'] ? '增加' : '減少'} ${fmt(Math.abs(row['總計'] - previous['總計']))} 千人`;
    $('leader-name').textContent = lead?.short || '—';
    $('leader-note').textContent = lead ? `${fmt(row[lead.key])} 千人${row['總計'] === null ? ' · 總計未提供，無法計算占比' : ` · 占總計 ${percent(share(row, lead.key))}`}` : '無地區資料';
    $('coverage-value').textContent = valid.length;
    $('coverage-note').textContent = valid.length === 5 ? '5 類地區均有數值' : `${5 - valid.length} 類未提供 · 不視為零`;
    $('insight-year').textContent = `${state.year} 年`;
    $('insight-text').textContent = row['總計'] === null
      ? `${state.year} 年提供 ${valid.length} 類地區資料，其中${lead.short}為 ${fmt(row[lead.key])} 千人；當年未提供總計，不推估整體規模。`
      : `${state.year} 年海外工作總計 ${fmt(row['總計'])} 千人${growth === null ? '' : `，較前一年${growth >= 0 ? '增加' : '減少'} ${Math.abs(growth).toFixed(1)}%`}；${lead.short}占 ${percent(share(row, lead.key))}，為最大已知地區。`;
  }
  function renderRanking(row) {
    $('distribution-year').textContent = `${state.year} 年`;
    const sorted = REGIONS.slice().sort((a,b) => (row[b.key] ?? -1) - (row[a.key] ?? -1));
    const max = d3.max(sorted, r => row[r.key]) || 1;
    const list = d3.select('#ranking').selectAll('button').data(sorted, d => d.key).join('button').attr('class', d => `rank-row${state.region === d.key ? ' selected' : ''}`)
      .attr('aria-pressed', d => state.region === d.key).attr('data-key', d => d.key).on('click', (_,d) => setRegion(d.key));
    list.html(d => `<div class="rank-top"><i class="rank-dot" style="background:${d.color}"></i><span>${d.short}</span><strong>${fmt(row[d.key])}</strong></div><div class="rank-bottom"><div class="bar-track"><div class="bar-fill" style="width:${(row[d.key] || 0) / max * 100}%;background:${d.color}"></div></div><span>${row[d.key] === null ? '未提供' : percent(share(row,d.key))}</span></div>`);
    list.order();
    const known = REGIONS.filter(r => row[r.key] !== null);
    const sum = d3.sum(known, r => row[r.key]);
    let note = '人數：千人；占比採新聞稿表3公布值。長條以當年最大地區為基準。';
    if (row['總計'] === null) note += ' 本年總計缺值，無法計算占比。';
    else if (known.length < 5) note += ` 本年有 ${5 - known.length} 類未提供；不推估缺值。`;
    if (row['總計'] !== null && known.length === 5 && sum !== row['總計']) note += ` 地區合計 ${sum}，與總計相差 ${fmt(Math.abs(sum - row['總計']))} 千人；保留原值。`;
    if (state.region === '其他') note += ' 「其他」未指定地理範圍，僅顯示統計與趨勢。';
    $('reconcile').textContent = note;
  }
  function renderTrend() {
    const svg = d3.select('#trend'); svg.selectAll('*').remove();
    const width = 1100, height = 340, margin = { top: 25, right: 35, bottom: 38, left: 54 };
    const series = state.region ? [state.region] : state.mode === 'share' ? REGIONS.map(r => r.key) : KEYS;
    const shown = visibleRows();
    const domain = state.range[0] === state.range[1] ? [state.range[0] - .5, state.range[1] + .5] : state.range;
    const x = d3.scaleLinear().domain(domain).range([margin.left, width - margin.right]);
    const maximum = d3.max(shown, row => d3.max(series, key => metric(row,key))) || 1;
    const y = d3.scaleLinear().domain([0, state.mode === 'share' ? 100 : maximum * 1.1]).nice().range([height - margin.bottom, margin.top]);
    svg.append('title').text(`${state.region ? displayName(state.region) : '總計與各地區'}歷年${state.mode === 'share' ? '占總計比例' : '人數'}趨勢`);
    svg.append('desc').text('折線遇缺值斷開。點選圖表或年份可切換觀察年度；亦可使用上方下拉選單及滑桿。');
    svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(width - margin.left - margin.right)).tickFormat(d => state.mode === 'share' ? `${d}%` : d))
      .call(g => g.select('.domain').remove()).call(g => g.selectAll('line').attr('stroke','#e6ece2')).call(g => g.selectAll('text').attr('fill','#71816f').attr('font-size',11).attr('dx',-6));
    const years = shown.filter((r,i) => shown.length <= 14 || i % 2 === 0 || i === shown.length - 1).map(r => r.year);
    const axis = svg.append('g').attr('transform', `translate(0,${height-margin.bottom})`).call(d3.axisBottom(x).tickValues(years).tickFormat(d => d).tickSize(0));
    axis.select('.domain').remove(); axis.selectAll('text').attr('fill','#71816f').attr('font-size',11).attr('dy',16).attr('tabindex',0).attr('role','button').attr('aria-label',d=>`切換至 ${d} 年`).style('cursor','pointer')
      .on('click',(_,d)=>setYear(d)).on('keydown',(e,d)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setYear(d);}});
    svg.append('text').attr('x',margin.left).attr('y',13).attr('font-size',10).attr('fill','#71816f').text(state.mode==='share'?'占總計 (%)':'千人');
    const line = d3.line().defined(d => d.value !== null).x(d => x(d.year)).y(d => y(d.value)).curve(d3.curveLinear);
    series.forEach(key => {
      const data = shown.map(r => ({ year:r.year, value:metric(r,key) }));
      svg.append('path').datum(data).attr('class','trend-line').attr('data-key',key).attr('d',line).attr('fill','none').attr('stroke',color(key)).attr('stroke-width',state.region?3:2).attr('stroke-dasharray',key==='總計'?'6 4':null);
      svg.append('g').selectAll('circle').data(data.filter(d=>d.value!==null)).join('circle').attr('cx',d=>x(d.year)).attr('cy',d=>y(d.value)).attr('r',state.region?3:2.2).attr('fill',color(key)).attr('stroke','#fff').attr('stroke-width',.6);
    });
    svg.append('line').attr('x1',x(state.year)).attr('x2',x(state.year)).attr('y1',margin.top).attr('y2',height-margin.bottom).attr('stroke','#77954f').attr('stroke-dasharray','3 4');
    svg.append('rect').attr('x',Math.min(width-69, Math.max(0,x(state.year)-24))).attr('y',1).attr('width',48).attr('height',18).attr('rx',3).attr('fill','#e8f0da');
    svg.append('text').attr('x',Math.min(width-45,Math.max(24,x(state.year)))).attr('y',13).attr('text-anchor','middle').attr('font-size',10).attr('fill','#395c2e').text(`${state.year} 年`);
    const hoverLine = svg.append('line').attr('y1',margin.top).attr('y2',height-margin.bottom).attr('stroke','#a4b697').attr('stroke-dasharray','2 3').style('display','none');
    const yearFromEvent = e => Math.max(state.range[0],Math.min(state.range[1],Math.round(x.invert(d3.pointer(e,svg.node())[0]))));
    svg.append('rect').attr('class','trend-hit-area').attr('x',margin.left).attr('y',margin.top).attr('width',width-margin.left-margin.right).attr('height',height-margin.top-margin.bottom).attr('fill','transparent').style('cursor','crosshair')
      .on('pointermove', e => {
        const year = yearFromEvent(e), row = rowAt(year);
        hoverLine.attr('x1',x(year)).attr('x2',x(year)).style('display',null);
        tooltip(e,`<strong>${year} 年 · ${year+1911}</strong>${series.map(key=>`<div class="tip-line"><span>${displayName(key)}</span><b>${state.mode==='share'?percent(metric(row,key)):fmt(row[key])+(row[key]===null?'':' 千人')}</b></div>`).join('')}<div>點選切換年度</div>`);
      }).on('pointerleave',()=>{hoverLine.style('display','none');hideTooltip();}).on('click',e=>setYear(yearFromEvent(e)));
    const legendKeys = state.mode === 'share' ? REGIONS.map(r=>r.key) : KEYS;
    d3.select('#chart-legend').selectAll('button').data(legendKeys).join('button').attr('class',key=>state.region===key?'active':state.region?'muted':'')
      .attr('aria-pressed',key=>state.region===key).html(key=>`<span class="legend-dot" style="background:${color(key)}"></span>${displayName(key)}${key==='總計'?'（虛線）':''}`)
      .on('click',(_,key)=>{if(key==='總計'){state.region=null;render();}else setRegion(key);});
    $('trend-title').textContent = state.region ? `${displayName(state.region)} · 歷年${state.mode==='share'?'占比':'人數'}` : `${state.mode==='share'?'各地區占總計比例':'總計與各地區趨勢'}`;
    $('trend-subtitle').textContent = state.region==='日本、南韓'?'110 年起有數值；早期未提供，不補零、不推估。':'點選圖表年份，回看當年的地區分布';
    $('trend-foot').textContent=state.mode==='share'?'占比採新聞稿第8頁表3公布值；未公布時保留空缺。':'單位：千人 · 年份為民國年 · 人數採新聞稿第11頁表6';
  }
  function setupBrush() {
    const svg = d3.select('#year-brush');
    brushScale = d3.scaleLinear().domain(d3.extent(rows,r=>r.year)).range([54,1065]);
    const y = d3.scaleLinear().domain([0,d3.max(rows,r=>r['總計'])]).range([68,10]);
    svg.append('path').datum(rows).attr('d',d3.area().defined(r=>r['總計']!==null).x(r=>brushScale(r.year)).y0(68).y1(r=>y(r['總計'])))
      .attr('fill','#d8e7ca').attr('stroke','#718e5c').attr('stroke-width',1);
    svg.append('g').attr('transform','translate(0,82)').call(d3.axisBottom(brushScale).tickValues([88,93,98,103,108,113]).tickFormat(d=>`${d}年`).tickSize(0))
      .call(g=>g.select('.domain').remove()).call(g=>g.selectAll('text').attr('fill','#61766b').attr('font-size',11));
    yearBrush = d3.brushX().extent([[54,6],[1065,74]]).handleSize(10)
      .on('start', () => { brushAnchorYear=state.year; stopPlay(); })
      .on('brush end', event => {
      const selected = event.selection ? event.selection.map(v=>Math.round(brushScale.invert(v))) : [rows[0].year,rows.at(-1).year];
      const next = selected.map(v=>Math.max(rows[0].year,Math.min(rows.at(-1).year,v)));
      if(next[0]===state.range[0] && next[1]===state.range[1]) return;
      stopPlay(); hideTooltip(); state.range=next;
      state.year=Math.max(next[0],Math.min(next[1],brushAnchorYear));
      render();
    });
    brushGroup = svg.append('g').attr('class','year-brush').call(yearBrush);
    // Start with no painted rectangle: the full series is visible and the overlay can be dragged immediately.
    const options=rows.map(r=>`<option value="${r.year}">${r.year} 年</option>`).join('');
    $('brush-start').innerHTML=options; $('brush-end').innerHTML=options;
    ['start','end'].forEach(side=>$(`brush-${side}`).addEventListener('change',e=>{
      const next=[...state.range];next[side==='start'?0:1]=Number(e.target.value);
      if(next[0]>next[1])next[side==='start'?1:0]=next[side==='start'?0:1];
      brushGroup.call(yearBrush.move,next.map(brushScale));
    }));
    $('reset-brush').addEventListener('click',()=>brushGroup.call(yearBrush.move,null));
  }
  function renderTable() {
    $('data-table').innerHTML = '<caption>新聞稿第11頁表6人數（千人）；— 表示未提供。依刷選範圍顯示。</caption><thead><tr><th>民國年（西元）</th>'+KEYS.map(k=>`<th>${displayName(k)}</th>`).join('')+'</tr></thead><tbody>'+visibleRows().map(row=>`<tr data-year="${row.year}"><td>${row.year}（${row.year+1911}）</td>${KEYS.map(k=>`<td>${fmt(row[k])}</td>`).join('')}</tr>`).join('')+'</tbody>';
  }
  function render() {
    const row = rowAt(state.year);
    $('year-range').min=state.range[0];$('year-range').max=state.range[1];
    $('range-start-label').textContent=`${state.range[0]} 年`;
    d3.select('#year-select').selectAll('option').property('disabled',function(){return Number(this.value)<state.range[0]||Number(this.value)>state.range[1];});
    $('brush-start').value=state.range[0];$('brush-end').value=state.range[1];
    $('brush-status').textContent=`顯示範圍 ${state.range[0]}–${state.range[1]} 年，共 ${visibleRows().length} 年；趨勢圖、年度控制與資料表同步篩選。`;
    $('year-select').value=state.year; $('year-range').value=state.year; $('year-range').setAttribute('aria-valuetext',`${state.year} 年，西元 ${state.year+1911}`); $('range-label').textContent=`${state.year} 年`;
    d3.select('#region-filters').selectAll('button').classed('active',d=>d.key===state.region).attr('aria-pressed',d=>d.key===state.region);
    ['value','share'].forEach(mode=>{$(`mode-${mode}`).classList.toggle('active',mode===state.mode);$(`mode-${mode}`).setAttribute('aria-pressed',mode===state.mode);});
    renderStats(row); renderMap(row); renderRanking(row); renderTrend(); renderTable();
    d3.select('#data-table').selectAll('tbody tr').classed('current',function(){return Number(this.dataset.year)===state.year;});
  }
  async function init() {
    try {
      const [dataResponse, mapResponse] = await Promise.all([fetch('data/overseas-work.json'),fetch('data/world_110m.json')]);
      if(!dataResponse.ok || !mapResponse.ok) throw new Error('無法讀取資料檔，請確認 data 資料夾完整。');
      const dataset=await dataResponse.json();
      rows=dataset.rows.sort((a,b)=>a.year-b.year);
      if(!rows.length || new Set(rows.map(r=>r.year)).size!==rows.length) throw new Error('資料為空或有重複年份。');
      for(const row of rows){if(!Number.isInteger(row.year))throw new Error('年份格式錯誤。');for(const key of KEYS)if(row[key]!==null&&(!Number.isFinite(row[key])||row[key]<0))throw new Error(`無效數值：${row.year} 年 ${key}`);}
      world=await mapResponse.json();
      if(world.type!=='Topology'||!world.objects?.countries) throw new Error('地圖必須為含 countries 物件的 TopoJSON。');
      state.year=rows.at(-1).year;
      state.range=[rows[0].year,rows.at(-1).year];
      setupControls();setupMap();setupBrush();render();
      document.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => {
        stopPlay(); hideTooltip(); state.region=null; state.mode='share';
        const period=button.dataset.period.split(',').map(Number);
        state.year=period[1];
        brushGroup.call(yearBrush.move,period.map(brushScale));
        render();
        $('history').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
      }));
      $('load-state').hidden=true;$('dashboard').hidden=false;
    } catch(error) {
      $('load-state').setAttribute('role','alert');
      $('load-state').textContent=`載入失敗：${error.message} 請使用「啟動網站.cmd」或 node server.mjs 啟動，勿直接雙擊 index.html。`;
      console.error(error);
    }
  }
  init();
})();
