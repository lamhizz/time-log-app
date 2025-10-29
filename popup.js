document.addEventListener("DOMContentLoaded", () => {
  const logInput = document.getElementById("log-input");
  const tagSelect = document.getElementById("tag-select");
  const driftedCheck = document.getElementById("drifted-check");
  const submitButton = document.getElementById("submit-log");
  const statusMessage = document.getElementById("status-message");
  const settingsLink = document.getElementById("open-settings");
  const debugToggle = document.getElementById("toggle-debug");
  const debugInfo = document.getElementById("debug-info");
  const debugUrl = document.getElementById("debug-url");
  const debugError = document.getElementById("debug-error");

  // --- Event Listeners ---

  // Submit button click
  submitButton.addEventListener("click", () => {
    submitLog();
  });

  // Add keyboard shortcut
  logInput.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault(); // Prevent new line
      submitLog();
    }
  });

  // Settings link click
  settingsLink.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
  
  // Debug toggle click
  debugToggle.addEventListener("click", () => {
    const isVisible = debugInfo.style.display === "block";
    debugInfo.style.display = isVisible ? "none" : "block";
    debugToggle.textContent = isVisible ? "Show Debug" : "Hide Debug";
    if (!isVisible) {
      loadDebugInfo();
    }
  });

  // --- Helper Functions ---

  function submitLog() {
    const logText = logInput.value.trim();
    const tag = tagSelect.value || ""; // Allow empty tag
    const drifted = driftedCheck.checked;

    if (!logText) {
      showStatus("Please enter a log entry.", "error");
      return;
    }

    setLoading(true);
    const logData = { logText, tag, drifted };
    chrome.runtime.sendMessage({ action: "logWork", data: logData }, handleResponse);
  }

  function handleResponse(response) {
    if (chrome.runtime.lastError) {
      showStatus(`Error: ${chrome.runtime.lastError.message}`, "error");
      setLoading(false);
      return;
    }
    
    if (response && response.status === "success") {
      showStatus("Log saved successfully!", "success");
      logInput.value = "";
      driftedCheck.checked = false;
      setTimeout(() => {
        window.close(); // Close popup on success
      }, 1000);
    } else {
      showStatus(response.message || "An unknown error occurred.", "error");
    }
    setLoading(false);
  }
  
  function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    logInput.disabled = isLoading;
    tagSelect.disabled = isLoading;
    driftedCheck.disabled = isLoading;
    submitButton.textContent = isLoading ? "Logging..." : "Log It (Ctrl+Enter)";
    if (isLoading) {
      showStatus("", "");
    }
  }

  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`;
  }
  
  // Load tags from storage
  function loadTags() {
    chrome.storage.sync.get({ logTags: "Meeting\nFocus Time\nSlack" }, (data) => {
      tagSelect.innerHTML = ""; // Clear existing
      const tags = data.logTags.split('\n').filter(Boolean);
      
      // Add a "no tag" prompt
      const promptOption = document.createElement("option");
      promptOption.value = "";
      promptOption.textContent = "-- No Tag --";
      promptOption.selected = true;
      tagSelect.appendChild(promptOption);
      
      if (tags.length === 0) {
        tags.push("Default"); // Add a fallback
      }
      
      tags.forEach(tag => {
        const option = document.createElement("option");
        option.value = tag;
        option.textContent = tag;
        tagSelect.appendChild(option);
      });
    });
  }
  
  function loadDebugInfo() {
    chrome.runtime.sendMessage({ action: "getDebugInfo" }, (response) => {
      if (response) {
        debugUrl.textContent = response.webAppUrl;
        debugError.textContent = response.lastError;
      }
    });
  }

  function checkDebugMode() {
    chrome.storage.sync.get({ isDebugMode: false }, (data) => {
      debugToggle.style.display = data.isDebugMode ? "inline" : "none";
    });
  }

  // --- Initial Load ---
  loadTags();
  checkDebugMode();
  logInput.focus();
});

