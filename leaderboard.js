import { getStore } from "https://esm.sh/@netlify/blobs@8.1.0";

const MAX = 100;
const MODES = ["warna", "suara", "target", "arah", "stroop"];
const BOARDS = MODES.flatMap((m) => [0, 1, 2].map((l) => m + "_" + l));

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      "cache-control": "no-store",
    },
  });
}

function top(list) {
  return [...list].sort((a, b) => a.avg - b.avg).slice(0, MAX);
}

export default async (req) => {
  if (req.method === "OPTIONS") return json({});

  const store = getStore("leaderboard");
  const url = new URL(req.url);

  if (req.method === "GET") {
    const key = url.searchParams.get("key");
    if (!key || !BOARDS.includes(key)) return json({ error: "bad key" }, 400);
    const list = (await store.get(key, { type: "json" })) || [];
    return json({ entries: top(list) });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const { key, pid, name, avg, dev } = body || {};
    if (!key || !BOARDS.includes(key)) return json({ error: "bad key" }, 400);
    if (typeof pid !== "string" || pid.length < 4 || pid.length > 80)
      return json({ error: "bad pid" }, 400);
    if (typeof name !== "string" || !name.trim())
      return json({ error: "bad name" }, 400);
    if (typeof avg !== "number" || !isFinite(avg) || avg < 80 || avg > 5000)
      return json({ error: "bad avg" }, 400);

    const cleanName = name.trim().slice(0, 20);
    const cleanDev = ["phone", "tablet", "pc"].includes(dev) ? dev : "pc";

    // Read-modify-write: last write wins on concurrent submits, acceptable
    // for a casual leaderboard (see README).
    let list = (await store.get(key, { type: "json" })) || [];
    const idx = list.findIndex((e) => e.pid === pid);

    if (idx >= 0) {
      if (list[idx].avg <= avg) {
        return json({ ok: false, reason: "not_better", entries: top(list) });
      }
      list[idx] = { pid, name: cleanName, avg, dev: cleanDev, ts: Date.now() };
    } else {
      if (list.length >= MAX) {
        const sorted = [...list].sort((a, b) => a.avg - b.avg);
        const worst = sorted[sorted.length - 1];
        if (worst.avg <= avg) {
          return json({ ok: false, reason: "full", entries: top(list) });
        }
        list = list.filter((e) => e.pid !== worst.pid);
      }
      list.push({ pid, name: cleanName, avg, dev: cleanDev, ts: Date.now() });
    }

    list = top(list);
    await store.setJSON(key, list);
    return json({ ok: true, entries: list });
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/api/leaderboard" };
