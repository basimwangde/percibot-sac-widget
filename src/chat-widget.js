/* PerciBot — SAC Chat Widget
   Sends user queries to the PerciBOT FastAPI backend (/presales/ask).
   API key is XOR+Base64 encrypted before transit — matching backend simple_crypto.py.
   All LLM work is performed server-side; this widget is a pure UI layer.
*/
;(function () {

  /**
   * PerciBOT backend endpoint.
   * To redirect the widget to a different deployment, update this value.
   */
  const BACKEND_URL = 'https://percibot.cfapps.us10-001.hana.ondemand.com'

  const CRYPTO_KEY = 'percibot-default-key'

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

  const tpl = document.createElement('template')
  tpl.innerHTML = `
    <style>
      :host { display:block; height:100%; font:14px/1.45 var(--sapFontFamily, "72", Arial); color:#0b1221 }
      .wrap{height:100%; display:flex; flex-direction:column; box-sizing:border-box; background:#fff}
      header{
        display:flex; align-items:center; justify-content:space-between; padding:10px 14px;
        color:#fff; border-radius:10px; margin:10px; min-height:42px;
      }
      .brand{font-weight:700}
      .chip{font-size:12px; padding:4px 8px; border-radius:999px; background:rgba(255,255,255,.2); cursor:pointer}
      .body{flex:1; display:flex; flex-direction:column; gap:10px; padding:10px; min-height:0}
      .panel{
        flex:1; overflow-y:auto; overflow-x:hidden;
        border:1px solid #e7eaf0; border-radius:12px; padding:10px; background:#f7f9fc; position:relative;
      }
      .msg{max-width:85%; margin:6px 0; padding:10px 12px; border-radius:14px; box-shadow:0 1px 2px rgba(0,0,0,.04)}
      .user{ margin-left:auto; }
      .inputRow{ display:flex; gap:8px; align-items:flex-start }
      textarea{
        flex:1; resize:vertical; min-height:64px; max-height:220px;
        padding:10px 12px; border:1px solid #d0d3da; border-radius:12px; background:#fff; outline:none;
      }
      textarea:focus{ border-color:#4d9aff; box-shadow:0 0 0 2px rgba(77,154,255,.15) }
      button{ padding:10px 14px; border:1px solid #d0d3da; border-radius:12px; background:#fff; cursor:pointer }
      button.primary{ color:#fff; border-color:transparent }
      button:disabled{ opacity:.5; cursor:not-allowed }
      .muted{opacity:.7; font-size:12px}
      .footer{display:flex; justify-content:space-between; align-items:center; padding:0 10px 10px}

      .msg.bot p { margin: 6px 0; }
      .msg.bot ul, .msg.bot ol { padding-left: 20px; margin: 6px 0; }
      .msg.bot li { margin: 4px 0; }
      .msg.bot table { border-collapse: collapse; width: 100%; margin: 6px 0; }
      .msg.bot th, .msg.bot td { border: 1px solid #e7eaf0; padding: 6px 8px; text-align: left; }
      .msg.bot thead th { background: #f3f6ff; }
      .msg.bot code { background:#f1f3f7; padding:2px 4px; border-radius:4px; }

      .msg.bot.typing{ display:inline-flex; align-items:center; gap:8px; position:sticky; bottom:0; }
      .typing .dots{ display:inline-flex; gap:4px; }
      .typing .dots span{
        width:6px; height:6px; border-radius:50%; background:#c7ccd8; display:inline-block;
        animation: percibot-blink 1s infinite ease-in-out;
      }
      .typing .dots span:nth-child(2){ animation-delay:.15s }
      .typing .dots span:nth-child(3){ animation-delay:.30s }
      @keyframes percibot-blink{
        0%{ opacity:.2; transform:translateY(0) }
        20%{ opacity:1;  transform:translateY(-2px) }
        100%{ opacity:.2; transform:translateY(0) }
      }

      header{ position:relative; }
      #dsDrawer{
        position:absolute; right:14px; top:58px; z-index:10;
        max-width:420px; max-height:240px; overflow:auto;
        background:#fff; border:1px solid #e7eaf0; border-radius:10px;
        box-shadow:0 12px 28px rgba(0,0,0,.12); padding:10px; font-size:12px; display:none;
      }
      #dsDrawer .ds{ padding:6px 4px; border-bottom:1px dashed #eee; }
      #dsDrawer .ds:last-child{ border-bottom:none; }
      #dsDrawer .name{ font-weight:700; }
    </style>

    <div class="wrap">
      <header>
        <div class="brand">PerciBOT</div>
        <div class="chip" id="modelChip">AI Assistant</div>
        <div id="dsDrawer"></div>
      </header>

      <div class="body">
        <div class="panel" id="chat"></div>
        <div class="inputRow">
          <textarea id="input" placeholder="Ask anything about your analytics\u2026"></textarea>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <button id="send" class="primary">Send</button>
            <button id="clear">Clear</button>
          </div>
        </div>
      </div>

      <div class="footer">
        <div class="muted" id="hint">AI can make mistakes. Please verify results.</div>
        <div class="muted"><a href="https://www.linkedin.com/company/percipere/" target="_blank">Percipere Consulting</a></div>
      </div>
    </div>
  `

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

      this.$send.addEventListener('click',  () => this._send())
      this.$clear.addEventListener('click', () => (this.$chat.innerHTML = ''))

      // backendUrl intentionally absent — hardcoded as BACKEND_URL
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

      if (typeof changedProps.datasets === 'string') {
        this._parseAndApplyDatasets(changedProps.datasets)
      }

      if (!this.$chat.innerHTML && this._props.welcomeText) {
        this._append('bot', this._props.welcomeText)
      }
    }

    setProperties (props) { this.onCustomWidgetAfterUpdate(props) }

    onCustomWidgetRequest (methodName, params) {
      if (methodName === 'setDatasets') {
        let payload = typeof params === 'string' ? params
          : Array.isArray(params) ? (params[0] || '')
          : (params && params.payload) || ''
        if (payload) this._parseAndApplyDatasets(payload)
      }
    }

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
      const chip    = this.$modelChip
      const drawer  = this._shadowRoot.getElementById('dsDrawer')
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

    async _send () {
      const q = (this.$input.value || '').trim()
      if (!q) return

      this._append('user', q)
      this.$input.value = ''

      const apiKey = (this._props.apiKey || '').trim()
      if (!apiKey) {
        this._append('bot', '\u26a0\ufe0f API key not configured. Open the Builder panel.')
        return
      }

      this._startTyping()
      this.$send.disabled = true

      try {
        const payload = {
          query:             q,
          session_id:        this._sessionId,
          answer_prompt:     this._props.answerPrompt    || '',
          behaviour_prompt:  this._props.behaviourPrompt || '',
          schema_prompt:     this._props.schemaPrompt    || '',
          client_id:         this._props.clientId        || '',
          api_key_encrypted: xorEncrypt(apiKey),
          model:             this._props.model           || 'gpt-4o-mini',
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
      const flush = () => { if (inUl){out.push('</ul>');inUl=false} if(inOl){out.push('</ol>');inOl=false} }
      for (const line of lines) {
        if (/^\s*[-*]\s+/.test(line))        { if(!inUl){flush();out.push('<ul>');inUl=true} out.push(`<li>${this._mdInline(line.replace(/^\s*[-*]\s+/,''))}</li>`) }
        else if (/^\s*\d+\.\s+/.test(line))  { if(!inOl){flush();out.push('<ol>');inOl=true} out.push(`<li>${this._mdInline(line.replace(/^\s*\d+\.\s+/,''))}</li>`) }
        else if (line.trim() === '')          { flush(); out.push('<br/>') }
        else                                  { flush(); out.push(`<p>${this._mdInline(line)}</p>`) }
      }
      flush(); return out.join('')
    }

    _renderMarkdown (md = '') {
      return md.split(/\n{2,}/).map(b => { const t = this._mdTable(b); return t || this._mdLists(b) }).join('\n')
    }

    _append (role, text) {
      const b = document.createElement('div')
      b.className = `msg ${role === 'user' ? 'user' : 'bot'}`
      if (role === 'user') { b.textContent = text } else { b.innerHTML = this._renderMarkdown(String(text || '')) }
      b.style.background = role === 'user' ? '#97cdf2ff' : '#ffffff'
      b.style.border     = '1px solid #e7eaf0'
      b.style.color      = this._props.textColor || '#0b1221'
      this.$chat.appendChild(b)
      this.$chat.scrollTop = this.$chat.scrollHeight
    }

    _startTyping () {
      if (this._typingEl) return
      const b = document.createElement('div')
      b.className = 'msg bot typing'
      b.innerHTML = `<span class="muted">PerciBOT</span><span class="dots"><span></span><span></span><span></span></span>`
      b.style.background = '#ffffff'; b.style.border = '1px solid #e7eaf0'
      b.style.color      = this._props.textColor || '#0b1221'
      this.$chat.appendChild(b); this.$chat.scrollTop = this.$chat.scrollHeight
      this._typingEl = b
    }

    _stopTyping () {
      if (this._typingEl && this._typingEl.parentNode) this._typingEl.parentNode.removeChild(this._typingEl)
      this._typingEl = null
    }
  }

  if (!customElements.get('perci-bot')) {
    customElements.define('perci-bot', PerciBot)
  }
}())