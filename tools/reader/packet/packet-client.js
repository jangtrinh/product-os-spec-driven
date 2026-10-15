/* Review packet controls. Runs offline. At open time it rebuilds EVERY reviewer-visible line from the embedded canonical data and the
   embedded pinned sources (renderView), shows that rebuild, and compares it with the markup the file shipped with. It never fetches and
   never approves: it only writes a local decision file, and only when the rebuild, the digest and the pins all agree. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const app = $('#app');
  const shipped = app.innerHTML;
  const dataEl = $('#packet-data');
  const payload = JSON.parse(dataEl.textContent);
  const packetId = dataEl.dataset.packetId;
  const dataSha = dataEl.dataset.dataSha;
  const sources = JSON.parse($('#packet-sources').textContent);
  const hints = JSON.parse($('#packet-view-hints').textContent);
  const assets = JSON.parse($('#packet-assets').textContent);
  const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const bytesOf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const texts = {};
  for (const key of Object.keys(sources)) texts[key] = new TextDecoder().decode(bytesOf(sources[key]));

  /* The shown page is the rebuild from the data, never the shipped markup. Any section that differs from the shipped markup is named. */
  const fresh = document.createElement('template');
  fresh.innerHTML = renderView(payload, texts, hints);
  const old = document.createElement('template');
  old.innerHTML = shipped;
  const differing = fresh.innerHTML === shipped ? [] : $$('section[id]', fresh.content).filter((s) => { const o = $('#' + s.id, old.content); return !o || o.outerHTML !== s.outerHTML; }).map((s) => s.id);
  const shippedMatches = fresh.innerHTML === shipped;
  app.replaceChildren(fresh.content);

  const status = $('#export-status');
  const say = (text, bad) => { status.textContent = text; status.dataset.tone = bad ? 'bad' : 'ok'; };

  async function verifyDigest() {
    const out = $('#digest-check');
    try {
      const sum = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canon(payload))));
      const ok = sum === dataSha && hints.dataSha === dataSha && packetId === 'packet-' + sum;
      out.textContent = ok ? 'Embedded data matches the packet id.' : 'The embedded data does not match the packet id. Decision export is disabled. Regenerate the packet from the current source.';
      out.dataset.tone = ok ? 'ok' : 'bad';
      if (!ok) out.setAttribute('role', 'alert');
      return ok;
    } catch (e) {
      out.textContent = 'This browser cannot verify the digest. Decision export is disabled. Open a regenerated packet in a browser that supports digest verification.';
      out.dataset.tone = 'warn'; out.setAttribute('role', 'alert'); return false;
    }
  }

  /* What is on screen must be what the pinned bytes say: re-hash each embedded source against the member pins carried in the digest-checked
     data, re-derive the structure the rebuild relied on, and check each preview image against the asset hash. */
  async function verifySources() {
    const out = $('#binding-check');
    const fail = (why) => { out.textContent = 'The wording on this page does not match the pinned sources (' + why + '). Do not use this file.'; out.dataset.tone = 'bad'; return false; };
    try {
      if (!shippedMatches) return fail('the page as shipped differs from its embedded data in ' + (differing.join(', ') || 'the page frame'));
      for (const key of Object.keys(sources)) {
        const sum = hex(await crypto.subtle.digest('SHA-256', bytesOf(sources[key])));
        const members = payload.membership.members.filter((m) => key in m.artifacts);
        if (!members.length || members.some((m) => m.artifacts[key] !== sum)) return fail(key + ' is not the pinned bytes');
      }
      const problems = viewProblems(payload, texts);
      if (problems.length) return fail(problems[0]);
      for (const img of $$('img[data-asset]')) {
        const key = img.dataset.asset, a = assets[key];
        const broken = () => img.replaceWith(Object.assign(document.createElement('span'), { className: 'chip tone-bad', textContent: 'image failed to load' }));
        if (!a || hex(await crypto.subtle.digest('SHA-256', bytesOf(a.b64))) !== payload.assets[key]) { broken(); continue; }
        img.addEventListener('error', broken);
        img.src = 'data:' + a.mime + ';base64,' + a.b64;
      }
      out.textContent = 'This page was rebuilt from the embedded data and matches the pinned sources and the file as shipped.'; out.dataset.tone = 'ok';
      return true;
    } catch (e) { return fail('this browser cannot recompute them'); }
  }
  const bound = verifySources();
  const verified = Promise.all([verifyDigest(), bound]).then(([digestOk, sourcesOk]) => {
    const ok = digestOk && sourcesOk;
    $('#export').disabled = !ok;
    $('#decision-form').setAttribute('aria-busy', 'false');
    if (!digestOk) say($('#digest-check').textContent, true);
    else if (!sourcesOk) say('The wording on this page does not match the pinned sources. Decision export is disabled. Nothing was exported.', true);
    else say('Verification complete. Choose a decision to export.');
    return ok;
  });

  function overridesFrom() {
    const rows = [];
    const err = [];
    $$('input[data-override]:checked').forEach((sel) => {
      if (!sel.value) return;
      const reason = $(`[data-override-reason="${CSS.escape(sel.dataset.override)}"]`).value.trim();
      if (!reason) err.push(`Give a reason for the ${sel.value} on ${sel.dataset.override}.`);
      rows.push({ id: sel.dataset.override, decision: sel.value, reason });
    });
    return { rows, err };
  }

  function build() {
    const errors = [];
    const def = (document.querySelector('input[name="default"]:checked') || {}).value;
    if (!def) errors.push('Choose a decision for the whole batch.');
    const by = $('#by').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(by)) errors.push('Enter your email as the PO.');
    const reason = $('#reason').value.trim();
    if (!reason) errors.push('Give a reason. A decision file without one is not accepted.');
    const o = overridesFrom();
    errors.push(...o.err);
    if (errors.length) return { errors };
    const random = crypto.getRandomValues(new Uint8Array(6));
    const decision = {
      id: 'decision-' + hex(random), packet_id: packetId, data_sha256: dataSha, scope: payload.scope, pins: payload.candidate, by, at: new Date().toISOString(),
      default: def, reason, overrides: o.rows.sort((a, b) => (a.id < b.id ? -1 : 1)), exceptions: $$('input[name="exception"]:checked').map((c) => c.value).sort(),
    };
    return { decision, errors };
  }

  $('#export').addEventListener('click', async () => {
    if (!(await verified)) { say('Packet verification failed. Decision export is disabled. Nothing was exported.', true); $('#export-status').focus(); return; }
    const r = build();
    if (r.errors.length) { say(r.errors.join(' '), true); $('#export-status').focus(); return; }
    const text = JSON.stringify(r.decision, null, 2) + '\n';
    $('#decision-preview').textContent = text;
    $('#preview-box').hidden = false;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `batch-decision-${r.decision.id}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say(`Saved ${a.download}. This file is a request, not an approval: the controller imports it with the runner.`);
  });

  const theme = $('#theme-toggle');
  const applyTheme = (t) => { if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); };
  theme.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    applyTheme(dark ? 'light' : 'dark');
    theme.setAttribute('aria-pressed', String(!dark));
  });
})();
