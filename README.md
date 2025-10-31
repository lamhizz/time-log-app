# WurkWurk - A Smart Time-Logging Assistant

WurkWurk is a Chrome extension designed to help you maintain a consistent and detailed log of your work activities. At a customizable interval, it presents a simple popup, prompting you to jot down what you're working on. These logs are sent directly to a private Google Sheet, creating a valuable dataset for personal productivity analysis, timesheet completion, or project tracking.

## Features

- **Automated Logging Prompts**: A popup appears at a configurable interval to remind you to log your work.
- **Direct to Google Sheets**: Your logs are sent instantly and securely to a Google Sheet you own.
- **Task Timer**: A built-in timer in the popup allows you to track the duration of a specific task.
- **Customizable Tags**: Define a list of common tags for quick categorization of your logs.
- **Pomodoro Timer**: An integrated Pomodoro timer to help you stay focused and take regular breaks.
- **"Do Not Disturb" Mode**: Specify domains where you don't want the logging popup to appear.
- **Configurable Work Hours**: Set your working days and hours to ensure the extension only prompts you when you're working.
- **Manual Logging**: Manually trigger the popup at any time using a keyboard shortcut or the right-click context menu.
- **User-Friendly Interface**: A clean, modern interface with tooltips and clear instructions.

## Setup Instructions

For the extension to work, you must connect it to a Google Sheet via a Google Apps Script.

**For the most detailed, up-to-date instructions, please open the extension's options and click on the "Setup Guide" link.**

## Configuration Options

All settings are managed through the extension's options page.

- **Google Apps Script URL**: The URL for your deployed web app.
- **Log Interval**: The time in minutes between logging prompts.
- **Log Tags**: A list of tags to be available in the dropdown.
- **Working Week & Hours**: Set your work schedule.
- **"Do Not Disturb" Domains**: A list of domains where the popup should not automatically appear.
- **Notification Sound**: Choose a sound to play when the popup appears.
- **Pomodoro Settings**: Enable and configure the Pomodoro timer, including session and break durations.
