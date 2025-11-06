/**
 * @file today.js
 * @description This script manages the functionality of the "Today's Stats" page (dashboard.html).
 * It fetches real-time daily data from local storage and renders the timeline.
 *
 * @version 1.0 (Refactored from dashboard.js)
 */

document.addEventListener("DOMContentLoaded", () => {
    // --- DOM Element Selections ---

    // "Today's Stats" Elements
    const logsTodayEl = document.getElementById("logs-today");
    const tasksCompletedEl = document.getElementById("tasks-completed");
    const focusScoreEl = document.getElementById("focus-score");
    const timelineContainerEl = document.getElementById("daily-timeline-container");

    // --- Data Loading and Rendering ---

    /**
     * @description Loads and displays the stats for the "Today's Stats" tab.
     * It reads the rich `recentLogs` array from local storage to populate
     * both the KPIs and the new daily timeline.
     */
    function loadTodayStats() {
        chrome.storage.local.get({
            tasksCompleted: 0,
            recentLogs: [] // This now contains rich log objects
        }, (data) => {
            
            const logs = data.recentLogs || [];
            const logsToday = logs.length;
            const driftedLogs = logs.filter(log => log.drifted).length;

            // Update KPIs
            logsTodayEl.textContent = logsToday;
            tasksCompletedEl.textContent = data.tasksCompleted;
            
            const focusScore = logsToday > 0
                ? Math.round(((logsToday - driftedLogs) / logsToday) * 100)
                : 100;
            focusScoreEl.textContent = `${focusScore}%`;

            // Render the new timeline
            renderDailyTimeline(logs);
        });
    }

    /**
     * @description Renders the hourly block timeline.
     * @param {Array<object>} logs - The array of rich log objects from local storage.
     */
    function renderDailyTimeline(logs) {
        if (!timelineContainerEl) return;

        if (logs.length === 0) {
            timelineContainerEl.innerHTML = "<p>No activity yet today.</p>";
            return;
        }

        // Logs are stored newest-first, so we reverse them for chronological order.
        const chronologicalLogs = logs.slice().reverse(); 
        
        timelineContainerEl.innerHTML = ""; // Clear loader
        
        let currentHour = -1; // Initialize to -1 to force first header

        chronologicalLogs.forEach((log) => {
            // 1. Get hour from log time (e.g., "09:05" -> 9)
            const logHour = parseInt(log.time.split(':')[0], 10);

            // 2. Check if we need to render an "Hour Header"
            if (logHour > currentHour) {
                currentHour = logHour;
                const hourEl = document.createElement("div");
                hourEl.className = "timeline-hour-header";
                // Format hour (e.g., 9 -> "9:00 AM", 14 -> "2:00 PM")
                const ampm = currentHour < 12 ? 'AM' : 'PM';
                const displayHour = currentHour % 12 === 0 ? 12 : currentHour % 12;
                hourEl.textContent = `--- ${displayHour}:00 ${ampm} ---`;
                timelineContainerEl.appendChild(hourEl);
            }

            // 3. Create the timeline entry (two-column layout)
            const entryEl = document.createElement("div");
            entryEl.className = "timeline-entry";

            // --- Add special classes based on log content ---
            if (log.tag && log.tag.toLowerCase() === 'break') {
                entryEl.classList.add("timeline-entry-break");
            }
            if (log.drifted) {
                entryEl.classList.add("timeline-entry-drifted");
            }

            // Generate a consistent color from the tag string
            const tagColor = stringToHslColor(log.tag || "default");
            // Apply color to border
            entryEl.style.borderColor = tagColor.bg; 
            entryEl.style.borderLeftColor = tagColor.fg; // Strong left border

            // Badges for special logs
            let badgesHTML = "";
            if (log.drifted) {
                badgesHTML += `<span class="timeline-badge timeline-badge-drifted">Drifted</span>`;
            }
            if (log.reactive) {
                badgesHTML += `<span class="timeline-badge timeline-badge-reactive">Reactive</span>`;
            }

            // Gap text (e.g., "+15m" or "---")
            const gapText = (log.gap !== "N/A" && log.gap > 0) ? `+${log.gap}m` : "---";

            // --- Build the entry's HTML ---
            entryEl.innerHTML = `
                <div class="timeline-meta">
                    <span class="timeline-time">${log.time || "00:00"}</span>
                    <span class="timeline-gap">${gapText}</span>
                </div>
                <div class="timeline-content">
                    <p class="timeline-text">${escapeHTML(log.logText)}</p>
                    ${log.tag ? `<span class="timeline-tag" style="background-color: ${tagColor.bg}; color: ${tagColor.fg};">${escapeHTML(log.tag)}</span>` : ''}
                    ${badgesHTML ? `<div class="timeline-badges">${badgesHTML}</div>` : ''}
                </div>
            `;
            
            timelineContainerEl.appendChild(entryEl);
        });
    }

    /**
     * @description Simple helper to prevent XSS from log text.
     * @param {string} str - The string to escape.
     * @returns {string} The escaped string.
     */
    function escapeHTML(str) {
        if (!str) return "";
        return str.replace(/[&<>"']/g, function(match) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[match];
        });
    }

    /**
     * @description Generates a consistent, accessible HSL color pair from any string.
     * @param {string} str - The input string (e.g., a tag name).
     * @returns {{bg: string, fg: string}} A background (light) and foreground (dark) color.
     */
    function stringToHslColor(str) {
        if (!str) str = "default";
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = hash % 360;
        return {
            bg: `hsl(${h}, 80%, 90%)`, // Light background
            fg: `hsl(${h}, 60%, 30%)`  // Dark foreground
        };
    }

    // --- Initial Load ---
    loadTodayStats(); // This will now render the new timeline
});