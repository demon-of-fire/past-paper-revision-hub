(async function () {
  let papers = [];

  const supportedQualifications = [
    "GCSE",
    "IGCSE",
    "A-level",
    "AS",
    "International A-level",
    "Functional Skills",
    "BTEC",
    "T Level",
    "Cambridge National",
    "Cambridge Technical",
    "EPQ",
    "Scottish National 5",
    "Scottish Higher",
    "Scottish Advanced Higher",
    "International Baccalaureate"
  ];

  const supportedSubjects = [
    "Accounting",
    "Ancient History",
    "Ancient Languages",
    "Arabic",
    "Art and Design",
    "Astronomy",
    "Bengali",
    "Biology",
    "Biblical Hebrew",
    "British Sign Language",
    "Business",
    "Chemistry",
    "Chinese",
    "Citizenship Studies",
    "Classical Civilisation",
    "Classical Greek",
    "Combined Science",
    "Computer Science",
    "Dance",
    "Design and Technology",
    "Drama",
    "Economics",
    "Electronics",
    "Engineering",
    "English Language",
    "English Literature",
    "Environmental Science",
    "Film Studies",
    "Food Preparation and Nutrition",
    "French",
    "Further Mathematics",
    "Geography",
    "Geology",
    "German",
    "Gujarati",
    "History",
    "Italian",
    "Japanese",
    "Latin",
    "Law",
    "Mathematics",
    "Media Studies",
    "Modern Foreign Languages",
    "Modern Hebrew",
    "Modern Languages",
    "Music",
    "Panjabi",
    "Persian",
    "Physical Education",
    "Physical Education Short Course",
    "Physics",
    "Polish",
    "Politics",
    "Portuguese",
    "Psychology",
    "Religious Studies",
    "Russian",
    "Science",
    "Single Science",
    "Sociology",
    "Spanish",
    "Statistics",
    "Turkish",
    "Urdu"
  ];

  const supportedBoards = [
    "AQA",
    "Cambridge International",
    "Edexcel",
    "Eduqas",
    "OCR",
    "Pearson Edexcel",
    "WJEC Eduqas"
  ];

  const supportedTiers = [
    "Foundation",
    "Higher",
    "Extended",
    "Core",
    "Standard level",
    "Higher level"
  ];

  const markerProfile = {
    signals: {
      exactAnswerWeight: 0.55,
      keywordWeight: 0.35,
      workingWeight: 0.1
    },
    feedback: {
      high: "Strong answer. Keep showing working clearly.",
      medium: "Partly correct. Add the missing key terms or calculation steps.",
      low: "Needs more revision. Revisit the mark scheme and practise this topic again."
    }
  };

  const state = {
    downloads: new Set(JSON.parse(localStorage.getItem("downloads") || "[]")),
    marks: JSON.parse(localStorage.getItem("marks") || "[]"),
    selectedPaper: null,
    lastFocus: null,
    hasSearched: false,
    lastResultCount: null
  };

  const els = {
    qualification: document.getElementById("qualificationFilter"),
    subject: document.getElementById("subjectFilter"),
    board: document.getElementById("boardFilter"),
    tier: document.getElementById("tierFilter"),
    paper: document.getElementById("paperFilter"),
    search: document.getElementById("searchFilter"),
    searchButton: document.getElementById("searchPapers"),
    reset: document.getElementById("resetFilters"),
    results: document.getElementById("paperResults"),
    resultCount: document.getElementById("resultCount"),
    paperTotal: document.getElementById("paperTotal"),
    waitingTotal: document.getElementById("waitingTotal"),
    averageScore: document.getElementById("averageScore"),
    downloadCount: document.getElementById("downloadCount"),
    markedCount: document.getElementById("markedCount"),
    recommendation: document.getElementById("recommendation"),
    dialog: document.getElementById("markDialog"),
    dialogDescription: document.getElementById("dialogDescription"),
    closeDialog: document.getElementById("closeDialog"),
    cancelMarking: document.getElementById("cancelMarking"),
    markForm: document.getElementById("markForm"),
    answerFile: document.getElementById("answerFile"),
    modelStep: document.getElementById("modelStep"),
    modelProgress: document.getElementById("modelProgress"),
    markingStatus: document.getElementById("markingStatus"),
    feedbackResults: document.getElementById("feedbackResults"),
    clearResults: document.getElementById("clearResults"),
    screenReaderStatus: document.getElementById("screenReaderStatus")
  };
  els.refreshCatalogue = document.getElementById("refreshCatalogue");

  await initialise();

  async function initialise() {
    papers = await loadRealPapers();
    populateCatalogueFilters();
    populateSelect(els.paper, unique(papers.map((paper) => paper.paperName)), "All papers");

    document.getElementById("filterForm").addEventListener("submit", searchPapers);
    document.getElementById("filterForm").addEventListener("input", markFiltersChanged);
    els.searchButton.addEventListener("click", searchPapers);
    els.reset.addEventListener("click", resetFilters);
    els.closeDialog.addEventListener("click", closeDialog);
    els.cancelMarking.addEventListener("click", closeDialog);
    els.clearResults.addEventListener("click", clearMarkingResults);
    els.refreshCatalogue.addEventListener("click", refreshCatalogue);
    els.markForm.addEventListener("submit", markUploadedPaper);
    els.dialog.addEventListener("keydown", trapDialogFocus);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !els.dialog.hidden) {
        closeDialog();
      }
    });

    setAwaitingSearch();
    renderFeedback();
    updateStats();
  }

  async function loadRealPapers() {
    try {
      const response = await fetch("data/real-papers.json");
      if (!response.ok) throw new Error("Paper catalogue unavailable.");
      const catalogue = await response.json();
      return catalogue.map((paper, index) => ({ ...paper, id: `paper-${index + 1}` }));
    } catch (error) {
      els.resultCount.textContent = "";
      announce("Paper catalogue could not be loaded.");
      return [];
    }
  }

  function populateSelect(select, options, allLabel) {
    select.innerHTML = "";
    select.append(new Option(allLabel, ""));
    options.forEach((option) => select.append(new Option(option, option)));
  }

  function populateCatalogueFilters() {
    populateSelect(els.qualification, unique(supportedQualifications.concat(papers.map((paper) => paper.qualification))), "All qualifications");
    populateSelect(els.subject, unique(supportedSubjects.concat(papers.map((paper) => paper.subject))), "All subjects");
    populateSelect(els.board, unique(supportedBoards.concat(papers.map((paper) => paper.board))), "All boards");
    populateSelect(els.tier, unique(supportedTiers.concat(papers.map((paper) => paper.tier))), "All levels");
    populateSelect(els.paper, unique(papers.map((paper) => paper.paperName)), "All papers");
  }

  function unique(values) {
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }

  function getFilteredPapers() {
    const query = els.search.value.trim().toLowerCase();
    return papers.filter((paper) => {
      const fields = [paper.qualification, paper.subject, paper.board, paper.tier, paper.paperName, paper.year, paper.series, paper.topics.join(" ")].join(" ").toLowerCase();
      return (!els.qualification.value || paper.qualification === els.qualification.value)
        && (!els.subject.value || paper.subject === els.subject.value)
        && (!els.board.value || paper.board === els.board.value)
        && (!els.tier.value || paper.tier === els.tier.value)
        && (!els.paper.value || paper.paperName === els.paper.value)
        && (!query || fields.includes(query));
    });
  }

  function searchPapers(event) {
    if (event) {
      event.preventDefault();
    }
    state.hasSearched = true;
    render();
    els.results.focus();
  }

  function markFiltersChanged() {
    if (!state.hasSearched) return;
    state.hasSearched = false;
    state.lastResultCount = null;
    setAwaitingSearch();
    updateStats();
  }

  function setAwaitingSearch() {
    els.resultCount.textContent = "";
    els.results.innerHTML = "";
    els.results.setAttribute("aria-busy", "false");
    const prompt = document.createElement("p");
    prompt.className = "empty-state";
    prompt.textContent = "Choose filters, then press Search to list matching papers and mark schemes.";
    els.results.append(prompt);
  }

  function render() {
    const filtered = getFilteredPapers();
    state.lastResultCount = filtered.length;
    els.resultCount.textContent = `${filtered.length} papers shown`;
    els.results.innerHTML = "";
    els.results.setAttribute("aria-busy", "true");

    if (filtered.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "This qualification, subject, or board is supported, but no matching papers are in the local catalogue yet. Use Update catalogue, or try a broader filter.";
      els.results.append(empty);
      els.results.setAttribute("aria-busy", "false");
      updateStats();
      announce("No matching papers are in the local catalogue yet.");
      return;
    }

    filtered.forEach((paper) => {
      const title = titleFor(paper);
      const headingId = `${paper.id}-title`;
      const card = document.createElement("article");
      card.className = "paper-card";
      card.tabIndex = -1;
      card.setAttribute("aria-labelledby", headingId);
      card.innerHTML = `
        <header>
          <h3 id="${headingId}">${escapeHtml(title)}</h3>
          <div class="paper-meta">
            <span>${escapeHtml(paper.qualification)}</span>
            <span>${escapeHtml(paper.board)}</span>
            <span>${escapeHtml(paper.tier)}</span>
            <span>${escapeHtml(paper.series)} ${escapeHtml(paper.year)}</span>
          </div>
          <div class="paper-meta">${paper.topics.map((topic) => `<span class="tag">${escapeHtml(topic)}</span>`).join("")}</div>
        </header>
        <div class="actions">
          <button type="button" data-action="download-text" data-id="${paper.id}" aria-label="Download question paper and mark scheme as plain text for ${escapeAttribute(title)}">Download as plain text</button>
          <button type="button" data-action="download-word" data-id="${paper.id}" aria-label="Download question paper and mark scheme as Word files for ${escapeAttribute(title)}">Download as Word</button>
          <button type="button" data-action="mark" data-id="${paper.id}" aria-label="Upload my answer and mark it for ${escapeAttribute(title)}">Mark</button>
        </div>
        <div class="source-row">
          <span>Source: ${escapeHtml(paper.sourceName)}</span>
          <a href="${escapeAttribute(paper.sourceUrl)}" target="_blank" rel="noreferrer" aria-label="Open source page for ${escapeAttribute(title)}">Source page</a>
          <a href="${escapeAttribute(paper.questionUrl)}" target="_blank" rel="noreferrer" aria-label="Open original PDF for ${escapeAttribute(title)}">Original PDF</a>
          <span aria-label="Download status: ${state.downloads.has(paper.id) ? "downloaded" : "not started"}">Status: ${state.downloads.has(paper.id) ? "downloaded" : "not started"}</span>
        </div>
      `;
      card.addEventListener("click", handlePaperAction);
      els.results.append(card);
    });

    els.results.setAttribute("aria-busy", "false");
    updateStats();
    announce(`${filtered.length} papers shown.`);
  }

  function handlePaperAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const paper = papers.find((item) => item.id === button.dataset.id);
    if (!paper) return;

    if (button.dataset.action === "download-text") {
      downloadPaperSet(paper, "text", button);
    }
    if (button.dataset.action === "download-word") {
      downloadPaperSet(paper, "word", button);
    }
    if (button.dataset.action === "mark") {
      openDialog(paper, button);
    }
  }

  function titleFor(paper) {
    return `${paper.board} ${paper.qualification} ${paper.subject} ${paper.tier} ${paper.paperName} ${paper.series} ${paper.year}`;
  }

  async function downloadWordDocument(paper, type, button) {
    const originalText = button.textContent;
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");

    try {
      await downloadConvertedDocument(paper, type, "word");
      state.downloads.add(paper.id);
      saveDownloads();
      if (state.hasSearched) {
        render();
      } else {
        updateStats();
      }
    } catch (error) {
      els.resultCount.textContent = "Word conversion is not ready. Run setup, then try again.";
      announce("Word conversion failed. Run setup, restart the app, and try again.");
      alert("The PDF-to-Word converter is not ready yet. Run setup.ps1 once, restart the app, and try again.");
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-disabled");
      button.textContent = originalText;
    }
  }

  async function downloadPlainTextDocument(paper, type, button) {
    const originalText = button.textContent;
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");

    try {
      await downloadConvertedDocument(paper, type, "text");
      state.downloads.add(paper.id);
      saveDownloads();
      if (state.hasSearched) {
        render();
      } else {
        updateStats();
      }
    } catch (error) {
      els.resultCount.textContent = "Plain text conversion is not ready. Run setup, then try again.";
      announce("Plain text conversion failed. Run setup, restart the app, and try again.");
      alert("The plain-text converter is not ready yet. Run setup.ps1 once, restart the app, and try again.");
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-disabled");
      button.textContent = originalText;
    }
  }

  async function downloadPaperSet(paper, format, button) {
    const originalText = button.textContent;
    const formatLabel = format === "text" ? "plain text" : "Word";
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
    button.textContent = `Downloading ${formatLabel}`;
    els.resultCount.textContent = `Downloading ${titleFor(paper)} as ${formatLabel}`;
    announce(`Downloading ${titleFor(paper)} question paper and mark scheme as ${formatLabel}.`);

    try {
      await downloadConvertedDocument(paper, "question", format);
      await downloadConvertedDocument(paper, "scheme", format);
      state.downloads.add(paper.id);
      saveDownloads();
      if (state.hasSearched) {
        render();
      } else {
        updateStats();
      }
      announce(`${titleFor(paper)} question paper and mark scheme downloaded as ${formatLabel}.`);
    } catch (error) {
      const message = format === "text"
        ? "Plain text conversion failed. Run setup, restart the app, and try again."
        : "Word conversion failed. Run setup, restart the app, and try again.";
      els.resultCount.textContent = message;
      announce(message);
      alert(message);
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-disabled");
      button.textContent = originalText;
    }
  }

  async function downloadConvertedDocument(paper, type, format) {
    const sourceUrl = type === "question" ? paper.questionUrl : paper.schemeUrl;
    const fileTitle = `${titleFor(paper)} ${type === "question" ? "question paper" : "mark scheme"}`;
    const isText = format === "text";
    const params = new URLSearchParams({ url: sourceUrl, title: fileTitle });
    const endpoint = isText ? "/api/convert-pdf-to-text" : "/api/convert-pdf-to-word";
    const extension = isText ? "txt" : "docx";
    els.resultCount.textContent = isText
      ? `Creating accessible text for ${fileTitle}`
      : `Converting ${fileTitle} to Word`;
    announce(els.resultCount.textContent);

    const response = await fetch(`${endpoint}?${params}`);
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "The converter could not create the file.");
    }
    const blob = await response.blob();
    triggerDownload(blob, `${slug(fileTitle)}.${extension}`);
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function openDialog(paper, button) {
    state.selectedPaper = paper;
    state.lastFocus = button;
    els.dialogDescription.textContent = `Upload your completed answer for ${titleFor(paper)}. Text files are easiest for the local marker, and Word files still work.`;
    els.answerFile.value = "";
    els.modelStep.textContent = "Marker ready";
    els.modelProgress.value = 0;
    els.dialog.hidden = false;
    announce(`Marking dialog opened for ${titleFor(paper)}.`);
    els.answerFile.focus();
  }

  function closeDialog() {
    els.dialog.hidden = true;
    state.selectedPaper = null;
    if (state.lastFocus) {
      state.lastFocus.focus();
    }
  }

  function trapDialogFocus(event) {
    if (event.key !== "Tab") return;
    const focusable = els.dialog.querySelectorAll("button, input, select, textarea, a[href]");
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      last.focus();
      event.preventDefault();
    } else if (!event.shiftKey && document.activeElement === last) {
      first.focus();
      event.preventDefault();
    }
  }

  async function markUploadedPaper(event) {
    event.preventDefault();
    const file = els.answerFile.files[0];
    if (!file || !state.selectedPaper) return;

    const paper = state.selectedPaper;
    const submitButton = els.markForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.setAttribute("aria-disabled", "true");

    try {
      const profile = await prepareMarker(paper);
      const answerText = await readAnswerFile(file);
      if (answerText.length < 20) {
        throw new Error("Not enough readable answer text was found in that file.");
      }
      const schemeText = await loadMarkSchemeText(paper);
      const result = scoreAnswer(paper, answerText, profile, schemeText);
      state.marks.unshift(result);
      state.marks = state.marks.slice(0, 20);
      saveMarks();
      closeDialog();
      renderFeedback();
      updateStats();
      els.markingStatus.textContent = `${titleFor(paper)} checked. Indicative score ${result.score} out of ${result.total}. Confidence: ${result.confidence}.`;
      announce(`${titleFor(paper)} checked. Indicative score ${result.score} out of ${result.total}. Confidence ${result.confidence}.`);
    } catch (error) {
      els.modelStep.textContent = "Marking stopped";
      els.modelProgress.value = 0;
      els.markingStatus.textContent = error.message;
      announce(error.message);
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute("aria-disabled");
    }
  }

  async function prepareMarker(paper) {
    const steps = [
      ["Extracting mark scheme text", 25],
      ["Checking answers", 50],
      ["Checking confidence", 75],
      ["Marker ready", 100]
    ];

    for (const [label, value] of steps) {
      els.modelStep.textContent = label;
      els.modelProgress.value = value;
      els.modelProgress.textContent = `${value}%`;
      await wait(180);
    }

    return markerProfile;
  }

  async function loadMarkSchemeText(paper) {
    try {
      const params = new URLSearchParams({
        url: paper.schemeUrl,
        title: `${titleFor(paper)} mark scheme`
      });
      const response = await fetch(`/api/convert-pdf-to-text?${params}`);
      if (!response.ok) {
        return "";
      }
      return normalizeText(await response.text());
    } catch (error) {
      return "";
    }
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function readAnswerFile(file) {
    const form = new FormData();
    form.append("answerFile", file);

    const response = await fetch("/api/extract-answer-text", {
      method: "POST",
      body: form
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "The answer file could not be read.");
    }

    return normalizeText(result.text || "");
  }

  function normalizeText(text) {
    return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").toLowerCase();
  }

  function expectedAnswer(topic, subject) {
    const banks = {
      number: ["fraction", "decimal", "integer", "calculation"],
      algebra: ["equation", "simplify", "solve", "substitute"],
      ratio: ["parts", "total", "divide", "proportion"],
      geometry: ["angle", "area", "shape", "length"],
      probability: ["outcomes", "fraction", "independent", "tree"],
      statistics: ["mean", "median", "range", "frequency"],
      proportion: ["direct", "inverse", "multiplier", "ratio"],
      graphs: ["gradient", "intercept", "axis", "coordinate"],
      trigonometry: ["sin", "cos", "tan", "angle"],
      cells: ["nucleus", "cytoplasm", "membrane", "mitochondria"],
      infection: ["pathogen", "immune", "antibody", "vaccine"],
      bioenergetics: ["photosynthesis", "respiration", "glucose", "energy"],
      organisation: ["tissue", "organ", "system", "enzyme"],
      homeostasis: ["negative feedback", "hormone", "control", "receptor"],
      inheritance: ["gene", "allele", "chromosome", "genotype"],
      variation: ["mutation", "environment", "genetic", "continuous"],
      ecology: ["ecosystem", "population", "competition", "biodiversity"],
      evolution: ["selection", "adaptation", "species", "survival"],
      "atomic structure": ["proton", "neutron", "electron", "nucleus"],
      bonding: ["ionic", "covalent", "metallic", "electron"],
      "quantitative chemistry": ["mole", "mass", "concentration", "equation"],
      "chemical changes": ["acid", "alkali", "electrolysis", "reactivity"],
      "energy changes": ["exothermic", "endothermic", "bond", "temperature"],
      rates: ["collision", "temperature", "concentration", "catalyst"],
      "organic chemistry": ["hydrocarbon", "alkane", "functional group", "polymer"],
      analysis: ["test", "ion", "precipitate", "flame"],
      atmosphere: ["carbon dioxide", "greenhouse", "oxygen", "pollutant"],
      resources: ["potable", "water", "life cycle", "recycling"],
      energy: ["transfer", "store", "work", "power"],
      electricity: ["current", "voltage", "resistance", "circuit"],
      "particle model": ["density", "state", "specific heat", "latent heat"],
      forces: ["resultant", "acceleration", "mass", "newton"],
      waves: ["frequency", "wavelength", "amplitude", "speed"],
      magnetism: ["field", "pole", "motor", "electromagnet"],
      "space physics": ["orbit", "red-shift", "star", "universe"],
      "practical skills": ["variable", "method", "uncertainty", "repeat"]
    };
    const keywords = banks[topic] || [topic, subject.toLowerCase(), "explain", "example"];
    return {
      answer: `A good answer should correctly use ${keywords.slice(0, 3).join(", ")} and show clear exam working.`,
      keywords
    };
  }

  function scoreAnswer(paper, answerText, profile, schemeText) {
    let score = 0;
    const answerWords = wordsFrom(answerText);
    const answerWordCount = answerWords.length;
    const isLongAnswer = answerWordCount >= 180 || sentenceCount(answerText) >= 8;
    const schemeSignals = extractMarkSchemeSignals(schemeText, paper);
    const hasSchemeEvidence = schemeSignals.length >= 8;
    const questions = paper.topics.map((topic, index) => {
      const expected = expectedAnswer(topic, paper.subject);
      const topicSchemeSignals = schemeSignals.filter((signal) => signal.includes(topic) || expected.keywords.some((keyword) => signal.includes(keyword)));
      const evidenceKeywords = unique(expected.keywords.concat(topicSchemeSignals)).slice(0, 12);
      const keywordHits = evidenceKeywords.filter((keyword) => answerText.includes(keyword.toLowerCase()));
      const exactHit = answerText.includes(expected.answer.toLowerCase()) ? 1 : 0;
      const workingHit = /because|therefore|so|working|calculate|equals|=/.test(answerText) ? 1 : 0;
      const schemeRatio = evidenceKeywords.length ? keywordHits.length / evidenceKeywords.length : 0;
      const ratio = Math.min(1, (exactHit * 0.2) + (schemeRatio * 0.65) + (workingHit * profile.signals.workingWeight));
      const available = Math.max(2, Math.round(paper.marks / paper.topics.length / 4));
      let awarded = Math.round(available * ratio);
      if (isLongAnswer && (!hasSchemeEvidence || ratio < 0.75)) {
        awarded = Math.min(awarded, Math.floor(available * 0.65));
      }
      score += awarded;
      return {
        number: index + 1,
        topic,
        awarded,
        available,
        feedback: feedbackFor(ratio, profile, isLongAnswer, hasSchemeEvidence),
        matched: keywordHits,
        missed: evidenceKeywords.filter((keyword) => !keywordHits.includes(keyword))
      };
    });
    const total = questions.reduce((sum, question) => sum + question.available, 0);
    const confidence = confidenceFor({ answerWordCount, hasSchemeEvidence, questions });
    return {
      id: Date.now(),
      paperTitle: titleFor(paper),
      score,
      total,
      percent: Math.round((score / total) * 100),
      confidence,
      reviewNote: reviewNoteFor(confidence, isLongAnswer, hasSchemeEvidence),
      questions
    };
  }

  function extractMarkSchemeSignals(schemeText, paper) {
    const stopWords = new Set(["the", "and", "for", "with", "that", "this", "from", "mark", "marks", "scheme", "paper", "answer", "allow", "must", "their", "there", "where", "when", "which", "show", "seen"]);
    const baseWords = wordsFrom(schemeText)
      .filter((word) => word.length >= 4 && !stopWords.has(word) && !/^\d+$/.test(word));
    const counts = new Map();
    baseWords.forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));

    return Array.from(counts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word)
      .concat(paper.topics)
      .slice(0, 80);
  }

  function wordsFrom(text) {
    return Array.from(new Set((text.match(/[a-z][a-z0-9-]{2,}/g) || [])));
  }

  function sentenceCount(text) {
    return (text.match(/[.!?]/g) || []).length;
  }

  function confidenceFor({ answerWordCount, hasSchemeEvidence, questions }) {
    const coverage = questions.reduce((sum, question) => sum + (question.matched.length / Math.max(1, question.matched.length + question.missed.length)), 0) / Math.max(1, questions.length);
    if (!hasSchemeEvidence) return "low";
    if (answerWordCount >= 180 && coverage < 0.65) return "low";
    if (coverage >= 0.72) return "high";
    return "medium";
  }

  function reviewNoteFor(confidence, isLongAnswer, hasSchemeEvidence) {
    if (!hasSchemeEvidence) {
      return "The mark scheme text could not be extracted reliably, so this is a cautious practice check rather than a precise mark.";
    }
    if (isLongAnswer && confidence !== "high") {
      return "Long answer detected. The local marker has capped confidence and is reporting evidence against the mark scheme, not a final examiner-grade judgement.";
    }
    return "The score is still indicative, but it is grounded in terms extracted from the mark scheme.";
  }

  function feedbackFor(ratio, profile, isLongAnswer, hasSchemeEvidence) {
    if (!hasSchemeEvidence) return "Mark scheme evidence was limited, so treat this as a revision checklist.";
    if (isLongAnswer && ratio < 0.75) return "Long answer: enough evidence was not found for a confident high mark. Compare the missing points with the mark scheme.";
    if (ratio >= 0.75) return profile.feedback.high;
    if (ratio >= 0.4) return profile.feedback.medium;
    return profile.feedback.low;
  }

  function renderFeedback() {
    els.feedbackResults.innerHTML = "";
    if (state.marks.length === 0) {
      els.markingStatus.textContent = "No paper has been marked yet.";
      return;
    }

    state.marks.forEach((result) => {
      const card = document.createElement("article");
      card.className = "feedback-card";
      card.innerHTML = `
        <h3>${escapeHtml(result.paperTitle)}</h3>
        <p class="score">Indicative score: ${result.score}/${result.total} (${result.percent}%). Confidence: ${escapeHtml(result.confidence || "medium")}</p>
        <p>${escapeHtml(result.reviewNote || "Use this as a practice check, not a final examiner mark.")}</p>
        ${result.questions.map((question) => `
          <div class="question-result">
            <h4>Question ${question.number}: ${escapeHtml(question.topic)}</h4>
            <p>Marks: ${question.awarded}/${question.available}</p>
            <p>${escapeHtml(question.feedback)}</p>
            <p>Evidence found: ${question.matched && question.matched.length ? escapeHtml(question.matched.join(", ")) : "No strong mark scheme evidence found."}</p>
            <p>Practise next: ${question.missed.length ? escapeHtml(question.missed.join(", ")) : "Keep this topic warm with another paper."}</p>
          </div>
        `).join("")}
      `;
      els.feedbackResults.append(card);
    });
  }

  function clearMarkingResults() {
    state.marks = [];
    saveMarks();
    renderFeedback();
    updateStats();
    announce("Marking results cleared.");
  }

  function updateStats() {
    const downloadedCount = state.downloads.size;
    const markedCount = state.marks.length;
    const waiting = Math.max(0, downloadedCount - markedCount);
    els.downloadCount.textContent = `${downloadedCount} downloads`;
    els.markedCount.textContent = `${markedCount} marked`;
    els.paperTotal.textContent = state.lastResultCount === null ? "Search first" : String(state.lastResultCount);
    els.waitingTotal.textContent = String(waiting);
    els.averageScore.textContent = markedCount
      ? `${Math.round(state.marks.reduce((sum, result) => sum + result.percent, 0) / markedCount)}%`
      : "No marks yet";
    els.recommendation.textContent = markedCount
      ? "Next up: practise the weakest topic from your latest marked paper, then try another paper from the same board."
      : "Choose filters and press Search. Plain text downloads are best for screen readers; Word downloads are still available if you want editable layout.";
  }

  function resetFilters() {
    [els.qualification, els.subject, els.board, els.tier, els.paper].forEach((select) => {
      select.value = "";
    });
    els.search.value = "";
    state.hasSearched = false;
    state.lastResultCount = null;
    setAwaitingSearch();
    updateStats();
    announce("Filters reset. Press Search to list papers.");
    els.qualification.focus();
  }

  async function refreshCatalogue() {
    const originalText = els.refreshCatalogue.textContent;
    els.refreshCatalogue.disabled = true;
    els.refreshCatalogue.setAttribute("aria-disabled", "true");
    els.refreshCatalogue.textContent = "Updating";
    els.resultCount.textContent = "Updating catalogue";
    announce("Updating catalogue. This can take a moment.");

    try {
      const response = await fetch("/api/update-catalogue", { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Catalogue update failed.");
      }

      papers = await loadRealPapers();
      populateCatalogueFilters();
      state.hasSearched = false;
      state.lastResultCount = null;
      setAwaitingSearch();
      updateStats();
      const searched = Number.isFinite(result.searched) ? ` Searched ${result.searched} board and subject pages.` : "";
      announce(`Catalogue updated. ${result.added} papers added.${searched} Press Search to list papers.`);
      els.resultCount.textContent = `Catalogue updated. ${result.added} papers added.${searched}`;
    } catch (error) {
      els.resultCount.textContent = "Catalogue update failed. Check the internet connection and try again.";
      announce("Catalogue update failed. Check the internet connection and try again.");
    } finally {
      els.refreshCatalogue.disabled = false;
      els.refreshCatalogue.removeAttribute("aria-disabled");
      els.refreshCatalogue.textContent = originalText;
      els.refreshCatalogue.focus();
    }
  }

  function announce(message) {
    els.screenReaderStatus.textContent = "";
    window.setTimeout(() => {
      els.screenReaderStatus.textContent = message;
    }, 30);
  }

  function saveDownloads() {
    localStorage.setItem("downloads", JSON.stringify(Array.from(state.downloads)));
  }

  function saveMarks() {
    localStorage.setItem("marks", JSON.stringify(state.marks));
  }

  function slug(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
