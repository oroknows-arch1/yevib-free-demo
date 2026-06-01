
let freeV1Profile = null;
let freeV1Posts = [];
let selectedPost = "";

const $ = (selector) => document.querySelector(selector);
function setScanStatus(message) {
  const status = $("#scanStatus");
  if (status) status.textContent = message;
}
function setScanStatus(message) {
  const status = $("#scanStatus");
  if (status) status.textContent = message;
}

function setActiveStep(step) {
  const activeStep = Number(step);

  document.querySelectorAll(".side-link, .track-step").forEach((button) => {
    button.classList.toggle("active", button.dataset.step === String(step));
  });

  document.querySelectorAll(".step-card").forEach((card) => {
    const panelStep = Number(card.dataset.panel);
    const isActive = panelStep === activeStep;

    card.classList.toggle("focused", isActive);
    card.classList.toggle("is-collapsed", panelStep > activeStep);
  });

  const panel = document.querySelector(`[data-panel="${step}"]`);
  if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getBusinessUrl() {
  return ($("#businessUrl")?.value || "").trim();
}


function initBusinessUrlAutocomplete() {
  const businessUrlInput = $("#businessUrl");
  const suggestionBox = $("#businessUrlSuggestions");

  if (!businessUrlInput || !suggestionBox) return;

  const businessSuggestions = [
    {
      name: "Sydney Animal Hospitals",
      url: "https://sydneyanimalhospitals.com.au",
      keywords: ["vet", "animal", "pet", "grooming", "sydney"],
    },
    {
      name: "The Tutor Network",
      url: "https://thetutornetwork.com.au",
      keywords: ["tutor", "education", "students", "learning"],
    },
    {
      name: "Brisbane Electrical Services",
      url: "https://brisbaneelectricalservices.com.au",
      keywords: ["electrician", "electrical", "brisbane", "trade"],
    },
    {
      name: "Sydney Plumbing Group",
      url: "https://sydneyplumbinggroup.com.au",
      keywords: ["plumber", "plumbing", "sydney", "trade"],
    },
    {
      name: "NDIS Support Services Australia",
      url: "https://ndissupportservices.com.au",
      keywords: ["ndis", "support", "care", "disability"],
    },
    {
      name: "Australian Trade Directory",
      url: "https://australiantradedirectory.com.au",
      keywords: ["tradies", "directory", "marketplace", "classifieds"],
    },
  ];

  let activeIndex = -1;
  let visibleSuggestions = [];

  function normalizeText(value = "") {
    return String(value)
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .trim();
  }

  function looksLikeManualUrl(value = "") {
    const text = String(value).trim();
    return /^https?:\/\//i.test(text) || /^www\./i.test(text) || /\.[a-z]{2,}/i.test(text);
  }

  function getSuggestionScore(suggestion, query) {
    const searchable = normalizeText([
      suggestion.name,
      suggestion.url,
      ...(suggestion.keywords || []),
    ].join(" "));

    if (!query || query.length < 2) return 0;
    if (normalizeText(suggestion.name).startsWith(query)) return 4;
    if (normalizeText(suggestion.url).startsWith(query)) return 3;
    if (searchable.includes(query)) return 2;
    return 0;
  }

  function hideSuggestions() {
    suggestionBox.hidden = true;
    suggestionBox.innerHTML = "";
    businessUrlInput.setAttribute("aria-expanded", "false");
    activeIndex = -1;
    visibleSuggestions = [];
  }

  function setActiveSuggestion(nextIndex) {
    const buttons = Array.from(suggestionBox.querySelectorAll("button"));

    buttons.forEach((button, index) => {
      button.classList.toggle("active", index === nextIndex);
      button.setAttribute("aria-selected", index === nextIndex ? "true" : "false");
    });

    activeIndex = nextIndex;
  }

  function selectSuggestion(suggestion) {
    businessUrlInput.value = suggestion.url;
    businessUrlInput.dispatchEvent(new Event("input", { bubbles: true }));
    businessUrlInput.focus();
    hideSuggestions();
  }

  function renderSuggestions(matches) {
    visibleSuggestions = matches;
    activeIndex = -1;

    if (!matches.length) {
      hideSuggestions();
      return;
    }

    suggestionBox.innerHTML = matches
      .map((suggestion, index) => `
        <button
          type="button"
          role="option"
          aria-selected="false"
          data-suggestion-index="${index}"
        >
          <span>${escapeHtml(suggestion.name)}</span>
          <small>${escapeHtml(suggestion.url.replace(/^https?:\/\//, ""))}</small>
        </button>
      `)
      .join("");

    suggestionBox.hidden = false;
    businessUrlInput.setAttribute("aria-expanded", "true");
  }

  function updateSuggestions() {
    const rawValue = businessUrlInput.value;
    const query = normalizeText(rawValue);

    if (looksLikeManualUrl(rawValue)) {
      hideSuggestions();
      return;
    }

    const matches = businessSuggestions
      .map((suggestion) => ({
        ...suggestion,
        score: getSuggestionScore(suggestion, query),
      }))
      .filter((suggestion) => suggestion.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 5);

    renderSuggestions(matches);
  }

  businessUrlInput.addEventListener("input", updateSuggestions);
  businessUrlInput.addEventListener("focus", updateSuggestions);

  businessUrlInput.addEventListener("keydown", (event) => {
    if (suggestionBox.hidden || !visibleSuggestions.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestion((activeIndex + 1) % visibleSuggestions.length);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestion(
        activeIndex <= 0 ? visibleSuggestions.length - 1 : activeIndex - 1
      );
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectSuggestion(visibleSuggestions[activeIndex]);
    }

    if (event.key === "Escape") {
      hideSuggestions();
    }
  });

  suggestionBox.addEventListener("pointerdown", (event) => {
    const button = event.target.closest("button[data-suggestion-index]");
    if (!button) return;

    event.preventDefault();

    const index = Number(button.dataset.suggestionIndex);
    const suggestion = visibleSuggestions[index];

    if (suggestion) selectSuggestion(suggestion);
  });

  document.addEventListener("pointerdown", (event) => {
    if (
      event.target === businessUrlInput ||
      suggestionBox.contains(event.target)
    ) {
      return;
    }

    hideSuggestions();
  });
}

function getFounderGoal() {
  return ($("#founderGoal")?.value || "Build more trust").trim();
}


function getOwnerTruth() {
  return [
    ($("#ownerTruth")?.value || "").trim(),
    ($("#ownerMisunderstanding")?.value || "").trim(),
  ].filter(Boolean).join("\n\n");
}

function setReadState(state) {
  const rows = document.querySelectorAll(".scan-row");

  rows.forEach((row, index) => {
    row.classList.remove("done", "active", "muted");

    const strong = row.querySelector("strong");

    if (state === "idle") {
      row.classList.add("muted");
      if (strong) strong.textContent = "–";
    }

    if (state === "loading") {
      if (index < 2) {
        row.classList.add("done");
        if (strong) strong.textContent = "✓";
      } else {
        row.classList.add("active");
        if (strong) {
          strong.className = "spinner";
          strong.textContent = "";
        }
      }
    }

    if (state === "done") {
      row.classList.add("done");
      if (strong) {
        strong.className = "";
        strong.textContent = "✓";
      }
    }

    if (state === "error") {
      row.classList.add(index === 0 ? "active" : "muted");
      if (strong) strong.textContent = index === 0 ? "!" : "–";
    }
  });
}

function getBusinessName(profile) {
  return profile?.businessProfile?.name || "this business";
}

function getRecommendedMove(profile) {
  return "Create one clear post from the website and owner voice.";
}

function renderRecommendation(profile) {
  const title = $("#recommendationTitle");
  const text = $("#recommendationText");

  if (title) title.textContent = getRecommendedMove(profile);

  if (text) {
 text.textContent = `Free demo can create text, a demo image draft, or both. Paid YEVIB adds tighter business-specific controls, saved brand voice, and deeper campaign direction.`;
}
    }

function parsePosts(text = "") {
  return String(text || "")
    .split(/\n{2,}/)
    .map((item) => item.replace(/^Post\s*\d+[:.)-]?\s*/i, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function renderPostOptions(posts) {
  const wrap = $(".post-options");
  if (!wrap) return;

  freeV1Posts = posts.slice(0, 3);
  selectedPost = freeV1Posts[0] || "";

  wrap.innerHTML = freeV1Posts.map((post, index) => `
    <div class="post-option ${index === 0 ? "selected" : ""}" data-post-index="${index}">
      <small>Option ${index + 1}</small>
      <p>${escapeHtml(post)}</p>
    </div>
  `).join("");

  document.querySelectorAll("[data-post-index]").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll("[data-post-index]").forEach((item) => item.classList.remove("selected"));
      card.classList.add("selected");
      selectedPost = freeV1Posts[Number(card.dataset.postIndex)] || "";
      renderReadyToUse();
    });
  });

  renderReadyToUse();
}

function setImageDirectionState(state = "idle") {
  document.querySelectorAll(".image-check-row").forEach((row) => {
    row.classList.remove("done", "muted");

    const strong = row.querySelector("strong");

    if (state === "done") {
      row.classList.add("done");
      if (strong) strong.textContent = "✓";
    } else {
      row.classList.add("muted");
      if (strong) strong.textContent = "–";
    }
  });
}

function renderVisualDirection(profile) {
  const target = $("#visualDirectionText");
  if (!target) return;

  target.textContent = `Optional: generate a review-before-use image draft for this post. If the image does not feel right, use your own real business photo instead and pair it with the selected text post.`;
  setImageDirectionState("done");
}

function renderReadyToUse() {
  const target = $("#selectedPostText");
  if (target) target.textContent = selectedPost || "Choose or generate a post first.";
}

async function generateDemoImage(button) {
  const preview = $("#demoImagePreview");

  if (!selectedPost) {
    alert("Select a post before generating an image draft.");
    return;
  }

  const originalText = button.innerHTML;
  button.disabled = true;
  button.innerHTML = "Generating demo image...";
  if (preview) preview.innerHTML = "<p>Generating review-before-use demo image...</p>";
  setImageDirectionState("idle");

  try {
    const imageRes = await fetch("/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imagePrompt: selectedPost,
        discoveryProfile: freeV1Profile || {},
      }),
    });

    const imageData = await imageRes.json();

    if (!imageRes.ok) {
      throw new Error(imageData.error || "Failed to generate demo image.");
    }

    if (!imageData.imageUrl) {
      throw new Error("No image returned.");
    }

    if (preview) {
      preview.innerHTML = `<img src="${imageData.imageUrl}" alt="Review-before-use demo image draft" />`;
    }

    setImageDirectionState("done");
  } catch (err) {
    if (preview) preview.innerHTML = `<p>Image draft failed: ${escapeHtml(err.message)}</p>`;
    alert(err.message);
  } finally {
    button.disabled = false;
    button.innerHTML = originalText;
  }
}

async function runFreeV1Scan(button) {
  const businessUrl = getBusinessUrl();
  const ownerTruth = getOwnerTruth();

  if (!businessUrl) {
    setScanStatus("Add a business website URL first.");
    alert("Add a business website URL first.");
    return;
  }

  button.disabled = true;
  button.innerHTML = "Scanning website...";
  setScanStatus("Scan started. Reading website and owner truth...");
  setActiveStep(2);
  setReadState("loading");

  try {
    const profileRes = await fetch("/build-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "hybrid",
        businessUrl,
        pastedSourceText: ownerTruth,
        manualBusinessContext: ownerTruth,
        founderGoal: getFounderGoal(),
        ownerWritingSample: ownerTruth,
      }),
    });

    const profileData = await profileRes.json();

    if (!profileRes.ok) {
      throw new Error(profileData.error || "Failed to scan business.");
    }

    freeV1Profile = profileData.profile;
    renderRecommendation(freeV1Profile);
    setReadState("done");
    setScanStatus("Website read complete. Generating post options...");

    const generateRes = await fetch("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "execution",
        idea: getRecommendedMove(freeV1Profile),
        category: freeV1Profile?.contentProfile?.suggestedCategory || "Product in Real Life",
        businessUrl,
        pastedSourceText: ownerTruth,
        manualBusinessContext: ownerTruth,
        businessSummary: freeV1Profile?.businessProfile?.summary || "",
        manualVoiceInput: ownerTruth,
        voiceProfile: freeV1Profile?.founderVoice || null,
        initialProfile: freeV1Profile,
        quickType: "Business",
        ownerNudge: getFounderGoal(),
        founderGoal: getFounderGoal(),
        weeklyPosts: [
          freeV1Profile?.executionPlan?.summary || "",
          ...(freeV1Profile?.executionPlan?.actions || []),
        ].filter(Boolean).join("\n"),
      }),
    });

    const generateData = await generateRes.json();

    if (!generateRes.ok) {
      throw new Error(generateData.error || "Failed to generate posts.");
    }

    const posts = parsePosts(generateData.text);

    if (!posts.length) {
      throw new Error("YEVIB did not return usable post options.");
    }

    renderPostOptions(posts);
    renderVisualDirection(freeV1Profile);
    setScanStatus("Done. Content options are ready.");
    setActiveStep(3);
  } catch (err) {
    setReadState("error");
    setScanStatus("Scan failed: " + err.message);
    alert(err.message);
    setActiveStep(1);
  } finally {
    button.disabled = false;
    button.innerHTML = 'Start Free Scan <span>→</span>';
  }
}

document.querySelectorAll("[data-step]").forEach((button) => {
  button.addEventListener("click", () => setActiveStep(button.dataset.step));
});

document.querySelectorAll("[data-next]").forEach((button) => {
  button.addEventListener("click", async (event) => {
    event.preventDefault();

    if (button.id === "startFreeScanBtn") {
      await runFreeV1Scan(button);
      return;
    }

    const next = button.dataset.next;

    
if (next === "4") {
  const originalText = button.innerHTML;
  button.disabled = true;
  button.innerHTML = "Preparing selected post...";

  renderReadyToUse();
  setActiveStep(4);

  setTimeout(() => {
    button.disabled = false;
    button.innerHTML = originalText;
  }, 650);

  return;
}

setActiveStep(next);
  });
});

const generateDemoImageBtn = $("#generateDemoImageBtn");
if (generateDemoImageBtn) {
  generateDemoImageBtn.addEventListener("click", () => generateDemoImage(generateDemoImageBtn));
}

initBusinessUrlAutocomplete();
setReadState("idle");
setActiveStep(1);
