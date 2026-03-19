/* PerciBot — SAC Chat Widget (Analytic App push mode: receives datasets via setProperties) */
;(function () {
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
      .chip{font-size:12px; padding:4px 8px; border-radius:999px; background:rgba(255,255,255,.2)}
      .body {
        flex:1;
        display:flex;
        flex-direction:column;
        gap:10px;
        padding:10px;
        min-height:0;  /* important for flex scrolling */
      }
      .panel{
        flex:1;
        overflow-y:auto;   /* only vertical scrolling */
        overflow-x:hidden;
        border:1px solid #e7eaf0;
        border-radius:12px;
        padding:10px;
        background:#f7f9fc;
      }
      .msg{max-width:85%; margin:6px 0; padding:10px 12px; border-radius:14px; box-shadow:0 1px 2px rgba(0,0,0,.04)}
      .user{ margin-left:auto; }
      .inputRow{ display:flex; gap:8px; align-items:flex-start }
      textarea{
        flex:1; resize:vertical; min-height:64px; max-height:220px;
        padding:10px 12px; border:1px solid #d0d3da; border-radius:12px; background:#fff; outline:none;
      }
      textarea:focus{ border-color:#4d9aff; box-shadow:0 0 0 2px rgba(77,154,255,.15) }
      button{
        padding:10px 14px; border:1px solid #d0d3da; border-radius:12px; background:#fff; cursor:pointer
      }
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
            .msg.bot.typing{ display:inline-flex; align-items:center; gap:8px; }
      .typing .dots{ display:inline-flex; gap:4px; }
      .typing .dots span{
        width:6px; height:6px; border-radius:50%;
        background:#c7ccd8; display:inline-block;
        animation: percibot-blink 1s infinite ease-in-out;
      }
      .typing .dots span:nth-child(2){ animation-delay:.15s }
      .typing .dots span:nth-child(3){ animation-delay:.30s }

      @keyframes percibot-blink{
        0%{ opacity:.2; transform:translateY(0) }
        20%{ opacity:1; transform:translateY(-2px) }
        100%{ opacity:.2; transform:translateY(0) }
      }

            header{ position:relative; } /* anchor for drawer */
      .chip{ cursor:pointer; }

      #dsDrawer{
        position:absolute; right:14px; top:58px; z-index:10;
        max-width:420px; max-height:240px; overflow:auto;
        background:#fff; border:1px solid #e7eaf0; border-radius:10px;
        box-shadow:0 12px 28px rgba(0,0,0,.12); padding:10px; font-size:12px; display:none;
      }
      #dsDrawer .ds{padding:6px 4px; border-bottom:1px dashed #eee;}
      #dsDrawer .ds:last-child{border-bottom:none;}
      #dsDrawer .name{font-weight:700;}

      .panel { position:relative; }
      .msg.bot.typing{ position:sticky; bottom:0; }

    </style>
    <div class="wrap">
      <header>
        <div class="brand">PerciBOT</div>
        <div class="chip" id="modelChip"></div>
        <div id="dsDrawer"></div>

      </header>

      <div class="body">
        <div class="panel" id="chat"></div>

        <div class="inputRow">
          <textarea id="input" placeholder="Ask anything about your analytics…"></textarea>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <button id="send" class="primary">Send</button>
            <button id="clear">Clear</button>
          </div>
        </div>
      </div>

      <div class="footer">
        <div class="muted" id="hint"></div>
        <div class="muted"><a href="https://www.linkedin.com/company/percipere/" target="_blank" >Percipere Consulting</a></div>
      </div>
    </div>
  `

  class PerciBot extends HTMLElement {
    constructor () {
      super()
      this._shadowRoot = this.attachShadow({ mode: 'open' })
      this._shadowRoot.appendChild(tpl.content.cloneNode(true))
      this.$ = id => this._shadowRoot.getElementById(id)

      this.$chat = this.$('chat')
      this.$input = this.$('input')
      this.$send = this.$('send')
      this.$clear = this.$('clear')
      this.$modelChip = this.$('modelChip')
      this.$hint = this.$('hint')

      this.$send.addEventListener('click', () => this._send())
      this.$clear.addEventListener('click', () => (this.$chat.innerHTML = ''))

      this._props = {
        apiKey: '',
        model: 'gpt-3.5-turbo',
        systemPrompt:
          'You are PerciBOT, a helpful and concise assistant for SAP Analytics Cloud.',
        welcomeText: 'Hello, I’m PerciBOT! How can I assist you?',
        datasets: '', // JSON string pushed from Analytic App: { Sales:{schema:[],rows:[]}, ... }
        // theme
        primaryColor: '#1f4fbf',
        primaryDark: '#163a8a',
        surfaceColor: '#ffffff',
        surfaceAlt: '#f6f8ff',
        textColor: '#0b1221',
        summaryPrompt:'',
      }
      this.summaryResponse = 'Test';
      this._datasets = {} // parsed datasets
    }

    connectedCallback () {
      if (!this.$chat.innerHTML && this._props.welcomeText) {
        this._append('bot', this._props.welcomeText)
      }

      this.$modelChip.addEventListener('click', () => {
        const d = this._shadowRoot.getElementById('dsDrawer')
        d.style.display =
          d.style.display === 'none' || !d.style.display ? 'block' : 'none'
      })
    }

    _applyDatasets (jsonStr) {
      try {
        const raw = JSON.parse(jsonStr || '{}') || {}
        const rebuilt = {}
        Object.keys(raw).forEach(name => {
          const { schema = [], rows2D = [] } = raw[name] || {}
          const rows = rows2D.map(arr => {
            const o = {}
            for (let i = 0; i < schema.length; i++) o[schema[i]] = arr[i]
            return o
          })
          rebuilt[name] = { schema, rows, rows2D }
        })
        this._datasets = rebuilt
        console.log('datasets', this._datasets)
        const tag = Object.entries(this._datasets)
          .map(([k, v]) => `${k}: ${v.rows?.length || 0} rows`)
          .join(' · ')
        // this.$modelChip.textContent = tag || 'AI Assistant'

        this._updateDatasetsUI()

        // nice first-time nudge
        if (!this.$chat.innerHTML && Object.keys(this._datasets).length) {
          this._append(
            'bot',
            'Datasets received. Ready to answer any analytical questions! '
          )
        }
      } catch (e) {
        this._datasets = {}
        // this.$modelChip.textContent = 'AI Assistant'
        this._updateDatasetsUI()
      }
    }

    onCustomWidgetAfterUpdate (changedProps = {}) {
      Object.assign(this._props, changedProps)
      this._applyTheme()

      console.log('datasets', changedProps)

      if(changedProps.summaryPrompt !== undefined) {
        this._generateSummary(changedProps.summaryPrompt);
        return;
      }
      // Show API key hint
      this.$hint.textContent = this._props.apiKey
        ? 'AI can make mistakes. Please verify results.'
        : 'API key not set – open Builder to configure'

      // Parse pushed datasets (if any)
      if (typeof changedProps.datasets === 'string') {
        try {
          if (changedProps.datasets != '') {

            if(changedProps.datasets == '{'){
              // changedProps.datasets = '{"TEAM_UTILIZATION": {"schema": ["Team", "Net Availability (Days)", "Project Billable Days", "Project NB Days", "Internal Time", "Billable Util %", "White Space %", "White Space Days"], "types": ["string", "number", "number", "number", "number", "number", "number", "number"], "rows2D": [["Event management", 1176.0, 606.54, 0, 15, 51.58, 47.15, 554.46], ["Project Management", 371.5, 249.5, 25, 0, 67.16, 26.11, 97.0], ["Sales", 655.0, 203.0, 0, 0, 30.99, 69.01, 452.0], ["Technology", 928.0, 280.5, 2, 0, 30.23, 69.56, 645.5]]}, "RESOURCE_UTILIZATION": {"schema": ["Team", "Resource", "FTE Type", "Net Availability (Days)", "Project Billable Days", "Project NB Days", "Internal Time", "Billable Util %", "White Space %", "White Space Days"], "types": ["string", "string", "string", "number", "number", "number", "number", "number", "number", "number"], "rows2D": [["Event management", "Robert Davis", "Part Time", 11.0, 123.5, 0, 0, 1122.7, -1022.73, -112.5], ["Event management", "Natalie Thompson", "Full Time", 262.0, 80.0, 0, 0, 30.5, 69.47, 182.0], ["Event management", "Savitha Krishnamurthi", "Part Time", 131.0, 33.0, 0, 0, 25.2, 74.81, 98.0], ["Event management", "Mykhailo Ivanenko", "Part Time", 131.0, 84.0, 0, 0, 64.1, 35.88, 47.0], ["Event management", "Laura Lewis", "Full Time", 262.0, 90.0, 0, 0, 34.4, 65.65, 172.0], ["Event management", "Andrew Allen", "Full Time", 248.0, 69.04, 0, 15, 27.8, 66.11, 163.96], ["Event management", "Samantha Young", "Full Time", 131.0, 127.0, 0, 0, 96.9, 3.05, 4.0], ["Project Management", "Anna Schmidt", "Part Time", 43.5, 36.0, 2, 0, 82.8, 12.64, 5.5], ["Project Management", "Satish Joshi", "Full Time", 66.0, 48.5, 0, 0, 73.5, 26.52, 17.5], ["Project Management", "Thomas Wilson", "Full Time", 262.0, 87.0, 0, 0, 33.2, 66.79, 175.0], ["Project Management", "Christopher Garcia", "Full Time", 0, 78.0, 23, 0, 0.0, 0.0, -101.0], ["Sales", "Olivia Martinez", "Full Time", 0, 2.5, 0, 0, 0.0, 0.0, -2.5], ["Sales", "Linda Anderson", "Part Time", 131.0, 118.5, 0, 0, 90.5, 9.54, 12.5], ["Sales", "Kateryna Kravchenko", "Full Time", 262.0, 76.0, 0, 0, 29.0, 70.99, 186.0], ["Sales", "Andriy Petrov ", "Full Time", 262.0, 6.0, 0, 0, 2.3, 97.71, 256.0], ["Technology", "Emily Johnson", "Full Time", 262.0, 59.0, 1, 0, 22.5, 77.1, 202.0], ["Technology", "Michael Smith", "Part Time", 76.0, 21.0, 0, 0, 27.6, 72.37, 55.0], ["Technology", "Sarah Lee", "Full Time", 197.0, 101.0, 0, 0, 51.3, 48.73, 96.0], ["Technology", "Natalie Hall", "Full Time", 262.0, 65.0, 0, 0, 24.8, 75.19, 197.0], ["Technology", "Joshua King", "Part Time", 131.0, 34.5, 1, 0, 26.3, 72.9, 95.5]]}, "TEAM_REVENUE": {"schema": ["Team", "Actual Revenue", "Annual Rev Outlook", "Annual Cost", "Annual Margin", "Annual Margin %"], "types": ["string", "number", "number", "number", "number", "number"], "rows2D": [["Event management", 2896704.595, 2896704.595, -650398.7085, 2246305.886, 77.54694387], ["Project Management", 1080550.998, 1080550.998, -276681.5446, 803869.4533, 74.39440201], ["Sales", 958931.7865, 958931.7865, -229323.5624, 729608.2241, 76.08551874], ["Technology", 1029529.205, 1029529.205, -298202.6789, 731326.5263, 71.03504423]]}, "RESOURCE_REVENUE": {"schema": ["Resource", "Team", "Actual Revenue", "Annual Rev Outlook", "Annual Cost", "Annual Margin", "Annual Margin %"], "types": ["string", "string", "number", "number", "number", "number", "number"], "rows2D": [["Emily Johnson", "Technology", 158017.184, 158017.184, -62618.87042, 95398.31359, 60.37], ["Michael Smith", "Technology", 110765.8703, 110765.8703, -28257.25756, 82508.61273, 74.49], ["Sarah Lee", "Technology", 421965.2202, 421965.2202, -106071.378, 315893.8422, 74.86], ["Anna Schmidt", "Project Management", 55382.93515, 55382.93515, -35543.10098, 19839.83417, 35.82], ["Satish Joshi", "Project Management", 211422.1572, 211422.1572, -14325.54347, 197096.6137, 93.22], ["Thomas Wilson", "Project Management", 433392.1702, 433392.1702, -94223.67765, 339168.4925, 78.26], ["Olivia Martinez", "Sales", 15384.14865, 15384.14865, -3692.150378, 11691.99827, 76.0], ["Christopher Garcia", "Project Management", 380353.7353, 380353.7353, -132589.2225, 247764.5129, 65.14], ["Linda Anderson", "Sales", 539793.6015, 539793.6015, -155562.6026, 384230.9989, 71.18], ["Robert Davis", "Event management", 569578.6319, 569578.6319, -129701.1404, 439877.4915, 77.23], ["Natalie Thompson", "Event management", 401745.0424, 401745.0424, -91893.52053, 309851.5219, 77.13], ["Savitha Krishnamurthi", "Event management", 151643.751, 151643.751, -10830.30778, 140813.4432, 92.86], ["Kateryna Kravchenko", "Sales", 366832.0796, 366832.0796, -64850.5702, 301981.5094, 82.32], ["Mykhailo Ivanenko", "Event management", 423136.1737, 423136.1737, -68920.14039, 354216.0333, 83.71], ["Laura Lewis", "Event management", 435024.5602, 435024.5602, -93042.18953, 341982.3707, 78.61], ["Andriy Petrov ", "Sales", 36921.95676, 36921.95676, -5218.239202, 31703.71756, 85.87], ["Natalie Hall", "Technology", 285705.6178, 285705.6178, -68050.43386, 217655.184, 76.18], ["Andrew Allen", "Event management", 329473.1621, 329473.1621, -135138.6113, 194334.5508, 58.98], ["Samantha Young", "Event management", 586103.2734, 586103.2734, -120872.7986, 465230.4748, 79.38], ["Joshua King", "Technology", 53075.31285, 53075.31285, -33204.73907, 19870.57378, 37.44]]}, "PROJECT_REVENUE": {"schema": ["Projects", "Actual Revenue", "Annual Cost", "Annual Margin", "Annual Margin %"], "types": ["string", "number", "number", "number", "number"], "rows2D": [["Utility Week", 518665.5831, -118493.4128, 400172.1703, 77.15], ["Utility Week Flex Awards", 664595.2218, -216999.9849, 447595.2369, 67.35], ["Utility Week Forum", 292298.8244, -21529.3391, 270769.4853, 92.63], ["Women in Utilities Awards", 166148.8054, -18378.70411, 147770.1013, 88.94], ["Drinking Water Europe", 1823173.911, -423766.3135, 1399407.598, 76.76], ["Drinking Water Quality Conference", 116040.4355, -24007.18224, 92033.25331, 79.31], ["Reforming Grid Connections Conference", 1917884.891, -413980.31, 1503904.581, 78.41], ["Water in Mining", 295375.6541, -64896.51696, 230479.1372, 78.03], ["Water and Effluent Treatment News (WET News)", 171533.2575, -112581.0493, 58952.20813, 34.37], ["Sustainable Supply Chains Summit", 0.0, -20676.04212, -20676.04212, 0.0], ["Annual Leave", 0.0, -19297.63931, -19297.63931, 0.0]]}}';
              //changedProps.datasets = '{"IKF Finance - Model (MIS)":{"schema":["Date","IKF_Branch","IKF_CompanyCode","IKF_Product","Version","Account","Amount"],"types":["string","string","string","string","string","string","number"],"rows2D":[["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",38825.81],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",43139.12],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",27787.76],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",31161.4],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-81154.4],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-44988.26],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-123361.46],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-35819.74],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-33298.19],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-34916.29],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-31867.08],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-27129.91],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",13903.69],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",10570.72],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",15448.62],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",8981.55],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",20231.42],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",23396.99],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",22271.79],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",23089.43],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",38825.81],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",43139.12],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",27787.76],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",31161.4],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-81154.4],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-44988.26],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-123361.46],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-35819.74],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-33298.19],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-34916.29],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-31867.08],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-27129.91],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",13903.69],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",10570.72],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",15448.62],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",8981.55],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",20231.42],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",23396.99],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",22271.79],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",23089.43],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",40785.77],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",15035.51],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",19829.41],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",20569.76],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-60342.53],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-110537.42],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-132720.85],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-83377.61],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-46897.23],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-31352.01],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-49061.57],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-17859.82],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",6853.37],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",7873.31],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",18256.6],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",13587.83],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",9261.57],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",26179.31],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",26111.14],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",20541.39],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",40785.77],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",15035.51],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",19829.41],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",20569.76],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-60342.53],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-110537.42],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-132720.85],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-83377.61],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-46897.23],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-31352.01],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-49061.57],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-17859.82],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",6853.37],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",7873.31],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",18256.6],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",13587.83],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",9261.57],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",26179.31],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",26111.14],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",20541.39],["Jan (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",14486.82],["Feb (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",42699.52],["Mar (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",29678.5],["Apr (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",30921.99],["Jan (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-90064.61],["Feb (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-124381.96],["Mar (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-87904.8],["Apr (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-103664.87],["Jan (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-51718.99],["Feb (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-28483.66],["Mar (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-35686.53],["Apr (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-39614.23],["Jan (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",8564.63],["Feb (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",10226.56],["Mar (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",12436.31],["Apr (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",15147.93],["Jan (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",26359.73],["Feb (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",27197.37],["Mar (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",11150.42],["Apr (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",20621.89],["Jan (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",14486.82],["Feb (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",42699.52],["Mar (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",29678.5],["Apr (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",30921.99],["Jan (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-90064.61],["Feb (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-124381.96],["Mar (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-87904.8],["Apr (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-103664.87],["Jan (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-51718.99],["Feb (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-28483.66],["Mar (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-35686.53],["Apr (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-39614.23],["Jan (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",8564.63],["Feb (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",10226.56],["Mar (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",12436.31],["Apr (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",15147.93],["Jan (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",26359.73],["Feb (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",27197.37],["Mar (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",11150.42],["Apr (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",20621.89],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",17509.78],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",30483.91],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",27168.1],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",11770.51],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-34269.96],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-78933.18],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-107702.84],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-53921.84],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-24018.36],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-51772.14],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-19046.62],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-35631.99],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",15810.07],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",10705.57],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",8077.27],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",9079.54],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",19860.94],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",22443.84],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",25110.24],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",27252.22],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",17509.78],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",30483.91],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",27168.1],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",11770.51],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-34269.96],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-78933.18],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-107702.84],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-53921.84],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-24018.36],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-51772.14],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-19046.62],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-35631.99],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",15810.07],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",10705.57],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",8077.27],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",9079.54],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",19860.94],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",22443.84],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",25110.24],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",27252.22],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",35212.09],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",33001.33],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",31260.41],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",38388.6],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-74952.61],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-128403.24],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-132365.12],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-107213.61],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-32317.59],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-55588.26],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-18484.52],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-40505.23],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",9768.56],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",9070.04],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",13487.54],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",8800.64],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",25230.14],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",21580.28],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",14850.46],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",13221.82],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",35212.09],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",33001.33],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",31260.41],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",38388.6],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-74952.61],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-128403.24],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-132365.12],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-107213.61],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-32317.59],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-55588.26],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-18484.52],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-40505.23],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",9768.56],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",9070.04],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",13487.54],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",8800.64],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",25230.14],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",21580.28],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",14850.46],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",13221.82],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",28060.46],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",19031.88],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",36638.48],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",20799.53],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-88568.23],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-37908.13],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-57885.72],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-82684.15],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-32375.47],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-28958.66],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-49324.26],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-20164.68],["Jan (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",6339.62],["Feb (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",16000.77],["Mar (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",13358.84],["Apr (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",15312.14],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",26036.03],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",12985.13],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",7951.69],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",10940.38],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",28060.46],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",19031.88],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",36638.48],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",20799.53],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-88568.23],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-37908.13],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-57885.72],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-82684.15],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-32375.47],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-28958.66],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-49324.26],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-20164.68],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",6339.62],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",16000.77],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",13358.84],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",15312.14],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",26036.03],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",12985.13],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",7951.69],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",10940.38],["Jan (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",40507.59],["Feb (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",30409.22],["Mar (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",34709.4],["Apr (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",43125.76],["Jan (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-100137.49],["Feb (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-85162.99],["Mar (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-47045.95],["Apr (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-62441.61],["Jan (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-15253.33],["Feb (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-20871.47],["Mar (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-19347.98],["Apr (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-37302.41],["Jan (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",10269.17],["Feb (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",16085.33],["Mar (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",11230.57],["Apr (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Normalized Tax ",10698.75],["Jan (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",23259.79],["Feb (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",9682.51],["Mar (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",23700.86],["Apr (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Normalized Tax ",16737.88],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",40507.59],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",30409.22],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",34709.4],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normalized Tax ",43125.76],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-100137.49],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-85162.99],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-47045.95],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normalized Tax ",-62441.61],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-15253.33],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-20871.47],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-19347.98],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normalized Tax ",-37302.41],["Jan (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",10269.17],["Feb (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",16085.33],["Mar (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",11230.57],["Apr (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Normalized Tax ",10698.75],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",23259.79],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",9682.51],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",23700.86],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Normalized Tax ",16737.88],["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",31827.28],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",37290.34],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",42393.51],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",24627.02],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-38626.96],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-105067.15],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-51746.01],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-96146.92],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-37111.8],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-31047.03],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-42161.18],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-48332.52],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",6003.79],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",15446.5],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",5420.93],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",15765.05],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",20977.77],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",19389.4],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",26901.44],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",10243.9],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",31827.28],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",37290.34],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",42393.51],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",24627.02],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-38626.96],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-105067.15],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-51746.01],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-96146.92],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-37111.8],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-31047.03],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-42161.18],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-48332.52],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",6003.79],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",15446.5],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",5420.93],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",15765.05],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",20977.77],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",19389.4],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",26901.44],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",10243.9],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",11118.65],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",32648.02],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",36365.12],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",26966.36],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-35102.26],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-108313.54],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-46671.52],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-85881.15],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-18817.61],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-35985.39],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-20387.01],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-22943.43],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",17103.16],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",13798.88],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",17899.18],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",15227.11],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",13096.81],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",13492.1],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",19267.79],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",27873.57],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",11118.65],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",32648.02],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",36365.12],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",26966.36],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-35102.26],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-108313.54],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-46671.52],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-85881.15],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-18817.61],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-35985.39],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-20387.01],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-22943.43],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",17103.16],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",13798.88],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",17899.18],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",15227.11],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",13096.81],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",13492.1],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",19267.79],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",27873.57],["Jan (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",33712.34],["Feb (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",26715.99],["Mar (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",40350.76],["Apr (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",25057.22],["Jan (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-49424.68],["Feb (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-110314.5],["Mar (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-63324.61],["Apr (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-106807.14],["Jan (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-42881.89],["Feb (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-16541.68],["Mar (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-38588.82],["Apr (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-39408.03],["Jan (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",19026.13],["Feb (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",12783.84],["Mar (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",12879.91],["Apr (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",14719.01],["Jan (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",24524.32],["Feb (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",24873.11],["Mar (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",16381.15],["Apr (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",28136.33],["Jan (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",33712.34],["Feb (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",26715.99],["Mar (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",40350.76],["Apr (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",25057.22],["Jan (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-49424.68],["Feb (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-110314.5],["Mar (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-63324.61],["Apr (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-106807.14],["Jan (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-42881.89],["Feb (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-16541.68],["Mar (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-38588.82],["Apr (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-39408.03],["Jan (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",19026.13],["Feb (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",12783.84],["Mar (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",12879.91],["Apr (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",14719.01],["Jan (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",24524.32],["Feb (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",24873.11],["Mar (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",16381.15],["Apr (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",28136.33],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",13965.07],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",42695.35],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",13892.78],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",35243.41],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-46280.4],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-36605.98],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-128883.12],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-68389.76],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-20222.84],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-51014.42],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-20670.56],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-38760.79],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",13854.26],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",18301.52],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",7324.23],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",17894.67],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",27907.73],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",19397.47],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",17241.46],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",12554.55],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",13965.07],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",42695.35],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",13892.78],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",35243.41],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-46280.4],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-36605.98],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-128883.12],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-68389.76],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-20222.84],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-51014.42],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-20670.56],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-38760.79],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",13854.26],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",18301.52],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",7324.23],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",17894.67],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",27907.73],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",19397.47],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",17241.46],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",12554.55],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",14939.36],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",34088.86],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",39898.22],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",42997.41],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-97864.22],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-50516.59],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-109705.13],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-77657.05],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-45385.43],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-53779.82],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-32469.52],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-48576.83],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",5990.74],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",6723.04],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",7479.43],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",13199.41],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",16660.64],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",13308.56],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",17162.66],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",17430.96],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",14939.36],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",34088.86],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",39898.22],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",42997.41],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-97864.22],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-50516.59],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-109705.13],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-77657.05],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-45385.43],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-53779.82],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-32469.52],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-48576.83],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",5990.74],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",6723.04],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",7479.43],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",13199.41],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",16660.64],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",13308.56],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",17162.66],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",17430.96],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",28600.4],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",14994.55],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",26134.02],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",35861.55],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-123170.57],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-57618.07],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-73306.72],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-46299.76],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-36781.23],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-50081.13],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-47197.76],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-47324.37],["Jan (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",17849.66],["Feb (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",8106.06],["Mar (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",9881.23],["Apr (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",6973.25],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",10698.86],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",18636.95],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",19351.84],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",21077.13],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",28600.4],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",14994.55],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",26134.02],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",35861.55],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-123170.57],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-57618.07],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-73306.72],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-46299.76],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-36781.23],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-50081.13],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-47197.76],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-47324.37],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",17849.66],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",8106.06],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",9881.23],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",6973.25],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",10698.86],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",18636.95],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",19351.84],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",21077.13],["Jan (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",30121.4],["Feb (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",20494.19],["Mar (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",12165.44],["Apr (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",31781.94],["Jan (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-44934.86],["Feb (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-66779.24],["Mar (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-115742.05],["Apr (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-39303.73],["Jan (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-37063.38],["Feb (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-15986.55],["Mar (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-20695.89],["Apr (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-34909.62],["Jan (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",7246.97],["Feb (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",5405.86],["Mar (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",12313.75],["Apr (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Normal Credit Cost",14888.7],["Jan (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",21663.62],["Feb (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",8051.47],["Mar (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",24465.36],["Apr (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Normal Credit Cost",20283.15],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",30121.4],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",20494.19],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",12165.44],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Normal Credit Cost",31781.94],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-44934.86],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-66779.24],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-115742.05],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Normal Credit Cost",-39303.73],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-37063.38],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-15986.55],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-20695.89],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Normal Credit Cost",-34909.62],["Jan (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",7246.97],["Feb (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",5405.86],["Mar (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",12313.75],["Apr (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Normal Credit Cost",14888.7],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",21663.62],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",8051.47],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",24465.36],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Normal Credit Cost",20283.15],["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",31827.28],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",37290.34],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",42393.51],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",24627.02],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-38626.96],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-105067.15],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-51746.01],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-96146.92],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-37111.8],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-31047.03],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-42161.18],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-48332.52],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",6003.79],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",15446.5],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",5420.93],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",15765.05],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",20977.77],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",19389.4],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",26901.44],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",10243.9],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",31827.28],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",37290.34],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",42393.51],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",24627.02],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-38626.96],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-105067.15],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-51746.01],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-96146.92],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-37111.8],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-31047.03],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-42161.18],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-48332.52],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",6003.79],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",15446.5],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",5420.93],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",15765.05],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",20977.77],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",19389.4],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",26901.44],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",10243.9],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",11118.65],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",32648.02],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",36365.12],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",26966.36],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-35102.26],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-108313.54],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-46671.52],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-85881.15],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-18817.61],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-35985.39],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-20387.01],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-22943.43],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",17103.16],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",13798.88],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",17899.18],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",15227.11],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",13096.81],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",13492.1],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",19267.79],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",27873.57],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",11118.65],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",32648.02],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",36365.12],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",26966.36],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-35102.26],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-108313.54],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-46671.52],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-85881.15],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-18817.61],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-35985.39],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-20387.01],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-22943.43],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",17103.16],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",13798.88],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",17899.18],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",15227.11],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",13096.81],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",13492.1],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",19267.79],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",27873.57],["Jan (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",33712.34],["Feb (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",26715.99],["Mar (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",40350.76],["Apr (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",25057.22],["Jan (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-49424.68],["Feb (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-110314.5],["Mar (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-63324.61],["Apr (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-106807.14],["Jan (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-42881.89],["Feb (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-16541.68],["Mar (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-38588.82],["Apr (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-39408.03],["Jan (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",19026.13],["Feb (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",12783.84],["Mar (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",12879.91],["Apr (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",14719.01],["Jan (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",24524.32],["Feb (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",24873.11],["Mar (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",16381.15],["Apr (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",28136.33],["Jan (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",33712.34],["Feb (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",26715.99],["Mar (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",40350.76],["Apr (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",25057.22],["Jan (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-49424.68],["Feb (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-110314.5],["Mar (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-63324.61],["Apr (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-106807.14],["Jan (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-42881.89],["Feb (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-16541.68],["Mar (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-38588.82],["Apr (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-39408.03],["Jan (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",19026.13],["Feb (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",12783.84],["Mar (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",12879.91],["Apr (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",14719.01],["Jan (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",24524.32],["Feb (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",24873.11],["Mar (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",16381.15],["Apr (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",28136.33],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",13965.07],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",42695.35],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",13892.78],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",35243.41],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-46280.4],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-36605.98],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-128883.12],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-68389.76],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-20222.84],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-51014.42],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-20670.56],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-38760.79],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",13854.26],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",18301.52],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",7324.23],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",17894.67],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",27907.73],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",19397.47],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",17241.46],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",12554.55],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",13965.07],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",42695.35],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",13892.78],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",35243.41],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-46280.4],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-36605.98],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-128883.12],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-68389.76],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-20222.84],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-51014.42],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-20670.56],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-38760.79],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",13854.26],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",18301.52],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",7324.23],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",17894.67],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",27907.73],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",19397.47],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",17241.46],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",12554.55],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",14939.36],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",34088.86],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",39898.22],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",42997.41],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-97864.22],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-50516.59],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-109705.13],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-77657.05],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-45385.43],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-53779.82],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-32469.52],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-48576.83],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",5990.74],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",6723.04],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",7479.43],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",13199.41],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",16660.64],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",13308.56],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",17162.66],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",17430.96],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",14939.36],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",34088.86],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",39898.22],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",42997.41],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-97864.22],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-50516.59],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-109705.13],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-77657.05],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-45385.43],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-53779.82],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-32469.52],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-48576.83],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",5990.74],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",6723.04],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",7479.43],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",13199.41],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",16660.64],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",13308.56],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",17162.66],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",17430.96],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",28600.4],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",14994.55],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",26134.02],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",35861.55],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-123170.57],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-57618.07],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-73306.72],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-46299.76],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-36781.23],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-50081.13],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-47197.76],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-47324.37],["Jan (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",17849.66],["Feb (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",8106.06],["Mar (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",9881.23],["Apr (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",6973.25],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",10698.86],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",18636.95],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",19351.84],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",21077.13],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",28600.4],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",14994.55],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",26134.02],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",35861.55],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-123170.57],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-57618.07],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-73306.72],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-46299.76],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-36781.23],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-50081.13],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-47197.76],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-47324.37],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",17849.66],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",8106.06],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",9881.23],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",6973.25],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",10698.86],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",18636.95],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",19351.84],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",21077.13],["Jan (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",30121.4],["Feb (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",20494.19],["Mar (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",12165.44],["Apr (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",31781.94],["Jan (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-44934.86],["Feb (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-66779.24],["Mar (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-115742.05],["Apr (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-39303.73],["Jan (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-37063.38],["Feb (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-15986.55],["Mar (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-20695.89],["Apr (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-34909.62],["Jan (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",7246.97],["Feb (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",5405.86],["Mar (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",12313.75],["Apr (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Personnel Opex",14888.7],["Jan (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",21663.62],["Feb (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",8051.47],["Mar (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",24465.36],["Apr (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Personnel Opex",20283.15],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",30121.4],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",20494.19],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",12165.44],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Personnel Opex",31781.94],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-44934.86],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-66779.24],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-115742.05],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Personnel Opex",-39303.73],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-37063.38],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-15986.55],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-20695.89],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Personnel Opex",-34909.62],["Jan (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",7246.97],["Feb (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",5405.86],["Mar (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",12313.75],["Apr (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Personnel Opex",14888.7],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",21663.62],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",8051.47],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",24465.36],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Personnel Opex",20283.15],["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",27473],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",32720.96],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",38386.41],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",42708.06],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-122221.49],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-110301.15],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-83499.08],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-67347.9],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-54328.84],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-16741.75],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-43164.87],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-24185.04],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Other Opex",15724.55],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Other Opex",14648.75],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Other Opex",14896.09],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Other Opex",7096.58],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Other Opex",11842.06],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Other Opex",19234.77],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Other Opex",16264.08],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Other Opex",25272.8],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",27473],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",32720.96],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",38386.41],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",42708.06],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-122221.49],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-110301.15],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-83499.08],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-67347.9],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-54328.84],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-16741.75],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-43164.87],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-24185.04],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",15724.55],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",14648.75],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",14896.09],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",7096.58],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Other Opex",11842.06],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Other Opex",19234.77],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Other Opex",16264.08],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Other Opex",25272.8],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",38142.19],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",36457.99],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",39388.07],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",21783.02],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-82762.91],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-125427.83],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-75901.7],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-82672.8],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-24682.3],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-36527.73],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-45758.58],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-54521.39],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Other Opex",13732.95],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Other Opex",18196.9],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Other Opex",13752.72],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Other Opex",9863.47],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Other Opex",14208.41],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Other Opex",13506.84],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Other Opex",25460.17],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Other Opex",8358.45],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",38142.19],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",36457.99],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",39388.07],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",21783.02],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-82762.91],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-125427.83],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-75901.7],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-82672.8],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-24682.3],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-36527.73],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-45758.58],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-54521.39],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",13732.95],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",18196.9],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",13752.72],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",9863.47],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Other Opex",14208.41],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Other Opex",13506.84],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Other Opex",25460.17],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Other Opex",8358.45],["Jan (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",16617.85],["Feb (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",14163.74],["Mar (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",15889.33],["Apr (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",23020.37],["Jan (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-124829.81],["Feb (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-72519.83],["Mar (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-50945.75],["Apr (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-108078.6],["Jan (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-17161.94],["Feb (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-27607.69],["Mar (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-26709.74],["Apr (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-42335.93],["Jan (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Other Opex",11735.97],["Feb (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Other Opex",9385.23],["Mar (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Other Opex",16153.47],["Apr (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Other Opex",17705.6],["Jan (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Other Opex",28244.48],["Feb (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Other Opex",16761.13],["Mar (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Other Opex",7551.58],["Apr (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Other Opex",12950.83],["Jan (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",16617.85],["Feb (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",14163.74],["Mar (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",15889.33],["Apr (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",23020.37],["Jan (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-124829.81],["Feb (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-72519.83],["Mar (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-50945.75],["Apr (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-108078.6],["Jan (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-17161.94],["Feb (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-27607.69],["Mar (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-26709.74],["Apr (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-42335.93],["Jan (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",11735.97],["Feb (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",9385.23],["Mar (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",16153.47],["Apr (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",17705.6],["Jan (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Other Opex",28244.48],["Feb (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Other Opex",16761.13],["Mar (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Other Opex",7551.58],["Apr (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Other Opex",12950.83],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",18804.74],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",14854.81],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",29384.34],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",41301.16],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-116886.7],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-121432.58],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-76434.98],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-90292.88],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-32934.5],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-43670.49],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-19058.86],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-47802.15],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Other Opex",15458.6],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Other Opex",8353.58],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Other Opex",16646.3],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Other Opex",5134.54],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Other Opex",25360.81],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Other Opex",9718.65],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Other Opex",9691.58],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Other Opex",25294.21],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",18804.74],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",14854.81],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",29384.34],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",41301.16],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-116886.7],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-121432.58],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-76434.98],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-90292.88],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-32934.5],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-43670.49],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-19058.86],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-47802.15],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",15458.6],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",8353.58],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",16646.3],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",5134.54],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Other Opex",25360.81],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Other Opex",9718.65],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Other Opex",9691.58],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Other Opex",25294.21],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",24004.3],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",29095.86],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",42179.52],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",31374.53],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-129512.52],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-101137.98],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-35018.16],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-124444.7],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-52304.74],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-24852.32],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-47224.2],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-14429.38],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Other Opex",6379.06],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Other Opex",15396.89],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Other Opex",9142.99],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Other Opex",7179.41],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Other Opex",28132.37],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Other Opex",10770.15],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Other Opex",24748.11],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Other Opex",8877.61],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",24004.3],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",29095.86],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",42179.52],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",31374.53],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-129512.52],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-101137.98],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-35018.16],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-124444.7],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-52304.74],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-24852.32],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-47224.2],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-14429.38],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",6379.06],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",15396.89],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",9142.99],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",7179.41],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Other Opex",28132.37],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Other Opex",10770.15],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Other Opex",24748.11],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Other Opex",8877.61],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",14431.18],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",41691.93],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",34346.23],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",39964.15],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-48647.79],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-63907.95],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-50206.91],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-123822.65],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-40260.08],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-24104.91],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-49129.47],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-27910.72],["Jan (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Other Opex",6746.26],["Feb (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Other Opex",8620.3],["Mar (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Other Opex",16231.4],["Apr (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Other Opex",11172.2],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Other Opex",20150.64],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Other Opex",11226.39],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Other Opex",24933.07],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Other Opex",22821.55],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",14431.18],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",41691.93],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",34346.23],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",39964.15],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-48647.79],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-63907.95],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-50206.91],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-123822.65],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-40260.08],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-24104.91],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-49129.47],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-27910.72],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",6746.26],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",8620.3],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",16231.4],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",11172.2],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Other Opex",20150.64],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Other Opex",11226.39],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Other Opex",24933.07],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Other Opex",22821.55],["Jan (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",16966.78],["Feb (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",20155.77],["Mar (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",31948.19],["Apr (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",23969.25],["Jan (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-75696.13],["Feb (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-65608.57],["Mar (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-39309.07],["Apr (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-70564.92],["Jan (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-16628.22],["Feb (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-25538.8],["Mar (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-41033.66],["Apr (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-54287.93],["Jan (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Other Opex",18284.34],["Feb (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Other Opex",7427.6],["Mar (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Other Opex",8320.85],["Apr (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Other Opex",17128.11],["Jan (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Other Opex",13711.5],["Feb (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Other Opex",13469.85],["Mar (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Other Opex",27662.1],["Apr (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Other Opex",11137.38],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",16966.78],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",20155.77],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",31948.19],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Opex",23969.25],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-75696.13],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-65608.57],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-39309.07],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Opex",-70564.92],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-16628.22],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-25538.8],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-41033.66],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Opex",-54287.93],["Jan (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",18284.34],["Feb (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",7427.6],["Mar (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",8320.85],["Apr (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Other Opex",17128.11],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Other Opex",13711.5],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Other Opex",13469.85],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Other Opex",27662.1],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Other Opex",11137.38],["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-36507.27],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-26687.09],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-25609.42],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-19152.35],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",130623.12],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",36543.91],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",91356.76],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",81805.8],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",43343.52],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",46119.77],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",34048.39],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",18462.54],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-14477.91],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-11876.96],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-12005.19],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-7109.05],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Fee Income",-7598.21],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Fee Income",-13329.4],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Fee Income",-24172.54],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Fee Income",-12622.44],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-36507.27],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-26687.09],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-25609.42],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-19152.35],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",130623.12],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",36543.91],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",91356.76],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",81805.8],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",43343.52],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",46119.77],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",34048.39],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",18462.54],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-14477.91],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-11876.96],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-12005.19],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-7109.05],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-7598.21],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-13329.4],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-24172.54],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-12622.44],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-22096.9],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-12526.2],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-23509.71],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-28902.67],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",129742.11],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",56981.34],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",132994.5],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",82924.43],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",48462.75],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",38436.34],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",17783.85],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",51285.73],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-16269.12],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-15498.43],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-11437.68],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-13577.66],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Fee Income",-26184.13],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Fee Income",-20195.7],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Fee Income",-15222.78],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Fee Income",-27347.6],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-22096.9],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-12526.2],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-23509.71],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-28902.67],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",129742.11],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",56981.34],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",132994.5],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",82924.43],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",48462.75],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",38436.34],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",17783.85],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",51285.73],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-16269.12],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-15498.43],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-11437.68],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-13577.66],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-26184.13],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-20195.7],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-15222.78],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-27347.6],["Jan (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-43422.12],["Feb (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-38395.83],["Mar (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-20795.37],["Apr (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-23742.98],["Jan (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",120787.84],["Feb (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",122979.69],["Mar (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",89154.23],["Apr (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",72929.63],["Jan (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",54683.9],["Feb (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",35694.04],["Mar (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",32668.76],["Apr (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",44292.4],["Jan (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-10419.85],["Feb (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-10150.35],["Mar (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-7801.43],["Apr (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-17174.84],["Jan (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Fee Income",-23917.28],["Feb (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Fee Income",-19508.73],["Mar (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Fee Income",-24547.42],["Apr (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Fee Income",-16887.41],["Jan (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-43422.12],["Feb (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-38395.83],["Mar (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-20795.37],["Apr (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-23742.98],["Jan (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",120787.84],["Feb (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",122979.69],["Mar (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",89154.23],["Apr (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",72929.63],["Jan (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",54683.9],["Feb (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",35694.04],["Mar (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",32668.76],["Apr (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",44292.4],["Jan (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-10419.85],["Feb (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-10150.35],["Mar (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-7801.43],["Apr (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-17174.84],["Jan (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-23917.28],["Feb (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-19508.73],["Mar (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-24547.42],["Apr (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-16887.41],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-34235.18],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-20167.38],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-11004.32],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-20470.75],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",89465.26],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",106232.49],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",110215.05],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",59574.32],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",17612.73],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",43613.72],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",26004.89],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",40277.06],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-7343.14],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-14688],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-13441.85],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-10556.52],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Fee Income",-24934.06],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Fee Income",-18355.61],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Fee Income",-14098.29],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Fee Income",-8653.11],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-34235.18],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-20167.38],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-11004.32],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-20470.75],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",89465.26],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",106232.49],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",110215.05],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",59574.32],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",17612.73],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",43613.72],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",26004.89],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",40277.06],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-7343.14],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-14688],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-13441.85],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-10556.52],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-24934.06],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-18355.61],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-14098.29],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-8653.11],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-27269.29],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-14475.64],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-12418.65],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-30654.11],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",71373.18],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",99984.65],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",86485.84],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",120936.68],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",26871.12],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",33446.23],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",18786.45],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",17328.61],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-15319.24],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-19089.48],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-18407.57],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-6082.11],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Fee Income",-22297.86],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Fee Income",-22132.04],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Fee Income",-14190.55],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Fee Income",-9340.08],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-27269.29],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-14475.64],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-12418.65],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-30654.11],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",71373.18],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",99984.65],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",86485.84],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",120936.68],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",26871.12],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",33446.23],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",18786.45],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",17328.61],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-15319.24],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-19089.48],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-18407.57],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-6082.11],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-22297.86],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-22132.04],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-14190.55],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-9340.08],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-37599.84],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-24432.95],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-14207.11],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-39500.89],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",34701.79],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",43851.62],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",110508.06],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",100758.21],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",54993.61],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",47523.61],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",22515.46],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",48472.76],["Jan (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-14723.52],["Feb (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-17596.57],["Mar (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-10933.61],["Apr (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-10612.76],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Fee Income",-24106.06],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Fee Income",-18366.1],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Fee Income",-19930.81],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Fee Income",-9958.32],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-37599.84],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-24432.95],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-14207.11],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-39500.89],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",34701.79],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",43851.62],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",110508.06],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",100758.21],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",54993.61],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",47523.61],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",22515.46],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",48472.76],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-14723.52],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-17596.57],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-10933.61],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-10612.76],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-24106.06],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-18366.1],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-19930.81],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-9958.32],["Jan (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-24089.28],["Feb (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-43700.52],["Mar (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-25952.43],["Apr (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-16404.07],["Jan (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",77803.22],["Feb (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",73300.05],["Mar (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",116973.47],["Apr (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Fee Income",65230.8],["Jan (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",22046.86],["Feb (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",48514.78],["Mar (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",18704.35],["Apr (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Fee Income",49405.79],["Jan (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-13964.73],["Feb (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-15562.16],["Mar (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-14872.66],["Apr (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Fee Income",-5778.06],["Jan (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Fee Income",-22626.97],["Feb (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Fee Income",-24392.08],["Mar (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Fee Income",-11712.8],["Apr (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Fee Income",-22296.87],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-24089.28],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-43700.52],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-25952.43],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Fee Income",-16404.07],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",77803.22],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",73300.05],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",116973.47],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Fee Income",65230.8],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",22046.86],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",48514.78],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",18704.35],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Fee Income",49405.79],["Jan (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-13964.73],["Feb (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-15562.16],["Mar (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-14872.66],["Apr (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Fee Income",-5778.06],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-22626.97],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-24392.08],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-11712.8],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Fee Income",-22296.87],["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-14837.28],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-30370.23],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-32253.54],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-32031.64],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",44109.92],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",70066.35],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",45441.44],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",88706.39],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",51000.8],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",48298.3],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",18917.5],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",36916.45],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-7811.99],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-5725.56],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-14284.72],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-7804.69],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-16590.77],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-23845],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-9129.62],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-15006.08],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-14837.28],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-30370.23],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-32253.54],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-32031.64],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",44109.92],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",70066.35],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",45441.44],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",88706.39],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",51000.8],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",48298.3],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",18917.5],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",36916.45],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-7811.99],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-5725.56],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-14284.72],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-7804.69],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-16590.77],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-23845],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-9129.62],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-15006.08],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-30192.37],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-22921.36],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-30364.1],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-35790.58],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",50792.25],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",66515.61],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",41880.69],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",84393.44],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",16191.63],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",49374.62],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",28081.58],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",30633.53],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-11445.07],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-5342.71],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-12291.96],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-18107.54],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-24415.61],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-9413.22],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-10304.14],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-17987.53],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-30192.37],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-22921.36],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-30364.1],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-35790.58],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",50792.25],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",66515.61],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",41880.69],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",84393.44],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",16191.63],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",49374.62],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",28081.58],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",30633.53],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-11445.07],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-5342.71],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-12291.96],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-18107.54],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-24415.61],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-9413.22],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-10304.14],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-17987.53],["Jan (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-16332],["Feb (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-17908.65],["Mar (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-21016.16],["Apr (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-25946.3],["Jan (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",39125.53],["Feb (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",39029.42],["Mar (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",54277.57],["Apr (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",87927.49],["Jan (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",30515.55],["Feb (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",22565.83],["Mar (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",27398.72],["Apr (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",24029.77],["Jan (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-5802.63],["Feb (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-17904.36],["Mar (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-15805.94],["Apr (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-17568.83],["Jan (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-17620.17],["Feb (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-15548.34],["Mar (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-20385.48],["Apr (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-20927.46],["Jan (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-16332],["Feb (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-17908.65],["Mar (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-21016.16],["Apr (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-25946.3],["Jan (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",39125.53],["Feb (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",39029.42],["Mar (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",54277.57],["Apr (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",87927.49],["Jan (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",30515.55],["Feb (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",22565.83],["Mar (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",27398.72],["Apr (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",24029.77],["Jan (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-5802.63],["Feb (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-17904.36],["Mar (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-15805.94],["Apr (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-17568.83],["Jan (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-17620.17],["Feb (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-15548.34],["Mar (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-20385.48],["Apr (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-20927.46],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-41245.53],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-29616.95],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-18551.97],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-13539.04],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",82952.46],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",73872.71],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",74901.23],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",85688.26],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",25935.88],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",45066.26],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",54365.01],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",36904.78],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-13041.64],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-16582.29],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-4838.16],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-5992.28],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-20436.5],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-18934.02],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-7441.17],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-23824.87],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-41245.53],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-29616.95],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-18551.97],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-13539.04],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",82952.46],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",73872.71],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",74901.23],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",85688.26],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",25935.88],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",45066.26],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",54365.01],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",36904.78],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-13041.64],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-16582.29],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-4838.16],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-5992.28],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-20436.5],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-18934.02],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-7441.17],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-23824.87],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-38305.8],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-18860.38],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-37626.56],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-38856.25],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",92405.3],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",127659.05],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",95195.83],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",119662.55],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",25522.38],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",27383.96],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",37378.93],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",24870.41],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-16182.84],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-10837.54],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-9584.28],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-13146.15],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-26316.79],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-25335.16],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-19013.24],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-13840.48],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-38305.8],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-18860.38],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-37626.56],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-38856.25],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",92405.3],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",127659.05],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",95195.83],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",119662.55],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",25522.38],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",27383.96],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",37378.93],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",24870.41],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-16182.84],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-10837.54],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-9584.28],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-13146.15],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-26316.79],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-25335.16],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-19013.24],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-13840.48],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-19947.46],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-36283.2],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-12491.15],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-20611.6],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",71363.84],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",49488.75],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",108131.33],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",110086.23],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",24793.89],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",37277.64],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",46193.22],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",40376.4],["Jan (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-8372.01],["Feb (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-15625.7],["Mar (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-13958.01],["Apr (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-18361.88],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-13063.79],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-17270.38],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-15340.56],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-17640.43],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-19947.46],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-36283.2],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-12491.15],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-20611.6],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",71363.84],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",49488.75],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",108131.33],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",110086.23],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",24793.89],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",37277.64],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",46193.22],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",40376.4],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-8372.01],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-15625.7],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-13958.01],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-18361.88],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-13063.79],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-17270.38],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-15340.56],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-17640.43],["Jan (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-21073.33],["Feb (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-14428.12],["Mar (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-37140.95],["Apr (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-41122.87],["Jan (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",97441.74],["Feb (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",54029.95],["Mar (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",69343.52],["Apr (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",62880.77],["Jan (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",20523.65],["Feb (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",55429.92],["Mar (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",14010.59],["Apr (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",21026.47],["Jan (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-8396.39],["Feb (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-11781.47],["Mar (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-15838.47],["Apr (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Insurance Income",-7486.05],["Jan (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-7863.53],["Feb (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-18694.34],["Mar (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-23118.91],["Apr (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Insurance Income",-25115.91],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-21073.33],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-14428.12],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-37140.95],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Insurance Income",-41122.87],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",97441.74],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",54029.95],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",69343.52],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Insurance Income",62880.77],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",20523.65],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",55429.92],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",14010.59],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Insurance Income",21026.47],["Jan (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-8396.39],["Feb (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-11781.47],["Mar (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-15838.47],["Apr (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Insurance Income",-7486.05],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-7863.53],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-18694.34],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-23118.91],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Insurance Income",-25115.91],["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-20516.1],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-19425.5],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-16170.58],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-37322.97],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",48075.79],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",45950.69],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",33530.45],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",44506.37],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",38072.65],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",42710.75],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",45306.4],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",34177.22],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Other Income",-15194],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Other Income",-10040.08],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Other Income",-11045.9],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Other Income",-14773.91],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Other Income",-27994.75],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Other Income",-19334.83],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Other Income",-21972.02],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Other Income",-22061.31],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-20516.1],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-19425.5],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-16170.58],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-37322.97],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",48075.79],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",45950.69],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",33530.45],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",44506.37],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",38072.65],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",42710.75],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",45306.4],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",34177.22],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-15194],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-10040.08],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-11045.9],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-14773.91],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Other Income",-27994.75],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Other Income",-19334.83],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Other Income",-21972.02],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Other Income",-22061.31],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-20502.73],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-43419.93],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-22239.49],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-17189.33],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",123583.05],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",69458.31],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",119124.6],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",108084.6],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",25934.76],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",35918.61],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",34973.06],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",45017.28],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Other Income",-11197.55],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Other Income",-14203.91],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Other Income",-18440.87],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Other Income",-12122.18],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Other Income",-7913.14],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Other Income",-13038.56],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Other Income",-24190.26],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Other Income",-10885.95],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-20502.73],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-43419.93],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-22239.49],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-17189.33],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",123583.05],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",69458.31],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",119124.6],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",108084.6],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",25934.76],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",35918.61],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",34973.06],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",45017.28],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-11197.55],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-14203.91],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-18440.87],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-12122.18],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Other Income",-7913.14],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Other Income",-13038.56],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Other Income",-24190.26],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Other Income",-10885.95],["Jan (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-36779.53],["Feb (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-32400.73],["Mar (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-31685.34],["Apr (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-43323.33],["Jan (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",118776.87],["Feb (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",87019.79],["Mar (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",107222.28],["Apr (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",50866.99],["Jan (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",34681.17],["Feb (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",54031.65],["Mar (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",25884.68],["Apr (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",49588.05],["Jan (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Other Income",-7925.24],["Feb (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Other Income",-6645.39],["Mar (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Other Income",-8702.64],["Apr (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Other Income",-8357.61],["Jan (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Other Income",-8270.58],["Feb (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Other Income",-20294.92],["Mar (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Other Income",-7231.55],["Apr (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Other Income",-18912.05],["Jan (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-36779.53],["Feb (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-32400.73],["Mar (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-31685.34],["Apr (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-43323.33],["Jan (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",118776.87],["Feb (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",87019.79],["Mar (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",107222.28],["Apr (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",50866.99],["Jan (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",34681.17],["Feb (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",54031.65],["Mar (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",25884.68],["Apr (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",49588.05],["Jan (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-7925.24],["Feb (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-6645.39],["Mar (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-8702.64],["Apr (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-8357.61],["Jan (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Other Income",-8270.58],["Feb (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Other Income",-20294.92],["Mar (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Other Income",-7231.55],["Apr (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Other Income",-18912.05],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-21519.3],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-27141.38],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-17866.16],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-41470.92],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",76379.59],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",75842.3],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",129672.7],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",64376.49],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",50447.05],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",25011.21],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",20429.32],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",21412.7],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Other Income",-6992.15],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Other Income",-7530.68],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Other Income",-14565.35],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Other Income",-8398.4],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Other Income",-9378.77],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Other Income",-8018.59],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Other Income",-23043.37],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Other Income",-14391.81],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-21519.3],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-27141.38],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-17866.16],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-41470.92],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",76379.59],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",75842.3],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",129672.7],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",64376.49],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",50447.05],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",25011.21],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",20429.32],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",21412.7],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-6992.15],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-7530.68],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-14565.35],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-8398.4],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Other Income",-9378.77],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Other Income",-8018.59],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Other Income",-23043.37],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Other Income",-14391.81],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-16455.32],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-43106.05],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-34857.25],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-25032.02],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",125608.03],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",110735.64],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",51295.49],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",102822.58],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",37627.7],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",29381.35],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",15689.36],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",43480.43],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Other Income",-6663.05],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Other Income",-11260.7],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Other Income",-9376.87],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Other Income",-16651.4],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Other Income",-22058.33],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Other Income",-18646.16],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Other Income",-12516.85],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Other Income",-20700.55],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-16455.32],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-43106.05],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-34857.25],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-25032.02],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",125608.03],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",110735.64],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",51295.49],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",102822.58],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",37627.7],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",29381.35],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",15689.36],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",43480.43],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-6663.05],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-11260.7],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-9376.87],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-16651.4],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Other Income",-22058.33],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Other Income",-18646.16],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Other Income",-12516.85],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Other Income",-20700.55],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-20580.27],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-24811.02],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-23372.15],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-19108.77],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",112469.63],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",111853.59],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",95207.17],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",104537.87],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",31421.86],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",34106],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",23957.98],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",30231.17],["Jan (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Other Income",-18581.19],["Feb (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Other Income",-15473.09],["Mar (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Other Income",-18691.66],["Apr (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Other Income",-8689.88],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Other Income",-20019.68],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Other Income",-9200.48],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Other Income",-20146.24],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Other Income",-17992.21],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-20580.27],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-24811.02],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-23372.15],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-19108.77],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",112469.63],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",111853.59],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",95207.17],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",104537.87],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",31421.86],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",34106],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",23957.98],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",30231.17],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-18581.19],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-15473.09],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-18691.66],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-8689.88],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Other Income",-20019.68],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Other Income",-9200.48],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Other Income",-20146.24],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Other Income",-17992.21],["Jan (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-43209.66],["Feb (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-34897.56],["Mar (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-41836.06],["Apr (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-14334.15],["Jan (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",56705.69],["Feb (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",130856.72],["Mar (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",60908.52],["Apr (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Other Income",96546.05],["Jan (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",20310.22],["Feb (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",14461.11],["Mar (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",32614.21],["Apr (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Other Income",50872.23],["Jan (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Other Income",-18758.07],["Feb (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Other Income",-13197.4],["Mar (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Other Income",-19180.36],["Apr (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Other Income",-15396.6],["Jan (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Other Income",-17213.97],["Feb (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Other Income",-24223.28],["Mar (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Other Income",-27303.94],["Apr (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Other Income",-14281.97],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-43209.66],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-34897.56],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-41836.06],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Other Income",-14334.15],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",56705.69],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",130856.72],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",60908.52],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Other Income",96546.05],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",20310.22],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",14461.11],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",32614.21],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Other Income",50872.23],["Jan (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-18758.07],["Feb (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-13197.4],["Mar (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-19180.36],["Apr (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Other Income",-15396.6],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Other Income",-17213.97],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Other Income",-24223.28],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Other Income",-27303.94],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Other Income",-14281.97],["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Net Interest Income",-32927.29],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Net Interest Income",-26048.14],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Net Interest Income",-17662.01],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Net Interest Income",-26609.33],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Net Interest Income",64721.55],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Net Interest Income",36945.03],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Net Interest Income",100061.4],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Net Interest Income",120377.37],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Net Interest Income",43089.75],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Net Interest Income",29709.42],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Net Interest Income",33208.04],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Net Interest Income",32154.8],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Net Interest Income",-6179.14],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Net Interest Income",-8216.53],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Net Interest Income",-18372.82],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Net Interest Income",-12003.84],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Net Interest Income",-20368.62],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Net Interest Income",-16444.22],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Net Interest Income",-24294.01],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Net Interest Income",-12481.27],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Net Interest Income",-32927.29],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Net Interest Income",-26048.14],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Net Interest Income",-17662.01],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Net Interest Income",-26609.33],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Net Interest Income",64721.55],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Net Interest Income",36945.03],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Net Interest Income",100061.4],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Net Interest Income",120377.37],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Net Interest Income",43089.75],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Net Interest Income",29709.42],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Net Interest Income",33208.04],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Net Interest Income",32154.8],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Net Interest Income",-6179.14],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Net Interest Income",-8216.53],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Net Interest Income",-18372.82],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Net Interest Income",-12003.84],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Net Interest Income",-20368.62],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Net Interest Income",-16444.22],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Net Interest Income",-24294.01],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Net Interest Income",-12481.27]]}}'
              changedProps.datasets = '{"IKF Finance - Model (MIS)":{"schema":["Date","IKF_Branch","IKF_CompanyCode","IKF_Product","Version","Account","Amount"],"types":["string","string","string","string","string","string","number"],"rows2D":[["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-77216.15],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-90008.71],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-104044.74],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-74804.09],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",183196.74],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",195074.36],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",251343.55],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",241610.39],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",94985.71],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",87693.81],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",129433.97],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",67100.03],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-35978.03],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-30260.16],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-38613.44],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-40453.7],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-60327.18],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-30666.52],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-72572.46],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-57325.88],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-77216.15],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-90008.71],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-104044.74],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-74804.09],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",183196.74],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",195074.36],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",251343.55],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",241610.39],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",94985.71],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",87693.81],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",129433.97],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",67100.03],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-35978.03],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-30260.16],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-38613.44],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-40453.7],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-60327.18],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-30666.52],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-72572.46],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-57325.88],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-84687.8],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-84813.97],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-107485.85],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-88394.38],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",236411.09],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",242612.87],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",188117.72],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",295075.03],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",100213.19],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",86992.86],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",131811.18],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",111974.58],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-37533.51],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-31316.47],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-28300.6],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-34246.52],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-47156.1],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-81686.78],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-54211.05],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-50974.19],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-84687.8],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-84813.97],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-107485.85],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-88394.38],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",236411.09],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",242612.87],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",188117.72],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",295075.03],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",100213.19],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",86992.86],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",131811.18],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",111974.58],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-37533.51],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-31316.47],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-28300.6],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-34246.52],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-47156.1],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-81686.78],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-54211.05],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-50974.19],["Jan (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-70873.66],["Feb (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-74023.01],["Mar (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-85781.47],["Apr (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-113826.38],["Jan (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",202428.8],["Feb (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",188776.47],["Mar (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",286632.7],["Apr (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",247545.85],["Jan (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",124909.67],["Feb (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",95199.7],["Mar (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",62572.97],["Apr (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",128417.75],["Jan (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-26126.16],["Feb (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-37573.82],["Mar (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-25538.11],["Apr (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-41455.39],["Jan (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-49999.08],["Feb (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-41991.7],["Mar (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-37400.6],["Apr (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-42216.77],["Jan (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-70873.66],["Feb (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-74023.01],["Mar (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-85781.47],["Apr (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-113826.38],["Jan (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",202428.8],["Feb (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",188776.47],["Mar (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",286632.7],["Apr (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",247545.85],["Jan (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",124909.67],["Feb (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",95199.7],["Mar (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",62572.97],["Apr (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",128417.75],["Jan (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-26126.16],["Feb (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-37573.82],["Mar (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-25538.11],["Apr (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-41455.39],["Jan (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-49999.08],["Feb (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-41991.7],["Mar (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-37400.6],["Apr (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-42216.77],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-70137.03],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-94596.05],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-79334.49],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-70673.02],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",303414.6],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",269046.52],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",256837.84],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",315965.64],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",78323.54],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",137825.86],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",131258.28],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",103046.75],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-36039.54],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-36131.7],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-36932.8],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-22899.06],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-41518.32],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-45044.59],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-64107.43],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-54230.05],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-70137.03],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-94596.05],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-79334.49],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-70673.02],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",303414.6],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",269046.52],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",256837.84],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",315965.64],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",78323.54],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",137825.86],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",131258.28],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",103046.75],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-36039.54],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-36131.7],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-36932.8],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-22899.06],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-41518.32],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-45044.59],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-64107.43],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-54230.05],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-88048.08],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-93113.15],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-68982.91],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-86578.55],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",174830.47],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",307664.81],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",232018.72],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",252476.18],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",80042.39],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",111824.86],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",131040.39],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",83599.15],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-34868.35],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-29578.81],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-47665.83],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-36839.61],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-54930.76],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-52110.87],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-51758.26],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-40702.36],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-88048.08],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-93113.15],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-68982.91],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-86578.55],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",174830.47],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",307664.81],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",232018.72],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",252476.18],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",80042.39],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",111824.86],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",131040.39],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",83599.15],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-34868.35],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-29578.81],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-47665.83],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-36839.61],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-54930.76],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-52110.87],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-51758.26],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-40702.36],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-92005.03],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-92070.74],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-108641.94],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-88188.49],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",244446.97],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",262328.82],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",255559.05],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",228049.5],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",107500.08],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",124709.88],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",97771.42],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",130396.49],["Jan (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-27618.41],["Feb (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-43184.31],["Mar (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-35023.44],["Apr (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-29665.68],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-66566.04],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-65867.16],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-52210.23],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-77916.3],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-92005.03],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-92070.74],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-108641.94],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-88188.49],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",244446.97],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",262328.82],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",255559.05],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",228049.5],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",107500.08],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",124709.88],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",97771.42],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",130396.49],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-27618.41],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-43184.31],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-35023.44],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-29665.68],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-66566.04],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-65867.16],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-52210.23],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-77916.3],["Jan (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-84629.76],["Feb (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-70846.28],["Mar (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-69167.13],["Apr (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-104769.77],["Jan (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",221650.84],["Feb (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",305124.56],["Mar (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",295691.75],["Apr (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",259018.36],["Jan (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",72070.11],["Feb (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",64227.52],["Mar (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",125862.45],["Apr (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",127315.83],["Jan (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-30566.99],["Feb (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-31693.94],["Mar (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-33517.31],["Apr (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Interest Expense",-27177.11],["Jan (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-66334.32],["Feb (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-36975.12],["Mar (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-48862.25],["Apr (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Interest Expense",-50681.37],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-84629.76],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-70846.28],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-69167.13],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Interest Expense",-104769.77],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",221650.84],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",305124.56],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",295691.75],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Interest Expense",259018.36],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",72070.11],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",64227.52],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",125862.45],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Interest Expense",127315.83],["Jan (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-30566.99],["Feb (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-31693.94],["Mar (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-33517.31],["Apr (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Interest Expense",-27177.11],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-66334.32],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-36975.12],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-48862.25],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Interest Expense",-50681.37],["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-59300.28],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-70011.3],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-80779.92],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-67335.08],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",160848.45],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",215368.3],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",135245.09],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",163494.82],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",91440.64],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",47788.78],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",85326.05],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",72517.56],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Opex",-21728.34],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Opex",-30095.25],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Opex",-20317.02],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Opex",-22861.63],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Opex",-32819.83],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Opex",-38624.17],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Opex",-43165.52],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Opex",-35516.7],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-59300.28],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-70011.3],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-80779.92],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-67335.08],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",160848.45],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",215368.3],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",135245.09],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",163494.82],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",91440.64],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",47788.78],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",85326.05],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",72517.56],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Opex",-21728.34],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Opex",-30095.25],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Opex",-20317.02],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Opex",-22861.63],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Opex",-32819.83],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Opex",-38624.17],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Opex",-43165.52],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Opex",-35516.7],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-49260.84],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-69106.01],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-75753.19],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-48749.38],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",117865.17],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",233741.37],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",122573.22],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",168553.95],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",43499.91],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",72513.12],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",66145.59],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",77464.82],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Opex",-30836.11],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Opex",-31995.78],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Opex",-31651.9],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Opex",-25090.58],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Opex",-27305.22],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Opex",-26998.94],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Opex",-44727.96],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Opex",-36232.02],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-49260.84],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-69106.01],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-75753.19],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-48749.38],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",117865.17],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",233741.37],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",122573.22],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",168553.95],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",43499.91],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",72513.12],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",66145.59],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",77464.82],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Opex",-30836.11],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Opex",-31995.78],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Opex",-31651.9],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Opex",-25090.58],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Opex",-27305.22],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Opex",-26998.94],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Opex",-44727.96],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Opex",-36232.02],["Jan (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-50330.19],["Feb (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-40879.73],["Mar (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-56240.09],["Apr (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-48077.59],["Jan (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",174254.49],["Feb (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",182834.33],["Mar (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",114270.36],["Apr (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",214885.74],["Jan (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",60043.83],["Feb (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",44149.37],["Mar (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",65298.56],["Apr (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",81743.96],["Jan (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Opex",-30762.1],["Feb (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Opex",-22169.07],["Mar (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Opex",-29033.38],["Apr (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Opex",-32424.61],["Jan (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Opex",-52768.8],["Feb (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Opex",-41634.24],["Mar (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Opex",-23932.73],["Apr (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Opex",-41087.16],["Jan (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-50330.19],["Feb (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-40879.73],["Mar (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-56240.09],["Apr (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-48077.59],["Jan (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",174254.49],["Feb (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",182834.33],["Mar (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",114270.36],["Apr (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",214885.74],["Jan (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",60043.83],["Feb (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",44149.37],["Mar (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",65298.56],["Apr (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",81743.96],["Jan (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Opex",-30762.1],["Feb (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Opex",-22169.07],["Mar (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Opex",-29033.38],["Apr (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Opex",-32424.61],["Jan (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Opex",-52768.8],["Feb (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Opex",-41634.24],["Mar (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Opex",-23932.73],["Apr (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Opex",-41087.16],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-32769.81],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-57550.16],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-43277.12],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-76544.57],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",163167.1],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",158038.56],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",205318.1],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",158682.64],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",53157.34],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",94684.91],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",39729.42],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",86562.94],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Opex",-29312.86],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Opex",-26655.1],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Opex",-23970.53],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Opex",-23029.21],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Opex",-53268.54],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Opex",-29116.12],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Opex",-26933.04],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Opex",-37848.76],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-32769.81],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-57550.16],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-43277.12],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-76544.57],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",163167.1],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",158038.56],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",205318.1],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",158682.64],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",53157.34],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",94684.91],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",39729.42],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",86562.94],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Opex",-29312.86],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Opex",-26655.1],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Opex",-23970.53],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Opex",-23029.21],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Opex",-53268.54],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Opex",-29116.12],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Opex",-26933.04],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Opex",-37848.76],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-38943.66],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-63184.72],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-82077.74],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-74371.94],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",227376.74],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",151654.57],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",144723.29],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",202101.75],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",97690.17],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",78632.14],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",79693.72],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",63006.21],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Opex",-12369.8],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Opex",-22119.93],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Opex",-16622.42],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Opex",-20378.82],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Opex",-44793.01],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Opex",-24078.71],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Opex",-41910.77],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Opex",-26308.57],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-38943.66],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-63184.72],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-82077.74],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-74371.94],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",227376.74],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",151654.57],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",144723.29],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",202101.75],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",97690.17],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",78632.14],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",79693.72],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",63006.21],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Opex",-12369.8],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Opex",-22119.93],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Opex",-16622.42],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Opex",-20378.82],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Opex",-44793.01],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Opex",-24078.71],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Opex",-41910.77],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Opex",-26308.57],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-43031.58],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-56686.48],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-60480.25],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-75825.7],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",171818.36],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",121526.02],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",123513.63],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",170122.41],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",77041.31],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",74186.04],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",96327.23],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",75235.09],["Jan (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Opex",-24595.92],["Feb (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Opex",-16726.36],["Mar (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Opex",-26112.63],["Apr (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Opex",-18145.45],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Opex",-30849.5],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Opex",-29863.34],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Opex",-44284.91],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Opex",-43898.68],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-43031.58],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-56686.48],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-60480.25],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-75825.7],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",171818.36],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",121526.02],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",123513.63],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",170122.41],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",77041.31],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",74186.04],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",96327.23],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",75235.09],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Opex",-24595.92],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Opex",-16726.36],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Opex",-26112.63],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Opex",-18145.45],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Opex",-30849.5],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Opex",-29863.34],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Opex",-44284.91],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Opex",-43898.68],["Jan (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-47088.18],["Feb (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-40649.96],["Mar (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-44113.63],["Apr (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-55751.19],["Jan (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",120630.99],["Feb (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",132387.81],["Mar (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",155051.12],["Apr (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Opex",109868.65],["Jan (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",53691.6],["Feb (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",41525.35],["Mar (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",61729.55],["Apr (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Opex",89197.55],["Jan (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Opex",-25531.31],["Feb (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Opex",-12833.46],["Mar (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Opex",-20634.6],["Apr (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Opex",-32016.81],["Jan (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Opex",-35375.12],["Feb (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Opex",-21521.32],["Mar (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Opex",-52127.46],["Apr (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Opex",-31420.53],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-47088.18],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-40649.96],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-44113.63],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Opex",-55751.19],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",120630.99],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",132387.81],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",155051.12],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Opex",109868.65],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",53691.6],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",41525.35],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",61729.55],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Opex",89197.55],["Jan (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Opex",-25531.31],["Feb (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Opex",-12833.46],["Mar (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Opex",-20634.6],["Apr (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Opex",-32016.81],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Opex",-35375.12],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Opex",-21521.32],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Opex",-52127.46],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Opex",-31420.53],["Jan (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",41648.63],["Feb (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",77209.53],["Mar (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",87450.51],["Apr (2025)","Apra Tower","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",46845.93],["Jan (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",135944.54],["Feb (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",-94654.05],["Mar (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",51007.98],["Apr (2025)","Apra Tower","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",6259.49],["Jan (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",20772.21],["Feb (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",46016.4],["Mar (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",-5946.68],["Apr (2025)","Apra Tower","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",-21113.57],["Jan (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Revenue",7287.86],["Feb (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Revenue",35174.29],["Mar (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Revenue",-558.55],["Apr (2025)","Apra Tower","IKF Finance Ltd","MSME Loans","Actual","Revenue",27699.19],["Jan (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Revenue",7861.56],["Feb (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Revenue",24008.94],["Mar (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Revenue",37545.18],["Apr (2025)","Apra Tower","IKF Finance Ltd","Home Loans","Actual","Revenue",9853.82],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",41648.63],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",77209.53],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",87450.51],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",46845.93],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",135944.54],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",-94654.05],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",51007.98],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",6259.49],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",20772.21],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",46016.4],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",-5946.68],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",-21113.57],["Jan (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Revenue",7287.86],["Feb (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Revenue",35174.29],["Mar (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Revenue",-558.55],["Apr (2025)","Apra Tower","IKF House Finance Ltd","MSME Loans","Actual","Revenue",27699.19],["Jan (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Revenue",7861.56],["Feb (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Revenue",24008.94],["Mar (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Revenue",37545.18],["Apr (2025)","Apra Tower","IKF House Finance Ltd","Home Loans","Actual","Revenue",9853.82],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",41484.78],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",30789.9],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",76032.24],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",24925.83],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",180194.28],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",-277501.05],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",162782.66],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",-121835.21],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",24840.66],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",41575.46],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",75257.48],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",54914.7],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Revenue",15432.02],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Revenue",15604.36],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Revenue",29466.63],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","MSME Loans","Actual","Revenue",14785.87],["Jan (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Revenue",-36215.47],["Feb (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Revenue",28081.04],["Mar (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Revenue",15761.6],["Apr (2025)","Part II Gurugram","IKF Finance Ltd","Home Loans","Actual","Revenue",45170.62],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",41484.78],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",30789.9],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",76032.24],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",24925.83],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",180194.28],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",-277501.05],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",162782.66],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",-121835.21],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",24840.66],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",41575.46],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",75257.48],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",54914.7],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Revenue",15432.02],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Revenue",15604.36],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Revenue",29466.63],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","MSME Loans","Actual","Revenue",14785.87],["Jan (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Revenue",-36215.47],["Feb (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Revenue",28081.04],["Mar (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Revenue",15761.6],["Apr (2025)","Part II Gurugram","IKF House Finance Ltd","Home Loans","Actual","Revenue",45170.62],["Jan (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",-10562.64],["Feb (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",3768.99],["Mar (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",73867.01],["Apr (2025)","Borivali","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",18184.05],["Jan (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",58567.47],["Feb (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",-82064.95],["Mar (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",147793.46],["Apr (2025)","Borivali","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",-107040.06],["Jan (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",64782.75],["Feb (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",163729.04],["Mar (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",74518.43],["Apr (2025)","Borivali","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",-54027.9],["Jan (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Revenue",33232.28],["Feb (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Revenue",7485.9],["Mar (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Revenue",19662.62],["Apr (2025)","Borivali","IKF Finance Ltd","MSME Loans","Actual","Revenue",30415.38],["Jan (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Revenue",28694.1],["Feb (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Revenue",25475.97],["Mar (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Revenue",-13496.87],["Apr (2025)","Borivali","IKF Finance Ltd","Home Loans","Actual","Revenue",11441.91],["Jan (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",-10562.64],["Feb (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",3768.99],["Mar (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",73867.01],["Apr (2025)","Borivali","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",18184.05],["Jan (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",58567.47],["Feb (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",-82064.95],["Mar (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",147793.46],["Apr (2025)","Borivali","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",-107040.06],["Jan (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",64782.75],["Feb (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",163729.04],["Mar (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",74518.43],["Apr (2025)","Borivali","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",-54027.9],["Jan (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Revenue",33232.28],["Feb (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Revenue",7485.9],["Mar (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Revenue",19662.62],["Apr (2025)","Borivali","IKF House Finance Ltd","MSME Loans","Actual","Revenue",30415.38],["Jan (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Revenue",28694.1],["Feb (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Revenue",25475.97],["Mar (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Revenue",-13496.87],["Apr (2025)","Borivali","IKF House Finance Ltd","Home Loans","Actual","Revenue",11441.91],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",-46075.36],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",49234.17],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",19965.53],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",76447.48],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",85129.81],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",-1713.31],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",-104939.97],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",85675.57],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",49980.19],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",-88170.65],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",54851.82],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",89619.83],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Revenue",49243.74],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Revenue",23338.57],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Revenue",5836.12],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","MSME Loans","Actual","Revenue",24094.49],["Jan (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Revenue",16129.14],["Feb (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Revenue",10322.23],["Mar (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Revenue",35765.16],["Apr (2025)","Dosti Pinacle","IKF Finance Ltd","Home Loans","Actual","Revenue",38029.68],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",-46075.36],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",49234.17],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",19965.53],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",76447.48],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",85129.81],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",-1713.31],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",-104939.97],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",85675.57],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",49980.19],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",-88170.65],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",54851.82],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",89619.83],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Revenue",49243.74],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Revenue",23338.57],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Revenue",5836.12],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","MSME Loans","Actual","Revenue",24094.49],["Jan (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Revenue",16129.14],["Feb (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Revenue",10322.23],["Mar (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Revenue",35765.16],["Apr (2025)","Dosti Pinacle","IKF House Finance Ltd","Home Loans","Actual","Revenue",38029.68],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",6518.08],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",45082.17],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",54762.4],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",41881.57],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",62020.29],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",170021.95],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",56771.28],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",71664.52],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",-21230.66],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",27548.44],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",-55654.46],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",72801.73],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Revenue",4811.85],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Revenue",6753.62],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Revenue",19845.83],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","MSME Loans","Actual","Revenue",8807.5],["Jan (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Revenue",26519.07],["Feb (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Revenue",6892.23],["Mar (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Revenue",11750.19],["Apr (2025)","Broadway Business Centre","IKF Finance Ltd","Home Loans","Actual","Revenue",-20508.43],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",6518.08],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",45082.17],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",54762.4],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",41881.57],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",62020.29],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",170021.95],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",56771.28],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",71664.52],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",-21230.66],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",27548.44],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",-55654.46],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",72801.73],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Revenue",4811.85],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Revenue",6753.62],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Revenue",19845.83],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","MSME Loans","Actual","Revenue",8807.5],["Jan (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Revenue",26519.07],["Feb (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Revenue",6892.23],["Mar (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Revenue",11750.19],["Apr (2025)","Broadway Business Centre","IKF House Finance Ltd","Home Loans","Actual","Revenue",-20508.43],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",27697.2],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",22750.6],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",117980.47],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",65857.59],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",-192588.35],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",165337.11],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",70054.67],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",275854.16],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",14153.59],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",87625.79],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",-64894.96],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",-24809.19],["Jan (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Revenue",-3647.59],["Feb (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Revenue",10789.35],["Mar (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Revenue",16210.78],["Apr (2025)","Amar Chambers","IKF Finance Ltd","MSME Loans","Actual","Revenue",6317.86],["Jan (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Revenue",22499.97],["Feb (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Revenue",21324.68],["Mar (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Revenue",17608.95],["Apr (2025)","Amar Chambers","IKF Finance Ltd","Home Loans","Actual","Revenue",64397.26],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",27697.2],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",22750.6],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",117980.47],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",65857.59],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",-192588.35],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",165337.11],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",70054.67],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",275854.16],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",14153.59],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",87625.79],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",-64894.96],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",-24809.19],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Revenue",-3647.59],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Revenue",10789.35],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Revenue",16210.78],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","MSME Loans","Actual","Revenue",6317.86],["Jan (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Revenue",22499.97],["Feb (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Revenue",21324.68],["Mar (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Revenue",17608.95],["Apr (2025)","Amar Chambers","IKF House Finance Ltd","Home Loans","Actual","Revenue",64397.26],["Jan (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",1957.49],["Feb (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",-2011.56],["Mar (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",-47592.08],["Apr (2025)","Pusa Road","IKF Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",84003.96],["Jan (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",289497.98],["Feb (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",198539.99],["Mar (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",15492.46],["Apr (2025)","Pusa Road","IKF Finance Ltd","Construction Equipment Loans","Actual","Revenue",76145.13],["Jan (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",109970.45],["Feb (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",172765.11],["Mar (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",-54085.5],["Apr (2025)","Pusa Road","IKF Finance Ltd","Cars & MUV Loans","Actual","Revenue",9866.59],["Jan (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Revenue",2694.53],["Feb (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Revenue",2352.75],["Mar (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Revenue",-13433.4],["Apr (2025)","Pusa Road","IKF Finance Ltd","MSME Loans","Actual","Revenue",26387.97],["Jan (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Revenue",54685.97],["Feb (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Revenue",-49233.52],["Mar (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Revenue",38412.99],["Apr (2025)","Pusa Road","IKF Finance Ltd","Home Loans","Actual","Revenue",-4917.14],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",1957.49],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",-2011.56],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",-47592.08],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Commercial Vehicle Loans","Actual","Revenue",84003.96],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",289497.98],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",198539.99],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",15492.46],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Construction Equipment Loans","Actual","Revenue",76145.13],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",109970.45],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",172765.11],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",-54085.5],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Cars & MUV Loans","Actual","Revenue",9866.59],["Jan (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Revenue",2694.53],["Feb (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Revenue",2352.75],["Mar (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Revenue",-13433.4],["Apr (2025)","Pusa Road","IKF House Finance Ltd","MSME Loans","Actual","Revenue",26387.97],["Jan (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Revenue",54685.97],["Feb (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Revenue",-49233.52],["Mar (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Revenue",38412.99],["Apr (2025)","Pusa Road","IKF House Finance Ltd","Home Loans","Actual","Revenue",-4917.14]]}}';
            }

            if(changedProps.datasets == 'SmartStream'){
              this.customer = 'SmartStream';
            }
            
            }

          const parsed = JSON.parse(changedProps.datasets || '{}') || {}
          // reconstruct rows as array of objects for convenience
          const rebuilt = {}
          Object.keys(parsed).forEach(name => {
            const { schema = [], rows2D = [] } = parsed[name] || {}
            const rows = rows2D.map(arr => {
              const obj = {}
              for (let i = 0; i < schema.length; i++) obj[schema[i]] = arr[i]
              return obj
            })
            rebuilt[name] = { schema, rows, rows2D }
          })
          this._datasets = rebuilt

          const tag = Object.entries(this._datasets)
            .map(([k, v]) => `${k}: ${v?.rows?.length || 0} rows`)
            .join(' · ')
          // this.$modelChip.textContent = tag || 'AI Assistant'
          this._updateDatasetsUI()
        } catch {
          this._datasets = {}
          // this.$modelChip.textContent = 'AI Assistant'
          this._updateDatasetsUI()
        }
      } else if (!this.$modelChip.textContent) {
        // this.$modelChip.textContent = 'AI Assistant'
        this._updateDatasetsUI()
      }

      // If first render and datasets exist, nudge the user
      if (!this.$chat.innerHTML) {
        if (this._props.welcomeText)
          this._append('bot', this._props.welcomeText)
      }
      if (this.$chat.innerHTML && Object.keys(this._datasets).length > 0) {
        this._append(
          'bot',
          'Datasets received. Ready to answer any analytical questions!'
        )
      }
    }

    // Direct method SAC will call when JSON has no `body`
  getLastSummary() {
    // add a console marker so you can confirm it gets called
    console.log("[PerciBOT] getLastSummary invoked");
    // console.debug("[PerciBOT] getLastSummary invoked, waiting 10s...");

    // // Block for 10 seconds
    // const start = Date.now();
    // while (Date.now() - start < 10000) {
    //   // spin-wait (not elegant, but SAC expects sync return)
    // }
    return this.summaryResponse ? String(this.summaryResponse) : "";
  }

    // SAC will call this for custom methods defined in JSON
    onCustomWidgetRequest (methodName, params) {
      console.log('onCustomWidgetRequest', params)
      if (methodName === 'setDatasets'){
      console.log(params)
      let payload = ''
      if (typeof params === 'string') {
        payload = params
      } else if (Array.isArray(params)) {
        // parameters listed in the JSON → SAC passes an array in that order
        payload = params[0] || ''
      } else if (params && typeof params === 'object') {
        // some runtimes send a map
        payload = params.payload || ''
      }

      if (payload) this._applyDatasets(payload)
      }else if (methodName === 'generateSummary'){
        console.log(params)

        let payload = ''
      if (typeof params === 'string') {
        payload = params
      } else if (Array.isArray(params)) {
        // parameters listed in the JSON → SAC passes an array in that order
        payload = params[0] || ''
      } else if (params && typeof params === 'object') {
        // some runtimes send a map
        payload = params.payload || 'Generate a executive summary of the data in 3-4 sentences.'
      }

       this._generateSummary(payload);
      return;
    }

    if (methodName === 'getLastSummary') {
    // must synchronously return a string
    return this.summaryResponse || '';
  }
  }

     async _generateSummary(prompt){
      
      const q = (prompt || '').trim()
      if (!q) return
      this._append('user', q)
      this.$input.value = ''

      if (!this._props.apiKey) {
        this._append(
          'bot',
          '⚠️ API key not set. Open the Builder panel to configure.'
        )
        return
      }

      // show typing indicator + lock UI
      this._startTyping()
      this.$send.disabled = true

      try {
        // Build dataset context (schema + small preview)
        const dsContext = this._buildDatasetContext({
          maxRowsPerSet: 500,
          maxCharsTotal: 8000
        })


        
        const system = [
          // this._props.systemPrompt ||
          //   'You are PerciBOT, a helpful and concise assistant for SAP Analytics Cloud.',
          // '',
          // dsContext,
          // '',
          // 'When responding, Keep it concise and executive-friendly.'
          


          `
You are **PerciBOT**, a conversational AI for analytics.

Your role is to answer user queries about financial performance across Companies, Branches, Products, and Accounts (Revenue, Opex, Interest Expense).
All figures are in INR, aggregated for Jan–Apr 2025.

Use this dataset summary as your ground truth. Provide clear, business-analyst style answers with tables or breakdowns when useful.

Companies:
- IKF Finance Ltd → Revenue: 4,178,132.07, Opex: 3,183,336.85, Interest Expense: 5,010,185.45
- IKF House Finance Ltd → Revenue: 4,178,132.07, Opex: 3,183,336.85, Interest Expense: 5,010,185.45

Branches:
- Amar Chambers → Revenue: 1,441,039.88, Opex: 878,538.58, Interest Expense: 1,343,608.88
- Apra Tower → Revenue: 1,080,626.42, Opex: 898,949.30, Interest Expense: 1,076,335.00
- Borivali → Revenue: 988,853.88, Opex: 936,281.90, Interest Expense: 1,379,355.52
- Broadway Business Centre → Revenue: 1,194,118.34, Opex: 1,155,437.00, Interest Expense: 1,376,638.86
- Dosti Pinacle → Revenue: 945,528.48, Opex: 998,130.38, Interest Expense: 1,888,149.90
- Part II Gurugram → Revenue: 883,096.80, Opex: 809,298.44, Interest Expense: 1,324,802.60
- Pusa Road → Revenue: 1,823,000.34, Opex: 690,038.10, Interest Expense: 1,631,480.14

Products:
- Cars & MUV Loans → Revenue: 1,731,314.20, Opex: 3,940,045.52, Interest Expense: 5,856,240.84
- Commercial Vehicle Loans → Revenue: 2,060,208.94, Opex: -3,216,340.58, Interest Expense: -4,835,485.26
- Construction Equipment Loans → Revenue: 2,764,835.70, Opex: 9,039,834.06, Interest Expense: 13,885,900.40
- Home Loans → Revenue: 947,721.66, Opex: -2,036,823.34, Interest Expense: -2,992,687.48
- MSME Loans → Revenue: 852,183.64, Opex: -1,360,041.96, Interest Expense: -1,893,597.60

Branch × Product:
- Amar Chambers × Cars & MUV Loans → Revenue: 24,150.46, Opex: 645,579.34, Interest Expense: 920,755.74
- Amar Chambers × Commercial Vehicle Loans → Revenue: 468,571.72, Opex: -472,048.02, Interest Expense: -761,812.40
- Amar Chambers × Construction Equipment Loans → Revenue: 637,315.18, Opex: 1,173,960.84, Interest Expense: 1,980,768.68
- Amar Chambers × Home Loans → Revenue: 251,661.72, Opex: -297,792.86, Interest Expense: -525,119.46
- Amar Chambers × MSME Loans → Revenue: 59,340.80, Opex: -171,160.72, Interest Expense: -270,983.68
- Apra Tower × Cars & MUV Loans → Revenue: 79,456.72, Opex: 594,146.06, Interest Expense: 758,427.04
- Apra Tower × Commercial Vehicle Loans → Revenue: 506,309.20, Opex: -554,853.16, Interest Expense: -692,147.38
- Apra Tower × Construction Equipment Loans → Revenue: 197,115.92, Opex: 1,349,913.32, Interest Expense: 1,742,450.08
- Apra Tower × Home Loans → Revenue: 158,539.00, Opex: -300,252.44, Interest Expense: -441,784.08
- Apra Tower × MSME Loans → Revenue: 139,205.58, Opex: -190,004.48, Interest Expense: -290,610.66
- Borivali × Cars & MUV Loans → Revenue: 498,004.64, Opex: 502,471.44, Interest Expense: 822,200.18
- Borivali × Commercial Vehicle Loans → Revenue: 170,514.82, Opex: -391,055.20, Interest Expense: -689,009.04
- Borivali × Construction Equipment Loans → Revenue: 34,511.84, Opex: 1,372,489.84, Interest Expense: 1,850,767.64
- Borivali × Home Loans → Revenue: 104,230.22, Opex: -318,845.86, Interest Expense: -343,216.30
- Borivali × MSME Loans → Revenue: 181,592.36, Opex: -228,778.32, Interest Expense: -261,386.96
- Broadway Business Centre × Cars & MUV Loans → Revenue: 46,930.10, Opex: 638,044.48, Interest Expense: 813,013.58
- Broadway Business Centre × Commercial Vehicle Loans → Revenue: 296,488.44, Opex: -517,156.12, Interest Expense: -673,445.38
- Broadway Business Centre × Construction Equipment Loans → Revenue: 720,956.08, Opex: 1,451,712.70, Interest Expense: 1,933,980.36
- Broadway Business Centre × Home Loans → Revenue: 49,306.12, Opex: -274,182.12, Interest Expense: -399,004.50
- Broadway Business Centre × MSME Loans → Revenue: 80,437.60, Opex: -142,981.94, Interest Expense: -297,905.20
- Dosti Pinacle × Cars & MUV Loans → Revenue: 212,562.38, Opex: 548,269.22, Interest Expense: 900,908.86
- Dosti Pinacle × Commercial Vehicle Loans → Revenue: 199,143.64, Opex: -420,283.32, Interest Expense: -629,481.18
- Dosti Pinacle × Construction Equipment Loans → Revenue: 128,304.20, Opex: 1,370,412.80, Interest Expense: 2,290,529.20
- Dosti Pinacle × Home Loans → Revenue: 200,492.42, Opex: -294,332.92, Interest Expense: -409,800.78
- Dosti Pinacle × MSME Loans → Revenue: 205,025.84, Opex: -205,935.40, Interest Expense: -264,006.20
- Part II Gurugram × Cars & MUV Loans → Revenue: 393,176.60, Opex: 519,246.88, Interest Expense: 861,983.62
- Part II Gurugram × Commercial Vehicle Loans → Revenue: 346,465.50, Opex: -485,738.84, Interest Expense: -730,764.00
- Part II Gurugram × Construction Equipment Loans → Revenue: -112,718.64, Opex: 1,285,467.42, Interest Expense: 1,924,433.42
- Part II Gurugram × Home Loans → Revenue: 105,595.58, Opex: -270,528.28, Interest Expense: -468,056.24
- Part II Gurugram × MSME Loans → Revenue: 150,577.76, Opex: -239,148.74, Interest Expense: -262,794.20
- Pusa Road × Cars & MUV Loans → Revenue: 477,033.30, Opex: 492,288.10, Interest Expense: 778,951.82
- Pusa Road × Commercial Vehicle Loans → Revenue: 72,715.62, Opex: -375,205.92, Interest Expense: -658,825.88
- Pusa Road × Construction Equipment Loans → Revenue: 1,159,351.12, Opex: 1,035,877.14, Interest Expense: 2,162,971.02
- Pusa Road × Home Loans → Revenue: 77,896.60, Opex: -280,888.86, Interest Expense: -405,706.12
- Pusa Road × MSME Loans → Revenue: 36,003.70, Opex: -182,032.36, Interest Expense: -245,910.70

When responding, Keep it concise and executive-friendly.
`

        ].join('\n')

        console.log(system)

        // return;

        const body = {
          model: this._props.model || 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: q }
          ],
          temperature: 0.2
        }
        console.log('openAI prompt', JSON.stringify(body))
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this._props.apiKey}`
          },
          body: JSON.stringify(body)
        })

        if (!res.ok) {
          const txt = await res.text()
          throw new Error(`${res.status} ${res.statusText}: ${txt}`)
        }

        const data = await res.json()
        const ans = data.choices?.[0]?.message?.content || '(No content)'
        this.summaryResponse = ans;
        return ans;
      }catch (e) {
        this._stopTyping()
        this._append('bot', ` ${e.message}`)
        
    }
  }

    setProperties (props) {
      this.onCustomWidgetAfterUpdate(props)
    } // SAC older runtimes

    _applyTheme () {
      const wrap = this._shadowRoot.querySelector('.wrap')
      const header = this._shadowRoot.querySelector('header')
      const panel = this._shadowRoot.querySelector('.panel')
      const buttons = this._shadowRoot.querySelectorAll('button.primary')

      wrap.style.background = this._props.surfaceColor || '#ffffff'
      wrap.style.color = this._props.textColor || '#0b1221'
      panel.style.background = this._props.surfaceAlt || '#f6f8ff'
      header.style.background = `linear-gradient(90deg, ${
        this._props.primaryColor || '#1f4fbf'
      }, ${this._props.primaryDark || '#163a8a'})`

      buttons.forEach(btn => {
        btn.style.background = `linear-gradient(90deg, ${
          this._props.primaryColor || '#1f4fbf'
        }, ${this._props.primaryDark || '#163a8a'})`
      })
    }

    _escapeHtml (s = '') {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    }

    _mdLists (md) {
      // Convert contiguous lines of "-" or "*" to <ul>
      const lines = md.split('\n')
      const out = []
      let inUl = false,
        inOl = false

      const flush = () => {
        if (inUl) {
          out.push('</ul>')
          inUl = false
        }
        if (inOl) {
          out.push('</ol>')
          inOl = false
        }
      }

      for (const line of lines) {
        if (/^\s*[-*]\s+/.test(line)) {
          if (!inUl) {
            flush()
            out.push('<ul>')
            inUl = true
          }
          out.push(
            `<li>${this._mdInline(line.replace(/^\s*[-*]\s+/, ''))}</li>`
          )
        } else if (/^\s*\d+\.\s+/.test(line)) {
          if (!inOl) {
            flush()
            out.push('<ol>')
            inOl = true
          }
          out.push(
            `<li>${this._mdInline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`
          )
        } else if (line.trim() === '') {
          flush()
          out.push('<br/>')
        } else {
          flush()
          out.push(`<p>${this._mdInline(line)}</p>`)
        }
      }
      flush()
      return out.join('')
    }

    _mdTable (block) {
      // Normalize: trim, then remove leading/trailing pipes on each line
      const raw = block.trim().split('\n').filter(Boolean)
      if (raw.length < 2) return null

      const norm = raw.map(line =>
        line.replace(/^\s*\|\s*/, '').replace(/\s*\|\s*$/, '')
      )

      // Separator row must be --- (optionally with :) in each cell
      const sepCells = norm[1].split('|').map(s => s.trim())
      const sepOk =
        sepCells.length > 0 && sepCells.every(c => /^:?-{3,}:?$/.test(c))
      if (!sepOk) return null

      const toCells = line =>
        line
          .split('|')
          .map(c => c.trim())
          .filter(c => c.length > 0) // drop empties from edge pipes
          .map(c => this._mdInline(c))

      const head = toCells(norm[0])
      const bodyRows = norm.slice(2).map(toCells)

      const ths = head.map(h => `<th>${h}</th>`).join('')
      const trs = bodyRows
        .map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`)
        .join('')

      return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
    }

    _mdInline (s) {
      // Escape, then apply inline markdown
      let t = this._escapeHtml(s)
      t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>')
      return t
    }

    _renderMarkdown (md = '') {
      // Detect simple tables first (blocks separated by blank lines)
      const blocks = md.split(/\n{2,}/)
      const html = blocks
        .map(b => {
          const maybe = this._mdTable(b)
          return maybe ? maybe : this._mdLists(b)
        })
        .join('\n')
      return html
    }

    _updateDatasetsUI () {
      const chip = this.$modelChip
      const drawer = this._shadowRoot.getElementById('dsDrawer')
      const entries = Object.entries(this._datasets || {})
      if (!entries.length) {
        chip.textContent = 'AI Assistant'
        drawer.style.display = 'none'
        return
      }

      // Chip text
      const parts = entries.map(([k, v]) => `${k}: ${v.rows?.length || 0} rows`)
      chip.textContent =
        parts.length > 2
          ? `${parts.slice(0, 2).join(' · ')} · +${parts.length - 2} more`
          : parts.join(' · ')

      // Drawer content
      const html =
        entries
          .map(([name, ds]) => {
            const cols = (ds.schema || []).slice(0, 12).join(', ')
            return `<div class="ds"><div class="name">${name}</div><div>${
              ds.rows?.length || 0
            } rows</div><div>${cols}</div></div>`
          })
          .join('') || '<div class="ds">No datasets</div>'
      drawer.innerHTML = html
    }

    _append (role, text) {
      const b = document.createElement('div')
      b.className = `msg ${role === 'user' ? 'user' : 'bot'}`

      // Render
      if (role === 'user') {
        b.textContent = text // keep user text literal
      } else {
        b.innerHTML = this._renderMarkdown(String(text || ''))
      }

      if (role === 'user') {
        b.style.background = '#97cdf2ff'
        b.style.border = '1px solid #e7eaf0'
        b.style.color = this._props.textColor || '#0b1221'
      } else {
        b.style.background = '#ffffff'
        b.style.border = '1px solid #e7eaf0'
        b.style.color = this._props.textColor || '#0b1221'
      }

      this.$chat.appendChild(b)
      this.$chat.scrollTop = this.$chat.scrollHeight
    }

    _buildDatasetContext (opts = {}) {
      const maxRowsPerSet = Number(opts.maxRowsPerSet ?? 5)
      const maxCharsTotal = Number(opts.maxCharsTotal ?? 8000)

      const lines = []
      lines.push(
        'You have access to the following datasets. Use ONLY these when answering analytics questions:'
      )

      const entries = Object.entries(this._datasets || {})
      if (!entries.length) {
        lines.push('(No datasets provided.)')
        return lines.join('\n')
      }

      for (const [name, ds] of entries) {
        const schema = (ds?.schema || []).join(', ')
        const total = ds?.rows?.length || 0
        const preview = (ds?.rows || []).slice(0, maxRowsPerSet)

        lines.push(`\n[DATASET] ${name}`)
        lines.push(`- Columns: ${schema || '(none)'}`)
        lines.push(`- Total Rows: ${total}`)
        if (preview.length) {
          lines.push(`- Preview (first ${preview.length} rows):`)
          for (let i = 0; i < preview.length; i++) {
            // safe, compact row print
            const row = preview[i]
            const compact = Object.keys(row).reduce((acc, k) => {
              const v = row[k]
              // stringify lightly; trim long strings
              let s = v === null || v === undefined ? '' : String(v)
              if (s.length > 120) s = s.slice(0, 117) + '...'
              acc[k] = s
              return acc
            }, {})
            lines.push(`  - ${JSON.stringify(compact)}`)
          }
        } else {
          lines.push(`- Preview: (no rows)`)
        }

        // stop if we’re near the char budget
        if (lines.join('\n').length > maxCharsTotal) {
          lines.push('\n(Context truncated to stay within token limits.)')
          break
        }
      }

      

      // a tiny instruction so the model behaves
      lines.push(
        `
        Guidelines:
       - Do the calculations only if the required answer is not directly available in the dataset.
       - Prefer conclusions implied by the dataset preview and schema.
       - Be precise with column names; do not invent fields that aren’t in the schema.
       - Always list the filters, thresholds, and assumptions you applied.
      `.trim()
      )

      return lines.join('\n')
    }

    _startTyping () {
      if (this._typingEl) return // avoid duplicates
      const b = document.createElement('div')
      b.className = 'msg bot typing'
      b.innerHTML = `<span class="muted">PerciBOT</span><span class="dots"><span></span><span></span><span></span></span>`
      // style like bot bubble
      b.style.background = '#ffffff'
      b.style.border = '1px solid #e7eaf0'
      b.style.color = this._props.textColor || '#0b1221'

      this.$chat.appendChild(b)
      this.$chat.scrollTop = this.$chat.scrollHeight
      this._typingEl = b
    }

    _stopTyping () {
      if (this._typingEl && this._typingEl.parentNode) {
        this._typingEl.parentNode.removeChild(this._typingEl)
      }
      this._typingEl = null
    }

    async _send () {
      const q = (this.$input.value || '').trim()
      if (!q) return
      this._append('user', q)
      this.$input.value = ''

      if (!this._props.apiKey) {
        this._append(
          'bot',
          '⚠️ API key not set. Open the Builder panel to configure.'
        )
        return
      }

      // show typing indicator + lock UI
      this._startTyping()
      this.$send.disabled = true

      try {
        // Build dataset context (schema + small preview)
        const dsContext = this._buildDatasetContext({
          maxRowsPerSet: 500,
          maxCharsTotal: 8000
        })

        this.system = '';
       if(this._props.systemPrompt == 'SmartStream'){

           this.system = [
            `You are PerciBOT, a financial Q&A assistant for SmartStream’s FY2026 Budget data (values in ₹).
Use this table directly to answer financial questions.

Rules:
- Use data as-is; do not recalculate unless explicitly asked (ratios, % changes, what-ifs)
- If data is missing, respond “Not in dataset”
- Keep answers concise and numeric, with bold labels and ₹ values (2 decimals)

Dataset – SmartStream Group FY2026 Budget (₹)

| Company | C003 SmartStream Tech Group Ltd | C004 SmartStream RDU India Pvt. Ltd | C002 SmartStream Tech Holding Ltd | C001 SmartStream Tech Ltd | Totals |
|----------|--------------------------------:|------------------------------------:|----------------------------------:|---------------------------:|--------:|
| PS Revenue | 2,461,640.00 | 1,238,160.00 | 3,924,050.00 | 1,702,140.00 | 9,325,990.00 |
| License Revenue | 146,261.35 | 220,702.25 | 295,966.50 | 220,173.63 | 883,103.73 |
| Transfer Price revenue | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Revenue | 2,607,901.35 | 1,458,862.25 | 4,220,016.50 | 1,922,313.63 | 10,209,093.73 |
| Employee Cost | -1,436,230.00 | -470,731.00 | -1,192,286.00 | -1,455,975.00 | -4,555,222.00 |
| License & Infra Cost | -57,398.48 | -92,259.61 | -149,816.96 | -88,542.00 | -388,017.05 |
| TP Cross charge | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Direct Costs | -1,493,628.48 | -562,990.61 | -1,342,102.96 | -1,544,517.00 | -4,943,239.05 |
| Gross Margin | 1,114,272.87 | 895,871.64 | 2,877,913.54 | 377,796.63 | 5,265,854.68 |
| Indirect Employee Cost | -13,386.68 | -13,386.68 | -4,593.91 | -9,704.58 | -41,071.85 |
| Marketing & Sales | -9,727.33 | -9,727.33 | -3,710.18 | -8,086.91 | -31,251.75 |
| Office Supplies | -534.64 | -534.64 | -175.98 | -322.74 | -1,568.00 |
| Utilities | -7,920.00 | -7,920.00 | -36,155.90 | -7,200.00 | -59,195.90 |
| Rent | -7,746.00 | 0.00 | 0.00 | 0.00 | -7,746.00 |
| Administrative Exp | -17,402.94 | -17,402.94 | -5,300.70 | -7,278.22 | -47,384.80 |
| Electricity | -19,634.00 | -19,634.00 | -7,067.99 | -16,175.03 | -62,511.02 |
| Legal Fees | -2,520.00 | -2,520.00 | -2,160.00 | -1,800.00 | -9,000.00 |
| Accounting Fees | -5,800.51 | -5,800.51 | -1,943.06 | -4,043.14 | -17,587.22 |
| R&D Costs | -5,800.50 | -5,800.50 | -1,943.10 | -4,043.21 | -17,587.31 |
| Indirect Costs | -92,543.23 | -92,543.23 | -66,690.30 | -66,740.88 | -318,517.64 |
| EBITDA | 1,021,729.64 | 803,328.41 | 2,811,223.24 | 311,055.75 | 4,947,337.04 |
| Dep & Amort Exp | -44,624.26 | -44,624.26 | -17,670.97 | -40,437.96 | -147,357.45 |
| EBIT | 977,105.38 | 758,704.15 | 2,793,552.27 | 270,617.79 | 4,799,979.59 |
| Interest | -91,034.49 | -98,174.45 | -33,575.98 | -72,789.30 | -295,574.22 |
| EBT | 886,070.89 | 660,529.70 | 2,759,976.29 | 197,828.49 | 4,504,405.37 |
| Taxes | -285,598.40 | -312,373.25 | -106,029.30 | -202,192.50 | -906,193.45 |
| Net Profit | 600,472.49 | 348,156.45 | 2,653,946.99 | -4,364.01 | 3,598,211.92 |


FINANCIAL HIERARCHY:

1. Revenue Components
   -  Revenue:PS Revenue, License Revenue, Transfer Price Revenue

2. Direct Costs Components
   -  Direct Costs: License & Infra Cost, TP Cross Charge

3. Indirect Costs Components
   -  Indirect Costs: Indirect Employee Cost, Marketing & Sales, Office Supplies, Utilities, Rent, Administrative Exp, Electricity, Legal Fees, Accounting Fees, R&D Costs

Example Prompts:
- Summarize SmartStream’s FY2026 budget performance.
- Which entity has the highest operating loss?
- Compare total employee costs.
- What percentage of total revenue comes from C004?
- If revenue increases by 10%, estimate new total PBT.
- Show all indirect costs by entity.
- Give me breakdown of indirect costs
- Which component contribute the highest to the indirect costs
- Give me breakdown of indirect costs for C003.
`
          ].join('\n');
        }

        else if(this._props.systemPrompt == 'Sony'){

          this.system = [ 
            `You are PerciBOT, a financial Q&A assistant for the Channel Performance Dataset.
All monetary values are ₹ million.
Use ONLY the dataset provided. Do NOT assume or invent values.

===============================================================

CORE RULES

===============================================================

All values → ₹ million, 2 decimals.

Use data as-is.

Do calculations only when explicitly asked or clearly implied (vs, variance, MoM, total, roll-up, compare, best, highest, ranking).

If dataset lacks a value → reply “Not in dataset”.

Keep answers concise, numeric, and business-ready (bold labels + compact tables).

Do NOT explain logic unless asked.

Normalize names (case/spacing/hyphens ignored).

===============================================================

DATA FORMAT

===============================================================
Each row: {Channel, Account, Date, Version, Amount}
Versions: Actual, Budget only. No Forecast (return “Not in dataset” if asked).

===============================================================

SMART NAME NORMALIZATION

===============================================================
Normalize channels & accounts: case-insensitive, ignore spaces/hyphens/underscores.

Examples:

max2, MAX-2, max_2 → MAX 2

“hindi”, “hindi movie” → Hindi Movies

“program cost”, “programme” → Program

===============================================================

CHANNEL HIERARCHY

===============================================================
Parents computed from children (not in dataset):

Common Cost → CORPORATE

English Movies → PIX

Hindi Movies → MAX, MAX 1, MAX 2

Kids → YAY

Mix Content → WAH

Production House → Motion Pictures, STUDIO NEXT

Program → BBC, PAL, SAB, SET

Regional → AATH, SONY MARATHI

All Channels → all leaf channels

===============================================================

ACCOUNT HIERARCHY

===============================================================

REVENUE Accounts

Ad Agency Incentives, Bad Debts, Digital Ad Agency Incentives, Digital AD Sales, Discounts/Rebates, Digital Subscription, Digital Syndication, Net Advertising REV BAU (Domestic), Net Advertising REV BAU (International), Other Income, Subscription REV BAU (Domestic), Subscription REV BAU (International), Syndication REV, Youtube REV.

COST Accounts

Affiliate Marketing, Broadcast, Carriage, Digital Content COST, Depreciation, Dealer Incentives, Digital Marketing, Films Amortisation, G&A, Incentives, Linear Marketing, Programming COST, ROU Building Lease Amort, Sports Amortisation, Salaries, Tech COST.

NET REVENUE

Net Revenue = Revenue – Cost
(Always computed; not stored in dataset.)

===============================================================

AGGREGATION RULES

===============================================================

Channel or Account parent totals = sum of mapped children.

Actual vs Budget:

Variance = A – B

%Variance = (A – B) / B × 100

MoM = current month – previous month.

Cross-rollups supported: Channel × Account, Revenue, Cost, Net Revenue.

===============================================================

RANKING LOGIC (BEST/HIGHEST/LOWEST)

===============================================================
Treat these as calculation triggers, not dataset fields:
best, top, highest, lowest, biggest, smallest, most profitable, least profitable, best performing, worst performing.

Defaults:

If measure unspecified → Actual Net Revenue.

If version unspecified → Actual.

If period unspecified → sum all months.

Steps:

Compute Revenue, Cost, Net Revenue per Channel for the requested period.

Rank channels by the requested measure (or default).

Return channel + numeric value.

Only say “Not in dataset” if no valid channels match.

===============================================================

FISCAL YEAR LOGIC

===============================================================
FY2025 = Apr 2025 → Mar 2026
Q1 = Apr–Jun, Q2 = Jul–Sep, Q3 = Oct–Dec, Q4 = Jan–Mar
If user says “2025” → interpret as Apr–Dec 2025 (YTD).

===============================================================

ANSWERING STYLE

===============================================================

Use bold labels and compact tables.

Responses must be short, numeric, and business-focused.

Ask for clarification only when essential (missing period/version).

=====================================================================

DATASET – CHANNEL PERFORMANCE

=====================================================================

data[1491]{Channels,Account,Date,Version,Amount}:
AATH,Ad Agency Incentives,Apr (2025),Actual,"-1.70"
AATH,Ad Agency Incentives,Apr (2025),Budget,"-1.76"
AATH,Ad Agency Incentives,May (2025),Actual,"-1.80"
AATH,Ad Agency Incentives,May (2025),Budget,"-1.82"
AATH,Ad Agency Incentives,Jun (2025),Actual,"-1.70"
AATH,Ad Agency Incentives,Jun (2025),Budget,"-1.73"
AATH,Ad Agency Incentives,Jul (2025),Actual,"-1.60"
AATH,Ad Agency Incentives,Jul (2025),Budget,"-1.76"
AATH,Ad Agency Incentives,Aug (2025),Actual,"-1.90"
AATH,Ad Agency Incentives,Aug (2025),Budget,"-1.82"
AATH,Ad Agency Incentives,Sep (2025),Actual,"-1.80"
AATH,Ad Agency Incentives,Sep (2025),Budget,"-1.67"
AATH,Ad Agency Incentives,Oct (2025),Actual,"-1.60"
AATH,Ad Agency Incentives,Oct (2025),Budget,"-1.63"
AATH,Ad Agency Incentives,Nov (2025),Actual,"-1.60"
AATH,Ad Agency Incentives,Nov (2025),Budget,"-1.48"
AATH,Ad Agency Incentives,Dec (2025),Actual,"-1.50"
AATH,Ad Agency Incentives,Dec (2025),Budget,"-1.59"
AATH,Ad Agency Incentives,Jan (2026),Budget,"-1.57"
AATH,Ad Agency Incentives,Feb (2026),Budget,"-1.41"
AATH,Ad Agency Incentives,Mar (2026),Budget,"-1.60"
AATH,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"27.00"
AATH,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"28.41"
AATH,Net Advertising REV BAU (Domestic),May (2025),Actual,"27.90"
AATH,Net Advertising REV BAU (Domestic),May (2025),Budget,"29.36"
AATH,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"28.70"
AATH,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"27.89"
AATH,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"25.70"
AATH,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"28.27"
AATH,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"30.10"
AATH,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"29.36"
AATH,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"28.80"
AATH,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"26.83"
AATH,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"26.00"
AATH,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"26.21"
AATH,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"24.90"
AATH,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"23.79"
AATH,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"27.20"
AATH,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"25.67"
AATH,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"25.21"
AATH,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"22.77"
AATH,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"25.75"
AATH,Syndication REV,Apr (2025),Actual,"0.00"
AATH,Syndication REV,Apr (2025),Budget,"0.00"
AATH,Syndication REV,May (2025),Actual,"0.70"
AATH,Syndication REV,May (2025),Budget,"0.75"
AATH,Syndication REV,Jun (2025),Actual,"0.80"
AATH,Syndication REV,Jun (2025),Budget,"0.75"
AATH,Syndication REV,Jul (2025),Actual,"0.70"
AATH,Syndication REV,Jul (2025),Budget,"0.75"
AATH,Syndication REV,Aug (2025),Actual,"1.20"
AATH,Syndication REV,Aug (2025),Budget,"1.25"
AATH,Syndication REV,Sep (2025),Actual,"1.50"
AATH,Syndication REV,Sep (2025),Budget,"1.50"
AATH,Syndication REV,Oct (2025),Actual,"2.00"
AATH,Syndication REV,Oct (2025),Budget,"2.00"
AATH,Syndication REV,Nov (2025),Actual,"1.60"
AATH,Syndication REV,Nov (2025),Budget,"1.50"
AATH,Syndication REV,Dec (2025),Actual,"1.40"
AATH,Syndication REV,Dec (2025),Budget,"1.50"
AATH,Syndication REV,Jan (2026),Budget,"1.25"
AATH,Syndication REV,Feb (2026),Budget,"1.25"
AATH,Syndication REV,Mar (2026),Budget,"1.25"
AATH,Linear Marketing,Apr (2025),Actual,"-3.30"
AATH,Linear Marketing,Apr (2025),Budget,"-3.19"
AATH,Linear Marketing,May (2025),Actual,"-1.20"
AATH,Linear Marketing,May (2025),Budget,"-1.10"
AATH,Linear Marketing,Jun (2025),Actual,"-3.40"
AATH,Linear Marketing,Jun (2025),Budget,"-3.59"
AATH,Linear Marketing,Jul (2025),Actual,"-0.50"
AATH,Linear Marketing,Jul (2025),Budget,"-0.49"
AATH,Linear Marketing,Aug (2025),Actual,"-1.10"
AATH,Linear Marketing,Aug (2025),Budget,"-1.10"
AATH,Linear Marketing,Sep (2025),Actual,"-0.50"
AATH,Linear Marketing,Sep (2025),Budget,"-0.58"
AATH,Linear Marketing,Oct (2025),Actual,"-8.50"
AATH,Linear Marketing,Oct (2025),Budget,"-8.27"
AATH,Linear Marketing,Nov (2025),Actual,"-1.50"
AATH,Linear Marketing,Nov (2025),Budget,"-1.45"
AATH,Linear Marketing,Dec (2025),Actual,"-2.20"
AATH,Linear Marketing,Dec (2025),Budget,"-2.07"
AATH,Linear Marketing,Jan (2026),Budget,"-3.96"
AATH,Linear Marketing,Feb (2026),Budget,"-0.44"
AATH,Linear Marketing,Mar (2026),Budget,"-1.07"
AATH,Programming COST,Apr (2025),Actual,"-4.80"
AATH,Programming COST,Apr (2025),Budget,"-4.90"
AATH,Programming COST,May (2025),Actual,"-5.20"
AATH,Programming COST,May (2025),Budget,"-4.90"
AATH,Programming COST,Jun (2025),Actual,"-4.60"
AATH,Programming COST,Jun (2025),Budget,"-4.90"
AATH,Programming COST,Jul (2025),Actual,"-5.30"
AATH,Programming COST,Jul (2025),Budget,"-4.90"
AATH,Programming COST,Aug (2025),Actual,"-4.80"
AATH,Programming COST,Aug (2025),Budget,"-4.90"
AATH,Programming COST,Sep (2025),Actual,"-4.80"
AATH,Programming COST,Sep (2025),Budget,"-4.90"
AATH,Programming COST,Oct (2025),Actual,"-4.60"
AATH,Programming COST,Oct (2025),Budget,"-4.90"
AATH,Programming COST,Nov (2025),Actual,"-4.80"
AATH,Programming COST,Nov (2025),Budget,"-4.90"
AATH,Programming COST,Dec (2025),Actual,"-5.30"
AATH,Programming COST,Dec (2025),Budget,"-4.90"
AATH,Programming COST,Jan (2026),Budget,"-4.90"
AATH,Programming COST,Feb (2026),Budget,"-4.90"
AATH,Programming COST,Mar (2026),Budget,"-4.90"
BBC,Ad Agency Incentives,Apr (2025),Actual,"0.00"
BBC,Ad Agency Incentives,Apr (2025),Budget,"0.00"
BBC,Ad Agency Incentives,May (2025),Actual,"0.00"
BBC,Ad Agency Incentives,May (2025),Budget,"0.00"
BBC,Ad Agency Incentives,Jun (2025),Actual,"-0.20"
BBC,Ad Agency Incentives,Jun (2025),Budget,"-0.23"
BBC,Ad Agency Incentives,Jul (2025),Actual,"0.00"
BBC,Ad Agency Incentives,Jul (2025),Budget,"0.00"
BBC,Ad Agency Incentives,Aug (2025),Actual,"0.00"
BBC,Ad Agency Incentives,Aug (2025),Budget,"0.00"
BBC,Ad Agency Incentives,Sep (2025),Actual,"-0.20"
BBC,Ad Agency Incentives,Sep (2025),Budget,"-0.23"
BBC,Ad Agency Incentives,Oct (2025),Actual,"0.00"
BBC,Ad Agency Incentives,Oct (2025),Budget,"0.00"
BBC,Ad Agency Incentives,Nov (2025),Actual,"0.00"
BBC,Ad Agency Incentives,Nov (2025),Budget,"0.00"
BBC,Ad Agency Incentives,Dec (2025),Actual,"-0.20"
BBC,Ad Agency Incentives,Dec (2025),Budget,"-0.23"
BBC,Ad Agency Incentives,Jan (2026),Budget,"0.00"
BBC,Ad Agency Incentives,Feb (2026),Budget,"0.00"
BBC,Ad Agency Incentives,Mar (2026),Budget,"-0.23"
BBC,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"0.00"
BBC,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"0.00"
BBC,Net Advertising REV BAU (Domestic),May (2025),Actual,"0.00"
BBC,Net Advertising REV BAU (Domestic),May (2025),Budget,"0.00"
BBC,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"3.50"
BBC,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"3.75"
BBC,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"0.00"
BBC,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"0.00"
BBC,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"0.00"
BBC,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"0.00"
BBC,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"4.00"
BBC,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"3.75"
BBC,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"0.00"
BBC,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"0.00"
BBC,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"0.00"
BBC,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"0.00"
BBC,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"3.40"
BBC,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"3.75"
BBC,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"0.00"
BBC,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"0.00"
BBC,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"3.75"
BBC,Syndication REV,Apr (2025),Actual,"0.00"
BBC,Syndication REV,Apr (2025),Budget,"0.00"
BBC,Syndication REV,May (2025),Actual,"0.00"
BBC,Syndication REV,May (2025),Budget,"0.00"
BBC,Syndication REV,Jun (2025),Actual,"0.00"
BBC,Syndication REV,Jun (2025),Budget,"0.00"
BBC,Syndication REV,Jul (2025),Actual,"0.00"
BBC,Syndication REV,Jul (2025),Budget,"0.00"
BBC,Syndication REV,Aug (2025),Actual,"0.00"
BBC,Syndication REV,Aug (2025),Budget,"0.00"
BBC,Syndication REV,Sep (2025),Actual,"0.00"
BBC,Syndication REV,Sep (2025),Budget,"0.00"
BBC,Syndication REV,Oct (2025),Actual,"0.00"
BBC,Syndication REV,Oct (2025),Budget,"0.00"
BBC,Syndication REV,Nov (2025),Actual,"0.00"
BBC,Syndication REV,Nov (2025),Budget,"0.00"
BBC,Syndication REV,Dec (2025),Actual,"0.00"
BBC,Syndication REV,Dec (2025),Budget,"0.00"
BBC,Syndication REV,Jan (2026),Budget,"0.00"
BBC,Syndication REV,Feb (2026),Budget,"0.00"
BBC,Syndication REV,Mar (2026),Budget,"0.00"
BBC,Linear Marketing,Apr (2025),Actual,"-0.90"
BBC,Linear Marketing,Apr (2025),Budget,"-0.92"
BBC,Linear Marketing,May (2025),Actual,"-0.50"
BBC,Linear Marketing,May (2025),Budget,"-0.53"
BBC,Linear Marketing,Jun (2025),Actual,"-2.10"
BBC,Linear Marketing,Jun (2025),Budget,"-2.18"
BBC,Linear Marketing,Jul (2025),Actual,"-0.50"
BBC,Linear Marketing,Jul (2025),Budget,"-0.53"
BBC,Linear Marketing,Aug (2025),Actual,"-5.50"
BBC,Linear Marketing,Aug (2025),Budget,"-5.26"
BBC,Linear Marketing,Sep (2025),Actual,"-1.20"
BBC,Linear Marketing,Sep (2025),Budget,"-1.23"
BBC,Linear Marketing,Oct (2025),Actual,"-1.60"
BBC,Linear Marketing,Oct (2025),Budget,"-1.75"
BBC,Linear Marketing,Nov (2025),Actual,"-1.10"
BBC,Linear Marketing,Nov (2025),Budget,"-1.03"
BBC,Linear Marketing,Dec (2025),Actual,"-1.20"
BBC,Linear Marketing,Dec (2025),Budget,"-1.13"
BBC,Linear Marketing,Jan (2026),Budget,"-0.48"
BBC,Linear Marketing,Feb (2026),Budget,"-1.10"
BBC,Linear Marketing,Mar (2026),Budget,"-0.52"
BBC,Programming COST,Apr (2025),Actual,"-7.00"
BBC,Programming COST,Apr (2025),Budget,"-7.34"
BBC,Programming COST,May (2025),Actual,"-7.00"
BBC,Programming COST,May (2025),Budget,"-7.34"
BBC,Programming COST,Jun (2025),Actual,"-7.40"
BBC,Programming COST,Jun (2025),Budget,"-7.34"
BBC,Programming COST,Jul (2025),Actual,"-7.60"
BBC,Programming COST,Jul (2025),Budget,"-7.34"
BBC,Programming COST,Aug (2025),Actual,"-6.70"
BBC,Programming COST,Aug (2025),Budget,"-7.34"
BBC,Programming COST,Sep (2025),Actual,"-6.80"
BBC,Programming COST,Sep (2025),Budget,"-7.34"
BBC,Programming COST,Oct (2025),Actual,"-7.10"
BBC,Programming COST,Oct (2025),Budget,"-7.34"
BBC,Programming COST,Nov (2025),Actual,"-7.30"
BBC,Programming COST,Nov (2025),Budget,"-7.34"
BBC,Programming COST,Dec (2025),Actual,"-7.10"
BBC,Programming COST,Dec (2025),Budget,"-7.34"
BBC,Programming COST,Jan (2026),Budget,"-7.34"
BBC,Programming COST,Feb (2026),Budget,"-7.34"
BBC,Programming COST,Mar (2026),Budget,"-7.34"
CORPORATE,Ad Agency Incentives,Apr (2025),Actual,"0.00"
CORPORATE,Ad Agency Incentives,Apr (2025),Budget,"0.00"
CORPORATE,Ad Agency Incentives,May (2025),Actual,"0.00"
CORPORATE,Ad Agency Incentives,May (2025),Budget,"0.00"
CORPORATE,Ad Agency Incentives,Jun (2025),Actual,"0.00"
CORPORATE,Ad Agency Incentives,Jun (2025),Budget,"0.00"
CORPORATE,Ad Agency Incentives,Jul (2025),Actual,"0.00"
CORPORATE,Ad Agency Incentives,Jul (2025),Budget,"0.00"
CORPORATE,Ad Agency Incentives,Aug (2025),Actual,"0.00"
CORPORATE,Ad Agency Incentives,Aug (2025),Budget,"0.00"
CORPORATE,Ad Agency Incentives,Sep (2025),Actual,"0.00"
CORPORATE,Ad Agency Incentives,Sep (2025),Budget,"0.00"
CORPORATE,Ad Agency Incentives,Oct (2025),Actual,"0.00"
CORPORATE,Ad Agency Incentives,Oct (2025),Budget,"0.00"
CORPORATE,Ad Agency Incentives,Nov (2025),Actual,"0.00"
CORPORATE,Ad Agency Incentives,Nov (2025),Budget,"0.00"
CORPORATE,Ad Agency Incentives,Dec (2025),Actual,"0.00"
CORPORATE,Ad Agency Incentives,Dec (2025),Budget,"0.00"
CORPORATE,Ad Agency Incentives,Jan (2026),Budget,"0.00"
CORPORATE,Ad Agency Incentives,Feb (2026),Budget,"0.00"
CORPORATE,Ad Agency Incentives,Mar (2026),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),May (2025),Actual,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),May (2025),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"0.00"
CORPORATE,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"0.00"
CORPORATE,Linear Marketing,Apr (2025),Actual,"-19.20"
CORPORATE,Linear Marketing,Apr (2025),Budget,"-20.98"
CORPORATE,Linear Marketing,May (2025),Actual,"-24.80"
CORPORATE,Linear Marketing,May (2025),Budget,"-24.79"
CORPORATE,Linear Marketing,Jun (2025),Actual,"-24.90"
CORPORATE,Linear Marketing,Jun (2025),Budget,"-22.75"
CORPORATE,Linear Marketing,Jul (2025),Actual,"-17.90"
CORPORATE,Linear Marketing,Jul (2025),Budget,"-18.72"
CORPORATE,Linear Marketing,Aug (2025),Actual,"-31.10"
CORPORATE,Linear Marketing,Aug (2025),Budget,"-29.42"
CORPORATE,Linear Marketing,Sep (2025),Actual,"-28.20"
CORPORATE,Linear Marketing,Sep (2025),Budget,"-26.55"
CORPORATE,Linear Marketing,Oct (2025),Actual,"-28.90"
CORPORATE,Linear Marketing,Oct (2025),Budget,"-26.86"
CORPORATE,Linear Marketing,Nov (2025),Actual,"-29.60"
CORPORATE,Linear Marketing,Nov (2025),Budget,"-29.09"
CORPORATE,Linear Marketing,Dec (2025),Actual,"-16.90"
CORPORATE,Linear Marketing,Dec (2025),Budget,"-17.09"
CORPORATE,Linear Marketing,Jan (2026),Budget,"-22.12"
CORPORATE,Linear Marketing,Feb (2026),Budget,"-19.36"
CORPORATE,Linear Marketing,Mar (2026),Budget,"-17.11"
CORPORATE,Programming COST,Apr (2025),Actual,"-60.50"
CORPORATE,Programming COST,Apr (2025),Budget,"-56.80"
CORPORATE,Programming COST,May (2025),Actual,"-45.00"
CORPORATE,Programming COST,May (2025),Budget,"-43.00"
CORPORATE,Programming COST,Jun (2025),Actual,"-47.50"
CORPORATE,Programming COST,Jun (2025),Budget,"-43.70"
CORPORATE,Programming COST,Jul (2025),Actual,"-42.60"
CORPORATE,Programming COST,Jul (2025),Budget,"-45.70"
CORPORATE,Programming COST,Aug (2025),Actual,"-51.40"
CORPORATE,Programming COST,Aug (2025),Budget,"-48.70"
CORPORATE,Programming COST,Sep (2025),Actual,"-48.90"
CORPORATE,Programming COST,Sep (2025),Budget,"-47.30"
CORPORATE,Programming COST,Oct (2025),Actual,"-41.10"
CORPORATE,Programming COST,Oct (2025),Budget,"-44.50"
CORPORATE,Programming COST,Nov (2025),Actual,"-42.50"
CORPORATE,Programming COST,Nov (2025),Budget,"-44.30"
CORPORATE,Programming COST,Dec (2025),Actual,"-44.90"
CORPORATE,Programming COST,Dec (2025),Budget,"-44.20"
CORPORATE,Programming COST,Jan (2026),Budget,"-44.60"
CORPORATE,Programming COST,Feb (2026),Budget,"-44.70"
CORPORATE,Programming COST,Mar (2026),Budget,"-43.30"
MAX,Ad Agency Incentives,Apr (2025),Actual,"-9.40"
MAX,Ad Agency Incentives,Apr (2025),Budget,"-9.22"
MAX,Ad Agency Incentives,May (2025),Actual,"-8.60"
MAX,Ad Agency Incentives,May (2025),Budget,"-9.51"
MAX,Ad Agency Incentives,Jun (2025),Actual,"-10.40"
MAX,Ad Agency Incentives,Jun (2025),Budget,"-9.67"
MAX,Ad Agency Incentives,Jul (2025),Actual,"-9.60"
MAX,Ad Agency Incentives,Jul (2025),Budget,"-10.40"
MAX,Ad Agency Incentives,Aug (2025),Actual,"-10.20"
MAX,Ad Agency Incentives,Aug (2025),Budget,"-10.40"
MAX,Ad Agency Incentives,Sep (2025),Actual,"-12.40"
MAX,Ad Agency Incentives,Sep (2025),Budget,"-11.38"
MAX,Ad Agency Incentives,Oct (2025),Actual,"-9.70"
MAX,Ad Agency Incentives,Oct (2025),Budget,"-10.24"
MAX,Ad Agency Incentives,Nov (2025),Actual,"-9.00"
MAX,Ad Agency Incentives,Nov (2025),Budget,"-9.67"
MAX,Ad Agency Incentives,Dec (2025),Actual,"-10.30"
MAX,Ad Agency Incentives,Dec (2025),Budget,"-9.98"
MAX,Ad Agency Incentives,Jan (2026),Budget,"-9.98"
MAX,Ad Agency Incentives,Feb (2026),Budget,"-8.57"
MAX,Ad Agency Incentives,Mar (2026),Budget,"-9.42"
MAX,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"149.10"
MAX,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"148.53"
MAX,Net Advertising REV BAU (Domestic),May (2025),Actual,"146.60"
MAX,Net Advertising REV BAU (Domestic),May (2025),Budget,"153.15"
MAX,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"169.90"
MAX,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"155.78"
MAX,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"166.60"
MAX,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"167.46"
MAX,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"174.20"
MAX,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"167.46"
MAX,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"201.50"
MAX,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"183.33"
MAX,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"156.70"
MAX,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"164.88"
MAX,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"144.60"
MAX,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"155.78"
MAX,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"157.40"
MAX,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"160.63"
MAX,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"160.63"
MAX,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"138.01"
MAX,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"151.72"
MAX,Syndication REV,Apr (2025),Actual,"0.00"
MAX,Syndication REV,Apr (2025),Budget,"0.00"
MAX,Syndication REV,May (2025),Actual,"6.00"
MAX,Syndication REV,May (2025),Budget,"6.50"
MAX,Syndication REV,Jun (2025),Actual,"6.90"
MAX,Syndication REV,Jun (2025),Budget,"6.50"
MAX,Syndication REV,Jul (2025),Actual,"6.70"
MAX,Syndication REV,Jul (2025),Budget,"6.50"
MAX,Syndication REV,Aug (2025),Actual,"6.50"
MAX,Syndication REV,Aug (2025),Budget,"7.15"
MAX,Syndication REV,Sep (2025),Actual,"6.40"
MAX,Syndication REV,Sep (2025),Budget,"6.50"
MAX,Syndication REV,Oct (2025),Actual,"6.00"
MAX,Syndication REV,Oct (2025),Budget,"6.50"
MAX,Syndication REV,Nov (2025),Actual,"8.30"
MAX,Syndication REV,Nov (2025),Budget,"8.67"
MAX,Syndication REV,Dec (2025),Actual,"8.80"
MAX,Syndication REV,Dec (2025),Budget,"8.67"
MAX,Syndication REV,Jan (2026),Budget,"8.67"
MAX,Syndication REV,Feb (2026),Budget,"8.67"
MAX,Syndication REV,Mar (2026),Budget,"8.67"
MAX,Linear Marketing,Apr (2025),Actual,"-2.70"
MAX,Linear Marketing,Apr (2025),Budget,"-2.49"
MAX,Linear Marketing,May (2025),Actual,"-4.70"
MAX,Linear Marketing,May (2025),Budget,"-4.79"
MAX,Linear Marketing,Jun (2025),Actual,"-2.60"
MAX,Linear Marketing,Jun (2025),Budget,"-2.61"
MAX,Linear Marketing,Jul (2025),Actual,"-2.60"
MAX,Linear Marketing,Jul (2025),Budget,"-2.42"
MAX,Linear Marketing,Aug (2025),Actual,"-7.10"
MAX,Linear Marketing,Aug (2025),Budget,"-6.67"
MAX,Linear Marketing,Sep (2025),Actual,"-2.80"
MAX,Linear Marketing,Sep (2025),Budget,"-2.56"
MAX,Linear Marketing,Oct (2025),Actual,"-2.90"
MAX,Linear Marketing,Oct (2025),Budget,"-2.64"
MAX,Linear Marketing,Nov (2025),Actual,"-2.30"
MAX,Linear Marketing,Nov (2025),Budget,"-2.31"
MAX,Linear Marketing,Dec (2025),Actual,"-4.70"
MAX,Linear Marketing,Dec (2025),Budget,"-5.10"
MAX,Linear Marketing,Jan (2026),Budget,"-6.35"
MAX,Linear Marketing,Feb (2026),Budget,"-2.40"
MAX,Linear Marketing,Mar (2026),Budget,"-2.27"
MAX,Programming COST,Apr (2025),Actual,"-4.50"
MAX,Programming COST,Apr (2025),Budget,"-4.67"
MAX,Programming COST,May (2025),Actual,"-4.50"
MAX,Programming COST,May (2025),Budget,"-4.67"
MAX,Programming COST,Jun (2025),Actual,"-4.80"
MAX,Programming COST,Jun (2025),Budget,"-4.67"
MAX,Programming COST,Jul (2025),Actual,"-4.30"
MAX,Programming COST,Jul (2025),Budget,"-4.67"
MAX,Programming COST,Aug (2025),Actual,"-4.70"
MAX,Programming COST,Aug (2025),Budget,"-4.67"
MAX,Programming COST,Sep (2025),Actual,"-4.70"
MAX,Programming COST,Sep (2025),Budget,"-4.67"
MAX,Programming COST,Oct (2025),Actual,"-5.00"
MAX,Programming COST,Oct (2025),Budget,"-4.67"
MAX,Programming COST,Nov (2025),Actual,"-4.90"
MAX,Programming COST,Nov (2025),Budget,"-4.67"
MAX,Programming COST,Dec (2025),Actual,"-4.80"
MAX,Programming COST,Dec (2025),Budget,"-4.67"
MAX,Programming COST,Jan (2026),Budget,"-4.67"
MAX,Programming COST,Feb (2026),Budget,"-4.67"
MAX,Programming COST,Mar (2026),Budget,"-4.67"
MAX 1,Ad Agency Incentives,Apr (2025),Actual,"-1.10"
MAX 1,Ad Agency Incentives,Apr (2025),Budget,"-1.23"
MAX 1,Ad Agency Incentives,May (2025),Actual,"-1.30"
MAX 1,Ad Agency Incentives,May (2025),Budget,"-1.23"
MAX 1,Ad Agency Incentives,Jun (2025),Actual,"-1.30"
MAX 1,Ad Agency Incentives,Jun (2025),Budget,"-1.23"
MAX 1,Ad Agency Incentives,Jul (2025),Actual,"-1.20"
MAX 1,Ad Agency Incentives,Jul (2025),Budget,"-1.23"
MAX 1,Ad Agency Incentives,Aug (2025),Actual,"-1.20"
MAX 1,Ad Agency Incentives,Aug (2025),Budget,"-1.23"
MAX 1,Ad Agency Incentives,Sep (2025),Actual,"-1.30"
MAX 1,Ad Agency Incentives,Sep (2025),Budget,"-1.23"
MAX 1,Ad Agency Incentives,Oct (2025),Actual,"-1.10"
MAX 1,Ad Agency Incentives,Oct (2025),Budget,"-1.23"
MAX 1,Ad Agency Incentives,Nov (2025),Actual,"-1.30"
MAX 1,Ad Agency Incentives,Nov (2025),Budget,"-1.23"
MAX 1,Ad Agency Incentives,Dec (2025),Actual,"-1.30"
MAX 1,Ad Agency Incentives,Dec (2025),Budget,"-1.23"
MAX 1,Ad Agency Incentives,Jan (2026),Budget,"-1.23"
MAX 1,Ad Agency Incentives,Feb (2026),Budget,"-1.23"
MAX 1,Ad Agency Incentives,Mar (2026),Budget,"-1.23"
MAX 1,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"21.90"
MAX 1,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),May (2025),Actual,"19.70"
MAX 1,Net Advertising REV BAU (Domestic),May (2025),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"23.50"
MAX 1,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"19.90"
MAX 1,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"19.80"
MAX 1,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"21.90"
MAX 1,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"22.60"
MAX 1,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"22.90"
MAX 1,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"21.80"
MAX 1,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"21.67"
MAX 1,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"21.67"
MAX 1,Syndication REV,Apr (2025),Actual,"0.00"
MAX 1,Syndication REV,Apr (2025),Budget,"0.00"
MAX 1,Syndication REV,May (2025),Actual,"0.00"
MAX 1,Syndication REV,May (2025),Budget,"0.00"
MAX 1,Syndication REV,Jun (2025),Actual,"0.00"
MAX 1,Syndication REV,Jun (2025),Budget,"0.00"
MAX 1,Syndication REV,Jul (2025),Actual,"0.00"
MAX 1,Syndication REV,Jul (2025),Budget,"0.00"
MAX 1,Syndication REV,Aug (2025),Actual,"0.00"
MAX 1,Syndication REV,Aug (2025),Budget,"0.00"
MAX 1,Syndication REV,Sep (2025),Actual,"0.00"
MAX 1,Syndication REV,Sep (2025),Budget,"0.00"
MAX 1,Syndication REV,Oct (2025),Actual,"0.00"
MAX 1,Syndication REV,Oct (2025),Budget,"0.00"
MAX 1,Syndication REV,Nov (2025),Actual,"0.00"
MAX 1,Syndication REV,Nov (2025),Budget,"0.00"
MAX 1,Syndication REV,Dec (2025),Actual,"0.00"
MAX 1,Syndication REV,Dec (2025),Budget,"0.00"
MAX 1,Syndication REV,Jan (2026),Budget,"0.00"
MAX 1,Syndication REV,Feb (2026),Budget,"0.00"
MAX 1,Syndication REV,Mar (2026),Budget,"0.00"
MAX 1,Linear Marketing,Apr (2025),Actual,"-1.50"
MAX 1,Linear Marketing,Apr (2025),Budget,"-1.36"
MAX 1,Linear Marketing,May (2025),Actual,"-1.30"
MAX 1,Linear Marketing,May (2025),Budget,"-1.36"
MAX 1,Linear Marketing,Jun (2025),Actual,"-1.50"
MAX 1,Linear Marketing,Jun (2025),Budget,"-1.36"
MAX 1,Linear Marketing,Jul (2025),Actual,"-1.40"
MAX 1,Linear Marketing,Jul (2025),Budget,"-1.36"
MAX 1,Linear Marketing,Aug (2025),Actual,"-1.20"
MAX 1,Linear Marketing,Aug (2025),Budget,"-1.36"
MAX 1,Linear Marketing,Sep (2025),Actual,"-1.30"
MAX 1,Linear Marketing,Sep (2025),Budget,"-1.36"
MAX 1,Linear Marketing,Oct (2025),Actual,"-1.20"
MAX 1,Linear Marketing,Oct (2025),Budget,"-1.36"
MAX 1,Linear Marketing,Nov (2025),Actual,"-1.30"
MAX 1,Linear Marketing,Nov (2025),Budget,"-1.36"
MAX 1,Linear Marketing,Dec (2025),Actual,"-1.50"
MAX 1,Linear Marketing,Dec (2025),Budget,"-1.36"
MAX 1,Linear Marketing,Jan (2026),Budget,"-1.36"
MAX 1,Linear Marketing,Feb (2026),Budget,"-1.36"
MAX 1,Linear Marketing,Mar (2026),Budget,"-1.36"
MAX 1,Programming COST,Apr (2025),Actual,"0.00"
MAX 1,Programming COST,Apr (2025),Budget,"0.00"
MAX 1,Programming COST,May (2025),Actual,"0.00"
MAX 1,Programming COST,May (2025),Budget,"0.00"
MAX 1,Programming COST,Jun (2025),Actual,"0.00"
MAX 1,Programming COST,Jun (2025),Budget,"0.00"
MAX 1,Programming COST,Jul (2025),Actual,"0.00"
MAX 1,Programming COST,Jul (2025),Budget,"0.00"
MAX 1,Programming COST,Aug (2025),Actual,"0.00"
MAX 1,Programming COST,Aug (2025),Budget,"0.00"
MAX 1,Programming COST,Sep (2025),Actual,"0.00"
MAX 1,Programming COST,Sep (2025),Budget,"0.00"
MAX 1,Programming COST,Oct (2025),Actual,"0.00"
MAX 1,Programming COST,Oct (2025),Budget,"0.00"
MAX 1,Programming COST,Nov (2025),Actual,"0.00"
MAX 1,Programming COST,Nov (2025),Budget,"0.00"
MAX 1,Programming COST,Dec (2025),Actual,"0.00"
MAX 1,Programming COST,Dec (2025),Budget,"0.00"
MAX 1,Programming COST,Jan (2026),Budget,"0.00"
MAX 1,Programming COST,Feb (2026),Budget,"0.00"
MAX 1,Programming COST,Mar (2026),Budget,"0.00"
MAX 2,Ad Agency Incentives,Apr (2025),Actual,"-2.50"
MAX 2,Ad Agency Incentives,Apr (2025),Budget,"-2.65"
MAX 2,Ad Agency Incentives,May (2025),Actual,"-2.60"
MAX 2,Ad Agency Incentives,May (2025),Budget,"-2.74"
MAX 2,Ad Agency Incentives,Jun (2025),Actual,"-3.00"
MAX 2,Ad Agency Incentives,Jun (2025),Budget,"-2.88"
MAX 2,Ad Agency Incentives,Jul (2025),Actual,"-3.10"
MAX 2,Ad Agency Incentives,Jul (2025),Budget,"-2.97"
MAX 2,Ad Agency Incentives,Aug (2025),Actual,"-3.30"
MAX 2,Ad Agency Incentives,Aug (2025),Budget,"-3.09"
MAX 2,Ad Agency Incentives,Sep (2025),Actual,"-2.90"
MAX 2,Ad Agency Incentives,Sep (2025),Budget,"-2.88"
MAX 2,Ad Agency Incentives,Oct (2025),Actual,"-2.80"
MAX 2,Ad Agency Incentives,Oct (2025),Budget,"-2.97"
MAX 2,Ad Agency Incentives,Nov (2025),Actual,"-3.20"
MAX 2,Ad Agency Incentives,Nov (2025),Budget,"-2.99"
MAX 2,Ad Agency Incentives,Dec (2025),Actual,"-3.10"
MAX 2,Ad Agency Incentives,Dec (2025),Budget,"-3.09"
MAX 2,Ad Agency Incentives,Jan (2026),Budget,"-3.09"
MAX 2,Ad Agency Incentives,Feb (2026),Budget,"-2.58"
MAX 2,Ad Agency Incentives,Mar (2026),Budget,"-2.85"
MAX 2,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"39.90"
MAX 2,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"42.62"
MAX 2,Net Advertising REV BAU (Domestic),May (2025),Actual,"45.00"
MAX 2,Net Advertising REV BAU (Domestic),May (2025),Budget,"44.04"
MAX 2,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"45.10"
MAX 2,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"46.33"
MAX 2,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"47.80"
MAX 2,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"47.87"
MAX 2,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"53.00"
MAX 2,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"49.79"
MAX 2,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"48.80"
MAX 2,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"46.33"
MAX 2,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"51.70"
MAX 2,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"47.87"
MAX 2,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"45.30"
MAX 2,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"48.18"
MAX 2,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"54.00"
MAX 2,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"49.79"
MAX 2,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"49.79"
MAX 2,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"41.51"
MAX 2,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"45.96"
MAX 2,Syndication REV,Apr (2025),Actual,"0.00"
MAX 2,Syndication REV,Apr (2025),Budget,"0.00"
MAX 2,Syndication REV,May (2025),Actual,"0.00"
MAX 2,Syndication REV,May (2025),Budget,"0.00"
MAX 2,Syndication REV,Jun (2025),Actual,"0.00"
MAX 2,Syndication REV,Jun (2025),Budget,"0.00"
MAX 2,Syndication REV,Jul (2025),Actual,"0.00"
MAX 2,Syndication REV,Jul (2025),Budget,"0.00"
MAX 2,Syndication REV,Aug (2025),Actual,"0.00"
MAX 2,Syndication REV,Aug (2025),Budget,"0.00"
MAX 2,Syndication REV,Sep (2025),Actual,"0.00"
MAX 2,Syndication REV,Sep (2025),Budget,"0.00"
MAX 2,Syndication REV,Oct (2025),Actual,"0.00"
MAX 2,Syndication REV,Oct (2025),Budget,"0.00"
MAX 2,Syndication REV,Nov (2025),Actual,"0.00"
MAX 2,Syndication REV,Nov (2025),Budget,"0.00"
MAX 2,Syndication REV,Dec (2025),Actual,"0.00"
MAX 2,Syndication REV,Dec (2025),Budget,"0.00"
MAX 2,Syndication REV,Jan (2026),Budget,"0.00"
MAX 2,Syndication REV,Feb (2026),Budget,"0.00"
MAX 2,Syndication REV,Mar (2026),Budget,"0.00"
MAX 2,Linear Marketing,Apr (2025),Actual,"-0.70"
MAX 2,Linear Marketing,Apr (2025),Budget,"-0.64"
MAX 2,Linear Marketing,May (2025),Actual,"-0.60"
MAX 2,Linear Marketing,May (2025),Budget,"-0.65"
MAX 2,Linear Marketing,Jun (2025),Actual,"-0.70"
MAX 2,Linear Marketing,Jun (2025),Budget,"-0.67"
MAX 2,Linear Marketing,Jul (2025),Actual,"-0.70"
MAX 2,Linear Marketing,Jul (2025),Budget,"-0.69"
MAX 2,Linear Marketing,Aug (2025),Actual,"-0.70"
MAX 2,Linear Marketing,Aug (2025),Budget,"-0.71"
MAX 2,Linear Marketing,Sep (2025),Actual,"-0.70"
MAX 2,Linear Marketing,Sep (2025),Budget,"-0.67"
MAX 2,Linear Marketing,Oct (2025),Actual,"-0.70"
MAX 2,Linear Marketing,Oct (2025),Budget,"-0.69"
MAX 2,Linear Marketing,Nov (2025),Actual,"-0.70"
MAX 2,Linear Marketing,Nov (2025),Budget,"-0.69"
MAX 2,Linear Marketing,Dec (2025),Actual,"-0.80"
MAX 2,Linear Marketing,Dec (2025),Budget,"-0.71"
MAX 2,Linear Marketing,Jan (2026),Budget,"-0.71"
MAX 2,Linear Marketing,Feb (2026),Budget,"-0.63"
MAX 2,Linear Marketing,Mar (2026),Budget,"-0.67"
MAX 2,Programming COST,Apr (2025),Actual,"-1.30"
MAX 2,Programming COST,Apr (2025),Budget,"-1.33"
MAX 2,Programming COST,May (2025),Actual,"-1.40"
MAX 2,Programming COST,May (2025),Budget,"-1.33"
MAX 2,Programming COST,Jun (2025),Actual,"-1.20"
MAX 2,Programming COST,Jun (2025),Budget,"-1.33"
MAX 2,Programming COST,Jul (2025),Actual,"-1.20"
MAX 2,Programming COST,Jul (2025),Budget,"-1.33"
MAX 2,Programming COST,Aug (2025),Actual,"-1.40"
MAX 2,Programming COST,Aug (2025),Budget,"-1.33"
MAX 2,Programming COST,Sep (2025),Actual,"-1.30"
MAX 2,Programming COST,Sep (2025),Budget,"-1.33"
MAX 2,Programming COST,Oct (2025),Actual,"-1.40"
MAX 2,Programming COST,Oct (2025),Budget,"-1.33"
MAX 2,Programming COST,Nov (2025),Actual,"-1.30"
MAX 2,Programming COST,Nov (2025),Budget,"-1.33"
MAX 2,Programming COST,Dec (2025),Actual,"-1.40"
MAX 2,Programming COST,Dec (2025),Budget,"-1.33"
MAX 2,Programming COST,Jan (2026),Budget,"-1.33"
MAX 2,Programming COST,Feb (2026),Budget,"-1.33"
MAX 2,Programming COST,Mar (2026),Budget,"-1.33"
Motion Pictures,Syndication REV,Apr (2025),Actual,"0.00"
Motion Pictures,Syndication REV,Apr (2025),Budget,"0.00"
Motion Pictures,Syndication REV,May (2025),Actual,"0.00"
Motion Pictures,Syndication REV,May (2025),Budget,"0.00"
Motion Pictures,Syndication REV,Jun (2025),Actual,"0.00"
Motion Pictures,Syndication REV,Jun (2025),Budget,"0.00"
Motion Pictures,Syndication REV,Jul (2025),Actual,"0.00"
Motion Pictures,Syndication REV,Jul (2025),Budget,"0.00"
Motion Pictures,Syndication REV,Aug (2025),Actual,"0.00"
Motion Pictures,Syndication REV,Aug (2025),Budget,"0.00"
Motion Pictures,Syndication REV,Sep (2025),Actual,"0.00"
Motion Pictures,Syndication REV,Sep (2025),Budget,"0.00"
Motion Pictures,Syndication REV,Oct (2025),Actual,"0.00"
Motion Pictures,Syndication REV,Oct (2025),Budget,"0.00"
Motion Pictures,Syndication REV,Nov (2025),Actual,"0.00"
Motion Pictures,Syndication REV,Nov (2025),Budget,"0.00"
Motion Pictures,Syndication REV,Dec (2025),Actual,"0.00"
Motion Pictures,Syndication REV,Dec (2025),Budget,"0.00"
Motion Pictures,Syndication REV,Jan (2026),Budget,"0.00"
Motion Pictures,Syndication REV,Feb (2026),Budget,"0.00"
Motion Pictures,Syndication REV,Mar (2026),Budget,"0.00"
PAL,Ad Agency Incentives,Apr (2025),Actual,"-7.30"
PAL,Ad Agency Incentives,Apr (2025),Budget,"-7.98"
PAL,Ad Agency Incentives,May (2025),Actual,"-8.40"
PAL,Ad Agency Incentives,May (2025),Budget,"-8.42"
PAL,Ad Agency Incentives,Jun (2025),Actual,"-9.00"
PAL,Ad Agency Incentives,Jun (2025),Budget,"-8.71"
PAL,Ad Agency Incentives,Jul (2025),Actual,"-8.50"
PAL,Ad Agency Incentives,Jul (2025),Budget,"-9.00"
PAL,Ad Agency Incentives,Aug (2025),Actual,"-8.70"
PAL,Ad Agency Incentives,Aug (2025),Budget,"-9.00"
PAL,Ad Agency Incentives,Sep (2025),Actual,"-9.20"
PAL,Ad Agency Incentives,Sep (2025),Budget,"-9.00"
PAL,Ad Agency Incentives,Oct (2025),Actual,"-8.60"
PAL,Ad Agency Incentives,Oct (2025),Budget,"-9.29"
PAL,Ad Agency Incentives,Nov (2025),Actual,"-9.40"
PAL,Ad Agency Incentives,Nov (2025),Budget,"-9.29"
PAL,Ad Agency Incentives,Dec (2025),Actual,"-8.80"
PAL,Ad Agency Incentives,Dec (2025),Budget,"-9.29"
PAL,Ad Agency Incentives,Jan (2026),Budget,"-9.58"
PAL,Ad Agency Incentives,Feb (2026),Budget,"-9.58"
PAL,Ad Agency Incentives,Mar (2026),Budget,"-9.58"
PAL,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"140.60"
PAL,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"128.50"
PAL,Net Advertising REV BAU (Domestic),May (2025),Actual,"135.60"
PAL,Net Advertising REV BAU (Domestic),May (2025),Budget,"135.51"
PAL,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"126.60"
PAL,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"140.19"
PAL,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"144.10"
PAL,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"144.86"
PAL,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"150.80"
PAL,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"144.86"
PAL,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"157.70"
PAL,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"144.86"
PAL,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"149.90"
PAL,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"149.53"
PAL,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"139.50"
PAL,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"149.53"
PAL,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"144.90"
PAL,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"149.53"
PAL,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"154.21"
PAL,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"154.21"
PAL,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"154.21"
PAL,Syndication REV,Apr (2025),Actual,"0.00"
PAL,Syndication REV,Apr (2025),Budget,"0.00"
PAL,Syndication REV,May (2025),Actual,"0.00"
PAL,Syndication REV,May (2025),Budget,"0.00"
PAL,Syndication REV,Jun (2025),Actual,"0.00"
PAL,Syndication REV,Jun (2025),Budget,"0.00"
PAL,Syndication REV,Jul (2025),Actual,"0.00"
PAL,Syndication REV,Jul (2025),Budget,"0.00"
PAL,Syndication REV,Aug (2025),Actual,"0.00"
PAL,Syndication REV,Aug (2025),Budget,"0.00"
PAL,Syndication REV,Sep (2025),Actual,"0.00"
PAL,Syndication REV,Sep (2025),Budget,"0.00"
PAL,Syndication REV,Oct (2025),Actual,"0.00"
PAL,Syndication REV,Oct (2025),Budget,"0.00"
PAL,Syndication REV,Nov (2025),Actual,"0.00"
PAL,Syndication REV,Nov (2025),Budget,"0.00"
PAL,Syndication REV,Dec (2025),Actual,"0.00"
PAL,Syndication REV,Dec (2025),Budget,"0.00"
PAL,Syndication REV,Jan (2026),Budget,"0.00"
PAL,Syndication REV,Feb (2026),Budget,"0.00"
PAL,Syndication REV,Mar (2026),Budget,"0.00"
PAL,Linear Marketing,Apr (2025),Actual,"-1.30"
PAL,Linear Marketing,Apr (2025),Budget,"-1.39"
PAL,Linear Marketing,May (2025),Actual,"-1.40"
PAL,Linear Marketing,May (2025),Budget,"-1.45"
PAL,Linear Marketing,Jun (2025),Actual,"-1.60"
PAL,Linear Marketing,Jun (2025),Budget,"-1.49"
PAL,Linear Marketing,Jul (2025),Actual,"-1.60"
PAL,Linear Marketing,Jul (2025),Budget,"-1.53"
PAL,Linear Marketing,Aug (2025),Actual,"-1.40"
PAL,Linear Marketing,Aug (2025),Budget,"-1.53"
PAL,Linear Marketing,Sep (2025),Actual,"-1.50"
PAL,Linear Marketing,Sep (2025),Budget,"-1.53"
PAL,Linear Marketing,Oct (2025),Actual,"-1.70"
PAL,Linear Marketing,Oct (2025),Budget,"-1.57"
PAL,Linear Marketing,Nov (2025),Actual,"-1.70"
PAL,Linear Marketing,Nov (2025),Budget,"-1.57"
PAL,Linear Marketing,Dec (2025),Actual,"-1.50"
PAL,Linear Marketing,Dec (2025),Budget,"-1.57"
PAL,Linear Marketing,Jan (2026),Budget,"-1.62"
PAL,Linear Marketing,Feb (2026),Budget,"-1.62"
PAL,Linear Marketing,Mar (2026),Budget,"-1.62"
PAL,Programming COST,Apr (2025),Actual,"-0.30"
PAL,Programming COST,Apr (2025),Budget,"-0.29"
PAL,Programming COST,May (2025),Actual,"-0.30"
PAL,Programming COST,May (2025),Budget,"-0.29"
PAL,Programming COST,Jun (2025),Actual,"-1.40"
PAL,Programming COST,Jun (2025),Budget,"-1.42"
PAL,Programming COST,Jul (2025),Actual,"-1.40"
PAL,Programming COST,Jul (2025),Budget,"-1.42"
PAL,Programming COST,Aug (2025),Actual,"-1.30"
PAL,Programming COST,Aug (2025),Budget,"-1.42"
PAL,Programming COST,Sep (2025),Actual,"-1.50"
PAL,Programming COST,Sep (2025),Budget,"-1.42"
PAL,Programming COST,Oct (2025),Actual,"-0.30"
PAL,Programming COST,Oct (2025),Budget,"-0.29"
PAL,Programming COST,Nov (2025),Actual,"-0.30"
PAL,Programming COST,Nov (2025),Budget,"-0.29"
PAL,Programming COST,Dec (2025),Actual,"-1.30"
PAL,Programming COST,Dec (2025),Budget,"-1.42"
PAL,Programming COST,Jan (2026),Budget,"-0.29"
PAL,Programming COST,Feb (2026),Budget,"-0.29"
PAL,Programming COST,Mar (2026),Budget,"-1.42"
PIX,Ad Agency Incentives,Apr (2025),Actual,"0.00"
PIX,Ad Agency Incentives,Apr (2025),Budget,"0.00"
PIX,Ad Agency Incentives,May (2025),Actual,"0.00"
PIX,Ad Agency Incentives,May (2025),Budget,"0.00"
PIX,Ad Agency Incentives,Jun (2025),Actual,"-0.50"
PIX,Ad Agency Incentives,Jun (2025),Budget,"-0.56"
PIX,Ad Agency Incentives,Jul (2025),Actual,"0.00"
PIX,Ad Agency Incentives,Jul (2025),Budget,"0.00"
PIX,Ad Agency Incentives,Aug (2025),Actual,"0.00"
PIX,Ad Agency Incentives,Aug (2025),Budget,"0.00"
PIX,Ad Agency Incentives,Sep (2025),Actual,"-0.50"
PIX,Ad Agency Incentives,Sep (2025),Budget,"-0.56"
PIX,Ad Agency Incentives,Oct (2025),Actual,"0.00"
PIX,Ad Agency Incentives,Oct (2025),Budget,"0.00"
PIX,Ad Agency Incentives,Nov (2025),Actual,"0.00"
PIX,Ad Agency Incentives,Nov (2025),Budget,"0.00"
PIX,Ad Agency Incentives,Dec (2025),Actual,"-0.60"
PIX,Ad Agency Incentives,Dec (2025),Budget,"-0.62"
PIX,Ad Agency Incentives,Jan (2026),Budget,"0.00"
PIX,Ad Agency Incentives,Feb (2026),Budget,"0.00"
PIX,Ad Agency Incentives,Mar (2026),Budget,"-0.62"
PIX,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"0.00"
PIX,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"0.00"
PIX,Net Advertising REV BAU (Domestic),May (2025),Actual,"0.00"
PIX,Net Advertising REV BAU (Domestic),May (2025),Budget,"0.00"
PIX,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"9.80"
PIX,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"8.98"
PIX,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"0.00"
PIX,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"0.00"
PIX,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"0.00"
PIX,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"0.00"
PIX,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"9.60"
PIX,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"8.98"
PIX,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"0.00"
PIX,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"0.00"
PIX,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"0.00"
PIX,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"0.00"
PIX,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"9.70"
PIX,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"10.00"
PIX,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"0.00"
PIX,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"0.00"
PIX,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"10.00"
PIX,Syndication REV,Apr (2025),Actual,"0.00"
PIX,Syndication REV,Apr (2025),Budget,"0.00"
PIX,Syndication REV,May (2025),Actual,"0.00"
PIX,Syndication REV,May (2025),Budget,"0.00"
PIX,Syndication REV,Jun (2025),Actual,"0.00"
PIX,Syndication REV,Jun (2025),Budget,"0.00"
PIX,Syndication REV,Jul (2025),Actual,"0.00"
PIX,Syndication REV,Jul (2025),Budget,"0.00"
PIX,Syndication REV,Aug (2025),Actual,"0.00"
PIX,Syndication REV,Aug (2025),Budget,"0.00"
PIX,Syndication REV,Sep (2025),Actual,"0.00"
PIX,Syndication REV,Sep (2025),Budget,"0.00"
PIX,Syndication REV,Oct (2025),Actual,"0.00"
PIX,Syndication REV,Oct (2025),Budget,"0.00"
PIX,Syndication REV,Nov (2025),Actual,"0.00"
PIX,Syndication REV,Nov (2025),Budget,"0.00"
PIX,Syndication REV,Dec (2025),Actual,"0.00"
PIX,Syndication REV,Dec (2025),Budget,"0.00"
PIX,Syndication REV,Jan (2026),Budget,"0.00"
PIX,Syndication REV,Feb (2026),Budget,"0.00"
PIX,Syndication REV,Mar (2026),Budget,"0.00"
PIX,Linear Marketing,Apr (2025),Actual,"0.00"
PIX,Linear Marketing,Apr (2025),Budget,"0.00"
PIX,Linear Marketing,May (2025),Actual,"0.00"
PIX,Linear Marketing,May (2025),Budget,"0.00"
PIX,Linear Marketing,Jun (2025),Actual,"-0.10"
PIX,Linear Marketing,Jun (2025),Budget,"-0.08"
PIX,Linear Marketing,Jul (2025),Actual,"0.00"
PIX,Linear Marketing,Jul (2025),Budget,"0.00"
PIX,Linear Marketing,Aug (2025),Actual,"0.00"
PIX,Linear Marketing,Aug (2025),Budget,"0.00"
PIX,Linear Marketing,Sep (2025),Actual,"-0.10"
PIX,Linear Marketing,Sep (2025),Budget,"-0.08"
PIX,Linear Marketing,Oct (2025),Actual,"0.00"
PIX,Linear Marketing,Oct (2025),Budget,"0.00"
PIX,Linear Marketing,Nov (2025),Actual,"0.00"
PIX,Linear Marketing,Nov (2025),Budget,"0.00"
PIX,Linear Marketing,Dec (2025),Actual,"-0.10"
PIX,Linear Marketing,Dec (2025),Budget,"-0.09"
PIX,Linear Marketing,Jan (2026),Budget,"0.00"
PIX,Linear Marketing,Feb (2026),Budget,"0.00"
PIX,Linear Marketing,Mar (2026),Budget,"-5.09"
PIX,Programming COST,Apr (2025),Actual,"0.00"
PIX,Programming COST,Apr (2025),Budget,"0.00"
PIX,Programming COST,May (2025),Actual,"0.00"
PIX,Programming COST,May (2025),Budget,"0.00"
PIX,Programming COST,Jun (2025),Actual,"0.00"
PIX,Programming COST,Jun (2025),Budget,"0.00"
PIX,Programming COST,Jul (2025),Actual,"0.00"
PIX,Programming COST,Jul (2025),Budget,"0.00"
PIX,Programming COST,Aug (2025),Actual,"0.00"
PIX,Programming COST,Aug (2025),Budget,"0.00"
PIX,Programming COST,Sep (2025),Actual,"0.00"
PIX,Programming COST,Sep (2025),Budget,"0.00"
PIX,Programming COST,Oct (2025),Actual,"0.00"
PIX,Programming COST,Oct (2025),Budget,"0.00"
PIX,Programming COST,Nov (2025),Actual,"0.00"
PIX,Programming COST,Nov (2025),Budget,"0.00"
PIX,Programming COST,Dec (2025),Actual,"0.00"
PIX,Programming COST,Dec (2025),Budget,"0.00"
PIX,Programming COST,Jan (2026),Budget,"0.00"
PIX,Programming COST,Feb (2026),Budget,"0.00"
PIX,Programming COST,Mar (2026),Budget,"0.00"
SAB,Ad Agency Incentives,Apr (2025),Actual,"-36.10"
SAB,Ad Agency Incentives,Apr (2025),Budget,"-35.42"
SAB,Ad Agency Incentives,May (2025),Actual,"-35.80"
SAB,Ad Agency Incentives,May (2025),Budget,"-37.70"
SAB,Ad Agency Incentives,Jun (2025),Actual,"-34.70"
SAB,Ad Agency Incentives,Jun (2025),Budget,"-37.27"
SAB,Ad Agency Incentives,Jul (2025),Actual,"-41.50"
SAB,Ad Agency Incentives,Jul (2025),Budget,"-45.22"
SAB,Ad Agency Incentives,Aug (2025),Actual,"-50.50"
SAB,Ad Agency Incentives,Aug (2025),Budget,"-47.14"
SAB,Ad Agency Incentives,Sep (2025),Actual,"-48.90"
SAB,Ad Agency Incentives,Sep (2025),Budget,"-52.13"
SAB,Ad Agency Incentives,Oct (2025),Actual,"-46.30"
SAB,Ad Agency Incentives,Oct (2025),Budget,"-49.93"
SAB,Ad Agency Incentives,Nov (2025),Actual,"-50.40"
SAB,Ad Agency Incentives,Nov (2025),Budget,"-52.74"
SAB,Ad Agency Incentives,Dec (2025),Actual,"-51.10"
SAB,Ad Agency Incentives,Dec (2025),Budget,"-54.55"
SAB,Ad Agency Incentives,Jan (2026),Budget,"-50.29"
SAB,Ad Agency Incentives,Feb (2026),Budget,"-44.98"
SAB,Ad Agency Incentives,Mar (2026),Budget,"-51.28"
SAB,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"620.60"
SAB,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"570.42"
SAB,Net Advertising REV BAU (Domestic),May (2025),Actual,"580.20"
SAB,Net Advertising REV BAU (Domestic),May (2025),Budget,"607.02"
SAB,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"591.50"
SAB,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"600.09"
SAB,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"718.50"
SAB,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"728.14"
SAB,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"696.00"
SAB,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"759.07"
SAB,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"797.00"
SAB,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"839.41"
SAB,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"740.90"
SAB,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"804.03"
SAB,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"902.70"
SAB,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"849.29"
SAB,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"920.10"
SAB,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"878.41"
SAB,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"809.87"
SAB,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"724.39"
SAB,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"825.69"
SAB,Syndication REV,Apr (2025),Actual,"15.20"
SAB,Syndication REV,Apr (2025),Budget,"14.07"
SAB,Syndication REV,May (2025),Actual,"10.70"
SAB,Syndication REV,May (2025),Budget,"10.33"
SAB,Syndication REV,Jun (2025),Actual,"13.00"
SAB,Syndication REV,Jun (2025),Budget,"13.31"
SAB,Syndication REV,Jul (2025),Actual,"12.90"
SAB,Syndication REV,Jul (2025),Budget,"13.45"
SAB,Syndication REV,Aug (2025),Actual,"10.50"
SAB,Syndication REV,Aug (2025),Budget,"11.45"
SAB,Syndication REV,Sep (2025),Actual,"16.30"
SAB,Syndication REV,Sep (2025),Budget,"15.89"
SAB,Syndication REV,Oct (2025),Actual,"14.10"
SAB,Syndication REV,Oct (2025),Budget,"15.07"
SAB,Syndication REV,Nov (2025),Actual,"11.20"
SAB,Syndication REV,Nov (2025),Budget,"10.37"
SAB,Syndication REV,Dec (2025),Actual,"10.70"
SAB,Syndication REV,Dec (2025),Budget,"10.91"
SAB,Syndication REV,Jan (2026),Budget,"15.16"
SAB,Syndication REV,Feb (2026),Budget,"12.16"
SAB,Syndication REV,Mar (2026),Budget,"12.24"
SAB,Linear Marketing,Apr (2025),Actual,"-19.80"
SAB,Linear Marketing,Apr (2025),Budget,"-19.13"
SAB,Linear Marketing,May (2025),Actual,"-18.80"
SAB,Linear Marketing,May (2025),Budget,"-19.46"
SAB,Linear Marketing,Jun (2025),Actual,"-67.40"
SAB,Linear Marketing,Jun (2025),Budget,"-66.40"
SAB,Linear Marketing,Jul (2025),Actual,"-65.60"
SAB,Linear Marketing,Jul (2025),Budget,"-69.05"
SAB,Linear Marketing,Aug (2025),Actual,"-60.10"
SAB,Linear Marketing,Aug (2025),Budget,"-60.83"
SAB,Linear Marketing,Sep (2025),Actual,"-29.40"
SAB,Linear Marketing,Sep (2025),Budget,"-27.55"
SAB,Linear Marketing,Oct (2025),Actual,"-22.20"
SAB,Linear Marketing,Oct (2025),Budget,"-23.73"
SAB,Linear Marketing,Nov (2025),Actual,"-67.90"
SAB,Linear Marketing,Nov (2025),Budget,"-62.14"
SAB,Linear Marketing,Dec (2025),Actual,"-46.60"
SAB,Linear Marketing,Dec (2025),Budget,"-43.40"
SAB,Linear Marketing,Jan (2026),Budget,"-44.29"
SAB,Linear Marketing,Feb (2026),Budget,"-21.52"
SAB,Linear Marketing,Mar (2026),Budget,"-21.43"
SAB,Programming COST,Apr (2025),Actual,"-327.90"
SAB,Programming COST,Apr (2025),Budget,"-358.34"
SAB,Programming COST,May (2025),Actual,"-398.30"
SAB,Programming COST,May (2025),Budget,"-373.23"
SAB,Programming COST,Jun (2025),Actual,"-322.90"
SAB,Programming COST,Jun (2025),Budget,"-347.90"
SAB,Programming COST,Jul (2025),Actual,"-387.80"
SAB,Programming COST,Jul (2025),Budget,"-382.05"
SAB,Programming COST,Aug (2025),Actual,"-418.30"
SAB,Programming COST,Aug (2025),Budget,"-463.66"
SAB,Programming COST,Sep (2025),Actual,"-452.50"
SAB,Programming COST,Sep (2025),Budget,"-447.02"
SAB,Programming COST,Oct (2025),Actual,"-399.40"
SAB,Programming COST,Oct (2025),Budget,"-435.36"
SAB,Programming COST,Nov (2025),Actual,"-355.50"
SAB,Programming COST,Nov (2025),Budget,"-352.39"
SAB,Programming COST,Dec (2025),Actual,"-358.40"
SAB,Programming COST,Dec (2025),Budget,"-385.46"
SAB,Programming COST,Jan (2026),Budget,"-395.28"
SAB,Programming COST,Feb (2026),Budget,"-345.29"
SAB,Programming COST,Mar (2026),Budget,"-374.01"
SET,Ad Agency Incentives,Apr (2025),Actual,"-24.00"
SET,Ad Agency Incentives,Apr (2025),Budget,"-23.05"
SET,Ad Agency Incentives,May (2025),Actual,"-21.50"
SET,Ad Agency Incentives,May (2025),Budget,"-21.93"
SET,Ad Agency Incentives,Jun (2025),Actual,"-24.10"
SET,Ad Agency Incentives,Jun (2025),Budget,"-22.36"
SET,Ad Agency Incentives,Jul (2025),Actual,"-25.30"
SET,Ad Agency Incentives,Jul (2025),Budget,"-27.77"
SET,Ad Agency Incentives,Aug (2025),Actual,"-44.20"
SET,Ad Agency Incentives,Aug (2025),Budget,"-44.82"
SET,Ad Agency Incentives,Sep (2025),Actual,"-55.80"
SET,Ad Agency Incentives,Sep (2025),Budget,"-56.21"
SET,Ad Agency Incentives,Oct (2025),Actual,"-60.30"
SET,Ad Agency Incentives,Oct (2025),Budget,"-58.63"
SET,Ad Agency Incentives,Nov (2025),Actual,"-57.10"
SET,Ad Agency Incentives,Nov (2025),Budget,"-54.15"
SET,Ad Agency Incentives,Dec (2025),Actual,"-59.90"
SET,Ad Agency Incentives,Dec (2025),Budget,"-55.33"
SET,Ad Agency Incentives,Jan (2026),Budget,"-41.16"
SET,Ad Agency Incentives,Feb (2026),Budget,"-35.41"
SET,Ad Agency Incentives,Mar (2026),Budget,"-30.02"
SET,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"400.60"
SET,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"371.24"
SET,Net Advertising REV BAU (Domestic),May (2025),Actual,"382.00"
SET,Net Advertising REV BAU (Domestic),May (2025),Budget,"353.13"
SET,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"393.70"
SET,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"360.07"
SET,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"438.10"
SET,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"447.18"
SET,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"792.00"
SET,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"721.80"
SET,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"896.20"
SET,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"905.15"
SET,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"934.10"
SET,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"944.06"
SET,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"900.80"
SET,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"871.96"
SET,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"882.50"
SET,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"891.06"
SET,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"662.81"
SET,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"570.20"
SET,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"483.48"
SET,Syndication REV,Apr (2025),Actual,"27.00"
SET,Syndication REV,Apr (2025),Budget,"27.16"
SET,Syndication REV,May (2025),Actual,"34.40"
SET,Syndication REV,May (2025),Budget,"32.36"
SET,Syndication REV,Jun (2025),Actual,"28.70"
SET,Syndication REV,Jun (2025),Budget,"31.21"
SET,Syndication REV,Jul (2025),Actual,"29.60"
SET,Syndication REV,Jul (2025),Budget,"32.00"
SET,Syndication REV,Aug (2025),Actual,"33.20"
SET,Syndication REV,Aug (2025),Budget,"32.85"
SET,Syndication REV,Sep (2025),Actual,"40.80"
SET,Syndication REV,Sep (2025),Budget,"38.04"
SET,Syndication REV,Oct (2025),Actual,"41.10"
SET,Syndication REV,Oct (2025),Budget,"38.12"
SET,Syndication REV,Nov (2025),Actual,"35.60"
SET,Syndication REV,Nov (2025),Budget,"36.74"
SET,Syndication REV,Dec (2025),Actual,"33.80"
SET,Syndication REV,Dec (2025),Budget,"33.43"
SET,Syndication REV,Jan (2026),Budget,"29.38"
SET,Syndication REV,Feb (2026),Budget,"46.80"
SET,Syndication REV,Mar (2026),Budget,"42.88"
SET,Linear Marketing,Apr (2025),Actual,"-94.40"
SET,Linear Marketing,Apr (2025),Budget,"-95.58"
SET,Linear Marketing,May (2025),Actual,"-101.30"
SET,Linear Marketing,May (2025),Budget,"-100.91"
SET,Linear Marketing,Jun (2025),Actual,"-70.90"
SET,Linear Marketing,Jun (2025),Budget,"-70.98"
SET,Linear Marketing,Jul (2025),Actual,"-62.50"
SET,Linear Marketing,Jul (2025),Budget,"-64.31"
SET,Linear Marketing,Aug (2025),Actual,"-139.80"
SET,Linear Marketing,Aug (2025),Budget,"-129.78"
SET,Linear Marketing,Sep (2025),Actual,"-97.60"
SET,Linear Marketing,Sep (2025),Budget,"-91.43"
SET,Linear Marketing,Oct (2025),Actual,"-81.70"
SET,Linear Marketing,Oct (2025),Budget,"-86.78"
SET,Linear Marketing,Nov (2025),Actual,"-75.00"
SET,Linear Marketing,Nov (2025),Budget,"-81.13"
SET,Linear Marketing,Dec (2025),Actual,"-111.70"
SET,Linear Marketing,Dec (2025),Budget,"-111.30"
SET,Linear Marketing,Jan (2026),Budget,"-96.75"
SET,Linear Marketing,Feb (2026),Budget,"-70.42"
SET,Linear Marketing,Mar (2026),Budget,"-69.64"
SET,Programming COST,Apr (2025),Actual,"-456.60"
SET,Programming COST,Apr (2025),Budget,"-416.07"
SET,Programming COST,May (2025),Actual,"-292.80"
SET,Programming COST,May (2025),Budget,"-303.69"
SET,Programming COST,Jun (2025),Actual,"-296.80"
SET,Programming COST,Jun (2025),Budget,"-295.74"
SET,Programming COST,Jul (2025),Actual,"-292.90"
SET,Programming COST,Jul (2025),Budget,"-299.61"
SET,Programming COST,Aug (2025),Actual,"-533.70"
SET,Programming COST,Aug (2025),Budget,"-537.02"
SET,Programming COST,Sep (2025),Actual,"-732.20"
SET,Programming COST,Sep (2025),Budget,"-680.93"
SET,Programming COST,Oct (2025),Actual,"-728.40"
SET,Programming COST,Oct (2025),Budget,"-723.04"
SET,Programming COST,Nov (2025),Actual,"-747.00"
SET,Programming COST,Nov (2025),Budget,"-690.81"
SET,Programming COST,Dec (2025),Actual,"-695.20"
SET,Programming COST,Dec (2025),Budget,"-707.26"
SET,Programming COST,Jan (2026),Budget,"-470.17"
SET,Programming COST,Feb (2026),Budget,"-400.95"
SET,Programming COST,Mar (2026),Budget,"-297.39"
SONY MARATHI,Ad Agency Incentives,Apr (2025),Actual,"-1.10"
SONY MARATHI,Ad Agency Incentives,Apr (2025),Budget,"-1.26"
SONY MARATHI,Ad Agency Incentives,May (2025),Actual,"-1.30"
SONY MARATHI,Ad Agency Incentives,May (2025),Budget,"-1.26"
SONY MARATHI,Ad Agency Incentives,Jun (2025),Actual,"-1.30"
SONY MARATHI,Ad Agency Incentives,Jun (2025),Budget,"-1.32"
SONY MARATHI,Ad Agency Incentives,Jul (2025),Actual,"-1.30"
SONY MARATHI,Ad Agency Incentives,Jul (2025),Budget,"-1.32"
SONY MARATHI,Ad Agency Incentives,Aug (2025),Actual,"-1.40"
SONY MARATHI,Ad Agency Incentives,Aug (2025),Budget,"-1.32"
SONY MARATHI,Ad Agency Incentives,Sep (2025),Actual,"-1.30"
SONY MARATHI,Ad Agency Incentives,Sep (2025),Budget,"-1.32"
SONY MARATHI,Ad Agency Incentives,Oct (2025),Actual,"-1.20"
SONY MARATHI,Ad Agency Incentives,Oct (2025),Budget,"-1.26"
SONY MARATHI,Ad Agency Incentives,Nov (2025),Actual,"-1.20"
SONY MARATHI,Ad Agency Incentives,Nov (2025),Budget,"-1.32"
SONY MARATHI,Ad Agency Incentives,Dec (2025),Actual,"-1.30"
SONY MARATHI,Ad Agency Incentives,Dec (2025),Budget,"-1.32"
SONY MARATHI,Ad Agency Incentives,Jan (2026),Budget,"-1.32"
SONY MARATHI,Ad Agency Incentives,Feb (2026),Budget,"-1.26"
SONY MARATHI,Ad Agency Incentives,Mar (2026),Budget,"-1.26"
SONY MARATHI,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"20.60"
SONY MARATHI,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"20.24"
SONY MARATHI,Net Advertising REV BAU (Domestic),May (2025),Actual,"19.20"
SONY MARATHI,Net Advertising REV BAU (Domestic),May (2025),Budget,"20.24"
SONY MARATHI,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"23.20"
SONY MARATHI,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"21.26"
SONY MARATHI,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"21.80"
SONY MARATHI,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"21.26"
SONY MARATHI,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"20.70"
SONY MARATHI,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"21.26"
SONY MARATHI,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"19.70"
SONY MARATHI,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"21.26"
SONY MARATHI,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"20.40"
SONY MARATHI,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"20.24"
SONY MARATHI,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"21.40"
SONY MARATHI,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"21.26"
SONY MARATHI,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"20.10"
SONY MARATHI,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"21.26"
SONY MARATHI,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"21.26"
SONY MARATHI,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"20.24"
SONY MARATHI,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"20.24"
SONY MARATHI,Syndication REV,Apr (2025),Actual,"0.00"
SONY MARATHI,Syndication REV,Apr (2025),Budget,"0.00"
SONY MARATHI,Syndication REV,May (2025),Actual,"0.80"
SONY MARATHI,Syndication REV,May (2025),Budget,"0.75"
SONY MARATHI,Syndication REV,Jun (2025),Actual,"1.50"
SONY MARATHI,Syndication REV,Jun (2025),Budget,"1.49"
SONY MARATHI,Syndication REV,Jul (2025),Actual,"0.80"
SONY MARATHI,Syndication REV,Jul (2025),Budget,"0.75"
SONY MARATHI,Syndication REV,Aug (2025),Actual,"1.40"
SONY MARATHI,Syndication REV,Aug (2025),Budget,"1.25"
SONY MARATHI,Syndication REV,Sep (2025),Actual,"1.60"
SONY MARATHI,Syndication REV,Sep (2025),Budget,"1.50"
SONY MARATHI,Syndication REV,Oct (2025),Actual,"1.80"
SONY MARATHI,Syndication REV,Oct (2025),Budget,"2.00"
SONY MARATHI,Syndication REV,Nov (2025),Actual,"1.60"
SONY MARATHI,Syndication REV,Nov (2025),Budget,"1.50"
SONY MARATHI,Syndication REV,Dec (2025),Actual,"2.10"
SONY MARATHI,Syndication REV,Dec (2025),Budget,"2.24"
SONY MARATHI,Syndication REV,Jan (2026),Budget,"1.25"
SONY MARATHI,Syndication REV,Feb (2026),Budget,"1.25"
SONY MARATHI,Syndication REV,Mar (2026),Budget,"1.25"
SONY MARATHI,Linear Marketing,Apr (2025),Actual,"-9.60"
SONY MARATHI,Linear Marketing,Apr (2025),Budget,"-10.33"
SONY MARATHI,Linear Marketing,May (2025),Actual,"-2.90"
SONY MARATHI,Linear Marketing,May (2025),Budget,"-2.81"
SONY MARATHI,Linear Marketing,Jun (2025),Actual,"-6.50"
SONY MARATHI,Linear Marketing,Jun (2025),Budget,"-6.97"
SONY MARATHI,Linear Marketing,Jul (2025),Actual,"-7.70"
SONY MARATHI,Linear Marketing,Jul (2025),Budget,"-7.32"
SONY MARATHI,Linear Marketing,Aug (2025),Actual,"-6.50"
SONY MARATHI,Linear Marketing,Aug (2025),Budget,"-6.74"
SONY MARATHI,Linear Marketing,Sep (2025),Actual,"-3.30"
SONY MARATHI,Linear Marketing,Sep (2025),Budget,"-3.32"
SONY MARATHI,Linear Marketing,Oct (2025),Actual,"-10.90"
SONY MARATHI,Linear Marketing,Oct (2025),Budget,"-11.16"
SONY MARATHI,Linear Marketing,Nov (2025),Actual,"-3.50"
SONY MARATHI,Linear Marketing,Nov (2025),Budget,"-3.32"
SONY MARATHI,Linear Marketing,Dec (2025),Actual,"-6.50"
SONY MARATHI,Linear Marketing,Dec (2025),Budget,"-6.34"
SONY MARATHI,Linear Marketing,Jan (2026),Budget,"-9.47"
SONY MARATHI,Linear Marketing,Feb (2026),Budget,"-2.81"
SONY MARATHI,Linear Marketing,Mar (2026),Budget,"-2.81"
SONY MARATHI,Programming COST,Apr (2025),Actual,"-44.10"
SONY MARATHI,Programming COST,Apr (2025),Budget,"-41.84"
SONY MARATHI,Programming COST,May (2025),Actual,"-38.30"
SONY MARATHI,Programming COST,May (2025),Budget,"-40.81"
SONY MARATHI,Programming COST,Jun (2025),Actual,"-44.80"
SONY MARATHI,Programming COST,Jun (2025),Budget,"-41.63"
SONY MARATHI,Programming COST,Jul (2025),Actual,"-42.90"
SONY MARATHI,Programming COST,Jul (2025),Budget,"-41.73"
SONY MARATHI,Programming COST,Aug (2025),Actual,"-35.10"
SONY MARATHI,Programming COST,Aug (2025),Budget,"-38.48"
SONY MARATHI,Programming COST,Sep (2025),Actual,"-42.60"
SONY MARATHI,Programming COST,Sep (2025),Budget,"-43.43"
SONY MARATHI,Programming COST,Oct (2025),Actual,"-35.10"
SONY MARATHI,Programming COST,Oct (2025),Budget,"-34.47"
SONY MARATHI,Programming COST,Nov (2025),Actual,"-32.60"
SONY MARATHI,Programming COST,Nov (2025),Budget,"-31.82"
SONY MARATHI,Programming COST,Dec (2025),Actual,"-36.80"
SONY MARATHI,Programming COST,Dec (2025),Budget,"-40.09"
SONY MARATHI,Programming COST,Jan (2026),Budget,"-34.64"
SONY MARATHI,Programming COST,Feb (2026),Budget,"-31.25"
SONY MARATHI,Programming COST,Mar (2026),Budget,"-34.97"
Sports,Ad Agency Incentives,Apr (2025),Actual,"-0.90"
Sports,Ad Agency Incentives,Apr (2025),Budget,"-0.79"
Sports,Ad Agency Incentives,May (2025),Actual,"-2.10"
Sports,Ad Agency Incentives,May (2025),Budget,"-2.19"
Sports,Ad Agency Incentives,Jun (2025),Actual,"-10.20"
Sports,Ad Agency Incentives,Jun (2025),Budget,"-11.27"
Sports,Ad Agency Incentives,Jul (2025),Actual,"-27.60"
Sports,Ad Agency Incentives,Jul (2025),Budget,"-27.37"
Sports,Ad Agency Incentives,Aug (2025),Actual,"-11.20"
Sports,Ad Agency Incentives,Aug (2025),Budget,"-10.67"
Sports,Ad Agency Incentives,Sep (2025),Actual,"-138.70"
Sports,Ad Agency Incentives,Sep (2025),Budget,"-136.45"
Sports,Ad Agency Incentives,Oct (2025),Actual,"-0.80"
Sports,Ad Agency Incentives,Oct (2025),Budget,"-0.86"
Sports,Ad Agency Incentives,Nov (2025),Actual,"-0.80"
Sports,Ad Agency Incentives,Nov (2025),Budget,"-0.86"
Sports,Ad Agency Incentives,Dec (2025),Actual,"-0.80"
Sports,Ad Agency Incentives,Dec (2025),Budget,"-0.79"
Sports,Ad Agency Incentives,Jan (2026),Budget,"-2.10"
Sports,Ad Agency Incentives,Feb (2026),Budget,"-2.10"
Sports,Ad Agency Incentives,Mar (2026),Budget,"-0.72"
Sports,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"13.90"
Sports,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"12.79"
Sports,Net Advertising REV BAU (Domestic),May (2025),Actual,"32.80"
Sports,Net Advertising REV BAU (Domestic),May (2025),Budget,"35.29"
Sports,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"194.40"
Sports,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"181.55"
Sports,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"452.70"
Sports,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"440.76"
Sports,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"167.30"
Sports,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"171.77"
Sports,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"1241.10"
Sports,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"1137.79"
Sports,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"13.20"
Sports,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"13.89"
Sports,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"13.50"
Sports,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"13.89"
Sports,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"12.70"
Sports,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"12.79"
Sports,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"33.89"
Sports,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"33.89"
Sports,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"11.59"
Sports,Syndication REV,Apr (2025),Actual,"5.20"
Sports,Syndication REV,Apr (2025),Budget,"5.02"
Sports,Syndication REV,May (2025),Actual,"0.00"
Sports,Syndication REV,May (2025),Budget,"0.00"
Sports,Syndication REV,Jun (2025),Actual,"11.30"
Sports,Syndication REV,Jun (2025),Budget,"12.51"
Sports,Syndication REV,Jul (2025),Actual,"88.70"
Sports,Syndication REV,Jul (2025),Budget,"86.44"
Sports,Syndication REV,Aug (2025),Actual,"0.40"
Sports,Syndication REV,Aug (2025),Budget,"0.37"
Sports,Syndication REV,Sep (2025),Actual,"455.40"
Sports,Syndication REV,Sep (2025),Budget,"490.00"
Sports,Syndication REV,Oct (2025),Actual,"4.90"
Sports,Syndication REV,Oct (2025),Budget,"4.90"
Sports,Syndication REV,Nov (2025),Actual,"2.50"
Sports,Syndication REV,Nov (2025),Budget,"2.72"
Sports,Syndication REV,Dec (2025),Actual,"1.30"
Sports,Syndication REV,Dec (2025),Budget,"1.34"
Sports,Syndication REV,Jan (2026),Budget,"-4.65"
Sports,Syndication REV,Feb (2026),Budget,"-4.65"
Sports,Syndication REV,Mar (2026),Budget,"0.00"
Sports,Linear Marketing,Apr (2025),Actual,"-3.20"
Sports,Linear Marketing,Apr (2025),Budget,"-3.18"
Sports,Linear Marketing,May (2025),Actual,"-48.70"
Sports,Linear Marketing,May (2025),Budget,"-50.09"
Sports,Linear Marketing,Jun (2025),Actual,"-134.40"
Sports,Linear Marketing,Jun (2025),Budget,"-128.70"
Sports,Linear Marketing,Jul (2025),Actual,"-10.90"
Sports,Linear Marketing,Jul (2025),Budget,"-12.04"
Sports,Linear Marketing,Aug (2025),Actual,"-16.30"
Sports,Linear Marketing,Aug (2025),Budget,"-17.61"
Sports,Linear Marketing,Sep (2025),Actual,"-83.90"
Sports,Linear Marketing,Sep (2025),Budget,"-85.31"
Sports,Linear Marketing,Oct (2025),Actual,"-8.20"
Sports,Linear Marketing,Oct (2025),Budget,"-8.19"
Sports,Linear Marketing,Nov (2025),Actual,"-14.40"
Sports,Linear Marketing,Nov (2025),Budget,"-13.19"
Sports,Linear Marketing,Dec (2025),Actual,"-4.10"
Sports,Linear Marketing,Dec (2025),Budget,"-4.18"
Sports,Linear Marketing,Jan (2026),Budget,"-8.87"
Sports,Linear Marketing,Feb (2026),Budget,"-15.37"
Sports,Linear Marketing,Mar (2026),Budget,"-9.67"
Sports,Programming COST,Apr (2025),Actual,"-27.80"
Sports,Programming COST,Apr (2025),Budget,"-30.89"
Sports,Programming COST,May (2025),Actual,"-46.70"
Sports,Programming COST,May (2025),Budget,"-45.89"
Sports,Programming COST,Jun (2025),Actual,"-100.10"
Sports,Programming COST,Jun (2025),Budget,"-96.35"
Sports,Programming COST,Jul (2025),Actual,"-192.00"
Sports,Programming COST,Jul (2025),Budget,"-190.23"
Sports,Programming COST,Aug (2025),Actual,"-90.00"
Sports,Programming COST,Aug (2025),Budget,"-97.48"
Sports,Programming COST,Sep (2025),Actual,"-206.80"
Sports,Programming COST,Sep (2025),Budget,"-228.36"
Sports,Programming COST,Oct (2025),Actual,"-26.90"
Sports,Programming COST,Oct (2025),Budget,"-27.28"
Sports,Programming COST,Nov (2025),Actual,"-29.70"
Sports,Programming COST,Nov (2025),Budget,"-27.28"
Sports,Programming COST,Dec (2025),Actual,"-32.30"
Sports,Programming COST,Dec (2025),Budget,"-32.28"
Sports,Programming COST,Jan (2026),Budget,"-57.89"
Sports,Programming COST,Feb (2026),Budget,"-27.89"
Sports,Programming COST,Mar (2026),Budget,"-27.89"
STUDIO NEXT,Programming COST,Apr (2025),Actual,"8.20"
STUDIO NEXT,Programming COST,Apr (2025),Budget,"8.70"
STUDIO NEXT,Programming COST,May (2025),Actual,"7.90"
STUDIO NEXT,Programming COST,May (2025),Budget,"8.70"
STUDIO NEXT,Programming COST,Jun (2025),Actual,"9.10"
STUDIO NEXT,Programming COST,Jun (2025),Budget,"8.70"
STUDIO NEXT,Programming COST,Jul (2025),Actual,"8.60"
STUDIO NEXT,Programming COST,Jul (2025),Budget,"8.70"
STUDIO NEXT,Programming COST,Aug (2025),Actual,"8.00"
STUDIO NEXT,Programming COST,Aug (2025),Budget,"8.70"
STUDIO NEXT,Programming COST,Sep (2025),Actual,"8.10"
STUDIO NEXT,Programming COST,Sep (2025),Budget,"8.70"
STUDIO NEXT,Programming COST,Oct (2025),Actual,"9.10"
STUDIO NEXT,Programming COST,Oct (2025),Budget,"8.70"
STUDIO NEXT,Programming COST,Nov (2025),Actual,"8.00"
STUDIO NEXT,Programming COST,Nov (2025),Budget,"8.70"
STUDIO NEXT,Programming COST,Dec (2025),Actual,"9.60"
STUDIO NEXT,Programming COST,Dec (2025),Budget,"8.70"
STUDIO NEXT,Programming COST,Jan (2026),Budget,"8.70"
STUDIO NEXT,Programming COST,Feb (2026),Budget,"8.70"
STUDIO NEXT,Programming COST,Mar (2026),Budget,"8.70"
WAH,Ad Agency Incentives,Apr (2025),Actual,"-5.20"
WAH,Ad Agency Incentives,Apr (2025),Budget,"-4.88"
WAH,Ad Agency Incentives,May (2025),Actual,"-4.50"
WAH,Ad Agency Incentives,May (2025),Budget,"-4.88"
WAH,Ad Agency Incentives,Jun (2025),Actual,"-4.90"
WAH,Ad Agency Incentives,Jun (2025),Budget,"-5.28"
WAH,Ad Agency Incentives,Jul (2025),Actual,"-5.40"
WAH,Ad Agency Incentives,Jul (2025),Budget,"-5.28"
WAH,Ad Agency Incentives,Aug (2025),Actual,"-5.10"
WAH,Ad Agency Incentives,Aug (2025),Budget,"-5.54"
WAH,Ad Agency Incentives,Sep (2025),Actual,"-4.80"
WAH,Ad Agency Incentives,Sep (2025),Budget,"-5.28"
WAH,Ad Agency Incentives,Oct (2025),Actual,"-6.00"
WAH,Ad Agency Incentives,Oct (2025),Budget,"-5.54"
WAH,Ad Agency Incentives,Nov (2025),Actual,"-5.50"
WAH,Ad Agency Incentives,Nov (2025),Budget,"-5.54"
WAH,Ad Agency Incentives,Dec (2025),Actual,"-5.40"
WAH,Ad Agency Incentives,Dec (2025),Budget,"-5.41"
WAH,Ad Agency Incentives,Jan (2026),Budget,"-5.41"
WAH,Ad Agency Incentives,Feb (2026),Budget,"-5.15"
WAH,Ad Agency Incentives,Mar (2026),Budget,"-5.15"
WAH,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"72.20"
WAH,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"78.63"
WAH,Net Advertising REV BAU (Domestic),May (2025),Actual,"78.50"
WAH,Net Advertising REV BAU (Domestic),May (2025),Budget,"78.63"
WAH,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"81.50"
WAH,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"85.00"
WAH,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"77.30"
WAH,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"85.00"
WAH,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"94.80"
WAH,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"89.25"
WAH,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"86.80"
WAH,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"85.00"
WAH,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"85.10"
WAH,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"89.25"
WAH,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"96.00"
WAH,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"89.25"
WAH,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"80.90"
WAH,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"87.13"
WAH,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"87.13"
WAH,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"82.88"
WAH,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"82.88"
WAH,Syndication REV,Apr (2025),Actual,"0.00"
WAH,Syndication REV,Apr (2025),Budget,"0.00"
WAH,Syndication REV,May (2025),Actual,"0.00"
WAH,Syndication REV,May (2025),Budget,"0.00"
WAH,Syndication REV,Jun (2025),Actual,"0.00"
WAH,Syndication REV,Jun (2025),Budget,"0.00"
WAH,Syndication REV,Jul (2025),Actual,"0.00"
WAH,Syndication REV,Jul (2025),Budget,"0.00"
WAH,Syndication REV,Aug (2025),Actual,"0.00"
WAH,Syndication REV,Aug (2025),Budget,"0.00"
WAH,Syndication REV,Sep (2025),Actual,"0.00"
WAH,Syndication REV,Sep (2025),Budget,"0.00"
WAH,Syndication REV,Oct (2025),Actual,"0.00"
WAH,Syndication REV,Oct (2025),Budget,"0.00"
WAH,Syndication REV,Nov (2025),Actual,"0.00"
WAH,Syndication REV,Nov (2025),Budget,"0.00"
WAH,Syndication REV,Dec (2025),Actual,"0.00"
WAH,Syndication REV,Dec (2025),Budget,"0.00"
WAH,Syndication REV,Jan (2026),Budget,"0.00"
WAH,Syndication REV,Feb (2026),Budget,"0.00"
WAH,Syndication REV,Mar (2026),Budget,"0.00"
WAH,Linear Marketing,Apr (2025),Actual,"-2.30"
WAH,Linear Marketing,Apr (2025),Budget,"-2.49"
WAH,Linear Marketing,May (2025),Actual,"-1.30"
WAH,Linear Marketing,May (2025),Budget,"-1.19"
WAH,Linear Marketing,Jun (2025),Actual,"-1.00"
WAH,Linear Marketing,Jun (2025),Budget,"-1.09"
WAH,Linear Marketing,Jul (2025),Actual,"-1.10"
WAH,Linear Marketing,Jul (2025),Budget,"-1.19"
WAH,Linear Marketing,Aug (2025),Actual,"-1.10"
WAH,Linear Marketing,Aug (2025),Budget,"-1.13"
WAH,Linear Marketing,Sep (2025),Actual,"-1.00"
WAH,Linear Marketing,Sep (2025),Budget,"-1.09"
WAH,Linear Marketing,Oct (2025),Actual,"-2.80"
WAH,Linear Marketing,Oct (2025),Budget,"-2.73"
WAH,Linear Marketing,Nov (2025),Actual,"-1.20"
WAH,Linear Marketing,Nov (2025),Budget,"-1.23"
WAH,Linear Marketing,Dec (2025),Actual,"-1.00"
WAH,Linear Marketing,Dec (2025),Budget,"-1.11"
WAH,Linear Marketing,Jan (2026),Budget,"-1.11"
WAH,Linear Marketing,Feb (2026),Budget,"-1.07"
WAH,Linear Marketing,Mar (2026),Budget,"-1.17"
WAH,Programming COST,Apr (2025),Actual,"-0.70"
WAH,Programming COST,Apr (2025),Budget,"-0.67"
WAH,Programming COST,May (2025),Actual,"-0.70"
WAH,Programming COST,May (2025),Budget,"-0.67"
WAH,Programming COST,Jun (2025),Actual,"-0.70"
WAH,Programming COST,Jun (2025),Budget,"-0.67"
WAH,Programming COST,Jul (2025),Actual,"-0.70"
WAH,Programming COST,Jul (2025),Budget,"-0.67"
WAH,Programming COST,Aug (2025),Actual,"-0.70"
WAH,Programming COST,Aug (2025),Budget,"-0.67"
WAH,Programming COST,Sep (2025),Actual,"-0.70"
WAH,Programming COST,Sep (2025),Budget,"-0.67"
WAH,Programming COST,Oct (2025),Actual,"-0.60"
WAH,Programming COST,Oct (2025),Budget,"-0.67"
WAH,Programming COST,Nov (2025),Actual,"-0.70"
WAH,Programming COST,Nov (2025),Budget,"-0.67"
WAH,Programming COST,Dec (2025),Actual,"-0.70"
WAH,Programming COST,Dec (2025),Budget,"-0.67"
WAH,Programming COST,Jan (2026),Budget,"-0.67"
WAH,Programming COST,Feb (2026),Budget,"-0.67"
WAH,Programming COST,Mar (2026),Budget,"-0.67"
YAY,Ad Agency Incentives,Apr (2025),Actual,"-1.40"
YAY,Ad Agency Incentives,Apr (2025),Budget,"-1.48"
YAY,Ad Agency Incentives,May (2025),Actual,"-1.50"
YAY,Ad Agency Incentives,May (2025),Budget,"-1.52"
YAY,Ad Agency Incentives,Jun (2025),Actual,"-1.50"
YAY,Ad Agency Incentives,Jun (2025),Budget,"-1.45"
YAY,Ad Agency Incentives,Jul (2025),Actual,"-1.40"
YAY,Ad Agency Incentives,Jul (2025),Budget,"-1.36"
YAY,Ad Agency Incentives,Aug (2025),Actual,"-1.40"
YAY,Ad Agency Incentives,Aug (2025),Budget,"-1.34"
YAY,Ad Agency Incentives,Sep (2025),Actual,"-1.60"
YAY,Ad Agency Incentives,Sep (2025),Budget,"-1.43"
YAY,Ad Agency Incentives,Oct (2025),Actual,"-1.40"
YAY,Ad Agency Incentives,Oct (2025),Budget,"-1.38"
YAY,Ad Agency Incentives,Nov (2025),Actual,"-1.40"
YAY,Ad Agency Incentives,Nov (2025),Budget,"-1.43"
YAY,Ad Agency Incentives,Dec (2025),Actual,"-1.50"
YAY,Ad Agency Incentives,Dec (2025),Budget,"-1.36"
YAY,Ad Agency Incentives,Jan (2026),Budget,"-1.29"
YAY,Ad Agency Incentives,Feb (2026),Budget,"-1.36"
YAY,Ad Agency Incentives,Mar (2026),Budget,"-1.36"
YAY,Net Advertising REV BAU (Domestic),Apr (2025),Actual,"22.30"
YAY,Net Advertising REV BAU (Domestic),Apr (2025),Budget,"23.79"
YAY,Net Advertising REV BAU (Domestic),May (2025),Actual,"26.90"
YAY,Net Advertising REV BAU (Domestic),May (2025),Budget,"24.55"
YAY,Net Advertising REV BAU (Domestic),Jun (2025),Actual,"22.90"
YAY,Net Advertising REV BAU (Domestic),Jun (2025),Budget,"23.41"
YAY,Net Advertising REV BAU (Domestic),Jul (2025),Actual,"21.40"
YAY,Net Advertising REV BAU (Domestic),Jul (2025),Budget,"21.90"
YAY,Net Advertising REV BAU (Domestic),Aug (2025),Actual,"23.40"
YAY,Net Advertising REV BAU (Domestic),Aug (2025),Budget,"21.52"
YAY,Net Advertising REV BAU (Domestic),Sep (2025),Actual,"21.80"
YAY,Net Advertising REV BAU (Domestic),Sep (2025),Budget,"23.03"
YAY,Net Advertising REV BAU (Domestic),Oct (2025),Actual,"21.70"
YAY,Net Advertising REV BAU (Domestic),Oct (2025),Budget,"22.28"
YAY,Net Advertising REV BAU (Domestic),Nov (2025),Actual,"22.50"
YAY,Net Advertising REV BAU (Domestic),Nov (2025),Budget,"23.03"
YAY,Net Advertising REV BAU (Domestic),Dec (2025),Actual,"20.50"
YAY,Net Advertising REV BAU (Domestic),Dec (2025),Budget,"21.90"
YAY,Net Advertising REV BAU (Domestic),Jan (2026),Budget,"20.77"
YAY,Net Advertising REV BAU (Domestic),Feb (2026),Budget,"21.90"
YAY,Net Advertising REV BAU (Domestic),Mar (2026),Budget,"21.90"
YAY,Syndication REV,Apr (2025),Actual,"1.00"
YAY,Syndication REV,Apr (2025),Budget,"1.00"
YAY,Syndication REV,May (2025),Actual,"0.00"
YAY,Syndication REV,May (2025),Budget,"0.00"
YAY,Syndication REV,Jun (2025),Actual,"0.50"
YAY,Syndication REV,Jun (2025),Budget,"0.50"
YAY,Syndication REV,Jul (2025),Actual,"0.50"
YAY,Syndication REV,Jul (2025),Budget,"0.50"
YAY,Syndication REV,Aug (2025),Actual,"1.00"
YAY,Syndication REV,Aug (2025),Budget,"1.00"
YAY,Syndication REV,Sep (2025),Actual,"2.00"
YAY,Syndication REV,Sep (2025),Budget,"2.00"
YAY,Syndication REV,Oct (2025),Actual,"1.10"
YAY,Syndication REV,Oct (2025),Budget,"1.00"
YAY,Syndication REV,Nov (2025),Actual,"0.90"
YAY,Syndication REV,Nov (2025),Budget,"1.00"
YAY,Syndication REV,Dec (2025),Actual,"1.10"
YAY,Syndication REV,Dec (2025),Budget,"1.00"
YAY,Syndication REV,Jan (2026),Budget,"1.89"
YAY,Syndication REV,Feb (2026),Budget,"1.00"
YAY,Syndication REV,Mar (2026),Budget,"2.00"
YAY,Linear Marketing,Apr (2025),Actual,"-9.90"
YAY,Linear Marketing,Apr (2025),Budget,"-9.12"
YAY,Linear Marketing,May (2025),Actual,"-29.20"
YAY,Linear Marketing,May (2025),Budget,"-26.77"
YAY,Linear Marketing,Jun (2025),Actual,"-15.00"
YAY,Linear Marketing,Jun (2025),Budget,"-16.58"
YAY,Linear Marketing,Jul (2025),Actual,"-6.80"
YAY,Linear Marketing,Jul (2025),Budget,"-7.47"
YAY,Linear Marketing,Aug (2025),Actual,"-7.40"
YAY,Linear Marketing,Aug (2025),Budget,"-7.01"
YAY,Linear Marketing,Sep (2025),Actual,"-4.70"
YAY,Linear Marketing,Sep (2025),Budget,"-5.20"
YAY,Linear Marketing,Oct (2025),Actual,"-8.60"
YAY,Linear Marketing,Oct (2025),Budget,"-8.84"
YAY,Linear Marketing,Nov (2025),Actual,"-18.90"
YAY,Linear Marketing,Nov (2025),Budget,"-20.67"
YAY,Linear Marketing,Dec (2025),Actual,"-20.40"
YAY,Linear Marketing,Dec (2025),Budget,"-21.11"
YAY,Linear Marketing,Jan (2026),Budget,"-6.78"
YAY,Linear Marketing,Feb (2026),Budget,"-6.79"
YAY,Linear Marketing,Mar (2026),Budget,"-6.10"
YAY,Programming COST,Apr (2025),Actual,"-85.80"
YAY,Programming COST,Apr (2025),Budget,"-82.41"
YAY,Programming COST,May (2025),Actual,"-63.20"
YAY,Programming COST,May (2025),Budget,"-69.93"
YAY,Programming COST,Jun (2025),Actual,"-65.40"
YAY,Programming COST,Jun (2025),Budget,"-67.33"
YAY,Programming COST,Jul (2025),Actual,"-64.50"
YAY,Programming COST,Jul (2025),Budget,"-65.97"
YAY,Programming COST,Aug (2025),Actual,"-64.70"
YAY,Programming COST,Aug (2025),Budget,"-61.70"
YAY,Programming COST,Sep (2025),Actual,"-72.30"
YAY,Programming COST,Sep (2025),Budget,"-70.59"
YAY,Programming COST,Oct (2025),Actual,"-56.60"
YAY,Programming COST,Oct (2025),Budget,"-59.11"
YAY,Programming COST,Nov (2025),Actual,"-54.70"
YAY,Programming COST,Nov (2025),Budget,"-56.53"
YAY,Programming COST,Dec (2025),Actual,"-51.20"
YAY,Programming COST,Dec (2025),Budget,"-56.00"
YAY,Programming COST,Jan (2026),Budget,"-54.98"
YAY,Programming COST,Feb (2026),Budget,"-51.19"
YAY,Programming COST,Mar (2026),Budget,"-52.03"
`
].join('\n');

        }

        else if( this._props.systemPrompt === 'FUTUROOT' ){

          this.system = [
            `You are PerciBOT for Process Mining (Procure-to-Pay).

You are given:
1) A synthetic P2P event log embedded below in TOON format.
2) User questions in natural language.

Your job:
- Answer strictly using ONLY the embedded event log. Do not invent missing data.
- If a question cannot be answered from the data, say exactly what is missing.
- Be business-context-first: explain the metric/insight in plain business language.
- When relevant, show: (a) the exact KPI value, (b) breakdown by vendor / company_code / plant, (c) the top 3 contributing cases, and (d) an actionable recommendation.

Event log semantics:
- Each case_id is one P2P process instance.
- The process order is typically:
  PR -> Approve PR -> PO -> (optional Change PO) -> GR -> IR -> (optional Block Invoice) -> Post Invoice -> Payment.
- Change Purchase Order events represent changes to PO after creation (qty/amount/payment terms/delivery date).
- Block Invoice indicates an invoice hold before posting. Cycle time to post may include time spent blocked.
- Amount and qty represent the state at that event. For Change PO, use amount_old/amount_new and qty_old/qty_new.

Define these KPIs (compute from timestamps):
- PR approval lead time = time(Approve Purchase Requisition) - time(Create Purchase Requisition) per case.
- PO cycle time to GR = time(Goods Receipt) - time(Create Purchase Order) per case (if both exist).
- Invoice receipt to posting = time(Post Invoice) - time(Invoice Receipt) per case.
- Invoice-to-pay time = time(Clear Invoice (Payment)) - time(Post Invoice) per case.
- End-to-end P2P cycle time = time(Clear Invoice (Payment)) - first available of (Create Purchase Requisition OR Create Purchase Order) per case.
- Touchless rate = % cases with NO "Block Invoice" events.
- Block rate = % cases with at least one "Block Invoice" event.
- PO change rate = % cases with at least one "Change Purchase Order" event.
- Most common variants = the distinct activity sequences per case, ranked by frequency.

Rules for answers:
- Always state the time window covered by the dataset (min timestamp to max timestamp).
- If asked “why”, use evidence: reference vendors/plants/company_code/cases and show the pattern (e.g., “blocked cases take longer to post”).
- If asked “show cases”, list case_ids and key timestamps.
- If asked for “top bottlenecks”, identify the stage with the highest median time gap between consecutive standard steps (PR->Approve, PO->GR, IR->Post, Post->Pay).
- Keep results concise: summary first, then supporting numbers.

Embedded Event Log (TOON):
data[70]: {case_id, activity, timestamp, resource, company_code, vendor, po_id, invoice_id, currency, amount, amount_old, amount_new, qty, qty_old, qty_new, qty_uom, payment_terms, plant, doc_type, change_type, change_field}:
P2P-001, Create Purchase Requisition, 2025-12-01T09:10:00, User_A, 1000, VND-Alpha, PO-2001, , INR, 120000, , , 100, , , EA, NET30, Pune, PR, , ,
P2P-001, Approve Purchase Requisition, 2025-12-01T11:30:00, Manager_1, 1000, VND-Alpha, PO-2001, , INR, 120000, , , 100, , , EA, NET30, Pune, PR, , ,
P2P-001, Create Purchase Order, 2025-12-01T12:05:00, Buyer_1, 1000, VND-Alpha, PO-2001, , INR, 120000, , , 100, , , EA, NET30, Pune, PO, , ,
P2P-001, Goods Receipt, 2025-12-05T16:20:00, WH_1, 1000, VND-Alpha, PO-2001, , INR, 120000, , , 100, , , EA, NET30, Pune, GR, , ,
P2P-001, Invoice Receipt, 2025-12-06T10:40:00, AP_1, 1000, VND-Alpha, PO-2001, INV-9101, INR, 120000, , , 100, , , EA, NET30, Pune, IR, , ,
P2P-001, Post Invoice, 2025-12-06T11:12:00, AP_1, 1000, VND-Alpha, PO-2001, INV-9101, INR, 120000, , , 100, , , EA, NET30, Pune, Post, , ,
P2P-001, Clear Invoice (Payment), 2025-12-25T14:30:00, Treasury_1, 1000, VND-Alpha, PO-2001, INV-9101, INR, 120000, , , 100, , , EA, NET30, Pune, Pay, , ,
P2P-002, Create Purchase Requisition, 2025-12-02T10:00:00, User_B, 1000, VND-Beta, PO-2002, , INR, 85000, , , 50, , , EA, NET15, Mumbai, PR, , ,
P2P-002, Approve Purchase Requisition, 2025-12-04T18:40:00, Manager_2, 1000, VND-Beta, PO-2002, , INR, 85000, , , 50, , , EA, NET15, Mumbai, PR, , ,
P2P-002, Create Purchase Order, 2025-12-05T09:20:00, Buyer_2, 1000, VND-Beta, PO-2002, , INR, 85000, , , 50, , , EA, NET15, Mumbai, PO, , ,
P2P-002, Change Purchase Order, 2025-12-05T15:05:00, Buyer_2, 1000, VND-Beta, PO-2002, , INR, 87000, 85000, 87000, 50, 50, 50, EA, NET15, Mumbai, PO, PRICE_UPDATE, amount,
P2P-002, Invoice Receipt, 2025-12-06T12:00:00, AP_2, 1000, VND-Beta, PO-2002, INV-9102, INR, 87000, , , 50, , , EA, NET15, Mumbai, IR, , ,
P2P-002, Block Invoice, 2025-12-06T12:05:00, System, 1000, VND-Beta, PO-2002, INV-9102, INR, 87000, , , 50, , , EA, NET15, Mumbai, Block, , ,
P2P-002, Post Invoice, 2025-12-08T15:15:00, AP_2, 1000, VND-Beta, PO-2002, INV-9102, INR, 87000, , , 50, , , EA, NET15, Mumbai, Post, , ,
P2P-002, Clear Invoice (Payment), 2025-12-20T10:10:00, Treasury_1, 1000, VND-Beta, PO-2002, INV-9102, INR, 87000, , , 50, , , EA, NET15, Mumbai, Pay, , ,
P2P-003, Create Purchase Order, 2025-12-03T09:05:00, Buyer_1, 2000, VND-Gamma, PO-2003, , INR, 50000, , , 25, , , EA, NET30, Pune, PO, URGENT_PO, ,
P2P-003, Invoice Receipt, 2025-12-09T10:00:00, AP_1, 2000, VND-Gamma, PO-2003, INV-9103, INR, 50000, , , 25, , , EA, NET30, Pune, IR, , ,
P2P-003, Block Invoice, 2025-12-09T10:02:00, System, 2000, VND-Gamma, PO-2003, INV-9103, INR, 50000, , , 25, , , EA, NET30, Pune, Block, , ,
P2P-003, Goods Receipt, 2025-12-10T17:00:00, WH_2, 2000, VND-Gamma, PO-2003, , INR, 50000, , , 25, , , EA, NET30, Pune, GR, , ,
P2P-003, Post Invoice, 2025-12-10T17:12:00, AP_1, 2000, VND-Gamma, PO-2003, INV-9103, INR, 50000, , , 25, , , EA, NET30, Pune, Post, , ,
P2P-003, Clear Invoice (Payment), 2026-01-05T11:00:00, Treasury_2, 2000, VND-Gamma, PO-2003, INV-9103, INR, 50000, , , 25, , , EA, NET30, Pune, Pay, , ,
P2P-004, Create Purchase Requisition, 2025-12-04T09:30:00, User_C, 1000, VND-Alpha, PO-2004, , INR, 65000, , , 40, , , EA, NET30, Delhi, PR, , ,
P2P-004, Approve Purchase Requisition, 2025-12-04T10:00:00, Manager_1, 1000, VND-Alpha, PO-2004, , INR, 65000, , , 40, , , EA, NET30, Delhi, PR, , ,
P2P-004, Create Purchase Order, 2025-12-04T10:20:00, Buyer_3, 1000, VND-Alpha, PO-2004, , INR, 65000, , , 40, , , EA, NET30, Delhi, PO, , ,
P2P-004, Change Purchase Order, 2025-12-05T13:30:00, Buyer_3, 1000, VND-Alpha, PO-2004, , INR, 78000, 65000, 78000, 48, 40, 48, EA, NET30, Delhi, PO, QTY_INCREASE, qty,
P2P-004, Goods Receipt, 2025-12-07T15:30:00, WH_3, 1000, VND-Alpha, PO-2004, , INR, 78000, , , 48, , , EA, NET30, Delhi, GR, , ,
P2P-004, Invoice Receipt, 2025-12-08T09:00:00, AP_3, 1000, VND-Alpha, PO-2004, INV-9104, INR, 78000, , , 48, , , EA, NET30, Delhi, IR, , ,
P2P-004, Post Invoice, 2025-12-08T09:20:00, AP_3, 1000, VND-Alpha, PO-2004, INV-9104, INR, 78000, , , 48, , , EA, NET30, Delhi, Post, , ,
P2P-004, Clear Invoice (Payment), 2026-01-10T12:00:00, Treasury_1, 1000, VND-Alpha, PO-2004, INV-9104, INR, 78000, , , 48, , , EA, NET30, Delhi, Pay, , ,
P2P-005, Create Purchase Requisition, 2025-12-05T09:00:00, User_D, 3000, VND-Delta, PO-2005, , INR, 110000, , , 200, , , KG, NET45, Chennai, PR, , ,
P2P-005, Approve Purchase Requisition, 2025-12-05T12:45:00, Manager_3, 3000, VND-Delta, PO-2005, , INR, 110000, , , 200, , , KG, NET45, Chennai, PR, , ,
P2P-005, Create Purchase Order, 2025-12-05T13:10:00, Buyer_4, 3000, VND-Delta, PO-2005, , INR, 110000, , , 200, , , KG, NET45, Chennai, PO, , ,
P2P-005, Change Purchase Order, 2025-12-06T10:00:00, Buyer_4, 3000, VND-Delta, PO-2005, , INR, 99000, 110000, 99000, 180, 200, 180, KG, NET45, Chennai, PO, QTY_DECREASE, qty,
P2P-005, Goods Receipt, 2025-12-12T16:00:00, WH_4, 3000, VND-Delta, PO-2005, , INR, 99000, , , 180, , , KG, NET45, Chennai, GR, , ,
P2P-005, Invoice Receipt, 2025-12-13T11:00:00, AP_4, 3000, VND-Delta, PO-2005, INV-9105, INR, 99000, , , 180, , , KG, NET45, Chennai, IR, , ,
P2P-005, Post Invoice, 2025-12-13T11:30:00, AP_4, 3000, VND-Delta, PO-2005, INV-9105, INR, 99000, , , 180, , , KG, NET45, Chennai, Post, , ,
P2P-005, Clear Invoice (Payment), 2026-01-31T10:15:00, Treasury_3, 3000, VND-Delta, PO-2005, INV-9105, INR, 99000, , , 180, , , KG, NET45, Chennai, Pay, , ,
P2P-006, Create Purchase Requisition, 2025-12-06T09:10:00, User_E, 2000, VND-Epsilon, PO-2006, , INR, 42000, , , 30, , , EA, NET30, Pune, PR, , ,
P2P-006, Approve Purchase Requisition, 2025-12-06T09:40:00, Manager_2, 2000, VND-Epsilon, PO-2006, , INR, 42000, , , 30, , , EA, NET30, Pune, PR, , ,
P2P-006, Create Purchase Order, 2025-12-06T10:00:00, Buyer_2, 2000, VND-Epsilon, PO-2006, , INR, 42000, , , 30, , , EA, NET30, Pune, PO, , ,
P2P-006, Change Purchase Order, 2025-12-07T10:15:00, Buyer_2, 2000, VND-Epsilon, PO-2006, , INR, 42000, 42000, 42000, 30, 30, 30, EA, NET45, Pune, PO, TERMS_UPDATE, payment_terms,
P2P-006, Goods Receipt, 2025-12-14T09:30:00, WH_2, 2000, VND-Epsilon, PO-2006, , INR, 42000, , , 30, , , EA, NET45, Pune, GR, , ,
P2P-006, Invoice Receipt, 2025-12-14T12:00:00, AP_2, 2000, VND-Epsilon, PO-2006, INV-9106, INR, 42000, , , 30, , , EA, NET45, Pune, IR, , ,
P2P-006, Post Invoice, 2025-12-14T12:10:00, AP_2, 2000, VND-Epsilon, PO-2006, INV-9106, INR, 42000, , , 30, , , EA, NET45, Pune, Post, , ,
P2P-006, Clear Invoice (Payment), 2026-01-28T12:00:00, Treasury_2, 2000, VND-Epsilon, PO-2006, INV-9106, INR, 42000, , , 30, , , EA, NET45, Pune, Pay, , ,
P2P-007, Create Purchase Requisition, 2025-12-07T09:00:00, User_F, 1000, VND-Zeta, PO-2007, , INR, 30000, , , 60, , , EA, NET15, Mumbai, PR, , ,
P2P-007, Approve Purchase Requisition, 2025-12-09T19:30:00, Manager_1, 1000, VND-Zeta, PO-2007, , INR, 30000, , , 60, , , EA, NET15, Mumbai, PR, , ,
P2P-007, Create Purchase Order, 2025-12-10T09:15:00, Buyer_1, 1000, VND-Zeta, PO-2007, , INR, 30000, , , 60, , , EA, NET15, Mumbai, PO, , ,
P2P-007, Goods Receipt, 2025-12-18T16:00:00, WH_1, 1000, VND-Zeta, PO-2007, , INR, 30000, , , 60, , , EA, NET15, Mumbai, GR, , ,
P2P-007, Invoice Receipt, 2025-12-19T10:10:00, AP_1, 1000, VND-Zeta, PO-2007, INV-9107, INR, 30000, , , 60, , , EA, NET15, Mumbai, IR, , ,
P2P-007, Post Invoice, 2025-12-19T10:20:00, AP_1, 1000, VND-Zeta, PO-2007, INV-9107, INR, 30000, , , 60, , , EA, NET15, Mumbai, Post, , ,
P2P-007, Clear Invoice (Payment), 2026-01-03T09:00:00, Treasury_1, 1000, VND-Zeta, PO-2007, INV-9107, INR, 30000, , , 60, , , EA, NET15, Mumbai, Pay, , ,
P2P-008, Create Purchase Order, 2025-12-08T10:00:00, Buyer_5, 3000, VND-Theta, PO-2008, , INR, 150000, , , 300, , , KG, NET30, Chennai, PO, , ,
P2P-008, Change Purchase Order, 2025-12-08T18:00:00, Buyer_5, 3000, VND-Theta, PO-2008, , INR, 160000, 150000, 160000, 320, 300, 320, KG, NET30, Chennai, PO, QTY_INCREASE, qty,
P2P-008, Goods Receipt, 2025-12-15T14:00:00, WH_4, 3000, VND-Theta, PO-2008, , INR, 160000, , , 320, , , KG, NET30, Chennai, GR, , ,
P2P-008, Invoice Receipt, 2025-12-16T10:00:00, AP_4, 3000, VND-Theta, PO-2008, INV-9108, INR, 160000, , , 320, , , KG, NET30, Chennai, IR, , ,
P2P-008, Block Invoice, 2025-12-16T10:05:00, System, 3000, VND-Theta, PO-2008, INV-9108, INR, 160000, , , 320, , , KG, NET30, Chennai, Block, , ,
P2P-008, Post Invoice, 2025-12-18T12:00:00, AP_4, 3000, VND-Theta, PO-2008, INV-9108, INR, 160000, , , 320, , , KG, NET30, Chennai, Post, , ,
P2P-008, Clear Invoice (Payment), 2026-01-20T10:00:00, Treasury_3, 3000, VND-Theta, PO-2008, INV-9108, INR, 160000, , , 320, , , KG, NET30, Chennai, Pay, , ,
P2P-009, Create Purchase Requisition, 2025-12-09T09:15:00, User_G, 2000, VND-Iota, PO-2009, , INR, 95000, , , 70, , , EA, NET30, Pune, PR, , ,
P2P-009, Approve Purchase Requisition, 2025-12-09T11:45:00, Manager_2, 2000, VND-Iota, PO-2009, , INR, 95000, , , 70, , , EA, NET30, Pune, PR, , ,
P2P-009, Create Purchase Order, 2025-12-09T12:10:00, Buyer_2, 2000, VND-Iota, PO-2009, , INR, 95000, , , 70, , , EA, NET30, Pune, PO, , ,
P2P-009, Change Purchase Order, 2025-12-10T09:00:00, Buyer_2, 2000, VND-Iota, PO-2009, , INR, 95000, 95000, 95000, 70, 70, 70, EA, NET30, Pune, PO, DELIVERY_DATE_UPDATE, delivery_date,
P2P-009, Goods Receipt, 2025-12-16T17:00:00, WH_2, 2000, VND-Iota, PO-2009, , INR, 95000, , , 70, , , EA, NET30, Pune, GR, , ,
P2P-009, Invoice Receipt, 2025-12-17T10:00:00, AP_2, 2000, VND-Iota, PO-2009, INV-9109, INR, 95000, , , 70, , , EA, NET30, Pune, IR, , ,
P2P-009, Post Invoice, 2025-12-17T10:15:00, AP_2, 2000, VND-Iota, PO-2009, INV-9109, INR, 95000, , , 70, , , EA, NET30, Pune, Post, , ,
P2P-009, Clear Invoice (Payment), 2026-01-16T12:00:00, Treasury_2, 2000, VND-Iota, PO-2009, INV-9109, INR, 95000, , , 70, , , EA, NET30, Pune, Pay, , ,
P2P-010, Create Purchase Requisition, 2025-12-10T09:00:00, User_H, 1000, VND-Kappa, PO-2010, , INR, 72000, , , 90, , , EA, NET30, Delhi, PR, , ,
P2P-010, Approve Purchase Requisition, 2025-12-10T17:40:00, Manager_1, 1000, VND-Kappa, PO-2010, , INR, 72000, , , 90, , , EA, NET30, Delhi, PR, , ,
P2P-010, Create Purchase Order, 2025-12-11T10:00:00, Buyer_3, 1000, VND-Kappa, PO-2010, , INR, 72000, , , 90, , , EA, NET30, Delhi, PO, , ,
P2P-010, Change Purchase Order, 2025-12-11T16:20:00, Buyer_3, 1000, VND-Kappa, PO-2010, , INR, 80000, 72000, 80000, 100, 90, 100, EA, NET30, Delhi, PO, QTY_INCREASE, qty,
P2P-010, Goods Receipt, 2025-12-20T15:00:00, WH_3, 1000, VND-Kappa, PO-2010, , INR, 80000, , , 100, , , EA, NET30, Delhi, GR, , ,
P2P-010, Invoice Receipt, 2025-12-21T10:00:00, AP_3, 1000, VND-Kappa, PO-2010, INV-9110, INR, 80000, , , 100, , , EA, NET30, Delhi, IR, , ,
P2P-010, Post Invoice, 2025-12-21T10:10:00, AP_3, 1000, VND-Kappa, PO-2010, INV-9110, INR, 80000, , , 100, , , EA, NET30, Delhi, Post, , ,
P2P-010, Clear Invoice (Payment), 2026-01-20T12:30:00, Treasury_1, 1000, VND-Kappa, PO-2010, INV-9110, INR, 80000, , , 100, , , EA, NET30, Delhi, Pay, , ,

`
          ].join('\n');
        }

        else{


         this.system = [
          // this._props.systemPrompt ||
          //   'You are PerciBOT, a helpful and concise assistant for SAP Analytics Cloud.',
          // '',
          // dsContext,
          // '',
          // 'When responding, Keep it concise and executive-friendly.'
          


          `
You are **PerciBOT**, a conversational AI for analytics.

Your role is to answer user queries about financial performance across Companies, Branches, Products, and Accounts (Revenue, Opex, Interest Expense).
All figures are in INR, aggregated for Jan–Apr 2025.

Use this dataset summary as your ground truth. Provide clear, business-analyst style answers with tables or breakdowns when useful.

Companies:
- IKF Finance Ltd → Revenue: 4,178,132.07, Opex: 3,183,336.85, Interest Expense: 5,010,185.45
- IKF House Finance Ltd → Revenue: 4,178,132.07, Opex: 3,183,336.85, Interest Expense: 5,010,185.45

Branches:
- Amar Chambers → Revenue: 1,441,039.88, Opex: 878,538.58, Interest Expense: 1,343,608.88
- Apra Tower → Revenue: 1,080,626.42, Opex: 898,949.30, Interest Expense: 1,076,335.00
- Borivali → Revenue: 988,853.88, Opex: 936,281.90, Interest Expense: 1,379,355.52
- Broadway Business Centre → Revenue: 1,194,118.34, Opex: 1,155,437.00, Interest Expense: 1,376,638.86
- Dosti Pinacle → Revenue: 945,528.48, Opex: 998,130.38, Interest Expense: 1,888,149.90
- Part II Gurugram → Revenue: 883,096.80, Opex: 809,298.44, Interest Expense: 1,324,802.60
- Pusa Road → Revenue: 1,823,000.34, Opex: 690,038.10, Interest Expense: 1,631,480.14

Products:
- Cars & MUV Loans → Revenue: 1,731,314.20, Opex: 3,940,045.52, Interest Expense: 5,856,240.84
- Commercial Vehicle Loans → Revenue: 2,060,208.94, Opex: -3,216,340.58, Interest Expense: -4,835,485.26
- Construction Equipment Loans → Revenue: 2,764,835.70, Opex: 9,039,834.06, Interest Expense: 13,885,900.40
- Home Loans → Revenue: 947,721.66, Opex: -2,036,823.34, Interest Expense: -2,992,687.48
- MSME Loans → Revenue: 852,183.64, Opex: -1,360,041.96, Interest Expense: -1,893,597.60

Branch × Product:
- Amar Chambers × Cars & MUV Loans → Revenue: 24,150.46, Opex: 645,579.34, Interest Expense: 920,755.74
- Amar Chambers × Commercial Vehicle Loans → Revenue: 468,571.72, Opex: -472,048.02, Interest Expense: -761,812.40
- Amar Chambers × Construction Equipment Loans → Revenue: 637,315.18, Opex: 1,173,960.84, Interest Expense: 1,980,768.68
- Amar Chambers × Home Loans → Revenue: 251,661.72, Opex: -297,792.86, Interest Expense: -525,119.46
- Amar Chambers × MSME Loans → Revenue: 59,340.80, Opex: -171,160.72, Interest Expense: -270,983.68
- Apra Tower × Cars & MUV Loans → Revenue: 79,456.72, Opex: 594,146.06, Interest Expense: 758,427.04
- Apra Tower × Commercial Vehicle Loans → Revenue: 506,309.20, Opex: -554,853.16, Interest Expense: -692,147.38
- Apra Tower × Construction Equipment Loans → Revenue: 197,115.92, Opex: 1,349,913.32, Interest Expense: 1,742,450.08
- Apra Tower × Home Loans → Revenue: 158,539.00, Opex: -300,252.44, Interest Expense: -441,784.08
- Apra Tower × MSME Loans → Revenue: 139,205.58, Opex: -190,004.48, Interest Expense: -290,610.66
- Borivali × Cars & MUV Loans → Revenue: 498,004.64, Opex: 502,471.44, Interest Expense: 822,200.18
- Borivali × Commercial Vehicle Loans → Revenue: 170,514.82, Opex: -391,055.20, Interest Expense: -689,009.04
- Borivali × Construction Equipment Loans → Revenue: 34,511.84, Opex: 1,372,489.84, Interest Expense: 1,850,767.64
- Borivali × Home Loans → Revenue: 104,230.22, Opex: -318,845.86, Interest Expense: -343,216.30
- Borivali × MSME Loans → Revenue: 181,592.36, Opex: -228,778.32, Interest Expense: -261,386.96
- Broadway Business Centre × Cars & MUV Loans → Revenue: 46,930.10, Opex: 638,044.48, Interest Expense: 813,013.58
- Broadway Business Centre × Commercial Vehicle Loans → Revenue: 296,488.44, Opex: -517,156.12, Interest Expense: -673,445.38
- Broadway Business Centre × Construction Equipment Loans → Revenue: 720,956.08, Opex: 1,451,712.70, Interest Expense: 1,933,980.36
- Broadway Business Centre × Home Loans → Revenue: 49,306.12, Opex: -274,182.12, Interest Expense: -399,004.50
- Broadway Business Centre × MSME Loans → Revenue: 80,437.60, Opex: -142,981.94, Interest Expense: -297,905.20
- Dosti Pinacle × Cars & MUV Loans → Revenue: 212,562.38, Opex: 548,269.22, Interest Expense: 900,908.86
- Dosti Pinacle × Commercial Vehicle Loans → Revenue: 199,143.64, Opex: -420,283.32, Interest Expense: -629,481.18
- Dosti Pinacle × Construction Equipment Loans → Revenue: 128,304.20, Opex: 1,370,412.80, Interest Expense: 2,290,529.20
- Dosti Pinacle × Home Loans → Revenue: 200,492.42, Opex: -294,332.92, Interest Expense: -409,800.78
- Dosti Pinacle × MSME Loans → Revenue: 205,025.84, Opex: -205,935.40, Interest Expense: -264,006.20
- Part II Gurugram × Cars & MUV Loans → Revenue: 393,176.60, Opex: 519,246.88, Interest Expense: 861,983.62
- Part II Gurugram × Commercial Vehicle Loans → Revenue: 346,465.50, Opex: -485,738.84, Interest Expense: -730,764.00
- Part II Gurugram × Construction Equipment Loans → Revenue: -112,718.64, Opex: 1,285,467.42, Interest Expense: 1,924,433.42
- Part II Gurugram × Home Loans → Revenue: 105,595.58, Opex: -270,528.28, Interest Expense: -468,056.24
- Part II Gurugram × MSME Loans → Revenue: 150,577.76, Opex: -239,148.74, Interest Expense: -262,794.20
- Pusa Road × Cars & MUV Loans → Revenue: 477,033.30, Opex: 492,288.10, Interest Expense: 778,951.82
- Pusa Road × Commercial Vehicle Loans → Revenue: 72,715.62, Opex: -375,205.92, Interest Expense: -658,825.88
- Pusa Road × Construction Equipment Loans → Revenue: 1,159,351.12, Opex: 1,035,877.14, Interest Expense: 2,162,971.02
- Pusa Road × Home Loans → Revenue: 77,896.60, Opex: -280,888.86, Interest Expense: -405,706.12
- Pusa Road × MSME Loans → Revenue: 36,003.70, Opex: -182,032.36, Interest Expense: -245,910.70

When responding, Keep it concise and executive-friendly.
`

        ].join('\n')

      }

        
        console.log(this.system)

        // return;

        const body = {
          model: this._props.model || 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: this.system },
            { role: 'user', content: q }
          ],
          temperature: 0.2
        }
        console.log('openAI prompt', JSON.stringify(body))
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this._props.apiKey}`
          },
          body: JSON.stringify(body)
        })

        if (!res.ok) {
          const txt = await res.text()
          throw new Error(`${res.status} ${res.statusText}: ${txt}`)
        }

        const data = await res.json()
        const ans = data.choices?.[0]?.message?.content || '(No content)'
        this._stopTyping()
        this._append('bot', ans)
      } catch (e) {
        this._stopTyping()
        this._append('bot', ` ${e.message}`)
      } finally {
        this.$send.disabled = false
      }
    }
  }

  if (!customElements.get('perci-bot')) {
    customElements.define('perci-bot', PerciBot)
  }
})()
