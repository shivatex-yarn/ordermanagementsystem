import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// Run:
//   k6 run -e BASE_URL="http://127.0.0.1:3000" -e COOKIE="oms_token=..." loadtest/k6-smoke.js
// Higher concurrency:
//   k6 run -e BASE_URL="..." -e COOKIE="..." -e VUS=200 -e DURATION=60s loadtest/k6-smoke.js
// With a specific order:
//   k6 run ... -e ORDER_ID=33 loadtest/k6-smoke.js

export const options = {
  vus: __ENV.VUS ? Number(__ENV.VUS) : 50,
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<2000", "p(99)<4000"],
    "http_req_duration{route:health}": ["p(95)<300"],
    "http_req_duration{route:auth}": ["p(95)<800"],
    "http_req_duration{route:sla_gate}": ["p(95)<600"],
    "http_req_duration{route:notifications}": ["p(95)<800"],
    "http_req_duration{route:orders_list}": ["p(95)<3000"],
    "http_req_duration{route:order_detail}": ["p(95)<4000"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:3000";
const COOKIE = __ENV.COOKIE || "";
const ORDER_ID = __ENV.ORDER_ID ? Number(__ENV.ORDER_ID) : null;

const errorRate = new Rate("errors");
const slaLatency = new Trend("sla_gate_latency_ms");

function params(extraTags) {
  return {
    headers: COOKIE ? { Cookie: COOKIE } : {},
    tags: extraTags || {},
  };
}

export default function () {
  // ── Health ──────────────────────────────────────────────────────────────────
  group("health", () => {
    const r = http.get(`${BASE_URL}/api/health`, params({ route: "health" }));
    const ok = check(r, {
      "health 200": (res) => res.status === 200,
      "health db ok": (res) => {
        try { return JSON.parse(res.body).checks?.database === "ok"; } catch { return false; }
      },
    });
    errorRate.add(!ok);
  });

  // ── Auth ────────────────────────────────────────────────────────────────────
  group("auth", () => {
    const r = http.get(`${BASE_URL}/api/auth/me`, params({ route: "auth" }));
    const ok = check(r, {
      "auth/me ok": (res) => res.status === 200 || res.status === 401,
    });
    errorRate.add(!ok);
  });

  // ── SLA gate (blocks login for division heads with open breaches) ────────────
  group("sla_gate", () => {
    const r = http.get(`${BASE_URL}/api/sla/gate`, params({ route: "sla_gate" }));
    slaLatency.add(r.timings.duration);
    const ok = check(r, {
      "sla/gate 200": (res) => res.status === 200,
      "sla/gate has pending field": (res) => {
        try { return Array.isArray(JSON.parse(res.body).pending); } catch { return false; }
      },
    });
    errorRate.add(!ok);
  });

  // ── Notifications ───────────────────────────────────────────────────────────
  group("notifications", () => {
    const r = http.get(`${BASE_URL}/api/notifications?countOnly=true`, params({ route: "notifications" }));
    const ok = check(r, { "notifications 200": (res) => res.status === 200 });
    errorRate.add(!ok);
  });

  // ── Orders list ─────────────────────────────────────────────────────────────
  group("orders_list", () => {
    const r = http.get(`${BASE_URL}/api/orders?page=1&limit=10&stats=1`, params({ route: "orders_list" }));
    const ok = check(r, { "orders list 200": (res) => res.status === 200 });
    errorRate.add(!ok);
  });

  // ── Order detail + timeline ─────────────────────────────────────────────────
  if (ORDER_ID) {
    group("order_detail", () => {
      const r = http.get(`${BASE_URL}/api/orders/${ORDER_ID}`, params({ route: "order_detail" }));
      const ok = check(r, {
        "order detail ok": (res) => res.status === 200 || res.status === 403 || res.status === 404,
      });
      errorRate.add(!ok);
    });

    group("order_timeline", () => {
      const r = http.get(`${BASE_URL}/api/orders/${ORDER_ID}/timeline`, params({ route: "order_timeline" }));
      check(r, { "timeline ok": (res) => res.status === 200 || res.status === 403 || res.status === 404 });
    });
  }

  // ── SLA list ────────────────────────────────────────────────────────────────
  group("sla_list", () => {
    const r = http.get(`${BASE_URL}/api/sla?page=1&limit=20`, params({ route: "sla_list" }));
    check(r, { "sla list ok": (res) => res.status === 200 });
  });

  sleep(0.2);
}

export function handleSummary(data) {
  const failRate = data.metrics.http_req_failed?.values?.rate ?? 0;
  const p95 = data.metrics.http_req_duration?.values?.["p(95)"] ?? 0;
  const p99 = data.metrics.http_req_duration?.values?.["p(99)"] ?? 0;
  const pass = failRate < 0.01;
  console.log(`\n── Load Test Summary ──────────────────────────────`);
  console.log(`  Result   : ${pass ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`  Errors   : ${(failRate * 100).toFixed(2)}%`);
  console.log(`  p(95)    : ${p95.toFixed(0)} ms`);
  console.log(`  p(99)    : ${p99.toFixed(0)} ms`);
  console.log(`  SLA gate p(95) : ${(data.metrics.sla_gate_latency_ms?.values?.["p(95)"] ?? 0).toFixed(0)} ms`);
  console.log(`────────────────────────────────────────────────────\n`);
  return {};
}
