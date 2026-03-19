/* PerciBot — Builder Panel (palettes + color pickers + Update/Reset) */
(function () {
  const tpl = document.createElement('template');
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
      input[type="color"]{ padding:6px; height:40px }
      input:focus, select:focus, textarea:focus{border-color:#4d9aff; box-shadow:0 0 0 2px rgba(77,154,255,.15)}
      textarea{min-height:90px; resize:vertical}
      .hint{font-size:12px; opacity:.65}
      .toolbar{display:flex; justify-content:flex-end; align-items:center; gap:10px; margin-top:16px; padding-top:12px; border-top:1px solid #e7eaf0}
      button{ padding:10px 14px; border:1px solid #d0d3da; border-radius:10px; background:#fff; cursor:pointer }
      button[disabled]{opacity:.5; cursor:not-allowed}
      .primary{ background:#1f4fbf; color:#fff; border-color:#1f4fbf }
      .chip{display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px; background:#f5f7fb; border:1px solid #e7eaf0; font-size:12px}
      .keywrap{position:relative}
      .reveal{ position:absolute; right:8px; top:50%; transform:translateY(-50%); background:transparent; border:none; cursor:pointer; opacity:.7; font-size:12px }
      .danger{color:#b00020; font-size:12px}
      .palettes{display:grid; grid-template-columns:repeat(3,1fr); gap:10px}
      .pal-card{
        display:flex; align-items:center; gap:10px; padding:10px; border:1px solid #e7eaf0; border-radius:10px; cursor:pointer; background:#fff
      }
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
    </style>

    <div class="panel">
      <div class="section">
        <div class="title">Connection</div>
        <div class="f keywrap">
          <label>OpenAI API Key</label>
          <input id="apiKey" type="password" placeholder="sk-..." />
          <button class="reveal" id="toggleKey" tabindex="-1">Show</button>
          <div class="hint">Stored with the story/app (not in code).</div>
        </div>

        <div class="grid" style="margin-top:10px">
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
            <input id="welcomeText" type="text" placeholder="Hello, I’m PerciBot! How can I assist you?" />
          </div>
        </div>
      </div>
      <div class="section">
        <div class="title">Behavior</div>
        <div class="f">
          <label>System Prompt</label>
          <textarea id="systemPrompt" placeholder="You are PerciBot, a helpful and concise assistant for SAP Analytics Cloud."></textarea>
        </div>
      </div>

      <div class="section">
        <div class="title">Theme</div>

        <!-- Palettes -->
        <div id="palettes" class="palettes" style="margin-bottom:12px"></div>

        <!-- Individual pickers -->
        <div class="grid">
          <div class="f"><label>Header Gradient Start</label><input id="primaryColor"  type="color" /></div>
          <div class="f"><label>Header Gradient End</label>  <input id="primaryDark"   type="color" /></div>
          <div class="f"><label>Background</label>           <input id="surfaceColor"  type="color" /></div>
          <div class="f"><label>Chat Panel Background</label><input id="surfaceAlt"    type="color" /></div>
          <div class="f"><label>Text Color</label>           <input id="textColor"     type="color" /></div>
        </div>
        <div id="themeError" class="danger" style="margin-top:6px; display:none"></div>
      </div>

      <div class="toolbar">
        <span class="chip" id="statusChip">No changes</span>
        <button id="resetBtn">Reset</button>
        <button id="updateBtn" class="primary" disabled>Update</button>
      </div>
    </div>

    <div class="toast" id="toast">Saved</div>
  `;

  const HEX = /^#([0-9a-fA-F]{6})$/; // color inputs always give #rrggbb

  class PerciBotBuilder extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.appendChild(tpl.content.cloneNode(true));
      this.$ = id => this.shadowRoot.getElementById(id);

      this.keys = [
        'apiKey','model','systemPrompt','welcomeText',
        'primaryColor','primaryDark','surfaceColor','surfaceAlt','textColor'
      ];
      this.inputs = this.keys.map(k => this.$(k));

      // show/hide key
      this.$('toggleKey').addEventListener('click', () => {
        const inp = this.$('apiKey');
        inp.type = (inp.type === 'password' ? 'text' : 'password');
        this.$('toggleKey').textContent = inp.type === 'password' ? 'Show' : 'Hide';
      });

      // dirty tracking
      const markDirty = () => this._setDirty(true);
      this.inputs.forEach(el => {
        if (!el) return;
        el.addEventListener('input', markDirty);
        el.addEventListener('change', markDirty);
      });

      // actions
      this.$('resetBtn').addEventListener('click', () => this._reset());
      this.$('updateBtn').addEventListener('click', () => this._update());

      // Palettes
      this._palettes = [
        {
          name: 'SAC Blue',
          primaryColor: '#1f4fbf', primaryDark: '#163a8a',
          surfaceColor: '#ffffff', surfaceAlt: '#f6f8ff', textColor: '#0b1221'
        },
        {
          name: 'Emerald',
          primaryColor: '#0fb37d', primaryDark: '#0a7f59',
          surfaceColor: '#ffffff', surfaceAlt: '#f2fbf7', textColor: '#0a1b14'
        },
        {
          name: 'Sunset',
          primaryColor: '#ff8a00', primaryDark: '#e53670',
          surfaceColor: '#ffffff', surfaceAlt: '#fff8f0', textColor: '#131212'
        },
        {
          name: 'Slate',
          primaryColor: '#4a5568', primaryDark: '#2d3748',
          surfaceColor: '#f7f9fc', surfaceAlt: '#eef2f7', textColor: '#0b1221'
        },
        {
          name: 'Indigo',
          primaryColor: '#5a67d8', primaryDark: '#434190',
          surfaceColor: '#ffffff', surfaceAlt: '#f3f4ff', textColor: '#0b1221'
        },
        {
          name: 'Carbon',
          primaryColor: '#2b2b2b', primaryDark: '#0f0f0f',
          surfaceColor: '#ffffff', surfaceAlt: '#f6f6f6', textColor: '#111111'
        }
      ];
      this._renderPalettes();
    }

    onCustomWidgetBuilderInit(host) {
      this._apply((host && host.properties) || {});
      this._initial = { ...this._props };
    }

    onCustomWidgetAfterUpdate(changedProps) {
      this._apply(changedProps, /*external*/true);
    }

    _renderPalettes() {
      const root = this.$('palettes');
      const mk = (t,c) => { const e=document.createElement(t); if(c) e.className=c; return e; };
      this._palettes.forEach(p => {
        const card = mk('div','pal-card');
        const sw   = mk('div','pal-sw');
        ['primaryColor','primaryDark','surfaceColor','surfaceAlt','textColor'].forEach(k=>{
          const s = mk('div','pal-s'); s.style.background = p[k]; sw.appendChild(s);
        });
        const name = mk('div','pal-name'); name.textContent = p.name;
        card.appendChild(sw); card.appendChild(name);
        card.addEventListener('click', () => {
          Object.entries(p).forEach(([k,v]) => { if (k!=='name' && this.$(k)) this.$(k).value = v; });
          this._setDirty(true);
        });
        root.appendChild(card);
      });
    }

    _apply(p = {}, external = false) {
      this._props = {
        apiKey:       p.apiKey ?? '',
        model:        p.model ?? 'gpt-3.5-turbo',
        systemPrompt: p.systemPrompt ?? 'You are PerciBot, a helpful and concise assistant for SAP Analytics Cloud.',
        welcomeText:  p.welcomeText ?? 'Hello, I’m PerciBot! How can I assist you?',
        primaryColor: p.primaryColor ?? '#1f4fbf',
        primaryDark:  p.primaryDark ?? '#163a8a',
        surfaceColor: p.surfaceColor ?? '#ffffff',
        surfaceAlt:   p.surfaceAlt ?? '#f6f8ff',
        textColor:    p.textColor ?? '#0b1221'
      };

      this.keys.forEach(k => { if (this.$(k)) this.$(k).value = this._props[k]; });
      if (!external) this._setDirty(false);
      this._validateTheme();
    }

    _validateTheme() {
      const ids = ['primaryColor','primaryDark','surfaceColor','surfaceAlt','textColor'];
      const bad = ids.filter(id => !HEX.test((this.$(id).value || '').trim().toLowerCase()));
      const err = this.$('themeError');
      if (bad.length) {
        err.textContent = 'Please choose valid colors.';
        err.style.display = 'block';
      } else {
        err.style.display = 'none';
      }
      return bad.length === 0;
    }

    _setDirty(dirty) {
      this._dirty = !!dirty;
      this.$('updateBtn').disabled = !this._dirty || !this._validateTheme();
      this.$('statusChip').textContent = this._dirty ? 'Unsaved changes' : 'No changes';
    }

    _collect() {
      const get = id => (this.$(id).value || '').trim();
      // color inputs return #rrggbb (already valid)
      return {
        apiKey:       get('apiKey'),
        model:        get('model'),
        systemPrompt: get('systemPrompt'),
        welcomeText:  get('welcomeText'),
        primaryColor: get('primaryColor'),
        primaryDark:  get('primaryDark'),
        surfaceColor: get('surfaceColor'),
        surfaceAlt:   get('surfaceAlt'),
        textColor:    get('textColor')
      };
    }

    _update() {
      if (!this._validateTheme()) return;
      const props = this._collect();
      this.dispatchEvent(new CustomEvent('propertiesChanged', { detail: { properties: props }}));
      this.dispatchEvent(new CustomEvent('propertiesChanged', {
        detail: { properties: props },
        bubbles: true,
        composed: true
    }));
      this._props = { ...props };
      this._initial = { ...props };  // new baseline
      this._setDirty(false);
      this._toast('Saved');
    }

    _reset() {
      this._apply(this._initial);
      this.dispatchEvent(new CustomEvent('propertiesChanged', { detail: { properties: { ...this._initial } }}));
      this.dispatchEvent(new CustomEvent('propertiesChanged', {
        detail: { properties: { ...this._initial } },
        bubbles: true,
        composed: true
     }));
      this._setDirty(false);
    }

    _toast(msg) {
      const t = this.$('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 1200);
    }
  }

  if (!customElements.get('perci-bot-builder')) {
    customElements.define('perci-bot-builder', PerciBotBuilder);
  }
})();
