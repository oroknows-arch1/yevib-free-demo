const assert = require("assert");
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
