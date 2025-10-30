// Listen for the message from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showLogPopup") {
    if (!document.getElementById("work-log-popup-overlay")) {
      createPopup();
    }
    sendResponse({ status: "popup shown" });
  }
  return true;
});

// Function to create and inject the popup modal
function createPopup() {
  const overlay = document.createElement("div");
  overlay.id = "work-log-popup-overlay";
  
  const modal = document.createElement("div");
  modal.id = "work-log-popup-modal";
  
  const title = document.createElement("h2");
  title.id = "work-log-popup-title";
  title.textContent = "What are you working on?";
  
  // --- Tag Dropdown ---
  const tagGroup = document.createElement("div");
  tagGroup.className = "work-log-form-group";
  
  const tagLabel = document.createElement("label");
  tagLabel.htmlFor = "work-log-tag-select";
  tagLabel.textContent = "Select a Tag (Optional):";
  
  const tagSelect = document.createElement("select");
  tagSelect.id = "work-log-tag-select";
  tagSelect.className = "work-log-popup-select";
  
  // Load tags from storage
  chrome.storage.sync.get({ logTags: "Meeting\nFocus Time\nSlack" }, (data) => {
    const tags = data.logTags.split('\n').filter(Boolean);
    
    // Add a "no tag" prompt
    const promptOption = document.createElement("option");
    promptOption.value = "";
    promptOption.textContent = "-- No Tag --";
    promptOption.selected = true;
    tagSelect.appendChild(promptOption);
    
    if (tags.length === 0) {
      tags.push("Default"); // Fallback
    }

    tags.forEach(tag => {
      const option = document.createElement("option");
      option.value = tag;
      option.textContent = tag;
      tagSelect.appendChild(option);
    });
  });
  
  tagGroup.appendChild(tagLabel);
  tagGroup.appendChild(tagSelect);

  // --- Log Text Area ---
  const textGroup = document.createElement("div");
  textGroup.className = "work-log-form-group";
  
  const textarea = document.createElement("textarea");
  textarea.id = "work-log-popup-input";
  textarea.placeholder = "Enter a brief log...";
  textGroup.appendChild(textarea);
  
  // --- Drifted Checkbox ---
  const driftedGroup = document.createElement("div");
  driftedGroup.className = "work-log-form-group work-log-checkbox-group";
  
  const driftedCheck = document.createElement("input");
  driftedCheck.type = "checkbox";
  driftedCheck.id = "work-log-drifted-check";
  
  const driftedLabel = document.createElement("label");
  driftedLabel.htmlFor = "work-log-drifted-check";
  driftedLabel.textContent = "I drifted (was off-task)";
  
  driftedGroup.appendChild(driftedCheck);
  driftedGroup.appendChild(driftedLabel);

  // --- [UX-02] New Snooze/Postpone UI ---
  const actionsWrapper = document.createElement("div");
  actionsWrapper.className = "work-log-actions-wrapper";

  const snoozeGroup = document.createElement("div");
  snoozeGroup.className = "work-log-snooze-group";

  // Create the select dropdown
  const snoozeSelect = document.createElement("select");
  snoozeSelect.id = "work-log-snooze-select";
  snoozeSelect.className = "work-log-popup-select work-log-snooze-select";
  
  // Create options
  const snoozeOptions = [
    { text: "Snooze 10 min", value: 10 },
    { text: "Snooze 30 min", value: 30 },
    { text: "Snooze 1 hour", value: 60 },
    { text: "Skip this log", value: -1 } // -1 indicates "skip"
  ];
  
  // Add a "Postpone 5 min" as the default, first option
  const defaultSnooze = document.createElement("option");
  defaultSnooze.value = "5";
  defaultSnooze.textContent = "Postpone 5 min";
  defaultSnooze.selected = true;
  snoozeSelect.appendChild(defaultSnooze);

  snoozeOptions.forEach(opt => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.text;
    snoozeSelect.appendChild(option);
  });
  snoozeGroup.appendChild(snoozeSelect);

  // Create the "Snooze" button
  const snoozeButton = document.createElement("button");
  snoozeButton.id = "work-log-snooze-button";
  snoozeButton.className = "work-log-popup-button work-log-button-secondary";
  snoozeButton.textContent = "Snooze";
  snoozeGroup.appendChild(snoozeButton);
  
  // --- End Snooze UI ---
  
  // --- Buttons ---
  const submitButton = document.createElement("button");
  submitButton.id = "work-log-popup-submit";
  submitButton.textContent = "Log It (Ctrl+Enter)";
  
  const statusMessage = document.createElement("p");
  statusMessage.id = "work-log-popup-status";
  
  const sameAsLastButton = document.createElement("button");
  sameAsLastButton.className = "work-log-popup-button work-log-button-secondary";
  sameAsLastButton.textContent = "Log 'Doing Same'";
  
  // --- Logic ---

  // Main Submit Logic
  function submitLog() {
    const logText = textarea.value.trim();
    const tag = tagSelect.value || ""; // Allow empty tag
    const drifted = driftedCheck.checked;

    if (!logText) {
      showStatus("Please enter a log entry.", "error");
      return;
    }
    
    setLoading(true, "Logging...");
    const logData = { logText, tag, drifted };
    chrome.runtime.sendMessage({ action: "logWork", data: logData }, handleResponse);
  }
  
  // Add keyboard shortcut
  textarea.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault(); // Prevent new line
      submitLog(); // Call the existing submit function
    }
  });
  
  submitButton.addEventListener("click", submitLog);
  
  // [UX-02] Snooze Logic
  snoozeButton.addEventListener("click", () => {
    const minutes = parseInt(snoozeSelect.value, 10);
    const actionText = minutes > 0 ? "Snoozing..." : "Skipping...";
    
    setLoading(true, actionText); // Use loading state
    chrome.runtime.sendMessage({ action: "snoozeLog", minutes: minutes }, (response) => {
      if (response && (response.status === "snoozed" || response.status === "skipped")) {
        closePopup();
      } else {
        showStatus("Could not snooze.", "error");
        setLoading(false);
      }
    });
  });
  
  // "Doing Same"
  sameAsLastButton.addEventListener("click", () => {
    setLoading(true, "Logging last task...");
    chrome.storage.local.get({ lastLog: null, lastTag: null }, (data) => {
      if (data.lastLog && data.lastTag !== null) { // Allow empty string tag
        // --- ADDED "↑ " prefix ---
        const logData = { 
          logText: "↑ " + data.lastLog, 
          tag: data.lastTag, 
          drifted: false 
        };
        chrome.runtime.sendMessage({ action: "logWork", data: logData }, handleResponse);
      } else {
        showStatus("No previous log found.", "error");
        setLoading(false);
      }
    });
  });

  // Handle response from background.js
  function handleResponse(response) {
    if (chrome.runtime.lastError) {
        showStatus(`Error: ${chrome.runtime.lastError.message}`, "error");
        setLoading(false);
        return;
    }

    if (response && response.status === "success") {
      closePopup();
    } else {
      showStatus(response.message || "An unknown error occurred.", "error");
      setLoading(false);
    }
  }

  // Helper to set loading state
  function setLoading(isLoading, message = "Log It (Ctrl+Enter)") {
    submitButton.disabled = isLoading;
    snoozeButton.disabled = isLoading; // [UX-02]
    snoozeSelect.disabled = isLoading; // [UX-02]
    sameAsLastButton.disabled = isLoading;
    tagSelect.disabled = isLoading;
    textarea.disabled = isLoading;
    driftedCheck.disabled = isLoading;
    
    if (isLoading) {
      submitButton.textContent = message;
      statusMessage.style.display = "none";
    } else {
      submitButton.textContent = "Log It (Ctrl+Enter)";
    }
  }
  
  const closeButton = document.createElement("button");
  closeButton.id = "work-log-popup-close";
  closeButton.textContent = "×";
  closeButton.title = "Close without logging";
  closeButton.addEventListener("click", closePopup);
  
  // Assemble the popup
  modal.appendChild(closeButton);
  modal.appendChild(title);
  modal.appendChild(tagGroup);
  modal.appendChild(textGroup);
  modal.appendChild(driftedGroup);
  modal.appendChild(submitButton);
  // [UX-02] Add new snooze group
  actionsWrapper.appendChild(snoozeGroup);
  actionsWrapper.appendChild(sameAsLastButton);
  modal.appendChild(actionsWrapper);
  modal.appendChild(statusMessage);
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  textarea.focus(); // Focus text area
}

function closePopup() {
  const overlay = document.getElementById("work-log-popup-overlay");
  if (overlay) {
    overlay.remove();
  }
}

function showStatus(message, type) {
  const statusMessage = document.getElementById("work-log-popup-status");
  if (statusMessage) {
    statusMessage.textContent = message;
    statusMessage.className = `work-log-status-${type}`;
    statusMessage.style.display = "block";
  }
}
