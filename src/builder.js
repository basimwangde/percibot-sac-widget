/* PerciBot — Builder Panel
   Sections: Connection | Prompts | Theme
   Test Connection checks both OpenAI API and HANA view existence.
*/
(function () {

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
      :host{display:block; font:14px/1.5 var(--sapFontFamily,"72",Arial); color:var(--sapTextColor,#0b1221)}
      .panel{padding:14px 16px}
      .section{margin:14px 0 18px}
      .title{font-weight:700; font-size:13px; letter-spacing:.2px; text-transform:uppercase; opacity:.7; margin:6px 0 10px}
      .grid{display:grid; grid-template-columns:1fr 1fr; gap:12px}
      .f{display:flex; flex-direction:column; gap:6px}
      label{font-weight:600}
      input, select, textarea{
        width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid var(--sapList_BorderColor,#d0d3da);
        border-radius:8px; background:#fff; outline:none;
      }
      input:focus, select:focus, textarea:focus{border-color:#4d9aff; box-shadow:0 0 0 2px rgba(77,154,255,.15)}
      input[type="color"]{ padding:6px; height:40px }
      textarea{resize:vertical}
      textarea.prompt{min-height:120px}
      .hint{font-size:12px; opacity:.65}
      .toolbar{display:flex; justify-content:flex-end; align-items:center; gap:10px; margin-top:16px; padding-top:12px; border-top:1px solid #e7eaf0}
      button{ padding:10px 14px; border:1px solid #d0d3da; border-radius:10px; background:#fff; cursor:pointer; font-size:13px }
      button[disabled]{opacity:.5; cursor:not-allowed}
      .primary{ background:#1f4fbf; color:#fff; border-color:#1f4fbf }
      .btn-test{ padding:8px 12px; font-size:12px; border-radius:8px; white-space:nowrap; align-self:flex-start }
      .chip{display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px; background:#f5f7fb; border:1px solid #e7eaf0; font-size:12px}
      .keywrap{position:relative}
      .reveal{ position:absolute; right:8px; top:50%; transform:translateY(-50%); background:transparent; border:none; cursor:pointer; opacity:.7; font-size:12px; padding:4px }
      .conn-status{ font-size:12px; font-weight:600; padding:4px 8px; border-radius:6px; display:none }
      .conn-status.ok       { display:inline-block; background:#d1fae5; color:#065f46 }
      .conn-status.err      { display:inline-block; background:#fee2e2; color:#991b1b }
      .conn-status.checking { display:inline-block; background:#fef3c7; color:#92400e }
      .conn-detail{
        display:none; margin-top:8px; padding:10px 12px;
        border:1px solid #e7eaf0; border-radius:8px; background:#f9fafb;
        font-size:12px; line-height:1.6;
      }
      .conn-detail.show{ display:block }
      .conn-detail .row{ display:flex; gap:6px; align-items:flex-start }
      .conn-detail .lbl{ font-weight:700; min-width:60px }
      .conn-detail .ok-val  { color:#065f46 }
      .conn-detail .err-val { color:#991b1b }
      .conn-detail .skip-val{ color:#6b7280 }
      .palettes{display:grid; grid-template-columns:repeat(3,1fr); gap:10px}
      .pal-card{display:flex; align-items:center; gap:10px; padding:10px; border:1px solid #e7eaf0; border-radius:10px; cursor:pointer; background:#fff}
      .pal-s{width:18px; height:18px; border-radius:4px; border:1px solid #d0d3da}
      .pal-sw{display:flex; gap:4px}
      .pal-name{font-size:12px; opacity:.8; margin-left:auto}
      .pal-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.06)}
      .toast{
        position:fixed; right:18px; bottom:18px; padding:10px 14px; background:#0b8a3e; color:#fff;
        border-radius:10px; box-shadow:0 6px 18px rgba(0,0,0,.12); opacity:0; transform:translateY(8px);
        transition:all .25s ease
      }
      .toast.show{opacity:1; transform:translateY(0)}
      .divider{border:none; border-top:1px solid #e7eaf0; margin:18px 0}
      .danger{color:#b00020; font-size:12px}
    </style>

    <div class="panel">

      <!-- ════════════════════════════════════════
           SECTION 1 — Connection
           ════════════════════════════════════════ -->
      <div class="section">
        <div class="title">Connection</div>

        <!-- API Key -->
        <div class="f keywrap" style="margin-bottom:12px">
          <label>OpenAI API Key</label>
          <input id="apiKey" type="password" placeholder="sk-..." />
          <button class="reveal" id="toggleKey" tabindex="-1">Show</button>
          <div class="hint">Stored with the story — never sent to any third party directly.</div>
        </div>

        <!-- Model + Welcome Text -->
        <div class="grid" style="margin-bottom:12px">
          <div class="f">
            <label>Model</label>
            <select id="model">
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="gpt-4o">gpt-4o</option>
              <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
            </select>
          </div>
          <div class="f">
            <label>Welcome Text</label>
            <input id="welcomeText" type="text" placeholder="Hello, I'm PerciBOT!" />
          </div>
        </div>

        <!-- Schema Name + View Name -->
        <div class="grid" style="margin-bottom:12px">
          <div class="f">
            <label>Schema Name</label>
            <input id="schemaName" type="text" placeholder="e.g. DEMO" />
            <div class="hint">HANA schema containing the target view.</div>
          </div>
          <div class="f">
            <label>View Name</label>
            <input id="viewName" type="text" placeholder="e.g. VW_FINANCIAL_DATA" />
            <div class="hint">View to validate on Test Connection.</div>
          </div>
        </div>

        <!-- Test Connection -->
        <div class="f">
          <button id="testConnBtn" class="btn-test">Test Connection</button>
          <span id="connStatus" class="conn-status"></span>
          <div id="connDetail" class="conn-detail">
            <div class="row">
              <span class="lbl">OpenAI</span>
              <span id="cdOpenai"></span>
            </div>
            <div class="row">
              <span class="lbl">HANA</span>
              <span id="cdHana"></span>
            </div>
          </div>
        </div>
      </div>

      <hr class="divider" />

      <!-- ════════════════════════════════════════
           SECTION 2 — Prompts
           ════════════════════════════════════════ -->
      <div class="section">
        <div class="title">Prompts</div>

        <!-- Client ID -->
        <div class="f" style="margin-bottom:12px">
          <label>Client ID</label>
          <input id="clientId" type="text" placeholder="e.g. smartstream, futuroot, demo-finance" />
          <div class="hint">Identifier for the active client / demo context.</div>
        </div>

        <!-- User Prompt (was: Answer Prompt) -->
        <div class="f" style="margin-bottom:12px">
          <label>User Prompt</label>
          <textarea id="answerPrompt" class="prompt" placeholder="Describe how answers should be presented.&#10;e.g. Always respond in a formal tone.&#10;     Highlight the top performer in bold.&#10;     Show currency values in USD."></textarea>
          <div class="hint">Optional — leave blank to use default formatting.</div>
        </div>

        <!-- System Prompt (was: Behaviour Prompt) -->
        <div class="f" style="margin-bottom:12px">
          <label>System Prompt</label>
          <textarea id="behaviourPrompt" class="prompt" placeholder="Describe what this assistant does and what topics it covers.&#10;e.g. This assistant answers questions about regional sales performance.&#10;     It covers revenue, volume, and target vs. actual comparisons.&#10;     Metrics are reported in INR crores."></textarea>
          <div class="hint">Describe the assistant's domain, scope, and any metric definitions.</div>
        </div>

        <!-- Table Prompt (was: Schema Prompt) -->
        <div class="f">
          <label>Table Prompt</label>
          <textarea id="schemaPrompt" class="prompt" placeholder='View: "SCHEMA_NAME"."VIEW_NAME"(PARAMETER_NAME => &apos;VALUE&apos;)&#10;&#10;Parameter behaviour:&#10;Describe what the parameter does — e.g. filters to a specific year,&#10;or returns a sliding window of the last N years including the given value.&#10;&#10;Columns:&#10;- COLUMN_NAME   DataType — what this column represents&#10;- COLUMN_NAME   DataType — what this column represents&#10;&#10;Value examples (for text/category columns):&#10;- COLUMN_NAME: &apos;Option A&apos;, &apos;Option B&apos;, &apos;Option C&apos;'></textarea>
          <div class="hint">Include the view name, what the parameter filters, and a description of each column.</div>
        </div>
      </div>

      <hr class="divider" />

      <!-- ════════════════════════════════════════
           SECTION 3 — Theme
           ════════════════════════════════════════ -->
      <div class="section">
        <div class="title">Theme</div>
        <div id="palettes" class="palettes" style="margin-bottom:12px"></div>
        <div class="grid">
          <div class="f"><label>Header Gradient Start</label><input id="primaryColor" type="color" /></div>
          <div class="f"><label>Header Gradient End</label>  <input id="primaryDark"  type="color" /></div>
          <div class="f"><label>Background</label>           <input id="surfaceColor" type="color" /></div>
          <div class="f"><label>Chat Panel Background</label><input id="surfaceAlt"   type="color" /></div>
          <div class="f"><label>Text Color</label>           <input id="textColor"    type="color" /></div>
        </div>
        <div id="themeError" class="danger" style="margin-top:6px; display:none"></div>
      </div>

      <!-- Toolbar -->
      <div class="toolbar">
        <span class="chip" id="statusChip">No changes</span>
        <button id="resetBtn">Reset</button>
        <button id="updateBtn" class="primary" disabled>Update</button>
      </div>
    </div>

    <div class="toast" id="toast">Saved</div>
  `

  const HEX = /^#([0-9a-fA-F]{6})$/

  class PerciBotBuilder extends HTMLElement {
    constructor () {
      super()
      this.attachShadow({ mode: 'open' })
      this.shadowRoot.appendChild(tpl.content.cloneNode(true))
      this.$ = id => this.shadowRoot.getElementById(id)

      // backendUrl is intentionally excluded — it is hardcoded as BACKEND_URL
      this.keys = [
        'apiKey', 'model', 'welcomeText',
        'schemaName', 'viewName',
        'primaryColor', 'primaryDark', 'surfaceColor', 'surfaceAlt', 'textColor',
        'clientId', 'answerPrompt', 'behaviourPrompt', 'schemaPrompt',
      ]
      this.inputs = this.keys.map(k => this.$(k))

      this.$('toggleKey').addEventListener('click', () => {
        const inp = this.$('apiKey')
        inp.type = inp.type === 'password' ? 'text' : 'password'
        this.$('toggleKey').textContent = inp.type === 'password' ? 'Show' : 'Hide'
      })

      const markDirty = () => this._setDirty(true)
      this.inputs.forEach(el => {
        if (!el) return
        el.addEventListener('input',  markDirty)
        el.addEventListener('change', markDirty)
      })

      this.$('resetBtn').addEventListener('click',    () => this._reset())
      this.$('updateBtn').addEventListener('click',   () => this._update())
      this.$('testConnBtn').addEventListener('click', () => this._testConnection())

      this._palettes = [
        { name: 'SAC Blue',  primaryColor: '#1f4fbf', primaryDark: '#163a8a', surfaceColor: '#ffffff', surfaceAlt: '#f6f8ff', textColor: '#0b1221' },
        { name: 'Emerald',   primaryColor: '#0fb37d', primaryDark: '#0a7f59', surfaceColor: '#ffffff', surfaceAlt: '#f2fbf7', textColor: '#0a1b14' },
        { name: 'Sunset',    primaryColor: '#ff8a00', primaryDark: '#e53670', surfaceColor: '#ffffff', surfaceAlt: '#fff8f0', textColor: '#131212' },
        { name: 'Slate',     primaryColor: '#4a5568', primaryDark: '#2d3748', surfaceColor: '#f7f9fc', surfaceAlt: '#eef2f7', textColor: '#0b1221' },
        { name: 'Indigo',    primaryColor: '#5a67d8', primaryDark: '#434190', surfaceColor: '#ffffff', surfaceAlt: '#f3f4ff', textColor: '#0b1221' },
        { name: 'Carbon',    primaryColor: '#2b2b2b', primaryDark: '#0f0f0f', surfaceColor: '#ffffff', surfaceAlt: '#f6f6f6', textColor: '#111111' },
      ]
      this._renderPalettes()
    }

    onCustomWidgetBuilderInit (host) {
      this._apply((host && host.properties) || {})
      // Capture the opening state once — never overwritten, even after Update.
      if (!this._initial) this._initial = { ...this._props }
    }

    onCustomWidgetAfterUpdate (changedProps) {
      this._apply(changedProps, true)
      // Capture opening state if SAC calls this before onCustomWidgetBuilderInit.
      if (!this._initial) this._initial = { ...this._props }
    }

    _renderPalettes () {
      const root = this.$('palettes')
      const mk   = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e }
      this._palettes.forEach(p => {
        const card = mk('div', 'pal-card')
        const sw   = mk('div', 'pal-sw')
        ;['primaryColor', 'primaryDark', 'surfaceColor', 'surfaceAlt', 'textColor'].forEach(k => {
          const s = mk('div', 'pal-s'); s.style.background = p[k]; sw.appendChild(s)
        })
        const name = mk('div', 'pal-name'); name.textContent = p.name
        card.appendChild(sw); card.appendChild(name)
        card.addEventListener('click', () => {
          Object.entries(p).forEach(([k, v]) => { if (k !== 'name' && this.$(k)) this.$(k).value = v })
          this._setDirty(true)
        })
        root.appendChild(card)
      })
    }

    _apply (p = {}, external = false) {
      this._props = {
        apiKey:          p.apiKey          ?? '',
        model:           p.model           ?? 'gpt-4o-mini',
        welcomeText:     p.welcomeText     ?? 'Hello, I\u2019m PerciBOT! How can I assist you?',
        schemaName:      p.schemaName      ?? '',
        viewName:        p.viewName        ?? '',
        primaryColor:    p.primaryColor    ?? '#1f4fbf',
        primaryDark:     p.primaryDark     ?? '#163a8a',
        surfaceColor:    p.surfaceColor    ?? '#ffffff',
        surfaceAlt:      p.surfaceAlt      ?? '#f6f8ff',
        textColor:       p.textColor       ?? '#0b1221',
        clientId:        p.clientId        ?? '',
        answerPrompt:    p.answerPrompt    ?? '',
        behaviourPrompt: p.behaviourPrompt ?? '',
        schemaPrompt:    p.schemaPrompt    ?? '',
      }
      this.keys.forEach(k => { if (this.$(k)) this.$(k).value = this._props[k] })
      if (!external) this._setDirty(false)
      this._validateTheme()
    }

    _validateTheme () {
      const ids = ['primaryColor', 'primaryDark', 'surfaceColor', 'surfaceAlt', 'textColor']
      const bad = ids.filter(id => !HEX.test((this.$(id).value || '').trim().toLowerCase()))
      const err = this.$('themeError')
      if (bad.length) { err.textContent = 'Please choose valid colors.'; err.style.display = 'block' }
      else            { err.style.display = 'none' }
      return bad.length === 0
    }

    _setDirty (dirty) {
      this._dirty = !!dirty
      this.$('updateBtn').disabled = !this._dirty || !this._validateTheme()
      this.$('statusChip').textContent = this._dirty ? 'Unsaved changes' : 'No changes'
    }

    _collect () {
      const get = id => (this.$(id) ? this.$(id).value : '')
      return {
        apiKey:          get('apiKey'),
        model:           get('model'),
        welcomeText:     get('welcomeText'),
        schemaName:      get('schemaName').trim(),
        viewName:        get('viewName').trim(),
        primaryColor:    get('primaryColor'),
        primaryDark:     get('primaryDark'),
        surfaceColor:    get('surfaceColor'),
        surfaceAlt:      get('surfaceAlt'),
        textColor:       get('textColor'),
        clientId:        get('clientId').trim(),
        answerPrompt:    get('answerPrompt'),
        behaviourPrompt: get('behaviourPrompt'),
        schemaPrompt:    get('schemaPrompt'),
      }
    }

    async _testConnection () {
      const apiKey     = (this.$('apiKey').value     || '').trim()
      const model      = (this.$('model').value      || '').trim()
      const schemaName = (this.$('schemaName').value || '').trim()
      const viewName   = (this.$('viewName').value   || '').trim()

      const statusEl = this.$('connStatus')
      const detailEl = this.$('connDetail')
      const openaiEl = this.$('cdOpenai')
      const hanaEl   = this.$('cdHana')

      detailEl.classList.remove('show')
      openaiEl.className = ''; openaiEl.textContent = ''
      hanaEl.className   = ''; hanaEl.textContent   = ''

      if (!apiKey) {
        statusEl.className   = 'conn-status err'
        statusEl.textContent = '\u2717 API key is empty'
        return
      }

      statusEl.className   = 'conn-status checking'
      statusEl.textContent = '\u29d7 Checking\u2026'
      this.$('testConnBtn').disabled = true

      try {
        const body = { api_key_encrypted: xorEncrypt(apiKey), model }
        if (schemaName && viewName) {
          body.schema_name = schemaName
          body.view_name   = viewName
        }

        const res  = await fetch(`${BACKEND_URL}/presales/test-connection`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        })
        const data = await res.json()

        detailEl.classList.add('show')

        if (data.openai === 'ok') {
          openaiEl.className   = 'ok-val'
          openaiEl.textContent = `\u2713 Connected (${data.model || model})`
        } else {
          openaiEl.className   = 'err-val'
          openaiEl.textContent = `\u2717 ${data.openai_detail || 'Failed'}`
        }

        if (!schemaName || !viewName) {
          hanaEl.className   = 'skip-val'
          hanaEl.textContent = 'Skipped \u2014 no schema/view configured'
        } else if (data.hana === 'ok') {
          hanaEl.className   = 'ok-val'
          hanaEl.textContent = `\u2713 View found: ${schemaName}.${viewName}`
        } else if (data.hana === 'error') {
          hanaEl.className   = 'err-val'
          hanaEl.textContent = `\u2717 ${data.hana_detail || 'View check failed'}`
        } else {
          hanaEl.className   = 'skip-val'
          hanaEl.textContent = 'Skipped'
        }

        statusEl.className   = data.status === 'ok' ? 'conn-status ok'  : 'conn-status err'
        statusEl.textContent = data.status === 'ok' ? '\u2713 All checks passed' : '\u2717 One or more checks failed'

      } catch (e) {
        statusEl.className   = 'conn-status err'
        statusEl.textContent = `\u2717 ${e.message}`
        detailEl.classList.remove('show')
      } finally {
        this.$('testConnBtn').disabled = false
      }
    }

    _update () {
      if (!this._validateTheme()) return
      const props = this._collect()
      this.dispatchEvent(new CustomEvent('propertiesChanged', {
        detail:   { properties: props },
        bubbles:  true,
        composed: true,
      }))
      this._props = { ...props }
      // _initial is intentionally NOT updated here — Reset always returns
      // to the state the builder had when it was first opened this session.
      this._setDirty(false)
      this._toast('Saved')
    }

    _reset () {
      if (!this._initial) return
      this._apply(this._initial)
      // After restoring, mark dirty so the consultant can see the restored state
      // and choose to press Update if they want to keep it, or keep editing.
      this._setDirty(true)
    }

    _toast (msg) {
      const t = this.$('toast')
      t.textContent = msg
      t.classList.add('show')
      setTimeout(() => t.classList.remove('show'), 1200)
    }
  }

  if (!customElements.get('perci-bot-builder')) {
    customElements.define('perci-bot-builder', PerciBotBuilder)
  }
}())