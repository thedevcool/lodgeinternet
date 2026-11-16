/**
 * Stand-in for the Lodge Internet backend, for the end-to-end tests.
 *
 * The website is a client of the backend (engineering standard P1): it shows
 * the prices, stock and balances the API returns. This small server answers
 * the routes the website calls, from the files in e2e/fixtures/, so the tests
 * can run the real, built website against known data. It is a real HTTP
 * server and not browser-side interception because the Next server calls the
 * API too (the legal pages and the blog are written on the server).
 *
 * How a test controls it
 * ──────────────────────
 * Every browser the tests open carries a cookie `e2e_session=<id>`. The
 * server keeps one separate world per id (who has signed up, which codes are
 * held, the wallet balance, review verdicts), so tests can run side by side
 * without seeing each other. Requests with no such cookie (the Next server's
 * own) share the world called "server".
 *
 *   POST /__scenario        { session, ...knobs }  start a world afresh
 *   POST /__release         { session, route? }    let held answers go
 *   POST /__transfer-landed { session }            the bank transfer arrived
 *   GET  /__state?session=  what happened in that world (for assertions)
 *   GET  /__health          "ok" once the server is up
 *
 * The knobs are listed at DEFAULT_SCENARIO below. e2e/support/api.ts wraps
 * all of this for the specs.
 *
 * Sign-in is a cookie, as on the real backend: `lodge_customer=<uid>` for
 * customers, `lodge_admin=<username>` for admins, both HttpOnly, and each
 * only counts with the matching `X-Lodge-Client` header (site / admin).
 *
 * No dependencies: `node e2e/mock-api.mjs`. Port 4010 unless MOCK_API_PORT.
 */

import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.MOCK_API_PORT || 4010);
// The only origin allowed to call with cookies: the website under test.
const SITE_ORIGIN = process.env.MOCK_SITE_ORIGIN || "http://localhost:3100";

function fixture(name) {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), "utf8"));
}

const DIRECTORY = fixture("directory");
const PLANS = fixture("plans");
const CUSTOMERS = fixture("customers");
const WALLET = fixture("wallet");
const BLOG = fixture("blog");
const LEGAL = fixture("legal");
const ADMINS = fixture("admins");

// ── Scenarios ───────────────────────────────────────────────────────────────

/** Every knob a test can turn, with what it is when a test turns nothing. */
const DEFAULT_SCENARIO = {
  // "default" | "empty" (no hostels at all) | "with-school" (adds a school)
  directory: "default",
  // "default" | "empty" (the hostel sells nothing)
  plans: "default",
  // Codes left per plan key (see fixtures/plans.json), over the fixture's.
  stock: {},
  // "ok" | "sold-out": reserve refuses although the list said in stock
  // (somebody else took the last code a moment ago).
  reserve: "ok",
  // "off" | "funded" | "short" | "new" | "dva-failed" (fixtures/wallet.json)
  wallet: "funded",
  // "ok" | "error" (claim fails, checking again finds the code) |
  // "unfulfilled" (paid, but no code could be issued)
  claim: "ok",
  // "default" | "empty" (no live posts)
  blog: "default",
  // Cover illustrations: "none" | "approved" (readers see them) |
  // "new" (drawn for two live posts, waiting for the superadmin's yes)
  covers: "none",
  // "none" | "returning": the customer already has a TV plan with its MAC
  // address on file, so a TV purchase goes straight to payment. The stand-in
  // then takes the payment but can't put the TV on the network yet.
  tv: "none",
  // Welcome codes at Palm Court (its poster link is WELCOME.token below):
  // "none" (no giveaway: the link is unknown) | "open" | "ended" |
  // "out-of-codes" | "everyone" (open, and not only to new accounts).
  giveaway: "none",
  // The backend's lockdown switch (GET /api/service-status).
  maintenance: false,
  // Routes to break: [{ route: "GET /api/hostels", status: 500, times: 1 }]
  // or { route, drop: true } to cut the connection. `times` left out = always.
  fail: [],
  // Routes whose answer waits until POST /__release: ["GET /api/hostels"].
  hold: [],
};

/** The one giveaway the stand-in knows: Palm Court's, behind this poster link. */
const WELCOME = {
  token: "palm-court-poster-1",
  hostel: "Palm Court",
  gives: "2GB for 1 day, up to 3 devices",
  code: "WELC7Q2M",
  endsAt: "2026-11-29T22:59:59Z",
};

const sessions = new Map();

function freshSession(knobs = {}) {
  const scenario = { ...DEFAULT_SCENARIO, ...knobs };
  const walletState = WALLET.states[scenario.wallet] ?? WALLET.states.funded;
  return {
    scenario,
    failCounts: {},
    held: [],
    log: [],
    counter: 0,
    // Accounts made during the test, by uid, and changes to any profile.
    signups: {},
    profilePatches: {},
    passwords: {},
    // Held codes, by reservation id.
    reservations: {},
    // Codes issued, by payment reference (so a second claim gets the same one).
    claims: {},
    // Welcome codes claimed, by uid (one each, ever).
    welcomeClaims: {},
    // Wallet / bank-transfer orders, by pending id.
    orders: {},
    walletBalanceKobo: walletState.available ? walletState.balanceKobo : 0,
    walletActivity: walletState.available ? [...walletState.activity] : [],
    dvaOpened: false,
    // Blog review desk: verdicts and unpublished edits, by slug.
    reviews: structuredClone(BLOG.reviews),
    drafts: {},
    coversApproved: scenario.covers === "approved",
  };
}

function sessionOf(id) {
  if (!sessions.has(id)) sessions.set(id, freshSession());
  return sessions.get(id);
}

// ── Small helpers ───────────────────────────────────────────────────────────

function cookiesOf(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0) out[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1).trim());
  }
  return out;
}

async function bodyOf(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** An answer: status, JSON body, and any cookies to set or clear. */
function answer(status, body, cookies = []) {
  return { status, body, cookies };
}

/** The backend's error contract: {"error", "code"} (engineering standard B3). */
function apiError(status, message, code, extra = {}) {
  return answer(status, { error: message, ...(code ? { code } : {}), ...extra });
}

function setCookie(name, value) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`;
}

function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function slugOf(name) {
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// ── Directory and plans ─────────────────────────────────────────────────────

function directoryOf(session) {
  const kind = session.scenario.directory;
  if (kind === "empty") return { hostels: [], collages: [], schools: [] };
  if (kind === "with-school") {
    return {
      hostels: [...DIRECTORY.hostels, ...DIRECTORY.withSchool.hostels],
      collages: [...DIRECTORY.collages, ...DIRECTORY.withSchool.collages],
      schools: [...DIRECTORY.withSchool.schools],
    };
  }
  return { hostels: DIRECTORY.hostels, collages: DIRECTORY.collages, schools: DIRECTORY.schools };
}

/** Plan ids are "<hostel-slug>--<plan key>", so one catalogue serves every hostel. */
function planId(hostelName, key) {
  return `${slugOf(hostelName)}--${key}`;
}

function planKeyOf(id) {
  return String(id || "").split("--")[1] || "";
}

function planByKey(key) {
  return PLANS.plans.find((plan) => plan.key === key);
}

function plansFor(session, hostelName) {
  if (session.scenario.plans === "empty") return [];
  return PLANS.plans.map(({ key, ...plan }) => ({
    id: planId(hostelName, key),
    ...plan,
    source: "local",
    controllerId: null,
    poolKey: key,
    entitlementKey: null,
    eligible: true,
    enabled: true,
    priceResolved: true,
    priceSource: null,
  }));
}

/** Codes left for a plan: the scenario's figure or the fixture's, less the ones held or sold in this test. */
function stockOf(session, id) {
  const key = planKeyOf(id);
  const base = session.scenario.stock[key] ?? PLANS.stock[key] ?? 0;
  const taken = Object.values(session.reservations).filter((r) => r.planId === id && !r.released).length;
  return Math.max(base - taken, 0);
}

// ── Customers ───────────────────────────────────────────────────────────────

function fixtureCustomer(uid) {
  return Object.values(CUSTOMERS.customers).find((c) => c.uid === uid);
}

/** The account with this uid as this test sees it, or null. */
function customerOf(session, uid) {
  const base = fixtureCustomer(uid) ?? session.signups[uid];
  return base ? { ...base, ...(session.profilePatches[uid] ?? {}) } : null;
}

function customerByEmail(session, email) {
  const wanted = String(email || "").trim().toLowerCase();
  const all = [...Object.values(CUSTOMERS.customers), ...Object.values(session.signups)];
  const found = all.find((c) => c.email === wanted);
  return found ? customerOf(session, found.uid) : null;
}

function passwordOf(session, uid) {
  return session.passwords[uid] ?? CUSTOMERS.password;
}

/** Who is signed in on this request (the cookie only counts from the site). */
function signedInCustomer(req, session) {
  if (req.headers["x-lodge-client"] !== "site") return null;
  const uid = cookiesOf(req).lodge_customer;
  return uid ? customerOf(session, uid) : null;
}

function signedInAdmin(req) {
  if (req.headers["x-lodge-client"] !== "admin") return null;
  return ADMINS.admins[cookiesOf(req).lodge_admin] ?? null;
}

const NOT_SIGNED_IN = () => apiError(401, "Not signed in.", "NOT_SIGNED_IN");

/** Where Palm Court's giveaway stands in this world, or null when there is none. */
function welcomeStatus(session) {
  return { none: null, open: "open", everyone: "open", ended: "ended", "out-of-codes": "out_of_codes" }[
    session.scenario.giveaway
  ];
}

const WELCOME_NOT_FOUND = () =>
  apiError(
    404,
    "This welcome code link is no longer in use. Ask the Lodge Internet team at your hostel for the new poster.",
    "GIVEAWAY_NOT_FOUND",
  );

function profileOf(customer) {
  return {
    id: customer.uid,
    email: customer.email,
    displayName: customer.displayName,
    hostelId: customer.hostelId,
    hostelSlug: customer.hostelSlug,
    collageSlug: customer.collageSlug || null,
    emailVerified: customer.emailVerified,
    hasPhone: Boolean(customer.phone),
    hostelChangeAvailable: !customer.hostelId,
    createdAt: "2026-09-01T08:00:00Z",
    updatedAt: "2026-11-01T08:00:00Z",
  };
}

// ── Wallet ──────────────────────────────────────────────────────────────────

function walletOf(session, customer) {
  const state = WALLET.states[session.scenario.wallet] ?? WALLET.states.funded;
  if (!state.available) return { available: false };
  const hasDva = state.hasDva || session.dvaOpened;
  return {
    available: true,
    balanceKobo: session.walletBalanceKobo,
    dva: hasDva ? dvaOf(customer) : null,
    dvaFailed: state.dvaFailed && !session.dvaOpened,
    hasPhone: state.hasPhone && Boolean(customer.phone),
    activity: session.walletActivity,
  };
}

function dvaOf(customer) {
  return { ...WALLET.dva, account_name: `LODGE INTERNET / ${String(customer.displayName || customer.email).toUpperCase()}` };
}

function walletIsOn(session) {
  return (WALLET.states[session.scenario.wallet] ?? WALLET.states.funded).available;
}

/** A paid code order, in the shape both the wallet and the transfer routes answer with. */
function readyOrder(session, order) {
  const plan = planByKey(planKeyOf(order.planId));
  return {
    status: "ready",
    type: "data",
    code: PLANS.codes[plan.key],
    planName: plan.name,
    purchaseId: `pur_${order.pendingId}`,
    pendingId: order.pendingId,
    balanceKobo: session.walletBalanceKobo,
  };
}

// ── Blog ────────────────────────────────────────────────────────────────────

const SECTION_TITLE = Object.fromEntries(BLOG.sections.map((s) => [s.key, s.title]));

/** Where readers fetch a post's approved cover, or null. The `v` changes with the drawing. */
function coverOf(session, post) {
  return session.coversApproved && post.coverSvg ? `/api/blog/${post.slug}/cover.svg?v=${post.contentHash}` : null;
}

/** A live post whose words are approved and only the cover is new. */
function coverOnly(session, post) {
  return (
    session.scenario.covers === "new" &&
    !session.coversApproved &&
    Boolean(post.coverSvg) &&
    session.reviews[post.slug].status === "live" &&
    !session.drafts[post.slug]
  );
}

function summaryOf(post, review) {
  return {
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    section: post.section,
    sectionTitle: SECTION_TITLE[post.section],
    audience: post.audience,
    checked: post.checked,
    published: review.published,
    updated: review.updated,
  };
}

/** Posts readers can see: those with a published date in this world's reviews. */
function livePosts(session) {
  if (session.scenario.blog === "empty") return [];
  return BLOG.posts
    .filter((post) => session.reviews[post.slug]?.published)
    .sort((a, b) => session.reviews[b.slug].published.localeCompare(session.reviews[a.slug].published));
}

/** The writing format the review editor shows: blocks as plain text. */
function bodyFromBlocks(blocks) {
  return blocks
    .map((block) => {
      if (block.type === "h2") return `## ${block.text}`;
      if (block.type === "h3") return `### ${block.text}`;
      if (block.type === "quote") return `> ${block.text}`;
      if (block.type === "ul") return block.items.map((item) => `- ${item}`).join("\n");
      if (block.type === "ol") return block.items.map((item, i) => `${i + 1}. ${item}`).join("\n");
      if (block.type === "code") return "```" + block.lang + "\n" + block.text + "\n```";
      if (block.type === "hostels") return "{{hostels}}";
      return block.text;
    })
    .join("\n\n");
}

/** The other way: the editor's text back into blocks (blank line between each). */
function blocksFromBody(body) {
  const blocks = [];
  for (const chunk of String(body).replace(/\r/g, "").split(/\n{2,}/)) {
    const text = chunk.trim();
    if (!text) continue;
    const lines = text.split("\n");
    if (text.startsWith("```")) {
      blocks.push({ type: "code", lang: lines[0].slice(3).trim() || "text", text: lines.slice(1).filter((l) => l !== "```").join("\n") });
    } else if (text === "{{hostels}}") blocks.push({ type: "hostels" });
    else if (text.startsWith("### ")) blocks.push({ type: "h3", text: text.slice(4) });
    else if (text.startsWith("## ")) blocks.push({ type: "h2", text: text.slice(3) });
    else if (text.startsWith("> ")) blocks.push({ type: "quote", text: text.slice(2) });
    else if (lines.every((l) => l.startsWith("- "))) blocks.push({ type: "ul", items: lines.map((l) => l.slice(2)) });
    else if (lines.every((l) => /^\d+\.\s/.test(l))) blocks.push({ type: "ol", items: lines.map((l) => l.replace(/^\d+\.\s/, "")) });
    else blocks.push({ type: "p", text: lines.join(" ") });
  }
  return blocks;
}

// The backend's "never publish" patterns that matter to these tests
// (backend/app/blog/checks.py): a price or a phone number in a post.
const NEVER_PUBLISH = [
  [/₦\s?\d[\d,]*|\bNGN\s?\d[\d,]*|\d[\d,]*\s?naira\b/i, "a naira amount"],
  [/(?:\+?234|\b0)[789][01]\d{8}\b/, "a phone number"],
];

function problemsIn(title, summary, blocks) {
  const texts = [title, summary];
  for (const block of blocks) {
    if (block.text) texts.push(block.text);
    if (block.items) texts.push(...block.items);
  }
  const whole = texts.join("\n");
  const found = [];
  for (const [pattern, what] of NEVER_PUBLISH) {
    const match = whole.match(pattern);
    if (match) found.push(`contains ${what}: '${match[0]}'`);
  }
  return found;
}

function reviewRow(session, post) {
  const review = session.reviews[post.slug];
  const draft = session.drafts[post.slug];
  return {
    ...summaryOf(post, review),
    note: post.note,
    covers: post.covers,
    contentHash: post.contentHash,
    // A new cover on a live post is an update waiting for a yes, like new words.
    status: coverOnly(session, post) ? "update" : review.status,
    hasCover: Boolean(post.coverSvg),
    coverOnly: coverOnly(session, post),
    reviewNote: review.reviewNote,
    reviewedBy: review.reviewedBy,
    reviewedAt: review.reviewedAt,
    edited: Boolean(draft),
    draftStale: false,
  };
}

/** One post on the review desk: as it would go live, with any unpublished edits applied. */
function reviewPage(session, post) {
  const draft = session.drafts[post.slug];
  const title = draft ? draft.title : post.title;
  const summary = draft ? draft.summary : post.summary;
  const blocks = draft ? blocksFromBody(draft.body) : post.blocks;
  return {
    ...reviewRow(session, post),
    title,
    summary,
    blocks,
    coverSvg: post.coverSvg ?? null,
    editor: { title, summary, body: draft ? draft.body : bodyFromBlocks(post.blocks) },
    problems: problemsIn(title, summary, blocks),
  };
}

// ── Routes ──────────────────────────────────────────────────────────────────
// One function per route, keyed "METHOD /path". `:slug` matches one segment.
// Each gets { req, session, query, body, params } and returns answer(...).

const routes = {
  // ── Site-wide ─────────────────────────────────────────────────────────────
  "GET /api/service-status": ({ session }) =>
    answer(200, {
      locked: session.scenario.maintenance,
      message: session.scenario.maintenance ? "We are upgrading the network tonight. Back by 6 am." : "",
    }),

  // ── Hostel directory ──────────────────────────────────────────────────────
  "GET /api/hostels": ({ session }) => answer(200, { hostels: directoryOf(session).hostels }),
  "GET /api/hostel-collages": ({ session }) => answer(200, { collages: directoryOf(session).collages }),
  "GET /api/hostel-schools": ({ session }) => answer(200, { schools: directoryOf(session).schools }),
  "GET /api/support-contacts": ({ query }) =>
    query.get("hostelId")
      ? answer(200, { contacts: DIRECTORY.supportContacts })
      : apiError(400, "hostelId query parameter is required"),

  // ── Plans and stock ───────────────────────────────────────────────────────
  "GET /api/data-plans": ({ session, query }) => {
    const hostel = query.get("hostel");
    if (!hostel) return apiError(400, "hostel query parameter is required");
    const kind = query.get("kind");
    const plans = plansFor(session, hostel).filter((plan) =>
      kind === "all" ? true : kind === "tv" ? plan.planType === "tv" : plan.planType !== "tv",
    );
    return answer(200, { plans: plans.sort((a, b) => a.price - b.price) });
  },

  "POST /api/data-codes/check-availability": ({ session, body }) => {
    if (!body.planId) return apiError(400, "Missing planId");
    if (!body.hostel) return apiError(400, "Missing hostel");
    const count = stockOf(session, body.planId);
    return answer(200, { available: count > 0, count });
  },

  "GET /api/checkout/reserve-split": ({ query }) => {
    // The platform's share of this price, in kobo, worked out by the server.
    const priceKobo = Math.round(Number(query.get("priceNaira") || 0) * 100);
    return answer(200, {
      subaccountCode: PLANS.reserveSplit.subaccountCode,
      transactionChargeKobo: Math.round((priceKobo * PLANS.reserveSplit.ratePercent) / 100),
    });
  },

  // ── Reserve → pay → claim (the only way a code is issued, P4) ─────────────
  "POST /api/data-codes/reserve": ({ req, session, body }) => {
    const customer = signedInCustomer(req, session);
    if (!customer) return NOT_SIGNED_IN();
    if (!body.planId) return apiError(400, "Missing planId");
    if (!body.hostel) return apiError(400, "Missing hostel");
    if (session.scenario.reserve === "sold-out" || stockOf(session, body.planId) === 0) {
      return apiError(409, "Sorry, the last code for this plan was just taken. Please choose another plan.", "NO_CODES");
    }
    // The id is the held code's own document id, reused for every sale of
    // that code (P5), so it looks like a code row and not like an order.
    const reservationId = `dc_${planKeyOf(body.planId)}_${String(++session.counter).padStart(4, "0")}`;
    session.reservations[reservationId] = {
      reservationId,
      planId: body.planId,
      hostel: body.hostel,
      uid: customer.uid,
      released: false,
      claimed: false,
    };
    return answer(200, { reservationId, expiresAt: Date.now() + 60 * 60 * 1000 });
  },

  "POST /api/data-codes/release": ({ req, session, body }) => {
    if (!signedInCustomer(req, session)) return NOT_SIGNED_IN();
    if (!body.reservationId) return apiError(400, "reservationId is required");
    const held = session.reservations[body.reservationId];
    if (!held || held.released || held.claimed) return answer(200, { success: true, released: false });
    held.released = true;
    return answer(200, { success: true, released: true });
  },

  "POST /api/data-codes/claim": ({ req, session, body }) => {
    if (!signedInCustomer(req, session)) return NOT_SIGNED_IN();
    if (!body.planId) return apiError(400, "Missing planId");
    if (!body.paymentRef) return apiError(400, "Missing payment reference.");
    if (session.scenario.claim === "error") return apiError(500, "Failed to claim data code");
    if (session.scenario.claim === "unfulfilled") {
      return apiError(409, "No codes are available for this plan right now.", "NO_CODES");
    }
    return answer(200, { code: issueCode(session, body) });
  },

  "POST /api/data-codes/claim-status": ({ req, session, body }) => {
    if (!signedInCustomer(req, session)) return NOT_SIGNED_IN();
    if (!body.paymentRef) return apiError(400, "Missing payment reference.");
    if (session.scenario.claim === "unfulfilled") {
      return answer(200, { status: "unfulfilled", reason: "no_stock", paymentRef: body.paymentRef });
    }
    return answer(200, { status: "ready", code: issueCode(session, body) });
  },

  "POST /api/data-codes/reveal": ({ req, session, body }) => {
    const customer = signedInCustomer(req, session);
    if (!customer) return NOT_SIGNED_IN();
    const code = customer.purchaseCodes?.[body.purchaseId];
    return code ? answer(200, { code }) : apiError(404, "Purchase not found");
  },

  "POST /api/data-codes/resend-email": ({ req, session }) =>
    signedInCustomer(req, session) ? answer(200, { success: true }) : NOT_SIGNED_IN(),

  "POST /api/data-codes/feedback": () => answer(200, { success: true }),

  // ── Customer sign-in ──────────────────────────────────────────────────────
  "GET /api/auth/session": ({ req, session }) => {
    const customer = signedInCustomer(req, session);
    if (!customer) return NOT_SIGNED_IN();
    return answer(200, { success: true, userId: customer.uid, email: customer.email });
  },

  "POST /api/auth/login": ({ session, body }) => {
    const customer = customerByEmail(session, body.email);
    if (!body.email || !body.password) return apiError(400, "Email and password are required");
    if (!customer || body.password !== passwordOf(session, customer.uid)) {
      return apiError(401, "Incorrect email or password.", "INVALID_CREDENTIALS");
    }
    return answer(200, { success: true, userId: customer.uid, email: customer.email }, [
      setCookie("lodge_customer", customer.uid),
    ]);
  },

  "POST /api/auth/signup": ({ session, body }) => {
    const email = String(body.email || "").trim().toLowerCase();
    if (!email.includes("@")) return apiError(400, "A valid email address is required", "INVALID_EMAIL");
    if (String(body.password || "").length < 6) return apiError(400, "Password must be at least 6 characters", "WEAK_PASSWORD");
    if (customerByEmail(session, email)) return apiError(409, "An account with this email already exists.", "EMAIL_IN_USE");
    const uid = `cus_new_${++session.counter}`;
    // An account only: the profile arrives with POST /api/auth/register.
    session.signups[uid] = { uid, email, hasProfile: false, purchases: [], purchaseCodes: {}, balances: [] };
    session.passwords[uid] = body.password;
    return answer(200, { success: true, userId: uid, email }, [setCookie("lodge_customer", uid)]);
  },

  "POST /api/auth/logout": () => answer(200, { success: true }, [clearCookie("lodge_customer")]),

  "POST /api/auth/reauth": ({ req, session, body }) => {
    const customer = signedInCustomer(req, session);
    if (!customer) return apiError(401, "Your session has expired. Please sign in again.", "INVALID_TOKEN");
    if (body.password !== passwordOf(session, customer.uid)) return apiError(401, "Incorrect email or password.", "INVALID_CREDENTIALS");
    return answer(200, { success: true });
  },

  "DELETE /api/auth/account": ({ req, session }) => {
    const customer = signedInCustomer(req, session);
    if (!customer) return apiError(401, "Invalid or expired token.", "INVALID_TOKEN");
    delete session.signups[customer.uid];
    return answer(200, { success: true }, [clearCookie("lodge_customer")]);
  },

  "GET /api/auth/user": ({ req, session, query }) => {
    const uid = query.get("userId");
    if (!uid) return apiError(400, "User ID is required");
    const customer = signedInCustomer(req, session);
    if (!customer) return NOT_SIGNED_IN();
    if (customer.uid !== uid) return apiError(403, "Token does not match user ID.");
    if (customer.hasProfile === false) return apiError(404, "User not found");
    return answer(200, { profile: profileOf(customer), purchases: customer.purchases ?? [] });
  },

  "POST /api/auth/register": ({ req, session, body }) => {
    const customer = signedInCustomer(req, session);
    if (!customer || customer.uid !== body.userId) return apiError(403, "Token does not match user ID.");
    if (!body.email || !body.hostel) return apiError(400, "User ID, email, and hostel are required");
    if (body.phone && !/^\+?\d{10,13}$/.test(String(body.phone).replace(/[\s\-()]/g, ""))) {
      return apiError(400, "Enter a Nigerian mobile number, e.g. 0803 123 4567.", "INVALID_PHONE");
    }
    const hostel = directoryOf(session).hostels.find((h) => h.name === body.hostel);
    const collage = directoryOf(session).collages.find((c) => c.id === hostel?.collageId);
    session.profilePatches[customer.uid] = {
      hasProfile: true,
      displayName: body.displayName || "",
      hostelId: body.hostel,
      hostelSlug: slugOf(body.hostel),
      collageSlug: collage?.slug ?? null,
      emailVerified: false,
      phone: body.phone || "",
    };
    return answer(200, { success: true, message: "Verification code sent to your email" });
  },

  "POST /api/auth/verify-email": ({ session, body }) => {
    if (!body.userId || !body.code) return apiError(400, "User ID and code are required");
    if (body.code !== CUSTOMERS.verificationCode) {
      return apiError(400, "That code isn't right. Check your email and try again.", "invalid");
    }
    session.profilePatches[body.userId] = { ...(session.profilePatches[body.userId] ?? {}), emailVerified: true };
    return answer(200, { success: true, message: "Email verified successfully" });
  },

  "POST /api/auth/resend-code": ({ session, body }) => {
    const customer = customerByEmail(session, body.email);
    if (!customer) return apiError(404, "No account found for this email address.");
    if (customer.emailVerified) return answer(200, { success: true, alreadyVerified: true });
    return answer(200, { success: true, userId: customer.uid });
  },

  "POST /api/auth/forgot-password": ({ session, body }) => {
    const customer = customerByEmail(session, body.email);
    // An unknown email gets the same "sent" answer, without an id: the real
    // backend doesn't say which addresses have accounts.
    if (!customer) return answer(200, { success: true });
    if (!customer.emailVerified) return answer(403, { success: false, notVerified: true });
    return answer(200, { success: true, userId: customer.uid });
  },

  "POST /api/auth/reset-password": ({ session, body }) => {
    if (!body.userId || !body.code || !body.newPassword) return apiError(400, "userId, code, and newPassword are required");
    if (body.code !== CUSTOMERS.resetCode) return apiError(400, "That code isn't right. Check your email and try again.", "invalid");
    session.passwords[body.userId] = body.newPassword;
    return answer(200, { success: true });
  },

  "PATCH /api/auth/profile": ({ req, session, body }) => {
    const customer = signedInCustomer(req, session);
    if (!customer || customer.uid !== body.userId) return apiError(403, "Token does not match user ID.");
    if (!body.hostelId) return apiError(400, "hostelId is required");
    if (customer.hostelId && customer.hostelId !== body.hostelId) {
      return apiError(409, `Your account belongs to ${customer.hostelId}.`, "HOSTEL_LOCKED");
    }
    session.profilePatches[customer.uid] = {
      ...(session.profilePatches[customer.uid] ?? {}),
      hostelId: body.hostelId,
      hostelSlug: slugOf(body.hostelId),
    };
    return answer(200, { success: true, hostelId: body.hostelId });
  },

  // ── Account ───────────────────────────────────────────────────────────────
  "GET /api/account/balances": ({ req, session }) => {
    const customer = signedInCustomer(req, session);
    return customer ? answer(200, { balances: customer.balances ?? [] }) : NOT_SIGNED_IN();
  },

  "PATCH /api/account/phone": ({ req, session, body }) => {
    const customer = signedInCustomer(req, session);
    if (!customer) return NOT_SIGNED_IN();
    const digits = String(body.phone || "").replace(/[\s\-()+]/g, "");
    if (!/^\d{10,13}$/.test(digits)) return apiError(400, "Enter a Nigerian mobile number, e.g. 0803 123 4567.", "INVALID_PHONE");
    session.profilePatches[customer.uid] = { ...(session.profilePatches[customer.uid] ?? {}), phone: digits };
    return answer(200, { phone: digits });
  },

  "POST /api/account/delete": ({ req, session }) =>
    signedInCustomer(req, session) ? answer(200, { success: true }, [clearCookie("lodge_customer")]) : NOT_SIGNED_IN(),

  // ── Welcome codes (the giveaway) ──────────────────────────────────────────
  "GET /api/giveaways/poster/:token": ({ session, params }) => {
    const status = welcomeStatus(session);
    if (!status || params.token !== WELCOME.token) return WELCOME_NOT_FOUND();
    const open = status === "open";
    return answer(200, {
      hostel: WELCOME.hostel,
      status,
      gives: open ? WELCOME.gives : null,
      newAccountsOnly: session.scenario.giveaway !== "everyone",
      endsAt: open ? WELCOME.endsAt : null,
    });
  },

  "GET /api/giveaways/mine": ({ req, session }) => {
    const customer = signedInCustomer(req, session);
    if (!customer) return apiError(401, "Sign in to claim your welcome code.", "AUTH_REQUIRED");
    return answer(200, { claim: session.welcomeClaims[customer.uid] ?? null });
  },

  "POST /api/giveaways/claim": ({ req, session, body }) => {
    const customer = signedInCustomer(req, session);
    if (!customer) return apiError(401, "Sign in to claim your welcome code.", "AUTH_REQUIRED");
    // Asked twice: the same code.
    const mine = session.welcomeClaims[customer.uid];
    if (mine) return answer(200, { claim: mine, alreadyClaimed: true });

    const status = welcomeStatus(session);
    if (!status || body.token !== WELCOME.token) return WELCOME_NOT_FOUND();
    if (status === "out_of_codes") {
      return apiError(409, `All the welcome codes at ${WELCOME.hostel} have been claimed.`, "GIVEAWAY_OUT_OF_CODES");
    }
    if (status !== "open") return apiError(409, `The welcome codes at ${WELCOME.hostel} have ended.`, "GIVEAWAY_ENDED");
    if (!customer.emailVerified) {
      return apiError(403, "Confirm your email first, then come back for your welcome code.", "EMAIL_NOT_VERIFIED");
    }
    if (customer.hostelId !== WELCOME.hostel) {
      return apiError(
        403,
        `These welcome codes are for residents of ${WELCOME.hostel}. Your account belongs to ${customer.hostelId || "no hostel yet"}.`,
        "GIVEAWAY_WRONG_HOSTEL",
      );
    }
    // "New" here: an account made during the test, not one from the fixtures.
    if (session.scenario.giveaway !== "everyone" && !session.signups[customer.uid]) {
      return apiError(
        403,
        `These welcome codes are for new accounts at ${WELCOME.hostel}. Yours was made before they started.`,
        "GIVEAWAY_NEW_ACCOUNTS_ONLY",
      );
    }
    if (!customer.phone) {
      return apiError(400, "Add your phone number to your account, then claim your welcome code.", "PHONE_REQUIRED");
    }
    const claim = { code: WELCOME.code, gives: WELCOME.gives, hostel: WELCOME.hostel, claimedAt: new Date().toISOString() };
    session.welcomeClaims[customer.uid] = claim;
    return answer(200, { claim, alreadyClaimed: false });
  },

  "GET /api/tv/subscriptions": ({ req, session }) => {
    if (!signedInCustomer(req, session)) return NOT_SIGNED_IN();
    return answer(200, { subscriptions: session.scenario.tv === "returning" ? [CUSTOMERS.tvSubscription] : [] });
  },

  "POST /api/tv/check-device": () => answer(200, { allowed: true }),

  "POST /api/tv/purchase": ({ req, session, body }) => {
    if (!signedInCustomer(req, session)) return NOT_SIGNED_IN();
    if (!body.planId || !body.paymentRef) return apiError(400, "planId and paymentRef are required");
    // Paid, but the controller wouldn't take the TV: the customer is told
    // what happens next, in the server's words.
    return answer(200, {
      success: true,
      subscriptionId: "tv_0008",
      isNewUser: false,
      accessGranted: false,
      message: "We couldn't connect your TV just yet. Our team has been told and will finish it shortly.",
    });
  },

  // ── Wallet and bank transfer ──────────────────────────────────────────────
  "GET /api/wallet": ({ req, session }) => {
    const customer = signedInCustomer(req, session);
    return customer ? answer(200, walletOf(session, customer)) : NOT_SIGNED_IN();
  },

  "POST /api/wallet/dva": ({ req, session }) => {
    const customer = signedInCustomer(req, session);
    if (!customer) return NOT_SIGNED_IN();
    if (session.scenario.wallet === "dva-failed") {
      return apiError(503, "The bank couldn't open your account number just now.", "DVA_UNAVAILABLE");
    }
    session.dvaOpened = true;
    return answer(200, { dva: dvaOf(customer) });
  },

  "POST /api/wallet/pay": ({ req, session, body }) => {
    const customer = signedInCustomer(req, session);
    if (!customer) return NOT_SIGNED_IN();
    if (!walletIsOn(session)) return apiError(404, "The wallet isn't available.", "WALLET_OFF");
    const plan = planByKey(planKeyOf(body.planId));
    if (!plan) return apiError(404, "Plan not found");
    // Asking twice for the same held code buys it once (P4).
    const already = Object.values(session.orders).find((o) => o.reservationId === body.reservationId && o.paid);
    if (already) return answer(200, readyOrder(session, already));
    const amountKobo = plan.total * 100;
    if (session.walletBalanceKobo < amountKobo) {
      return apiError(402, "Your wallet doesn't have enough for this plan.", "WALLET_SHORT");
    }
    const order = newOrder(session, body, amountKobo);
    payOrder(session, order, plan);
    return answer(200, readyOrder(session, order));
  },

  "POST /api/checkout/dva": ({ req, session, body }) => {
    const customer = signedInCustomer(req, session);
    if (!customer) return NOT_SIGNED_IN();
    if (!walletIsOn(session)) return apiError(404, "The wallet isn't available.", "WALLET_OFF");
    if (session.scenario.wallet === "dva-failed") {
      return apiError(503, "Bank transfer isn't available right now. Please pay by card.", "DVA_UNAVAILABLE");
    }
    const plan = planByKey(planKeyOf(body.planId));
    if (!plan) return apiError(404, "Plan not found");
    const amountKobo = plan.total * 100;
    const order = newOrder(session, body, amountKobo);
    return answer(200, {
      status: "waiting",
      pendingId: order.pendingId,
      reservationId: order.reservationId,
      amountKobo,
      toTransferKobo: Math.max(amountKobo - session.walletBalanceKobo, 0),
      dva: dvaOf(customer),
    });
  },

  "POST /api/checkout/dva/status": ({ req, session, body }) => {
    if (!signedInCustomer(req, session)) return NOT_SIGNED_IN();
    const order = session.orders[body.pendingId];
    if (!order) return apiError(404, "Order not found");
    order.polls += 1;
    if (order.landed && !order.paid) {
      // The transfer tops the wallet up by what was missing, then the order
      // is paid from it, exactly as the real settle step does.
      const plan = planByKey(planKeyOf(order.planId));
      session.walletBalanceKobo = Math.max(session.walletBalanceKobo, order.amountKobo);
      payOrder(session, order, plan);
    }
    if (order.paid) return answer(200, readyOrder(session, order));
    return answer(200, {
      status: "waiting",
      pendingId: order.pendingId,
      toTransferKobo: Math.max(order.amountKobo - session.walletBalanceKobo, 0),
    });
  },

  // ── Blog and legal (also read by the Next server) ─────────────────────────
  "GET /api/blog": ({ session }) =>
    answer(200, {
      sections: BLOG.sections,
      posts: livePosts(session).map((post) => ({ ...summaryOf(post, session.reviews[post.slug]), cover: coverOf(session, post) })),
    }),

  "GET /api/blog/:slug": ({ session, params }) => {
    const post = livePosts(session).find((p) => p.slug === params.slug);
    if (!post) return apiError(404, "Post not found");
    return answer(200, { ...summaryOf(post, session.reviews[post.slug]), cover: coverOf(session, post), blocks: post.blocks });
  },

  "GET /api/blog/:slug/cover.svg": ({ session, params }) => {
    const post = livePosts(session).find((p) => p.slug === params.slug);
    if (!post || !coverOf(session, post)) return apiError(404, "There's no cover for that post.", "BLOG_COVER_NOT_FOUND");
    return { status: 200, body: post.coverSvg, cookies: [], contentType: "image/svg+xml" };
  },

  "GET /api/legal": () =>
    answer(200, { documents: LEGAL.documents.map(({ sections, ...summary }) => summary) }),

  "GET /api/legal/:slug": ({ params }) => {
    const doc = LEGAL.documents.find((d) => d.slug === params.slug);
    if (!doc) return apiError(404, "Page not found");
    return answer(200, { ...doc, company: LEGAL.company, contactEmail: LEGAL.contactEmail });
  },

  "POST /api/waitlist": ({ body }) =>
    body.email && body.whatsappPhone ? answer(200, { success: true }) : apiError(400, "Email and WhatsApp number are required"),

  // ── Admin sign-in and the blog review desk (superadmin only) ──────────────
  "POST /api/admin/login": ({ body }) => {
    const admin = ADMINS.admins[body.username];
    if (!admin || body.password !== ADMINS.password) return apiError(401, "Invalid credentials");
    return answer(200, adminSession(admin), [setCookie("lodge_admin", admin.username)]);
  },

  "POST /api/admin/refresh": ({ req }) => {
    const admin = signedInAdmin(req);
    return admin ? answer(200, adminSession(admin)) : apiError(401, "Your session has expired.");
  },

  "POST /api/admin/logout": () => answer(200, { success: true }, [clearCookie("lodge_admin")]),

  "GET /api/admin/blog": ({ req, session }) =>
    asSuperAdmin(req, () =>
      answer(200, {
        sections: BLOG.sections,
        posts: BLOG.posts.map((post) => reviewRow(session, post)),
        broken: BLOG.broken,
      }),
    ),

  "GET /api/admin/blog/:slug": ({ req, session, params }) =>
    asSuperAdmin(req, () => withPost(params.slug, (post) => answer(200, reviewPage(session, post)))),

  "PUT /api/admin/blog/:slug/draft": ({ req, session, params, body }) =>
    asSuperAdmin(req, () =>
      withPost(params.slug, (post) => {
        if (body.contentHash !== post.contentHash) return postChanged();
        if (!String(body.title || "").trim()) return apiError(400, "That edit can't be saved: the title is empty.", "BLOG_EDIT_INVALID");
        session.drafts[post.slug] = {
          title: String(body.title).trim(),
          summary: String(body.summary || "").trim(),
          body: String(body.body || "").replace(/^\n+|\n+$/g, ""),
        };
        return answer(200, reviewPage(session, post));
      }),
    ),

  "DELETE /api/admin/blog/:slug/draft": ({ req, session, params }) =>
    asSuperAdmin(req, () =>
      withPost(params.slug, (post) => {
        delete session.drafts[post.slug];
        return answer(200, reviewPage(session, post));
      }),
    ),

  "POST /api/admin/blog/:slug/approve": ({ req, session, params, body }) =>
    asSuperAdmin(req, (admin) =>
      withPost(params.slug, (post) => {
        if (body.contentHash !== post.contentHash) return postChanged();
        const page = reviewPage(session, post);
        if (page.problems.length > 0) {
          return apiError(422, `This can't go live yet: ${page.problems.join("; ")}.`, "BLOG_POST_BREAKS_RULES");
        }
        const review = session.reviews[post.slug];
        Object.assign(review, {
          status: "live",
          published: review.published ?? BLOG.today,
          updated: BLOG.today,
          reviewNote: null,
          reviewedBy: admin.username,
          reviewedAt: `${BLOG.today}T12:00:00+00:00`,
        });
        delete session.drafts[post.slug];
        return answer(200, reviewRow(session, post));
      }),
    ),

  "POST /api/admin/blog-covers/approve": ({ req, session }) =>
    asSuperAdmin(req, () => {
      const approved = BLOG.posts.filter((post) => coverOnly(session, post)).map((post) => post.slug);
      session.coversApproved = true;
      return answer(200, { approved, left: [] });
    }),

  "POST /api/admin/blog/:slug/reject": ({ req, session, params, body }) =>
    asSuperAdmin(req, (admin) =>
      withPost(params.slug, (post) => {
        if (body.contentHash !== post.contentHash) return postChanged();
        const note = String(body.note || "").trim();
        if (!note) return apiError(400, "Say what needs to change, so the post can be fixed.", "BLOG_NOTE_REQUIRED");
        Object.assign(session.reviews[post.slug], {
          status: "rejected",
          reviewNote: note,
          reviewedBy: admin.username,
          reviewedAt: `${BLOG.today}T12:00:00+00:00`,
        });
        return answer(200, reviewRow(session, post));
      }),
    ),

  "POST /api/admin/blog/:slug/unpublish": ({ req, session, params }) =>
    asSuperAdmin(req, (admin) =>
      withPost(params.slug, (post) => {
        Object.assign(session.reviews[post.slug], {
          status: "waiting",
          published: null,
          updated: null,
          reviewNote: "Taken off the blog",
          reviewedBy: admin.username,
          reviewedAt: `${BLOG.today}T12:00:00+00:00`,
        });
        return answer(200, reviewRow(session, post));
      }),
    ),
};

// ── Route helpers that need the tables above ────────────────────────────────

/** The code for this payment. The same payment reference always gets the same code (P4). */
function issueCode(session, body) {
  if (!session.claims[body.paymentRef]) {
    const plan = planByKey(planKeyOf(body.planId));
    session.claims[body.paymentRef] = {
      paymentRef: body.paymentRef,
      planId: body.planId,
      reservationId: body.reservationId ?? null,
      code: PLANS.codes[plan?.key] ?? "00000000",
    };
    const held = session.reservations[body.reservationId];
    if (held) held.claimed = true;
  }
  return session.claims[body.paymentRef].code;
}

function newOrder(session, body, amountKobo) {
  const pendingId = `ord_${String(++session.counter).padStart(4, "0")}`;
  session.orders[pendingId] = {
    pendingId,
    planId: body.planId,
    hostel: body.hostel,
    reservationId: body.reservationId ?? null,
    amountKobo,
    paid: false,
    landed: false,
    polls: 0,
  };
  return session.orders[pendingId];
}

function payOrder(session, order, plan) {
  session.walletBalanceKobo -= order.amountKobo;
  session.walletActivity = [
    { type: "wallet_spend", reference: `pending:${order.pendingId}`, changeKobo: -order.amountKobo, at: `${BLOG.today}T12:00:00Z`, metadata: { planName: plan.name } },
    ...session.walletActivity,
  ];
  order.paid = true;
  const held = session.reservations[order.reservationId];
  if (held) held.claimed = true;
}

function adminSession(admin) {
  return {
    success: true,
    expiresAt: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    username: admin.username,
    isSuperAdmin: admin.isSuperAdmin,
    modulePermissions: admin.modulePermissions,
    hostels: admin.hostels,
    isPartner: false,
    partnerSplitPercent: 0,
    partnerSplitMode: "whole",
    partnerHostelSplits: {},
  };
}

function asSuperAdmin(req, then) {
  const admin = signedInAdmin(req);
  if (!admin) return apiError(401, "Your session has expired. Please sign in again.");
  if (!admin.isSuperAdmin) return apiError(403, "This action requires super-admin access.", "super_admin_required");
  return then(admin);
}

function withPost(slug, then) {
  const post = BLOG.posts.find((p) => p.slug === slug);
  return post ? then(post) : apiError(404, "Post not found");
}

function postChanged() {
  return apiError(409, "This post changed while you had it open. Read it again before deciding.", "BLOG_POST_CHANGED");
}

// ── Matching a request to a route ───────────────────────────────────────────

const compiled = Object.entries(routes).map(([key, handler]) => {
  const [method, path] = key.split(" ");
  const names = [];
  const pattern = path.replace(/:[a-zA-Z]+/g, (name) => {
    names.push(name.slice(1));
    return "([^/]+)";
  });
  return { key, method, regex: new RegExp(`^${pattern}$`), names, handler };
});

function findRoute(method, pathname) {
  for (const route of compiled) {
    if (route.method !== method) continue;
    const match = pathname.match(route.regex);
    if (!match) continue;
    const params = Object.fromEntries(route.names.map((name, i) => [name, decodeURIComponent(match[i + 1])]));
    return { ...route, params };
  }
  return null;
}

// ── Control routes (called by the tests, never by the website) ──────────────

async function control(req, res, url) {
  const send = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (url.pathname === "/__health") return send(200, { ok: true });

  if (url.pathname === "/__state" && req.method === "GET") {
    const session = sessionOf(url.searchParams.get("session") || "server");
    return send(200, {
      scenario: session.scenario,
      reservations: Object.values(session.reservations),
      claims: Object.values(session.claims),
      orders: Object.values(session.orders),
      walletBalanceKobo: session.walletBalanceKobo,
      heldRoutes: session.held.map((h) => h.route),
      log: session.log,
    });
  }

  const body = await bodyOf(req);
  const id = body.session || "server";

  if (url.pathname === "/__scenario" && req.method === "POST") {
    const { session: _ignored, ...knobs } = body;
    const unknown = Object.keys(knobs).filter((knob) => !(knob in DEFAULT_SCENARIO));
    if (unknown.length) return send(400, { error: `Unknown scenario knob(s): ${unknown.join(", ")}` });
    // Anything a previous scenario left waiting is let go, so no browser
    // request hangs on a world that no longer exists.
    for (const waiting of sessions.get(id)?.held ?? []) waiting.resume();
    sessions.set(id, freshSession(knobs));
    return send(200, { scenario: sessions.get(id).scenario });
  }

  if (url.pathname === "/__release" && req.method === "POST") {
    const session = sessionOf(id);
    const going = session.held.filter((h) => !body.route || h.route === body.route);
    session.held = session.held.filter((h) => !going.includes(h));
    // The route stops being held, so the page's later calls go straight through.
    session.scenario.hold = body.route ? session.scenario.hold.filter((r) => r !== body.route) : [];
    for (const waiting of going) waiting.resume();
    return send(200, { released: going.length });
  }

  if (url.pathname === "/__transfer-landed" && req.method === "POST") {
    const session = sessionOf(id);
    const waiting = Object.values(session.orders).filter((order) => !order.paid);
    for (const order of waiting) order.landed = true;
    return send(200, { landed: waiting.length });
  }

  return send(404, { error: "Unknown control route" });
}

// ── The server ──────────────────────────────────────────────────────────────

function corsHeaders(req) {
  // Cookies cross from the site to the API, so the origin has to be named
  // exactly (never "*") and credentials allowed.
  if (req.headers.origin !== SITE_ORIGIN) return {};
  return {
    "Access-Control-Allow-Origin": SITE_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, X-Lodge-Client",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith("/__")) return control(req, res, url);

  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    return res.end();
  }

  const sessionId = cookiesOf(req).e2e_session || "server";
  const session = sessionOf(sessionId);
  const body = req.method === "GET" ? {} : await bodyOf(req);
  const route = findRoute(req.method, url.pathname);
  const routeKey = route ? route.key : `${req.method} ${url.pathname}`;

  session.log.push({ method: req.method, path: url.pathname, query: url.search, body, client: req.headers["x-lodge-client"] ?? null });
  if (session.log.length > 500) session.log.shift();

  // Held: the answer waits until the test says go (to look at loading states).
  if (session.scenario.hold.includes(routeKey)) {
    await new Promise((resume) => session.held.push({ route: routeKey, resume }));
  }

  // Broken on purpose: an error status, or the connection cut.
  const broken = session.scenario.fail.find((f) => f.route === routeKey);
  if (broken) {
    const seen = (session.failCounts[routeKey] = (session.failCounts[routeKey] ?? 0) + 1);
    if (broken.times === undefined || seen <= broken.times) {
      if (broken.drop) return req.socket.destroy();
      res.writeHead(broken.status ?? 500, { "Content-Type": "application/json", ...cors });
      return res.end(JSON.stringify({ error: "Something went wrong on our side. Please try again." }));
    }
  }

  let result;
  if (!route) {
    // A route the website calls that this stand-in doesn't know: say so
    // loudly, so a new API call gets a fixture instead of a silent 404.
    console.warn(`[mock-api] no route for ${routeKey}`);
    result = apiError(404, "Not found");
  } else {
    try {
      result = route.handler({ req, session, query: url.searchParams, body, params: route.params });
    } catch (error) {
      console.error(`[mock-api] ${routeKey} threw`, error);
      result = apiError(500, "The stand-in API broke on this route.");
    }
  }

  res.writeHead(result.status, {
    "Content-Type": result.contentType ?? "application/json",
    "Cache-Control": "no-store",
    ...(result.cookies.length ? { "Set-Cookie": result.cookies } : {}),
    ...cors,
  });
  // Everything is JSON except a blog cover, which is the SVG itself.
  res.end(result.contentType ? result.body : JSON.stringify(result.body));
});

// No host given: listens on IPv4 and IPv6, since "localhost" can mean either
// to the browser and to the Next server.
server.listen(PORT, () => {
  console.log(`[mock-api] listening on http://localhost:${PORT} (site origin ${SITE_ORIGIN})`);
});
