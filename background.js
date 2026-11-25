// Initial Setup
const INIT_VARIABLES = {
    totalDayTime : 0,
    totalWeekTime: 0,
    websiteTime: {},
    lastTab: null
}

const SESSION_DEFAULTS = {
    currentTab: null,
    currentDomain: null,
    tabStartTime: null,
    sessionStartTime: null,
    sessionTime: 0,
    tabTime: 0
};

let queue = Promise.resolve();
const CHECKPOINTNAME = "ScreenTimeAlarm";
const DAILYALARM = "DailyAlarm";
const WEEKLYALARM = "WeeklyAlarm";

async function initLocal(reset = false) {
    const allVar = await chrome.storage.local.get(Object.keys(INIT_VARIABLES));

    const missingVar = {};

    if (!reset) {
        for (const [key, value] of Object.entries(INIT_VARIABLES)) {
            if (allVar[key] === undefined) {
                missingVar[key] = value;
            }
        }

        await chrome.storage.local.set(missingVar);
    } else {
        await chrome.storage.local.set(INIT_VARIABLES);
    }

    console.log("Initialized variables:", missingVar);
}

async function initSession() {
    await stopTracking();
    await chrome.storage.session.set(SESSION_DEFAULTS);
    await chrome.storage.session.set({ sessionStartTime: Date.now() });

    console.log("Initialized session variables:", SESSION_DEFAULTS);
    await trackActiveTab();
}

chrome.runtime.onInstalled.addListener(async () => {
    enqueue(() => initLocal());
    enqueue(initSession);
})

// Runs everytime the browser starts up
chrome.runtime.onStartup.addListener(() => {
    enqueue(initSession);
})

/*
    Website Time Tracking
*/

/**
 * Get the hostname of the current tab
 */
function getDomain(url) {
    if (!url) return null;
    try {
        const websiteUrl = new URL(url);

        if (websiteUrl.protocol === 'file:') {
            return "Local Files";
        } else if (websiteUrl.protocol === "about:") {
            return "Browser Pages";
        } else if (websiteUrl.protocol === "chrome:" || websiteUrl.protocol === "chrome-extension:") {
            return `${websiteUrl.protocol}//${websiteUrl.host}`;
        } else if (websiteUrl.hostname) {
            return websiteUrl.hostname;
        } else {
            return websiteUrl.protocol;
        }
    } catch (error) {
        console.error("Error occurred while parsing URL:", error);
        return null;
    }
}

/**
 * Starting tracking on the active tab when the extension is installed or the browser starts up
 */
async function trackActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab) {
        await startTracking(tab.id, tab.url || tab.pendingUrl);
    }
}

/**
 * Starts tracking on the given tabId
 */
async function startTracking(tabId, givenUrl = null) {
    try {
        const tab = await chrome.tabs.get(tabId);
        const window = await chrome.windows.get(tab.windowId);
        if (!window.focused) return;

        const url = givenUrl || tab.url || tab.pendingUrl;
        const currDomain = getDomain(url);
        await chrome.storage.session.set({ currentTab: tabId, tabStartTime: Date.now(), currentDomain: currDomain });

        // Last Tab
        await chrome.storage.local.set({lastTab:currDomain});

    } catch (error) {
        console.error("Error occurred while fetching tab:", error);
        return;
    }
}

/**
 * Stops tracking on the current tab and updates the local storage with the time spent on that tab
 */
async function stopTracking() {
    const sessionData = await chrome.storage.session.get(['currentTab', 'tabStartTime', 'tabTime', 'currentDomain', 'sessionTime']);

    if (sessionData.currentTab != null && sessionData.tabStartTime != null) {
        sessionData.tabTime = Math.max(0, (Date.now() - sessionData.tabStartTime) / 1000);
        sessionData.sessionTime += sessionData.tabTime;

        //Update totalDayTime, totalWeekTime, and websiteTime in local storage
        const localData = await chrome.storage.local.get(['totalDayTime', 'totalWeekTime', 'websiteTime']);
        const websiteTime = localData.websiteTime || {};

        if (sessionData.currentDomain) {
            websiteTime[sessionData.currentDomain] = (websiteTime[sessionData.currentDomain] || 0) + sessionData.tabTime;
        }

        localData.totalDayTime += sessionData.tabTime;
        localData.totalWeekTime += sessionData.tabTime;
        localData.websiteTime = websiteTime;

        // get the current tab's URL and update the websiteTime object
        await chrome.storage.local.set(localData);

        // Reset session variables
        await chrome.storage.session.set({ currentTab: null, currentDomain: null, tabStartTime: null, tabTime: sessionData.tabTime, sessionTime: sessionData.sessionTime });
    }
}

/**
 * User Switching Tabs
 */
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
    enqueue(async () => {
        try {
            const currWindow = await chrome.windows.get(windowId);

            if (!currWindow.focused) return;
        } catch (error) {
            console.error("Error occurred while fetching window:", error);
            return;
        }

        try {
            await stopTracking();
        } finally {
            await startTracking(tabId);
        }
    })
})

/**
 * User Closing Tabs
 */
chrome.tabs.onRemoved.addListener((tabId) => {
    enqueue(async () => {
        const sessionData = await chrome.storage.session.get('currentTab');

        if (sessionData.currentTab === tabId) {
            await stopTracking();
        }
    })
})

/**
 * User Navigating to a Different URL in the Same Tab
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!changeInfo.url) return;

    enqueue(async () => {
        const sessionData = await chrome.storage.session.get(['currentTab', 'currentDomain']);
        if (getDomain(changeInfo.url) === sessionData.currentDomain) return;
        if (sessionData.currentTab === tabId) {
            await stopTracking();
            await startTracking(tabId, changeInfo.url);
        }
    })
})

/**
 * User Switching Windows/ Not Focusing on the Browser
 */
chrome.windows.onFocusChanged.addListener((windowId) => {
    enqueue(async () => {
        await stopTracking();
        if (windowId === chrome.windows.WINDOW_ID_NONE) return;

        const [currTab] = await chrome.tabs.query({ active: true, windowId });

        if (currTab) {
            await startTracking(currTab.id, currTab.url || currTab.pendingUrl);
        }
    })
})

/**
 * Tab being replaced, edge case according to claude
 */
chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
    enqueue(async () => {
        const { currentTab } = await chrome.storage.session.get('currentTab');
        if (currentTab === addedTabId) return;

        let shouldTrack = currentTab === removedTabId;

        // Determine if the tab is active and focused, if so, tract
        if (!shouldTrack) {
            try {
                const tab = await chrome.tabs.get(addedTabId);
                const window = await chrome.windows.get(tab.windowId);

                shouldTrack = tab.active && window.focused;
            } catch {
                return; // cannot retrive, meaning tab/window gone
            }
        }

        if (shouldTrack) {
            await stopTracking();
            await startTracking(addedTabId);
        }
    })
})
/**
 * Periodically update the session time in local storage every 30 seconds
 * Reset total day time when midnight strikes
 * Reset All data except for lastTab at Sunday 12:00am
 */
chrome.alarms.onAlarm.addListener((alarm) => {
    enqueue(async () => {
        if (alarm.name === CHECKPOINTNAME) {
            const { currentTab } = await chrome.storage.session.get('currentTab');
            if (currentTab == null) return;
            await stopTracking();
            await startTracking(currentTab);
        
        } else if (alarm.name === DAILYALARM) {
            await initSession();
            await chrome.storage.local.set({ totalDayTime: 0 });

            // Create alarm for tomorrow
            const tomorrow = new Date();

            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);

            await chrome.alarms.create(DAILYALARM, { when: tomorrow.getTime() });

        } else if (alarm.name === WEEKLYALARM) {
            const tempLastTabVar = (await chrome.storage.local.get('lastTab')).lastTab;
            await initSession();
            await initLocal(true);

            await chrome.storage.local.set({ lastTab: tempLastTabVar });

            // Create alarm for the next week
            await chrome.alarms.create(WEEKLYALARM, {
                when: nextSunday()
            });
        }
    })
})
/**
 * Get the start of the next week
 */
function nextSunday() {
    const now = new Date();
    const nextSunday = new Date(now);

    nextSunday.setHours(0, 0, 0, 0);
    nextSunday.setDate(now.getDate() + ((7 - now.getDay()) % 7 || 7));

    return nextSunday.getTime();
}
/**
 * Checks if the alarm is there, if not, create one, ripped straight from API documentation
 */
async function checkAlarmState() {
    const alarm = await chrome.alarms.get(CHECKPOINTNAME);
    const dailyAlarm = await chrome.alarms.get(DAILYALARM);
    const weeklyAlarm = await chrome.alarms.get(WEEKLYALARM);

    if (!alarm) {
        await chrome.alarms.create(CHECKPOINTNAME, { periodInMinutes: 0.5 });
    }
    if (!dailyAlarm) {
        const tomorrow = new Date();

        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        await chrome.alarms.create(DAILYALARM, { when: tomorrow.getTime() });
    }

    if (!weeklyAlarm) {
        await chrome.alarms.create(WEEKLYALARM, { when: nextSunday() });
    }
}

/**
 * Executes full reset when received message from popup.js
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'RESETDATA') {
        enqueue(async () => {
            await initSession();
            await initLocal(true);
        })
    }
})

/**
* Queue the events
*/
function enqueue(task) {
    queue = queue
        .then(task)
        .catch((error) => console.error("Tracking error:", error));
    return queue;
}

// Normal Code
checkAlarmState().catch(console.error);