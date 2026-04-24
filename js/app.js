(() => {
  const debugDiv = document.getElementById("debug");
  const appRoot = document.getElementById("app");
  const starterPackSection = document.getElementById("starter-pack");
  const starterSeriesTitle = document.getElementById("starterSeriesTitle");
  const starterPackGrid = document.getElementById("starterPackGrid");
  const starterBackBtn = document.getElementById("starterBackBtn");
  let lastResultsScrollY = 0;

  function setDebugOk() {
    if (!debugDiv) return;
    if (typeof SERIES_DATA !== "undefined" && typeof QUESTIONS_DATA !== "undefined") {
      debugDiv.innerHTML = `
        <div class="success">✅ Series loaded: ${SERIES_DATA.length}</div>
        <div class="success">✅ Questions loaded: ${QUESTIONS_DATA.length}</div>
        <div>First series: <strong>${SERIES_DATA[0]?.name ?? "(missing)"}</strong></div>
        <hr style="border:0; border-top:1px solid #333; margin: 1rem 0;">
        <div class="success">🚀 Quiz ready.</div>
      `;
    } else {
      debugDiv.innerHTML = `<div style="color:red">❌ Data variables not found. Check file paths.</div>`;
    }
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = String(v);
      else if (k === "text") node.textContent = String(v);
      else if (k === "html") node.innerHTML = String(v);
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null) node.setAttribute(k, String(v));
    }
    for (const child of Array.isArray(children) ? children : [children]) {
      if (child === null || child === undefined) continue;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
  }

  function clamp01(n) {
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  // QUESTIONS_DATA: 8 sliders + 1 checkbox
  // SERIES_DATA vectors are currently 4-wide (0..10). We expand to 8 dims by repeating.
  function getExpandedSeriesVector01(series) {
    const raw = Array.isArray(series?.vector) ? series.vector : [];
    const v4 = [raw[0], raw[1], raw[2], raw[3]].map((x) => clamp01((Number(x) || 0) / 10));
    // Map q1..q8 to [speed, tech, access, drama, speed, tech, access, drama]
    return [v4[0], v4[1], v4[2], v4[3], v4[0], v4[1], v4[2], v4[3]];
  }

  function scoreSeries(userVector01_8, series) {
    const s = getExpandedSeriesVector01(series);
    let dot = 0;
    const contrib = [];
    for (let i = 0; i < 8; i++) {
      const c = (userVector01_8[i] || 0) * (s[i] || 0);
      contrib.push(c);
      dot += c;
    }
    const score01 = dot / 8;
    return { score01, contrib };
  }

  function formatScore(score01) {
    return (Math.round(score01 * 100) / 100).toFixed(2);
  }

  function buildWhyText(questions, contrib) {
    const pairs = contrib
      .map((c, idx) => ({ idx, c }))
      .sort((a, b) => b.c - a.c)
      .slice(0, 2);

    const labels = pairs
      .map(({ idx }) => questions[idx]?.text)
      .filter(Boolean)
      .map((t) => t.replace(/\?$/, ""));

    if (labels.length === 0) return "Why: overall vibe match";
    return `Why: ${labels.join(" + ")}`;
  }

  function ensureAppRoot() {
    if (appRoot) return appRoot;
    const fallback = el("div", { id: "app" });
    document.body.appendChild(fallback);
    return fallback;
  }

  function normalizeName(s) {
    return String(s || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function findSeriesByIdOrName(seriesId, seriesName) {
    if (typeof SERIES_DATA === "undefined") return null;
    const list = Array.isArray(SERIES_DATA) ? SERIES_DATA : [];
    if (seriesId) {
      const exact = list.find((s) => String(s.id) === String(seriesId));
      if (exact) return exact;
    }
    const n = normalizeName(seriesName);
    if (!n) return null;
    return list.find((s) => normalizeName(s?.name) === n) || null;
  }

  function placeholderImgDataUri(label = "200×150") {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#120000"/>
            <stop offset="1" stop-color="#000000"/>
          </linearGradient>
        </defs>
        <rect x="0.5" y="0.5" width="199" height="149" fill="url(#g)" stroke="#ff0000" stroke-width="1"/>
        <path d="M0 120 L60 70 L105 105 L140 85 L200 125 L200 150 L0 150 Z" fill="rgba(255,0,0,0.12)"/>
        <text x="100" y="78" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="rgba(238,234,234,0.92)" letter-spacing="1">
          ${String(label).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}
        </text>
      </svg>
    `.trim();
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function buildStarterCategories(series) {
    const base = [
      { key: "watch_first", icon: "▶️", title: "WATCH THIS FIRST" },
      { key: "machine", icon: "🏎️", title: "THE MACHINE" },
      { key: "format_101", icon: "📘", title: "FORMAT 101" },
      { key: "history", icon: "🕰️", title: "HISTORY" },
      { key: "drivers", icon: "👤", title: "MUST-KNOW DRIVERS" },
      { key: "follow", icon: "📡", title: "WHERE TO FOLLOW" },
      { key: "trivia", icon: "❓", title: "TRIVIA" },
      { key: "tbd", icon: "🧩", title: "TBD" },
    ];

    const custom = Array.isArray(series?.starterPackCategories) ? series.starterPackCategories : null;
    if (custom && custom.length === 8) return custom;
    return base;
  }

  function showStarterPackForSeries(seriesId, seriesName) {
    const series = findSeriesByIdOrName(seriesId, seriesName);
    if (!starterPackSection || !starterSeriesTitle || !starterPackGrid) return;
    if (!series) return;

    lastResultsScrollY = window.scrollY || 0;

    starterSeriesTitle.textContent = String(series.name || "SERIES").toUpperCase();
    starterPackGrid.innerHTML = "";

    const cats = buildStarterCategories(series);
    cats.forEach((c) => {
      const card = el("article", { class: "starter-card" }, [
        el("div", { class: "starter-card__head" }, [
          el("div", { class: "starter-card__icon", text: c.icon || "📌", "aria-hidden": "true" }),
          el("div", { class: "starter-card__title", text: String(c.title || "").toUpperCase() }),
        ]),
        el("img", {
          class: "starter-card__img",
          src: placeholderImgDataUri("200×150"),
          alt: "",
          loading: "lazy",
          width: "200",
          height: "150",
        }),
        el("div", { class: "starter-card__body", text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua." }),
      ]);
      starterPackGrid.appendChild(card);
    });

    starterPackSection.classList.add("starter-pack--active");
    starterPackSection.setAttribute("aria-hidden", "false");
    starterPackSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function hideStarterPack() {
    if (!starterPackSection) return;
    starterPackSection.classList.remove("starter-pack--active");
    starterPackSection.setAttribute("aria-hidden", "true");
    window.scrollTo({ top: Math.max(0, lastResultsScrollY - 20), behavior: "smooth" });
  }

  function decorateResultCards() {
    const results = document.getElementById("ggResults");
    if (!results || typeof SERIES_DATA === "undefined") return;

    const cards = Array.from(results.children).filter((n) => n && n.tagName === "DIV");
    for (const card of cards) {
      if (card.classList.contains("gg-result-card")) continue;

      const headerLine = card.querySelector("div")?.textContent || "";
      const m = headerLine.match(/#\d+\s+(.*)$/);
      const name = (m?.[1] || "").trim();
      const series = findSeriesByIdOrName(null, name);
      if (!series) continue;

      card.classList.add("gg-result-card");
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-label", `Open starter pack for ${series.name}`);
      card.dataset.seriesId = String(series.id);
    }
  }

  function wireStarterPackInteractions() {
    const results = document.getElementById("ggResults");
    if (!results) return;

    results.addEventListener("click", (e) => {
      const target = e.target?.closest?.(".gg-result-card");
      if (!target) return;
      const seriesId = target.dataset.seriesId;
      const titleText = target.querySelector("div")?.textContent || "";
      const m = titleText.match(/#\d+\s+(.*)$/);
      const name = (m?.[1] || "").trim();
      showStarterPackForSeries(seriesId, name);
    });

    results.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const target = e.target?.closest?.(".gg-result-card");
      if (!target) return;
      e.preventDefault();
      const seriesId = target.dataset.seriesId;
      const titleText = target.querySelector("div")?.textContent || "";
      const m = titleText.match(/#\d+\s+(.*)$/);
      const name = (m?.[1] || "").trim();
      showStarterPackForSeries(seriesId, name);
    });

    if (starterBackBtn) starterBackBtn.addEventListener("click", hideStarterPack);

    const obs = new MutationObserver(() => decorateResultCards());
    obs.observe(results, { childList: true, subtree: false });
    decorateResultCards();
  }

  function render() {
    setDebugOk();
    const root = ensureAppRoot();
    root.innerHTML = "";

    if (typeof SERIES_DATA === "undefined" || typeof QUESTIONS_DATA === "undefined") return;

    const questions = QUESTIONS_DATA.slice();
    const series = SERIES_DATA.slice();

    const total = questions.length;
    let currentIdx = 0;

    const state = {
      sliderValues: Object.fromEntries(
        questions
          .filter((q) => q.type === "slider")
          .map((q) => [q.id, 3])
      ),
      excludedSeriesIds: new Set(),
    };

    const header = el("div", { class: "gg-header" }, [
      el("div", { class: "gg-progress", id: "ggProgress", text: "" }),
      el("div", { class: "gg-progressbar", style: "height:10px;background:#222;border:1px solid #333;border-radius:999px;overflow:hidden;margin:.75rem 0 1rem;" }, [
        el("div", { id: "ggProgressFill", style: "height:100%;width:0%;background:#4caf50;" }),
      ]),
    ]);

    const card = el("div", { class: "gg-card", style: "background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:1rem;max-width:760px;" });
    const nav = el("div", { class: "gg-nav", style: "display:flex;gap:.75rem;flex-wrap:wrap;margin-top:1rem;max-width:760px;" });
    const results = el("div", { class: "gg-results", id: "ggResults", style: "margin-top:1.25rem;max-width:760px;" });

    function updateProgress() {
      const progressText = `Question ${Math.min(currentIdx + 1, total)}/${total}`;
      const pct = ((Math.min(currentIdx + 1, total) / total) * 100).toFixed(0);
      const p = root.querySelector("#ggProgress");
      const f = root.querySelector("#ggProgressFill");
      if (p) p.textContent = progressText;
      if (f) f.style.width = `${pct}%`;
    }

    function renderSliderQuestion(q) {
      const value = Number(state.sliderValues[q.id] ?? 3);
      const valueLabel = el("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:1rem;margin:.5rem 0 0;" }, [
        el("div", { text: "Low", style: "opacity:.75;font-size:.9rem;" }),
        el("div", { id: "ggSliderValue", text: String(value), style: "font-weight:700;" }),
        el("div", { text: "High", style: "opacity:.75;font-size:.9rem;" }),
      ]);

      const input = el("input", {
        type: "range",
        min: "1",
        max: "5",
        step: "1",
        value: String(value),
        style: "width:100%;height:44px;touch-action:pan-y;",
        oninput: (e) => {
          const v = Number(e.target.value);
          state.sliderValues[q.id] = v;
          const label = card.querySelector("#ggSliderValue");
          if (label) label.textContent = String(v);
        },
      });

      return el("div", {}, [
        el("div", { text: q.text, style: "font-size:1.05rem;font-weight:700;line-height:1.25;" }),
        el("div", { style: "margin-top:.75rem;" }, [input, valueLabel]),
      ]);
    }

    function renderCheckboxQuestion(q) {
      // Per task spec: Q9 is exclusions list. We render all series as checkboxes to exclude.
      const items = series.map((s) => {
        const id = `exclude_${s.id}`;
        const checked = state.excludedSeriesIds.has(s.id);
        const box = el("input", {
          id,
          type: "checkbox",
          ...(checked ? { checked: "" } : {}),
          style: "width:20px;height:20px;accent-color:#4caf50;",
          onchange: (e) => {
            if (e.target.checked) state.excludedSeriesIds.add(s.id);
            else state.excludedSeriesIds.delete(s.id);
          },
        });
        const label = el("label", { for: id, style: "display:flex;align-items:center;gap:.75rem;padding:.65rem .75rem;border:1px solid #333;border-radius:10px;background:#151515;cursor:pointer;" }, [
          box,
          el("div", {}, [
            el("div", { text: s.name, style: "font-weight:700;" }),
            el("div", { text: `Starter: ${s.starter}`, style: "opacity:.85;font-size:.9rem;margin-top:.1rem;" }),
          ]),
        ]);
        return label;
      });

      return el("div", {}, [
        el("div", { text: q.text, style: "font-size:1.05rem;font-weight:700;line-height:1.25;" }),
        el("div", { text: "Select any series you want to exclude from recommendations.", style: "opacity:.85;margin:.35rem 0 .75rem;" }),
        el("div", { style: "display:grid;gap:.6rem;" }, items),
      ]);
    }

    function renderQuestion() {
      results.innerHTML = "";
      card.innerHTML = "";
      nav.innerHTML = "";

      const q = questions[currentIdx];
      updateProgress();

      if (!q) {
        card.appendChild(el("div", { text: "No questions found.", style: "color:#f44336;font-weight:700;" }));
        return;
      }

      const content =
        q.type === "slider"
          ? renderSliderQuestion(q)
          : q.type === "checkbox"
            ? renderCheckboxQuestion(q)
            : el("div", { text: `Unsupported question type: ${q.type}` });

      card.appendChild(content);

      const backBtn = el("button", {
        type: "button",
        text: "Back",
        style: "padding:.8rem 1rem;border-radius:10px;border:1px solid #444;background:#101010;color:#e0e0e0;min-height:44px;",
        onclick: () => {
          currentIdx = Math.max(0, currentIdx - 1);
          renderQuestion();
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
      });

      const nextBtn = el("button", {
        type: "button",
        text: currentIdx === total - 1 ? "Get Recs" : "Next",
        style: "padding:.8rem 1rem;border-radius:10px;border:1px solid #2e7d32;background:#4caf50;color:#081108;font-weight:800;min-height:44px;",
        onclick: () => {
          if (currentIdx < total - 1) {
            currentIdx += 1;
            renderQuestion();
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
          }
          computeAndRenderResults();
          window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
        },
      });

      if (currentIdx > 0) nav.appendChild(backBtn);
      nav.appendChild(nextBtn);
    }

    function computeUserVector01_8() {
      const sliderQs = questions.filter((q) => q.type === "slider").slice(0, 8);
      return sliderQs.map((q) => clamp01((Number(state.sliderValues[q.id]) || 0) / 5));
    }

    function computeAndRenderResults() {
      const userVec = computeUserVector01_8();
      const excluded = state.excludedSeriesIds;

      const scored = series
        .filter((s) => !excluded.has(s.id))
        .map((s) => {
          const { score01, contrib } = scoreSeries(userVec, s);
          return { series: s, score01, contrib };
        })
        .sort((a, b) => b.score01 - a.score01)
        .slice(0, 3);

      results.innerHTML = "";
      results.appendChild(el("h3", { text: "Your top matches", style: "margin:1.25rem 0 .75rem;" }));

      if (scored.length === 0) {
        results.appendChild(el("div", { text: "No results (everything excluded).", style: "opacity:.85;" }));
        return;
      }

      const sliderQs = questions.filter((q) => q.type === "slider").slice(0, 8);

      scored.forEach((row, idx) => {
        const s = row.series;
        const scoreTxt = formatScore(row.score01);
        const why = buildWhyText(sliderQs, row.contrib);
        const cardNode = el("div", { style: "background:#141414;border:1px solid #333;border-radius:12px;padding:1rem;margin:.75rem 0;" }, [
          el("div", { style: "display:flex;justify-content:space-between;gap:1rem;align-items:baseline;flex-wrap:wrap;" }, [
            el("div", { text: `#${idx + 1} ${s.name}`, style: "font-size:1.1rem;font-weight:900;" }),
            el("div", { text: `(${scoreTxt})`, style: "font-weight:800;opacity:.9;" }),
          ]),
          el("div", { text: why, style: "margin-top:.5rem;opacity:.9;" }),
          el("div", { html: `<strong>Starter:</strong> ${s.starter}`, style: "margin-top:.5rem;opacity:.95;" }),
        ]);
        results.appendChild(cardNode);
      });
    }

    root.appendChild(header);
    root.appendChild(card);
    root.appendChild(nav);
    root.appendChild(results);

    renderQuestion();
    wireStarterPackInteractions();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
