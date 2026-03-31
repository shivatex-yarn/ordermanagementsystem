import http from "k6/http";
import { check, sleep } from "k6";

// Run:
//   k6 run -e BASE_URL="http://127.0.0.1:3000" -e COOKIE="oms_token=..." loadtest/k6-smoke.js

export const options = {
  vus: __ENV.VUS ? Number(__ENV.VUS) : 50,
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800", "p(99)<1500"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:3000";
const COOKIE = __ENV.COOKIE || "";

export default function () {
  const params = COOKIE
    ? { headers: { Cookie: COOKIE } }
    : {};

  const r1 = http.get(`${BASE_URL}/api/auth/me`, params);
  check(r1, { "auth/me 200": (r) => r.status === 200 });

  const r2 = http.get(`${BASE_URL}/api/orders?page=1&limit=5&stats=1`, params);
  check(r2, { "orders 200": (r) => r.status === 200 });

  sleep(0.2);
}

