/**
 * @file popup.js
 * @description This script manages the functionality of the extension's popup window (popup.html).
 * It handles manual log submissions, the task timer, and provides links to settings and debug info.
 */

document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Element Selections ---

  // Log Form Elements
  const logFormContainer = document.getElementById("log-form-container");
  const logInput = document.getElementById("log-input");
  const tagSelect = document.getElementById("tag-select");
  const mruTagsContainer = document.getElementById("mru-tags-container");
  const driftedCheck = document.getElementById("drifted-check");
  const reactiveCheck = document.getElementById("reactive-check");
  const submitButton = document.getElementById("submit-log");
  const statusMessage = document.getElementById("status-message");

  // Timer Elements
  const startTaskContainer = document.getElementById("start-task-container");
  const taskNameInput = document.getElementById("task-name-input");
  const startTaskButton = document.getElementById("start-task-btn");
  const activeTaskContainer = document.getElementById("active-task-container");
  const activeTaskName = document.getElementById("active-task-name");
  const activeTaskTimer = document.getElementById("active-task-timer");
  const stopTaskButton = document.getElementById("stop-task-btn");
  const formDivider = document.getElementById("form-divider");
  let timerInterval = null; // Holds the setInterval ID for the timer

  // Footer Elements
  const settingsLink = document.getElementById("open-settings");
  const debugToggle = document.getElementById("toggle-debug");
  const debugInfo = document.getElementById("debug-info");
  const debugUrl = document.getElementById("debug-url");
  const debugError = document.getElementById("debug-error");

  // --- Event Listener Setup ---

  // Handle log submission via button click
  submitButton.addEventListener("click", () => submitLog());

  // Handle log submission via Ctrl+Enter or Cmd+Enter
  logInput.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submitLog();
    }
  });
  
  // Handle starting a new task timer
  startTaskButton.addEventListener("click", () => {
    const taskName = taskNameInput.value.trim();
    if (!taskName) {
      showStatus("Please enter a task name.", "error");
      return;
    }
    const task = { name: taskName, startTime: Date.now() };
    // Save task to local storage and notify background script
    chrome.storage.local.set({ activeTask: task }, () => {
      chrome.runtime.sendMessage({ action: "startTimer" });
      showTimerUI(task);
    });
  });
  
  // Handle stopping the active task timer
  stopTaskButton.addEventListener("click", () => {
    if (timerInterval) clearInterval(timerInterval);
    
    chrome.storage.local.get({ activeTask: null }, (data) => {
      if (data.activeTask) {
        // Clear the task from storage and notify background script
        chrome.storage.local.remove("activeTask", () => {
          chrome.runtime.sendMessage({ action: "stopTimer" });
          
          const durationMs = Date.now() - data.activeTask.startTime;
          const durationMins = Math.round(durationMs / 60000);
          
          showLogUI(); // Switch back to the logging UI
          
          // Pre-fill the log input with task name and duration
          let logText = data.activeTask.name;
          if (durationMins > 0) {
            logText += ` (approx. ${durationMins} min)`;
          }
          logInput.value = logText;
          driftedCheck.checked = false;
          reactiveCheck.checked = false;
          logInput.focus();
        });
      } else {
        showLogUI(); // Should not happen, but ensures UI is correct
      }
    });
  });

  // Open the options page
  settingsLink.addEventListener("click", () => chrome.runtime.openOptionsPage());
  
  // Toggle the visibility of the debug information section
  debugToggle.addEventListener("click", () => {
    const isVisible = debugInfo.style.display === "block";
    debugInfo.style.display = isVisible ? "none" : "block";
    debugToggle.textContent = isVisible ? "Show Debug" : "Hide Debug";
    if (!isVisible) {
      loadDebugInfo(); // Load fresh debug info when showing
    }
  });

  // --- Core Functions ---

  /**
   * @description Gathers log data from the form, retrieves the active tab's domain,
   * and sends it to the background script to be logged.
   */
  function submitLog() {
    const logText = logInput.value.trim();
    if (!logText) {
      showStatus("Please enter a log entry.", "error");
      return;
    }

    setLoading(true); // Disable form controls

    // Get the domain from the active tab to include in the log
    chrome.runtime.sendMessage({ action: "getActiveTabInfo" }, (tabInfo) => {
      const logData = { 
        logText, 
        tag: tagSelect.value || "",
        drifted: driftedCheck.checked,
        reactive: reactiveCheck.checked,
        domain: (tabInfo && tabInfo.domain) ? tabInfo.domain : ""
      };
      
      // Send the completed log data to the background script
      chrome.runtime.sendMessage({ action: "logWork", data: logData }, handleResponse);
    });
  }

  /**
   * @description Callback function to handle the response from the background script after a log attempt.
   * @param {object} response - The response object from the background script.
   */
  function handleResponse(response) {
    if (chrome.runtime.lastError) {
      showStatus(`Error: ${chrome.runtime.lastError.message}`, "error");
      setLoading(false);
      return;
    }
    
    if (response && response.status === "success") {
      showStatus("Log saved successfully!", "success");
      logInput.value = ""; // Clear input on success
      driftedCheck.checked = false;
      reactiveCheck.checked = false;
      setTimeout(() => window.close(), 1000); // Close popup after a short delay
    } else {
      showStatus(response.message || "An unknown error occurred.", "error");
    }
    setLoading(false);
  }
  
  // --- UI & State Management Functions ---

  /**
   * @description Enables or disables form elements to prevent multiple submissions.
   * @param {boolean} isLoading - True to disable elements, false to enable them.
   */
  function setLoading(isLoading) {
    const elements = [submitButton, logInput, tagSelect, driftedCheck, reactiveCheck];
    elements.forEach(el => el.disabled = isLoading);
    submitButton.textContent = isLoading ? "Logging..." : "Log It (Ctrl+Enter)";
    if (isLoading) showStatus("", ""); // Clear status while loading
  }

  /**
   * @description Displays a status message to the user.
   * @param {string} message - The text to display.
   * @param {'success'|'error'} type - The class to apply for styling (green/red).
   */
  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`;
  }
  
  /**
   * @description Fetches and populates the tag dropdown and MRU tag buttons from storage.
   */
  function loadTagsAndMru() {
    // Populate the main tag dropdown
    chrome.storage.sync.get({ logTags: "Meeting\nFocus Time\nSlack" }, (data) => {
      tagSelect.innerHTML = `<option value="" selected>-- No Tag --</option>`;
      const tags = data.logTags.split('\n').filter(Boolean);
      tags.forEach(tag => {
        tagSelect.innerHTML += `<option value="${tag}">${tag}</option>`;
      });
    });
    
    // Populate the MRU (Most Recently Used) tag buttons
    chrome.runtime.sendMessage({ action: "getMruTags" }, (mruTags) => {
      mruTagsContainer.innerHTML = "";
      if (mruTags && mruTags.length > 0) {
        mruTags.forEach(tag => {
          const button = document.createElement("button");
          button.className = "mru-tag-btn";
          button.textContent = tag;
          button.title = `Select tag: ${tag}`;
          button.addEventListener("click", (e) => {
            e.preventDefault();
            tagSelect.value = tag; // Set the dropdown value when an MRU button is clicked
          });
          mruTagsContainer.appendChild(button);
        });
      }
    });
  }
  
  /**
   * @description Fetches and displays debug info from the background script.
   */
  function loadDebugInfo() {
    chrome.runtime.sendMessage({ action: "getDebugInfo" }, (response) => {
      if (response) {
        debugUrl.textContent = response.webAppUrl;
        debugError.textContent = response.lastError;
      }
    });
  }

  /**
   * @description Checks if debug mode is enabled and shows the debug toggle if it is.
   */
  function checkDebugMode() {
    chrome.storage.sync.get({ isDebugMode: false }, (data) => {
      debugToggle.style.display = data.isDebugMode ? "inline" : "none";
    });
  }
  
  /**
   * @description Checks for an active task in storage and displays the appropriate UI.
   */
  function checkActiveTimer() {
    chrome.storage.local.get({ activeTask: null }, (data) => {
      if (data.activeTask) {
        showTimerUI(data.activeTask);
      } else {
        showLogUI();
      }
    });
  }

  /**
   * @description Hides the log form and shows the active timer UI.
   * @param {object} task - The active task object from storage.
   * @param {string} task.name - The name of the task.
   * @param {number} task.startTime - The timestamp when the task was started.
   */
  function showTimerUI(task) {
    logFormContainer.style.display = "none";
    formDivider.style.display = "none";
    startTaskContainer.style.display = "none";
    activeTaskContainer.style.display = "block";
    
    activeTaskName.textContent = task.name;
    
    if (timerInterval) clearInterval(timerInterval);
    updateTimerDisplay(task.startTime); // Initial display
    timerInterval = setInterval(() => updateTimerDisplay(task.startTime), 1000); // Update every second
  }
  
  /**
   * @description Hides the timer UI and shows the main log form.
   */
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

  /**
   * @description Calculates and updates the timer display based on the start time.
   * @param {number} startTime - The timestamp when the task started.
   */
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

  // --- Initial Load Logic ---

  /**
   * @description The main function to run when the popup is opened.
   * It loads necessary data and sets up the correct UI state.
   */
  function initialize() {
    loadTagsAndMru();
    checkDebugMode();
    checkActiveTimer();
    // Set focus to the log input if the log form is visible
    if (logFormContainer.style.display !== "none") {
      logInput.focus();
    }

    chrome.storage.sync.get({ pomodoroEnabled: false }, (settings) => {
      if (settings.pomodoroEnabled) {
        document.getElementById("pomodoro-container").style.display = "block";
        updatePomodoroUI();
      }
    });

    document.getElementById("pomodoro-start").addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "startPomodoro", session: "focus" });
    });
  }

  function updatePomodoroUI() {
    chrome.storage.local.get({ pomodoroState: { session: "focus", sessionsCompleted: 0 } }, (data) => {
      const { session, sessionsCompleted } = data.pomodoroState;
      const title = document.getElementById("pomodoro-title");
      const timer = document.getElementById("pomodoro-timer");

      if (session === "focus") {
        title.textContent = `Focus Session ${sessionsCompleted + 1}`;
      } else if (session === "shortBreak") {
        title.textContent = "Short Break";
      } else {
        title.textContent = "Long Break";
      }
      // Timer display would require more complex logic to sync with the background script's alarms.
      // For now, we'll just show the state.
      timer.textContent = "";
    });
  }

  initialize();
});
