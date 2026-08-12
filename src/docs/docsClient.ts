/* eslint-disable */
// This file is served as /docs/client.js — plain JS string, no template literal nesting.
export const docsClientJs: string = `
(function () {
  'use strict';

  var spec = null;
  var token = sessionStorage.getItem('ka_token') || '';

  function gel(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function uid() { return 'e' + Math.random().toString(36).slice(2, 7); }

  function mClass(m) {
    var map = { get: 'get', post: 'post', put: 'post', patch: 'patch', delete: 'delete' };
    return map[m.toLowerCase()] || 'post';
  }

  function mColor(m) {
    var map = { get: '#10B981', post: '#3B82F6', patch: '#F59E0B', delete: '#EF4444' };
    return map[mClass(m)] || '#6B7280';
  }

  function mBg(m) {
    var map = { get: 'rgba(16,185,129,.15)', post: 'rgba(59,130,246,.15)', patch: 'rgba(245,158,11,.15)', delete: 'rgba(239,68,68,.15)' };
    return map[mClass(m)] || 'rgba(107,114,128,.15)';
  }

  function statusCls(code) {
    if (code.charAt(0) === '2') return 's2';
    if (code.charAt(0) === '4') return 's4';
    return 's5';
  }

  function resolveRef(schema) {
    if (!schema) return null;
    if (!schema.$ref) return schema;
    var parts = schema.$ref.replace(/^#\\//, '').split('/');
    var o = spec;
    for (var i = 0; i < parts.length; i++) { o = o && o[parts[i]]; }
    return o || null;
  }

  /* ── Auth ──────────────────────────────────────────────── */
  function updateAuth() {
    var on = !!token;
    gel('auth-dot').className = 'auth-dot' + (on ? ' on' : '');
    gel('auth-lbl').textContent = on ? 'Authorized' : 'Not authorized';
  }

  gel('auth-open').addEventListener('click', function () {
    gel('token-input').value = token;
    gel('auth-modal').classList.add('on');
  });
  gel('auth-modal').addEventListener('click', function (e) {
    if (e.target === gel('auth-modal')) gel('auth-modal').classList.remove('on');
  });
  gel('modal-close').addEventListener('click', function () { gel('auth-modal').classList.remove('on'); });
  gel('token-save').addEventListener('click', function () {
    token = gel('token-input').value.trim();
    sessionStorage.setItem('ka_token', token);
    updateAuth();
    gel('auth-modal').classList.remove('on');
  });
  gel('token-clear').addEventListener('click', function () {
    token = '';
    gel('token-input').value = '';
    sessionStorage.removeItem('ka_token');
    updateAuth();
  });
  updateAuth();

  /* ── Search ────────────────────────────────────────────── */
  gel('search').addEventListener('input', function () {
    var q = this.value.toLowerCase();
    var items = document.querySelectorAll('.nav-item');
    items.forEach(function (el) {
      el.style.display = el.dataset.s.indexOf(q) !== -1 ? '' : 'none';
    });
    var tags = document.querySelectorAll('.nav-tag');
    tags.forEach(function (el) {
      var any = false;
      document.querySelectorAll('.nav-item[data-tag="' + el.dataset.tag + '"]').forEach(function (i) {
        if (i.style.display !== 'none') any = true;
      });
      el.style.display = any ? '' : 'none';
    });
  });

  /* ── Schema ────────────────────────────────────────────── */
  function renderSchema(schema, depth) {
    depth = depth || 0;
    schema = resolveRef(schema);
    if (!schema) return '';
    var pad = depth * 14;
    var out = '';

    if (schema.properties) {
      var required = schema.required || [];
      Object.keys(schema.properties).forEach(function (key) {
        var raw = schema.properties[key];
        var v = resolveRef(raw);
        var isReq = required.indexOf(key) !== -1;
        var t = (v && v.type) || (raw && raw.$ref ? raw.$ref.split('/').pop() : '?');
        if (v && v.format) t += '(' + v.format + ')';
        if (v && v.nullable) t += '?';
        if (v && v.enum) t += ' enum';
        out += '<div class="schema-row" style="padding-left:' + pad + 'px">';
        out += '<span class="sk">' + esc(key) + '</span>';
        if (isReq) out += '<span class="sr">required</span>';
        out += '<span class="st">' + esc(t) + '</span>';
        if (v && v.description) out += '<span class="sd">&mdash; ' + esc(v.description) + '</span>';
        if (v && v.example != null) out += '<span class="sd">e.g. ' + esc(String(v.example)) + '</span>';
        out += '</div>';
        if (v && v.properties) out += renderSchema(v, depth + 1);
      });
      return out;
    }

    if (schema.type === 'array' && schema.items) {
      return '<div class="schema-row" style="padding-left:' + pad + 'px"><span class="st">array of:</span></div>' + renderSchema(resolveRef(schema.items), depth + 1);
    }

    var t = (schema.type || '') + (schema.format ? '(' + schema.format + ')' : '');
    return '<div class="schema-row" style="padding-left:' + pad + 'px"><span class="st">' + esc(t) + '</span>' +
      (schema.description ? '<span class="sd">&mdash; ' + esc(schema.description) + '</span>' : '') + '</div>';
  }

  /* ── Example from schema ───────────────────────────────── */
  function exampleFromSchema(schema) {
    schema = resolveRef(schema);
    if (!schema) return {};
    if (schema.example != null) return schema.example;
    if (schema.type === 'object' && schema.properties) {
      var out = {};
      Object.keys(schema.properties).forEach(function (k) {
        var v = resolveRef(schema.properties[k]);
        if (v && v.example != null) out[k] = v.example;
        else if (v && v.type === 'string') out[k] = k;
        else if (v && (v.type === 'integer' || v.type === 'number')) out[k] = 0;
        else if (v && v.type === 'boolean') out[k] = true;
        else out[k] = null;
      });
      return out;
    }
    return {};
  }

  /* ── Code examples ─────────────────────────────────────── */
  function curlExample(method, path, op, base) {
    var M = method.toUpperCase();
    var json = op.requestBody && op.requestBody.content && op.requestBody.content['application/json'];
    var form = op.requestBody && op.requestBody.content && op.requestBody.content['multipart/form-data'];
    var lines = ['curl -X ' + M + ' \\\\', '  "' + base + path + '" \\\\', '  -H "Authorization: Bearer $TOKEN"'];

    if (json) {
      var ex = JSON.stringify(exampleFromSchema(json.schema), null, 2).replace(/\\n/g, '\\n  ');
      lines.push('  -H "Content-Type: application/json" \\\\');
      lines.push("  -d '" + ex + "'");
    } else if (form) {
      var props = resolveRef(form.schema);
      props = (props && props.properties) || {};
      Object.keys(props).forEach(function (k) {
        var v = resolveRef(props[k]);
        lines[lines.length - 1] += ' \\\\';
        lines.push(v && v.format === 'binary' ? '  -F "' + k + '=@/path/to/file"' : '  -F "' + k + '=your_' + k + '"');
      });
    }
    return lines.join('\\n');
  }

  function jsExample(method, path, op, base) {
    var M = method.toUpperCase();
    var json = op.requestBody && op.requestBody.content && op.requestBody.content['application/json'];
    var form = op.requestBody && op.requestBody.content && op.requestBody.content['multipart/form-data'];
    var lines = [];

    if (form) {
      lines.push('// Build FormData for file/image uploads');
      lines.push('const form = new FormData()');
      lines.push('form.append("content", "Your message here")');
      lines.push('form.append("file", fileInput.files[0])  // optional');
      lines.push('');
    }

    lines.push('const res = await fetch("' + base + path + '", {');
    lines.push('  method: "' + M + '",');
    lines.push('  headers: {');
    if (json) lines.push('    "Content-Type": "application/json",');
    if (form) lines.push('    // Do NOT set Content-Type manually — browser sets the boundary');
    lines.push('    "Authorization": "Bearer " + token,');
    lines.push('  },');
    if (json) {
      var ex = exampleFromSchema(json.schema);
      lines.push('  body: JSON.stringify(' + JSON.stringify(ex, null, 4).replace(/\\n/g, '\\n  ') + '),');
    } else if (form) {
      lines.push('  body: form,');
    }
    lines.push('})');
    lines.push('');
    lines.push('const data = await res.json()');
    return lines.join('\\n');
  }

  /* ── Endpoint card ─────────────────────────────────────── */
  function renderEndpoint(method, path, op, base) {
    var id = uid();
    var mc = mClass(method);

    var params = (op.parameters || []).map(function (p) {
      if (!p.$ref) return p;
      var parts = p.$ref.replace(/^#\\//, '').split('/');
      var o = spec;
      for (var i = 0; i < parts.length; i++) o = o && o[parts[i]];
      return o || p;
    });
    var pathP = params.filter(function (p) { return p.in === 'path'; });
    var queryP = params.filter(function (p) { return p.in === 'query'; });

    /* params section */
    var paramsHtml = '';
    if (pathP.length || queryP.length) {
      paramsHtml = '<div class="section-label">Parameters</div>';
      pathP.concat(queryP).forEach(function (p) {
        var s = resolveRef(p.schema || {});
        var t = ((s && s.type) || 'string') + ((s && s.format) ? '(' + s.format + ')' : '');
        paramsHtml += '<div class="param-row">';
        paramsHtml += '<div><div class="param-name">' + esc(p.name) + (p.required ? '<span class="param-req">*</span>' : '') + '</div>';
        paramsHtml += '<div class="param-type">' + esc(p.in) + ' &middot; ' + esc(t) + '</div></div>';
        paramsHtml += '<div><div class="param-desc">' + esc(p.description || '') + '</div>';
        if (s && s.example != null) paramsHtml += '<div class="param-example">e.g. ' + esc(String(s.example)) + '</div>';
        paramsHtml += '</div></div>';
      });
    }

    /* body section */
    var bodyHtml = '';
    if (op.requestBody) {
      bodyHtml = '<div class="section-label">Request Body</div>';
      var content = op.requestBody.content || {};
      Object.keys(content).forEach(function (ct) {
        var s = resolveRef(content[ct].schema);
        bodyHtml += '<div style="font-size:11px;font-family:JetBrains Mono,monospace;color:var(--text-muted);margin-bottom:6px;">' + esc(ct) + '</div>';
        if (s) bodyHtml += '<div class="schema-tree">' + renderSchema(s) + '</div>';
      });
    }

    /* response tabs */
    var codes = Object.keys(op.responses || {});
    var respTabsHtml = '';
    var respPanelsHtml = '';
    codes.forEach(function (code, i) {
      var r = op.responses[code];
      var s = r && r.content && r.content['application/json'] && resolveRef(r.content['application/json'].schema);
      respTabsHtml += '<div class="resp-tab' + (i === 0 ? ' on' : '') + '" data-t="' + id + '_r' + code + '">' + code + '</div>';
      respPanelsHtml += '<div class="resp-panel' + (i === 0 ? ' on' : '') + '" id="' + id + '_r' + code + '">';
      respPanelsHtml += '<span class="status-chip ' + statusCls(code) + '">' + code + '</span>';
      respPanelsHtml += '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px;">' + esc((r && r.description) || '') + '</div>';
      if (s) respPanelsHtml += '<div class="schema-tree">' + renderSchema(s) + '</div>';
      respPanelsHtml += '</div>';
    });
    var respHtml = codes.length
      ? '<div class="section-label">Responses</div><div class="resp-tabs" data-g="' + id + '">' + respTabsHtml + '</div>' + respPanelsHtml
      : '';

    /* try it form fields */
    var tryPathFields = pathP.map(function (p) {
      return '<div class="try-field"><label>' + esc(p.name) + ' <span style="color:#DC2626">*</span></label>' +
        '<input type="text" data-p="' + esc(p.name) + '" placeholder="' + esc(p.description || p.name) + '" /></div>';
    }).join('');

    var tryBodyField = '';
    if (op.requestBody && op.requestBody.content && op.requestBody.content['application/json']) {
      var ex = exampleFromSchema(op.requestBody.content['application/json'].schema);
      tryBodyField = '<div class="try-field"><label>Request Body (JSON)</label><textarea class="try-json">' + esc(JSON.stringify(ex, null, 2)) + '</textarea></div>';
    } else if (op.requestBody && op.requestBody.content && op.requestBody.content['multipart/form-data']) {
      tryBodyField = '<div class="try-field"><label>Content <span style="color:#DC2626">*</span></label><input type="text" class="try-content" placeholder="Your message" /></div>' +
        '<div class="try-field"><label>File (optional)</label><input type="file" class="try-file" style="font-family:inherit;font-size:12px;" /></div>';
    }

    /* code examples */
    var curl = curlExample(method, path, op, base);
    var js = jsExample(method, path, op, base);

    /* response example */
    var succCode = codes.find(function (c) { return c.charAt(0) === '2'; });
    var respEx = '';
    if (succCode) {
      var r2 = op.responses[succCode];
      var s2 = r2 && r2.content && r2.content['application/json'] && resolveRef(r2.content['application/json'].schema);
      if (s2) {
        var exStr = JSON.stringify(exampleFromSchema(s2), null, 2);
        respEx = '<div class="code-label">Response example</div><div class="code-wrap">' +
          '<pre class="code-block on">' + esc(exStr) + '</pre>' +
          '<button class="copy-btn" data-c="' + esc(exStr) + '">Copy</button></div>';
      }
    }

    /* short description */
    var shortDesc = '';
    if (op.description) {
      var lines = op.description.split('\\n');
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i].trim();
        if (l && l.charAt(0) !== '#' && l.charAt(0) !== '\`' && l.charAt(0) !== '|' && l.charAt(0) !== '-') {
          shortDesc = l;
          break;
        }
      }
    }

    return '<div class="endpoint-card" id="' + id + '">' +
      /* left */
      '<div class="endpoint-left">' +
      '<div class="ep-header"><span class="method-badge m-' + mc + '">' + method.toUpperCase() + '</span>' +
      '<span class="ep-path">' + esc(path) + '</span></div>' +
      '<div class="ep-summary">' + esc(op.summary || '') + '</div>' +
      (shortDesc ? '<div class="ep-desc">' + esc(shortDesc) + '</div>' : '') +
      paramsHtml + bodyHtml + respHtml +
      '<button class="try-btn" data-id="' + id + '">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>Try it</button>' +
      '<div class="try-panel" id="try_' + id + '">' +
      '<div class="try-head"><span>Test request</span><span class="try-head-path">' + method.toUpperCase() + ' ' + esc(path) + '</span></div>' +
      '<div class="try-body">' + tryPathFields + tryBodyField + '</div>' +
      '<div class="try-actions">' +
      '<button class="btn btn-primary btn-sm try-send" data-id="' + id + '" data-m="' + method + '" data-path="' + esc(path) + '">Send</button>' +
      '<button class="btn btn-secondary btn-sm try-cancel" data-id="' + id + '">Cancel</button></div>' +
      '<div class="try-resp" id="tr_' + id + '"><div class="try-resp-status" id="ts_' + id + '"></div><pre id="tb_' + id + '"></pre></div>' +
      '</div></div>' +
      /* right */
      '<div class="endpoint-right">' +
      '<div class="code-tabs" data-g="code_' + id + '">' +
      '<button class="code-tab on" data-t="curl_' + id + '">cURL</button>' +
      '<button class="code-tab" data-t="js_' + id + '">JavaScript</button>' +
      '</div>' +
      '<div class="code-wrap">' +
      '<pre class="code-block on" id="curl_' + id + '">' + esc(curl) + '</pre>' +
      '<pre class="code-block" id="js_' + id + '">' + esc(js) + '</pre>' +
      '<button class="copy-btn" data-tc="curl_' + id + '">Copy</button>' +
      '</div>' +
      respEx +
      '</div></div>';
  }

  /* ── Render all ────────────────────────────────────────── */
  function render(data) {
    spec = data;
    var base = (spec.servers && spec.servers[0] && spec.servers[0].url) || '';
    gel('base-url').textContent = base;

    var tagMap = {};
    var tagDesc = {};
    (spec.tags || []).forEach(function (t) { tagDesc[t.name] = t.description || ''; });

    Object.keys(spec.paths || {}).forEach(function (path) {
      var item = spec.paths[path];
      ['get', 'post', 'put', 'patch', 'delete'].forEach(function (m) {
        var op = item[m];
        if (!op) return;
        var tag = (op.tags && op.tags[0]) || 'General';
        if (!tagMap[tag]) tagMap[tag] = [];
        tagMap[tag].push({ method: m, path: path, op: op });
      });
    });

    /* sidebar */
    var navHtml = '';
    Object.keys(tagMap).forEach(function (tag) {
      navHtml += '<div class="nav-tag" data-tag="' + esc(tag) + '">' + esc(tag) + '</div>';
      tagMap[tag].forEach(function (entry) {
        var m = entry.method, p = entry.path, op = entry.op;
        navHtml += '<a href="#" class="nav-item"' +
          ' data-s="' + esc((m + ' ' + p + ' ' + (op.summary || '')).toLowerCase()) + '"' +
          ' data-tag="' + esc(tag) + '"' +
          ' data-sum="' + esc(op.summary || p) + '">' +
          '<span class="nav-method" style="color:' + mColor(m) + ';background:' + mBg(m) + '">' + m.toUpperCase() + '</span>' +
          '<span class="nav-item-text">' + esc(op.summary || p) + '</span></a>';
      });
    });
    gel('nav').innerHTML = navHtml;

    /* content */
    var intro = '<div class="intro-section">' +
      '<div class="intro-title">' + esc((spec.info && spec.info.title) || 'API Reference') + '</div>' +
      '<div class="intro-desc">' + esc((spec.info && spec.info.description) || '') + '</div>' +
      '<div class="intro-pills">' +
      '<div class="intro-pill"><span class="version-tag">v' + esc((spec.info && spec.info.version) || '1.0') + '</span></div>' +
      '<div class="intro-pill"><strong>Base URL</strong> <code>' + esc(base) + '</code></div>' +
      '<div class="intro-pill"><strong>Auth</strong> Bearer JWT</div>' +
      '</div></div>';

    var sections = '';
    Object.keys(tagMap).forEach(function (tag) {
      sections += '<div><div class="tag-header">' +
        '<div class="tag-name">' + esc(tag) + '</div>' +
        (tagDesc[tag] ? '<div class="tag-desc">' + esc(tagDesc[tag]) + '</div>' : '') +
        '</div>';
      tagMap[tag].forEach(function (entry) {
        sections += renderEndpoint(entry.method, entry.path, entry.op, base);
      });
      sections += '</div>';
    });

    gel('content').innerHTML = intro + sections;
    wire(base);

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var sum = entry.target.querySelector('.ep-summary');
        if (!sum) return;
        var txt = sum.textContent.trim();
        document.querySelectorAll('.nav-item').forEach(function (el) {
          if (el.dataset.sum && el.dataset.sum.trim() === txt) {
            document.querySelectorAll('.nav-item').forEach(function (i) { i.classList.remove('active'); });
            el.classList.add('active');
          }
        });
      });
    }, { threshold: 0.15, rootMargin: '-56px 0px -55% 0px' });

    document.querySelectorAll('.endpoint-card').forEach(function (el) { observer.observe(el); });
  }

  /* ── Wire events ───────────────────────────────────────── */
  function wire(base) {
    /* response tabs */
    document.querySelectorAll('.resp-tabs').forEach(function (g) {
      g.querySelectorAll('.resp-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
          g.querySelectorAll('.resp-tab').forEach(function (t) { t.classList.remove('on'); });
          tab.classList.add('on');
          var target = document.getElementById(tab.dataset.t);
          if (!target) return;
          target.parentElement.querySelectorAll('.resp-panel').forEach(function (p) { p.classList.remove('on'); });
          target.classList.add('on');
        });
      });
    });

    /* code tabs */
    document.querySelectorAll('.code-tabs').forEach(function (g) {
      g.querySelectorAll('.code-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
          var right = tab.closest('.endpoint-right');
          g.querySelectorAll('.code-tab').forEach(function (t) { t.classList.remove('on'); });
          tab.classList.add('on');
          right.querySelectorAll('.code-wrap .code-block').forEach(function (b) { b.classList.remove('on'); });
          var target = document.getElementById(tab.dataset.t);
          if (target) target.classList.add('on');
          var cpBtn = right.querySelector('.copy-btn[data-tc]');
          if (cpBtn) cpBtn.dataset.tc = tab.dataset.t;
        });
      });
    });

    /* copy buttons */
    document.querySelectorAll('.copy-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var text = btn.dataset.c || (document.getElementById(btn.dataset.tc) && document.getElementById(btn.dataset.tc).textContent) || '';
        navigator.clipboard.writeText(text).then(function () {
          var orig = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(function () { btn.textContent = orig; }, 1400);
        });
      });
    });

    /* try it toggle */
    document.querySelectorAll('.try-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var panel = document.getElementById('try_' + btn.dataset.id);
        if (panel) panel.classList.toggle('on');
      });
    });

    document.querySelectorAll('.try-cancel').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var panel = document.getElementById('try_' + btn.dataset.id);
        if (panel) panel.classList.remove('on');
      });
    });

    /* try it send */
    document.querySelectorAll('.try-send').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.id;
        var path = btn.dataset.path;
        var panel = document.getElementById('try_' + id);
        var statusEl = document.getElementById('ts_' + id);
        var bodyEl = document.getElementById('tb_' + id);
        var respEl = document.getElementById('tr_' + id);

        panel.querySelectorAll('input[data-p]').forEach(function (inp) {
          if (inp.value.trim()) path = path.replace('{' + inp.dataset.p + '}', encodeURIComponent(inp.value.trim()));
        });

        var hdrs = {};
        if (token) hdrs['Authorization'] = 'Bearer ' + token;
        var body = undefined;

        var jsonEl = panel.querySelector('.try-json');
        var contentEl = panel.querySelector('.try-content');
        var fileEl = panel.querySelector('.try-file');

        if (jsonEl) {
          try { JSON.parse(jsonEl.value); } catch (e) {
            statusEl.textContent = 'Invalid JSON';
            statusEl.style.color = '#DC2626';
            respEl.classList.add('on');
            return;
          }
          hdrs['Content-Type'] = 'application/json';
          body = jsonEl.value;
        } else if (contentEl || fileEl) {
          var fd = new FormData();
          if (contentEl && contentEl.value) fd.append('content', contentEl.value);
          if (fileEl && fileEl.files && fileEl.files[0]) fd.append('file', fileEl.files[0]);
          body = fd;
        }

        var origText = btn.textContent;
        btn.textContent = 'Sending\u2026';
        btn.disabled = true;

        fetch(base + path, { method: btn.dataset.m.toUpperCase(), headers: hdrs, body: body })
          .then(function (res) {
            return res.text().then(function (txt) {
              var pretty;
              try { pretty = JSON.stringify(JSON.parse(txt), null, 2); } catch (e) { pretty = txt; }
              statusEl.innerHTML = '<span style="color:' + (res.ok ? '#059669' : '#DC2626') + ';font-weight:700">' + res.status + '</span> ' + res.statusText;
              bodyEl.textContent = pretty;
              respEl.classList.add('on');
            });
          })
          .catch(function (e) {
            statusEl.textContent = 'Error: ' + e.message;
            statusEl.style.color = '#DC2626';
            bodyEl.textContent = '';
            respEl.classList.add('on');
          })
          .finally(function () {
            btn.textContent = origText;
            btn.disabled = false;
          });
      });
    });

    /* nav scroll */
    document.querySelectorAll('.nav-item').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        var sum = el.dataset.sum;
        document.querySelectorAll('.endpoint-card').forEach(function (card) {
          var s = card.querySelector('.ep-summary');
          if (s && s.textContent.trim() === sum) {
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            document.querySelectorAll('.nav-item').forEach(function (i) { i.classList.remove('active'); });
            el.classList.add('active');
          }
        });
      });
    });
  }

  /* ── Boot ──────────────────────────────────────────────── */
  fetch('/docs/spec.json')
    .then(function (r) { return r.json(); })
    .then(render)
    .catch(function (e) {
      gel('content').innerHTML = '<div class="loading" style="color:#DC2626">Failed to load API spec: ' + e.message + '</div>';
    });

})();
`;
