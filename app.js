(() => {
  const POW2_32 = 2 ** 32;
  const NETWORK_URL = "https://b2pool.io/api/v1/public/network";
  const DIFF_ADJ_URL = "https://mempool.guide/api/v1/difficulty-adjustment";

  const els = {
    status: document.getElementById("status-line"),
    difficulty: document.getElementById("stat-difficulty"),
    hashrate: document.getElementById("stat-hashrate"),
    height: document.getElementById("stat-height"),
    subsidy: document.getElementById("stat-subsidy"),
    blocktime: document.getElementById("stat-blocktime"),
    retarget: document.getElementById("stat-retarget"),
    retargetHint: document.getElementById("stat-retarget-hint"),
    hashrateInput: document.getElementById("hashrate"),
    unitSelect: document.getElementById("unit"),
    resultWait: document.getElementById("result-wait"),
    resultBlocksDay: document.getElementById("result-blocks-day"),
    resultSubsidyDay: document.getElementById("result-subsidy-day"),
    resultShare: document.getElementById("result-share"),
    resultHashes: document.getElementById("result-hashes"),
    resultHour: document.getElementById("result-hour"),
    resultDay: document.getElementById("result-day"),
    resultMonth: document.getElementById("result-month"),
    presets: [...document.querySelectorAll(".preset")],
  };

  const state = {
    difficulty: null,
    networkHashrate: null,
    blockReward: 3.125,
    height: null,
  };

  function formatCompact(n, digits = 2) {
    if (!Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    const units = [
      { v: 1e18, s: "E" },
      { v: 1e15, s: "P" },
      { v: 1e12, s: "T" },
      { v: 1e9, s: "G" },
      { v: 1e6, s: "M" },
      { v: 1e3, s: "K" },
    ];
    for (const u of units) {
      if (abs >= u.v) return `${(n / u.v).toFixed(digits)} ${u.s}`;
    }
    return n.toLocaleString(undefined, { maximumFractionDigits: digits });
  }

  function formatHashrate(hs) {
    if (!Number.isFinite(hs) || hs <= 0) return "—";
    const units = [
      { v: 1e18, s: "EH/s" },
      { v: 1e15, s: "PH/s" },
      { v: 1e12, s: "TH/s" },
      { v: 1e9, s: "GH/s" },
      { v: 1e6, s: "MH/s" },
      { v: 1e3, s: "KH/s" },
    ];
    for (const u of units) {
      if (hs >= u.v) return `${(hs / u.v).toFixed(2)} ${u.s}`;
    }
    return `${hs.toFixed(0)} H/s`;
  }

  function formatDifficulty(d) {
    if (!Number.isFinite(d)) return "—";
    if (d >= 1e12) return `${(d / 1e12).toFixed(2)} T`;
    if (d >= 1e9) return `${(d / 1e9).toFixed(2)} B`;
    if (d >= 1e6) return `${(d / 1e6).toFixed(2)} M`;
    return d.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "—";
    if (seconds < 1) return `${(seconds * 1000).toFixed(0)} ms`;

    const units = [
      { s: 365.25 * 24 * 3600, label: "year" },
      { s: 30.4375 * 24 * 3600, label: "month" },
      { s: 7 * 24 * 3600, label: "week" },
      { s: 24 * 3600, label: "day" },
      { s: 3600, label: "hour" },
      { s: 60, label: "minute" },
      { s: 1, label: "second" },
    ];

    const parts = [];
    let rem = seconds;
    for (const u of units) {
      if (rem >= u.s || parts.length) {
        const n = Math.floor(rem / u.s);
        if (n > 0) {
          parts.push(`${n} ${u.label}${n === 1 ? "" : "s"}`);
          rem -= n * u.s;
        }
      }
      if (parts.length === 2) break;
    }
    return parts.join(", ") || "< 1 second";
  }

  function formatPercent(p) {
    if (!Number.isFinite(p)) return "—";
    if (p === 0) return "0%";
    if (p < 0.0001) return "< 0.0001%";
    if (p < 0.01) return `${p.toFixed(4)}%`;
    if (p < 1) return `${p.toFixed(3)}%`;
    if (p < 10) return `${p.toFixed(2)}%`;
    return `${p.toFixed(1)}%`;
  }

  function formatOneIn(expectedBlocks) {
    if (!Number.isFinite(expectedBlocks) || expectedBlocks <= 0) return "—";
    const n = 1 / expectedBlocks;
    let shown;
    if (n >= 100) shown = Math.round(n).toLocaleString();
    else if (n >= 10) shown = n.toLocaleString(undefined, { maximumFractionDigits: 1 });
    else shown = n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return `1 out of ${shown}`;
  }

  function userHashrateHs() {
    const value = Number(els.hashrateInput.value);
    const unit = Number(els.unitSelect.value);
    if (!Number.isFinite(value) || value < 0 || !Number.isFinite(unit)) return 0;
    return value * unit;
  }

  function recalculate() {
    const hashrate = userHashrateHs();
    const { difficulty, networkHashrate, blockReward } = state;

    if (!difficulty || hashrate <= 0) {
      els.resultWait.textContent = "—";
      els.resultBlocksDay.textContent = "—";
      els.resultSubsidyDay.textContent = "—";
      els.resultShare.textContent = "—";
      els.resultHashes.textContent = difficulty
        ? formatCompact(difficulty * POW2_32, 3)
        : "—";
      els.resultHour.textContent = "—";
      els.resultDay.textContent = "—";
      els.resultMonth.textContent = "—";
      return;
    }

    const hashesPerBlock = difficulty * POW2_32;
    const waitSeconds = hashesPerBlock / hashrate;
    const blocksPerDay = (hashrate * 86400) / hashesPerBlock;
    const subsidyPerDay = blocksPerDay * blockReward;
    const share =
      networkHashrate > 0 ? (hashrate / networkHashrate) * 100 : NaN;

    els.resultWait.textContent = formatDuration(waitSeconds);
    els.resultBlocksDay.textContent =
      blocksPerDay >= 100
        ? blocksPerDay.toFixed(1)
        : blocksPerDay >= 1
          ? blocksPerDay.toFixed(3)
          : blocksPerDay.toPrecision(3);
    els.resultSubsidyDay.textContent = `${subsidyPerDay.toLocaleString(undefined, {
      maximumSignificantDigits: 4,
    })} BTCB2`;
    els.resultShare.textContent = formatPercent(share);
    els.resultHashes.textContent = formatCompact(hashesPerBlock, 3);
    els.resultHour.textContent = formatOneIn(blocksPerDay / 24);
    els.resultDay.textContent = formatOneIn(blocksPerDay);
    els.resultMonth.textContent = formatOneIn(blocksPerDay * 30);
  }

  function setActivePreset(button) {
    els.presets.forEach((b) => b.classList.toggle("is-active", b === button));
  }

  function applyNetwork(network, adjustment) {
    state.difficulty = Number(network.difficulty);
    state.networkHashrate = Number(network.hashrate);
    state.blockReward = Number(network.blockReward) || 3.125;
    state.height = Number(network.height);

    els.difficulty.textContent = formatDifficulty(state.difficulty);
    els.hashrate.textContent = formatHashrate(state.networkHashrate);
    els.height.textContent = state.height.toLocaleString();
    els.subsidy.textContent = `${state.blockReward} BTCB2`;

    if (adjustment && Number.isFinite(adjustment.timeAvg)) {
      const avgSec = adjustment.timeAvg / 1000;
      els.blocktime.textContent =
        avgSec >= 60
          ? `${(avgSec / 60).toFixed(1)} min`
          : `${avgSec.toFixed(0)} sec`;
    } else if (state.difficulty > 0 && state.networkHashrate > 0) {
      const implied = (state.difficulty * POW2_32) / state.networkHashrate;
      els.blocktime.textContent = formatDuration(implied);
    } else {
      els.blocktime.textContent = "—";
    }

    if (adjustment && Number.isFinite(adjustment.remainingBlocks)) {
      const remaining = Math.max(0, Math.round(adjustment.remainingBlocks));
      const change = Number(adjustment.difficultyChange);
      els.retarget.textContent = `${remaining.toLocaleString()} blocks`;
      if (Number.isFinite(change)) {
        const sign = change > 0 ? "+" : "";
        els.retargetHint.textContent = `est. ${sign}${change.toFixed(1)}% adjustment`;
      }
    } else {
      els.retarget.textContent = "—";
    }

    const updated = network.updated
      ? new Date(network.updated).toLocaleString()
      : "just now";
    els.status.textContent = `Live · updated ${updated} · algorithm BLAKE2b`;
    recalculate();
  }

  async function loadNetwork() {
    els.status.textContent = "Loading network data…";
    try {
      const [networkRes, adjRes] = await Promise.all([
        fetch(NETWORK_URL, { cache: "no-store" }),
        fetch(DIFF_ADJ_URL, { cache: "no-store" }).catch(() => null),
      ]);

      if (!networkRes.ok) {
        throw new Error(`Network API returned ${networkRes.status}`);
      }

      const network = await networkRes.json();
      const adjustment = adjRes && adjRes.ok ? await adjRes.json() : null;
      applyNetwork(network, adjustment);
    } catch (err) {
      console.error(err);
      els.status.textContent =
        "Could not reach live APIs. Enter a hashrate anyway — difficulty will appear when the network responds.";
      // Sensible fallback from last known public snapshot so the calculator still works offline.
      applyNetwork(
        {
          difficulty: 3417233412.773904,
          hashrate: 36451334175806690,
          blockReward: 3.125,
          height: 973556,
          updated: null,
        },
        null
      );
      els.status.textContent =
        "Using cached snapshot — live refresh failed. Check your connection.";
    }
  }

  els.hashrateInput.addEventListener("input", () => {
    setActivePreset(null);
    recalculate();
  });
  els.unitSelect.addEventListener("change", () => {
    setActivePreset(null);
    recalculate();
  });

  els.presets.forEach((btn) => {
    btn.addEventListener("click", () => {
      const hs = Number(btn.dataset.hs);
      const unit = Number(btn.dataset.unit);
      els.unitSelect.value = btn.dataset.unit;
      els.hashrateInput.value = String(hs / unit);
      setActivePreset(btn);
      recalculate();
    });
  });

  // Highlight default preset matching initial 4.3 TH/s.
  const defaultPreset = els.presets.find((b) => Number(b.dataset.hs) === 4.3e12);
  if (defaultPreset) setActivePreset(defaultPreset);

  loadNetwork();
  setInterval(loadNetwork, 60_000);
})();
