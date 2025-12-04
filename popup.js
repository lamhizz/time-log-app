/**
 * @file popup.js
 * @description This script manages the functionality of the extension's popup menu.
 * It handles the "Add Entry" CTA (delegating to injected popup), navigation links,
 * and the Pomodoro timer.
 */

document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Element Selections ---

  // Menu Elements
  const addEntryBtn = document.getElementById("menu-add-entry-btn");
  const settingsBtn = document.getElementById("menu-settings-btn");
  const dashboardBtn = document.getElementById("menu-dashboard-btn");
  const debugBtn = document.getElementById("menu-debug-btn");
  const aboutBtn = document.getElementById("menu-about-btn");
  const setupBtn = document.getElementById("menu-setup-btn");

  // Debug Elements
  const debugInfo = document.getElementById("debug-info");
  const debugUrl = document.getElementById("debug-url");
  const debugError = document.getElementById("debug-error");

  // Timer Elements
  const pomodoroSection = document.getElementById("pomodoro-section");
  const startTaskContainer = document.getElementById("start-task-container");
  const taskNameInput = document.getElementById("task-name-input");
  const startTaskButton = document.getElementById("start-task-btn");
  const activeTaskContainer = document.getElementById("active-task-container");
  const activeTaskName = document.getElementById("active-task-name");
  const activeTaskTimer = document.getElementById("active-task-timer");
  const stopTaskButton = document.getElementById("stop-task-btn");

  let timerInterval = null; // Holds the setInterval ID for the timer


  // --- Event Listener Setup ---

  // 1. "Add Entry" Button
  addEntryBtn.addEventListener("click", () => {
    // Trigger the injected popup on the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id) {
        // We use the same logic as the context menu/shortcut
        // Send message to background to trigger it (handling DND checks etc.)
        // Or simpler: send directly to tab if we trust it.
        // Let's use the background script's command handler logic if possible, 
        // or just send "showLogPopup" to the tab.

        // Sending to tab directly is fastest for this context.
        // But we need to ensure content script is there.
        // Background.js has `triggerPopupOnTab` which handles injection.
        // We can't call background functions directly.
        // Let's send a message to background to trigger it.

        // We'll reuse the "trigger-log-popup" command logic if we can, 
        // or add a new message type "triggerPopup".
        // Let's assume we can send a message to background to do it.
        // Looking at background.js, there isn't a direct message for this yet 
        // except via context menu/command.

        // Workaround: We'll inject it ourselves here or send a message to content script.
        // If content script isn't loaded, this fails.
        // Better: Send message to background to "triggerPopup".
        // I will need to update background.js to handle this new message?
        // Actually, let's try sending "trigger-log-popup" command? No, can't simulate command.

        // Let's try sending a message to the active tab first.
        chrome.tabs.sendMessage(tabs[0].id, { action: "showLogPopup" }, (response) => {
          if (chrome.runtime.lastError) {
            // Content script likely not loaded.
            // Fallback: Tell background to inject it.
            // We can use a new message "openPopupOnTab"
            chrome.runtime.sendMessage({ action: "openPopupOnTab", tabId: tabs[0].id });
          }
          window.close(); // Close the menu
        });
      }
    });
  });

  // 2. Navigation Buttons
  settingsBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("options.html?page=settings") });
  });

  dashboardBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  });

  aboutBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("options.html?page=about") });
  });

  setupBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("options.html?page=setup") });
  });

  // 3. Debug Toggle
  debugBtn.addEventListener("click", () => {
    const isVisible = debugInfo.style.display === "block";
    debugInfo.style.display = isVisible ? "none" : "block";
    debugBtn.textContent = isVisible ? "Show Debug" : "Hide Debug";
    if (!isVisible) {
      loadDebugInfo();
    }
  });


  // --- Timer Logic (Pomodoro) ---

  startTaskButton.addEventListener("click", () => {
    const taskName = taskNameInput.value.trim();
    if (!taskName) {
      // Simple alert or visual cue since we don't have a status bar anymore
      taskNameInput.style.borderColor = "red";
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

          showLogUI(); // Reset UI

          // Open the injected popup with pre-filled data
          // We need to pass this data to the content script.
          // The content script needs to handle "showLogPopup" with data.
          // Currently content.js "showLogPopup" doesn't take data.
          // We might need to save it to storage or pass it in message.

          // Let's pass it in the message.
          const prefillData = {
            logText: `${data.activeTask.name} (approx. ${durationMins} min)`
          };

          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0 && tabs[0].id) {
              chrome.tabs.sendMessage(tabs[0].id, {
                action: "showLogPopup",
                prefill: prefillData
              });
            }
          });

          window.close();
        });
      } else {
        showLogUI();
      }
    });
  });


  // --- Helper Functions ---

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
      debugBtn.style.display = data.isDebugMode ? "block" : "none";
    });
  }

  function checkPomodoroSetting() {
    chrome.storage.sync.get({ isPomodoroEnabled: true }, (data) => {
      pomodoroSection.style.display = data.isPomodoroEnabled ? "block" : "none";
    });
  }

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
    startTaskContainer.style.display = "none";
    activeTaskContainer.style.display = "block";
    activeTaskName.textContent = task.name;

    if (timerInterval) clearInterval(timerInterval);
    updateTimerDisplay(task.startTime);
    timerInterval = setInterval(() => updateTimerDisplay(task.startTime), 1000);
  }

  function showLogUI() {
    startTaskContainer.style.display = "flex";
    activeTaskContainer.style.display = "none";
    taskNameInput.value = "";
    taskNameInput.style.borderColor = ""; // Reset error state
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

  // --- Initialization ---
  function initialize() {
    checkDebugMode();
    checkPomodoroSetting();
    checkActiveTimer();
  }

  initialize();
});
