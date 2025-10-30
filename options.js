document.addEventListener("DOMContentLoaded", () => {
  // Get elements
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

  // Save options to chrome.storage.sync
  function saveOptions() {
    
    // --- FIX: Add safety checks to all inputs before reading .value/.checked ---
    const logInterval = intervalInput ? intervalInput.value : 15;
    const logTags = tagsInput ? tagsInput.value : "";
    const isDebugMode = debugInput ? debugInput.checked : false;
    const blockedDomains = blockedDomainsInput ? blockedDomainsInput.value : "";
    const webAppUrl = webAppUrlInput ? webAppUrlInput.value.trim() : "";
    const isDomainLogEnabled = logDomainInput ? logDomainInput.checked : false;

    // --- New: Get working days ---
    const workingDays = [];
    if (daysInputs) {
      daysInputs.forEach(input => {
        if (input.checked) {
          workingDays.push(input.dataset.day);
        }
      });
    }
    
    // --- New: Get working hours ---
    const startHourVal = startHourInput ? startHourInput.value : "09:00";
    const endHourVal = endHourInput ? endHourInput.value : "18:00";
    
    // Default to 9-18 if not set or if input is cleared
    const workStartHour = startHourVal ? parseInt(startHourVal.split(':')[0], 10) : 9;
    const workEndHour = endHourVal ? parseInt(endHourVal.split(':')[0], 10) : 18;

    chrome.storage.sync.set(
      { 
        logInterval: parseInt(logInterval, 10) || 15,
        logTags: logTags,
        isDebugMode: isDebugMode,
        workingDays: workingDays,
        workStartHour: workStartHour,
        workEndHour: workEndHour,
        blockedDomains: blockedDomains,
        webAppUrl: webAppUrl,
        isDomainLogEnabled: isDomainLogEnabled
      },
      () => {
        // Update status to let user know options were saved.
        statusEl.textContent = "Settings saved!";
        setTimeout(() => {
          statusEl.textContent = "";
        }, 1500);
        
        // Send a message to background.js to update the alarm
        chrome.runtime.sendMessage({ action: "settingsUpdated" });
      }
    );
  }

  // Restores options using the preferences
  // stored in chrome.storage.sync.
  function restoreOptions() {
    // Provide defaults
    chrome.storage.sync.get(
      { 
        logInterval: 15, 
        logTags: "Meeting\nFocus Time\nSlack\nJira Tasks\nEmailing\nBreak",
        isDebugMode: false,
        workingDays: ["1", "2", "3", "4", "5"], // Default Mon-Fri
        workStartHour: 9,
        workEndHour: 18,
        blockedDomains: "meet.google.com\nzoom.us\nyoutube.com\ntwitch.tv",
        webAppUrl: "https://script.google.com/macros/s/AKfycbyHWeCBtEU1oW1RTnK-mtlXA2dvXJ6c-ULz221_HAIy_3QRDl_9s1v8YvOpzH99iipUCQ/exec",
        isDomainLogEnabled: false
      },
      (items) => {
        // --- Safety checks for all elements ---
        if (intervalInput) intervalInput.value = items.logInterval;
        if (tagsInput) tagsInput.value = items.logTags;
        if (debugInput) debugInput.checked = items.isDebugMode;
        if (blockedDomainsInput) blockedDomainsInput.value = items.blockedDomains;
        if (webAppUrlInput) webAppUrlInput.value = items.webAppUrl;
        
        if (logDomainInput) {
          logDomainInput.checked = items.isDomainLogEnabled;
        }
        
        // --- New: Restore working days ---
        if (daysInputs) {
          daysInputs.forEach(input => {
            if (items.workingDays.includes(input.dataset.day)) {
              input.checked = true;
            } else {
              input.checked = false;
            }
          });
        }
        
        // --- New: Restore working hours ---
        const startHour = items.workStartHour || 9;
        const endHour = items.workEndHour || 18;
        
        if (startHourInput) startHourInput.value = startHour.toString().padStart(2, '0') + ':00';
        if (endHourInput) endHourInput.value = endHour.toString().padStart(2, '0') + ':00';
      }
    );
  }

  // --- Event Listeners ---
  restoreOptions();
  saveButton.addEventListener("click", saveOptions);
});

