export type NavigateArgs = {
  url: string
  newTab?: boolean
}

export type NavigateResult = {
  finalUrl: string
  title: string | null
  tabId: number
}

async function waitForTabComplete(tabId: number, timeoutMs = 15_000): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Navigation timed out'))
    }, timeoutMs)

    const onUpdated = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId !== tabId) return
      if (changeInfo.status !== 'complete') return
      void chrome.tabs.get(tabId).then(
        (tab) => {
          cleanup()
          resolve(tab)
        },
        (error) => {
          cleanup()
          reject(error)
        }
      )
    }

    const cleanup = () => {
      clearTimeout(timeout)
      chrome.tabs.onUpdated.removeListener(onUpdated)
    }

    chrome.tabs.onUpdated.addListener(onUpdated)
  })
}

export async function executeNavigateTool(args: NavigateArgs): Promise<NavigateResult> {
  const url = args.url?.trim()
  if (!url) throw new Error('Missing url')

  if (args.newTab) {
    const tab = await chrome.tabs.create({ url })
    if (!tab.id) throw new Error('Failed to open new tab')
    const finalTab = await waitForTabComplete(tab.id).catch(() => tab)
    return {
      finalUrl: finalTab.url ?? url,
      title: finalTab.title ?? null,
      tabId: finalTab.id,
    }
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('No active tab')
  await chrome.tabs.update(tab.id, { url })
  const finalTab = await waitForTabComplete(tab.id).catch(() => tab)
  return {
    finalUrl: finalTab.url ?? url,
    title: finalTab.title ?? null,
    tabId: finalTab.id,
  }
}
