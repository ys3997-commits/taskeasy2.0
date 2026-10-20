import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(path.join(root, "apps/api/package.json"));
const { createClient: createSb } = require("@supabase/supabase-js");

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const admin = createSb(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const API = "http://localhost:4000";
const CSV =
  "C:/Users/user/Downloads/Total Task of Rajshree Energy - Updated Tasks.csv";

/** Only retry frequencies that failed before migrations were applied. */
const RETRY_ONLY = new Set(["quarterly", "semi_monthly", "thrice_monthly"]);

const FREQ = {
  daily: "daily",
  weekly: "weekly",
  "semi monthly": "semi_monthly",
  "thrice monthly": "thrice_monthly",
  monthly: "monthly",
  quarterly: "quarterly",
  "half yearly": "half_yearly",
  yearly: "yearly",
};

const NAME_ALIASES = {
  "prakaash surana": "prakash surana",
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((v) => v.trim() !== "")) rows.push(row);
  }
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim();
    });
    return obj;
  });
}

function toIsoDate(dmy) {
  const m = String(dmy).trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) throw new Error("Bad date: " + dmy);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function normName(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, " ");
}

const { data: profiles, error } = await admin
  .from("profiles")
  .select("id, first_name, last_name, username")
  .eq("is_active", true);
if (error) throw error;

const byName = new Map();
for (const p of profiles) {
  byName.set(normName(`${p.first_name} ${p.last_name}`), p);
}

const scheduleTasks = profiles.find((p) => p.username === "schedule.tasks");
if (!scheduleTasks) throw new Error("schedule.tasks not found");

const tempPassword = "Import-" + crypto.randomBytes(12).toString("hex") + "!Aa1";
const { error: pwErr } = await admin.auth.admin.updateUserById(scheduleTasks.id, {
  password: tempPassword,
});
if (pwErr) throw pwErr;
await admin
  .from("profiles")
  .update({ must_change_password: false })
  .eq("id", scheduleTasks.id);

const loginRes = await fetch(`${API}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "schedule.tasks", password: tempPassword }),
});
const loginBody = await loginRes.json();
if (!loginRes.ok) throw new Error("Login failed: " + JSON.stringify(loginBody));
const token = loginBody.access_token;
if (!token) throw new Error("No access token");

const { data: existing } = await admin
  .from("recurring_schedules")
  .select("title, receiver_id, start_date, frequency")
  .eq("delegator_id", scheduleTasks.id)
  .eq("is_active", true);
const have = new Set(
  (existing || []).map((r) =>
    [r.title, r.receiver_id, r.start_date, r.frequency].join("|")
  )
);

const rows = parseCsv(fs.readFileSync(CSV, "utf8")).filter((row) =>
  RETRY_ONLY.has(FREQ[normName(row.Frequency)])
);
console.log("Retry candidates:", rows.length);

let ok = 0;
let skip = 0;
let fail = 0;
const failures = [];

for (const row of rows) {
  let name = normName(row.Receiver);
  if (NAME_ALIASES[name]) name = NAME_ALIASES[name];
  const receiver = byName.get(name);
  if (!receiver) {
    fail++;
    failures.push({ task: row.Task, error: "receiver not found: " + row.Receiver });
    continue;
  }
  const frequency = FREQ[normName(row.Frequency)];
  const description = String(row.Task || "").trim();
  const title = description.split(/\r?\n/)[0].slice(0, 200);
  const start_date = toIsoDate(row["Start Date"]);
  const end_date = toIsoDate(row["End Date"]);
  const key = [title, receiver.id, start_date, frequency].join("|");
  if (have.has(key)) {
    skip++;
    continue;
  }

  const body = {
    title,
    description,
    receiver_id: receiver.id,
    approval_required: false,
    frequency,
    interval: 1,
    byweekday: null,
    bymonthday: null,
    time_of_day: "23:59",
    start_date,
    end_date,
  };

  const res = await fetch(`${API}/recurring`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    fail++;
    failures.push({
      task: title.slice(0, 80),
      frequency,
      status: res.status,
      error: parsed.error || parsed.message || parsed,
    });
    console.log("FAIL", title.slice(0, 50), res.status);
  } else {
    ok++;
    have.add(key);
    console.log("OK", ok, title.slice(0, 50));
  }
}

const { count } = await admin
  .from("recurring_schedules")
  .select("*", { count: "exact", head: true })
  .eq("delegator_id", scheduleTasks.id)
  .eq("is_active", true);

console.log(
  JSON.stringify({ ok, skip, fail, totalActiveForScheduleTasks: count, failures }, null, 2)
);
