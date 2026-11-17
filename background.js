const INIT_VARIABLES = {
    totalDayTime : 0,
    totalWeekTime: 0,
    webSiteTime: {},
    lastTab: null
}

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
    await chrome.storage.session.set({ sessionTime: 0, tabTime: 0, currentTab: null, sessionStartTime: Date.now(), tabStartTime: Date.now() });
})

async function startTracking(tabId) {
    await chrome.storage.session.set({ currentTab: tabId , tabStartTime: Date.now() });
}

async function stopTracking() {
    const sessionData = await chrome.storage.session.get(['currentTab', 'tabStartTime', 'sessionStartTime', 'tabTime']);
    sessionData.tabTime += Math.floor((Date.now() - sessionData.tabStartTime) / 1000);

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