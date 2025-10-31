# Work Log Timer - Chrome Extension

Work Log Timer is a Chrome extension designed to help you maintain a consistent and detailed log of your work activities. At a customizable interval, it presents a simple popup, prompting you to jot down what you're working on. These logs are sent directly to a private Google Sheet, creating a valuable dataset for personal productivity analysis, timesheet completion, or project tracking.

## How it Works

The extension operates as a service worker (`background.js`) that runs in the background, managing a timer. When the timer fires, it injects a content script (`content.js`) into your active tab, which then displays the logging popup. User input is securely sent to a Google Apps Script, which acts as a bridge to your Google Sheet. All configuration is handled through a dedicated options page.

## Features

- **Automated Logging Prompts**: A popup appears at a configurable interval (e.g., every 15 minutes) to remind you to log your work.
- **Direct to Google Sheets**: Your logs are sent instantly and securely to a Google Sheet you own.
- **Task Timer**: A built-in timer in the popup allows you to track the duration of a specific task. When you stop the timer, the task name and duration are pre-filled into the log input.
- **Customizable Tags**: Define a list of common tags (e.g., "Meeting," "Focus Time," "Email") for quick categorization of your logs. The three most recently used tags are always just a click away.
- **"Do Not Disturb" Mode**: Specify domains (e.g., `youtube.com`, `meet.google.com`) where you don't want the logging popup to appear.
- **Configurable Work Hours**: Set your working days and hours to ensure the extension only prompts you when you're actually working.
- **Manual Logging**: Manually trigger the popup at any time using a keyboard shortcut (Ctrl+Shift+L by default) or the right-click context menu.
- **Quick Actions**: Buttons for common tasks like "Log 'Doing Same'" or "Log a 'Break'" streamline the logging process.
- **Snooze & Skip**: Easily postpone or skip a log prompt if you're in the middle of something important.

## Setup Instructions

For the extension to work, you must connect it to a Google Sheet via a Google Apps Script. Please follow these steps carefully.

**For the most detailed, up-to-date instructions, please refer to the `SETUP_GUIDE.txt` file included in this repository.**

1.  **Create Your Google Sheet**:
    *   Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet.
    *   Name it something memorable, like "My Work Logs."
    *   In the first row, create the following nine headers exactly as written:
        | A             | B    | C         | D   | E       | F               | G             | H      | I        |
        | ------------- | ---- | --------- | --- | ------- | --------------- | ------------- | ------ | -------- |
        | `Date`        | `Time` | `Log Entry` | `Tag` | `Drifted` | `Mins Since Last` | `FullTimestamp` | `Domain` | `Reactive` |

2.  **Create the Google Apps Script**:
    *   In your Google Sheet, click `Extensions` > `Apps Script`.
    *   Delete any placeholder code in the `Code.gs` file.
    *   Open the `SETUP_GUIDE.txt` file from this repository and copy the entire Apps Script code provided.
    *   Paste the code into the Apps Script editor.
    *   **Important**: Find the line `const TIME_ZONE = "America/New_York";` and change the time zone to your own.
    *   Save the script.

3.  **Deploy the Script as a Web App**:
    *   Click the blue `Deploy` button and select `New deployment`.
    *   For "Select type," choose `Web app`.
    *   Configure the deployment:
        *   **Execute as**: `Me`
        *   **Who has access**: `Anyone` (This is secure; only someone with the secret URL can send data).
    *   Click `Deploy`. You will need to authorize the script's permissions.
    *   After deployment, **copy the Web app URL**.

4.  **Configure the Extension**:
    *   Go to `chrome://extensions` and find the "Work Log Timer" extension.
    *   Right-click its icon and select `Options`.
    *   Paste the **Web app URL** you copied into the "Google Apps Script URL" field.
    *   Click the "Test" button to verify the connection. You should see a success message.
    *   Customize other settings as needed and click `Save Settings`.

## Configuration Options

All settings are managed through the extension's options page.

- **Google Apps Script URL**: The URL for your deployed web app. (Required)
- **Log Interval**: The time in minutes between logging prompts.
- **Log Tags**: A list of tags to be available in the dropdown, with each tag on a new line.
- **Working Week**: Checkboxes to select the days you want the logging prompts to be active.
- **Working Hours**: The start and end time for logging prompts.
- **"Do Not Disturb" Domains**: A list of domains where the popup should not automatically appear, with each domain on a new line.
- **Notification Sound**: Choose a sound to play when the popup appears.
- **Log Active Domain**: If checked, the domain of the active tab will be included in the log data.
- **Debug Mode**: If checked, a "Show Debug" link will appear in the popup, providing troubleshooting information.
