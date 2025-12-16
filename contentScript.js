(async () => {

  const helpers = await import(chrome.runtime.getURL("shared/ruleMatcher.js"));

  const state = {
    rules: [],
    activeRules: [],
    textPatterns: [],
    imagePatterns: [],
    observer: null,
    applyTimer: null
  };

  const escapeRegex = (value = "") =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const buildTextPatterns = () => {
    state.textPatterns = [];
    state.activeRules.forEach((rule) => {
      rule.textReplacements.forEach((entry) => {
        const source = entry.useRegex ? entry.find : escapeRegex(entry.find || "");
        if (!source) {
          return;
        }
        const flags = entry.caseSensitive ? "g" : "gi";
        try {
          const regex = new RegExp(source, flags);
          state.textPatterns.push({
            regex,
            replacement: entry.replace ?? ""
          });
        } catch (error) {
          console.warn("Invalid text replacement regex", source, error);
        }
      });
    });
  };

  const buildImagePatterns = () => {
    state.imagePatterns = [];
    state.activeRules.forEach((rule) => {
      rule.imageReplacements.forEach((entry) => {
        if (!entry.match) {
          return;
        }
        if (entry.useRegex) {
          try {
            const regex = new RegExp(entry.match, "i");
            state.imagePatterns.push({
              test: (value) => {
                regex.lastIndex = 0;
                return regex.test(value);
              },
              replacement: entry.replace
            });
          } catch (error) {
            console.warn("Invalid image regex", entry.match, error);
          }
        } else {
          const needle = entry.match.toLowerCase();
          state.imagePatterns.push({
            test: (value) =>
              Boolean(value?.toLowerCase().includes(needle)),
            replacement: entry.replace
          });
        }
      });
    });
  };

  const refreshActiveRules = async () => {
    const { rules = [] } = await chrome.storage.local.get({ rules: [] });
    state.rules = helpers.normalizeRules(rules);
    const currentUrl = window.location.href;
    state.activeRules = state.rules.filter((rule) =>
      helpers.doesUrlMatchRule(currentUrl, rule)
    );
    buildTextPatterns();
    buildImagePatterns();
  };

  const originalTextMap = new WeakMap();
  const touchedTextNodes = new Set();
  const originalImageMap = new WeakMap();
  const touchedImages = new Set();

  const restoreTextNodes = () => {
    touchedTextNodes.forEach((node) => {
      if (!node.isConnected) {
        originalTextMap.delete(node);
        return;
      }
      const original = originalTextMap.get(node);
      if (typeof original === "string" && node.nodeValue !== original) {
        node.nodeValue = original;
      }
    });
    touchedTextNodes.clear();
  };

  const restoreImages = () => {
    touchedImages.forEach((img) => {
      if (!img.isConnected) {
        originalImageMap.delete(img);
        return;
      }
      const original = originalImageMap.get(img);
      if (original && img.src !== original) {
        img.src = original;
      }
    });
    touchedImages.clear();
  };

  const applyTextReplacements = (root) => {
    if (!state.textPatterns.length || !root) {
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue?.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        const parentTag = node.parentElement?.tagName;
        if (
          parentTag &&
          ["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"].includes(parentTag)
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let currentNode;
    while ((currentNode = walker.nextNode())) {
      let baseline =
        originalTextMap.get(currentNode) ?? currentNode.nodeValue ?? "";
      let textValue = baseline;
      let mutated = false;
      state.textPatterns.forEach((pattern) => {
        pattern.regex.lastIndex = 0;
        const replaced = textValue.replace(pattern.regex, pattern.replacement);
        if (replaced !== textValue) {
          textValue = replaced;
          mutated = true;
        }
      });
      if (mutated) {
        originalTextMap.set(currentNode, baseline);
        currentNode.nodeValue = textValue;
        touchedTextNodes.add(currentNode);
      }
    }
  };

  const applyImageReplacements = (root) => {
    if (!state.imagePatterns.length || !root) {
      return;
    }
    const images =
      root.nodeType === Node.ELEMENT_NODE
        ? root.querySelectorAll("img")
        : document.querySelectorAll("img");

    images.forEach((img) => {
      const src = img.currentSrc || img.src;
      if (!src) {
        return;
      }
      for (const pattern of state.imagePatterns) {
        if (pattern.test(src)) {
          if (!originalImageMap.has(img)) {
            originalImageMap.set(img, img.src);
          }
          if (typeof pattern.replacement !== "undefined") {
            img.src = pattern.replacement;
          }
          touchedImages.add(img);
          break;
        }
      }
    });
  };

  const applyAll = () => {
    if (!document.body) {
      return;
    }
    restoreTextNodes();
    restoreImages();

    if (!state.activeRules.length) {
      return;
    }

    applyTextReplacements(document.body);
    applyImageReplacements(document.body);
  };

  const scheduleApply = () => {
    if (state.applyTimer) {
      return;
    }
    state.applyTimer = setTimeout(() => {
      state.applyTimer = null;
      applyAll();
    }, 120);
  };

  const ensureObserver = () => {
    if (!state.activeRules.length || !document.body) {
      if (state.observer) {
        state.observer.disconnect();
      }
      return;
    }

    if (!state.observer) {
      state.observer = new MutationObserver(() => scheduleApply());
    } else {
      state.observer.disconnect();
    }

    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  };

  const run = async () => {
    await refreshActiveRules();
    applyAll();
    ensureObserver();
  };

  const start = () => {
    run();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "RULES_UPDATED") {
      run();
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.rules) {
      run();
    }
  });
})();
