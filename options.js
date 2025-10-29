document.addEventListener("DOMContentLoaded", () => {
  // Get elements
  const saveButton = document.getElementById("save");
  const statusEl = document.getElementById("status");
  const intervalInput = document.getElementById("log-interval");
  const tagsInput = document.getElementById("log-tags");
  const debugInput = document.getElementById("debug-mode");
  const daysInputs = document.querySelectorAll(".working-days-group input[type='checkbox']");
  // --- New: Working Hours ---
  const startHourInput = document.getElementById("work-start-hour");
  const endHourInput = document.getElementById("work-end-hour");

  // Save options to chrome.storage.sync
  function saveOptions() {
    const logInterval = intervalInput.value;
    const logTags = tagsInput.value;
    const isDebugMode = debugInput.checked;

    // --- New: Get working days ---
    const workingDays = [];
    daysInputs.forEach(input => {
      if (input.checked) {
        workingDays.push(input.dataset.day);
      }
    });
    
    // --- New: Get working hours ---
    // Parse "HH:MM" string to get just the hour number
    const startHourVal = startHourInput.value; // e.g., "09:00"
    const endHourVal = endHourInput.value; // e.g., "18:00"
    
    // Default to 9-18 if not set
    const workStartHour = startHourVal ? parseInt(startHourVal.split(':')[0], 10) : 9;
    const workEndHour = endHourVal ? parseInt(endHourVal.split(':')[0], 10) : 18;

    chrome.storage.sync.set(
      { 
        logInterval: parseInt(logInterval, 10) || 15,
        logTags: logTags,
        isDebugMode: isDebugMode,
        workingDays: workingDays, // --- New ---
        // --- New ---
        workStartHour: workStartHour,
        workEndHour: workEndHour 
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
        // --- New ---
        workStartHour: 9,
        workEndHour: 18
      },
      (items) => {
        intervalInput.value = items.logInterval;
        tagsInput.value = items.logTags;
        debugInput.checked = items.isDebugMode;
        
        // --- New: Restore working days ---
        daysInputs.forEach(input => {
          if (items.workingDays.includes(input.dataset.day)) {
            input.checked = true;
          } else {
            input.checked = false;
          }
        });
        
        // --- New: Restore working hours ---
        // Format hour number (e.g., 9) to "HH:MM" string (e.g., "09:00")
        startHourInput.value = items.workStartHour.toString().padStart(2, '0') + ':00';
        endHourInput.value = items.workEndHour.toString().padStart(2, '0') + ':00';
      }
    );
  }

  // --- Event Listeners ---
  restoreOptions();
  saveButton.addEventListener("click", saveOptions);
});



