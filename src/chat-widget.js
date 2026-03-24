/* PerciBot — SAC Chat Widget
   Sends user queries to the PerciBOT FastAPI backend (/presales/ask).
   API key is XOR+Base64 encrypted before transit — matching backend simple_crypto.py.
   All LLM work is performed server-side; this widget is a pure UI layer.

   Image attachment support (v1.3):
     - Paperclip button opens a file picker (JPEG / PNG / WEBP / GIF, max 5 MB).
     - Paste (Ctrl+V / ⌘+V) anywhere in the widget captures images from clipboard.
     - A preview strip above the textarea shows a thumbnail + remove button.
     - On Send, the image is base64-encoded and included in the JSON payload as
       `image_base64` (data-URI format). The backend field is optional — requests
       without an image behave identically to before.
     - The user message bubble renders the thumbnail inline; clicking opens a
       lightbox for full-size viewing.
     - Only one image per message is supported (last attached wins).
*/
;(function () {

  /**
   * PerciBOT backend endpoint.
   * To redirect the widget to a different deployment, update this value.
   */
  const BACKEND_URL = 'https://percibot.cfapps.us10-001.hana.ondemand.com'

  const CRYPTO_KEY = 'percibot-default-key'

  /** Maximum allowed image size in bytes (5 MB). */
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024

  /** Accepted MIME types for the file picker. */
  const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

  function xorEncrypt (plaintext) {
    const enc   = new TextEncoder()
    const ptB   = enc.encode(plaintext)
    const keyB  = enc.encode(CRYPTO_KEY)
    const xored = ptB.map((b, i) => b ^ keyB[i % keyB.length])
    return btoa(String.fromCharCode(...xored))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  }

  // ---------------------------------------------------------------------------
  // Template
  // ---------------------------------------------------------------------------
  const tpl = document.createElement('template')
  tpl.innerHTML = `
    <style>
      :host { display:block; height:100%; font:14px/1.45 var(--sapFontFamily, "72", Arial); color:#0b1221 }

      /* ── Layout ─────────────────────────────────────────────────── */
      .wrap  { height:100%; display:flex; flex-direction:column; box-sizing:border-box; background:#fff }
      header {
        display:flex; align-items:center; justify-content:space-between;
        padding:10px 14px; color:#fff; border-radius:10px; margin:10px; min-height:42px;
        position:relative;
      }
      .brand { font-weight:700 }
      .chip  { font-size:12px; padding:4px 8px; border-radius:999px; background:rgba(255,255,255,.2); cursor:pointer }
      .body  { flex:1; display:flex; flex-direction:column; gap:10px; padding:10px; min-height:0 }
      .panel {
        flex:1; overflow-y:auto; overflow-x:hidden;
        border:1px solid #e7eaf0; border-radius:12px; padding:10px; background:#f7f9fc; position:relative;
      }

      /* ── Messages ───────────────────────────────────────────────── */
      .msg { max-width:85%; margin:6px 0; padding:10px 12px; border-radius:14px; box-shadow:0 1px 2px rgba(0,0,0,.04) }
      .user { margin-left:auto; }

      .msg.bot p          { margin:6px 0 }
      .msg.bot ul,
      .msg.bot ol         { padding-left:20px; margin:6px 0 }
      .msg.bot li         { margin:4px 0 }
      .msg.bot table      { border-collapse:collapse; width:100%; margin:6px 0 }
      .msg.bot th,
      .msg.bot td         { border:1px solid #e7eaf0; padding:6px 8px; text-align:left }
      .msg.bot thead th   { background:#f3f6ff }
      .msg.bot code       { background:#f1f3f7; padding:2px 4px; border-radius:4px }

      /* Typing indicator */
      .msg.bot.typing { display:inline-flex; align-items:center; gap:8px; position:sticky; bottom:0 }
      .typing .dots   { display:inline-flex; gap:4px }
      .typing .dots span {
        width:6px; height:6px; border-radius:50%; background:#c7ccd8; display:inline-block;
        animation: percibot-blink 1s infinite ease-in-out;
      }
      .typing .dots span:nth-child(2) { animation-delay:.15s }
      .typing .dots span:nth-child(3) { animation-delay:.30s }
      @keyframes percibot-blink {
        0%   { opacity:.2; transform:translateY(0)    }
        20%  { opacity:1;  transform:translateY(-2px) }
        100% { opacity:.2; transform:translateY(0)    }
      }

      /* ── Input area ─────────────────────────────────────────────── */
      .inputWrapper { display:flex; flex-direction:column; gap:6px }

      /* Image preview strip */
      .imgPreview {
        display:none; align-items:center; gap:8px;
        padding:6px 10px; background:#f0f4ff;
        border:1px solid #d0daf7; border-radius:10px;
      }
      .imgPreview.visible { display:flex }
      .imgPreview .thumb  {
        width:48px; height:48px; object-fit:cover; border-radius:6px;
        border:1px solid #c5cee0; cursor:pointer; flex-shrink:0;
      }
      .imgPreview .imgMeta { flex:1; font-size:12px; color:#445; overflow:hidden; white-space:nowrap; text-overflow:ellipsis }
      .imgPreview .imgRemove {
        background:none; border:none; cursor:pointer; padding:4px;
        color:#888; font-size:16px; line-height:1; flex-shrink:0;
        border-radius:6px;
      }
      .imgPreview .imgRemove:hover { background:#fee2e2; color:#b00 }

      /* Loading shimmer inside preview strip */
      .imgLoading {
        display:none; align-items:center; gap:10px;
        padding:8px 12px; background:#f0f4ff;
        border:1px solid #d0daf7; border-radius:10px;
      }
      .imgLoading.visible { display:flex }
      .shimmer {
        width:48px; height:48px; border-radius:6px;
        background: linear-gradient(90deg, #e8ecf7 25%, #d5dcf5 50%, #e8ecf7 75%);
        background-size:200% 100%;
        animation: shimmer 1.2s infinite;
        flex-shrink:0;
      }
      .shimmerText { font-size:12px; color:#667; font-style:italic }
      @keyframes shimmer { 0% { background-position:200% 0 } 100% { background-position:-200% 0 } }

      .inputRow { display:flex; gap:8px; align-items:flex-start }

      textarea {
        flex:1; resize:vertical; min-height:64px; max-height:220px;
        padding:10px 12px; border:1px solid #d0d3da; border-radius:12px; background:#fff; outline:none;
      }
      textarea:focus { border-color:#4d9aff; box-shadow:0 0 0 2px rgba(77,154,255,.15) }

      .inputActions { display:flex; flex-direction:column; gap:8px }

      button { padding:10px 14px; border:1px solid #d0d3da; border-radius:12px; background:#fff; cursor:pointer }
      button.primary { color:#fff; border-color:transparent }
      button:disabled { opacity:.5; cursor:not-allowed }

      /* Paperclip attach button */
      .btnAttach {
        width:40px; height:40px; padding:0;
        display:flex; align-items:center; justify-content:center;
        border:1px solid #d0d3da; border-radius:12px; background:#fff;
        cursor:pointer; flex-shrink:0; transition:background .15s, border-color .15s;
      }
      .btnAttach:hover  { background:#f0f4ff; border-color:#a0b4e8 }
      .btnAttach svg    { width:18px; height:18px; stroke:#556; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round }
      .btnAttach.active { background:#e8eeff; border-color:#4d6ed4 }
      .btnAttach.active svg { stroke:#1f4fbf }

      /* Image in user bubble */
      .msgImg {
        display:block; max-width:100%; max-height:180px; object-fit:cover;
        border-radius:8px; margin-bottom:6px; cursor:pointer;
        border:1px solid rgba(0,0,0,.08);
        transition: opacity .15s;
      }
      .msgImg:hover { opacity:.85 }

      /* Lightbox */
      .lightbox {
        display:none; position:fixed; inset:0; z-index:9999;
        background:rgba(0,0,0,.72); align-items:center; justify-content:center;
      }
      .lightbox.open { display:flex }
      .lightbox img  { max-width:90vw; max-height:90vh; border-radius:10px; box-shadow:0 20px 60px rgba(0,0,0,.5) }
      .lightbox .lbClose {
        position:absolute; top:18px; right:22px;
        background:rgba(255,255,255,.15); border:none; border-radius:50%;
        width:36px; height:36px; font-size:20px; color:#fff;
        cursor:pointer; display:flex; align-items:center; justify-content:center;
      }
      .lightbox .lbClose:hover { background:rgba(255,255,255,.3) }

      /* Misc */
      .muted  { opacity:.7; font-size:12px }
      .footer { display:flex; justify-content:space-between; align-items:center; padding:0 10px 10px }

      #dsDrawer {
        position:absolute; right:14px; top:58px; z-index:10;
        max-width:420px; max-height:240px; overflow:auto;
        background:#fff; border:1px solid #e7eaf0; border-radius:10px;
        box-shadow:0 12px 28px rgba(0,0,0,.12); padding:10px; font-size:12px; display:none;
      }
      #dsDrawer .ds         { padding:6px 4px; border-bottom:1px dashed #eee }
      #dsDrawer .ds:last-child { border-bottom:none }
      #dsDrawer .name       { font-weight:700 }
    </style>

    <div class="wrap">
      <header>
        <div class="brand">PerciBOT</div>
        <div class="chip" id="modelChip">AI Assistant</div>
        <div id="dsDrawer"></div>
      </header>

      <div class="body">
        <div class="panel" id="chat"></div>

        <div class="inputWrapper">
          <!-- Loading shimmer (shown while FileReader processes the image) -->
          <div class="imgLoading" id="imgLoading">
            <div class="shimmer"></div>
            <span class="shimmerText">Attaching image…</span>
          </div>

          <!-- Attached image preview strip -->
          <div class="imgPreview" id="imgPreview">
            <img class="thumb" id="previewThumb" src="" alt="preview" />
            <span class="imgMeta" id="previewMeta"></span>
            <button class="imgRemove" id="imgRemove" title="Remove image">&#x2715;</button>
          </div>

          <!-- Input row: textarea + action buttons -->
          <div class="inputRow">
            <textarea id="input" placeholder="Ask anything about your analytics\u2026"></textarea>
            <div class="inputActions">
              <button id="send" class="primary">Send</button>
              <button id="clear">Clear</button>
              <!-- Paperclip: attach image -->
              <button class="btnAttach" id="btnAttach" title="Attach image (JPEG / PNG / WEBP / GIF, max 5 MB)">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Hidden file input — triggered programmatically -->
      <input type="file" id="fileInput" accept="image/jpeg,image/png,image/webp,image/gif"
             style="display:none" aria-hidden="true" />

      <!-- Lightbox overlay for full-size image viewing -->
      <div class="lightbox" id="lightbox">
        <button class="lbClose" id="lbClose" title="Close">&#x2715;</button>
        <img id="lbImg" src="" alt="Full size preview" />
      </div>

      <div class="footer">
        <div class="muted" id="hint">AI can make mistakes. Please verify results.</div>
        <div class="muted"><a href="https://www.linkedin.com/company/percipere/" target="_blank">Percipere Consulting</a></div>
      </div>
    </div>
  `

  // ---------------------------------------------------------------------------
  // Component
  // ---------------------------------------------------------------------------
  class PerciBot extends HTMLElement {
    constructor () {
      super()
      this._shadowRoot = this.attachShadow({ mode: 'open' })
      this._shadowRoot.appendChild(tpl.content.cloneNode(true))
      this.$ = id => this._shadowRoot.getElementById(id)

      this.$chat      = this.$('chat')
      this.$input     = this.$('input')
      this.$send      = this.$('send')
      this.$clear     = this.$('clear')
      this.$modelChip = this.$('modelChip')

      // Image attachment state
      this._attachedImage = null  // { dataUri: string, name: string, mimeType: string } | null

      this._bindEvents()

      this._props = {
        apiKey:          '',
        model:           'gpt-4o-mini',
        welcomeText:     'Hello, I\u2019m PerciBOT! How can I assist you?',
        datasets:        '',
        primaryColor:    '#1f4fbf',
        primaryDark:     '#163a8a',
        surfaceColor:    '#ffffff',
        surfaceAlt:      '#f6f8ff',
        textColor:       '#0b1221',
        answerPrompt:    '',
        behaviourPrompt: '',
        schemaPrompt:    '',
        clientId:        '',
        schemaName:      '',
        viewName:        '',
      }

      this._datasets = {}

      this._sessionId = (
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
      )
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    connectedCallback () {
      if (!this.$chat.innerHTML && this._props.welcomeText) {
        this._append('bot', this._props.welcomeText)
      }
      this.$modelChip.addEventListener('click', () => {
        const d = this._shadowRoot.getElementById('dsDrawer')
        d.style.display = d.style.display === 'block' ? 'none' : 'block'
      })
    }

    onCustomWidgetAfterUpdate (changedProps = {}) {
      Object.assign(this._props, changedProps)
      this._applyTheme()
      if (typeof changedProps.datasets === 'string') this._parseAndApplyDatasets(changedProps.datasets)
      if (!this.$chat.innerHTML && this._props.welcomeText) this._append('bot', this._props.welcomeText)
    }

    setProperties (props) { this.onCustomWidgetAfterUpdate(props) }

    onCustomWidgetRequest (methodName, params) {
      if (methodName === 'setDatasets') {
        const payload = typeof params === 'string' ? params
          : Array.isArray(params) ? (params[0] || '')
          : (params && params.payload) || ''
        if (payload) this._parseAndApplyDatasets(payload)
      }
    }

    // -------------------------------------------------------------------------
    // Event wiring
    // -------------------------------------------------------------------------

    _bindEvents () {
      this.$send .addEventListener('click', () => this._send())
      this.$clear.addEventListener('click', () => {
        this.$chat.innerHTML = ''
        this._clearAttachment()
      })

      // Paperclip → open file picker
      this.$('btnAttach').addEventListener('click', () => this.$('fileInput').click())

      // File picker selection
      this.$('fileInput').addEventListener('change', e => {
        const file = e.target.files && e.target.files[0]
        if (file) this._handleImageFile(file)
        // Reset so the same file can be re-selected if removed and re-added
        e.target.value = ''
      })

      // Remove attachment
      this.$('imgRemove').addEventListener('click', () => this._clearAttachment())

      // Paste support — capture images pasted anywhere within the widget
      this._shadowRoot.addEventListener('paste', e => this._handlePaste(e))

      // Lightbox controls
      this.$('lightbox').addEventListener('click', e => {
        if (e.target === this.$('lightbox') || e.target === this.$('lbClose')) {
          this._closeLightbox()
        }
      })
      this.$('lbClose').addEventListener('click', () => this._closeLightbox())

      // Close lightbox on Escape
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') this._closeLightbox()
      })
    }

    // -------------------------------------------------------------------------
    // Image handling
    // -------------------------------------------------------------------------

    /**
     * Validate and read a File object via FileReader, then show the preview.
     * @param {File} file
     */
    _handleImageFile (file) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        this._append('bot', '\u26a0\ufe0f Unsupported file type. Please attach a JPEG, PNG, WEBP, or GIF image.')
        return
      }
      if (file.size > MAX_IMAGE_BYTES) {
        this._append('bot', '\u26a0\ufe0f Image exceeds the 5 MB limit. Please attach a smaller file.')
        return
      }

      this._showLoadingShimmer(true)

      const reader = new FileReader()
      reader.onload = e => {
        this._showLoadingShimmer(false)
        this._setAttachment(e.target.result, file.name, file.type)
      }
      reader.onerror = () => {
        this._showLoadingShimmer(false)
        this._append('bot', '\u26a0\ufe0f Failed to read the image file. Please try again.')
      }
      reader.readAsDataURL(file)
    }

    /**
     * Handle a paste event, extracting any image item from the clipboard.
     * @param {ClipboardEvent} e
     */
    _handlePaste (e) {
      if (!e.clipboardData) return
      const items = Array.from(e.clipboardData.items || [])
      const imgItem = items.find(it => it.kind === 'file' && ACCEPTED_IMAGE_TYPES.includes(it.type))
      if (!imgItem) return
      // Prevent browser default paste-as-text behaviour for the image blob
      e.preventDefault()
      const file = imgItem.getAsFile()
      if (file) this._handleImageFile(file)
    }

    /**
     * Store the resolved attachment and render the preview strip.
     * @param {string} dataUri  - Full data-URI from FileReader
     * @param {string} name     - Original file name
     * @param {string} mimeType
     */
    _setAttachment (dataUri, name, mimeType) {
      this._attachedImage = { dataUri, name, mimeType }

      // Update preview strip
      const thumb = this.$('previewThumb')
      thumb.src = dataUri
      this.$('previewMeta').textContent = name
      this.$('imgPreview').classList.add('visible')
      this.$('btnAttach').classList.add('active')

      // Allow click on preview thumbnail to open lightbox
      thumb.onclick = () => this._openLightbox(dataUri)
    }

    /** Remove the current attachment and reset all preview UI. */
    _clearAttachment () {
      this._attachedImage = null
      this.$('imgPreview').classList.remove('visible')
      this.$('previewThumb').src = ''
      this.$('previewMeta').textContent = ''
      this.$('previewThumb').onclick = null
      this.$('btnAttach').classList.remove('active')
    }

    _showLoadingShimmer (visible) {
      this.$('imgLoading').classList.toggle('visible', visible)
    }

    // -------------------------------------------------------------------------
    // Lightbox
    // -------------------------------------------------------------------------

    _openLightbox (src) {
      this.$('lbImg').src = src
      this.$('lightbox').classList.add('open')
    }

    _closeLightbox () {
      this.$('lightbox').classList.remove('open')
      this.$('lbImg').src = ''
    }

    // -------------------------------------------------------------------------
    // Send
    // -------------------------------------------------------------------------

    async _send () {
      const q         = (this.$input.value || '').trim()
      const hasImage  = !!this._attachedImage
      const hasText   = q.length > 0

      // Require at least one of: text or image
      if (!hasText && !hasImage) return

      // Snapshot and clear the attachment before the async gap
      const imageSnap = this._attachedImage ? { ...this._attachedImage } : null

      // Render user bubble (image + text)
      this._appendUserMessage(q, imageSnap)
      this.$input.value = ''
      this._clearAttachment()

      const apiKey = (this._props.apiKey || '').trim()
      if (!apiKey) {
        this._append('bot', '\u26a0\ufe0f API key not configured. Open the Builder panel.')
        return
      }

      this._startTyping()
      this.$send.disabled = true

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
        }

        if (imageSnap) {
          // Send only the data-URI — the backend extracts the base64 payload
          payload.image_base64 = imageSnap.dataUri
        }

        const schemaName = (this._props.schemaName || '').trim()
        const viewName   = (this._props.viewName   || '').trim()
        if (schemaName && viewName) {
          payload.schema_name = schemaName
          payload.view_name   = viewName
        }

        const res = await fetch(`${BACKEND_URL}/presales/ask`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        })

        if (!res.ok) {
          let detail = ''
          try { const e = await res.json(); detail = e.detail || e.message || '' } catch (_) {}
          throw new Error(`HTTP ${res.status} ${res.statusText}${detail ? ': ' + detail : ''}`)
        }

        const data    = await res.json()
        const display = (data.answer && data.answer.trim())
          ? data.answer
          : (data.message || '(No response received from backend)')

        this._stopTyping()
        this._append('bot', display)

      } catch (e) {
        this._stopTyping()
        this._append('bot', `\u26a0\ufe0f ${e.message}`)
      } finally {
        this.$send.disabled = false
      }
    }

    // -------------------------------------------------------------------------
    // Rendering helpers
    // -------------------------------------------------------------------------

    /**
     * Render a user message bubble that may include an image thumbnail.
     * @param {string} text
     * @param {{ dataUri:string, name:string }|null} imageSnap
     */
    _appendUserMessage (text, imageSnap) {
      const b = document.createElement('div')
      b.className        = 'msg user'
      b.style.background = '#97cdf2ff'
      b.style.border     = '1px solid #e7eaf0'
      b.style.color      = this._props.textColor || '#0b1221'

      if (imageSnap) {
        const img = document.createElement('img')
        img.className = 'msgImg'
        img.src       = imageSnap.dataUri
        img.alt       = imageSnap.name || 'Attached image'
        img.addEventListener('click', () => this._openLightbox(imageSnap.dataUri))
        b.appendChild(img)
      }

      if (text) {
        const t = document.createElement('div')
        t.textContent = text
        b.appendChild(t)
      }

      this.$chat.appendChild(b)
      this.$chat.scrollTop = this.$chat.scrollHeight
    }

    _append (role, text) {
      const b = document.createElement('div')
      b.className        = `msg ${role === 'user' ? 'user' : 'bot'}`
      b.style.background = role === 'user' ? '#97cdf2ff' : '#ffffff'
      b.style.border     = '1px solid #e7eaf0'
      b.style.color      = this._props.textColor || '#0b1221'

      if (role === 'user') {
        b.textContent = text
      } else {
        b.innerHTML = this._renderMarkdown(String(text || ''))
      }

      this.$chat.appendChild(b)
      this.$chat.scrollTop = this.$chat.scrollHeight
    }

    _startTyping () {
      if (this._typingEl) return
      const b = document.createElement('div')
      b.className        = 'msg bot typing'
      b.style.background = '#ffffff'
      b.style.border     = '1px solid #e7eaf0'
      b.style.color      = this._props.textColor || '#0b1221'
      b.innerHTML        = `<span class="muted">PerciBOT</span><span class="dots"><span></span><span></span><span></span></span>`
      this.$chat.appendChild(b)
      this.$chat.scrollTop = this.$chat.scrollHeight
      this._typingEl = b
    }

    _stopTyping () {
      if (this._typingEl && this._typingEl.parentNode) this._typingEl.parentNode.removeChild(this._typingEl)
      this._typingEl = null
    }

    // -------------------------------------------------------------------------
    // Markdown renderer (unchanged)
    // -------------------------------------------------------------------------

    _escapeHtml (s = '') {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    }

    _mdInline (s) {
      let t = this._escapeHtml(s)
      t = t.replace(/`([^`]+)`/g,       '<code>$1</code>')
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      t = t.replace(/\*([^*]+)\*/g,     '<em>$1</em>')
      return t
    }

    _mdTable (block) {
      const raw  = block.trim().split('\n').filter(Boolean)
      if (raw.length < 2) return null
      const norm = raw.map(l => l.replace(/^\s*\|\s*/,'').replace(/\s*\|\s*$/,''))
      const sep  = norm[1].split('|').map(s => s.trim())
      if (!sep.every(c => /^:?-{3,}:?$/.test(c))) return null
      const toCells = l => l.split('|').map(c => c.trim()).filter(c => c.length).map(c => this._mdInline(c))
      const head = toCells(norm[0])
      const rows = norm.slice(2).map(toCells)
      return `<table><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    }

    _mdLists (md) {
      const lines = md.split('\n'); const out = []; let inUl = false, inOl = false
      const flush = () => {
        if (inUl) { out.push('</ul>'); inUl = false }
        if (inOl) { out.push('</ol>'); inOl = false }
      }
      for (const line of lines) {
        if      (/^\s*[-*]\s+/.test(line))       { if (!inUl) { flush(); out.push('<ul>'); inUl = true } out.push(`<li>${this._mdInline(line.replace(/^\s*[-*]\s+/,''))}</li>`) }
        else if (/^\s*\d+\.\s+/.test(line))      { if (!inOl) { flush(); out.push('<ol>'); inOl = true } out.push(`<li>${this._mdInline(line.replace(/^\s*\d+\.\s+/,''))}</li>`) }
        else if (line.trim() === '')              { flush(); out.push('<br/>') }
        else                                      { flush(); out.push(`<p>${this._mdInline(line)}</p>`) }
      }
      flush()
      return out.join('')
    }

    _renderMarkdown (md = '') {
      return md.split(/\n{2,}/).map(b => { const t = this._mdTable(b); return t || this._mdLists(b) }).join('\n')
    }

    // -------------------------------------------------------------------------
    // Theme
    // -------------------------------------------------------------------------

    _applyTheme () {
      const wrap    = this._shadowRoot.querySelector('.wrap')
      const header  = this._shadowRoot.querySelector('header')
      const panel   = this._shadowRoot.querySelector('.panel')
      const buttons = this._shadowRoot.querySelectorAll('button.primary')
      wrap.style.background   = this._props.surfaceColor || '#ffffff'
      wrap.style.color        = this._props.textColor    || '#0b1221'
      panel.style.background  = this._props.surfaceAlt   || '#f6f8ff'
      header.style.background = `linear-gradient(90deg, ${this._props.primaryColor || '#1f4fbf'}, ${this._props.primaryDark || '#163a8a'})`
      buttons.forEach(btn => {
        btn.style.background = `linear-gradient(90deg, ${this._props.primaryColor || '#1f4fbf'}, ${this._props.primaryDark || '#163a8a'})`
      })
    }

    // -------------------------------------------------------------------------
    // Datasets UI (unchanged)
    // -------------------------------------------------------------------------

    _parseAndApplyDatasets (jsonStr) {
      try {
        const raw     = JSON.parse(jsonStr || '{}') || {}
        const rebuilt = {}
        Object.keys(raw).forEach(name => {
          const { schema = [], rows2D = [] } = raw[name] || {}
          const rows = rows2D.map(arr => {
            const o = {}; for (let i = 0; i < schema.length; i++) o[schema[i]] = arr[i]; return o
          })
          rebuilt[name] = { schema, rows, rows2D }
        })
        this._datasets = rebuilt
        this._updateDatasetsUI()
      } catch (_e) {
        this._datasets = {}
        this._updateDatasetsUI()
      }
    }

    _updateDatasetsUI () {
      const chip   = this.$modelChip
      const drawer = this._shadowRoot.getElementById('dsDrawer')
      const entries = Object.entries(this._datasets || {})
      if (!entries.length) { chip.textContent = 'AI Assistant'; drawer.style.display = 'none'; return }

      const parts = entries.map(([k, v]) => `${k}: ${v.rows?.length || 0} rows`)
      chip.textContent = parts.length > 2
        ? `${parts.slice(0, 2).join(' \u00b7 ')} \u00b7 +${parts.length - 2} more`
        : parts.join(' \u00b7 ')

      drawer.innerHTML = entries.map(([name, ds]) => {
        const cols = (ds.schema || []).slice(0, 12).join(', ')
        return `<div class="ds"><div class="name">${name}</div><div>${ds.rows?.length || 0} rows</div><div>${cols}</div></div>`
      }).join('') || '<div class="ds">No datasets</div>'
    }
  }

  if (!customElements.get('perci-bot')) {
    customElements.define('perci-bot', PerciBot)
  }
}())