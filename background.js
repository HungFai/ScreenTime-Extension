// Initial Setup
const INIT_VARIABLES = {
    totalDayTime : 0,
    totalWeekTime: 0,
    webSiteTime: {},
    lastTab: null
}

const SESSION_DEFAULTS = {
    currentTab: null,
    currentDomain: null,
    tabStartTime: Date.now(),
    sessionStartTime: Date.now(),
    sessionTime: 0,
    tabTime: 0
};

chrome.runtime.onInstalled.addListener(async () => {
    const allVar = await chrome.storage.local.get(
        Object.keys(INIT_VARIABLES)
    );

    const missingVar = {};

    for (const [key, value] of Object.entries(INIT_VARIABLES)) {
        if (allVar[key] === undefined) {
            missingVar[key] = value;
        }
    }

    await chrome.storage.local.set(missingVar);

    console.log("Initialized variables:", missingVar);
});

// Runs everytime the browser starts up
chrome.runtime.onStartup.addListener(async () => {
    const sessionDefaults = await chrome.storage.session.get(Object.keys(SESSION_DEFAULTS));
    await chrome.storage.session.set(sessionDefaults);
})

/*
    Website Time Tracking
*/

/**
 * Starts tracking on the given tabId
 */
async function startTracking(tabId) {
    const tab = await chrome.tabs.get(tabId);
    await chrome.storage.session.set({ currentTab: tabId, tabStartTime: Date.now(), currentDomain: new URL(tab.url).hostname });
}

/**
 * Stops tracking on the current tab and updates the local storage with the time spent on that tab
 */
async function stopTracking() {
    const sessionData = await chrome.storage.session.get(['currentTab', 'tabStartTime', 'sessionStartTime', 'tabTime', 'currentDomain']);
    sessionData.tabTime = Math.floor((Date.now() - sessionData.tabStartTime) / 1000);

    await chrome.storage.session.set({ tabTime: sessionData.tabTime });

    //Update totalDayTime, totalWeekTime, and websiteTime in local storage
    const localData = await chrome.storage.local.get(['totalDayTime', 'totalWeekTime', 'webSiteTime']);
    localData.totalDayTime += sessionData.tabTime;
    localData.totalWeekTime += sessionData.tabTime;

    await chrome.storage.local.set(localData);

    // get the current tab's URL and update the webSiteTime object

    const currentTab = await chrome.tabs.get(sessionData.currentTab);
    const domain = new URL(currentTab.url).hostname;
    localData.webSiteTime[domain] = (localData.webSiteTime[domain] || 0) + sessionData.tabTime;
    await chrome.storage.local.set(localData);
}

/**
 * User Switching Tabs
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.storage.session.get('currentTab');

    if (tab !== null) {
        await stopTracking();
    }
    await startTracking(activeInfo.tabId);
})

/**
 * User Closing Tabs
 */
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    const sessionData = await chrome.storage.session.get('currentTab');

    if (sessionData.currentTab === tabId) {
        await stopTracking();
    }
})

/**
 * User Navigating to a Different URL in the Same Tab
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        const sessionData = await chrome.storage.session.get('currentTab');
        if (sessionData.currentTab === tabId) {
            await stopTracking();
        }
    }
})
