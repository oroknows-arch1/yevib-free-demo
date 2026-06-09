#!/usr/bin/env node
/**
 * YEVIB business observation harness — logging only, no generation fixes.
 *
 * Usage:
 *   npm run test:businesses
 *   npm run test:businesses -- --input test-data/my-tests.json
 *   npm run test:businesses -- --base-url http://localhost:3000
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { detectOwnerSampleContentLeakage } = require("./server.js");

const ROOT = __dirname;
const DEFAULT_INPUT = path.join(ROOT, "test-data", "sample-business-tests.json");
const RESULTS_DIR = path.join(ROOT, "test-results");
const RESULTS_JSON = path.join(RESULTS_DIR, "yevib-business-test-results.json");
const RESULTS_CSV = path.join(RESULTS_DIR, "yevib-business-test-results.csv");
const DEFAULT_BASE_URL = process.env.YEVIB_TEST_BASE_URL || "http://127.0.0.1:3000";
const SERVER_START_TIMEOUT_MS = 45000;
const REQUEST_TIMEOUT_MS = Number(process.env.YEVIB_TEST_REQUEST_TIMEOUT_MS || 180000);

function parseArgs(argv = []) {
  const args = {
    input: DEFAULT_INPUT,
    baseUrl: DEFAULT_BASE_URL,
    noSpawn: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" && argv[i + 1]) {
      args.input = path.resolve(argv[i + 1]);
      i += 1;
    } else if (arg === "--base-url" && argv[i + 1]) {
      args.baseUrl = argv[i + 1].replace(/\/$/, "");
      i += 1;
    } else if (arg === "--no-spawn") {
      args.noSpawn = true;
    }
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isServerUp(baseUrl) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${baseUrl}/`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

async function waitForServer(baseUrl, timeoutMs = SERVER_START_TIMEOUT_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isServerUp(baseUrl)) return true;
    await sleep(1000);
  }
  return false;
}

function startLocalServer(baseUrl) {
  const port = new URL(baseUrl).port || "3000";
  const child = spawn("node", ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      YEVIB_BUSINESS_TEST_HARNESS: "1",
      PORT: port,
      DAILY_AI_CALL_LIMIT: process.env.DAILY_AI_CALL_LIMIT || "100",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[server] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[server] ${chunk}`);
  });

  return child;
}

async function postJson(baseUrl, route, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function getRecommendedMove() {
  return "Create one clear post from the website and owner voice.";
}

function parseGeneratedPosts(text = "") {
  return String(text || "")
    .split(/\n{2,}/)
    .map((item) => item.replace(/^Post\s*\d+[:.)-]?\s*/i, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function emptyManualReview() {
  return {
    usable: null,
    contentLeakage: null,
    unsupportedClaim: null,
    genericAiVoice: null,
    wrongBusinessCategory: null,
    notes: "",
  };
}

function loadPreviousManualReviews() {
  if (!fs.existsSync(RESULTS_JSON)) return {};

  try {
    const previous = JSON.parse(fs.readFileSync(RESULTS_JSON, "utf8"));
    const map = {};

    for (const test of previous.tests || []) {
      if (!test.businessName) continue;
      map[test.businessName] = test.manualReview || emptyManualReview();
    }

    return map;
  } catch {
    return {};
  }
}

function extractProfileSignals(profile = {}) {
  return {
    businessName: profile?.businessProfile?.name || "",
    businessSummary: profile?.businessProfile?.summary || "",
    selectedContentLane: profile?.contentProfile?.suggestedCategory || "",
    suggestedIdea: profile?.contentProfile?.suggestedIdea || "",
    sourceConfidence: profile?.discoveryProfile?.sourceConfidence || "",
    claimSafety: profile?.ubdgEvidencePacket?.strengthSummary?.safeClaimLevel || "",
    evidenceState: profile?.ubdgEvidencePacket?.strengthSummary?.evidenceState || "",
    recommendedFocus:
      profile?.groupedSnapshot?.recommendedFocus ||
      profile?.advisorSnapshot?.recommendedFocus ||
      "",
    intelligenceRead: profile?.intelligenceRead || "",
    weakVoiceSource: Boolean(profile?.sourceProfile?.weakVoiceSource),
    pagesScanned: profile?.debug?.pagesScanned || 0,
  };
}

async function runSingleBusinessTest(baseUrl, testCase = {}) {
  const {
    businessName = "Unknown Business",
    businessUrl = "",
    founderGoal = "",
    ownerVoiceSample = "",
    misunderstandingOrContext = "",
  } = testCase;

  const ownerTruth = String(ownerVoiceSample || "").trim();
  const startedAt = new Date().toISOString();
  const result = {
    businessName,
    businessUrl,
    founderGoal,
    ownerVoiceSample: ownerTruth,
    misunderstandingOrContext,
    timestamp: startedAt,
    status: "pending",
    error: null,
    profile: null,
    generatedPosts: [],
    postClass: "",
    postType: "",
    selectedContentLane: "",
    sourceConfidence: "",
    claimSafety: "",
    autoObservation: {
      ownerSampleLeakageDetected: false,
      ownerSampleLeakageReasons: [],
    },
    manualReview: emptyManualReview(),
  };

  if (!businessUrl) {
    result.status = "error";
    result.error = "businessUrl is required";
    return result;
  }

  try {
    const profileRes = await postJson(baseUrl, "/build-profile", {
      mode: "hybrid",
      businessUrl,
      pastedSourceText: ownerTruth,
      manualBusinessContext: ownerTruth,
      founderGoal,
      ownerWritingSample: ownerTruth,
    });

    if (!profileRes.ok) {
      result.status = "error";
      result.error = profileRes.data?.error || `build-profile failed (${profileRes.status})`;
      return result;
    }

    const profile = profileRes.data?.profile || {};
    const profileSignals = extractProfileSignals(profile);

    result.profile = profileSignals;
    result.selectedContentLane = profileSignals.selectedContentLane;
    result.sourceConfidence = profileSignals.sourceConfidence;
    result.claimSafety = profileSignals.claimSafety;

    const generateRes = await postJson(baseUrl, "/generate", {
      mode: "execution",
      idea: getRecommendedMove(profile),
      category: profile?.contentProfile?.suggestedCategory || "Product in Real Life",
      businessUrl,
      pastedSourceText: ownerTruth,
      manualBusinessContext: ownerTruth,
      businessName: profileSignals.businessName || businessName,
      businessSummary: profileSignals.businessSummary || "",
      manualVoiceInput: ownerTruth,
      voiceProfile: profile?.founderVoice || null,
      initialProfile: profile,
      quickType: "Business",
      ownerNudge: founderGoal,
      founderGoal,
      weeklyPosts: [
        profile?.executionPlan?.summary || "",
        ...(profile?.executionPlan?.actions || []),
      ]
        .filter(Boolean)
        .join("\n"),
    });

    if (!generateRes.ok) {
      result.status = "error";
      result.error = generateRes.data?.error || `generate failed (${generateRes.status})`;
      return result;
    }

    const posts = parseGeneratedPosts(generateRes.data?.text || "");
    result.generatedPosts = posts;
    result.postClass = generateRes.data?.postClass || "";
    result.postType = generateRes.data?.postType || "";
    result.status = posts.length >= 3 ? "completed" : "error";
    result.error = posts.length >= 3 ? null : "Model did not return 3 posts";

    if (ownerTruth && posts.length) {
      const leakage = detectOwnerSampleContentLeakage(posts, ownerTruth);
      result.autoObservation.ownerSampleLeakageDetected = leakage.failed;
      result.autoObservation.ownerSampleLeakageReasons = leakage.reasons;
    }
  } catch (err) {
    result.status = "error";
    result.error = err?.name === "AbortError" ? "Request timed out" : err?.message || "Unknown error";
  }

  return result;
}

function buildSummary(tests = []) {
  const summary = {
    totalTests: tests.length,
    completed: tests.filter((test) => test.status === "completed").length,
    errors: tests.filter((test) => test.status === "error").length,
    manualReviewCounts: {
      usableYes: 0,
      usableNo: 0,
      contentLeakageYes: 0,
      contentLeakageNo: 0,
      unsupportedClaimYes: 0,
      unsupportedClaimNo: 0,
      genericAiVoiceYes: 0,
      genericAiVoiceNo: 0,
      wrongBusinessCategoryYes: 0,
      wrongBusinessCategoryNo: 0,
      reviewed: 0,
      unreviewed: 0,
    },
    autoObservationCounts: {
      ownerSampleLeakageDetected: tests.filter(
        (test) => test.autoObservation?.ownerSampleLeakageDetected
      ).length,
    },
    commonFailureNotes: [],
  };

  const noteCounts = {};

  for (const test of tests) {
    const review = test.manualReview || emptyManualReview();
    const reviewed = Object.values(review).some((value) => value !== null && value !== "");

    if (reviewed) summary.manualReviewCounts.reviewed += 1;
    else summary.manualReviewCounts.unreviewed += 1;

    if (review.usable === true) summary.manualReviewCounts.usableYes += 1;
    if (review.usable === false) summary.manualReviewCounts.usableNo += 1;
    if (review.contentLeakage === true) summary.manualReviewCounts.contentLeakageYes += 1;
    if (review.contentLeakage === false) summary.manualReviewCounts.contentLeakageNo += 1;
    if (review.unsupportedClaim === true) summary.manualReviewCounts.unsupportedClaimYes += 1;
    if (review.unsupportedClaim === false) summary.manualReviewCounts.unsupportedClaimNo += 1;
    if (review.genericAiVoice === true) summary.manualReviewCounts.genericAiVoiceYes += 1;
    if (review.genericAiVoice === false) summary.manualReviewCounts.genericAiVoiceNo += 1;
    if (review.wrongBusinessCategory === true) {
      summary.manualReviewCounts.wrongBusinessCategoryYes += 1;
    }
    if (review.wrongBusinessCategory === false) {
      summary.manualReviewCounts.wrongBusinessCategoryNo += 1;
    }

    if (review.notes) {
      const key = review.notes.trim().toLowerCase();
      noteCounts[key] = (noteCounts[key] || 0) + 1;
    }
  }

  summary.commonFailureNotes = Object.entries(noteCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([note, count]) => ({ note, count }));

  return summary;
}

function csvEscape(value = "") {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

function writeCsv(filePath, payload) {
  const headers = [
    "businessName",
    "businessUrl",
    "timestamp",
    "status",
    "selectedContentLane",
    "sourceConfidence",
    "claimSafety",
    "error",
    "autoOwnerSampleLeakage",
    "usable",
    "contentLeakage",
    "unsupportedClaim",
    "genericAiVoice",
    "wrongBusinessCategory",
    "notes",
    "generatedPosts",
  ];

  const rows = (payload.tests || []).map((test) => [
    test.businessName,
    test.businessUrl,
    test.timestamp,
    test.status,
    test.selectedContentLane,
    test.sourceConfidence,
    test.claimSafety,
    test.error || "",
    test.autoObservation?.ownerSampleLeakageDetected ? "yes" : "no",
    test.manualReview?.usable ?? "",
    test.manualReview?.contentLeakage ?? "",
    test.manualReview?.unsupportedClaim ?? "",
    test.manualReview?.genericAiVoice ?? "",
    test.manualReview?.wrongBusinessCategory ?? "",
    test.manualReview?.notes || "",
    (test.generatedPosts || []).join(" || "),
  ]);

  const csv = [headers.join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\n");
  fs.writeFileSync(filePath, csv, "utf8");
}

function printTerminalSummary(payload) {
  console.log("\n========================================");
  console.log("YEVIB BUSINESS TEST HARNESS — RUN COMPLETE");
  console.log("========================================");
  console.log(`Run at:          ${payload.generatedAt}`);
  console.log(`Input file:      ${payload.inputFile}`);
  console.log(`Total tests:     ${payload.summary.totalTests}`);
  console.log(`Completed:       ${payload.summary.completed}`);
  console.log(`Errors:          ${payload.summary.errors}`);
  console.log(`Auto leakage:    ${payload.summary.autoObservationCounts.ownerSampleLeakageDetected}`);
  console.log(`Manual reviewed: ${payload.summary.manualReviewCounts.reviewed}`);
  console.log(`Manual pending:  ${payload.summary.manualReviewCounts.unreviewed}`);
  console.log("\nResults saved:");
  console.log(`  JSON: ${RESULTS_JSON}`);
  console.log(`  CSV:  ${RESULTS_CSV}`);
  console.log("\nNext step:");
  console.log("  Open the JSON file and fill manualReview for each business.");
  console.log("  Re-run to refresh outputs while keeping your manualReview notes.");
  console.log("========================================\n");

  for (const test of payload.tests) {
    const statusLabel = test.status === "completed" ? "OK" : "ERR";
    const leakage = test.autoObservation?.ownerSampleLeakageDetected ? " leakage:auto" : "";
    console.log(`[${statusLabel}] ${test.businessName}${leakage}${test.error ? ` — ${test.error}` : ""}`);
  }
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY. Add it to .env before running business tests.");
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.input)) {
    console.error(`Input file not found: ${args.input}`);
    process.exit(1);
  }

  const inputPayload = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const testCases = Array.isArray(inputPayload.tests) ? inputPayload.tests : [];

  if (!testCases.length) {
    console.error("No tests found in input file.");
    process.exit(1);
  }

  let spawnedServer = null;
  let serverWasRunning = await isServerUp(args.baseUrl);

  if (!serverWasRunning && !args.noSpawn) {
    console.log(`Starting local server at ${args.baseUrl} ...`);
    spawnedServer = startLocalServer(args.baseUrl);
    serverWasRunning = await waitForServer(args.baseUrl);
  }

  if (!serverWasRunning) {
    console.error(
      `Server not reachable at ${args.baseUrl}. Start it with "npm start" or rerun without --no-spawn.`
    );
    if (spawnedServer) spawnedServer.kill("SIGTERM");
    process.exit(1);
  }

  const previousReviews = loadPreviousManualReviews();
  const tests = [];

  console.log(`Running ${testCases.length} business test(s) against ${args.baseUrl} ...`);

  for (let i = 0; i < testCases.length; i += 1) {
    const testCase = testCases[i];
    console.log(`\n[${i + 1}/${testCases.length}] ${testCase.businessName || "Unnamed business"}`);
    const result = await runSingleBusinessTest(args.baseUrl, testCase);
    result.manualReview =
      previousReviews[result.businessName] || result.manualReview || emptyManualReview();
    tests.push(result);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    inputFile: args.input,
    baseUrl: args.baseUrl,
    summary: buildSummary(tests),
    tests,
  };

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(RESULTS_JSON, JSON.stringify(payload, null, 2), "utf8");
  writeCsv(RESULTS_CSV, payload);
  printTerminalSummary(payload);

  if (spawnedServer) {
    spawnedServer.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error("Business test harness failed:", err);
  process.exit(1);
});
