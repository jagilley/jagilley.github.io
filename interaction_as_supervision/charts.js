(function () {
  'use strict';

  var C = {
    trans: '#2ca02c',
    rand: '#d62728',
    transOnly: '#1f77b4',
    cocktail: '#ff7f0e'
  };

  function fmt(e) {
    if (e >= 1e6) return (e / 1e6).toFixed(1) + 'M';
    if (e >= 1e3) return Math.round(e / 1e3) + 'k';
    return String(e);
  }

  function smooth(arr, w) {
    var half = w >> 1;
    return arr.map(function (d, i) {
      var lo = Math.max(0, i - half),
        hi = Math.min(arr.length, i + half + 1),
        s = 0;
      for (var j = lo; j < hi; j++) s += arr[j].a;
      return { e: d.e, a: s / (hi - lo) };
    });
  }

  /* ===== POLICY EVOLUTION CHART ===== */

  function buildPolicyChart(data, el) {
    var M = { t: 24, r: 25, b: 8, l: 58 };
    var ML = { t: 8, b: 42 };
    var W = 800, mainH = 260, lossH = 120, gap = 8;
    var w = W - M.l - M.r;
    var totalH = M.t + mainH + gap + ML.t + lossH + ML.b;

    var svg = d3.select(el).append('svg')
      .attr('viewBox', '0 0 ' + W + ' ' + totalH)
      .attr('width', '100%');

    var x = d3.scaleLinear()
      .domain([0, d3.max(data, function (d) { return d.e; })])
      .range([0, w]);

    var yP = d3.scaleLinear().domain([0, 1]).range([mainH, 0]);

    // Clip path for scroll-reveal animation
    svg.append('defs').append('clipPath').attr('id', 'pc-clip')
      .append('rect').attr('width', 0).attr('height', totalH + 10);

    // ---- Main panel ----
    var mainG = svg.append('g')
      .attr('transform', 'translate(' + M.l + ',' + M.t + ')');

    var clip = mainG.append('g').attr('clip-path', 'url(#pc-clip)');

    // Stacked areas
    clip.append('path').datum(data)
      .attr('fill', C.trans).attr('opacity', 0.18)
      .attr('d', d3.area()
        .x(function (d) { return x(d.e); })
        .y0(mainH)
        .y1(function (d) { return yP(d.tp); })
        .curve(d3.curveMonotoneX));

    clip.append('path').datum(data)
      .attr('fill', C.rand).attr('opacity', 0.13)
      .attr('d', d3.area()
        .x(function (d) { return x(d.e); })
        .y0(function (d) { return yP(d.tp); })
        .y1(0)
        .curve(d3.curveMonotoneX));

    // Boundary lines
    clip.append('path').datum(data).attr('fill', 'none')
      .attr('stroke', C.trans).attr('stroke-width', 2.5)
      .attr('d', d3.line()
        .x(function (d) { return x(d.e); })
        .y(function (d) { return yP(d.tp); })
        .curve(d3.curveMonotoneX));

    clip.append('path').datum(data).attr('fill', 'none')
      .attr('stroke', C.rand).attr('stroke-width', 2.5)
      .attr('d', d3.line()
        .x(function (d) { return x(d.e); })
        .y(function (d) { return yP(d.rp); })
        .curve(d3.curveMonotoneX));

    // 50% reference
    mainG.append('line')
      .attr('x1', 0).attr('x2', w)
      .attr('y1', yP(0.5)).attr('y2', yP(0.5))
      .attr('stroke', '#aaa').attr('stroke-dasharray', '6,4').attr('opacity', 0.5);

    // 90% annotation (inside clip so it reveals with animation)
    var cross90 = data.find(function (d) { return d.tp >= 0.9; });
    if (cross90) {
      clip.append('circle')
        .attr('cx', x(cross90.e)).attr('cy', yP(cross90.tp))
        .attr('r', 4).attr('fill', 'none')
        .attr('stroke', C.trans).attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '3,2');
      clip.append('text')
        .attr('x', x(cross90.e) + 8).attr('y', yP(cross90.tp) + 4)
        .attr('font-size', '10px').attr('fill', '#666')
        .text('90% at ' + fmt(cross90.e));
    }

    // Axes
    mainG.append('g')
      .attr('transform', 'translate(0,' + mainH + ')')
      .call(d3.axisBottom(x).ticks(0).tickSize(0))
      .select('.domain').attr('stroke', '#ccc');

    mainG.append('g')
      .call(d3.axisLeft(yP).ticks(5).tickFormat(d3.format('.0%')))
      .select('.domain').attr('stroke', '#ccc');

    mainG.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -mainH / 2).attr('y', -44)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px').attr('fill', '#555')
      .text('Policy probability');

    // ---- Loss panel ----
    var lossG = svg.append('g')
      .attr('transform', 'translate(' + M.l + ',' + (M.t + mainH + gap + ML.t) + ')');

    var lossData = data.filter(function (d) { return d.tl != null && d.rl != null; });

    var lossMin = d3.min(lossData, function (d) { return Math.min(d.tl, d.rl); });
    var lossMax = d3.max(lossData, function (d) { return Math.max(d.tl, d.rl); });

    var yL = d3.scaleLog()
      .domain([Math.max(0.5, lossMin * 0.7), lossMax * 1.3])
      .range([lossH, 0]).clamp(true);

    var lossClip = lossG.append('g').attr('clip-path', 'url(#pc-clip)');

    lossClip.append('path').datum(lossData).attr('fill', 'none')
      .attr('stroke', C.trans).attr('stroke-width', 1.5).attr('opacity', 0.75)
      .attr('d', d3.line()
        .x(function (d) { return x(d.e); })
        .y(function (d) { return yL(d.tl); })
        .curve(d3.curveMonotoneX));

    lossClip.append('path').datum(lossData).attr('fill', 'none')
      .attr('stroke', C.rand).attr('stroke-width', 1.5).attr('opacity', 0.75)
      .attr('d', d3.line()
        .x(function (d) { return x(d.e); })
        .y(function (d) { return yL(d.rl); })
        .curve(d3.curveMonotoneX));

    lossG.append('g')
      .attr('transform', 'translate(0,' + lossH + ')')
      .call(d3.axisBottom(x).ticks(6).tickFormat(function (d) { return fmt(d); }))
      .select('.domain').attr('stroke', '#ccc');

    lossG.append('g')
      .call(d3.axisLeft(yL).ticks(5, '.1f'))
      .select('.domain').attr('stroke', '#ccc');

    lossG.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -lossH / 2).attr('y', -44)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px').attr('fill', '#555')
      .text('Inverse loss');

    lossG.append('text')
      .attr('x', w / 2).attr('y', lossH + 36)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px').attr('fill', '#555')
      .text('Epoch');

    // "lower = more learnable" hint
    lossG.append('text')
      .attr('x', w).attr('y', -2)
      .attr('text-anchor', 'end')
      .attr('font-size', '9px').attr('fill', '#999')
      .text('lower = more learnable');

    // ---- Shared tooltip ----
    var tip = d3.select(el).append('div').attr('class', 'chart-tooltip');

    var vL1 = mainG.append('line')
      .attr('stroke', '#555').attr('stroke-dasharray', '3,3')
      .attr('y1', 0).attr('y2', mainH)
      .style('visibility', 'hidden');
    var vL2 = lossG.append('line')
      .attr('stroke', '#555').attr('stroke-dasharray', '3,3')
      .attr('y1', 0).attr('y2', lossH)
      .style('visibility', 'hidden');

    var dT = mainG.append('circle').attr('r', 5)
      .attr('fill', C.trans).attr('stroke', '#fff').attr('stroke-width', 2)
      .style('visibility', 'hidden');
    var dR = mainG.append('circle').attr('r', 5)
      .attr('fill', C.rand).attr('stroke', '#fff').attr('stroke-width', 2)
      .style('visibility', 'hidden');
    var dTL = lossG.append('circle').attr('r', 4)
      .attr('fill', C.trans).attr('stroke', '#fff').attr('stroke-width', 1.5)
      .style('visibility', 'hidden');
    var dRL = lossG.append('circle').attr('r', 4)
      .attr('fill', C.rand).attr('stroke', '#fff').attr('stroke-width', 1.5)
      .style('visibility', 'hidden');

    var bisect = d3.bisector(function (d) { return d.e; }).left;

    svg.append('rect')
      .attr('x', M.l).attr('y', M.t)
      .attr('width', w).attr('height', totalH - M.t)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mousemove', function (event) {
        var mx = d3.pointer(event)[0] - M.l;
        var ep = x.invert(mx);
        var i = Math.max(0, Math.min(bisect(data, ep), data.length - 1));
        var d = data[i], px = x(d.e);

        vL1.attr('x1', px).attr('x2', px).style('visibility', 'visible');
        vL2.attr('x1', px).attr('x2', px).style('visibility', 'visible');
        dT.attr('cx', px).attr('cy', yP(d.tp)).style('visibility', 'visible');
        dR.attr('cx', px).attr('cy', yP(d.rp)).style('visibility', 'visible');

        if (d.tl != null) {
          dTL.attr('cx', px).attr('cy', yL(d.tl)).style('visibility', 'visible');
          dRL.attr('cx', px).attr('cy', yL(d.rl)).style('visibility', 'visible');
        }

        var h = '<strong>Epoch ' + fmt(d.e) + '</strong>';
        h += '<div style="margin-top:4px"><span style="color:' + C.trans + '">\u25cf</span> Translation: ' + (d.tp * 100).toFixed(1) + '%';
        if (d.tl != null) h += ' <span style="color:#999">(loss ' + d.tl.toFixed(2) + ')</span>';
        h += '</div>';
        h += '<div><span style="color:' + C.rand + '">\u25cf</span> Random: ' + (d.rp * 100).toFixed(1) + '%';
        if (d.rl != null) h += ' <span style="color:#999">(loss ' + d.rl.toFixed(2) + ')</span>';
        h += '</div>';

        tip.html(h).style('visibility', 'visible');

        var svgW = el.getBoundingClientRect().width;
        var sc = svgW / W;
        var left = (px + M.l) * sc + 15;
        var tipW = tip.node().offsetWidth;
        if (left + tipW > svgW - 10) left = (px + M.l) * sc - tipW - 15;
        tip.style('left', left + 'px')
          .style('top', ((M.t + yP(d.tp)) * sc - 10) + 'px');
      })
      .on('mouseleave', function () {
        tip.style('visibility', 'hidden');
        vL1.style('visibility', 'hidden');
        vL2.style('visibility', 'hidden');
        dT.style('visibility', 'hidden');
        dR.style('visibility', 'hidden');
        dTL.style('visibility', 'hidden');
        dRL.style('visibility', 'hidden');
      });

    // ---- Scroll-triggered reveal ----
    var revealed = false;
    new IntersectionObserver(function (entries, obs) {
      if (!revealed && entries[0].isIntersecting) {
        revealed = true;
        svg.select('#pc-clip rect')
          .transition()
          .duration(2000)
          .ease(d3.easeCubicOut)
          .attr('width', w + 10);
        obs.unobserve(el);
      }
    }, { threshold: 0.25 }).observe(el);
  }

  /* ===== TEST ACCURACY COMPARISON CHART ===== */

  function buildAccuracyChart(data, el) {
    var M = { t: 25, r: 25, b: 48, l: 58 };
    var W = 800, H = 320;
    var w = W - M.l - M.r, h = H;

    var svg = d3.select(el).append('svg')
      .attr('viewBox', '0 0 ' + W + ' ' + (H + M.t + M.b))
      .attr('width', '100%');

    var g = svg.append('g')
      .attr('transform', 'translate(' + M.l + ',' + M.t + ')');

    var x = d3.scaleLinear()
      .domain([0, d3.max(data.translation, function (d) { return d.e; })])
      .range([0, w]);

    var y = d3.scaleLinear().domain([0, 1]).range([h, 0]);

    // Subtle grid lines
    [0.25, 0.5, 0.75, 1.0].forEach(function (v) {
      g.append('line')
        .attr('x1', 0).attr('x2', w)
        .attr('y1', y(v)).attr('y2', y(v))
        .attr('stroke', '#e8e8e8').attr('stroke-dasharray', '2,3');
    });

    var line = d3.line()
      .x(function (d) { return x(d.e); })
      .y(function (d) { return y(d.a); });

    // Raw data (thin, semi-transparent)
    g.append('path').datum(data.translation).attr('fill', 'none')
      .attr('stroke', C.transOnly).attr('stroke-width', 0.7).attr('opacity', 0.3)
      .attr('d', line);
    g.append('path').datum(data.cocktail).attr('fill', 'none')
      .attr('stroke', C.cocktail).attr('stroke-width', 0.7).attr('opacity', 0.3)
      .attr('d', line);

    // Smoothed overlays
    var sT = smooth(data.translation, 40);
    var sC = smooth(data.cocktail, 40);

    // Subtle area fill between smoothed curves
    var areaData = sT.map(function (d, i) {
      return { e: d.e, tA: d.a, cA: sC[i].a };
    });
    g.append('path').datum(areaData)
      .attr('fill', C.transOnly).attr('opacity', 0.06)
      .attr('d', d3.area()
        .x(function (d) { return x(d.e); })
        .y0(function (d) { return y(Math.min(d.tA, d.cA)); })
        .y1(function (d) { return y(Math.max(d.tA, d.cA)); }));

    g.append('path').datum(sT).attr('fill', 'none')
      .attr('stroke', C.transOnly).attr('stroke-width', 2.5)
      .attr('d', line);
    g.append('path').datum(sC).attr('fill', 'none')
      .attr('stroke', C.cocktail).attr('stroke-width', 2.5)
      .attr('d', line);

    // Peak markers
    var pT = data.translation.reduce(function (b, d) { return d.a > b.a ? d : b; });
    var pC = data.cocktail.reduce(function (b, d) { return d.a > b.a ? d : b; });

    // Translation-only peak
    g.append('path')
      .attr('d', d3.symbol().type(d3.symbolDiamond).size(60)())
      .attr('transform', 'translate(' + x(pT.e) + ',' + y(pT.a) + ')')
      .attr('fill', C.transOnly).attr('stroke', '#fff').attr('stroke-width', 1.5);
    g.append('text')
      .attr('x', x(pT.e) - 10).attr('y', y(pT.a) - 14)
      .attr('text-anchor', 'end')
      .attr('font-size', '11px').attr('fill', C.transOnly).attr('font-weight', 'bold')
      .text('Peak: ' + (pT.a * 100).toFixed(1) + '%');

    // Cocktail peak
    g.append('path')
      .attr('d', d3.symbol().type(d3.symbolDiamond).size(60)())
      .attr('transform', 'translate(' + x(pC.e) + ',' + y(pC.a) + ')')
      .attr('fill', C.cocktail).attr('stroke', '#fff').attr('stroke-width', 1.5);
    g.append('text')
      .attr('x', x(pC.e) + 10).attr('y', y(pC.a) + 5)
      .attr('text-anchor', 'start')
      .attr('font-size', '11px').attr('fill', C.cocktail).attr('font-weight', 'bold')
      .text('Peak: ' + (pC.a * 100).toFixed(1) + '%');

    // Axes
    g.append('g')
      .attr('transform', 'translate(0,' + h + ')')
      .call(d3.axisBottom(x).ticks(6).tickFormat(function (d) { return fmt(d); }))
      .select('.domain').attr('stroke', '#ccc');

    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('.0%')))
      .select('.domain').attr('stroke', '#ccc');

    g.append('text')
      .attr('x', w / 2).attr('y', h + 42)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px').attr('fill', '#555')
      .text('Epoch');

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -h / 2).attr('y', -44)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px').attr('fill', '#555')
      .text('Test accuracy');

    // ---- Tooltip ----
    var tip = d3.select(el).append('div').attr('class', 'chart-tooltip');

    var vL = g.append('line')
      .attr('stroke', '#555').attr('stroke-dasharray', '3,3')
      .attr('y1', 0).attr('y2', h)
      .style('visibility', 'hidden');
    var dot1 = g.append('circle').attr('r', 5)
      .attr('fill', C.transOnly).attr('stroke', '#fff').attr('stroke-width', 2)
      .style('visibility', 'hidden');
    var dot2 = g.append('circle').attr('r', 5)
      .attr('fill', C.cocktail).attr('stroke', '#fff').attr('stroke-width', 2)
      .style('visibility', 'hidden');

    var bisect = d3.bisector(function (d) { return d.e; }).left;

    g.append('rect')
      .attr('width', w).attr('height', h)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mousemove', function (event) {
        var mx = d3.pointer(event)[0];
        var ep = x.invert(mx);
        var iT = Math.max(0, Math.min(bisect(data.translation, ep), data.translation.length - 1));
        var iC = Math.max(0, Math.min(bisect(data.cocktail, ep), data.cocktail.length - 1));
        var dT = data.translation[iT], dC = data.cocktail[iC];
        var px = x(dT.e);

        vL.attr('x1', px).attr('x2', px).style('visibility', 'visible');
        dot1.attr('cx', px).attr('cy', y(dT.a)).style('visibility', 'visible');
        dot2.attr('cx', x(dC.e)).attr('cy', y(dC.a)).style('visibility', 'visible');

        var gap = dT.a - dC.a;
        var html = '<strong>Epoch ' + fmt(dT.e) + '</strong>';
        html += '<div style="margin-top:4px"><span style="color:' + C.transOnly + '">\u25cf</span> Translation-only: ' + (dT.a * 100).toFixed(1) + '%</div>';
        html += '<div><span style="color:' + C.cocktail + '">\u25cf</span> Cocktail: ' + (dC.a * 100).toFixed(1) + '%</div>';
        html += '<div style="color:#888;margin-top:3px;border-top:1px solid #eee;padding-top:3px">Gap: ' + (gap >= 0 ? '+' : '') + (gap * 100).toFixed(1) + 'pp</div>';

        tip.html(html).style('visibility', 'visible');

        var svgW = el.getBoundingClientRect().width;
        var sc = svgW / W;
        var left = (px + M.l) * sc + 15;
        var tipW = tip.node().offsetWidth;
        if (left + tipW > svgW - 10) left = (px + M.l) * sc - tipW - 15;
        tip.style('left', left + 'px')
          .style('top', ((M.t + Math.min(y(dT.a), y(dC.a))) * sc - 10) + 'px');
      })
      .on('mouseleave', function () {
        tip.style('visibility', 'hidden');
        vL.style('visibility', 'hidden');
        dot1.style('visibility', 'hidden');
        dot2.style('visibility', 'hidden');
      });
  }

  /* ===== INIT ===== */

  async function init() {
    var base = 'interaction_as_supervision/';
    try {
      var results = await Promise.all([
        fetch(base + 'policy_evolution_data.json').then(function (r) { return r.json(); }),
        fetch(base + 'test_accuracy_data.json').then(function (r) { return r.json(); })
      ]);
      var pe = document.getElementById('policy-chart');
      var ac = document.getElementById('accuracy-chart');
      if (pe) buildPolicyChart(results[0], pe);
      if (ac) buildAccuracyChart(results[1], ac);
    } catch (err) {
      console.error('Chart data load failed:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
