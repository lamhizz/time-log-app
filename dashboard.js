/**
 * @file dashboard.js
 * @description This script manages the functionality of the dashboard page (dashboard.html).
 * It handles tab switching, fetching and displaying data for "Today's Stats" and "Weekly Review".
 */

document.addEventListener("DOMContentLoaded", () => {
    // --- DOM Element Selections ---
    const tabs = document.querySelectorAll(".tab-link");
    const contents = document.querySelectorAll(".tab-content");

    // "Today's Stats" Elements
    const logsTodayEl = document.getElementById("logs-today");
    const tasksCompletedEl = document.getElementById("tasks-completed");
    const focusScoreEl = document.getElementById("focus-score");
    const recentActivityEl = document.getElementById("recent-activity");

    // "Weekly Review" Elements
    const refreshDataBtn = document.getElementById("refresh-data-btn");
    const weeklyStatusEl = document.getElementById("weekly-status");

    // --- Event Listeners ---

    // Tab switching logic
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(item => item.classList.remove("active"));
            contents.forEach(item => item.classList.remove("active"));

            tab.classList.add("active");
            document.getElementById(tab.dataset.tab).classList.add("active");
        });
    });

    // Refresh weekly data
    refreshDataBtn.addEventListener("click", () => {
        weeklyStatusEl.textContent = "Refreshing data from Google Sheet...";
        weeklyStatusEl.className = "status-message info";
        refreshDataBtn.disabled = true;

        chrome.runtime.sendMessage({ action: "getWeeklyData" }, (response) => {
            if (chrome.runtime.lastError || response.status === "error") {
                weeklyStatusEl.textContent = `Error: ${response.message || "Could not fetch data."}`;
                weeklyStatusEl.className = "status-message error";
                refreshDataBtn.disabled = false;
                return;
            }

            weeklyStatusEl.textContent = "Data refreshed successfully!";
            weeklyStatusEl.className = "status-message success";
            setTimeout(() => weeklyStatusEl.textContent = "", 2000);
            refreshDataBtn.disabled = false;

        });
    });


    // --- Data Loading and Rendering ---

    /**
     * @description Loads and displays the stats for the "Today's Stats" tab from local storage.
     */
    function loadTodayStats() {
        chrome.storage.local.get({
            logsToday: 0,
            tasksCompleted: 0,
            driftedLogs: 0,
            recentLogs: []
        }, (data) => {
            logsTodayEl.textContent = data.logsToday;
            tasksCompletedEl.textContent = data.tasksCompleted;

            const focusScore = data.logsToday > 0
                ? Math.round(((data.logsToday - data.driftedLogs) / data.logsToday) * 100)
                : 100;
            focusScoreEl.textContent = `${focusScore}%`;

            recentActivityEl.innerHTML = "";
            if (data.recentLogs.length > 0) {
                data.recentLogs.slice(0, 5).forEach(log => {
                    const li = document.createElement("li");
                    li.textContent = log;
                    recentActivityEl.appendChild(li);
                });
            } else {
                recentActivityEl.innerHTML = "<li>No activity yet today.</li>";
            }
        });
    }

    // --- Initial Load ---
    loadTodayStats();
});
