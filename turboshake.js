/* TurboSHAKE256, RFC 9861 Appendix A.1 and A.3. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TurboSHAKE256 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MASK64 = (1n << 64n) - 1n;
  const RATE = 136;

  // Round constants as little-endian 64-bit lanes (RFC 9861, Appendix A.1).
  const RC = [
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
  ];

  function rol64(x, n) {
    const s = BigInt(n) % 64n;
    if (s === 0n) return x;
    return ((x << s) | (x >> (64n - s))) & MASK64;
  }

  function loadLane(state, x, y) {
    const i = 8 * (x + 5 * y);
    let v = 0n;
    for (let b = 0; b < 8; b++) v |= BigInt(state[i + b]) << BigInt(8 * b);
    return v;
  }

  function storeLane(state, x, y, v) {
    const i = 8 * (x + 5 * y);
    let word = v;
    for (let b = 0; b < 8; b++) {
      state[i + b] = Number(word & 0xffn);
      word >>= 8n;
    }
  }

  function keccakP12(state) {
    const lanes = Array.from({ length: 5 }, () => new Array(5));
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) lanes[x][y] = loadLane(state, x, y);
    }

    for (let round = 0; round < 12; round++) {
      const C = new Array(5);
      for (let x = 0; x < 5; x++) {
        C[x] =
          lanes[x][0] ^ lanes[x][1] ^ lanes[x][2] ^ lanes[x][3] ^ lanes[x][4];
      }
      const D = new Array(5);
      for (let x = 0; x < 5; x++) {
        D[x] = C[(x + 4) % 5] ^ rol64(C[(x + 1) % 5], 1);
      }
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) lanes[x][y] = (lanes[x][y] ^ D[x]) & MASK64;
      }

      let x = 1;
      let y = 0;
      let current = lanes[x][y];
      for (let t = 0; t < 24; t++) {
        const nx = y;
        const ny = (2 * x + 3 * y) % 5;
        const rot = ((t + 1) * (t + 2)) / 2;
        const next = lanes[nx][ny];
        lanes[nx][ny] = rol64(current, rot);
        current = next;
        x = nx;
        y = ny;
      }

      for (let yy = 0; yy < 5; yy++) {
        const T = [lanes[0][yy], lanes[1][yy], lanes[2][yy], lanes[3][yy], lanes[4][yy]];
        for (let xx = 0; xx < 5; xx++) {
          lanes[xx][yy] =
            (T[xx] ^ (~T[(xx + 1) % 5] & T[(xx + 2) % 5])) & MASK64;
        }
      }

      lanes[0][0] = (lanes[0][0] ^ RC[round]) & MASK64;
    }

    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) storeLane(state, x, y, lanes[x][y]);
    }
    return state;
  }

  function xorInto(state, bytes, stateOffset, length) {
    for (let i = 0; i < length; i++) state[stateOffset + i] ^= bytes[i];
  }

  function hash(message, separationByte, outputByteLen) {
    const D = separationByte == null ? 0x1f : separationByte;
    if (!Number.isInteger(D) || D < 0x01 || D > 0x7f) {
      throw new Error("Domain byte must be an integer from 0x01 to 0x7F");
    }
    const L = outputByteLen == null ? 32 : outputByteLen;
    if (!Number.isInteger(L) || L < 1) {
      throw new Error("Output length must be a positive integer");
    }

    const input = new Uint8Array(message.length + 1);
    input.set(message);
    input[message.length] = D;

    const state = new Uint8Array(200);
    let offset = 0;
    while (offset < input.length - RATE) {
      xorInto(state, input.subarray(offset, offset + RATE), 0, RATE);
      keccakP12(state);
      offset += RATE;
    }

    const lastLen = input.length - offset;
    xorInto(state, input.subarray(offset), 0, lastLen);
    state[135] ^= 0x80;
    keccakP12(state);

    const output = new Uint8Array(L);
    let produced = 0;
    let remaining = L;
    while (remaining > RATE) {
      output.set(state.subarray(0, RATE), produced);
      produced += RATE;
      remaining -= RATE;
      keccakP12(state);
    }
    output.set(state.subarray(0, remaining), produced);
    return output;
  }

  function toHex(bytes) {
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const RFC_EMPTY_64 =
    "367a329dafea871c7802ec67f905ae13c57695dc2c6663c61035f59a18f8e7db11edc0e12e91ea60eb6b32df06dd7f002fbafabb6e13ec1cc20d995547600db0";

  function formatHex(bytes) {
    const parts = [...bytes].map((b) => b.toString(16).padStart(2, "0"));
    const lines = [];
    for (let i = 0; i < parts.length; i += 16) {
      lines.push(parts.slice(i, i + 16).join(" "));
    }
    return lines.join("\n");
  }

  function parseDomain(text) {
    const cleaned = String(text).trim().replace(/^0x/i, "");
    if (!/^[0-9a-fA-F]{1,2}$/.test(cleaned)) return null;
    const value = parseInt(cleaned, 16);
    if (value < 0x01 || value > 0x7f) return null;
    return value;
  }

  function initPage() {
    const messageEl = document.getElementById("turbo-message");
    const domainEl = document.getElementById("turbo-domain");
    const lengthEl = document.getElementById("turbo-length");
    const digestEl = document.getElementById("turbo-digest");
    const statusEl = document.getElementById("turbo-status");
    const form = document.getElementById("turbo-form");
    if (!messageEl || !domainEl || !lengthEl || !digestEl) return;

    function syncView() {
      if (location.hash === "#turboshake") {
        document.documentElement.dataset.view = "turbo";
      } else {
        delete document.documentElement.dataset.view;
      }
    }

    function render() {
      const domain = parseDomain(domainEl.value);
      const length = Number(lengthEl.value);
      if (domain == null) {
        statusEl.textContent = "Domain byte must be from 01 to 7F.";
        digestEl.textContent = "—";
        return;
      }
      if (!Number.isInteger(length) || length < 1 || length > 256) {
        statusEl.textContent = "Output length must be 1–256 bytes.";
        digestEl.textContent = "—";
        return;
      }

      const message = new TextEncoder().encode(messageEl.value);
      const digest = hash(message, domain, length);
      digestEl.textContent = formatHex(digest);

      const hex = toHex(digest);
      if (
        message.length === 0 &&
        domain === 0x1f &&
        hex === RFC_EMPTY_64.slice(0, length * 2)
      ) {
        statusEl.textContent = "Matches the RFC 9861 empty-message vector.";
      } else {
        statusEl.textContent =
          message.length +
          " byte" +
          (message.length === 1 ? "" : "s") +
          " in · " +
          length +
          " byte" +
          (length === 1 ? "" : "s") +
          " out";
      }
    }

    form.addEventListener("submit", (event) => event.preventDefault());
    messageEl.addEventListener("input", render);
    domainEl.addEventListener("input", render);
    lengthEl.addEventListener("input", render);
    document.getElementById("turbo-sample-empty").addEventListener("click", () => {
      messageEl.value = "";
      domainEl.value = "1F";
      lengthEl.value = "64";
      render();
    });
    document.getElementById("turbo-sample-hello").addEventListener("click", () => {
      messageEl.value = "Hello, XBT";
      domainEl.value = "1F";
      lengthEl.value = "32";
      render();
    });

    window.addEventListener("hashchange", syncView);
    syncView();
    render();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initPage);
    } else {
      initPage();
    }
  }

  return { hash, toHex, RATE };
});
