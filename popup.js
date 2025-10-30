document.addEventListener("DOMContentLoaded", () => {
  // --- Log Form Elements ---
  const logFormContainer = document.getElementById("log-form-container");
  const logInput = document.getElementById("log-input");
  const tagSelect = document.getElementById("tag-select");
  const mruTagsContainer = document.getElementById("mru-tags-container"); // [UX-10]
  const driftedCheck = document.getElementById("drifted-check");
  const submitButton = document.getElementById("submit-log");
  const statusMessage = document.getElementById("status-message");

  // --- Timer Elements [UX-12] ---
  const timerContainer = document.querySelector(".timer-container");
  const startTaskContainer = document.getElementById("start-task-container");
  const taskNameInput = document.getElementById("task-name-input");
  const startTaskButton = document.getElementById("start-task-btn");
  const activeTaskContainer = document.getElementById("active-task-container");
  const activeTaskName = document.getElementById("active-task-name");
  const activeTaskTimer = document.getElementById("active-task-timer");
  const stopTaskButton = document.getElementById("stop-task-btn");
  const formDivider = document.getElementById("form-divider");
  let timerInterval = null;

  // --- Footer Elements ---
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
  
  // --- Timer Listeners [UX-12] ---
  startTaskButton.addEventListener("click", () => {
    const taskName = taskNameInput.value.trim();
    if (!taskName) {
      showStatus("Please enter a task name.", "error");
      return;
    }
    const task = { name: taskName, startTime: Date.now() };
    chrome.storage.local.set({ activeTask: task }, () => {
      chrome.runtime.sendMessage({ action: "startTimer" });
      showTimerUI(task);
    });
  });
  
  stopTaskButton.addEventListener("click", () => {
    if (timerInterval) clearInterval(timerInterval);
    
    chrome.storage.local.get({ activeTask: null }, (data) => {
      if (data.activeTask) {
        chrome.storage.local.remove("activeTask", () => {
          chrome.runtime.sendMessage({ action: "stopTimer" });
          
          const durationMs = Date.now() - data.activeTask.startTime;
          const durationMins = Math.round(durationMs / 60000);
          
          showLogUI(); // Show the log form
          
          // Pre-fill the log
          let logText = data.activeTask.name;
          if (durationMins > 0) {
            logText += ` (approx. ${durationMins} min)`;
          }
          logInput.value = logText;
          logInput.focus();
        });
      } else {
        showLogUI(); // Failsafe
      }
    });
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

    chrome.runtime.sendMessage({ action: "getActiveTabInfo" }, (tabInfo) => {
      if (chrome.runtime.lastError) {
        console.warn("Could not get active tab info:", chrome.runtime.lastError.message);
      }

      const domain = tabInfo ? tabInfo.domain : "";
      
      const logData = { 
        logText, 
        tag, 
        drifted,
        domain: domain
      };
      
      chrome.runtime.sendMessage({ action: "logWork", data: logData }, handleResponse);
    });
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
  
  // [UX-10] Load tags and MRU tags
  function loadTagsAndMru() {
    // 1. Load standard tags
    chrome.storage.sync.get({ logTags: "Meeting\nFocus Time\nSlack" }, (data) => {
      tagSelect.innerHTML = ""; // Clear existing
      const tags = data.logTags.split('\n').filter(Boolean);
      
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
    
    // 2. Load MRU tags
    chrome.runtime.sendMessage({ action: "getMruTags" }, (mruTags) => {
      mruTagsContainer.innerHTML = ""; // Clear
      if (mruTags && mruTags.length > 0) {
        mruTags.forEach(tag => {
          const button = document.createElement("button");
          button.className = "mru-tag-btn";
          button.textContent = tag;
          button.title = `Select tag: ${tag}`;
          button.addEventListener("click", (e) => {
            e.preventDefault();
            tagSelect.value = tag;
          });
          mruTagsContainer.appendChild(button);
        });
      }
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
  
  // --- [UX-12] Timer UI Functions ---
  
  function checkActiveTimer() {
    chrome.storage.local.get({ activeTask: null }, (data) => {
      if (data.activeTask) {
        showTimerUI(data.activeTask);
      } else {
        showLogUI();
      }
    });
  }

  function showTimerUI(task) {
    logFormContainer.style.display = "none";
    formDivider.style.display = "none";
    
    startTaskContainer.style.display = "none";
    activeTaskContainer.style.display = "block";
    
    activeTaskName.textContent = task.name;
    
    if (timerInterval) clearInterval(timerInterval);
    updateTimerDisplay(task.startTime); // Run once immediately
    timerInterval = setInterval(() => {
      updateTimerDisplay(task.startTime);
    }, 1000);
  }
  
  function showLogUI() {
    logFormContainer.style.display = "block";
    formDivider.style.display = "block";
    
    startTaskContainer.style.display = "flex";
    activeTaskContainer.style.display = "none";
    
    taskNameInput.value = "";
    
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function updateTimerDisplay(startTime) {
    const elapsedMs = Date.now() - startTime;
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    activeTaskTimer.textContent = 
      `${hours.toString().padStart(2, '0')}:` +
      `${minutes.toString().padStart(2, '0')}:` +
      `${seconds.toString().padStart(2, '0')}`;
  }

  // --- Initial Load ---
  loadTagsAndMru(); // [UX-10]
  checkDebugMode();
  checkActiveTimer(); // [UX-12]
  // logInput.focus(); // Only focus if log form is visible
  if (logFormContainer.style.display !== "none") {
    logInput.focus();
  }
});
