(async () => {
  const helpers = await import(chrome.runtime.getURL("shared/ruleMatcher.js"));
  const DEFAULT_TEXT_ATTRIBUTES = [
    "placeholder",
    "title",
    "aria-label",
    "aria-labelledby",
    "aria-describedby",
    "alt",
    "value",
    "textcontent"
  ];
  const TEXT_CONTENT_ATTRS = new Set(["textcontent", "innertext"]);
  const TEXT_CONTENT_TAGS = [
    "a",
    "button",
    "label",
    "span",
    "div",
    "p",
    "li",
    "strong",
    "em",
    "b",
    "i",
    "textarea"
  ];
  const TEXT_CONTENT_SELECTOR = TEXT_CONTENT_TAGS.join(",");
  const TEXT_CONTENT_TAG_SET = new Set(TEXT_CONTENT_TAGS);

  const regexCache = new Map();
  const originalTextMap = new WeakMap();
  const touchedTextNodes = new Set();
  const originalImageMap = new WeakMap();
  const touchedImages = new Set();
  const attributeOriginalValues = new WeakMap();
  const touchedAttributeElements = new Set();

  const BODY_HIDE_TIMEOUT = 300;

  const bodyVisibility = {
    styleEl: null,
    timeoutId: null,
    applied: false
  };

  const state = {
    rules: [],
    activeRules: [],
    textPatterns: [],
    attributePatterns: [],
    attributeSelector: "",
    attributeNameList: [],
    imagePatterns: [],
    cssRules: [],
    observer: null,
    applyTimer: null,
    shouldHide: false,
    hasTextContentAttributes: false
  };

  const escapeRegex = (value = "") =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const cssEscape = (value = "") => {
    if (window.CSS?.escape) {
      return CSS.escape(value);
    }
    return value.replace(/([!\"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
  };

  const getCachedRegex = (pattern, flags) => {
    const cacheKey = `${pattern}__${flags}`;
    if (!regexCache.has(cacheKey)) {
      regexCache.set(cacheKey, new RegExp(pattern, flags));
    }
    return regexCache.get(cacheKey);
  };

  const runWithBody = (callback) => {
    if (document.body) {
      callback(document.body);
      return;
    }
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        if (document.body) {
          callback(document.body);
        }
      },
      { once: true }
    );
  };

  const applyBodyHider = () => {
    if (bodyVisibility.applied) {
      return;
    }
    const style = document.createElement("style");
    style.dataset.ccStyle = "content-customizer-hide";
    style.textContent = "body.cc-hidden{visibility:hidden !important;}";
    document.documentElement.appendChild(style);
    bodyVisibility.styleEl = style;
    runWithBody((body) => body.classList.add("cc-hidden"));
    bodyVisibility.applied = true;
    bodyVisibility.timeoutId = window.setTimeout(() => {
      removeBodyHider();
    }, BODY_HIDE_TIMEOUT);
  };

  const removeBodyHider = () => {
    if (!bodyVisibility.applied) {
      return;
    }
    if (bodyVisibility.timeoutId) {
      clearTimeout(bodyVisibility.timeoutId);
      bodyVisibility.timeoutId = null;
    }
    bodyVisibility.styleEl?.remove();
    bodyVisibility.styleEl = null;
    runWithBody((body) => body.classList.remove("cc-hidden"));
    bodyVisibility.applied = false;
  };

  const buildTextPatterns = () => {
    state.textPatterns = [];
    state.attributePatterns = [];
    const attributeNameSet = new Set();
    let hasTextAttr = false;

    state.activeRules.forEach((rule) => {
      rule.textReplacements.forEach((entry) => {
        const rawSource = entry.find || "";
        const source = entry.useRegex ? rawSource : escapeRegex(rawSource);
        if (!source) {
          return;
        }
        const flags = entry.caseSensitive ? "g" : "gi";
        let regex;
        try {
          regex = getCachedRegex(source, flags);
        } catch (error) {
          console.warn("Invalid text replacement rule", source, error);
          return;
        }

        state.textPatterns.push({
          regex,
          replacement: entry.replace ?? ""
        });

        let attributeList = [];
        if (Array.isArray(entry.attributes)) {
          attributeList = entry.attributes
            .map((attr) => attr.trim().toLowerCase())
            .filter(Boolean);
        } else if (typeof entry.attributes === "string" && entry.attributes.trim()) {
          attributeList = entry.attributes
            .split(",")
            .map((attr) => attr.trim().toLowerCase())
            .filter(Boolean);
        }
        if (!attributeList.length) {
          attributeList = DEFAULT_TEXT_ATTRIBUTES.slice();
        }

        if (attributeList.length) {
          attributeList.forEach((attr) => {
            if (TEXT_CONTENT_ATTRS.has(attr)) {
              hasTextAttr = true;
            } else {
              attributeNameSet.add(attr);
            }
          });
          state.attributePatterns.push({
            regex,
            replacement: entry.replace ?? "",
            attributes: attributeList
          });
        }
      });
    });

    state.attributeNameList = Array.from(attributeNameSet);
    state.attributeSelector = state.attributeNameList
      .map((attr) => `[${cssEscape(attr)}]`)
      .join(",");
    state.hasTextContentAttributes = hasTextAttr;
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
            test: (value) => Boolean(value?.toLowerCase().includes(needle)),
            replacement: entry.replace
          });
        }
      });
    });
  };

  const buildCssRules = () => {
    state.cssRules = [];
    state.activeRules.forEach((rule) => {
      if (rule.cssRules) {
        state.cssRules.push(rule.cssRules);
      }
    });
  };

  const refreshActiveRules = async () => {
    const { rules = [] } = await chrome.storage.local.get({ rules: [] });
    state.rules = helpers.normalizeRules(rules);
    const currentUrl = window.location.href;
    state.activeRules = state.rules.filter((rule) =>
      helpers.doesUrlMatchRule(currentUrl, rule)
    );
    state.shouldHide = state.activeRules.some(
      (rule) => (rule.preloadMode || "hide") === "hide"
    );
    buildTextPatterns();
    buildImagePatterns();
    buildCssRules();
  };

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

  const restoreAttributeValues = () => {
    touchedAttributeElements.forEach((element) => {
      if (!element.isConnected) {
        attributeOriginalValues.delete(element);
        return;
      }
      const record = attributeOriginalValues.get(element);
      if (!record) {
        return;
      }
      Object.entries(record).forEach(([attr, value]) => {
        if (attr === "__textcontent") {
          element.textContent = typeof value === "string" ? value : "";
          return;
        }
        if (attr === "__bgimage") {
          // 恢复背景图片：如果原始 style 属性为空，则移除内联 backgroundImage
          if (!value) {
            element.style.backgroundImage = '';
          } else {
            element.setAttribute("style", value);
          }
          return;
        }
        if (value === null || typeof value === "undefined") {
          element.removeAttribute(attr);
        } else {
          element.setAttribute(attr, value);
        }
      });
      attributeOriginalValues.delete(element);
    });
    touchedAttributeElements.clear();
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

    const processImgElement = (img) => {
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
    };

    const processBackgroundImage = (element) => {
      const computed = window.getComputedStyle(element);
      const inlineStyle = element.style.backgroundImage;
      const computedStyle = computed.backgroundImage;

      // 获取有效的背景图片值
      const bgValue = inlineStyle || computedStyle;
      if (!bgValue || bgValue === 'none') {
        return;
      }

      // 修正后的正则表达式：匹配 url("...") 或 url('...') 或 url(...)
      const urlRegex = /url\((["']?)([^)"']+)\1\)/gi;
      let match;
      let hasReplacement = false;
      let newBgValue = bgValue;

      while ((match = urlRegex.exec(bgValue)) !== null) {
        const url = match[2];
        if (!url) {
          continue;
        }

        for (const pattern of state.imagePatterns) {
          if (pattern.test(url)) {
            let record = attributeOriginalValues.get(element);
            if (!record) {
              record = {};
              attributeOriginalValues.set(element, record);
            }
            if (!("__bgimage" in record)) {
              // 保存原始的完整 style 属性
              record.__bgimage = element.getAttribute("style") || "";
            }

            // 替换 URL
            const newUrl = pattern.replacement || url;
            newBgValue = newBgValue.replace(url, newUrl);
            hasReplacement = true;
            break;
          }
        }
      }

      if (hasReplacement) {
        // 无论背景图来自内联样式还是CSS样式表，都通过设置内联样式来覆盖
        element.style.backgroundImage = newBgValue;
        touchedAttributeElements.add(element);
      }
    };

    const scope =
      root.nodeType === Node.ELEMENT_NODE ? root : document.body || document;

    scope.querySelectorAll("img").forEach((img) => processImgElement(img));

    scope
      .querySelectorAll("[style*=\"background\"], [class], [id]")
      .forEach((el) => processBackgroundImage(el));
  };

  const applyAttributeReplacements = (root) => {
    if (!state.attributePatterns.length) {
      return;
    }

    const attributeElements = new Set();
    const collectAttributeElements = (scope) => {
      if (!state.attributeSelector) {
        return;
      }
      const base =
        scope && scope.nodeType === Node.ELEMENT_NODE ? scope : document.body;
      if (!base) {
        return;
      }
      if (base.matches?.(state.attributeSelector)) {
        attributeElements.add(base);
      }
      base
        .querySelectorAll(state.attributeSelector)
        .forEach((el) => attributeElements.add(el));
    };

    if (state.attributeSelector) {
      if (root) {
        collectAttributeElements(root);
      } else {
        collectAttributeElements(document.body);
      }
    }

    const textElements = new Set();
    const collectTextElements = (scope) => {
      if (!state.hasTextContentAttributes) {
        return;
      }
      const base =
        scope && scope.nodeType === Node.ELEMENT_NODE ? scope : document.body;
      if (!base) {
        return;
      }
      const tagName = base.tagName?.toLowerCase();
      if (tagName && TEXT_CONTENT_TAG_SET.has(tagName)) {
        textElements.add(base);
      }
      base
        .querySelectorAll(TEXT_CONTENT_SELECTOR)
        .forEach((el) => textElements.add(el));
    };

    if (state.hasTextContentAttributes) {
      if (root) {
        collectTextElements(root);
      } else {
        collectTextElements(document.body);
      }
    }

    const ensureOriginal = (element, key, getter) => {
      let record = attributeOriginalValues.get(element);
      if (!record) {
        record = {};
        attributeOriginalValues.set(element, record);
      }
      if (!(key in record)) {
        record[key] = typeof getter === "function" ? getter() : getter;
      }
    };

    state.attributePatterns.forEach((pattern) => {
      const realAttributes = pattern.attributes.filter(
        (attr) => !TEXT_CONTENT_ATTRS.has(attr)
      );
      const hasTextAttr = pattern.attributes.some((attr) =>
        TEXT_CONTENT_ATTRS.has(attr)
      );

      if (realAttributes.length && attributeElements.size) {
        attributeElements.forEach((element) => {
          if (!element || element.nodeType !== Node.ELEMENT_NODE) {
            return;
          }
          realAttributes.forEach((attr) => {
            if (!element.hasAttribute(attr)) {
              return;
            }
            const currentValue = element.getAttribute(attr);
            if (currentValue === null) {
              return;
            }
            pattern.regex.lastIndex = 0;
            const replaced = currentValue.replace(
              pattern.regex,
              pattern.replacement
            );
            if (replaced !== currentValue) {
              ensureOriginal(element, attr, () => element.getAttribute(attr));
              element.setAttribute(attr, replaced);
              touchedAttributeElements.add(element);
            }
          });
        });
      }

      if (hasTextAttr && textElements.size) {
        textElements.forEach((element) => {
          if (
            !element ||
            element.nodeType !== Node.ELEMENT_NODE ||
            element.children.length > 0
          ) {
            return;
          }
          const currentValue = element.textContent ?? "";
          if (!currentValue) {
            return;
          }
          pattern.regex.lastIndex = 0;
          const replaced = currentValue.replace(
            pattern.regex,
            pattern.replacement
          );
          if (replaced !== currentValue) {
            ensureOriginal(element, "__textcontent", () => currentValue);
            element.textContent = replaced;
            touchedAttributeElements.add(element);
          }
        });
      }
    });
  };

  /**
   * 为 CSS 属性值添加 !important（如果还没有的话）
   * 处理格式: "property: value;" => "property: value !important;"
   * 注意：需要正确处理含有冒号的值，如 url(data:image/...) 或 content: ":"
   */
  const addImportantToCSS = (cssText) => {
    // 匹配 CSS 规则块: selector { properties }
    return cssText.replace(/\{([^}]*)\}/g, (match, innerBlock) => {
      // 分割属性声明，但要处理可能包含分号的值（如 url 中的 data URI）
      const declarations = [];
      let current = '';
      let parenDepth = 0;
      let inString = false;
      let stringChar = '';

      for (let i = 0; i < innerBlock.length; i++) {
        const char = innerBlock[i];

        // 处理字符串
        if ((char === '"' || char === "'") && innerBlock[i - 1] !== '\\') {
          if (!inString) {
            inString = true;
            stringChar = char;
          } else if (char === stringChar) {
            inString = false;
          }
        }

        // 处理括号深度
        if (!inString) {
          if (char === '(') parenDepth++;
          if (char === ')') parenDepth--;
        }

        // 只有在不在字符串和括号内时，分号才是声明分隔符
        if (char === ';' && !inString && parenDepth === 0) {
          if (current.trim()) {
            declarations.push(current.trim());
          }
          current = '';
        } else {
          current += char;
        }
      }

      // 处理最后一个声明（可能没有分号结尾）
      if (current.trim()) {
        declarations.push(current.trim());
      }

      // 为每个声明添加 !important
      const processedDeclarations = declarations.map(decl => {
        // 找到第一个冒号作为属性名和值的分隔
        const colonIndex = decl.indexOf(':');
        if (colonIndex === -1) return decl;

        const property = decl.slice(0, colonIndex).trim();
        const value = decl.slice(colonIndex + 1).trim();

        // 如果已经有 !important，保持原样
        if (value.toLowerCase().endsWith('!important')) {
          return `${property}: ${value}`;
        }

        return `${property}: ${value} !important`;
      });

      return `{ ${processedDeclarations.join('; ')}${processedDeclarations.length ? ';' : ''} }`;
    });
  };

  const applyStyleReplacements = () => {
    // 确保有可用的容器元素（head 或 documentElement）
    const container = document.head || document.documentElement;
    if (!container) {
      return;
    }

    // 移除之前应用的样式
    const existingStyles = container.querySelector('style[data-content-customizer-styles]');
    if (existingStyles) {
      existingStyles.remove();
    }

    // 如果没有样式规则，则直接返回
    if (!state.cssRules.length) {
      return;
    }

    // 创建新的样式元素
    const styleElement = document.createElement('style');
    styleElement.setAttribute('data-content-customizer-styles', '');

    let cssText = '';
    state.cssRules.forEach(rule => {
      // 为每个规则添加 !important 以确保覆盖原有样式
      cssText += `\n${addImportantToCSS(rule)}\n`;
    });

    styleElement.textContent = cssText;
    container.appendChild(styleElement);
  };

  const applyAll = () => {
    if (!document.body) {
      return;
    }
    restoreTextNodes();
    restoreImages();
    restoreAttributeValues();

    if (!state.activeRules.length) {
      removeBodyHider();
      return;
    }

    applyTextReplacements(document.body);
    applyImageReplacements(document.body);
    applyAttributeReplacements(document.body);
    applyStyleReplacements(); // 应用样式替换
    removeBodyHider();
  };

  const scheduleApply = () => {
    if (state.applyTimer) {
      return;
    }
    state.applyTimer = window.setTimeout(() => {
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
    if (!state.activeRules.length) {
      removeBodyHider();
      ensureObserver();
      return;
    }
    if (state.shouldHide) {
      applyBodyHider();
    } else {
      removeBodyHider();
    }
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
