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
  const testStatusEl = document.getElementById("test-status");
  const notificationSoundInput = document.getElementById("notification-sound");
  const pomodoroEnabledInput = document.getElementById("pomodoro-enabled");

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
   * @description Sends the Google Apps Script URL to the background script for a live connection test.
   * Updates the UI with the result of the test (success or failure).
   */
  function testConnection() {
    const url = webAppUrlInput.value.trim();
    if (!url) {
      testStatusEl.textContent = "Please enter a URL first.";
      testStatusEl.className = "error";
      return;
    }
    
    // Update UI to show testing is in progress
    testStatusEl.textContent = "Testing...";
    testStatusEl.className = "";
    testConnectionButton.disabled = true;
    
    // Send message to background script to perform the fetch test
    chrome.runtime.sendMessage({ action: "testConnection", url: url }, (response) => {
      if (chrome.runtime.lastError) {
        testStatusEl.textContent = `Error: ${chrome.runtime.lastError.message}`;
        testStatusEl.className = "error";
      } else if (response.status === "success") {
        testStatusEl.textContent = `Success! ${response.message}`;
        testStatusEl.className = "success";
      } else {
        testStatusEl.textContent = `Failed: ${response.message || "Unknown error"}`;
        testStatusEl.className = "error";
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
    testConnectionButton.addEventListener("click", testConnection);
    
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

