export function generateDocsHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KickoffAI · API Reference</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --sidebar-w: 272px; --sidebar-bg: #011B33; --accent: #00C3F9;
      --border: #E5E7EB; --text-primary: #111827; --text-secondary: #6B7280;
      --text-muted: #9CA3AF; --code-bg: #0D1117;
    }
    html { scroll-behavior: smooth; }
    body { font-family: 'Inter', -apple-system, sans-serif; color: var(--text-primary); background: #F8FAFC; line-height: 1.6; }
    .layout { display: flex; min-height: 100vh; }

    /* Sidebar */
    .sidebar { width: var(--sidebar-w); background: var(--sidebar-bg); position: fixed; top: 0; left: 0; bottom: 0; overflow-y: auto; z-index: 100; display: flex; flex-direction: column; }
    .sidebar::-webkit-scrollbar { width: 3px; }
    .sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 2px; }
    .sidebar-header { padding: 22px 20px 18px; border-bottom: 1px solid rgba(255,255,255,.07); }
    .sidebar-logo { display: flex; align-items: center; gap: 9px; margin-bottom: 3px; }
    .sidebar-logo-icon { background: var(--accent); color: #000; width: 27px; height: 27px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; flex-shrink: 0; }
    .sidebar-logo-text { color: #fff; font-size: 15px; font-weight: 700; letter-spacing: -.2px; }
    .sidebar-subtitle { color: rgba(255,255,255,.3); font-size: 10px; font-weight: 600; letter-spacing: .8px; text-transform: uppercase; margin-left: 36px; }
    .sidebar-search { padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,.06); }
    .sidebar-search input { width: 100%; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); border-radius: 6px; color: #fff; font-size: 12px; font-family: inherit; padding: 7px 10px; outline: none; transition: border-color .15s; }
    .sidebar-search input::placeholder { color: rgba(255,255,255,.28); }
    .sidebar-search input:focus { border-color: var(--accent); }
    .sidebar-nav { flex: 1; padding: 6px 0 24px; }
    .nav-tag { padding: 14px 18px 5px; color: rgba(255,255,255,.28); font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    .nav-item { display: flex; align-items: center; gap: 8px; padding: 6px 18px; cursor: pointer; text-decoration: none; border-left: 2px solid transparent; transition: background .1s; }
    .nav-item:hover { background: rgba(255,255,255,.05); }
    .nav-item.active { background: rgba(0,195,249,.1); border-left-color: var(--accent); }
    .nav-item.active .nav-item-text { color: var(--accent); }
    .nav-method { font-size: 9px; font-weight: 700; letter-spacing: .3px; text-transform: uppercase; padding: 2px 5px; border-radius: 3px; min-width: 38px; text-align: center; flex-shrink: 0; }
    .nav-item-text { color: rgba(255,255,255,.55); font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* Topbar */
    .main { margin-left: var(--sidebar-w); flex: 1; min-width: 0; }
    .topbar { background: #fff; border-bottom: 1px solid var(--border); padding: 0 36px; height: 54px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 50; }
    .topbar-url { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-secondary); background: #F3F4F6; padding: 4px 10px; border-radius: 4px; border: 1px solid var(--border); }
    .topbar-right { display: flex; align-items: center; gap: 12px; }
    .auth-status { font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 6px; }
    .auth-dot { width: 7px; height: 7px; border-radius: 50%; background: #D1D5DB; transition: background .2s; }
    .auth-dot.on { background: #10B981; }
    .btn { padding: 7px 14px; border-radius: 6px; font-size: 13px; font-weight: 500; font-family: inherit; cursor: pointer; border: none; transition: all .15s; }
    .btn-primary { background: #011B33; color: #fff; }
    .btn-primary:hover { background: #022B52; }
    .btn-secondary { background: transparent; color: var(--text-primary); border: 1px solid var(--border); }
    .btn-secondary:hover { background: #F9FAFB; }
    .btn-sm { padding: 5px 12px; font-size: 12px; }

    /* Intro */
    .intro-section { padding: 44px 40px 36px; background: #fff; border-bottom: 1px solid var(--border); }
    .intro-title { font-size: 26px; font-weight: 700; letter-spacing: -.5px; margin-bottom: 8px; }
    .intro-desc { font-size: 14px; color: var(--text-secondary); max-width: 580px; line-height: 1.75; }
    .intro-pills { margin-top: 22px; display: flex; gap: 12px; flex-wrap: wrap; }
    .intro-pill { display: flex; align-items: center; gap: 7px; padding: 5px 12px; background: #F8FAFC; border: 1px solid var(--border); border-radius: 20px; font-size: 12px; color: var(--text-secondary); }
    .intro-pill strong { color: var(--text-primary); }
    .version-tag { background: #EFF6FF; color: #2563EB; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }

    /* Tag headers */
    .tag-header { padding: 20px 40px 14px; background: #F8FAFC; border-bottom: 1px solid var(--border); border-top: 2px solid var(--border); margin-top: 32px; }
    .tag-name { font-size: 17px; font-weight: 700; }
    .tag-desc { font-size: 13px; color: var(--text-secondary); margin-top: 2px; }

    /* Endpoint cards */
    .endpoint-card { display: grid; grid-template-columns: 1fr 380px; border-bottom: 1px solid var(--border); background: #fff; }
    .endpoint-left { padding: 30px 40px; border-right: 1px solid var(--border); }
    .endpoint-right { background: var(--code-bg); padding: 22px; }
    .ep-header { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; }
    .method-badge { font-size: 10px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; padding: 3px 8px; border-radius: 4px; flex-shrink: 0; margin-top: 3px; }
    .m-get    { background: #ECFDF5; color: #059669; }
    .m-post   { background: #EFF6FF; color: #2563EB; }
    .m-patch  { background: #FFFBEB; color: #D97706; }
    .m-delete { background: #FEF2F2; color: #DC2626; }
    .ep-path { font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 500; word-break: break-all; }
    .ep-summary { font-size: 15px; font-weight: 600; margin-bottom: 6px; }
    .ep-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.7; margin-bottom: 20px; }
    .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .7px; color: var(--text-muted); margin: 22px 0 9px; padding-bottom: 7px; border-bottom: 1px solid var(--border); }

    /* Params */
    .param-row { display: grid; grid-template-columns: 160px 1fr; gap: 10px; padding: 9px 0; border-bottom: 1px solid #F3F4F6; align-items: start; }
    .param-row:last-child { border-bottom: none; }
    .param-name { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 500; color: #1D4ED8; }
    .param-req { color: #DC2626; margin-left: 2px; }
    .param-type { font-size: 10px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; margin-top: 2px; }
    .param-desc { font-size: 12px; color: var(--text-secondary); line-height: 1.5; }
    .param-example { font-size: 11px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; margin-top: 3px; }

    /* Schema */
    .schema-tree { font-size: 12px; }
    .schema-row { display: flex; align-items: baseline; gap: 7px; padding: 3px 0; flex-wrap: wrap; }
    .sk { color: #1D4ED8; font-family: 'JetBrains Mono', monospace; }
    .st { color: #7C3AED; font-family: 'JetBrains Mono', monospace; }
    .sr { color: #DC2626; font-size: 10px; }
    .sd { color: var(--text-muted); font-size: 11px; }

    /* Response tabs */
    .resp-tabs { display: flex; border-bottom: 1px solid var(--border); margin-bottom: 10px; gap: 2px; }
    .resp-tab { padding: 5px 11px; font-size: 12px; font-weight: 500; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; color: var(--text-muted); }
    .resp-tab.on { border-bottom-color: #011B33; color: var(--text-primary); }
    .resp-panel { display: none; }
    .resp-panel.on { display: block; }
    .status-chip { display: inline-flex; align-items: center; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 4px; margin-bottom: 8px; }
    .s2 { background: #ECFDF5; color: #059669; }
    .s4 { background: #FEF3C7; color: #D97706; }
    .s5 { background: #FEF2F2; color: #DC2626; }

    /* Code */
    .code-tabs { display: flex; gap: 2px; margin-bottom: 10px; }
    .code-tab { padding: 4px 9px; font-size: 11px; font-weight: 500; cursor: pointer; border-radius: 4px; color: rgba(255,255,255,.35); background: transparent; border: none; font-family: inherit; transition: all .12s; }
    .code-tab.on { background: rgba(255,255,255,.1); color: rgba(255,255,255,.88); }
    .code-tab:hover { color: rgba(255,255,255,.6); }
    .code-wrap { position: relative; }
    .code-block { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 6px; padding: 14px; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; line-height: 1.75; color: #E6EDF3; overflow-x: auto; white-space: pre; display: none; }
    .code-block.on { display: block; }
    .copy-btn { position: absolute; top: 7px; right: 7px; padding: 2px 8px; font-size: 11px; background: rgba(255,255,255,.09); color: rgba(255,255,255,.5); border: none; border-radius: 4px; cursor: pointer; font-family: inherit; transition: all .12s; }
    .copy-btn:hover { background: rgba(255,255,255,.17); color: rgba(255,255,255,.88); }
    .code-label { font-size: 10px; font-weight: 600; letter-spacing: .8px; text-transform: uppercase; color: rgba(255,255,255,.22); margin: 14px 0 7px; }

    /* Try it */
    .try-btn { margin-top: 22px; display: inline-flex; align-items: center; gap: 7px; padding: 7px 14px; background: #F8FAFC; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; transition: all .12s; }
    .try-btn:hover { background: #F1F5F9; border-color: #CBD5E1; }
    .try-panel { display: none; margin-top: 14px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .try-panel.on { display: block; }
    .try-head { padding: 10px 16px; background: #F1F5F9; border-bottom: 1px solid var(--border); font-size: 12px; font-weight: 600; color: var(--text-secondary); display: flex; justify-content: space-between; align-items: center; }
    .try-head-path { font-family: 'JetBrains Mono', monospace; font-weight: 400; color: var(--text-muted); font-size: 11px; }
    .try-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; background: #FAFAFA; }
    .try-field label { display: block; font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 4px; }
    .try-field input, .try-field textarea { width: 100%; background: #fff; border: 1px solid var(--border); border-radius: 6px; font-size: 12px; font-family: 'JetBrains Mono', monospace; padding: 7px 10px; color: var(--text-primary); outline: none; transition: border-color .12s; }
    .try-field input:focus, .try-field textarea:focus { border-color: #011B33; }
    .try-field textarea { min-height: 90px; resize: vertical; }
    .try-actions { display: flex; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--border); background: #F1F5F9; }
    .try-resp { display: none; padding: 14px 16px; border-top: 1px solid var(--border); }
    .try-resp.on { display: block; }
    .try-resp-status { font-size: 12px; font-weight: 600; margin-bottom: 7px; }
    .try-resp pre { background: var(--code-bg); color: #E6EDF3; padding: 11px; border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: 11px; overflow-x: auto; white-space: pre-wrap; }

    /* Auth modal */
    .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 200; display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity .18s; }
    .overlay.on { opacity: 1; pointer-events: all; }
    .modal { background: #fff; border-radius: 12px; width: 460px; max-width: 92vw; padding: 28px; transform: translateY(8px); transition: transform .18s; }
    .overlay.on .modal { transform: translateY(0); }
    .modal-title { font-size: 17px; font-weight: 700; margin-bottom: 6px; }
    .modal-desc { font-size: 13px; color: var(--text-secondary); margin-bottom: 18px; line-height: 1.65; }
    .modal-label { font-size: 12px; font-weight: 600; display: block; margin-bottom: 5px; }
    .modal-input { width: 100%; border: 1px solid var(--border); border-radius: 6px; padding: 9px 12px; font-size: 12px; font-family: 'JetBrains Mono', monospace; outline: none; }
    .modal-input:focus { border-color: #011B33; }
    .modal-actions { display: flex; gap: 8px; margin-top: 18px; justify-content: flex-end; align-items: center; }
    .modal-actions .btn-clear { margin-right: auto; color: #DC2626; border-color: #FECACA; }
    .modal-actions .btn-clear:hover { background: #FEF2F2; }

    /* Misc */
    .loading { display: flex; align-items: center; justify-content: center; height: 180px; color: var(--text-muted); font-size: 13px; gap: 9px; }
    .spinner { width: 16px; height: 16px; border: 2px solid #E5E7EB; border-top-color: #011B33; border-radius: 50%; animation: spin .65s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    code { background: #F3F4F6; padding: 1px 5px; border-radius: 3px; font-family: 'JetBrains Mono', monospace; font-size: 12px; }
    @media (max-width: 880px) {
      .endpoint-card { grid-template-columns: 1fr; }
      .endpoint-left { border-right: none; border-bottom: 1px solid var(--border); }
    }
  </style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-logo">
        <div class="sidebar-logo-icon">&#9889;</div>
        <span class="sidebar-logo-text">KickoffAI</span>
      </div>
      <div class="sidebar-subtitle">API Reference</div>
    </div>
    <div class="sidebar-search">
      <input id="search" type="text" placeholder="Search endpoints&#8230;" autocomplete="off" />
    </div>
    <nav class="sidebar-nav" id="nav">
      <div class="loading"><div class="spinner"></div></div>
    </nav>
  </aside>

  <div class="main">
    <div class="topbar">
      <code class="topbar-url" id="base-url">&#8230;</code>
      <div class="topbar-right">
        <div class="auth-status">
          <div class="auth-dot" id="auth-dot"></div>
          <span id="auth-lbl">Not authorized</span>
        </div>
        <button class="btn btn-primary" id="auth-open">Authorize</button>
      </div>
    </div>
    <div id="content">
      <div class="loading"><div class="spinner"></div> Loading API reference&#8230;</div>
    </div>
  </div>
</div>

<div class="overlay" id="auth-modal">
  <div class="modal">
    <div class="modal-title">Authorize requests</div>
    <div class="modal-desc">
      Paste your JWT token below. Obtain one by calling
      <code>GET /auth/verify?token=&#8230;</code> after receiving a magic-link email.
      The token is saved in your browser session only.
    </div>
    <label class="modal-label" for="token-input">Bearer Token</label>
    <input class="modal-input" id="token-input" type="text" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9&#8230;" />
    <div class="modal-actions">
      <button class="btn btn-secondary btn-clear" id="token-clear">Clear</button>
      <button class="btn btn-secondary" id="modal-close">Cancel</button>
      <button class="btn btn-primary" id="token-save">Save</button>
    </div>
  </div>
</div>

<script src="/docs/client.js"></script>
</body>
</html>`
}
