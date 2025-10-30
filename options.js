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
  const testConnectionButton = document.getElementById("test-connection"); // [QOL-50]
  const testStatusEl = document.getElementById("test-status"); // [QOL-50]
  const notificationSoundInput = document.getElementById("notification-sound"); // [QOL-51]

  // Save options to chrome.storage.sync
  function saveOptions() {
    
    const logInterval = intervalInput ? intervalInput.value : 15;
    const logTags = tagsInput ? tagsInput.value : "";
    const isDebugMode = debugInput ? debugInput.checked : false;
    const blockedDomains = blockedDomainsInput ? blockedDomainsInput.value : "";
    const webAppUrl = webAppUrlInput ? webAppUrlInput.value.trim() : "";
    const isDomainLogEnabled = logDomainInput ? logDomainInput.checked : false;
    const notificationSound = notificationSoundInput ? notificationSoundInput.value : "ClickUp.wav"; // [QOL-51]

    const workingDays = [];
    if (daysInputs) {
      daysInputs.forEach(input => {
        if (input.checked) {
          workingDays.push(input.dataset.day);
        }
      });
    }
    
    const startHourVal = startHourInput ? startHourInput.value : "09:00";
    const endHourVal = endHourInput ? endHourInput.value : "18:00";
    
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
        isDomainLogEnabled: isDomainLogEnabled,
        notificationSound: notificationSound // [QOL-51]
      },
      () => {
        statusEl.textContent = "Settings saved!";
        setTimeout(() => {
          statusEl.textContent = "";
        }, 1500);
        
        chrome.runtime.sendMessage({ action: "settingsUpdated" });
      }
    );
  }

  // Restores options
  function restoreOptions() {
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
        isDomainLogEnabled: false,
        notificationSound: "ClickUp.wav" // [QOL-51]
      },
      (items) => {
        if (intervalInput) intervalInput.value = items.logInterval;
        if (tagsInput) tagsInput.value = items.logTags;
        if (debugInput) debugInput.checked = items.isDebugMode;
        if (blockedDomainsInput) blockedDomainsInput.value = items.blockedDomains;
        if (webAppUrlInput) webAppUrlInput.value = items.webAppUrl;
        if (logDomainInput) logDomainInput.checked = items.isDomainLogEnabled;
        if (notificationSoundInput) notificationSoundInput.value = items.notificationSound; // [QOL-51]
        
        if (daysInputs) {
          daysInputs.forEach(input => {
            if (items.workingDays.includes(input.dataset.day)) {
              input.checked = true;
            } else {
              input.checked = false;
            }
          });
        }
        
        const startHour = items.workStartHour || 9;
        const endHour = items.workEndHour || 18;
        
        if (startHourInput) startHourInput.value = startHour.toString().padStart(2, '0') + ':00';
        if (endHourInput) endHourInput.value = endHour.toString().padStart(2, '0') + ':00';
      }
    );
  }
  
  // --- [QOL-50] Test Connection ---
  function testConnection() {
    const url = webAppUrlInput.value;
    if (!url) {
      testStatusEl.textContent = "Please enter a URL first.";
      testStatusEl.className = "error";
      return;
    }
    
    testStatusEl.textContent = "Testing...";
    testStatusEl.className = "";
    testConnectionButton.disabled = true;
    
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
      testConnectionButton.disabled = false;
    });
  }

  // --- Event Listeners ---
  restoreOptions();
  saveButton.addEventListener("click", saveOptions);
  testConnectionButton.addEventListener("click", testConnection); // [QOL-50]
});
