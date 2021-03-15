define([
  "shared"
], function(
  shared
) {

// This is modeled/taken on/from bg_utils.js in vimium.
const TIME_DELTA = 250; // Milliseconds.

// TabRecency associates a logical timestamp with each tab id.  These are used to provide an initial
// recency-based ordering in the tabs vomnibar (which allows jumping quickly between recently-visited tabs).
class TabRecency {

  constructor() {
    this.timestamp = 1;
    this.current = -1;
    this.cache = {};
    this.lastVisited = null;
    this.lastVisitedTime = null;
    this.jumpList = null;

    chrome.tabs.onActivated.addListener(activeInfo => this.register(activeInfo.tabId));
    chrome.tabs.onRemoved.addListener(tabId => this.deregister(tabId));

    chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
      this.deregister(removedTabId);
      this.register(addedTabId);
    });

    if (chrome.windows != null) {
      chrome.windows.onFocusChanged.addListener(wnd => {
        if (wnd !== chrome.windows.WINDOW_ID_NONE) {
          chrome.tabs.query({windowId: wnd, active: true}, tabs => {
            if (tabs[0])
              this.register(tabs[0].id);
          });
        }
      });
    }
  }

  selectSpecificTab(tabId) {
    chrome.tabs.get(tabId, function(tab) {
      if (chrome.windows != null) {
        chrome.windows.update(tab.windowId, { focused: true });
      }
      return chrome.tabs.update(tabId, { active: true });
    });
  }

  jumpBackTab() {
    console.log(`XXX jump back tab`);
    let backTabId = -1;
    if (!this.jumpList) {
      // getTabsByRecency might not include the current tab, eg if it was just
      // opened. Tabs aren't added until they have been seen for some time and
      // then an event is fired (like navigating back to the window). Add the
      // current tab if it hasn't been added.
      const tabs = this.getTabsByRecency().reverse();
      if (tabs.length > 0 && tabs[tabs.length - 1] !== this.current) {
        tabs.push(this.current);
      }
      this.jumpList = new TabJumpList(tabs);
    }
    backTabId = this.jumpList.getJumpBackTabId();
    backTabId === -1 ? this.current : backTabId;

    this.selectSpecificTab(backTabId);
  }

  jumpForwardTab() {
    console.log(`XXX jump forward tab`);
    let forwardTabId = -1;
    if (this.jumpList) {
      forwardTabId = this.jumpList.getJumpForwardTabId();
    }
    forwardTabId === -1 ? this.current : forwardTabId;

    this.selectSpecificTab(forwardTabId);
  }

  register(tabId) {
    const currentTime = new Date();
    // Register tabId if it has been visited for at least @timeDelta ms.  Tabs which are visited only for a
    // very-short time (e.g. those passed through with `5J`) aren't registered as visited at all.
    if ((this.lastVisitedTime != null) && (TIME_DELTA <= (currentTime - this.lastVisitedTime))) {
      this.cache[this.lastVisited] = ++this.timestamp;
    }

    if (this.jumpList && !this.jumpList.isCoherent(tabId)) {
      this.jumpList = null;
    }

    this.current = (this.lastVisited = tabId);
    this.lastVisitedTime = currentTime;
  }

  deregister(tabId) {
    if (tabId === this.lastVisited) {
      // Ensure we don't register this tab, since it's going away.
      this.lastVisited = (this.lastVisitedTime = null);
    }
    delete this.cache[tabId];

    if (this.jumpList) {
      const jumpListInvalidated = this.jumpList.deregister(tabId);
      if (jumpListInvalidated) this.jumpList = null;
    }
  }

  // Returns a list of tab Ids sorted by recency, most recent tab first.
  getTabsByRecency() {
    const tabIds = Object.keys(this.cache || {});
    tabIds.sort((a,b) => this.cache[b] - this.cache[a]);
    return tabIds.map(tId => parseInt(tId));
  }
}

// TabJumpList maintains a list of visited tabs. When no jumps have occurred,
// the list is all open tabs--the current (i.e. most recently visited) tab is
// the last element. The tab visited the longest in the past is the 0th tab.
// Jumping backwards moves through the open tabs. The index is maintained,
// allowing jumping forward to move again back to newer tabs. A manual
// navigation through a mechanism other than a jump resets the jump list.
class TabJumpList {

  constructor(tabs) {
    this.tabs = tabs;
    this.activeIdx = tabs.length - 1;
    // Tabs can be deleted after a TabJumpList has flattened the tabs into an
    // array. Rather than O(N) look through the tabs, we'll just maintain
    // deleted IDs and skip them.
    this.deletedTabs = new Set();
  }

  isCoherent(currentTabId) {
    return this.tabs[this.activeIdx] === currentTabId;
  }

  // Returns true if deregistering this tab invalidates the jump list.
  deregister(tabId) {
    if (this.tabs[this.activeIdx] == tabId) return true;

    this.deletedTabs.add(tabId);
    return false;
  }

  getJumpBackTabId() {
    let candidateIdx = -1;
    let need = 1; // vestige of count support in vimium implementation
    for (let i = this.activeIdx - 1; i >= 0; i--) {
      let candidateId = this.tabs[i];
      if (this.deletedTabs.has(candidateId)) {
        continue;
      }
      candidateIdx = i;
      need--;
      if (need <= 0) {
        break;
      }
    }

    if (candidateIdx === -1) {
      // We're at the oldest tab.
      return -1;
    }

    this.activeIdx = candidateIdx;
    return this.tabs[this.activeIdx];
  }

  getJumpForwardTabId() {
    let candidateIdx = -1;
    let need = 1; // vestige of count support in vimium implementation
    for (let i = this.activeIdx + 1; i < this.tabs.length; i++) {
      let candidateId = this.tabs[i];
      if (this.deletedTabs.has(candidateId)) {
        continue;
      }
      candidateIdx = i;
      need--;
      if (need <= 0) {
        break;
      }
    }

    if (candidateIdx === -1) {
      // We're at the newest tab.
      return -1;
    }

    this.activeIdx = candidateIdx;
    return this.tabs[this.activeIdx];
  }
}

let tabJumpList = new TabRecency();

return shared('tabJumpList', {
  tabJumpList,
});
});

