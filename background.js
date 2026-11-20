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

async function initLocal() {
    const allVar = await chrome.storage.local.get(Object.keys(INIT_VARIABLES));

    const missingVar = {};

    for (const [key, value] of Object.entries(INIT_VARIABLES)) {
        if (allVar[key] === undefined) {
            missingVar[key] = value;
        }
    }

    await chrome.storage.local.set(missingVar);

    console.log("Initialized variables:", missingVar);
}

async function initSession() {
    await chrome.storage.session.set(SESSION_DEFAULTS);
    await chrome.storage.session.set({ sessionStartTime: Date.now() });

    console.log("Initialized session variables:", SESSION_DEFAULTS);

    await trackActiveTab();
}

chrome.runtime.onInstalled.addListener(async() => {
    await initLocal();
    await initSession();
})

// Runs everytime the browser starts up
chrome.runtime.onStartup.addListener(() => {
    enqueue(initSession());
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
            return null;
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
    } catch (error) {
        console.error("Error occurred while fetching tab:", error);
        return;
    }

    const url = givenUrl || tab.url || tab.pendingUrl;
    const domain = getDomain(url);
    await chrome.storage.session.set({ currentTab: tabId, tabStartTime: Date.now(), currentDomain: domain });


}

/**
 * Stops tracking on the current tab and updates the local storage with the time spent on that tab
 */
async function stopTracking() {
    const sessionData = await chrome.storage.session.get(['currentTab', 'tabStartTime', 'tabTime', 'currentDomain', 'sessionTime']);

    if (sessionData.currentTab != null && sessionData.tabStartTime != null) {
        sessionData.tabTime = Math.max(0, Math.floor((Date.now() - sessionData.tabStartTime) / 1000));
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

        await stopTracking();
        await startTracking(tabId);
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
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (!changeInfo.url) return;

    const sessionData = await chrome.storage.session.get(['currentTab', 'currentDomain']);
    if (get(changeInfo.url) === sessionData.currentDomain) return;

    enqueue(async () => {
        if (sessionData.currentTab === tabId) {
            await stopTracking();
            await startTracking(tabId);
        }
    })
})

/**
 * User Switching Windows/ Not Focusing on the Browser
 */
chrome.windows.onFocusChanged.addListener((windowId) => {
    enqueue(async () => {
        await stopTracking();
        if (windowId !== chrome.windows.WINDOW_ID_NONE) {
            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

            if (tab) {
                await startTracking(tab.id, tab.url || tab.pendingUrl);
            }
        }
    })
})

/**
 * Periodically update the session time in local storage every 5 seconds
 */

/**
 * Checks if the alarm is there, if not, create one, ripped straight from API documentation
 */
async function checkAlarmState() {
    const alarm = await browser.alarms.get("my-alarm");

    if (!alarm) {
        await browser.alarms.create("my-alarm", { periodInMinutes: 1 });
    }
}

/**
* Queue the events
*/
function enqueue(task) {
    queue = queue
        .then(task)
        .catch((error) => console.error("Tracking error:", error));
    return queue;
}

