/**
 * @file options.js
 * @description This script manages the extension's options page (options.html).
 * It handles saving and restoring user settings to and from chrome.storage.sync,
 * and provides a connection test for the Google Apps Script URL.
 */

document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Element Selections ---
  const saveButton = document.getElementById("save");
  const statusEl = document.getElementById("status");
  const intervalInput = document.getElementById("log-interval");
  const tagsInput = document.getElementById("log-tags");
  const debugInput = document.getElementById("debug-mode");
  const daysInputs = document.querySelectorAll(".working-days-group input[type='checkbox']");
  const startHourInput = document.getElementById("work-start-hour");
  const endHourInput = document.getElementById("work-end-hour");
  const blockedDomainsInput = document.getElementById("blocked-domains");
  const webAppUrlInput = document.getElementById("web-app-url");
  const logDomainInput = document.getElementById("log-domain");
  const testConnectionButton = document.getElementById("test-connection");
  const notificationSoundInput = document.getElementById("notification-sound");
  const pomodoroEnabledInput = document.getElementById("pomodoro-enabled");

  // --- NEW: Diagnostic UI Elements ---
  const diagnosticResultsEl = document.getElementById("diagnostic-results");
  const diagStep1 = document.getElementById("diag-step-1-url").querySelector("span");
  const diagStep2 = document.getElementById("diag-step-2-connection").querySelector("span");
  const diagStep3 = document.getElementById("diag-step-3-version").querySelector("span");
  const diagStep4 = document.getElementById("diag-step-4-headers").querySelector("span");
  const diagnosticSummaryEl = document.getElementById("diagnostic-summary");

  // Links
  const aboutLink = document.getElementById("about-link");
  const setupLink = document.getElementById("setup-link");
  const dashboardLink = document.getElementById("dashboard-link");

  /**
   * @description Gathers all values from the form inputs and saves them to `chrome.storage.sync`.
   * After saving, it displays a confirmation message and notifies the background script
   * that settings have been updated so it can recreate the alarm.
   */
  function saveOptions() {
    // Collect working days from checkboxes
    const workingDays = Array.from(daysInputs)
      .filter(input => input.checked)
      .map(input => input.dataset.day);
      
    const logInterval = parseInt(intervalInput.value, 10);
    if (isNaN(logInterval) || logInterval < 0) {
      statusEl.textContent = "Log Interval must be 0 or greater.";
      statusEl.style.color = "var(--work-log-error)";
      return;
    }

    // Prepare settings object
    const settings = {
      logInterval: logInterval,
      logTags: tagsInput.value,
      isDebugMode: debugInput.checked,
      workingDays: workingDays,
      workStartHour: parseInt(startHourInput.value.split(':')[0], 10),
      workEndHour: parseInt(endHourInput.value.split(':')[0], 10),
      blockedDomains: blockedDomainsInput.value,
      webAppUrl: webAppUrlInput.value.trim(),
      isDomainLogEnabled: logDomainInput.checked,
      notificationSound: notificationSoundInput.value,
      isPomodoroEnabled: pomodoroEnabledInput.checked
    };

    // Save to Chrome's sync storage
    chrome.storage.sync.set(settings, () => {
      // Display "Settings saved!" message temporarily
      statusEl.textContent = "Settings saved!";
      statusEl.style.color = "var(--work-log-success)";
      setTimeout(() => {
        statusEl.textContent = "";
      }, 1500);

      // Notify the background script to update its alarms
      chrome.runtime.sendMessage({ action: "settingsUpdated" });
    });
  }

  /**
   * @description Restores the user's saved settings from `chrome.storage.sync`
   * and populates the form fields with those values. It uses default values
   * if no settings are found.
   */
  function restoreOptions() {
    const defaults = {
      logInterval: 15,
      logTags: "Meeting\nFocus Time\nSlack\nJira Tasks\nEmailing\nBreak",
      isDebugMode: false,
      workingDays: ["1", "2", "3", "4", "5"], // Mon-Fri
      workStartHour: 9,
      workEndHour: 18,
      blockedDomains: "meet.google.com\nzoom.us\nyoutube.com\ntwitch.tv",
      webAppUrl: "",
      isDomainLogEnabled: false,
      notificationSound: "ClickUp.wav",
      isPomodoroEnabled: true
    };

    chrome.storage.sync.get(defaults, (items) => {
      // Populate input fields with stored values
      intervalInput.value = items.logInterval;
      tagsInput.value = items.logTags;
      debugInput.checked = items.isDebugMode;
      blockedDomainsInput.value = items.blockedDomains;
      webAppUrlInput.value = items.webAppUrl;
      logDomainInput.checked = items.isDomainLogEnabled;
      notificationSoundInput.value = items.notificationSound;
      pomodoroEnabledInput.checked = items.isPomodoroEnabled;

      // Set checked status for working days
      daysInputs.forEach(input => {
        input.checked = items.workingDays.includes(input.dataset.day);
      });

      // Format and set time inputs
      startHourInput.value = items.workStartHour.toString().padStart(2, '0') + ':00';
      endHourInput.value = items.workEndHour.toString().padStart(2, '0') + ':00';
    });
  }
  
  /**
   * @description Resets the diagnostic UI to its initial "Pending..." state.
   */
  function resetDiagnosticsUI() {
    diagnosticResultsEl.style.display = "block";
    diagnosticSummaryEl.textContent = "";
    diagnosticSummaryEl.className = "";

    const steps = [diagStep1, diagStep2, diagStep3, diagStep4];
    steps.forEach(step => {
      step.textContent = "Pending...";
      step.className = "";
    });
  }

  /**
   * @description Updates a single step in the diagnostic UI with a success or error status.
   * @param {HTMLElement} el - The DOM element for the step's status.
   * @param {object} result - The result object for that step.
   * @param {boolean} result.success - Whether the check was successful.
   * @param {string} result.message - The message to display.
   */
  function updateDiagStep(el, result) {
    if (!result) {
      el.textContent = "Skipped.";
      el.className = "";
      return;
    }
    el.textContent = result.message;
    el.className = result.success ? "success" : "error";
  }

  /**
   * @description Initiates the diagnostic process when the "Test Connection" button is clicked.
   */
  function runDiagnostics() {
    const url = webAppUrlInput.value.trim();
    
    resetDiagnosticsUI();
    testConnectionButton.disabled = true;

    // Send message to background script to perform the diagnostics
    chrome.runtime.sendMessage({ action: "runDiagnostics", url: url }, (report) => {
      if (chrome.runtime.lastError) {
        diagnosticSummaryEl.textContent = `Critical Error: ${chrome.runtime.lastError.message}`;
        diagnosticSummaryEl.className = "error";
        testConnectionButton.disabled = false;
        return;
      }

      // Update UI based on the report
      updateDiagStep(diagStep1, report.checks.url);
      updateDiagStep(diagStep2, report.checks.connection);
      updateDiagStep(diagStep3, report.checks.version);
      updateDiagStep(diagStep4, report.checks.headers);

      // Display the final summary message
      if (report.overallStatus === "success") {
        diagnosticSummaryEl.textContent = "Success! Your setup is complete and ready to log.";
        diagnosticSummaryEl.className = "success";
      } else {
        diagnosticSummaryEl.textContent = "Error: Your setup has problems. Please fix the failed steps and try again.";
        diagnosticSummaryEl.className = "error";
      }

      testConnectionButton.disabled = false; // Re-enable button
    });
  }

  // --- Initial Setup & Event Listeners ---

  /**
   * @description Initializes the options page by restoring settings and setting up event listeners.
   */
  function initialize() {
    restoreOptions();
    saveButton.addEventListener("click", saveOptions);
    testConnectionButton.addEventListener("click", runDiagnostics);
    
    // Link listeners
    dashboardLink.addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    });
    aboutLink.addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("about.html") });
    });
    setupLink.addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
    });
  }

  initialize();
});

