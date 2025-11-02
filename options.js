/**
 * @file options.js
 * @description This script manages the extension's options page (options.html).
 * It handles page navigation, saving/restoring settings, and connection diagnostics.
 */

document.addEventListener("DOMContentLoaded", () => {
  
  // --- Page Navigation ---
  const navLinks = document.querySelectorAll(".nav-link");
  const pages = document.querySelectorAll(".page-content");
  const dashboardLink = document.getElementById("nav-dashboard-link");
  const privacyLink = document.getElementById("nav-privacy-link"); // Get privacy link

  /**
   * @description Handles navigation between pages within the options.html file.
   * @param {string} pageName - The name of the page to show (e.g., "settings", "about").
   */
  function showPage(pageName) {
    // Hide all pages
    pages.forEach(page => {
      page.classList.remove("active");
    });
    // Deactivate all nav links
    navLinks.forEach(link => {
      link.classList.remove("active");
    });

    // Show the target page
    const targetPage = document.getElementById(`page-${pageName}`);
    const targetLink = document.querySelector(`.nav-link[data-page="${pageName}"]`);
    
    if (targetPage) {
      targetPage.classList.add("active");
    } else {
      // Default to settings if page not found
      document.getElementById("page-settings").classList.add("active");
    }

    if (targetLink) {
      targetLink.classList.add("active");
    } else {
      // Default to settings link
      document.querySelector('.nav-link[data-page="settings"]').classList.add("active");
    }
  }

  // Add click listeners to nav links (excluding privacy)
  navLinks.forEach(link => {
    if (link.id === 'nav-privacy-link') return; // Skip privacy link
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const pageName = link.getAttribute("data-page");
      if (pageName) {
        // Update URL hash for simple routing
        window.location.hash = pageName;
        showPage(pageName);
      }
    });
  });
  
  // Add separate listener for Privacy link to open in new tab
  if (privacyLink) {
    privacyLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL("privacy_policy.html") });
    });
  }

  // Open dashboard in a new tab
  dashboardLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  });

  /**
   * @description Checks the URL hash or query parameters to show the correct page on load.
   */
  function handlePageLoadRouting() {
    let pageName = "settings"; // Default page
    
    // Check hash (e.g., #about)
    if (window.location.hash) {
      pageName = window.location.hash.substring(1);
    } else {
      // Check query param (e.g., ?page=about)
      const urlParams = new URLSearchParams(window.location.search);
      const pageQuery = urlParams.get('page');
      if (pageQuery) {
        pageName = pageQuery;
        // Add to hash so reloads work as expected
        window.location.hash = pageName;
      }
    }

    // Don't show privacy page inline
    if (pageName === 'privacy') {
      pageName = 'settings';
      window.location.hash = 'settings';
    }
    showPage(pageName);
  }

  // --- Settings Form ---
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
  const volumeInput = document.getElementById("notification-volume");
  const volumeDisplay = document.getElementById("volume-display");
  const saveUrlButton = document.getElementById("save-url-btn");
  const testSoundButton = document.getElementById("test-sound"); // Added
  const openScriptPageButton = document.getElementById("open-script-page-btn"); // Renamed

  // Diagnostic UI Elements
  const diagnosticResultsEl = document.getElementById("diagnostic-results");
  const diagStep1 = document.getElementById("diag-step-1-url");
  const diagStep2 = document.getElementById("diag-step-2-connection");
  const diagStep3 = document.getElementById("diag-step-3-version");
  const diagStep4 = document.getElementById("diag-step-4-headers");
  const diagnosticSummaryEl = document.getElementById("diagnostic-summary");

  /**
   * @description Gathers all values from the form and saves them to chrome.storage.sync.
   */
  function saveOptions() {
    const workingDays = Array.from(daysInputs)
      .filter(input => input.checked)
      .map(input => input.dataset.day);
      
    const logInterval = parseInt(intervalInput.value, 10);
    if (isNaN(logInterval) || logInterval < 0) {
      statusEl.textContent = "Log Interval must be 0 or greater.";
      statusEl.style.color = "var(--work-log-error)";
      return;
    }

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
      notificationVolume: parseFloat(volumeInput.value),
      isPomodoroEnabled: pomodoroEnabledInput.checked
    };

    chrome.storage.sync.set(settings, () => {
      statusEl.textContent = "Settings saved!";
      statusEl.style.color = "var(--work-log-success)";
      setTimeout(() => {
        statusEl.textContent = "";
      }, 1500);

      chrome.runtime.sendMessage({ action: "settingsUpdated" });
    });
  }

  /**
   * @description Restores saved settings from chrome.storage.sync.
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
      notificationVolume: 0.5,
      isPomodoroEnabled: true
    };

    chrome.storage.sync.get(defaults, (items) => {
      intervalInput.value = items.logInterval;
      tagsInput.value = items.logTags;
      debugInput.checked = items.isDebugMode;
      blockedDomainsInput.value = items.blockedDomains;
      webAppUrlInput.value = items.webAppUrl;
      logDomainInput.checked = items.isDomainLogEnabled;
      notificationSoundInput.value = items.notificationSound;
      pomodoroEnabledInput.checked = items.isPomodoroEnabled;
      volumeInput.value = items.notificationVolume;
      volumeDisplay.textContent = `${Math.round(items.notificationVolume * 100)}%`;

      daysInputs.forEach(input => {
        input.checked = items.workingDays.includes(input.dataset.day);
      });

      startHourInput.value = items.workStartHour.toString().padStart(2, '0') + ':00';
      endHourInput.value = items.workEndHour.toString().padStart(2, '0') + ':00';
    });
  }
  
  /**
   * @description Resets the diagnostic UI to its "Pending..." state.
   */
  function resetDiagnosticsUI() {
    diagnosticResultsEl.style.display = "block";
    diagnosticSummaryEl.textContent = "";
    diagnosticSummaryEl.className = "";

    const steps = [diagStep1, diagStep2, diagStep3, diagStep4];
    steps.forEach(step => {
      const icon = step.querySelector(".diag-icon");
      const status = step.querySelector(".diag-status");
      icon.textContent = "help"; // Google Icon name
      icon.className = "material-symbols-outlined diag-icon pending";
      status.textContent = "Pending...";
      status.className = "diag-status pending";
    });
  }

  /**
   * @description Updates a single step in the diagnostic UI.
   * @param {HTMLElement} el - The <li> element for the step.
   * @param {object} result - The result object for that step.
   */
  function updateDiagStep(el, result) {
    const icon = el.querySelector(".diag-icon");
    const status = el.querySelector(".diag-status");
    
    if (!result) {
      icon.textContent = "help";
      icon.className = "material-symbols-outlined diag-icon pending";
      status.textContent = "Skipped.";
      status.className = "diag-status pending";
      return;
    }

    const iconName = result.success ? "check_circle" : "error";
    const statusClass = result.success ? "success" : "error";

    icon.textContent = iconName;
    icon.className = `material-symbols-outlined diag-icon ${statusClass}`;
    status.textContent = result.message;
    status.className = `diag-status ${statusClass}`;
  }

  /**
   * @description Runs the connection diagnostic test.
   */
  function runDiagnostics() {
    const url = webAppUrlInput.value.trim();
    
    resetDiagnosticsUI();
    testConnectionButton.disabled = true;
    saveUrlButton.disabled = true;

    chrome.runtime.sendMessage({ action: "runDiagnostics", url: url }, (report) => {
      if (chrome.runtime.lastError) {
        diagnosticSummaryEl.textContent = `Critical Error: ${chrome.runtime.lastError.message}`;
        diagnosticSummaryEl.className = "error";
        testConnectionButton.disabled = false;
        saveUrlButton.disabled = false;
        return;
      }

      updateDiagStep(diagStep1, report.checks.url);
      updateDiagStep(diagStep2, report.checks.connection);
      updateDiagStep(diagStep3, report.checks.version);
      updateDiagStep(diagStep4, report.checks.headers);

      if (report.overallStatus === "success") {
        diagnosticSummaryEl.textContent = "Success! Your setup is complete and ready to log.";
        diagnosticSummaryEl.className = "success";
      } else {
        diagnosticSummaryEl.textContent = "Error: Your setup has problems. Please fix the failed steps and try again.";
        diagnosticSummaryEl.className = "error";
      }

      testConnectionButton.disabled = false;
      saveUrlButton.disabled = false;
    });
  }

  /**
   * @description Saves just the Web App URL.
   */
  function quickSaveUrl() {
    const url = webAppUrlInput.value.trim();
    chrome.storage.sync.set({ webAppUrl: url }, () => {
      diagnosticSummaryEl.textContent = "URL saved!";
      diagnosticSummaryEl.className = "success";
      diagnosticResultsEl.style.display = "block";
      
      setTimeout(() => {
        if (diagnosticSummaryEl.textContent === "URL saved!") {
          diagnosticSummaryEl.textContent = "";
          diagnosticSummaryEl.className = "";
        }
      }, 2000);
    });
  }

  // --- NEW: Sound and Clipboard Functions ---

  /**
   * @description Plays the selected notification sound at the selected volume.
   */
  function playTestSound() {
    const soundFile = notificationSoundInput.value;
    const volume = parseFloat(volumeInput.value);

    if (soundFile && soundFile !== "none") {
      try {
        const soundUrl = chrome.runtime.getURL(`sounds/${soundFile}`);
        const audio = new Audio(soundUrl);
        audio.volume = isNaN(volume) ? 0.5 : volume;
        audio.play().catch(e => console.warn(`Could not play sound: ${e.message}`));
      } catch (e) {
        console.error("Error playing test sound.", e);
      }
    }
  }

  // --- Initial Setup & Event Listeners ---
  
  handlePageLoadRouting(); // Show the correct page on load
  restoreOptions(); // Load settings into the form
  
  saveButton.addEventListener("click", saveOptions);
  testConnectionButton.addEventListener("click", runDiagnostics);
  saveUrlButton.addEventListener("click", quickSaveUrl);
  
  // Add listeners for new buttons
  if (testSoundButton) {
    testSoundButton.addEventListener("click", playTestSound);
  }
  
  // Renamed button listener
  if (openScriptPageButton) {
    openScriptPageButton.addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("app_script_viewer.html") });
    });
  }

  volumeInput.addEventListener("input", () => {
    volumeDisplay.textContent = `${Math.round(volumeInput.value * 100)}%`;
  });

  // Handle hash changes if the user uses browser back/forward
  window.addEventListener("hashchange", () => {
    const pageName = window.location.hash.substring(1);
    if (pageName !== 'privacy') {
      showPage(pageName || "settings");
    }
  });
});

