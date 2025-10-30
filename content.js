/**
 * @file content.js
 * @description This script is injected into active web pages. It listens for messages
 * from the background script to display the work log popup, and handles all
 * user interactions within that popup (e.g., submitting logs, snoozing).
 */

/**
 * @description Listens for a message from the background script to trigger the popup.
 * Ensures that only one popup is created at a time.
 * @param {object} request - The message object from the background script.
 * @param {object} sender - Information about the message sender.
 * @param {function} sendResponse - Function to send a response back.
 * @returns {boolean} Returns true to indicate an asynchronous response.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showLogPopup") {
    // Only create a new popup if one doesn't already exist
    if (!document.getElementById("work-log-popup-overlay")) {
      createPopup(request.domain, request.sound); 
    }
    sendResponse({ status: "popup shown" });
  }
  return true;
});

/**
 * @description Dynamically creates and injects the HTML and CSS for the work log popup
 * into the current page. It also sets up all necessary event listeners for the popup's buttons and inputs.
 * @param {string} domainToLog - The domain of the current tab, if logging is enabled.
 * @param {string} soundToPlay - The filename of the notification sound to play.
 */
function createPopup(domainToLog, soundToPlay) {
  
  // Play a notification sound if one is selected
  if (soundToPlay && soundToPlay !== "none") {
    try {
      const soundUrl = chrome.runtime.getURL(`sounds/${soundToPlay}`);
      const audio = new Audio(soundUrl);
      audio.volume = 0.5; // Set volume to 50% to be less intrusive
      audio.play().catch(e => console.warn(`Work Log: Could not play notification sound: ${e.message}`));
    } catch (e) {
      console.error("Work Log: Error playing sound.", e);
    }
  }
  
  // Inject Google Fonts for icons if not already present
  if (!document.getElementById("work-log-google-symbols")) {
    const fontLink = document.createElement("link");
    fontLink.id = "work-log-google-symbols";
    fontLink.rel = "stylesheet";
    fontLink.href = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,0..200";
    document.head.appendChild(fontLink);
  }

  // --- Create Popup DOM Elements ---

  const overlay = document.createElement("div");
  overlay.id = "work-log-popup-overlay";
  
  const modal = document.createElement("div");
  modal.id = "work-log-popup-modal";
  
  const title = document.createElement("h2");
  title.id = "work-log-popup-title";
  title.textContent = "What are you working on?";
  
  // Tag selection dropdown
  const tagGroup = document.createElement("div");
  tagGroup.className = "work-log-form-group";
  const tagLabel = document.createElement("label");
  tagLabel.htmlFor = "work-log-tag-select";
  tagLabel.textContent = "Select a Tag (Optional):";
  const tagSelect = document.createElement("select");
  tagSelect.id = "work-log-tag-select";
  
  // Populate tags from user settings
  chrome.storage.sync.get({ logTags: "Meeting\nFocus Time\nSlack" }, (data) => {
    const tags = data.logTags.split('\n').filter(Boolean);
    tagSelect.innerHTML = `<option value="" selected>-- No Tag --</option>`; // Default option
    if (!tags.includes("Break")) tags.push("Break"); // Ensure 'Break' is always an option
    tags.forEach(tag => {
      tagSelect.innerHTML += `<option value="${tag}">${tag}</option>`;
    });
  });
  
  tagGroup.appendChild(tagLabel);
  tagGroup.appendChild(tagSelect);
  
  // Most Recently Used (MRU) tags container
  const mruTagsContainer = document.createElement("div");
  mruTagsContainer.className = "work-log-mru-tags-container";
  
  // Fetch and display MRU tags
  chrome.runtime.sendMessage({ action: "getMruTags" }, (mruTags) => {
    if (mruTags && mruTags.length > 0) {
      mruTags.forEach(tag => {
        const button = document.createElement("button");
        button.className = "work-log-popup-button work-log-mru-tag-btn";
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

  // Log input textarea
  const textGroup = document.createElement("div");
  textGroup.className = "work-log-form-group";
  const textarea = document.createElement("textarea");
  textarea.id = "work-log-popup-input";
  textarea.placeholder = "Enter a brief log...";
  textGroup.appendChild(textarea);
  
  // Checkboxes for 'Drifted' and 'Reactive'
  const checkboxContainer = document.createElement("div");
  checkboxContainer.className = "work-log-checkbox-container";
  const driftedCheck = document.createElement("input");
  driftedCheck.type = "checkbox";
  driftedCheck.id = "work-log-drifted-check";
  const driftedLabel = document.createElement("label");
  driftedLabel.htmlFor = "work-log-drifted-check";
  driftedLabel.textContent = "I drifted (off-task)";
  const reactiveCheck = document.createElement("input");
  reactiveCheck.type = "checkbox";
  reactiveCheck.id = "work-log-reactive-check";
  const reactiveLabel = document.createElement("label");
  reactiveLabel.htmlFor = "work-log-reactive-check";
  reactiveLabel.textContent = "I reacted (ad-hoc)";
  
  checkboxContainer.innerHTML = `
    <div class="work-log-form-group work-log-checkbox-group">
      ${driftedCheck.outerHTML}
      ${driftedLabel.outerHTML}
    </div>
    <div class="work-log-form-group work-log-checkbox-group">
      ${reactiveCheck.outerHTML}
      ${reactiveLabel.outerHTML}
    </div>
  `;

  // Action buttons and snooze controls
  const actionsWrapper = document.createElement("div");
  actionsWrapper.className = "work-log-actions-wrapper";
  const snoozeGroup = document.createElement("div");
  snoozeGroup.className = "work-log-snooze-group";
  const snoozeSelect = document.createElement("select");
  snoozeSelect.id = "work-log-snooze-select";
  snoozeSelect.innerHTML = `
    <option value="5" selected>Postpone 5 min</option>
    <option value="10">Snooze 10 min</option>
    <option value="30">Snooze 30 min</option>
    <option value="60">Snooze 1 hour</option>
    <option value="-1">Skip this log</option>
  `;
  const snoozeButton = document.createElement("button");
  snoozeButton.id = "work-log-snooze-button";
  snoozeButton.className = "work-log-popup-button work-log-button-secondary";
  snoozeButton.textContent = "Snooze";
  snoozeGroup.appendChild(snoozeSelect);
  snoozeGroup.appendChild(snoozeButton);
  
  const submitButton = document.createElement("button");
  submitButton.id = "work-log-popup-submit";
  submitButton.textContent = "Log It (Ctrl+Enter)";
  
  const logAndSnoozeButton = document.createElement("button");
  logAndSnoozeButton.className = "work-log-popup-button work-log-button-secondary";
  logAndSnoozeButton.textContent = "Log & Snooze 30 min";
  
  const sameAsLastButton = document.createElement("button");
  sameAsLastButton.className = "work-log-popup-button work-log-button-secondary";
  sameAsLastButton.textContent = "Log 'Doing Same'";
  
  const breakButton = document.createElement("button");
  breakButton.className = "work-log-popup-button work-log-button-secondary";
  breakButton.title = "Log a 'Break'";
  breakButton.innerHTML = `<span class="material-symbols-outlined">local_cafe</span>`;

  const statusMessage = document.createElement("p");
  statusMessage.id = "work-log-popup-status";
  
  const closeButton = document.createElement("button");
  closeButton.id = "work-log-popup-close";
  closeButton.textContent = "×";
  closeButton.title = "Snooze 5 minutes";

  // --- Event Handling & Logic ---

  /**
   * @description Submits the log data to the background script.
   * @param {boolean} [isLogAndSnooze=false] - If true, sends a 'logAndSnooze' action.
   */
  function submitLog(isLogAndSnooze = false) {
    const logText = textarea.value.trim();
    if (!logText) {
      showStatus("Please enter a log entry.", "error");
      return;
    }
    
    const logData = {
      logText,
      tag: tagSelect.value || "",
      drifted: document.getElementById("work-log-drifted-check").checked,
      reactive: document.getElementById("work-log-reactive-check").checked,
      domain: domainToLog || ""
    };
    
    setLoading(true, isLogAndSnooze ? "Logging & Snoozing..." : "Logging...");

    const message = isLogAndSnooze
      ? { action: "logAndSnooze", data: logData, minutes: 30 }
      : { action: "logWork", data: logData };

    chrome.runtime.sendMessage(message, handleResponse);
  }
  
  // Attach event listeners
  textarea.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submitLog(false);
    }
  });
  
  submitButton.addEventListener("click", () => submitLog(false));
  logAndSnoozeButton.addEventListener("click", () => submitLog(true));
  
  snoozeButton.addEventListener("click", () => {
    const minutes = parseInt(snoozeSelect.value, 10);
    setLoading(true, minutes > 0 ? "Snoozing..." : "Skipping...");
    chrome.runtime.sendMessage({ action: "snoozeLog", minutes: minutes }, (response) => {
      if (response && (response.status === "snoozed" || response.status === "skipped")) {
        closePopup();
      } else {
        showStatus("Could not snooze.", "error");
        setLoading(false);
      }
    });
  });
  
  sameAsLastButton.addEventListener("click", () => {
    setLoading(true, "Logging last task...");
    chrome.storage.local.get({ lastLog: null, lastTag: null }, (data) => {
      if (data.lastLog) {
        const logData = { 
          logText: "↑ " + data.lastLog, 
          tag: data.lastTag || "",
          drifted: false,
          reactive: false,
          domain: domainToLog || ""
        };
        chrome.runtime.sendMessage({ action: "logWork", data: logData }, handleResponse);
      } else {
        showStatus("No previous log found.", "error");
        setLoading(false);
      }
    });
  });
  
  breakButton.addEventListener("click", () => {
    setLoading(true, "Logging break...");
    const logData = { logText: "Break", tag: "Break", drifted: false, reactive: false, domain: domainToLog || "" };
    chrome.runtime.sendMessage({ action: "logWork", data: logData }, handleResponse);
  });

  closeButton.addEventListener("click", () => {
    setLoading(true, "Snoozing...");
    chrome.runtime.sendMessage({ action: "snoozeLog", minutes: 5 }, (response) => {
      if (response && response.status === "snoozed") closePopup();
      else {
        showStatus("Could not snooze.", "error");
        setLoading(false);
      }
    });
  });

  /**
   * @description Handles the response from the background script after a log submission.
   * @param {object} response - The response object.
   */
  function handleResponse(response) {
    if (chrome.runtime.lastError) {
        showStatus(`Error: ${chrome.runtime.lastError.message}`, "error");
        setLoading(false);
        return;
    }
    if (response && (response.status === "success" || response.status === "success_and_snoozed")) {
      closePopup();
    } else {
      showStatus(response.message || "An unknown error occurred.", "error");
      setLoading(false);
    }
  }

  /**
   * @description Disables or enables form controls while an action is in progress.
   * @param {boolean} isLoading - Whether to show the loading state.
   * @param {string} [message="Log It (Ctrl+Enter)"] - The message to display on the submit button.
   */
  function setLoading(isLoading, message = "Log It (Ctrl+Enter)") {
    const elementsToDisable = [
      submitButton, logAndSnoozeButton, snoozeButton, snoozeSelect,
      sameAsLastButton, breakButton, tagSelect, textarea,
      document.getElementById("work-log-drifted-check"),
      document.getElementById("work-log-reactive-check")
    ];
    elementsToDisable.forEach(el => el.disabled = isLoading);
    
    submitButton.textContent = isLoading ? message : "Log It (Ctrl+Enter)";
    statusMessage.style.display = isLoading ? "none" : "block";
  }
  
  // --- Assemble and Inject Popup ---
  
  modal.appendChild(closeButton);
  modal.appendChild(title);
  modal.appendChild(tagGroup);
  modal.appendChild(mruTagsContainer);
  modal.appendChild(textGroup);
  modal.appendChild(checkboxContainer);
  modal.appendChild(submitButton);
  modal.appendChild(logAndSnoozeButton);
  actionsWrapper.appendChild(snoozeGroup);
  actionsWrapper.appendChild(sameAsLastButton);
  actionsWrapper.appendChild(breakButton);
  modal.appendChild(actionsWrapper);
  modal.appendChild(statusMessage);
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  textarea.focus();
}

/**
 * @description Removes the popup from the DOM.
 */
function closePopup() {
  const overlay = document.getElementById("work-log-popup-overlay");
  if (overlay) {
    overlay.remove();
  }
}

/**
 * @description Displays a status message to the user within the popup.
 * @param {string} message - The message to display.
 * @param {'success'|'error'} type - The type of message, for styling.
 */
function showStatus(message, type) {
  const statusMessage = document.getElementById("work-log-popup-status");
  if (statusMessage) {
    statusMessage.textContent = message;
    statusMessage.className = `work-log-status-${type}`;
    statusMessage.style.display = "block";
  }
}
