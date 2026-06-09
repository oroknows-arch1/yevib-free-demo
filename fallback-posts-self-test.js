const assert = require("assert");
const {
  buildSafeFallbackPosts,
  validatePostsAgainstGovernanceLanguage,
  detectOwnerSampleContentLeakage,
} = require("./server.js");

const BANNED_FALLBACK_PHRASES = [
  "mate-to-mate",
  "plain talk matters",
  "routines people lean on",
  "talk it through plainly",
  "promise something we cannot stand behind",
  "on your mind",
  "practical value at",
  "day-to-day focus",
  "keeps the message clear",
  "practical focus at",
  "keeps its focus on useful information",
];

const STYLE_ONLY_OWNER_SAMPLE =
  "How ya going bro, we keep it sharp, simple and make sure people walk out feeling good.";

let failures = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL: ${name}`);
    console.error(err.message);
  }
}

function postBodies(posts = []) {
  return posts.map((post) => post.replace(/\n?#\w+(?:\s+#\w+)*/g, "").trim());
}

function assertNoBannedFallbackPhrases(posts, label = "fallback") {
  const combined = posts.join("\n").toLowerCase();
  for (const phrase of BANNED_FALLBACK_PHRASES) {
    assert.ok(
      !combined.includes(phrase),
      `${label} must not contain banned fallback phrase: "${phrase}"`
    );
  }
}

function buildCase(config) {
  return buildSafeFallbackPosts(config);
}

runTest("barber fallback sounds like barbering not generic counselling", () => {
  const posts = postBodies(
    buildCase({
      category: "Everyday Ritual",
      businessName: "UPTOWN Barbers",
      manualVoiceInput: STYLE_ONLY_OWNER_SAMPLE,
      businessSummary:
        "UPTOWN Barbers is a premium barbershop located in Sydney CBD, specialising in expert haircuts, precision fades, and beard shaping.",
      offers: ["haircuts", "beard shaping"],
    })
  );

  assert.strictEqual(posts.length, 3);
  assertNoBannedFallbackPhrases(posts);

  const combined = posts.join("\n").toLowerCase();
  assert.ok(/barber|haircut|fade|beard|groom/i.test(combined));
  assert.ok(!/counsell|therapy|mental health/i.test(combined));
  assert.ok(/book|client|appointment|specialis/i.test(combined));
});

runTest("childcare fallback sounds like childcare not barbering", () => {
  const posts = postBodies(
    buildCase({
      category: "Everyday Ritual",
      businessName: "Kindalin",
      manualVoiceInput: "Hey mate. Been a while.",
      businessSummary:
        "Kindalin supports families through early childhood learning across its centres.",
      offers: ["early childhood learning", "day care"],
    })
  );

  assert.strictEqual(posts.length, 3);
  assertNoBannedFallbackPhrases(posts);

  const combined = posts.join("\n").toLowerCase();
  assert.ok(/child|famil|learning|centre|day care/i.test(combined));
  assert.ok(!/haircut|fade|beard/i.test(combined));
});

runTest("plumbing fallback sounds like plumbing and keeps owner opener", () => {
  const posts = postBodies(
    buildCase({
      category: "Standards and Care",
      businessName: "Clear Flow Plumbing",
      manualVoiceInput:
        "I started this plumbing business because people were tired of vague quotes and no-shows. We show up, explain the job plainly, and do the work properly.",
      businessSummary:
        "Local plumbing service focused on clear quotes and reliable attendance.",
      offers: ["emergency callouts", "bathroom repairs"],
    })
  );

  assert.strictEqual(posts.length, 3);
  assertNoBannedFallbackPhrases(posts);

  const combined = posts.join("\n");
  assert.ok(/(?:\bI\b|\bwe\b)/i.test(combined));
  assert.ok(/plumb|callout|repair|quote|homeowner/i.test(combined.toLowerCase()));
});

runTest("vet fallback sounds like veterinary care", () => {
  const posts = postBodies(
    buildCase({
      category: "Everyday Ritual",
      businessName: "Chatswood Veterinary Clinic",
      manualVoiceInput: "Hey mate, most people just want it explained properly.",
      businessSummary:
        "Chatswood Veterinary Clinic is a locally owned veterinary practice providing a full range of veterinary services in a warm and caring environment.",
      offers: ["routine checkups", "dental care"],
    })
  );

  assert.strictEqual(posts.length, 3);
  assertNoBannedFallbackPhrases(posts);

  const combined = posts.join("\n").toLowerCase();
  assert.ok(/vet|pet|checkup|dental/i.test(combined));
  assert.ok(!/haircut|childhood|plumb/i.test(combined));
});

runTest("different business types do not share one reusable fallback scaffold", () => {
  const barber = postBodies(
    buildCase({
      category: "Everyday Ritual",
      businessName: "UPTOWN Barbers",
      businessSummary:
        "UPTOWN Barbers is a premium barbershop located in Sydney CBD, specialising in expert haircuts, precision fades, and beard shaping.",
      offers: ["haircuts", "beard shaping"],
    })
  )[1];
  const childcare = postBodies(
    buildCase({
      category: "Everyday Ritual",
      businessName: "Kindalin",
      businessSummary:
        "Kindalin supports families through early childhood learning across its centres.",
      offers: ["early childhood learning", "day care"],
    })
  )[1];
  const plumbing = postBodies(
    buildCase({
      category: "Standards and Care",
      businessName: "Clear Flow Plumbing",
      businessSummary: "Local plumbing service focused on clear quotes and reliable attendance.",
      offers: ["emergency callouts", "bathroom repairs"],
    })
  )[1];

  assert.notStrictEqual(barber, childcare);
  assert.notStrictEqual(barber, plumbing);
  assert.notStrictEqual(childcare, plumbing);
});

runTest("weak-evidence fallback stays short and evidence-only", () => {
  const posts = postBodies(
    buildCase({
      category: "Everyday Ritual",
      businessName: "Local Example Co",
      manualVoiceInput: STYLE_ONLY_OWNER_SAMPLE,
      businessSummary: "",
      offers: [],
    })
  );

  assert.strictEqual(posts.length, 3);
  assertNoBannedFallbackPhrases(posts);
  posts.forEach((post) => {
    assert.ok(post.length <= 180, `weak-evidence fallback should stay short: "${post}"`);
  });
});

runTest("fallback posts pass governance and owner-sample leakage checks", () => {
  const ownerSample =
    "Hey mate. Been a while. You been good, family all good? How's the workouts going? Still pumping the burpees? Need to catch up soon aye bro. Try again later.";

  const posts = buildCase({
    category: "Product in Real Life",
    businessName: "PremiumSupps",
    manualVoiceInput: ownerSample,
    businessSummary: "Premium supplement retailer focused on quality and recovery.",
    offers: ["protein", "recovery supplements"],
  });

  const governance = validatePostsAgainstGovernanceLanguage(posts);
  assert.strictEqual(governance.failed, false, governance.reasons.join("; "));

  const leakage = detectOwnerSampleContentLeakage(posts, ownerSample);
  assert.strictEqual(leakage.failed, false, leakage.reasons.join("; "));
  assertNoBannedFallbackPhrases(posts);
});

if (failures > 0) {
  console.error(`\nFallback posts self-test failed (${failures} failure(s)).`);
  process.exit(1);
}

console.log("\nFallback posts self-test passed.");
