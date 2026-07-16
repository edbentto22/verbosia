import { createServer } from 'node:http';
import { applyReview, getReviewDoc, status } from '@verbosia/core';
import type { ResolvedConfig, ReviewInput } from '@verbosia/core';

/**
 * Servidor local do editor de revisão (`verbosia review`).
 * Escuta APENAS em 127.0.0.1 — a TM e o conteúdo nunca saem da máquina.
 */
export function startReviewServer(config: ResolvedConfig, port: number): Promise<string> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const send = (code: number, body: string, type = 'application/json') => {
      res.writeHead(code, { 'Content-Type': `${type}; charset=utf-8` });
      res.end(body);
    };

    try {
      if (req.method === 'GET' && url.pathname === '/') {
        return send(200, PAGE, 'text/html');
      }

      if (req.method === 'GET' && url.pathname === '/api/overview') {
        const rows = await status(config);
        return send(200, JSON.stringify({ rows, targets: config.targets }));
      }

      if (req.method === 'GET' && url.pathname === '/api/doc') {
        const id = url.searchParams.get('id');
        const lang = url.searchParams.get('lang');
        if (!id || !lang) return send(400, JSON.stringify({ error: 'id e lang são obrigatórios' }));
        const doc = await getReviewDoc(config, id, lang);
        return send(200, JSON.stringify(doc));
      }

      if (req.method === 'POST' && url.pathname === '/api/save') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const input = JSON.parse(Buffer.concat(chunks).toString('utf8')) as ReviewInput;
        const report = await applyReview(config, input);
        return send(200, JSON.stringify(report));
      }

      send(404, JSON.stringify({ error: 'rota desconhecida' }));
    } catch (err) {
      send(500, JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(`http://127.0.0.1:${port}`));
  });
}

const PAGE = /* html */ `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Verbosia — revisão</title>
<style>
  :root { --bg:#0f1115; --panel:#171a21; --line:#262b36; --text:#e6e8ee; --dim:#8b93a7;
          --ok:#3fb970; --warn:#d9a13b; --bad:#e05b5b; --accent:#6a8dff; }
  * { box-sizing:border-box; }
  body { margin:0; font:14px/1.5 ui-sans-serif,system-ui,sans-serif; background:var(--bg); color:var(--text); }
  .app { display:grid; grid-template-columns:300px 1fr; height:100vh; }
  aside { border-right:1px solid var(--line); overflow-y:auto; padding:12px; }
  aside h1 { font-size:15px; margin:4px 8px 12px; }
  aside h1 span { color:var(--accent); }
  .item { display:flex; gap:8px; align-items:center; width:100%; text-align:left; padding:8px;
          border:0; border-radius:8px; background:none; color:var(--text); cursor:pointer; font:inherit; }
  .item:hover, .item.active { background:var(--panel); }
  .badge { font-size:11px; padding:1px 7px; border-radius:99px; flex:none; }
  .b-fresh { background:#12331f; color:var(--ok); } .b-stale { background:#33290f; color:var(--warn); }
  .b-missing { background:#331414; color:var(--bad); }
  .rev { color:var(--ok); flex:none; } .unrev { color:var(--dim); flex:none; }
  main { overflow-y:auto; padding:20px 24px; }
  .empty { color:var(--dim); margin-top:40vh; text-align:center; }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  h2 { font-size:15px; margin:0 0 12px; } h2 small { color:var(--dim); font-weight:400; }
  label { display:block; color:var(--dim); font-size:12px; margin:12px 0 4px; }
  input, textarea { width:100%; background:var(--panel); color:var(--text); border:1px solid var(--line);
                    border-radius:8px; padding:10px; font:13px/1.55 ui-monospace,monospace; }
  textarea { min-height:320px; resize:vertical; }
  [readonly] { color:var(--dim); }
  .bar { display:flex; gap:10px; align-items:center; margin-top:16px; }
  button.save { background:var(--accent); color:#fff; border:0; border-radius:8px; padding:10px 18px;
                font:inherit; font-weight:600; cursor:pointer; }
  button.save.ok2 { background:var(--ok); }
  #msg { color:var(--dim); font-size:13px; }
</style>
</head>
<body>
<div class="app">
  <aside><h1><span>Verbosia</span> · revisão</h1><div id="list"></div></aside>
  <main><div class="empty" id="empty">Selecione um documento para revisar.</div><div id="editor" hidden></div></main>
</div>
<script>
let current = null;

async function j(url, opts) { const r = await fetch(url, opts); const d = await r.json();
  if (!r.ok) throw new Error(d.error || r.status); return d; }

async function loadList() {
  const { rows } = await j('/api/overview');
  const list = document.getElementById('list');
  list.innerHTML = '';
  for (const r of rows) {
    const b = document.createElement('button');
    b.className = 'item';
    b.innerHTML =
      '<span class="badge b-' + r.state + '">' + r.state + '</span>' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
      r.docId + ' → ' + r.targetLang + '</span>' +
      (r.state !== 'missing' ? '<span class="' + (r.reviewed ? 'rev' : 'unrev') + '">' + (r.reviewed ? '✓' : '·') + '</span>' : '');
    b.onclick = () => open(r.docId, r.targetLang, b);
    list.appendChild(b);
  }
}

async function open(id, lang, btn) {
  document.querySelectorAll('.item').forEach((el) => el.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const doc = await j('/api/doc?id=' + encodeURIComponent(id) + '&lang=' + encodeURIComponent(lang));
  current = { id, lang };
  const ed = document.getElementById('editor');
  document.getElementById('empty').hidden = true;
  ed.hidden = false;
  if (!doc.translated) { ed.innerHTML = '<p class="empty">Ainda não traduzido — rode <code>verbosia translate</code>.</p>'; return; }

  const fields = Object.keys(doc.source.fields);
  ed.innerHTML =
    '<h2>' + id + ' <small>→ ' + lang + (doc.translated.reviewed ? ' · revisado ✓' : '') + '</small></h2>' +
    '<div class="cols"><div><h2><small>origem</small></h2>' +
    fields.map((f) => '<label>' + f + '</label><input readonly value="' + esc(doc.source.fields[f]) + '">').join('') +
    '<label>corpo</label><textarea readonly>' + esc(doc.source.body) + '</textarea></div>' +
    '<div><h2><small>tradução (editável)</small></h2>' +
    fields.map((f) => '<label>' + f + '</label><input id="f-' + f + '" value="' + esc(doc.translated.fields[f] ?? '') + '">').join('') +
    '<label>corpo</label><textarea id="body">' + esc(doc.translated.body) + '</textarea></div></div>' +
    '<div class="bar">' +
    '<button class="save" onclick="save(false)">Salvar</button>' +
    '<button class="save ok2" onclick="save(true)">Salvar e marcar revisado</button>' +
    '<span id="msg"></span></div>';
  window._fields = fields;
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

async function save(reviewed) {
  const fields = {};
  for (const f of window._fields) fields[f] = document.getElementById('f-' + f).value;
  const msg = document.getElementById('msg');
  msg.textContent = 'salvando…';
  try {
    const r = await j('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: current.id, targetLang: current.lang,
        body: document.getElementById('body').value, fields, reviewed }) });
    msg.textContent = 'salvo ✓ (' + r.tmUpdated + ' segmentos na TM' + (r.tmSkipped ? '; estrutura de parágrafos mudou — TM não atualizada' : '') + ')';
    loadList();
  } catch (e) { msg.textContent = 'erro: ' + e.message; }
}

loadList();
</script>
</body>
</html>`;
