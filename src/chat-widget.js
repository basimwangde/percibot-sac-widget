/* PerciBot — SAC Chat Widget
*/
;(function () {

  const BACKEND_URL     = 'https://percibot.cfapps.us10-001.hana.ondemand.com'
  const CRYPTO_KEY      = 'percibot-default-key'
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024
  const ACCEPTED_IMAGES = ['image/jpeg','image/png','image/webp','image/gif']

  function xorEncrypt (pt) {
    const enc = new TextEncoder()
    const ptB = enc.encode(pt), keyB = enc.encode(CRYPTO_KEY)
    const x   = ptB.map((b,i) => b ^ keyB[i % keyB.length])
    return btoa(String.fromCharCode(...x)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
  }

  // ── Inline SVG icons ──────────────────────────────────────────────────────
  const IC = {
    plus: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
             <line x1="10" y1="3" x2="10" y2="17"/><line x1="3" y1="10" x2="17" y2="10"/>
           </svg>`,
    clip: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
             <path d="M17 10.5L9.5 18a5 5 0 0 1-7.07-7.07l8-8a3.33 3.33 0 0 1 4.71 4.71L7.41 15.41a1.67 1.67 0 0 1-2.36-2.36l7.07-7.07"/>
           </svg>`,
    globe: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="10" cy="10" r="8"/>
              <path d="M2 10h16M10 2a13 13 0 0 1 0 16M10 2a13 13 0 0 0 0 16"/>
            </svg>`,
    send: `<svg viewBox="0 0 20 20" fill="currentColor">
             <path d="M3.1 3.1a1 1 0 0 1 1.09-.24l13 5a1 1 0 0 1 0 1.87l-13 5a1 1 0 0 1-1.33-1.33L4.9 10 2.86 4.44a1 1 0 0 1 .24-1.34z"/>
           </svg>`,
  }

  // ── Template ──────────────────────────────────────────────────────────────
  const tpl = document.createElement('template')
  tpl.innerHTML = /* html */`
  <style>
    /* ─ Reset / host ──────────────────────────────────────────────── */
    :host { display:block; height:100%; font:14px/1.5 "Inter","Segoe UI",Arial,sans-serif; color:#0d1117; box-sizing:border-box }
    *, *::before, *::after { box-sizing:inherit; margin:0; padding:0 }

    /* ─ Shell ─────────────────────────────────────────────────────── */
    .wrap { height:100%; display:flex; flex-direction:column; background:#fff }

    /* ─ Header ────────────────────────────────────────────────────── */
    header {
      flex-shrink:0; display:flex; align-items:center; justify-content:space-between;
      padding:10px 14px; color:#fff; border-radius:12px; margin:10px 10px 0;
      min-height:44px; position:relative;
    }
    .brand  { font-weight:700; font-size:15px; letter-spacing:-.2px }
    .chip   {
      font-size:11px; font-weight:600; padding:3px 10px; border-radius:999px;
      background:rgba(255,255,255,.18); border:1px solid rgba(255,255,255,.3);
      cursor:pointer; user-select:none; white-space:nowrap; transition:background .15s;
    }
    .chip:hover { background:rgba(255,255,255,.28) }

    /* ─ Dataset drawer ────────────────────────────────────────────── */
    #dsDrawer {
      position:absolute; right:14px; top:54px; z-index:30;
      min-width:240px; max-width:380px; max-height:240px; overflow:auto;
      background:#fff; border:1px solid #e3e6f0; border-radius:12px;
      box-shadow:0 12px 32px rgba(0,0,0,.13); padding:10px; font-size:12px; display:none;
    }
    #dsDrawer .ds            { padding:6px 4px; border-bottom:1px dashed #eee }
    #dsDrawer .ds:last-child { border-bottom:none }
    #dsDrawer .name          { font-weight:700 }

    /* ─ Body ──────────────────────────────────────────────────────── */
    .body  { flex:1; display:flex; flex-direction:column; padding:10px; gap:8px; min-height:0 }
    .panel {
      flex:1; overflow-y:auto; overflow-x:hidden; padding:12px 14px;
      border:1px solid #e3e6f0; border-radius:14px; background:#f8f9fc;
    }

    /* ─ Messages ──────────────────────────────────────────────────── */
    .msg {
      max-width:82%; margin:5px 0; padding:10px 14px;
      border-radius:18px; line-height:1.55;
      box-shadow:0 1px 2px rgba(0,0,0,.04);
      word-break:break-word;
    }
    .user { margin-left:auto; border-bottom-right-radius:4px }
    .bot  { border-bottom-left-radius:4px }

    .msg.bot p        { margin:5px 0 }
    .msg.bot ul,
    .msg.bot ol       { padding-left:20px; margin:5px 0 }
    .msg.bot li       { margin:3px 0 }
    .msg.bot table    { border-collapse:collapse; width:100%; margin:6px 0; font-size:13px }
    .msg.bot th,
    .msg.bot td       { border:1px solid #e3e6f0; padding:5px 9px; text-align:left }
    .msg.bot thead th { background:#f2f5ff }
    .msg.bot code     { background:#f0f2f7; padding:1px 5px; border-radius:4px; font-size:12.5px; font-family:monospace }

    /* Typing animation */
    .typing { display:inline-flex !important; align-items:center; gap:8px; position:sticky; bottom:0 }
    .dots   { display:inline-flex; gap:4px }
    .dots b {
      display:inline-block; width:6px; height:6px; border-radius:50%; background:#b0b8cc;
      animation:pb-blink 1s ease-in-out infinite;
    }
    .dots b:nth-child(2) { animation-delay:.18s }
    .dots b:nth-child(3) { animation-delay:.36s }
    @keyframes pb-blink {
      0%,100% { opacity:.2; transform:translateY(0)    }
      40%     { opacity:1;  transform:translateY(-3px) }
    }

    /* Image in user bubble */
    .msgImg {
      display:block; max-width:100%; max-height:200px; object-fit:cover;
      border-radius:10px; margin-bottom:7px; cursor:zoom-in;
      border:1px solid rgba(0,0,0,.07); transition:opacity .15s;
    }
    .msgImg:hover { opacity:.87 }

    /* ─ Composer wrapper ──────────────────────────────────────────── */
    .cWrap { position:relative; flex-shrink:0 }

    /* The card itself */
    .composer {
      border:1.5px solid #d5d9e8; border-radius:18px; background:#fff;
      transition:border-color .18s, box-shadow .18s;
      box-shadow:0 1px 5px rgba(0,0,0,.05);
    }
    .composer:focus-within {
      border-color:#7b9ef0;
      box-shadow:0 0 0 3px rgba(90,130,230,.10), 0 2px 10px rgba(0,0,0,.07);
    }

    /* Loading shimmer row */
    .shimRow { display:none; align-items:center; gap:10px; padding:8px 14px 0 }
    .shimRow.vis { display:flex }
    .shimBox {
      width:26px; height:26px; border-radius:6px; flex-shrink:0;
      background:linear-gradient(90deg,#e8ecf8 25%,#d4d9f0 50%,#e8ecf8 75%);
      background-size:200% 100%; animation:pb-shim 1.1s infinite;
    }
    .shimTxt { font-size:12px; color:#7a80a0; font-style:italic }
    @keyframes pb-shim { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

    /* Pills row */
    .pills { display:none; flex-wrap:wrap; align-items:center; gap:6px; padding:8px 12px 0 }
    .pills.vis { display:flex }

    .pill {
      display:inline-flex; align-items:center; gap:5px; padding:4px 10px;
      border-radius:999px; font-size:12px; font-weight:500;
      background:#eef1fc; border:1px solid #cdd5f0; color:#2b46a8;
      user-select:none; position:relative;
    }
    .pill svg { width:13px; height:13px; flex-shrink:0 }
    .pill .plabel {
      max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }
    .pthumb {
      width:22px; height:22px; object-fit:cover; border-radius:4px;
      border:1px solid rgba(0,0,0,.08); flex-shrink:0; cursor:zoom-in;
    }
    .prem {
      display:none; align-items:center; justify-content:center;
      width:16px; height:16px; border-radius:50%;
      background:rgba(43,70,168,.18); border:none; padding:0; cursor:pointer;
      font-size:10px; line-height:1; color:#2b46a8; flex-shrink:0;
    }
    .pill:hover .prem { display:inline-flex }

    /* Input row */
    .inputRow { display:flex; align-items:flex-end; gap:6px; padding:8px 10px 8px 10px }

    /* Plus button */
    .btnPlus {
      flex-shrink:0; width:30px; height:30px; border-radius:8px;
      border:1.5px solid #d0d4e0; background:#fff;
      display:flex; align-items:center; justify-content:center;
      cursor:pointer; color:#58607e; transition:background .14s, border-color .14s, color .14s;
    }
    .btnPlus svg { width:15px; height:15px }
    .btnPlus:hover  { background:#eaedf8; border-color:#a8b2d4; color:#1f4fbf }
    .btnPlus.active { background:#1f4fbf; border-color:#1f4fbf; color:#fff }

    /* Textarea */
    textarea {
      flex:1; resize:none; height:34px; min-height:34px; max-height:196px;
      padding:6px 2px; border:none; outline:none; background:transparent;
      font:inherit; font-size:14px; line-height:1.5; color:inherit; overflow-y:auto;
    }
    textarea::placeholder { color:#9ba3bd }

    /* Send button */
    .btnSend {
      flex-shrink:0; width:32px; height:32px; border-radius:9px;
      border:none; display:flex; align-items:center; justify-content:center;
      cursor:pointer; color:#fff; transition:opacity .15s, transform .1s;
    }
    .btnSend svg { width:14px; height:14px }
    .btnSend:disabled { opacity:.3; cursor:not-allowed }
    .btnSend:not(:disabled):hover  { opacity:.86 }
    .btnSend:not(:disabled):active { transform:scale(.93) }

    /* ─ Plus popover ──────────────────────────────────────────────── */
    .popover {
      position:absolute; bottom:calc(100% + 8px); left:0;
      min-width:190px; background:#fff; border:1px solid #dde1ee;
      border-radius:14px; box-shadow:0 10px 30px rgba(0,0,0,.14);
      padding:5px; z-index:200; display:none;
    }
    .popover.vis { display:block }

    .popItem {
      display:flex; align-items:center; gap:10px; padding:9px 12px;
      border-radius:9px; cursor:pointer; font-size:13px; font-weight:500;
      color:#1a1f36; transition:background .12s; user-select:none;
    }
    .popItem:hover { background:#f0f3fc }
    .popItem.sel   { background:#eef1fc; color:#1f4fbf }
    .popItem svg   { width:16px; height:16px; flex-shrink:0; color:inherit }
    .popLabel { flex:1 }
    .popTick  {
      width:17px; height:17px; border-radius:50%; background:#1f4fbf;
      display:none; align-items:center; justify-content:center; flex-shrink:0;
    }
    .popTick::after { content:'✓'; font-size:9.5px; color:#fff; font-weight:700 }
    .popItem.sel .popTick { display:flex }

    /* ─ Footer ────────────────────────────────────────────────────── */
    .footer {
      flex-shrink:0; display:flex; justify-content:space-between; align-items:center;
      padding:4px 14px 8px; font-size:11.5px; opacity:.6;
    }
    .footer a { color:inherit; text-decoration:none }
    .footer a:hover { text-decoration:underline }

    /* ─ Lightbox ──────────────────────────────────────────────────── */
    .lightbox {
      display:none; position:fixed; inset:0; z-index:9999;
      background:rgba(0,0,0,.78); align-items:center; justify-content:center;
    }
    .lightbox.vis { display:flex }
    .lightbox img {
      max-width:92vw; max-height:90vh; border-radius:10px;
      box-shadow:0 24px 64px rgba(0,0,0,.5);
    }
    .lbX {
      position:absolute; top:16px; right:18px; background:rgba(255,255,255,.14);
      border:none; border-radius:50%; width:36px; height:36px; font-size:17px;
      color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center;
      transition:background .14s;
    }
    .lbX:hover { background:rgba(255,255,255,.28) }
  </style>

  <div class="wrap">

    <!-- Header -->
    <header>
      <div class="brand">PerciBOT</div>
      <div class="chip" id="modelChip">AI Assistant</div>
      <div id="dsDrawer"></div>
    </header>

    <!-- Body -->
    <div class="body">
      <div class="panel" id="chat"></div>

      <!-- Composer card + popover -->
      <div class="cWrap">

        <!-- Upward popover -->
        <div class="popover" id="popover">
          <div class="popItem" id="popAttach">
            ${IC.clip}
            <span class="popLabel">Add files</span>
          </div>
          <div class="popItem" id="popWS">
            ${IC.globe}
            <span class="popLabel">Web search</span>
            <span class="popTick"></span>
          </div>
        </div>

        <div class="composer">

          <!-- Shimmer while FileReader loads -->
          <div class="shimRow" id="shimRow">
            <div class="shimBox"></div>
            <span class="shimTxt">Attaching image…</span>
          </div>

          <!-- Active pills (image + web search) -->
          <div class="pills" id="pills"></div>

          <!-- Textarea row -->
          <div class="inputRow">
            <button class="btnPlus" id="btnPlus" title="Add attachment or enable tools">
              ${IC.plus}
            </button>
            <textarea id="input" rows="1"
              placeholder="Ask anything about your analytics…"></textarea>
            <button class="btnSend" id="btnSend" disabled title="Send  (Ctrl+Enter)">
              ${IC.send}
            </button>
          </div>

        </div>
      </div>
    </div><!-- /.body -->

    <!-- Hidden file input -->
    <input type="file" id="fileInput"
           accept="image/jpeg,image/png,image/webp,image/gif"
           style="display:none" aria-hidden="true" />

    <!-- Lightbox -->
    <div class="lightbox" id="lb">
      <button class="lbX" id="lbX">&#x2715;</button>
      <img id="lbImg" src="" alt="Preview" />
    </div>

    <!-- Footer -->
    <div class="footer">
      <span>AI can make mistakes. Please verify results.</span>
      <span><a href="https://www.linkedin.com/company/percipere/" target="_blank" rel="noopener">Percipere Consulting</a></span>
    </div>

  </div>
  `

  // ── Component class ────────────────────────────────────────────────────────
  class PerciBot extends HTMLElement {

    constructor () {
      super()
      this._sr = this.attachShadow({ mode: 'open' })
      this._sr.appendChild(tpl.content.cloneNode(true))
      this.$ = id => this._sr.getElementById(id)

      // ── State ──────────────────────────────────────────────────────
      this._img        = null   // { dataUri, name, mimeType } | null
      this._ws         = false  // web search enabled
      this._popOpen    = false
      this._typingEl   = null

      this._props = {
        apiKey:'', model:'gpt-4o-mini',
        welcomeText: 'Hello, I\u2019m PerciBOT! How can I assist you?',
        datasets:'', primaryColor:'#1f4fbf', primaryDark:'#163a8a',
        surfaceColor:'#ffffff', surfaceAlt:'#f8f9fc', textColor:'#0d1117',
        answerPrompt:'', behaviourPrompt:'', schemaPrompt:'',
        clientId:'', schemaName:'', viewName:'',
      }
      this._datasets = {}
      this._sessionId = (
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
      )

      this._wire()
    }

    // ── SAC lifecycle hooks ──────────────────────────────────────────────────

    connectedCallback () {
      if (!this.$('chat').innerHTML && this._props.welcomeText) this._botMsg(this._props.welcomeText)
      this.$('modelChip').addEventListener('click', () => {
        const d = this.$('dsDrawer')
        d.style.display = d.style.display === 'block' ? 'none' : 'block'
      })
    }

    onCustomWidgetAfterUpdate (p = {}) {
      Object.assign(this._props, p)
      this._applyTheme()
      if (typeof p.datasets === 'string') this._parseDS(p.datasets)
      if (!this.$('chat').innerHTML && this._props.welcomeText) this._botMsg(this._props.welcomeText)
    }

    setProperties (p) { this.onCustomWidgetAfterUpdate(p) }

    onCustomWidgetRequest (method, params) {
      if (method === 'setDatasets') {
        const v = typeof params === 'string' ? params
          : Array.isArray(params) ? (params[0] || '') : (params && params.payload) || ''
        if (v) this._parseDS(v)
      }
    }

    // ── Event wiring ─────────────────────────────────────────────────────────

    _wire () {
      const ta    = this.$('input')
      const send  = this.$('btnSend')
      const plus  = this.$('btnPlus')
      const pop   = this.$('popover')

      // Textarea: auto-resize + send-button state
      ta.addEventListener('input', () => { this._resize(); this._syncSend() })
      ta.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this._send() }
      })

      // Send
      send.addEventListener('click', () => this._send())

      // Plus: toggle popover
      plus.addEventListener('click', e => { e.stopPropagation(); this._togglePop() })

      // Popover items
      this.$('popAttach').addEventListener('click', () => { this._closePop(); this.$('fileInput').click() })
      this.$('popWS').addEventListener('click', () => {
        this._ws = !this._ws
        this.$('popWS').classList.toggle('sel', this._ws)
        this._renderPills()
        this._syncSend()
        this._closePop()
      })

      // File input
      this.$('fileInput').addEventListener('change', e => {
        const f = e.target.files && e.target.files[0]
        if (f) this._loadFile(f)
        e.target.value = ''
      })

      // Paste anywhere in shadow DOM
      this._sr.addEventListener('paste', e => {
        if (!e.clipboardData) return
        const item = Array.from(e.clipboardData.items || []).find(i => i.kind === 'file' && ACCEPTED_IMAGES.includes(i.type))
        if (!item) return
        e.preventDefault()
        const f = item.getAsFile()
        if (f) this._loadFile(f)
      })

      // Close popover on outside click (document level, passive)
      const closePop = () => this._closePop()
      document.addEventListener('click', closePop)
      this._sr.addEventListener('click', e => {
        if (!plus.contains(e.target) && !pop.contains(e.target)) this._closePop()
      })

      // Lightbox close
      this.$('lb').addEventListener('click', e => {
        if (e.target === this.$('lb') || e.target === this.$('lbX')) this._closeLB()
      })
      document.addEventListener('keydown', e => { if (e.key === 'Escape') this._closeLB() })
    }

    // ── Popover ──────────────────────────────────────────────────────────────

    _togglePop () { this._popOpen ? this._closePop() : this._openPop() }

    _openPop () {
      this._popOpen = true
      this.$('popover').classList.add('vis')
      this.$('btnPlus').classList.add('active')
    }

    _closePop () {
      this._popOpen = false
      this.$('popover').classList.remove('vis')
      this.$('btnPlus').classList.remove('active')
    }

    // ── Pills ────────────────────────────────────────────────────────────────

    _renderPills () {
      const c = this.$('pills')
      c.innerHTML = ''
      let any = false

      // Image pill
      if (this._img) {
        any = true
        const p = document.createElement('div')
        p.className = 'pill'
        p.innerHTML = `<img class="pthumb" src="${this._img.dataUri}" alt="img" />
                       <span class="plabel">${this._esc(this._img.name)}</span>
                       <button class="prem" title="Remove">&#x2715;</button>`
        p.querySelector('.pthumb').addEventListener('click', () => this._openLB(this._img.dataUri))
        p.querySelector('.prem').addEventListener('click',  () => { this._img = null; this._renderPills(); this._syncSend() })
        c.appendChild(p)
      }

      // Web search pill
      if (this._ws) {
        any = true
        const p = document.createElement('div')
        p.className = 'pill'
        p.innerHTML = `${IC.globe}<span class="plabel">Web search</span>
                       <button class="prem" title="Remove">&#x2715;</button>`
        p.querySelector('.prem').addEventListener('click', () => {
          this._ws = false
          this.$('popWS').classList.remove('sel')
          this._renderPills()
          this._syncSend()
        })
        c.appendChild(p)
      }

      c.classList.toggle('vis', any)
    }

    // ── File handling ────────────────────────────────────────────────────────

    _loadFile (file) {
      if (!ACCEPTED_IMAGES.includes(file.type)) {
        this._botMsg('\u26a0\ufe0f Unsupported type. Please attach a JPEG, PNG, WEBP, or GIF image.')
        return
      }
      if (file.size > MAX_IMAGE_BYTES) {
        this._botMsg('\u26a0\ufe0f Image exceeds 5 MB. Please use a smaller file.')
        return
      }
      this.$('shimRow').classList.add('vis')
      const r = new FileReader()
      r.onload  = e => { this.$('shimRow').classList.remove('vis'); this._img = { dataUri: e.target.result, name: file.name, mimeType: file.type }; this._renderPills(); this._syncSend() }
      r.onerror = () => { this.$('shimRow').classList.remove('vis'); this._botMsg('\u26a0\ufe0f Failed to read the file. Please try again.') }
      r.readAsDataURL(file)
    }

    // ── Lightbox ─────────────────────────────────────────────────────────────

    _openLB (src) { this.$('lbImg').src = src; this.$('lb').classList.add('vis') }
    _closeLB ()   { this.$('lb').classList.remove('vis'); this.$('lbImg').src = '' }

    // ── Send ─────────────────────────────────────────────────────────────────

    _syncSend () {
      this.$('btnSend').disabled = !(this.$('input').value.trim() || this._img)
    }

    async _send () {
      const q      = (this.$('input').value || '').trim()
      const imgSnap = this._img   ? { ...this._img } : null
      const wsFlag  = this._ws

      if (!q && !imgSnap) return

      // Render user bubble first
      this._userMsg(q, imgSnap)

      // Clear input state
      this.$('input').value = ''
      this._resize()
      this._img = null
      this._renderPills()
      this._syncSend()

      const apiKey = (this._props.apiKey || '').trim()
      if (!apiKey) { this._botMsg('\u26a0\ufe0f API key not configured. Open the Builder panel.'); return }

      this._startTyping()
      this.$('btnSend').disabled = true

      try {
        const payload = {
          query:             q || '(Image attached — please analyse)',
          session_id:        this._sessionId,
          answer_prompt:     this._props.answerPrompt    || '',
          behaviour_prompt:  this._props.behaviourPrompt || '',
          schema_prompt:     this._props.schemaPrompt    || '',
          client_id:         this._props.clientId        || '',
          api_key_encrypted: xorEncrypt(apiKey),
          model:             this._props.model           || 'gpt-4o-mini',
          web_search:        wsFlag,
        }
        if (imgSnap) payload.image_base64 = imgSnap.dataUri
        const sn = (this._props.schemaName || '').trim()
        const vn = (this._props.viewName   || '').trim()
        if (sn && vn) { payload.schema_name = sn; payload.view_name = vn }

        const res = await fetch(`${BACKEND_URL}/presales/ask`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          let d = ''
          try { const e = await res.json(); d = e.detail || e.message || '' } catch (_) {}
          throw new Error(`HTTP ${res.status} ${res.statusText}${d ? ': ' + d : ''}`)
        }

        const data = await res.json()
        this._stopTyping()
        this._botMsg((data.answer && data.answer.trim()) ? data.answer : (data.message || '(No response received)'))

      } catch (err) {
        this._stopTyping()
        this._botMsg(`\u26a0\ufe0f ${err.message}`)
      } finally {
        this._syncSend()
      }
    }

    // ── Message rendering ────────────────────────────────────────────────────

    _userMsg (text, imgSnap) {
      const b = this._bubble('user')
      if (imgSnap) {
        const img = document.createElement('img')
        img.className = 'msgImg'; img.src = imgSnap.dataUri; img.alt = imgSnap.name || 'image'
        img.addEventListener('click', () => this._openLB(imgSnap.dataUri))
        b.appendChild(img)
      }
      if (text) { const s = document.createElement('span'); s.textContent = text; b.appendChild(s) }
      this.$('chat').appendChild(b)
      this._scroll()
    }

    _botMsg (md) {
      const b = this._bubble('bot')
      b.innerHTML = this._renderMd(String(md || ''))
      this.$('chat').appendChild(b)
      this._scroll()
    }

    _bubble (role) {
      const b = document.createElement('div')
      b.className        = `msg ${role}`
      b.style.background = role === 'user' ? '#ddeeff' : '#ffffff'
      b.style.border     = '1px solid #e3e6f0'
      b.style.color      = this._props.textColor || '#0d1117'
      return b
    }

    _startTyping () {
      if (this._typingEl) return
      const b = this._bubble('bot')
      b.classList.add('typing')
      b.innerHTML = `<span style="font-size:12px;opacity:.6">PerciBOT</span><span class="dots"><b></b><b></b><b></b></span>`
      this.$('chat').appendChild(b); this._scroll()
      this._typingEl = b
    }

    _stopTyping () {
      if (this._typingEl && this._typingEl.parentNode) this._typingEl.parentNode.removeChild(this._typingEl)
      this._typingEl = null
    }

    _scroll () { const c = this.$('chat'); c.scrollTop = c.scrollHeight }

    // ── Auto-grow textarea ────────────────────────────────────────────────────

    _resize () {
      const ta = this.$('input')
      ta.style.height = '34px'
      ta.style.height = Math.min(ta.scrollHeight, 196) + 'px'
    }

    // ── Theme ─────────────────────────────────────────────────────────────────

    _applyTheme () {
      const p = this._props, sr = this._sr
      const grad = `linear-gradient(135deg,${p.primaryColor||'#1f4fbf'},${p.primaryDark||'#163a8a'})`
      sr.querySelector('.wrap').style.background       = p.surfaceColor || '#fff'
      sr.querySelector('.wrap').style.color            = p.textColor    || '#0d1117'
      sr.querySelector('.panel').style.background      = p.surfaceAlt   || '#f8f9fc'
      sr.querySelector('header').style.background      = grad
      sr.querySelector('.btnSend').style.background    = grad
    }

    // ── Markdown ──────────────────────────────────────────────────────────────

    _esc (s = '') {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    }

    _mdInline (s) {
      let t = this._esc(s)
      t = t.replace(/`([^`]+)`/g,       '<code>$1</code>')
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      t = t.replace(/\*([^*]+)\*/g,     '<em>$1</em>')
      return t
    }

    _mdTable (block) {
      const rows = block.trim().split('\n').filter(Boolean)
      if (rows.length < 2) return null
      const norm = rows.map(l => l.replace(/^\s*\|\s*/,'').replace(/\s*\|\s*$/,''))
      if (!norm[1].split('|').map(s=>s.trim()).every(c=>/^:?-{3,}:?$/.test(c))) return null
      const cells = l => l.split('|').map(c=>c.trim()).filter(Boolean).map(c=>this._mdInline(c))
      const head  = cells(norm[0]); const body = norm.slice(2).map(cells)
      return `<table><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${body.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    }

    _mdLists (md) {
      const lines = md.split('\n'); const out = []; let ul=false, ol=false
      const flush = () => { if(ul){out.push('</ul>');ul=false} if(ol){out.push('</ol>');ol=false} }
      for (const l of lines) {
        if      (/^\s*[-*]\s+/.test(l))     { if(!ul){flush();out.push('<ul>');ul=true} out.push(`<li>${this._mdInline(l.replace(/^\s*[-*]\s+/,''))}</li>`) }
        else if (/^\s*\d+\.\s+/.test(l))    { if(!ol){flush();out.push('<ol>');ol=true} out.push(`<li>${this._mdInline(l.replace(/^\s*\d+\.\s+/,''))}</li>`) }
        else if (l.trim()==='')             { flush(); out.push('<br/>') }
        else                                { flush(); out.push(`<p>${this._mdInline(l)}</p>`) }
      }
      flush(); return out.join('')
    }

    _renderMd (md = '') {
      return md.split(/\n{2,}/).map(b => this._mdTable(b) || this._mdLists(b)).join('\n')
    }

    // ── Dataset UI ────────────────────────────────────────────────────────────

    _parseDS (jsonStr) {
      try {
        const raw = JSON.parse(jsonStr || '{}') || {}
        const out = {}
        Object.keys(raw).forEach(k => {
          const { schema=[], rows2D=[] } = raw[k] || {}
          out[k] = { schema, rows2D, rows: rows2D.map(a => { const o={}; schema.forEach((c,i)=>o[c]=a[i]); return o }) }
        })
        this._datasets = out
      } catch { this._datasets = {} }
      this._updateDSUI()
    }

    _updateDSUI () {
      const chip  = this.$('modelChip'), drawer = this.$('dsDrawer')
      const items = Object.entries(this._datasets || {})
      if (!items.length) { chip.textContent = 'AI Assistant'; drawer.style.display = 'none'; return }
      const pts = items.map(([k,v]) => `${k}: ${v.rows?.length||0} rows`)
      chip.textContent = pts.length > 2 ? `${pts.slice(0,2).join(' · ')} · +${pts.length-2} more` : pts.join(' · ')
      drawer.innerHTML = items.map(([n,d]) =>
        `<div class="ds"><div class="name">${n}</div><div>${d.rows?.length||0} rows</div><div>${(d.schema||[]).slice(0,10).join(', ')}</div></div>`
      ).join('') || '<div class="ds">No datasets</div>'
    }
  }

  if (!customElements.get('perci-bot')) customElements.define('perci-bot', PerciBot)

}())