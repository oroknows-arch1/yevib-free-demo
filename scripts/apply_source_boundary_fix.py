from pathlib import Path
import re


def sub_once(path, pattern, repl, label, flags=re.S):
    p = Path(path)
    text = p.read_text()
    new_text, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    p.write_text(new_text)


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 exact match, found {count}")
    p.write_text(text.replace(old, new, 1))


server = Path("server.js")

# ---------------------------------------------------------------------------
# 1. SOURCE ROLE: ownerWritingSample is the sole writing-style authority.
# ---------------------------------------------------------------------------
sub_once(
    server,
    r"function chooseVoiceSourceText\(\{.*?\n\}\n\nfunction isWeakVoiceSource",
    '''function chooseVoiceSourceText({ ownerWritingSample }) {
  return clipText(ownerWritingSample || "", 3000);
}

function isWeakVoiceSource''',
    "replace chooseVoiceSourceText",
)

sub_once(
    server,
    r'''const safeVoiceSourceText\s*=\s*chooseVoiceSourceText\(\{\s*mode,\s*founderText,\s*customerText,\s*productText,\s*pastedSourceText,\s*manualBusinessContext,\s*sourceProfileSummary:\s*sourceProfile\?\.businessProfile\?\.summary\s*\|\|\s*"",\s*\}\);''',
    '''const safeVoiceSourceText = chooseVoiceSourceText({
    ownerWritingSample,
  });''',
    "wire ownerWritingSample into voice source",
)

sub_once(
    server,
    r'''const voiceAgentInput\s*=\s*\[\s*clipText\(safeVoiceSourceText\s*\|\|\s*founderSourceInput\s*\|\|\s*"",\s*5000\),\s*ownerStylePromptBlock,\s*\]\s*\.filter\(Boolean\)\s*\.join\("\\n\\n"\);\s*const safeFounderVoice\s*=\s*await runJsonChat\(voiceAgentPrompt\(voiceAgentInput\)\);''',
    '''const voiceAgentInput = [
    clipText(safeVoiceSourceText || "", 5000),
    ownerStylePromptBlock,
  ]
    .filter(Boolean)
    .join("\\n\\n");

  const voiceAgentSource =
    voiceAgentInput ||
    "No owner writing sample supplied. Return a neutral, clear, practical small-business voice profile. Do not infer writing style from website content.";

  const safeFounderVoice = await runJsonChat(voiceAgentPrompt(voiceAgentSource));''',
    "remove website fallback from voice agent",
)

sub_once(
    server,
    r'''voiceSourceLane:\s*mode\s*===\s*"manual"\s*\?\s*"manual"\s*:\s*safeVoiceSourceText\s*===\s*founderText\s*\?\s*"founder"\s*:\s*safeVoiceSourceText\s*===\s*pastedSourceText\s*\?\s*"pasted"\s*:\s*safeVoiceSourceText\s*===\s*manualBusinessContext\s*\?\s*"manual"\s*:\s*"fallback",\s*weakVoiceSource:\s*isWeakVoiceSource\(safeVoiceSourceText\),''',
    '''voiceSourceLane: safeVoiceSourceText ? "owner_sample" : "neutral_fallback",
      weakVoiceSource: !safeVoiceSourceText || isWeakVoiceSource(safeVoiceSourceText),''',
    "replace source lane classification",
)

sub_once(
    server,
    r'''manualContextUsed:\s*Boolean\(manualBusinessContext\),''',
    '''manualContextUsed: Boolean(manualBusinessContext),
      ownerWritingSampleUsed: Boolean(ownerWritingSample),''',
    "record owner writing sample usage",
)

sub_once(
    server,
    r'''const hasSuppliedOwnerWriting\s*=\s*Boolean\(\s*sourceProfile\?\.pastedTextUsed\s*\|\|\s*sourceProfile\?\.manualContextUsed\s*\);''',
    '''const hasSuppliedOwnerWriting = Boolean(
    sourceProfile?.ownerWritingSampleUsed ||
    sourceProfile?.pastedTextUsed ||
    sourceProfile?.manualContextUsed
  );''',
    "count ownerWritingSample as owner evidence",
)

# ---------------------------------------------------------------------------
# 2. WEBSITE ROLE: facts only; deterministic fallback cannot emit raw summary.
# ---------------------------------------------------------------------------
sub_once(
    server,
    r'''summaryLine:\s*summary\s*\?\s*clipText\(summary,\s*220\)\s*:\s*"",''',
    '''summaryLine: "",''',
    "remove raw summary line from fallback",
)

sub_once(
    server,
    r'''const ownerText\s*=\s*String\(manualVoiceInput\s*\|\|\s*""\)\.replace\(/\\s\+/g,\s*" "\)\.trim\(\);\s*const opener\s*=\s*ownerText\.length\s*>=\s*40\s*&&\s*!isStyleOnlyOwnerSample\(ownerText\)\s*\?\s*extractOwnerOpener\(ownerText\)\s*:\s*"";\s*const bodies\s*=\s*composeDomainFallbackPosts\(evidence,\s*opener\);''',
    '''// Owner samples are style evidence only. Never copy their factual topics or phrases into fallback content.
  const opener = "";
  const bodies = composeDomainFallbackPosts(evidence, opener);''',
    "remove owner-sample opener from fallback",
)

# ---------------------------------------------------------------------------
# 3. Permanent brochure/About-page leakage detector.
# ---------------------------------------------------------------------------
detector = r'''
function getBoundaryNgrams(text = "", size = 8) {
  const words = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  const grams = [];
  for (let i = 0; i <= words.length - size; i += 1) {
    grams.push(words.slice(i, i + size).join(" "));
  }
  return grams;
}

function detectWebsiteBrochureLeakage(posts = [], profile = {}) {
  const reasons = [];
  const businessName = String(profile?.businessProfile?.name || "").trim().toLowerCase();
  const websiteText = [
    profile?.sourceProfile?.founderLanePreview || "",
    profile?.sourceProfile?.productLanePreview || "",
  ]
    .filter(Boolean)
    .join(" ");
  const websiteNgrams = new Set(getBoundaryNgrams(websiteText, 8));

  const brochurePatterns = [
    /\bfamily[- ]owned and operated\b/i,
    /\bbased in\b/i,
    /\blocated in\b/i,
    /\bproviding comprehensive\b/i,
    /\bowner,? operator\b/i,
    /\bhas over \d+ years\b/i,
    /\blists (?:a|an|the)\b/i,
    /\bhigh-quality workmanship\b/i,
    /\btrustworthy and reassuring customer experience\b/i,
  ];

  (Array.isArray(posts) ? posts : []).forEach((post, index) => {
    const body = String(post || "")
      .replace(/\n?#\w+(?:\s+#\w+)*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const lower = body.toLowerCase();
    const patternHits = brochurePatterns.filter((pattern) => pattern.test(body)).length;

    if (patternHits >= 2) {
      reasons.push(`Post ${index + 1}: brochure/About-page sentence pattern detected.`);
    }

    if (
      businessName &&
      lower.startsWith(businessName) &&
      /\b(is|lists|provides|offers|has)\b/.test(lower.slice(0, 140))
    ) {
      reasons.push(`Post ${index + 1}: business-summary opener detected.`);
    }

    if (websiteNgrams.size > 0) {
      const overlap = getBoundaryNgrams(body, 8).find((gram) => websiteNgrams.has(gram));
      if (overlap) {
        reasons.push(`Post ${index + 1}: copied website wording detected.`);
      }
    }
  });

  return {
    failed: reasons.length > 0,
    reasons: uniqueStrings(reasons, 12),
  };
}

'''
replace_once(
    server,
    'async function generatePostsWithRetry(promptBase, category, voiceContext = {}) {',
    detector + 'async function generatePostsWithRetry(promptBase, category, voiceContext = {}) {',
    "insert brochure leakage detector",
)

# If model retries fail while owner voice exists, block instead of silently replacing it with brochure copy.
sub_once(
    server,
    r'''return buildSafeFallbackPosts\(\{\s*category,\s*businessName:\s*voiceContext\.businessName,\s*manualVoiceInput:\s*voiceContext\.manualVoiceInput,\s*voiceProfile:\s*voiceContext\.voiceProfile,\s*businessSummary:\s*voiceContext\.businessSummary,\s*offers:\s*voiceContext\.offers,\s*\}\);''',
    '''const hasOwnerVoiceStyle = Boolean(
    String(voiceContext.manualVoiceInput || "").replace(/\\s+/g, " ").trim()
  );

  if (hasOwnerVoiceStyle) {
    const boundaryError = new Error("OWNER_VOICE_BOUNDARY_BLOCKED");
    boundaryError.code = "OWNER_VOICE_BOUNDARY_BLOCKED";
    throw boundaryError;
  }

  return buildSafeFallbackPosts({
    category,
    businessName: voiceContext.businessName,
    manualVoiceInput: "",
    voiceProfile: null,
    businessSummary: voiceContext.businessSummary,
    offers: voiceContext.offers,
  });''',
    "block owner-voice brochure fallback",
)

# ---------------------------------------------------------------------------
# 4. Explicit source-role firewall in the generation prompt.
# ---------------------------------------------------------------------------
replace_once(
    server,
    '''NON-NEGOTIABLE CLAIM RULES:
- Claim safety limits facts, not voice.''',
    '''SOURCE ROLE FIREWALL — ABSOLUTE:
- WEBSITE / APPROVED CLAIMS = factual authority only. Website wording, tone, sentence rhythm, point of view, About-page copy, Our Story copy, and marketing phrasing must NEVER be used as writing-style authority.
- OWNER VOICE STYLE PROFILE = style authority only: sentence length, rhythm, vocabulary level, directness, casualness, first/third-person tendency, pacing, and punctuation. Never import factual topics, stories, people, events, or claims from the owner sample.
- OWNER CONTEXT / FOUNDER GOAL = purpose and angle only. It can decide what the post should focus on, but its wording is not reusable copy and its factual statements are not approved claims unless independently supported by website evidence.
- Generate NEW wording from website facts × owner style × current purpose.
- NEVER turn an About, Founder, Our Story, service-summary, or homepage paragraph into a social post by copying, summarising, lightly rewriting, or adding hashtags.
- A post that reads like “Business X is…”, “Business X lists…”, “based in… providing…”, an About-page biography, or a service-directory description FAILS this boundary.
- If safe website facts are thin, reduce factual specificity. Never compensate by copying website prose.

NON-NEGOTIABLE CLAIM RULES:
- Claim safety limits facts, not voice.''',
    "insert source-role firewall prompt",
)

# ---------------------------------------------------------------------------
# 5. Check generated output for brochure leakage. Retry once, then block.
# ---------------------------------------------------------------------------
sub_once(
    server,
    r'''let posts\s*=\s*await generatePostsWithHistoryGuard\(\s*prompt,\s*category,\s*recentChosenPosts,\s*\{\s*businessName:\s*finalBusinessName,\s*manualVoiceInput,\s*voiceProfile,\s*businessSummary:\s*initialProfile\?\.businessProfile\?\.summary\s*\|\|\s*businessSummary\s*\|\|\s*"",\s*offers:\s*initialProfile\?\.brandProductTruth\?\.offers\s*\|\|\s*\[\],\s*\}\s*\);''',
    '''const generationVoiceContext = {
  businessName: finalBusinessName,
  manualVoiceInput,
  voiceProfile,
  businessSummary:
    initialProfile?.businessProfile?.summary || businessSummary || "",
  offers: initialProfile?.brandProductTruth?.offers || [],
};

let posts = await generatePostsWithHistoryGuard(
  prompt,
  category,
  recentChosenPosts,
  generationVoiceContext
);

let brochureLeakageCheck = detectWebsiteBrochureLeakage(posts, initialProfile || {});
if (brochureLeakageCheck.failed) {
  console.warn("SOURCE ROLE FIREWALL RETRY:", brochureLeakageCheck.reasons);
  const firewallRetry = `
SOURCE ROLE FIREWALL RETRY:
The previous draft sounded like website/About-page copy.
- Start again with completely new social-post wording.
- Website and approved claims supply facts only.
- Owner voice profile supplies style only.
- Founder goal/current context supplies purpose only.
- Do not open with a business biography or service-directory summary.
- Do not copy or closely paraphrase any website sentence.
- Keep the post socially natural, owner-voiced when owner style exists, and factually inside approved claims.
`.trim();

  posts = await generatePostsWithRetry(
    `${prompt}\\n\\n${firewallRetry}`,
    category,
    generationVoiceContext
  );
  brochureLeakageCheck = detectWebsiteBrochureLeakage(posts, initialProfile || {});

  if (brochureLeakageCheck.failed) {
    const boundaryError = new Error("OWNER_VOICE_BOUNDARY_BLOCKED");
    boundaryError.code = "OWNER_VOICE_BOUNDARY_BLOCKED";
    boundaryError.reasons = brochureLeakageCheck.reasons;
    throw boundaryError;
  }
}''',
    "add brochure leakage retry",
)

sub_once(
    server,
    r'''const sampleLeakageCheck\s*=\s*detectOwnerSampleContentLeakage\(posts,\s*manualVoiceInput\);\s*if\s*\(sampleLeakageCheck\.failed\)\s*\{\s*console\.warn\("OWNER SAMPLE LEAKAGE GUARD:",\s*sampleLeakageCheck\.reasons\);\s*posts\s*=\s*buildSafeFallbackPosts\(\{.*?\}\);\s*\}''',
    '''const sampleLeakageCheck = detectOwnerSampleContentLeakage(posts, manualVoiceInput);
    if (sampleLeakageCheck.failed) {
      console.warn("OWNER SAMPLE LEAKAGE GUARD:", sampleLeakageCheck.reasons);
      const boundaryError = new Error("OWNER_VOICE_BOUNDARY_BLOCKED");
      boundaryError.code = "OWNER_VOICE_BOUNDARY_BLOCKED";
      boundaryError.reasons = sampleLeakageCheck.reasons;
      throw boundaryError;
    }''',
    "block owner sample leakage instead of fallback",
)

sub_once(
    server,
    r'''\}\s*catch\s*\(err\)\s*\{\s*console\.error\("GENERATE ERROR:",\s*err\);\s*res\.status\(500\)\.json\(\{\s*error:\s*"Failed to generate posts\."\s*\}\);\s*\}\s*\}\);\s*\n\s*function buildImageDecisionPacket''',
    '''} catch (err) {
    console.error("GENERATE ERROR:", err);

    if (
      err?.code === "OWNER_VOICE_BOUNDARY_BLOCKED" ||
      err?.message === "OWNER_VOICE_BOUNDARY_BLOCKED"
    ) {
      return res.status(422).json({
        error:
          "YEVIB blocked a draft because it was using website/About-page wording or owner-sample content in the wrong role. Try again, or add a little more owner voice.",
        code: "OWNER_VOICE_BOUNDARY_BLOCKED",
        reasons: Array.isArray(err?.reasons) ? err.reasons : [],
      });
    }

    res.status(500).json({ error: "Failed to generate posts." });
  }
});

function buildImageDecisionPacket''',
    "add explicit boundary error response",
)

sub_once(
    server,
    r'''buildGenerationContext,\s*\};\s*$''',
    '''buildGenerationContext,
  chooseVoiceSourceText,
  detectWebsiteBrochureLeakage,
};''',
    "export boundary helpers",
)

# ---------------------------------------------------------------------------
# 6. FREE DEMO wiring: each input has exactly one role.
# ---------------------------------------------------------------------------
js = Path("free-v1.js")
sub_once(
    js,
    r'''function getOwnerTruth\(\)\s*\{.*?\n\}''',
    '''function getOwnerVoice() {
  return ($("#ownerTruth")?.value || "").trim();
}

function getOwnerContext() {
  return ($("#ownerMisunderstanding")?.value || "").trim();
}

function buildGenerationIdea(ownerContext = "") {
  const lines = [
    "Create a new social post using verified website facts in the supplied owner writing style. Do not summarise or paraphrase the About page.",
  ];

  if (ownerContext) {
    lines.push(`Current angle/context only: ${ownerContext}`);
  }

  return lines.join("\\n");
}''',
    "split owner voice and owner context helpers",
)

replace_once(
    js,
    '''  const ownerTruth = getOwnerTruth();''',
    '''  const ownerVoice = getOwnerVoice();
  const ownerContext = getOwnerContext();''',
    "separate owner voice/context at scan",
)

replace_once(
    js,
    '''  setScanStatus("Scan started. Reading website and owner truth...");''',
    '''  setScanStatus("Scan started. Reading website facts, owner voice, and today's angle...");''',
    "update scan status",
)

sub_once(
    js,
    r'''pastedSourceText:\s*ownerTruth,\s*manualBusinessContext:\s*ownerTruth,\s*founderGoal:\s*getFounderGoal\(\),\s*ownerWritingSample:\s*ownerTruth,''',
    '''pastedSourceText: "",
        manualBusinessContext: "",
        founderGoal: getFounderGoal(),
        ownerWritingSample: ownerVoice,''',
    "profile payload source separation",
)

replace_once(
    js,
    '''        idea: getRecommendedMove(freeV1Profile),''',
    '''        idea: buildGenerationIdea(ownerContext),''',
    "use context only as idea",
)

sub_once(
    js,
    r'''pastedSourceText:\s*ownerTruth,\s*manualBusinessContext:\s*ownerTruth,\s*businessSummary:\s*freeV1Profile\?\.businessProfile\?\.summary\s*\|\|\s*"",\s*manualVoiceInput:\s*ownerTruth,''',
    '''pastedSourceText: "",
        manualBusinessContext: "",
        businessSummary: freeV1Profile?.businessProfile?.summary || "",
        manualVoiceInput: ownerVoice,''',
    "generation payload source separation",
)

sub_once(
    js,
    r'''weeklyPosts:\s*\[\s*freeV1Profile\?\.executionPlan\?\.summary\s*\|\|\s*"",\s*\.\.\.\(freeV1Profile\?\.executionPlan\?\.actions\s*\|\|\s*\[\]\),\s*\]\.filter\(Boolean\)\.join\("\\n"\),''',
    '''weeklyPosts: "",''',
    "remove strategy prose from post source material",
)

# ---------------------------------------------------------------------------
# 7. UI text states the actual enforced role boundaries.
# ---------------------------------------------------------------------------
html = Path("free-v1.html")
replace_once(
    html,
    "Paste a URL, add a little owner truth, and YEVIB creates a recommendation, post options, and a visual direction.",
    "Paste a URL, add your writing style and today's angle, and YEVIB creates a recommendation, post options, and a visual direction.",
    "update hero source role wording",
)
replace_once(
    html,
    "<p>Website source + owner context.</p>",
    "<p>Website facts + owner style + today's angle.</p>",
    "update scan subtitle",
)
replace_once(
    html,
    'placeholder="Write in your own style here. YEVIB will use this to shape the tone, wording, and writing style of the post."',
    'placeholder="Write a few lines naturally. YEVIB uses this for style only — rhythm, wording, directness and tone — never as business facts."',
    "clarify owner voice field",
)
replace_once(
    html,
    '<label>Common misunderstanding <em>(optional)</em></label>\n          <textarea id="ownerMisunderstanding" placeholder="What do people often miss, assume, or misunderstand?"></textarea>',
    '<label>Today\'s angle / common misunderstanding <em>(optional)</em></label>\n          <textarea id="ownerMisunderstanding" placeholder="What should today\'s post focus on? YEVIB uses this as direction, not reusable copy."></textarea>',
    "clarify owner context field",
)
replace_once(
    html,
    '<div class="read-pill"><span>Best content lane</span><strong>Owner voice + website signal</strong></div>',
    '<div class="read-pill"><span>Best content lane</span><strong>Website facts × owner style</strong></div>',
    "update best lane label",
)
sub_once(
    html,
    r'''<li>Uses the website signal</li>\s*<li>Matches the selected founder goal</li>\s*<li>Uses the supplied owner voice</li>\s*<li>Keeps claims inside safe demo limits</li>''',
    '''<li>Uses website facts, not website writing style</li>
    <li>Matches the selected founder goal</li>
    <li>Uses the owner sample for style only</li>
    <li>Blocks About-page paraphrasing and unsafe claims</li>''',
    "replace why-YEVIB boundary bullets",
)

# ---------------------------------------------------------------------------
# 8. Align old fallback assertions with the absolute boundary.
# ---------------------------------------------------------------------------
fallback = Path("fallback-posts-self-test.js")
ftext = fallback.read_text()
ftext = ftext.replace(
    'runTest("plumbing fallback sounds like plumbing and keeps owner opener", () => {',
    'runTest("plumbing fallback sounds like plumbing without importing owner-sample facts", () => {',
)
ftext = ftext.replace(
    '  assert.ok(/(?:\\bI\\b|\\bwe\\b)/i.test(combined));\n',
    '  assert.ok(!combined.toLowerCase().includes("people were tired of vague quotes"));\n',
)
fallback.write_text(ftext)

voice_test = Path("voice-dominance-self-test.js")
vtext = voice_test.read_text()
vtext = vtext.replace(
    'runTest("new fallback returns exactly 3 owner-voiced posts", () => {',
    'runTest("safe fallback returns 3 factual posts without importing owner-sample facts", () => {',
)
vtext = vtext.replace(
    '  assert.ok(/(?:\\bI\\b|\\bwe\\b|\\bour\\b)/i.test(combined), "fallback must use owner-style first-person language");\n',
    '  assert.ok(!combined.toLowerCase().includes("people were tired of vague quotes"), "fallback must not import owner-sample factual content");\n',
)
voice_test.write_text(vtext)

# ---------------------------------------------------------------------------
# 9. Regression test: Top Gun About-page outputs must be rejected.
# ---------------------------------------------------------------------------
Path("source-boundary-self-test.js").write_text(r'''const assert = require("assert");
const {
  chooseVoiceSourceText,
  detectWebsiteBrochureLeakage,
} = require("./server.js");

const WEBSITE_ABOUT =
  "Top Gun Air Conditioning Pty Ltd is a family-owned and operated HVAC company based in Camden South, NSW, providing comprehensive heating, ventilation, and air conditioning installation and maintenance services.";
const OWNER_SAMPLE =
  "Look, I keep it simple. If something needs explaining, I say it straight and get on with the job.";

const selectedVoice = chooseVoiceSourceText({
  founderText: WEBSITE_ABOUT,
  productText: "Air conditioning installation and maintenance",
  sourceProfileSummary: WEBSITE_ABOUT,
  ownerWritingSample: OWNER_SAMPLE,
});
assert.strictEqual(selectedVoice, OWNER_SAMPLE, "owner writing must be the sole style source");

const noOwnerVoice = chooseVoiceSourceText({
  founderText: WEBSITE_ABOUT,
  productText: "Air conditioning installation and maintenance",
  sourceProfileSummary: WEBSITE_ABOUT,
  ownerWritingSample: "",
});
assert.strictEqual(noOwnerVoice, "", "website text must never become a voice source");

const profile = {
  businessProfile: { name: "Top Gun Air Conditioning Pty Ltd" },
  sourceProfile: {
    founderLanePreview: WEBSITE_ABOUT,
    productLanePreview:
      "Top Gun Air Conditioning provides air conditioning installation and maintenance services.",
  },
};

const badPosts = [
  "Top Gun Air Conditioning Pty Ltd is a family-owned and operated HVAC company based in Camden South, NSW, providing comprehensive heating, ventilation and air conditioning installation and maintenance services. #TopGun #HVAC #LocalBusiness",
  "Top Gun Air Conditioning Pty Ltd lists a trustworthy and reassuring customer experience and high-quality workmanship in Camden South. #TopGun #HVAC #QualityMatters",
  "Brendan Cashel is the owner, operator of Top Gun Air Conditioning and has over 15 years of experience in the trade. #TopGun #HVAC #FounderLed",
];
const badCheck = detectWebsiteBrochureLeakage(badPosts, profile);
assert.strictEqual(badCheck.failed, true, "About-page brochure drafts must be blocked");
assert.ok(badCheck.reasons.length > 0);

const safePosts = [
  "Hot weather is when air conditioning problems stop being background noise. If yours is struggling, getting the issue checked before the next run of heat is the sensible move. #TopGun #AirConditioning #HomeComfort",
  "A lot of air conditioning problems start as changes people put up with for too long. Less airflow, odd noise, rooms taking longer to cool — those are worth looking at before they become a bigger headache. #TopGun #HVAC #Maintenance",
  "Air conditioning should make the house easier to live in, not become another thing you have to think about. Installation and maintenance are the practical part; comfort is the reason people care. #TopGun #AirConditioning #HomeComfort",
];
const safeCheck = detectWebsiteBrochureLeakage(safePosts, profile);
assert.strictEqual(safeCheck.failed, false, safeCheck.reasons.join("; "));

console.log("Source boundary self-test passed.");
''')

print("Source-boundary repair applied.")
