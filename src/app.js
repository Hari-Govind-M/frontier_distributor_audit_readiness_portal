
(function () {
  const DATA = window.PORTAL_DATA;
  const STORAGE_KEY = "frontierDistributorAuditReadinessPortal.v1";

  const STATUS = [
    { value: "not_started", label: "Not started", rank: 0 },
    { value: "gap", label: "Gap identified", rank: 1 },
    { value: "evidence_tracked", label: "Evidence tracked", rank: 2 },
    { value: "demo_ready", label: "Demo ready", rank: 3 },
    { value: "mock_passed", label: "Mock passed", rank: 4 }
  ];

  const EVIDENCE_STATUS = [
    { value: "missing", label: "Missing" },
    { value: "draft", label: "Draft" },
    { value: "ready", label: "Ready" },
    { value: "not_applicable", label: "Not applicable" }
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function defaultProgress() {
    const progress = {};
    DATA.controls.forEach(c => {
      progress[c.id] = {
        status: "not_started",
        evidenceStatus: "missing",
        evidenceName: "",
        location: "",
        owner: "",
        sme: "",
        demoDate: "",
        notes: ""
      };
    });
    return progress;
  }

  function defaultMetrics() {
    const metrics = {};
    DATA.metrics.forEach(m => metrics[m.id] = "");
    return metrics;
  }

  function defaultState() {
    return {
      profile: {
        distributorName: "",
        primaryRegion: "",
        regionCount: 1,
        regions: ["Primary region"],
        deliveryModel: "internal",
        supportDesignation: false,
        azureExpertMSP: false,
        azureSpecialization: false,
        azureTechnicalSpecialization: false,
        aiWorkforceSpecialization: false,
        businessProcessSpecialization: false,
        securitySpecializations2: false,
        sureStep: false,
        sureStepAmbassadors: false,
        module2Scenario: "none",
        regionalAssessmentUnits: 0
      },
      metrics: defaultMetrics(),
      progress: defaultProgress(),
      regional: {},
      filters: {
        module: "all",
        section: "all",
        status: "all",
        search: ""
      },
      mock: {
        filter: "all",
        currentQuestionId: null
      },
      lastSaved: ""
    };
  }

  let state = loadState();

  function normalizeState(s) {
    const d = defaultState();
    s = s || d;
    s.profile = { ...d.profile, ...(s.profile || {}) };
    s.metrics = { ...d.metrics, ...(s.metrics || {}) };
    s.progress = { ...d.progress, ...(s.progress || {}) };
    DATA.controls.forEach(c => {
      s.progress[c.id] = { ...d.progress[c.id], ...(s.progress[c.id] || {}) };
    });
    s.regional = s.regional || {};
    s.filters = { ...d.filters, ...(s.filters || {}) };
    s.mock = { ...d.mock, ...(s.mock || {}) };
    return s;
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return normalizeState(saved ? JSON.parse(saved) : defaultState());
    } catch (e) {
      console.warn("Could not load saved state", e);
      return defaultState();
    }
  }

  function saveState() {
    state.lastSaved = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const el = $("#lastSaved");
    if (el) el.textContent = "Saved " + new Date(state.lastSaved).toLocaleString();
  }

  function statusRank(value) {
    return (STATUS.find(s => s.value === value) || STATUS[0]).rank;
  }

  function isControlWaived(control) {
    const p = state.profile;
    switch (control.waiver) {
      case "supportDesignation":
        return Boolean(p.supportDesignation);
      case "sureStepAmbassadors":
        return Boolean(p.sureStepAmbassadors);
      case "azureFoundationWaiver":
        return Boolean(p.azureExpertMSP || p.azureSpecialization);
      case "aiWorkforceWaiver":
        return Boolean(p.aiWorkforceSpecialization);
      case "businessProcessWaiver":
        return Boolean(p.businessProcessSpecialization);
      case "securityWaiver":
        return Boolean(p.securitySpecializations2);
      case "azureTechnicalWaiver":
        return Boolean(p.azureTechnicalSpecialization);
      default:
        return false;
    }
  }

  function isRegionalControlWaived(controlId) {
    return state.profile.sureStep && controlId === "3.1.2";
  }

  function progressFor(controlId) {
    return state.progress[controlId] || defaultProgress()[controlId];
  }

  function controlRequiresDemo(control) {
    return control.evidence.some(e => /live demonstration|live demo|demo/i.test(e));
  }

  function isReady(control) {
    if (isControlWaived(control)) return true;
    return statusRank(progressFor(control.id).status) >= 2;
  }

  function isDemoReady(control) {
    if (isControlWaived(control)) return true;
    if (!controlRequiresDemo(control)) return statusRank(progressFor(control.id).status) >= 2;
    return statusRank(progressFor(control.id).status) >= 3;
  }

  function isMockPassed(control) {
    if (isControlWaived(control)) return true;
    return statusRank(progressFor(control.id).status) >= 4;
  }

  function hasEvidenceMetadata(control) {
    if (isControlWaived(control)) return true;
    const p = progressFor(control.id);
    const metadata = Boolean(p.evidenceName.trim() && p.owner.trim());
    const evidenceOk = p.evidenceStatus === "ready" || p.evidenceStatus === "not_applicable";
    return metadata && evidenceOk;
  }

  function adjustedThreshold(metric) {
    const regions = Math.max(1, Number(state.profile.regionCount) || 1);
    return metric.threshold * (metric.multiplyByRegions ? regions : 1);
  }

  function metricValue(metric) {
    const raw = state.metrics[metric.id];
    if (raw === "" || raw === null || raw === undefined) return null;
    const n = Number(String(raw).replace(/[,$%]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function metricResult(metric) {
    const val = metricValue(metric);
    const thr = adjustedThreshold(metric);
    return {
      value: val,
      threshold: thr,
      pass: val !== null && val >= thr
    };
  }

  function computeSummary() {
    const mResults = DATA.metrics.map(m => ({ metric: m, ...metricResult(m) }));
    const passedMetrics = mResults.filter(r => r.pass).length;
    const requiredTotal = mResults.filter(r => r.metric.required).length;
    const requiredPassed = mResults.filter(r => r.metric.required && r.pass).length;
    const quantitativePass = passedMetrics >= 33 && requiredPassed === requiredTotal;

    const controls = DATA.controls;
    const m1Mandatory = controls.filter(c => c.module === "Module 1" && c.type === "Mandatory" && !isControlWaived(c));
    const m1Aspirational = controls.filter(c => c.module === "Module 1" && c.type === "Aspirational" && !isControlWaived(c));
    const m2Mandatory = controls.filter(c => c.module === "Module 2" && c.type === "Mandatory" && !isControlWaived(c));

    const m1MandatoryReady = m1Mandatory.filter(isReady).length;
    const m1MandatoryDemo = m1Mandatory.filter(isDemoReady).length;
    const m1MandatoryMock = m1Mandatory.filter(isMockPassed).length;
    const m1AspirationalReady = m1Aspirational.filter(isReady).length;
    const m1AspirationalMock = m1Aspirational.filter(isMockPassed).length;
    const m2Ready = m2Mandatory.filter(isReady).length;
    const m2Demo = m2Mandatory.filter(isDemoReady).length;
    const m2Mock = m2Mandatory.filter(isMockPassed).length;

    const requiredControls = controls.filter(c => !isControlWaived(c) && (c.type === "Mandatory" || (c.type === "Aspirational" && isReady(c))));
    const evidenceComplete = requiredControls.filter(hasEvidenceMetadata).length;
    const evidenceCompleteRequired = requiredControls.length;

    const regional = computeRegionalSummary();

    const mandatoryReady = m1MandatoryReady === m1Mandatory.length && m2Ready === m2Mandatory.length;
    const mandatoryDemoReady = m1MandatoryDemo === m1Mandatory.length && m2Demo === m2Mandatory.length;
    const mandatoryMock = m1MandatoryMock === m1Mandatory.length && m2Mock === m2Mandatory.length;
    const aspirationalReady = m1AspirationalReady >= 3;
    const aspirationalMock = m1AspirationalMock >= 3;
    const evidenceOk = evidenceComplete === evidenceCompleteRequired;
    const regionalReady = regional.total === 0 || regional.ready === regional.total;
    const regionalMock = regional.total === 0 || regional.mock === regional.total;

    let readiness = "Not Ready";
    let readinessClass = "bad";
    if (quantitativePass && mandatoryReady && aspirationalReady) {
      readiness = "Conditionally Ready";
      readinessClass = "warn";
      if (evidenceOk && mandatoryDemoReady && regionalReady) {
        readiness = "Ready for Mock Audit";
        readinessClass = "info";
      }
      if (evidenceOk && mandatoryMock && aspirationalMock && regionalMock) {
        readiness = "Ready for ISSI Audit";
        readinessClass = "good";
      }
    }

    return {
      mResults,
      passedMetrics,
      requiredTotal,
      requiredPassed,
      quantitativePass,
      m1MandatoryTotal: m1Mandatory.length,
      m1MandatoryReady,
      m1MandatoryDemo,
      m1MandatoryMock,
      m1AspirationalTotal: m1Aspirational.length,
      m1AspirationalReady,
      m1AspirationalMock,
      m2MandatoryTotal: m2Mandatory.length,
      m2Ready,
      m2Demo,
      m2Mock,
      evidenceComplete,
      evidenceCompleteRequired,
      evidenceOk,
      mandatoryReady,
      mandatoryDemoReady,
      mandatoryMock,
      aspirationalReady,
      aspirationalMock,
      regional,
      regionalReady,
      regionalMock,
      readiness,
      readinessClass
    };
  }

  function getRegions() {
    const count = Math.max(1, Number(state.profile.regionCount) || 1);
    let regions = state.profile.regions || [];
    while (regions.length < count) regions.push(`Region ${regions.length + 1}`);
    if (regions.length > count) regions = regions.slice(0, count);
    state.profile.regions = regions;
    return regions;
  }

  function computeRegionalSummary() {
    const regions = getRegions();
    if (regions.length <= 1) return { total: 0, ready: 0, mock: 0, rows: [] };
    const additional = regions.slice(1);
    const rows = [];
    additional.forEach((regionName, regionIndex) => {
      DATA.regionalControlIds.forEach(controlId => {
        const waived = isRegionalControlWaived(controlId);
        const key = `${regionIndex + 1}:${controlId}`;
        const r = state.regional[key] || { status: "not_started", owner: "", evidenceName: "", location: "", notes: "" };
        const rank = waived ? 4 : statusRank(r.status);
        rows.push({ regionIndex: regionIndex + 1, regionName, controlId, waived, progress: r, ready: rank >= 2, mock: rank >= 4 });
      });
    });
    return {
      total: rows.filter(r => !r.waived).length,
      ready: rows.filter(r => !r.waived && r.ready).length,
      mock: rows.filter(r => !r.waived && r.mock).length,
      rows
    };
  }

  function pct(n, d) {
    if (!d) return 100;
    return Math.round((n / d) * 100);
  }

  function money(n) {
    return "$" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function valueDisplay(metric, value) {
    if (value === null) return "Not entered";
    if (metric.kind === "currency") return money(value);
    if (metric.kind === "percent") return value + "%";
    return String(value);
  }

  function thresholdDisplay(metric, value) {
    if (metric.kind === "currency") return money(value);
    if (metric.kind === "percent") return value + "%";
    return String(Number(value.toFixed ? value.toFixed(2) : value));
  }

  function render() {
    renderProfile();
    renderDashboard();
    renderMetrics();
    renderChecklist();
    renderRegional();
    renderMock();
    renderTemplates();
    renderGapReport();
    renderFees();
    saveState();
  }

  function renderProfile() {
    const regions = getRegions();
    $("#profilePanel").innerHTML = `
      <div class="panel-grid two">
        <div class="card">
          <h3>Distributor profile</h3>
          <div class="form-grid">
            ${input("distributorName", "Distributor name", state.profile.distributorName, "text", "Example: Contoso Distribution")}
            ${input("primaryRegion", "Primary CSP region", state.profile.primaryRegion, "text", "Example: Philippines")}
            ${input("regionCount", "Number of CSP authorized regions", state.profile.regionCount, "number", "", 1)}
            <label class="field">
              <span>Delivery model</span>
              <select data-profile="deliveryModel">
                <option value="internal" ${state.profile.deliveryModel === "internal" ? "selected" : ""}>Internal delivery model</option>
                <option value="channel" ${state.profile.deliveryModel === "channel" ? "selected" : ""}>Channel-based delivery model</option>
                <option value="hybrid" ${state.profile.deliveryModel === "hybrid" ? "selected" : ""}>Hybrid delivery model</option>
              </select>
            </label>
          </div>
          <div class="region-editor">
            <h4>Region names</h4>
            <div class="region-grid">
              ${regions.map((r, i) => `
                <label class="field">
                  <span>${i === 0 ? "Primary region" : "Additional region " + (i + 1)}</span>
                  <input data-region-name="${i}" value="${escapeHtml(r)}" placeholder="Region ${i + 1}">
                </label>
              `).join("")}
            </div>
          </div>
        </div>
        <div class="card">
          <h3>Waivers and designations</h3>
          <p class="muted">Turn on only when the distributor can prove the active designation, specialization, or SureStep condition.</p>
          <div class="check-grid">
            ${checkbox("supportDesignation", "Support Services Designation active", state.profile.supportDesignation)}
            ${checkbox("azureExpertMSP", "Azure Expert MSP active", state.profile.azureExpertMSP)}
            ${checkbox("azureSpecialization", "Azure specialization for Cloud Foundation waiver", state.profile.azureSpecialization)}
            ${checkbox("azureTechnicalSpecialization", "Azure specialization aligned to Technical Proficiency workload", state.profile.azureTechnicalSpecialization)}
            ${checkbox("aiWorkforceSpecialization", "AI Workforce specialization active", state.profile.aiWorkforceSpecialization)}
            ${checkbox("businessProcessSpecialization", "AI Business Process or Business Applications specialization active", state.profile.businessProcessSpecialization)}
            ${checkbox("securitySpecializations2", "Two Security specializations active", state.profile.securitySpecializations2)}
            ${checkbox("sureStep", "SureStep enrolled for regional 3.1.2 waiver", state.profile.sureStep)}
            ${checkbox("sureStepAmbassadors", "Five or more certified SureStep Ambassadors for 3.5.2 waiver", state.profile.sureStepAmbassadors)}
          </div>
        </div>
      </div>
    `;
  }

  function input(key, label, value, type = "text", placeholder = "", min = "") {
    return `
      <label class="field">
        <span>${escapeHtml(label)}</span>
        <input type="${type}" ${min !== "" ? `min="${min}"` : ""} data-profile="${key}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">
      </label>
    `;
  }

  function checkbox(key, label, checked) {
    return `
      <label class="check">
        <input type="checkbox" data-profile="${key}" ${checked ? "checked" : ""}>
        <span>${escapeHtml(label)}</span>
      </label>
    `;
  }

  function renderDashboard() {
    const s = computeSummary();
    const gapItems = getGapItems(s).slice(0, 8);
    $("#dashboardPanel").innerHTML = `
      <div class="hero-card ${s.readinessClass}">
        <div>
          <p class="eyebrow">Overall readiness</p>
          <h2>${escapeHtml(s.readiness)}</h2>
          <p>${readinessMessage(s)}</p>
        </div>
        <div class="score-ring" style="--p:${overallPercent(s)}">
          <span>${overallPercent(s)}%</span>
        </div>
      </div>

      <div class="kpi-grid">
        ${kpi("Quantitative score", `${s.passedMetrics}/37`, "Need at least 33 metrics", pct(s.passedMetrics, 37), s.quantitativePass ? "good" : "bad")}
        ${kpi("Required metrics", `${s.requiredPassed}/${s.requiredTotal}`, "All six required metrics must pass", pct(s.requiredPassed, s.requiredTotal), s.requiredPassed === s.requiredTotal ? "good" : "bad")}
        ${kpi("Module 1 mandatory", `${s.m1MandatoryReady}/${s.m1MandatoryTotal}`, "All non-waived mandatory controls", pct(s.m1MandatoryReady, s.m1MandatoryTotal), s.m1MandatoryReady === s.m1MandatoryTotal ? "good" : "bad")}
        ${kpi("Module 1 aspirational", `${s.m1AspirationalReady}/3`, `Available: ${s.m1AspirationalTotal}`, Math.min(100, pct(s.m1AspirationalReady, 3)), s.m1AspirationalReady >= 3 ? "good" : "warn")}
        ${kpi("Module 2 mandatory", `${s.m2Ready}/${s.m2MandatoryTotal}`, "All non-waived controls", pct(s.m2Ready, s.m2MandatoryTotal), s.m2Ready === s.m2MandatoryTotal ? "good" : "bad")}
        ${kpi("Evidence metadata", `${s.evidenceComplete}/${s.evidenceCompleteRequired}`, "Owner, evidence name, status ready", pct(s.evidenceComplete, s.evidenceCompleteRequired), s.evidenceOk ? "good" : "warn")}
        ${kpi("Regional controls", `${s.regional.ready}/${s.regional.total}`, "Additional CSP regions only", pct(s.regional.ready, s.regional.total), s.regionalReady ? "good" : "warn")}
        ${kpi("Mock audit pass", `${s.m1MandatoryMock + s.m2Mock}/${s.m1MandatoryTotal + s.m2MandatoryTotal}`, "Mandatory controls", pct(s.m1MandatoryMock + s.m2Mock, s.m1MandatoryTotal + s.m2MandatoryTotal), s.mandatoryMock ? "good" : "warn")}
      </div>

      <div class="panel-grid two">
        <div class="card">
          <h3>Assessment journey</h3>
          <div class="timeline">
            ${DATA.offerGuide.journey.map(j => `<div class="timeline-row"><b>${j.step}</b><div><strong>${escapeHtml(j.title)}</strong><p>${escapeHtml(j.detail)}</p></div></div>`).join("")}
          </div>
        </div>
        <div class="card">
          <h3>Next gaps to close</h3>
          ${gapItems.length ? `<ol class="gap-list">${gapItems.map(g => `<li><strong>${escapeHtml(g.title)}</strong><span>${escapeHtml(g.detail)}</span></li>`).join("")}</ol>` : `<p class="success-note">No critical gaps detected. Keep the evidence current and complete a final mock audit.</p>`}
        </div>
      </div>
    `;
  }

  function readinessMessage(s) {
    if (!s.quantitativePass) return "Telemetry still blocks audit readiness. Fix the quantitative score before scheduling the assessment.";
    if (!s.mandatoryReady) return "Some mandatory controls are not yet evidence tracked.";
    if (!s.aspirationalReady) return "Module 1 also needs at least three aspirational control points ready.";
    if (!s.evidenceOk) return "Controls are tracked, but evidence owner, evidence name, or ready status is missing.";
    if (!s.regionalReady) return "Regional capability controls still need evidence for additional CSP regions.";
    if (!s.mandatoryMock || !s.aspirationalMock || !s.regionalMock) return "Evidence is ready. Run a mock audit and mark passed only after the presenter can answer and demo confidently.";
    return "All gates are green. Keep source evidence current and confirm final scope with ISSI and Microsoft.";
  }

  function overallPercent(s) {
    const weights = [
      pct(s.passedMetrics, 33),
      pct(s.requiredPassed, s.requiredTotal),
      pct(s.m1MandatoryReady, s.m1MandatoryTotal),
      Math.min(100, pct(s.m1AspirationalReady, 3)),
      pct(s.m2Ready, s.m2MandatoryTotal),
      pct(s.evidenceComplete, s.evidenceCompleteRequired),
      pct(s.regional.ready, s.regional.total),
      pct(s.m1MandatoryMock + s.m2Mock, s.m1MandatoryTotal + s.m2MandatoryTotal)
    ].filter(n => Number.isFinite(n));
    return Math.round(weights.reduce((a, b) => a + b, 0) / weights.length);
  }

  function kpi(title, value, hint, percent, tone) {
    return `
      <div class="kpi ${tone}">
        <div><span>${escapeHtml(title)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></div>
        <div class="bar"><i style="width:${Math.max(0, Math.min(100, percent))}%"></i></div>
      </div>
    `;
  }

  function renderMetrics() {
    const s = computeSummary();
    const groups = groupBy(DATA.metrics, "area");
    $("#metricsPanel").innerHTML = `
      <div class="section-head">
        <div>
          <h2>Quantitative distributor capability score</h2>
          <p>Enter current values. Reach, GCA reach, and distributor active certifications are multiplied by the number of CSP authorized regions.</p>
        </div>
        <div class="status-pill ${s.quantitativePass ? "good" : "bad"}">${s.quantitativePass ? "Telemetry ready" : "Telemetry gap"}</div>
      </div>
      <div class="metrics-summary">
        <div><strong>${s.passedMetrics}/37</strong><span>metrics passed</span></div>
        <div><strong>${s.requiredPassed}/${s.requiredTotal}</strong><span>required metrics passed</span></div>
        <div><strong>${Math.max(1, Number(state.profile.regionCount) || 1)}</strong><span>CSP regions used for region multipliers</span></div>
      </div>
      ${Object.entries(groups).map(([area, rows]) => `
        <div class="card table-card">
          <h3>${escapeHtml(area)}</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Current value</th>
                <th>Threshold</th>
                <th>Rule</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(m => {
                const r = metricResult(m);
                return `<tr>
                  <td><strong>${escapeHtml(m.name)}</strong>${m.required ? `<span class="required">Required</span>` : ""}</td>
                  <td><input class="metric-input" data-metric="${m.id}" value="${escapeHtml(state.metrics[m.id])}" placeholder="${m.kind === "percent" ? "Enter %" : m.kind === "currency" ? "Enter USD" : "Enter number"}"></td>
                  <td>${thresholdDisplay(m, r.threshold)}</td>
                  <td>${escapeHtml(m.note)}</td>
                  <td><span class="status-pill ${r.pass ? "good" : "bad"}">${r.pass ? "Pass" : r.value === null ? "Missing" : "Gap"}</span></td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      `).join("")}
    `;
  }

  function renderChecklist() {
    const sections = Array.from(new Set(DATA.controls.map(c => c.section)));
    const modules = Array.from(new Set(DATA.controls.map(c => c.module)));
    const f = state.filters;

    let filtered = DATA.controls.filter(c => {
      if (f.module !== "all" && c.module !== f.module) return false;
      if (f.section !== "all" && c.section !== f.section) return false;
      if (f.status !== "all") {
        const waived = isControlWaived(c);
        const p = progressFor(c.id);
        if (f.status === "waived" && !waived) return false;
        if (f.status !== "waived" && (waived || p.status !== f.status)) return false;
      }
      const q = (f.search || "").toLowerCase().trim();
      if (q) {
        const hay = [c.id, c.title, c.section, c.description, ...(c.evidence || [])].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    $("#checklistPanel").innerHTML = `
      <div class="section-head">
        <div>
          <h2>Qualitative audit checklist</h2>
          <p>Track evidence names, owners, SME coverage, demo readiness, and mock audit status. No evidence files are uploaded or stored.</p>
        </div>
        <button class="secondary" id="expandAllControls">Expand all</button>
      </div>
      <div class="filters">
        <label>Module
          <select data-filter="module">
            <option value="all">All modules</option>
            ${modules.map(m => `<option value="${escapeHtml(m)}" ${f.module === m ? "selected" : ""}>${escapeHtml(m)}</option>`).join("")}
          </select>
        </label>
        <label>Section
          <select data-filter="section">
            <option value="all">All sections</option>
            ${sections.map(s => `<option value="${escapeHtml(s)}" ${f.section === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
          </select>
        </label>
        <label>Status
          <select data-filter="status">
            <option value="all">All statuses</option>
            <option value="waived" ${f.status === "waived" ? "selected" : ""}>Waived</option>
            ${STATUS.map(s => `<option value="${s.value}" ${f.status === s.value ? "selected" : ""}>${s.label}</option>`).join("")}
          </select>
        </label>
        <label class="search">Search
          <input data-filter="search" value="${escapeHtml(f.search)}" placeholder="Search control, evidence, keyword">
        </label>
      </div>
      <div class="control-count">${filtered.length} controls shown</div>
      <div class="controls-list">
        ${filtered.map(renderControlCard).join("")}
      </div>
    `;
  }

  function renderControlCard(c) {
    const p = progressFor(c.id);
    const waived = isControlWaived(c);
    const requiresDemo = controlRequiresDemo(c);
    const statusLabel = waived ? "Waived" : (STATUS.find(s => s.value === p.status) || STATUS[0]).label;
    const tone = waived ? "neutral" : statusRank(p.status) >= 4 ? "good" : statusRank(p.status) >= 2 ? "info" : statusRank(p.status) === 1 ? "warn" : "bad";
    return `
      <details class="control-card" data-control-card="${c.id}">
        <summary>
          <div>
            <span class="control-id">${escapeHtml(c.id)}</span>
            <strong>${escapeHtml(c.title)}</strong>
            <small>${escapeHtml(c.module)} · ${escapeHtml(c.section)} · ${escapeHtml(c.type)} ${c.regional ? "· Regional" : ""}</small>
          </div>
          <span class="status-pill ${tone}">${escapeHtml(statusLabel)}</span>
        </summary>
        <div class="control-body">
          <p>${escapeHtml(c.description)}</p>
          ${c.waiver ? `<div class="note">Waiver logic: ${escapeHtml(waiverText(c.waiver))}</div>` : ""}
          <div class="control-grid">
            <div>
              <h4>Required evidence</h4>
              <ul>${c.evidence.map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul>
            </div>
            <div>
              <h4>Preparation actions</h4>
              <ul>${c.preparation.map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul>
            </div>
            <div>
              <h4>Common failure reasons</h4>
              <ul>${c.pitfalls.map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul>
            </div>
            <div>
              <h4>Mock audit questions</h4>
              <ul>${c.mockQuestions.map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul>
            </div>
          </div>
          <div class="tracker">
            <label>Status
              <select data-progress="${c.id}" data-field="status" ${waived ? "disabled" : ""}>
                ${STATUS.map(s => `<option value="${s.value}" ${p.status === s.value ? "selected" : ""}>${s.label}</option>`).join("")}
              </select>
            </label>
            <label>Evidence status
              <select data-progress="${c.id}" data-field="evidenceStatus" ${waived ? "disabled" : ""}>
                ${EVIDENCE_STATUS.map(s => `<option value="${s.value}" ${p.evidenceStatus === s.value ? "selected" : ""}>${s.label}</option>`).join("")}
              </select>
            </label>
            <label>Evidence name
              <input data-progress="${c.id}" data-field="evidenceName" value="${escapeHtml(p.evidenceName)}" placeholder="Example: SLA sample v3">
            </label>
            <label>Evidence location
              <input data-progress="${c.id}" data-field="location" value="${escapeHtml(p.location)}" placeholder="SharePoint path, internal link, or repository location">
            </label>
            <label>Owner
              <input data-progress="${c.id}" data-field="owner" value="${escapeHtml(p.owner)}" placeholder="Evidence owner">
            </label>
            <label>SME or presenter
              <input data-progress="${c.id}" data-field="sme" value="${escapeHtml(p.sme)}" placeholder="${escapeHtml(c.roles || "Presenter")}">
            </label>
            <label>${requiresDemo ? "Demo date or validation" : "Review date"}
              <input data-progress="${c.id}" data-field="demoDate" value="${escapeHtml(p.demoDate)}" placeholder="Date or note">
            </label>
            <label class="wide">Notes
              <textarea data-progress="${c.id}" data-field="notes" placeholder="Risks, assumptions, demo script notes">${escapeHtml(p.notes)}</textarea>
            </label>
          </div>
        </div>
      </details>
    `;
  }

  function waiverText(key) {
    const map = {
      supportDesignation: "Active Support Services Designation waives the Support section.",
      sureStepAmbassadors: "Five or more certified SureStep Ambassadors may waive KPI/OKR control 3.5.2.",
      azureFoundationWaiver: "Active Azure Specialization or Azure Expert MSP can waive Cloud Foundation controls.",
      aiWorkforceWaiver: "Active AI Workforce specialization can waive AI Workforce controls.",
      businessProcessWaiver: "Active Business Applications or AI Business Process specialization can waive this section.",
      securityWaiver: "Two active Security specializations can waive Security technical delivery controls.",
      azureTechnicalWaiver: "Active Azure specialization aligned to the selected technical proficiency workload can waive this Azure workload section. Validate exact scope during scheduling."
    };
    return map[key] || key;
  }

  function renderRegional() {
    const regions = getRegions();
    const reg = computeRegionalSummary();
    const controlsById = Object.fromEntries(DATA.controls.map(c => [c.id, c]));
    $("#regionalPanel").innerHTML = `
      <div class="section-head">
        <div>
          <h2>Regional capability assessment</h2>
          <p>For multiple CSP regions, track targeted regional controls. Use capability-based evidence where one global model supports all regions, but still prove regional reach.</p>
        </div>
        <div class="status-pill ${reg.total === 0 || reg.ready === reg.total ? "good" : "warn"}">${reg.total === 0 ? "Single region" : `${reg.ready}/${reg.total} ready`}</div>
      </div>
      ${regions.length <= 1 ? `<div class="card"><p>No additional regional assessment rows are shown because the profile has one CSP authorized region.</p></div>` : `
        <div class="card table-card">
          <table class="data-table regional-table">
            <thead><tr><th>Region</th><th>Control</th><th>Status</th><th>Owner</th><th>Evidence name</th><th>Location</th><th>Notes</th></tr></thead>
            <tbody>
              ${reg.rows.map(row => {
                const c = controlsById[row.controlId] || { title: row.controlId };
                const key = `${row.regionIndex}:${row.controlId}`;
                const p = state.regional[key] || { status: "not_started", owner: "", evidenceName: "", location: "", notes: "" };
                return `<tr>
                  <td>${escapeHtml(row.regionName)}</td>
                  <td><strong>${escapeHtml(row.controlId)}</strong><br><span>${escapeHtml(c.title)}</span>${row.waived ? `<br><span class="required">Waived by SureStep</span>` : ""}</td>
                  <td>
                    <select data-regional="${key}" data-field="status" ${row.waived ? "disabled" : ""}>
                      ${STATUS.map(s => `<option value="${s.value}" ${p.status === s.value ? "selected" : ""}>${s.label}</option>`).join("")}
                    </select>
                  </td>
                  <td><input data-regional="${key}" data-field="owner" value="${escapeHtml(p.owner)}"></td>
                  <td><input data-regional="${key}" data-field="evidenceName" value="${escapeHtml(p.evidenceName)}"></td>
                  <td><input data-regional="${key}" data-field="location" value="${escapeHtml(p.location)}"></td>
                  <td><input data-regional="${key}" data-field="notes" value="${escapeHtml(p.notes)}"></td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      `}
    `;
  }

  function renderMock() {
    const modules = ["all", ...Array.from(new Set(DATA.controls.map(c => c.module)))];
    const eligible = DATA.controls.filter(c => state.mock.filter === "all" || c.module === state.mock.filter);
    let current = DATA.controls.find(c => c.id === state.mock.currentQuestionId);
    if (!current || !eligible.includes(current)) current = eligible[0];

    $("#mockPanel").innerHTML = `
      <div class="section-head">
        <div>
          <h2>Mock audit mode</h2>
          <p>Use this to rehearse answers. Mark a control as mock passed only after the owner can answer, show the evidence, and run any live demo without help.</p>
        </div>
        <div>
          <select data-mock-filter>
            ${modules.map(m => `<option value="${escapeHtml(m)}" ${state.mock.filter === m ? "selected" : ""}>${m === "all" ? "All modules" : escapeHtml(m)}</option>`).join("")}
          </select>
          <button id="randomQuestion">Random question</button>
        </div>
      </div>
      ${current ? `
        <div class="mock-card">
          <div>
            <span class="control-id">${escapeHtml(current.id)}</span>
            <h3>${escapeHtml(current.title)}</h3>
            <p>${escapeHtml(current.description)}</p>
            <h4>Ask these questions</h4>
            <ol>${current.mockQuestions.map(q => `<li>${escapeHtml(q)}</li>`).join("")}</ol>
          </div>
          <div>
            <h4>Assessor will expect</h4>
            <ul>${current.evidence.map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul>
            <button data-mark-mock="${current.id}">Mark this control as mock passed</button>
          </div>
        </div>
      ` : `<p>No controls match this filter.</p>`}
      <div class="card">
        <h3>Mock audit discipline</h3>
        <ul class="compact">
          <li>Presenter can explain the process in simple business terms.</li>
          <li>Evidence is current, named, owned, and easy to open.</li>
          <li>Live demo path is tested with backup screenshots.</li>
          <li>Numbers and dashboards match the reporting period requested.</li>
          <li>Any regional or through-channel model is explained before the assessor asks.</li>
        </ul>
      </div>
    `;
  }

  function renderTemplates() {
    $("#templatesPanel").innerHTML = `
      <div class="section-head">
        <div>
          <h2>Copyable templates</h2>
          <p>Use these as starting points for evidence preparation. Keep final evidence in the distributor's own controlled repository.</p>
        </div>
      </div>
      <div class="templates-grid">
        ${DATA.templates.map(t => `
          <details class="template-card">
            <summary><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(t.category)}</span></summary>
            <pre>${escapeHtml(t.content)}</pre>
            <button data-copy-template="${t.id}">Copy template</button>
          </details>
        `).join("")}
      </div>
    `;
  }

  function renderGapReport() {
    const s = computeSummary();
    const gaps = getGapItems(s);
    $("#gapPanel").innerHTML = `
      <div class="section-head">
        <div>
          <h2>Gap report</h2>
          <p>This report is generated from local browser data. Export JSON to save a working copy or print this page to PDF for internal review.</p>
        </div>
        <button id="printGap">Print gap report</button>
      </div>
      <div class="card">
        <h3>Summary</h3>
        <div class="report-grid">
          <div><strong>${escapeHtml(state.profile.distributorName || "Distributor not named")}</strong><span>Distributor</span></div>
          <div><strong>${escapeHtml(s.readiness)}</strong><span>Readiness status</span></div>
          <div><strong>${s.passedMetrics}/37</strong><span>Quantitative metrics</span></div>
          <div><strong>${s.requiredPassed}/${s.requiredTotal}</strong><span>Required metrics</span></div>
          <div><strong>${s.m1MandatoryReady}/${s.m1MandatoryTotal}</strong><span>Module 1 mandatory</span></div>
          <div><strong>${s.m1AspirationalReady}/3</strong><span>Module 1 aspirational</span></div>
          <div><strong>${s.m2Ready}/${s.m2MandatoryTotal}</strong><span>Module 2 mandatory</span></div>
          <div><strong>${s.regional.ready}/${s.regional.total}</strong><span>Regional</span></div>
        </div>
      </div>
      <div class="card">
        <h3>Open gaps</h3>
        ${gaps.length ? `<ol class="gap-list long">${gaps.map(g => `<li><strong>${escapeHtml(g.title)}</strong><span>${escapeHtml(g.detail)}</span></li>`).join("")}</ol>` : `<p class="success-note">No open readiness gaps detected.</p>`}
      </div>
      <div class="card">
        <h3>Controls missing evidence metadata</h3>
        ${missingEvidenceTable()}
      </div>
    `;
  }

  function renderFees() {
    const p = state.profile;
    const regionalUnits = Number(p.regionalAssessmentUnits) || Math.max(0, (Number(p.regionCount) || 1) - 1);
    const module1 = p.supportDesignation ? DATA.offerGuide.fees.module1WithSupport : DATA.offerGuide.fees.module1NoSupport;
    const scenario = DATA.offerGuide.fees.module2Scenarios.find(x => x.id === p.module2Scenario) || DATA.offerGuide.fees.module2Scenarios[0];
    const total = DATA.offerGuide.fees.enrollment + module1 + (regionalUnits * DATA.offerGuide.fees.regionalAssessmentPerRegion) + scenario.price;
    $("#feesPanel").innerHTML = `
      <div class="section-head">
        <div>
          <h2>Assessment planning and cost estimator</h2>
          <p>Use this only for planning. Final scope, price, subsidies, and timing must be confirmed during scheduling.</p>
        </div>
      </div>
      <div class="panel-grid two">
        <div class="card">
          <h3>Timeline and agenda</h3>
          <div class="timeline">
            ${DATA.offerGuide.agenda.map(a => `<div class="timeline-row"><b></b><div><strong>${escapeHtml(a.module)}</strong><p>${escapeHtml(a.duration)} · ${escapeHtml(a.items)}</p></div></div>`).join("")}
          </div>
        </div>
        <div class="card">
          <h3>Cost estimator</h3>
          <div class="form-grid">
            <label class="field">
              <span>Regional assessment units</span>
              <input type="number" min="0" data-profile="regionalAssessmentUnits" value="${escapeHtml(regionalUnits)}">
            </label>
            <label class="field wide">
              <span>Module 2 pricing scenario</span>
              <select data-profile="module2Scenario">
                ${DATA.offerGuide.fees.module2Scenarios.map(sc => `<option value="${sc.id}" ${p.module2Scenario === sc.id ? "selected" : ""}>${escapeHtml(sc.label)} · ${escapeHtml(sc.duration)} · ${money(sc.price)}</option>`).join("")}
              </select>
            </label>
          </div>
          <table class="mini-table">
            <tr><td>Enrollment fee</td><td>${money(DATA.offerGuide.fees.enrollment)}</td></tr>
            <tr><td>Module 1A ${p.supportDesignation ? "with Support Designation" : "without Support Designation"}</td><td>${money(module1)}</td></tr>
            <tr><td>Module 1B regional assessments</td><td>${regionalUnits} × ${money(DATA.offerGuide.fees.regionalAssessmentPerRegion)} = ${money(regionalUnits * DATA.offerGuide.fees.regionalAssessmentPerRegion)}</td></tr>
            <tr><td>Module 2: ${escapeHtml(scenario.label)}</td><td>${money(scenario.price)}</td></tr>
            <tr class="total"><td>Estimated total</td><td>${money(total)}</td></tr>
          </table>
        </div>
      </div>
    `;
  }

  function missingEvidenceTable() {
    const rows = DATA.controls
      .filter(c => !isControlWaived(c) && (c.type === "Mandatory" || (c.type === "Aspirational" && isReady(c))) && !hasEvidenceMetadata(c))
      .slice(0, 100);
    if (!rows.length) return `<p class="success-note">All required or selected controls have evidence metadata.</p>`;
    return `
      <table class="data-table">
        <thead><tr><th>Control</th><th>Title</th><th>Evidence status</th><th>Owner</th><th>Evidence name</th></tr></thead>
        <tbody>
          ${rows.map(c => {
            const p = progressFor(c.id);
            return `<tr><td>${escapeHtml(c.id)}</td><td>${escapeHtml(c.title)}</td><td>${escapeHtml(p.evidenceStatus)}</td><td>${escapeHtml(p.owner || "Missing")}</td><td>${escapeHtml(p.evidenceName || "Missing")}</td></tr>`;
          }).join("")}
        </tbody>
      </table>
    `;
  }

  function getGapItems(s) {
    const gaps = [];
    if (!s.quantitativePass) {
      gaps.push({ title: "Quantitative telemetry not ready", detail: `Passed ${s.passedMetrics}/37 metrics and ${s.requiredPassed}/${s.requiredTotal} required metrics. Need at least 33 metrics and all required metrics.` });
      s.mResults.filter(r => !r.pass).slice(0, 10).forEach(r => {
        gaps.push({ title: `Metric gap: ${r.metric.area} · ${r.metric.name}`, detail: `Current value: ${valueDisplay(r.metric, r.value)}. Threshold: ${thresholdDisplay(r.metric, r.threshold)}${r.metric.required ? ". This is required." : "."}` });
      });
    }
    DATA.controls.forEach(c => {
      if (isControlWaived(c)) return;
      const p = progressFor(c.id);
      if (c.type === "Mandatory" && !isReady(c)) gaps.push({ title: `${c.id} ${c.title}`, detail: `Mandatory control is ${STATUS.find(x => x.value === p.status)?.label || p.status}. Evidence to prepare: ${c.evidence.slice(0, 2).join("; ")}.` });
      if ((c.type === "Mandatory" || (c.type === "Aspirational" && isReady(c))) && isReady(c) && !hasEvidenceMetadata(c)) {
        gaps.push({ title: `${c.id} evidence metadata incomplete`, detail: "Add evidence name, owner, and mark evidence status as Ready." });
      }
      if (c.type === "Mandatory" && isReady(c) && controlRequiresDemo(c) && !isDemoReady(c)) {
        gaps.push({ title: `${c.id} live demo not ready`, detail: "Control requires a live demonstration. Move status to Demo ready after the presenter can run it." });
      }
    });
    if (s.m1AspirationalReady < 3) gaps.push({ title: "Module 1 aspirational controls below minimum", detail: `Ready aspirational controls: ${s.m1AspirationalReady}. Prepare at least ${3 - s.m1AspirationalReady} more.` });
    if (!s.regionalReady) gaps.push({ title: "Regional controls incomplete", detail: `Regional controls ready: ${s.regional.ready}/${s.regional.total}. Complete regional owner and evidence tracking.` });
    return gaps;
  }

  function groupBy(arr, key) {
    return arr.reduce((acc, item) => {
      const k = item[key];
      acc[k] = acc[k] || [];
      acc[k].push(item);
      return acc;
    }, {});
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const name = (state.profile.distributorName || "frontier-distributor-readiness").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    a.href = URL.createObjectURL(blob);
    a.download = `${name || "frontier-distributor-readiness"}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        state = normalizeState(imported);
        saveState();
        render();
        toast("Readiness JSON imported.");
      } catch (e) {
        alert("Could not import JSON. Please check the file.");
      }
    };
    reader.readAsText(file);
  }

  function resetAll() {
    const ok = confirm("Reset all local readiness data in this browser?");
    if (!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    render();
  }

  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2500);
  }

  document.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-nav]");
    if (nav) {
      const target = nav.getAttribute("data-nav");
      $$(".nav button").forEach(b => b.classList.toggle("active", b === nav));
      $$(".section").forEach(s => s.classList.toggle("active", s.id === target));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    if (e.target.id === "exportJson") exportJson();
    if (e.target.id === "resetData") resetAll();
    if (e.target.id === "printPage" || e.target.id === "printGap") window.print();

    if (e.target.id === "expandAllControls") {
      $$(".control-card").forEach(d => d.open = true);
    }

    if (e.target.id === "randomQuestion") {
      const eligible = DATA.controls.filter(c => state.mock.filter === "all" || c.module === state.mock.filter);
      if (eligible.length) {
        state.mock.currentQuestionId = eligible[Math.floor(Math.random() * eligible.length)].id;
        renderMock();
        saveState();
      }
    }

    const mark = e.target.closest("[data-mark-mock]");
    if (mark) {
      const id = mark.getAttribute("data-mark-mock");
      state.progress[id] = state.progress[id] || {};
      state.progress[id].status = "mock_passed";
      if (state.progress[id].evidenceStatus === "missing") state.progress[id].evidenceStatus = "ready";
      saveState();
      render();
      toast(`Control ${id} marked as mock passed.`);
    }

    const copy = e.target.closest("[data-copy-template]");
    if (copy) {
      const t = DATA.templates.find(x => x.id === copy.getAttribute("data-copy-template"));
      if (t) {
        navigator.clipboard.writeText(t.content).then(() => toast("Template copied."), () => {
          const ta = document.createElement("textarea");
          ta.value = t.content;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
          toast("Template copied.");
        });
      }
    }
  });

  document.addEventListener("change", (e) => {
    const profileKey = e.target.getAttribute("data-profile");
    if (profileKey) {
      if (e.target.type === "checkbox") state.profile[profileKey] = e.target.checked;
      else if (e.target.type === "number") state.profile[profileKey] = Number(e.target.value);
      else state.profile[profileKey] = e.target.value;
      render();
      return;
    }

    const metricId = e.target.getAttribute("data-metric");
    if (metricId) {
      state.metrics[metricId] = e.target.value;
      renderDashboard();
      renderMetrics();
      renderGapReport();
      saveState();
      return;
    }

    const filterKey = e.target.getAttribute("data-filter");
    if (filterKey) {
      state.filters[filterKey] = e.target.value;
      renderChecklist();
      saveState();
      return;
    }

    const progressId = e.target.getAttribute("data-progress");
    if (progressId) {
      const field = e.target.getAttribute("data-field");
      state.progress[progressId][field] = e.target.value;
      if (field === "status" || field === "evidenceStatus") {
        renderChecklist();
      }
      renderDashboard();
      renderGapReport();
      saveState();
      return;
    }

    const regionalKey = e.target.getAttribute("data-regional");
    if (regionalKey) {
      const field = e.target.getAttribute("data-field");
      state.regional[regionalKey] = state.regional[regionalKey] || { status: "not_started", owner: "", evidenceName: "", location: "", notes: "" };
      state.regional[regionalKey][field] = e.target.value;
      renderDashboard();
      renderRegional();
      renderGapReport();
      saveState();
      return;
    }

    if (e.target.matches("[data-mock-filter]")) {
      state.mock.filter = e.target.value;
      state.mock.currentQuestionId = null;
      renderMock();
      saveState();
    }
  });

  document.addEventListener("input", (e) => {
    const profileKey = e.target.getAttribute("data-profile");
    if (profileKey && e.target.type !== "checkbox") {
      if (e.target.type === "number") state.profile[profileKey] = Number(e.target.value);
      else state.profile[profileKey] = e.target.value;
      if (profileKey === "regionCount" || profileKey === "regionalAssessmentUnits") {
        render();
      } else {
        renderDashboard();
        renderGapReport();
        renderFees();
        saveState();
      }
      return;
    }

    const regionIndex = e.target.getAttribute("data-region-name");
    if (regionIndex !== null) {
      state.profile.regions[Number(regionIndex)] = e.target.value;
      saveState();
      return;
    }

    const metricId = e.target.getAttribute("data-metric");
    if (metricId) {
      state.metrics[metricId] = e.target.value;
      renderDashboard();
      renderGapReport();
      saveState();
      return;
    }

    const filterKey = e.target.getAttribute("data-filter");
    if (filterKey) {
      state.filters[filterKey] = e.target.value;
      if (filterKey !== "search") renderChecklist();
      saveState();
      return;
    }

    const progressId = e.target.getAttribute("data-progress");
    if (progressId) {
      const field = e.target.getAttribute("data-field");
      state.progress[progressId][field] = e.target.value;
      if (field === "status" || field === "evidenceStatus") {
        renderChecklist();
      }
      renderDashboard();
      renderGapReport();
      saveState();
      return;
    }

    const regionalKey = e.target.getAttribute("data-regional");
    if (regionalKey) {
      const field = e.target.getAttribute("data-field");
      state.regional[regionalKey] = state.regional[regionalKey] || { status: "not_started", owner: "", evidenceName: "", location: "", notes: "" };
      state.regional[regionalKey][field] = e.target.value;
      renderDashboard();
      renderGapReport();
      saveState();
    }
  });

  $("#importJson").addEventListener("change", e => importJson(e.target.files[0]));

  render();
})();
