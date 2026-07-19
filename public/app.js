document.addEventListener("DOMContentLoaded", () => {
  let history = [];
  let isGenerating = false;
  let abortController = null;

  const themeToggle = document.getElementById("themeToggle");
  const body = document.body;

  const sidebar = document.getElementById("sidebar");
  const menuToggleBtn = document.getElementById("menuToggleBtn");
  const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");
  const historyList = document.getElementById("historyList");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");

  const promptInput = document.getElementById("promptInput");
  const charCounter = document.getElementById("charCounter");
  const generateBtn = document.getElementById("generateBtn");
  const stopGenerationBtn = document.getElementById("stopGenerationBtn");
  const quickExamples = document.querySelectorAll(".example-tag");

  const loadingCard = document.getElementById("loadingCard");
  const stepOpenAI = document.getElementById("step-openai");
  const stepGroq = document.getElementById("step-groq");
  const stepOpenRouter = document.getElementById("step-openrouter");
  const stepSynthesis = document.getElementById("step-synthesis");

  const resultsSection = document.getElementById("resultsSection");
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabPanels = document.querySelectorAll(".tab-panel");
  const consensusOutput = document.getElementById("consensusOutput");
  const openaiRawOutput = document.getElementById("openaiRawOutput");
  const groqRawOutput = document.getElementById("groqRawOutput");
  const openrouterRawOutput = document.getElementById("openrouterRawOutput");

  const openaiRawText = document.getElementById("openaiRawText");
  const groqRawText = document.getElementById("groqRawText");
  const openrouterRawText = document.getElementById("openrouterRawText");
  const consensusRawText = document.getElementById("consensusRawText");
  const copyConsensusBtn = document.getElementById("copyConsensusBtn");

  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light") {
    body.classList.remove("dark-mode");
    body.classList.add("light-mode");
    themeToggle.checked = false;
    updateThemeLabels(false);
  } else {
    body.classList.remove("light-mode");
    body.classList.add("dark-mode");
    themeToggle.checked = true;
    updateThemeLabels(true);
  }

  themeToggle.addEventListener("change", (e) => {
    const isDark = e.target.checked;
    if (isDark) {
      body.classList.remove("light-mode");
      body.classList.add("dark-mode");
      localStorage.setItem("theme", "dark");
    } else {
      body.classList.remove("dark-mode");
      body.classList.add("light-mode");
      localStorage.setItem("theme", "light");
    }
    updateThemeLabels(isDark);
  });

  function updateThemeLabels(isDark) {
    const labels = document.querySelectorAll(".mode-label");
    if (labels.length >= 2) {
      if (isDark) {
        labels[0].classList.remove("active");
        labels[1].classList.add("active");
      } else {
        labels[0].classList.add("active");
        labels[1].classList.remove("active");
      }
    }
  }

  menuToggleBtn.addEventListener("click", () => {
    sidebar.classList.add("open");
  });

  sidebarCloseBtn.addEventListener("click", () => {
    sidebar.classList.remove("open");
  });

  document.addEventListener("click", (e) => {
    if (window.innerWidth <= 768) {
      if (
        !sidebar.contains(e.target) &&
        !menuToggleBtn.contains(e.target) &&
        sidebar.classList.contains("open")
      ) {
        sidebar.classList.remove("open");
      }
    }
  });

  promptInput.addEventListener("input", () => {
    const len = promptInput.value.length;
    charCounter.textContent = `${len} / 2000`;
  });

  promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      generateBtn.click();
    }
  });

  quickExamples.forEach((tag) => {
    tag.addEventListener("click", () => {
      if (isGenerating) return;
      promptInput.value = tag.getAttribute("data-prompt");
      promptInput.dispatchEvent(new Event("input"));
      promptInput.focus();
    });
  });

  // Cancel evaluation request
  stopGenerationBtn.addEventListener("click", () => {
    if (abortController) {
      abortController.abort();
    }
  });

  async function loadHistory() {
    try {
      const res = await fetch("/api/history");
      if (!res.ok) throw new Error("History fetch failed");
      history = await res.json();
      renderHistoryList();
    } catch (err) {
      console.error("Error loading history:", err);
    }
  }

  clearHistoryBtn.addEventListener("click", async () => {
    if (history.length === 0) return;
    if (!confirm("Are you sure you want to clear all history?")) return;

    try {
      const res = await fetch("/api/history", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to clear history");
      history = [];
      renderHistoryList();
      resultsSection.classList.add("hidden");
    } catch (err) {
      alert("Error clearing history: " + err.message);
    }
  });

  function renderHistoryList() {
    historyList.innerHTML = "";

    if (history.length === 0) {
      historyList.innerHTML = `
                <div class="history-empty">
                    <i class="fa-solid fa-folder-open"></i>
                    <p>No queries yet</p>
                </div>
            `;
      return;
    }

    const sortedHistory = [...history].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
    );

    sortedHistory.forEach((entry) => {
      const item = document.createElement("div");
      item.className = "history-item";
      item.setAttribute("data-id", entry.id);

      const timeString = new Date(entry.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const dateString = new Date(entry.timestamp).toLocaleDateString([], {
        month: "short",
        day: "numeric",
      });

      item.innerHTML = `
                <div class="history-item-prompt">${escapeHTML(entry.prompt)}</div>
                <div class="history-item-time"><i class="fa-regular fa-clock"></i> ${dateString}, ${timeString}</div>
            `;

      item.addEventListener("click", () => {
        document
          .querySelectorAll(".history-item")
          .forEach((el) => el.classList.remove("active"));
        item.classList.add("active");

        loadHistoryEntry(entry);
        if (window.innerWidth <= 768) {
          sidebar.classList.remove("open");
        }
      });

      historyList.appendChild(item);
    });
  }

  function loadHistoryEntry(entry) {
    promptInput.value = entry.prompt;
    promptInput.dispatchEvent(new Event("input"));

    resultsSection.classList.remove("hidden");
    loadingCard.classList.add("hidden");

    consensusOutput.innerHTML = marked.parse(entry.finalAnswer);
    consensusRawText.value = entry.finalAnswer;

    const historicalNotice =
      "> [!NOTE]\n> Individual raw responses are not preserved in the historical logs. Run a new synthesis query to see side-by-side comparisons.";
    openaiRawOutput.innerHTML = marked.parse(historicalNotice);
    groqRawOutput.innerHTML = marked.parse(historicalNotice);
    openrouterRawOutput.innerHTML = marked.parse(historicalNotice);

    resultsSection.scrollIntoView({ behavior: "smooth" });
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => b.classList.remove("active"));
      tabPanels.forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");
      const targetPanel = document.getElementById(btn.getAttribute("data-tab"));
      if (targetPanel) targetPanel.classList.add("active");
    });
  });

  generateBtn.addEventListener("click", async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    isGenerating = true;
    generateBtn.disabled = true;
    resultsSection.classList.add("hidden");
    loadingCard.classList.remove("hidden");

    loadingCard.scrollIntoView({ behavior: "smooth" });

    resetLoadingSteps();

    setStepState(stepOpenAI, "running", "Querying...");
    setStepState(stepGroq, "running", "Querying...");
    setStepState(stepOpenRouter, "running", "Querying...");

    abortController = new AbortController();

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: abortController.signal
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Generation request failed");
      }

      const data = await response.json();

      setStepState(stepOpenAI, "done", "Completed");
      setStepState(stepGroq, "done", "Completed");
      setStepState(stepOpenRouter, "done", "Completed");

      setStepState(
        stepSynthesis,
        "running",
        "Synthesizing consensus report...",
      );

      setStepState(stepSynthesis, "done", "Synthesis Complete");

      consensusOutput.innerHTML = marked.parse(data.final);
      openaiRawOutput.innerHTML = marked.parse(data.raw.openai);
      groqRawOutput.innerHTML = marked.parse(data.raw.groq);
      openrouterRawOutput.innerHTML = marked.parse(data.raw.openrouter);

      consensusRawText.value = data.final;
      openaiRawText.value = data.raw.openai;
      groqRawText.value = data.raw.groq;
      openrouterRawText.value = data.raw.openrouter;

      loadingCard.classList.add("hidden");
      resultsSection.classList.remove("hidden");
      resultsSection.scrollIntoView({ behavior: "smooth" });

      await loadHistory();
    } catch (err) {
      if (err.name === "AbortError") {
        console.log("Evaluation stopped by user.");
      } else {
        console.error(err);
        alert("Error generating response: " + err.message);
      }
      loadingCard.classList.add("hidden");
    } finally {
      isGenerating = false;
      generateBtn.disabled = false;
      abortController = null;
    }
  });

  function resetLoadingSteps() {
    [stepOpenAI, stepGroq, stepOpenRouter].forEach((step) => {
      const icon = step.querySelector(".step-icon");
      const status = step.querySelector(".step-status");
      step.className = "step";
      icon.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
      status.textContent = "Waiting...";
    });

    const icon = stepSynthesis.querySelector(".step-icon");
    const status = stepSynthesis.querySelector(".step-status");
    stepSynthesis.className = "step";
    icon.innerHTML = '<i class="fa-regular fa-circle"></i>';
    status.textContent = "Waiting...";
  }

  function setStepState(stepElement, state, statusText) {
    stepElement.className = `step ${state}`;
    const status = stepElement.querySelector(".step-status");
    status.textContent = statusText;

    const icon = stepElement.querySelector(".step-icon");
    if (state === "done") {
      icon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
    } else if (state === "running") {
      icon.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
    }
  }

  copyConsensusBtn.addEventListener("click", () => {
    copyTextToClipboard(consensusRawText.value, copyConsensusBtn);
  });

  const copyModelBtns = document.querySelectorAll(".copy-model-btn");
  copyModelBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const textarea = document.getElementById(targetId);
      if (textarea) {
        copyTextToClipboard(textarea.value, btn);
      }
    });
  });

  function copyTextToClipboard(text, btnElement) {
    if (!navigator.clipboard) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        showCopySuccess(btnElement);
      } catch (err) {
        console.error("Fallback copy failed", err);
      }
      document.body.removeChild(textarea);
      return;
    }

    navigator.clipboard.writeText(text).then(
      () => {
        showCopySuccess(btnElement);
      },
      (err) => {
        console.error("Could not copy text: ", err);
      },
    );
  }

  function showCopySuccess(btnElement) {
    const icon = btnElement.querySelector("i");
    const originalClass = icon.className;

    icon.className = "fa-solid fa-check text-accent";
    btnElement.style.borderColor = "var(--accent-primary)";
    btnElement.style.backgroundColor = "var(--accent-light)";

    setTimeout(() => {
      icon.className = originalClass;
      btnElement.style.borderColor = "";
      btnElement.style.backgroundColor = "";
    }, 2000);
  }

  function escapeHTML(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  loadHistory();
});
