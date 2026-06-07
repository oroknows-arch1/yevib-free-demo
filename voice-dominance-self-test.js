const assert = require("assert");
const {
  detectGovernanceLanguage,
  validatePostsAgainstGovernanceLanguage,
  buildSafeFallbackPosts,
} = require("./server.js");

const LEGACY_BAD_POSTS = [
  "A business does not always need a bigger claim to make better content. Sometimes the strongest move is to explain one simple thing clearly, stay useful, and let people understand the value without forcing the message.\n\n#YEVIB #SmallBusiness #Content",
  "When the source material is limited, the safer move is to keep the post educational instead of pretending there is proof that is not there. Clear, honest content still gives people something useful to connect with.\n\n#YEVIB #BusinessTrust #Marketing",
  "Good content should not outrun what the business has actually shown. If the scan cannot safely support a specific claim, YEVIB should keep the message grounded, simple, and review-ready.\n\n#YEVIB #OwnerVoice #ReviewBeforeUse",
];

const OWNER_INPUT =
  "I started this plumbing business because people were tired of vague quotes and no-shows. We show up, explain the job plainly, and do the work properly.";

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

runTest("legacy bad post 1 fails governance detection", () => {
  const result = detectGovernanceLanguage(LEGACY_BAD_POSTS[0]);
  assert.strictEqual(result.failed, true);
  assert.ok(result.reasons.length > 0);
});

runTest("legacy bad post 2 fails governance detection", () => {
  const result = detectGovernanceLanguage(LEGACY_BAD_POSTS[1]);
  assert.strictEqual(result.failed, true);
  assert.ok(result.reasons.length > 0);
});

runTest("legacy bad post 3 fails governance detection", () => {
  const result = detectGovernanceLanguage(LEGACY_BAD_POSTS[2]);
  assert.strictEqual(result.failed, true);
  assert.ok(result.reasons.length > 0);
});

runTest("legacy bad batch fails governance validation", () => {
  const result = validatePostsAgainstGovernanceLanguage(LEGACY_BAD_POSTS);
  assert.strictEqual(result.failed, true);
  assert.ok(result.reasons.length >= 3);
});

runTest("new fallback returns exactly 3 owner-voiced posts", () => {
  const posts = buildSafeFallbackPosts({
    category: "Standards and Care",
    businessName: "Clear Flow Plumbing",
    manualVoiceInput: OWNER_INPUT,
    voiceProfile: {
      tone: ["direct", "plain-spoken"],
      vocabulary: ["show up", "explain plainly"],
    },
    businessSummary:
      "Local plumbing service focused on clear quotes and reliable attendance.",
    offers: ["emergency callouts", "bathroom repairs"],
  });

  assert.strictEqual(posts.length, 3);

  const combined = posts.join("\n");
  const governance = validatePostsAgainstGovernanceLanguage(posts);

  assert.strictEqual(governance.failed, false, governance.reasons.join("; "));
  assert.ok(!/yevib/i.test(combined), "fallback must not mention YEVIB");
  assert.ok(/(?:\bI\b|\bwe\b|\bour\b)/i.test(combined), "fallback must use owner-style first-person language");
  posts.forEach((post) => {
    assert.ok(!/#YEVIB\b/i.test(post), "fallback must not use #YEVIB");
  });
});

if (failures > 0) {
  console.error(`\nVoice dominance self-test failed (${failures} failure(s)).`);
  process.exit(1);
}

console.log("\nVoice dominance self-test passed.");
