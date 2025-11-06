/**
 * @file weekly.js
 * @description This script manages the functionality of the "Weekly Review" page (weekly.html).
 * It fetches historical data from the Google Sheet and renders all charts and tables.
 *
 * @version 1.0 (Refactored from dashboard.js)
 */

document.addEventListener("DOMContentLoaded", () => {
    // --- DOM Element Selections ---

    // "Weekly Review" Elements
    const refreshDataBtn = document.getElementById("refresh-data-btn");
    const weeklyStatusEl = document.getElementById("weekly-status");

    // --- "Weekly Review" Elements ---
    const dateRangeSelect = document.getElementById("date-range-select");
    const customDateInputs = document.getElementById("custom-date-inputs");
    const startDateInput = document.getElementById("start-date");
    const endDateInput = document.getElementById("end-date");
    // Section 1
    const kpiGridEl = document.getElementById("kpi-grid");
    const timeByTagChartEl = document.getElementById("time-by-tag-chart");
    const timeByDomainChartEl = document.getElementById("time-by-domain-chart");
    // Section 2
    const heatmapTagFilterEl = document.getElementById("heatmap-tag-filter");
    const workHoursHeatmapEl = document.getElementById("work-hours-heatmap");
    const tagDeepDiveTableEl = document.getElementById("tag-deep-dive-table");
    // Section 3
    const reactiveReportEl = document.getElementById("reactive-report");
    const driftedReportEl = document.getElementById("drifted-report");


    // --- Global State ---
    let fullWeeklyData = []; // To store the complete dataset from the API

    // --- Event Listeners ---

    // Date range selector logic
    dateRangeSelect.addEventListener("change", () => {
        if (dateRangeSelect.value === "custom") {
            customDateInputs.style.display = "block";
        } else {
            customDateInputs.style.display = "none";
        }
        // When the date range changes, re-render the dashboard with the existing data
        if (fullWeeklyData.length > 0) {
            renderWeeklyDashboard(fullWeeklyData);
        }
    });

    // Custom date input changes should also trigger a re-render
    startDateInput.addEventListener("change", () => { if (fullWeeklyData.length > 0) renderWeeklyDashboard(fullWeeklyData) });
    endDateInput.addEventListener("change", () => { if (fullWeeklyData.length > 0) renderWeeklyDashboard(fullWeeklyData) });

    // Refresh weekly data button
    refreshDataBtn.addEventListener("click", () => {
        weeklyStatusEl.textContent = "Refreshing data from Google Sheet...";
        weeklyStatusEl.className = "status-message info";
        refreshDataBtn.disabled = true;

        chrome.runtime.sendMessage({ action: "getWeeklyData" }, (response) => {
            if (chrome.runtime.lastError || response.status === "error") {
                weeklyStatusEl.textContent = `Error: ${response.message || "Could not fetch data."}`;
                weeklyStatusEl.className = "status-message error";
                refreshDataBtn.disabled = false;
                kpiGridEl.innerHTML = "<p>Could not load data.</p>"; // Clear old data
                return;
            }

            weeklyStatusEl.textContent = "Data refreshed successfully!";
            weeklyStatusEl.className = "status-message success";
            setTimeout(() => { weeklyStatusEl.textContent = ""; weeklyStatusEl.className="status-message"; }, 3000);
            refreshDataBtn.disabled = false;

            // --- Defensive data handling ---
            let weeklyData = response.data;

            // If data is a string, try to parse it as JSON
            if (typeof weeklyData === 'string') {
                try {
                    weeklyData = JSON.parse(weeklyData);
                } catch (e) {
                    console.error("Failed to parse weekly data:", e);
                    weeklyData = []; // Default to empty array on parsing error
                }
            }

            // Ensure the data is an array before proceeding
            if (!Array.isArray(weeklyData)) {
                console.warn("Received weekly data is not an array. Defaulting to empty.", weeklyData);
                weeklyData = [];
            }

            // Store the full dataset and render the dashboard
            fullWeeklyData = weeklyData;
            renderWeeklyDashboard(fullWeeklyData);
        });
    });

    // --- Data Processing and Rendering ---

    /**
     * @description Main function to orchestrate the rendering of the entire weekly dashboard.
     * @param {Array<Object>} data - The raw log data from the Google Sheet.
     */
    function renderWeeklyDashboard(data) {
        if (!data || data.length === 0) {
            kpiGridEl.innerHTML = "<p>No data available for the selected period.</p>";
            // Clear all chart/table areas
            [timeByTagChartEl, timeByDomainChartEl, workHoursHeatmapEl, tagDeepDiveTableEl, reactiveReportEl, driftedReportEl].forEach(el => {
                if (el) el.innerHTML = "";
            });
            // Clear any existing chart instances
            [timeByTagChartEl, timeByDomainChartEl].forEach(el => {
                if (el && el.chart) el.chart.destroy();
            });
            return;
        }

        const filteredData = filterDataByDateRange(data);

        // --- Section 1: At a Glance ---
        renderAtAGlance(filteredData);

        // --- Section 2: Pattern & Rhythm Analysis ---
        renderPatternAnalysis(filteredData);

        // --- Section 3: Blindsides & Time Leaks ---
        renderBlindsides(filteredData);
    }

    /**
     * @description Renders all components for the "Blindsides & Time Leaks" section.
     * @param {Array<Object>} data - The filtered log data for the selected period.
     */
    function renderBlindsides(data) {
        // 1. "Reactive" Report (AC 3)
        const reactiveData = data.filter(item => item.reactive);
        const reactiveCount = reactiveData.length;

        // AC 3: Replace time-lost metric with count.
        reactiveReportEl.innerHTML = `<div class="kpi-standalone">You were pulled into 'Reactive' work <strong>${reactiveCount}</strong> time${reactiveCount === 1 ? '' : 's'} this period.</div>`;

        // AC 3: (Optional) "Top Culprit" sub-metric
        const reactiveTagData = aggregateData(reactiveData, 'tag');
        if (reactiveTagData.length > 0) {
            const topCulprit = reactiveTagData[0];
            const culpritEl = document.createElement('div');
            culpritEl.className = 'kpi-standalone';
            culpritEl.style.marginTop = '-1rem';
            culpritEl.style.borderTop = 'none';
            culpritEl.style.paddingTop = '0';
            culpritEl.innerHTML = `Your most frequent reactive tag was <strong>'${topCulprit.name}'</strong> (${topCulprit.value} logs).`;
            reactiveReportEl.appendChild(culpritEl);
        }
        
        const reactiveCanvas = document.createElement('canvas');
        reactiveReportEl.appendChild(reactiveCanvas);
        // Render chart based on COUNT, not time
        renderChart(reactiveCanvas, 'bar', reactiveTagData, "Reactive Logs by Tag", 5);


        // 2. "Drifted" Report (AC 3)
        const driftedData = data.filter(item => item.drifted);
        const driftedCount = driftedData.length;

        // AC 3: This metric is already correct.
        driftedReportEl.innerHTML = `<div class="kpi-standalone">You drifted off-task <strong>${driftedCount}</strong> time${driftedCount === 1 ? '' : 's'}.</div>`;

        const driftedDomainData = aggregateData(driftedData, 'domain');
        const driftedCanvas = document.createElement('canvas');
        driftedReportEl.appendChild(driftedCanvas);
        // Render chart based on COUNT, not time
        renderChart(driftedCanvas, 'bar', driftedDomainData, "Drifted Logs by Domain", 5);
    }

    /**
     * @description Renders all components for the "Pattern & Rhythm Analysis" section.
     * @param {Array<Object>} data - The filtered log data for the selected period.
     */
    function renderPatternAnalysis(data) {
        // 1. Populate Heatmap Filter
        const uniqueTags = [...new Set(data.map(item => item.tag).filter(Boolean))];
        populateHeatmapFilter(uniqueTags);

        // 2. Render Heatmap (Now based on COUNT, not time)
        renderHeatmap(data);

        // 3. Render Tag Deep-Dive Table (AC 2)
        renderTagDeepDiveTable(data);
    }

    /**
     * @description Populates the tag filter dropdown for the heatmap.
     * @param {Array<string>} tags - A unique list of tags.
     */
    function populateHeatmapFilter(tags) {
        // Preserve the "All Tags" option
        heatmapTagFilterEl.innerHTML = '<option value="all">All Tags</option>';
        tags.sort().forEach(tag => {
            const option = document.createElement("option");
            option.value = tag;
            option.textContent = tag;
            heatmapTagFilterEl.appendChild(option);
        });
        // Add a listener that re-renders the heatmap when the filter changes
        heatmapTagFilterEl.onchange = () => renderHeatmap(filterDataByDateRange(fullWeeklyData));
    }

    /**
     * @description Renders the work-hours heatmap as a styled table based on log *count*.
     * @param {Array<Object>} data - The filtered data for the selected period.
     */
    function renderHeatmap(data) {
        workHoursHeatmapEl.innerHTML = "";
        const selectedTag = heatmapTagFilterEl.value;

        // Filter data by the selected tag if it's not "all"
        const heatmapData = selectedTag === 'all'
            ? data
            : data.filter(item => item.tag === selectedTag);

        // Create a data structure to hold LOG COUNT per hour per day
        const heatmapGrid = Array.from({ length: 24 }, () => Array(7).fill(0));
        let maxCount = 0; // Changed from maxMinutes

        heatmapData.forEach(item => {
            const date = new Date(item.timestamp);
            const day = date.getDay(); // Sunday = 0, Saturday = 6
            const hour = date.getHours();
            
            heatmapGrid[hour][day]++; // Increment count
            
            if (heatmapGrid[hour][day] > maxCount) {
                maxCount = heatmapGrid[hour][day]; // Find max count
            }
        });

        // Create the table
        const table = document.createElement("table");
        table.className = "heatmap-table";

        // Header (Days of the week)
        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        headerRow.insertCell(); // Empty corner
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        days.forEach(day => {
            const th = document.createElement("th");
            th.textContent = day;
            headerRow.appendChild(th);
        });

        // Body (Hours and cells)
        const tbody = table.createTBody();
        for (let hour = 8; hour < 19; hour++) { // Displaying typical work hours 8 AM - 6 PM
            const row = tbody.insertRow();
            const timeCell = row.insertCell();
            timeCell.textContent = `${hour}:00`;
            timeCell.className = 'heatmap-time-label';

            for (let day = 0; day < 7; day++) {
                const cell = row.insertCell();
                const count = heatmapGrid[hour][day]; // Get count
                if (count > 0) {
                    // Normalize intensity based on count
                    const intensity = maxCount > 0 ? count / maxCount : 0; 
                    cell.style.backgroundColor = `rgba(82, 162, 160, ${intensity})`; // #52A2A0 with opacity
                    cell.title = `${count} logs`; // Update title
                }
            }
        }
        workHoursHeatmapEl.appendChild(table);
    }

    /**
     * @description Renders the "Tag Deep-Dive" sortable table based on log *count*. (AC 2)
     * @param {Array<Object>} data - The filtered log data for the selected period.
     */
    function renderTagDeepDiveTable(data) {
        tagDeepDiveTableEl.innerHTML = "";
        const tagStats = {};
        const totalLogs = data.length; // (AC 2)

        data.forEach(item => {
            const tag = item.tag || 'Uncategorized';
            if (!tagStats[tag]) {
                tagStats[tag] = { count: 0 };
            }
            tagStats[tag].count++;
        });

        const tableData = Object.entries(tagStats).map(([name, stats]) => ({
            name,
            count: stats.count, // (AC 2)
            percentage: totalLogs > 0 ? Math.round((stats.count / totalLogs) * 100) : 0, // (AC 2)
        })).sort((a, b) => b.count - a.count); // Sort by count

        // Create and render table (AC 2)
        const table = document.createElement("table");
        table.className = "dashboard-table sortable";
        const headers = [
            { key: 'name', text: 'Tag Name' },
            { key: 'count', text: 'Log Count' }, // AC 2: Replaced 'Total Time'
            { key: 'percentage', text: '% of Total' }, // AC 2: Re-calced
            // AC 2: Removed 'Avg. Time / Day'
        ];

        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        headers.forEach(header => {
            const th = document.createElement("th");
            th.textContent = header.text;
            th.dataset.sortKey = header.key;
            headerRow.appendChild(th);
        });

        const tbody = table.createTBody();
        tableData.forEach(item => {
            const row = tbody.insertRow();
            row.insertCell().textContent = item.name;
            row.insertCell().textContent = item.count; // (AC 2)
            row.insertCell().textContent = `${item.percentage}%`; // (AC 2)
        });

        tagDeepDiveTableEl.appendChild(table);
    }

    /**
     * @description Renders all components for the "At a Glance" section. (AC 1)
     * @param {Array<Object>} data - The filtered log data for the selected period.
     */
    function renderAtAGlance(data) {
        // 1. KPIs (AC 1)
        const totalLogs = data.length; // AC 1: New Metric
        const reactiveCount = data.filter(row => row.reactive).length;
        const driftedCount = data.filter(row => row.drifted).length; // AC 1: Keep
        
        // Calculate total minutes *only* for the avg. gap metric
        const totalMinutes = data.reduce((sum, row) => sum + (parseInt(row.minutesSinceLast, 10) || 0), 0);
        
        // AC 1: New metric logic
        const reactivePercentage = totalLogs > 0 ? Math.round((reactiveCount / totalLogs) * 100) : 0;
        
        // AC 1: Keep, but rename
        const avgGap = totalLogs > 0 ? Math.round(totalMinutes / totalLogs) : 0;

        const kpis = {
            "Total Logs": totalLogs, // AC 1: Replaced 'Total Time Logged'
            "'Reactive' Logs": `${reactivePercentage}% (${reactiveCount})`, // AC 1: Replaced 'Reactive Time'
            "'Drifted' Count": driftedCount, // AC 1: Keep
            "Avg. Gap Between Logs": `${avgGap} min` // AC 1: Renamed 'Avg. Log Frequency'
        };
        renderKpis(kpis);

        // 2. Time by Tag (Chart) - Now based on COUNT
        const tagData = aggregateData(data, 'tag'); // Switched to count
        renderChart(timeByTagChartEl, 'pie', tagData, "Logs by Tag", 5); // Updated label

        // 3. Time by Domain (Chart) - Now based on COUNT
        const domainData = aggregateData(data, 'domain'); // Switched to count
        renderChart(timeByDomainChartEl, 'bar', domainData, "Logs by Domain", 10); // Updated label
    }

     /**
     * @description Renders the KPI cards.
     * @param {Object} kpiData - An object with KPI titles as keys and values as values.
     */
    function renderKpis(kpiData) {
        kpiGridEl.innerHTML = "";
        for (const key in kpiData) {
            const card = document.createElement("div");
            card.className = "stat-card";
            card.innerHTML = `<h2>${key}</h2><p>${kpiData[key]}</p>`;
            kpiGridEl.appendChild(card);
        }
    }

    /**
     * @description Aggregates data by key and *counts* occurrences. (Metric Overhaul)
     * @param {Array<Object>} data - The filtered data array.
     * @param {string} key - The property to group by (e.g., 'tag').
     * @returns {Array<Object>} A sorted array of aggregated data (count-based).
     */
    function aggregateData(data, key) {
        const aggregation = {};
        const totalCount = data.length;

        data.forEach(item => {
            const itemKey = item[key] || 'Uncategorized';
            // Increment count for this key
            aggregation[itemKey] = (aggregation[itemKey] || 0) + 1;
        });

        return Object.entries(aggregation)
            .map(([name, value]) => ({
                name,
                value, // 'value' is now the COUNT
                percentage: totalCount > 0 ? Math.round((value / totalCount) * 100) : 0
            }))
            .sort((a, b) => b.value - a.value); // Sort by count
    }

    /**
     * @description Creates and renders a chart using Chart.js.
     * @param {HTMLElement} canvasEl - The canvas element to render the chart into.
     * @param {string} chartType - The type of chart (e.g., 'pie', 'bar').
     * @param {Array<Object>} data - The aggregated data array.
     * @param {string} label - The label for the dataset.
     * @param {number} topN - The number of top items to show.
     */
    function renderChart(canvasEl, chartType, data, label, topN) {
        if (canvasEl.chart) {
            canvasEl.chart.destroy(); // Destroy existing chart instance if it exists
        }

        if (data.length === 0) {
            const ctx = canvasEl.getContext('2d');
            ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
            canvasEl.style.display = 'none'; // Hide canvas
            // Optionally show a message
            const messageEl = canvasEl.parentNode.querySelector('.chart-message');
            if (!messageEl) {
                const newMsg = document.createElement('p');
                newMsg.className = 'chart-message';
                newMsg.textContent = "No data to display.";
                canvasEl.parentNode.appendChild(newMsg);
            }
            return;
        } else {
             canvasEl.style.display = 'block';
             const existingMsg = canvasEl.parentNode.querySelector('.chart-message');
             if (existingMsg) existingMsg.remove();
        }


        const topData = data.slice(0, topN);
        const labels = topData.map(d => d.name);
        const values = topData.map(d => d.value);

        const chartConfig = {
            type: chartType,
            data: {
                labels: labels,
                datasets: [{
                    label: label,
                    data: values,
                    backgroundColor: [
                        '#52A2A0', // Bigger accents
                        '#EEBD69', // Small accents
                        '#315558', // Text
                        '#7FB0AF',
                        '#F2C98A',
                        '#5A7E80',
                    ],
                    borderColor: '#ffffff',
                    borderWidth: chartType === 'pie' ? 2 : 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: chartType === 'pie' ? 'top' : 'none',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                const value = context.raw;
                                // (Metric Overhaul) Changed tooltip to show 'logs' instead of time
                                label += `${value} logs`; 
                                return label;
                            }
                        }
                    }
                },
                scales: chartType === 'bar' ? {
                    y: {
                        beginAtZero: true
                    }
                } : {}
            }
        };

        canvasEl.chart = new Chart(canvasEl, chartConfig);
    }

    // --- Date Filtering Logic ---

    /**
     * @description Filters the raw data based on the selected date range.
     * @param {Array<Object>} data - The full, unfiltered dataset.
     * @returns {Array<Object>} The data filtered to the selected date range.
     */
    function filterDataByDateRange(data) {
        const { start, end } = getDateRange();
        if (!start || !end) return data; // Return all if no valid range

        return data.filter(item => {
            const itemDate = new Date(item.timestamp);
            return itemDate >= start && itemDate <= end;
        });
    }

    /**
     * @description Gets the start and end dates based on the selector's value.
     * @returns {{start: Date, end: Date}}
     */
    function getDateRange() {
        const selected = dateRangeSelect.value;
        const now = new Date();
        let start = new Date();
        let end = new Date(now); // Clone current date

        switch (selected) {
            case 'this-week':
                const firstDayOfWeek = now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1); // Monday as first day
                start = new Date(now.setDate(firstDayOfWeek));
                break;
            case 'last-week':
                const firstDayOfLastWeek = now.getDate() - now.getDay() - 6;
                start = new Date(now.setDate(firstDayOfLastWeek));
                end = new Date(start);
                end.setDate(start.getDate() + 6);
                break;
            case 'this-month':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                break;
            case 'custom':
                start = new Date(startDateInput.value);
                end = new Date(endDateInput.value);
                break;
        }

        // Set time to the beginning of the start day and end of the end day
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        return { start, end };
    }

    // --- Initial Load ---
    // Set default dates for custom filter
    endDateInput.valueAsDate = new Date();
    startDateInput.valueAsDate = new Date(new Date().setDate(new Date().getDate() - 7));

    // Automatically refresh weekly data on first load
    refreshDataBtn.click();
});