// ==UserScript==
// @name         Assistive Instant Claim Clicker v4.0
// @namespace    assistive.clicker.v40
// @version      4.0
// @description  Accessible userscript for assisting with claim/reward button interactions
// @author       Community
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Assistive-Clicker v4.0] Initializing...');

    // ============================================
    // CONFIG
    // ============================================
    const CONFIG = {
        MODE: 'hybrid', // 'auto' | 'manual' | 'hybrid'
        AUTO_CLICK_DELAY: 500, // ms (safe delay)
        DETECTION_INTERVAL: 500, // ms
        DOUBLE_CLICK_ENABLED: false, // disabled by default for safety
        DOUBLE_CLICK_INTERVAL: 100, // ms between clicks
        MAX_CLICKS_PER_ELEMENT: 1,
        ENABLE_LOGGING: true,
        ENABLE_TOOLBAR: true,
        KEYBOARD_SHORTCUTS: true,
        MAX_RETRIES: 3 // max retry attempts per element
    };

    // ============================================
    // DETECTION PATTERNS
    // ============================================
    const PATTERNS = {
        text: /^(claim|collect|redeem|get reward|get bonus|grab|take|accept|submit|complete|finish|earn|win|get|grab reward|grab bonus|instant claim)$/i,
        selectors: [
            'button[type="button"]',
            'button[type="submit"]',
            'button:not([type="reset"])',
            'a[role="button"]',
            '[role="button"]',
            'input[type="button"]',
            'input[type="submit"]',
            '[onclick]'
        ],
        excludePatterns: /cancel|close|skip|no|dismiss|decline|back|previous/i,
        minTextLength: 2,
        maxTextLength: 50
    };

    // ============================================
    // ERROR HANDLER
    // ============================================
    const ErrorHandler = {
        log: (message, error = null) => {
            if (!CONFIG.ENABLE_LOGGING) return;
            const timestamp = new Date().toLocaleTimeString();
            if (error) {
                console.error(`[v4.0] ${timestamp} - ${message}`, error);
            } else {
                console.log(`[v4.0] ${timestamp} - ${message}`);
            }
        },
        
        handle: (context, error) => {
            ErrorHandler.log(`Error in ${context}`, error);
            return null;
        }
    };

    // ============================================
    // STATE
    // ============================================
    const state = {
        isRunning: true,
        mode: CONFIG.MODE,
        clickedElements: new WeakMap(), // Map to track retry count
        clickHistory: [],
        foundElements: [],
        currentIndex: 0,
        stats: {
            totalClicks: 0,
            totalRetries: 0,
            elementsFound: 0,
            lastClickTime: null,
            lastError: null
        }
    };

    // ============================================
    // ELEMENT DETECTION
    // ============================================
    function isVisible(el) {
        try {
            if (!el || typeof el.getBoundingClientRect !== 'function') {
                return false;
            }

            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            
            const isInViewport = rect.width > 0 && rect.height > 0;
            const isDisplayed = style.display !== 'none';
            const isVisible = style.visibility !== 'hidden';
            const hasOpacity = parseFloat(style.opacity) > 0;
            const isNotDisabled = !el.hasAttribute('disabled');

            return isInViewport && isDisplayed && isVisible && hasOpacity && isNotDisabled;
        } catch (e) {
            ErrorHandler.log('isVisible check failed', e);
            return false;
        }
    }

    function getElementText(el) {
        try {
            if (!el) return '';
            
            const texts = [
                el.innerText,
                el.textContent,
                el.value,
                el.getAttribute('aria-label'),
                el.getAttribute('title'),
                el.getAttribute('data-text')
            ];
            
            const text = texts.find(t => typeof t === 'string' && t.trim().length > 0);
            return (text || '').trim().substring(0, PATTERNS.maxTextLength);
        } catch (e) {
            ErrorHandler.log('getElementText failed', e);
            return '';
        }
    }

    function validateElement(el) {
        try {
            if (!el) return false;
            if (typeof el.click !== 'function') return false;
            if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return false;
            return true;
        } catch (e) {
            return false;
        }
    }

    function matchesPattern(el) {
        try {
            const text = getElementText(el);
            
            // Validate text length
            if (text.length < PATTERNS.minTextLength) return false;
            
            // Exclude negatively matched patterns
            if (PATTERNS.excludePatterns.test(text)) return false;
            
            // Text match
            if (PATTERNS.text.test(text)) return true;
            
            // Selector match
            for (const selector of PATTERNS.selectors) {
                try {
                    if (el.matches(selector)) {
                        // Secondary text validation for generic selectors
                        if (text.length > 0 && !text.match(/^\d+$/)) {
                            return true;
                        }
                    }
                } catch (e) {
                    // Invalid selector, continue
                }
            }
            
            return false;
        } catch (e) {
            ErrorHandler.log('matchesPattern failed', e);
            return false;
        }
    }

    function findClaimElements() {
        try {
            const candidates = document.querySelectorAll(
                'button, a[role="button"], [role="button"], input[type="button"], input[type="submit"], [onclick]'
            );
            
            const matches = [];
            
            candidates.forEach(el => {
                try {
                    if (validateElement(el) && isVisible(el) && matchesPattern(el) && !state.clickedElements.has(el)) {
                        matches.push(el);
                    }
                } catch (e) {
                    // Skip problematic elements
                }
            });
            
            return matches;
        } catch (e) {
            return ErrorHandler.handle('findClaimElements', e) || [];
        }
    }

    // ============================================
    // INSTANT CLICKING
    // ============================================
    function performInstantClick(element, retryCount = 0) {
        try {
            if (!validateElement(element)) {
                throw new Error('Element validation failed');
            }

            if (!isVisible(element)) {
                throw new Error('Element not visible');
            }

            // Focus and click
            try {
                element.focus({ preventScroll: false });
            } catch (e) {
                ErrorHandler.log('Focus attempt failed', e);
            }

            element.click();

            // Double-click if enabled
            if (CONFIG.DOUBLE_CLICK_ENABLED && CONFIG.MAX_CLICKS_PER_ELEMENT >= 2) {
                setTimeout(() => {
                    try {
                        if (validateElement(element) && isVisible(element)) {
                            element.click();
                        }
                    } catch (e) {
                        ErrorHandler.log('Secondary click failed', e);
                    }
                }, CONFIG.DOUBLE_CLICK_INTERVAL);
            }

            // Track click
            state.clickedElements.set(element, retryCount + 1);
            state.stats.totalClicks++;
            state.stats.lastClickTime = new Date().toLocaleTimeString();

            const text = getElementText(element);
            ErrorHandler.log(`✓ Clicked: "${text}"`);

            state.clickHistory.push({
                text: text,
                time: new Date(),
                success: true,
                retries: retryCount
            });

            return true;
        } catch (error) {
            ErrorHandler.log(`Click failed (attempt ${retryCount + 1}/${CONFIG.MAX_RETRIES})`, error);
            state.stats.lastError = error.message;

            // Retry logic
            if (retryCount < CONFIG.MAX_RETRIES - 1) {
                state.stats.totalRetries++;
                setTimeout(() => {
                    performInstantClick(element, retryCount + 1);
                }, CONFIG.AUTO_CLICK_DELAY);
                return false;
            }

            state.clickHistory.push({
                text: getElementText(element),
                time: new Date(),
                success: false,
                error: error.message,
                retries: retryCount
            });

            return false;
        }
    }

    // ============================================
    // AUTO MODE
    // ============================================
    function autoClickMode() {
        try {
            const elements = findClaimElements();
            let clickCount = 0;

            elements.forEach(el => {
                if (performInstantClick(el)) {
                    clickCount++;
                }
            });

            return clickCount;
        } catch (e) {
            return ErrorHandler.handle('autoClickMode', e) || 0;
        }
    }

    // ============================================
    // TOOLBAR (Manual/Hybrid Mode)
    // ============================================
    function createToolbar() {
        try {
            // Remove existing toolbar if present
            const existing = document.querySelector('#assistive-clicker-toolbar');
            if (existing) {
                existing.remove();
            }

            const toolbar = document.createElement('div');
            toolbar.id = 'assistive-clicker-toolbar';
            toolbar.setAttribute('role', 'toolbar');
            toolbar.setAttribute('aria-label', 'Assistive Claim Clicker');

            Object.assign(toolbar.style, {
                position: 'fixed',
                right: '12px',
                bottom: '12px',
                zIndex: '2147483647',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                padding: '12px',
                borderRadius: '10px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontSize: '12px',
                boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.2)',
                maxWidth: '200px'
            });

            toolbar.innerHTML = `
                <div style="display: flex; gap: 6px; margin-bottom: 8px; align-items: center; flex-wrap: wrap;">
                    <button id="ic-prev" title="Previous (Alt+P)" aria-label="Previous element" style="flex: 1; min-width: 45px; padding: 6px 8px; background: rgba(255,255,255,0.2); border: none; color: white; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 11px; transition: 0.2s;">◀ Prev</button>
                    <button id="ic-next" title="Next (Alt+N)" aria-label="Next element" style="flex: 1; min-width: 45px; padding: 6px 8px; background: rgba(255,255,255,0.2); border: none; color: white; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 11px; transition: 0.2s;">Next ▶</button>
                    <button id="ic-click" title="Click current (Alt+C)" aria-label="Click current element" style="flex: 1; min-width: 45px; padding: 6px 8px; background: #10b981; border: none; color: white; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 11px; transition: 0.2s;">CLICK</button>
                </div>
                <div style="display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap;">
                    <button id="ic-auto" title="Auto-click all (Alt+A)" aria-label="Auto-click all" style="flex: 1; min-width: 45px; padding: 6px 8px; background: rgba(255,255,255,0.2); border: none; color: white; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 11px; transition: 0.2s;">Auto</button>
                    <button id="ic-scan" title="Rescan elements (Alt+S)" aria-label="Rescan elements" style="flex: 1; min-width: 45px; padding: 6px 8px; background: rgba(255,255,255,0.2); border: none; color: white; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 11px; transition: 0.2s;">Scan</button>
                    <button id="ic-reset" title="Reset state" aria-label="Reset state" style="flex: 1; min-width: 45px; padding: 6px 8px; background: rgba(255,255,255,0.2); border: none; color: white; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 11px; transition: 0.2s;">Reset</button>
                </div>
                <div id="ic-status" style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 5px; font-size: 11px; line-height: 1.4;">
                    <div>Found: <span id="ic-count" aria-live="polite">0</span></div>
                    <div>Clicked: <span id="ic-clicked" aria-live="polite">0</span></div>
                    <div>Last: <span id="ic-last" style="color: #a5f3fc;" aria-live="polite">—</span></div>
                    <div id="ic-error" style="color: #fca5a5; display: none; margin-top: 4px; font-size: 10px;"></div>
                </div>
            `;

            document.body.appendChild(toolbar);

            // Event Listeners
            const buttons = {
                '#ic-next': () => navigateButtons(1),
                '#ic-prev': () => navigateButtons(-1),
                '#ic-click': () => clickCurrentButton(),
                '#ic-auto': () => autoClickAll(),
                '#ic-scan': () => rescan(),
                '#ic-reset': () => resetState()
            };

            Object.entries(buttons).forEach(([selector, handler]) => {
                const btn = toolbar.querySelector(selector);
                if (btn) {
                    btn.addEventListener('click', handler);
                    btn.addEventListener('mouseover', () => {
                        btn.style.background = 'rgba(255,255,255,0.3)';
                    });
                    btn.addEventListener('mouseout', () => {
                        btn.style.background = btn.id === 'ic-click' ? '#10b981' : 'rgba(255,255,255,0.2)';
                    });
                }
            });

            ErrorHandler.log('Toolbar created successfully');
            return toolbar;
        } catch (e) {
            return ErrorHandler.handle('createToolbar', e);
        }
    }

    function navigateButtons(direction) {
        try {
            if (state.foundElements.length === 0) {
                ErrorHandler.log('No elements to navigate');
                return;
            }
            
            state.currentIndex = (state.currentIndex + direction + state.foundElements.length) % state.foundElements.length;
            updateToolbarHighlight();
            
            const currentEl = state.foundElements[state.currentIndex];
            if (currentEl && typeof currentEl.scrollIntoView === 'function') {
                currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } catch (e) {
            ErrorHandler.log('Navigate failed', e);
        }
    }

    function clickCurrentButton() {
        try {
            if (state.foundElements.length === 0) {
                ErrorHandler.log('No elements to click');
                return;
            }
            performInstantClick(state.foundElements[state.currentIndex]);
            updateToolbar();
        } catch (e) {
            ErrorHandler.log('clickCurrentButton failed', e);
        }
    }

    function autoClickAll() {
        try {
            const count = autoClickMode();
            ErrorHandler.log(`Auto-clicked ${count} elements`);
            updateToolbar();
        } catch (e) {
            ErrorHandler.log('autoClickAll failed', e);
        }
    }

    function rescan() {
        try {
            state.foundElements = findClaimElements();
            state.currentIndex = 0;
            updateToolbar();
            updateToolbarHighlight();
            ErrorHandler.log(`Rescanned: found ${state.foundElements.length} elements`);
        } catch (e) {
            ErrorHandler.log('rescan failed', e);
        }
    }

    function resetState() {
        try {
            state.clickedElements = new WeakMap();
            state.clickHistory = [];
            state.stats.totalClicks = 0;
            state.stats.totalRetries = 0;
            rescan();
            ErrorHandler.log('State reset');
        } catch (e) {
            ErrorHandler.log('resetState failed', e);
        }
    }

    function updateToolbarHighlight() {
        try {
            state.foundElements.forEach((el, idx) => {
                if (!el || typeof el.style === 'undefined') return;
                
                if (idx === state.currentIndex) {
                    el.style.outline = '4px solid #10b981';
                    el.style.boxShadow = '0 0 12px rgba(16,185,129,0.6)';
                } else {
                    el.style.outline = '2px solid #667eea';
                    el.style.boxShadow = '0 0 6px rgba(102,126,234,0.4)';
                }
            });
        } catch (e) {
            ErrorHandler.log('updateToolbarHighlight failed', e);
        }
    }

    function updateToolbar() {
        try {
            const toolbar = document.querySelector('#assistive-clicker-toolbar');
            if (!toolbar) return;

            const countEl = toolbar.querySelector('#ic-count');
            const clickedEl = toolbar.querySelector('#ic-clicked');
            const lastEl = toolbar.querySelector('#ic-last');
            const errorEl = toolbar.querySelector('#ic-error');

            if (countEl) countEl.textContent = state.foundElements.length;
            if (clickedEl) clickedEl.textContent = state.stats.totalClicks;
            if (lastEl) lastEl.textContent = state.stats.lastClickTime || '—';
            
            if (state.stats.lastError && errorEl) {
                errorEl.textContent = `Error: ${state.stats.lastError}`;
                errorEl.style.display = 'block';
                setTimeout(() => {
                    errorEl.style.display = 'none';
                }, 5000);
            }
        } catch (e) {
            ErrorHandler.log('updateToolbar failed', e);
        }
    }

    // ============================================
    // MAIN LOOP
    // ============================================
    let scanInterval;

    function startMonitoring() {
        try {
            if (CONFIG.ENABLE_TOOLBAR) {
                createToolbar();
                rescan();
            }

            scanInterval = setInterval(() => {
                try {
                    if (state.mode === 'auto') {
                        autoClickMode();
                    } else if (state.mode === 'hybrid') {
                        state.foundElements = findClaimElements();
                        updateToolbar();
                        updateToolbarHighlight();
                    }
                } catch (e) {
                    ErrorHandler.log('Monitoring loop error', e);
                }
            }, CONFIG.DETECTION_INTERVAL);

            if (CONFIG.KEYBOARD_SHORTCUTS) {
                window.addEventListener('keydown', (e) => {
                    try {
                        if (e.altKey) {
                            if (e.key === 'n' || e.key === 'N') navigateButtons(1);
                            if (e.key === 'p' || e.key === 'P') navigateButtons(-1);
                            if (e.key === 'c' || e.key === 'C') clickCurrentButton();
                            if (e.key === 'a' || e.key === 'A') autoClickAll();
                            if (e.key === 's' || e.key === 'S') rescan();
                        }
                    } catch (e) {
                        ErrorHandler.log('Keyboard shortcut error', e);
                    }
                });
            }

            ErrorHandler.log('✓ Monitoring started | Mode: ' + state.mode);
        } catch (e) {
            ErrorHandler.log('startMonitoring failed', e);
        }
    }

    function stopMonitoring() {
        try {
            if (scanInterval) clearInterval(scanInterval);
            ErrorHandler.log('Monitoring stopped');
        } catch (e) {
            ErrorHandler.log('stopMonitoring failed', e);
        }
    }

    // ============================================
    // INITIALIZATION
    // ============================================
    try {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startMonitoring);
        } else {
            startMonitoring();
        }

        window.addEventListener('beforeunload', stopMonitoring);
    } catch (e) {
        ErrorHandler.log('Initialization failed', e);
    }

    // ============================================
    // PUBLIC API
    // ============================================
    window.AssistiveClicker = {
        version: '4.0',
        setMode: (mode) => {
            if (['auto', 'manual', 'hybrid'].includes(mode)) {
                state.mode = mode;
                ErrorHandler.log(`Mode changed to: ${mode}`);
            } else {
                ErrorHandler.log(`Invalid mode: ${mode}`);
            }
        },
        toggleAuto: () => {
            state.isRunning = !state.isRunning;
            ErrorHandler.log(`Auto: ${state.isRunning}`);
        },
        getStats: () => ({ ...state.stats }),
        getHistory: () => [...state.clickHistory],
        rescan: rescan,
        autoClickAll: autoClickAll,
        resetState: resetState,
        setConfig: (key, value) => {
            if (key in CONFIG) {
                CONFIG[key] = value;
                ErrorHandler.log(`Config updated: ${key} = ${value}`);
            }
        }
    };

    ErrorHandler.log('✓ Loaded v4.0 | Mode: ' + state.mode + ' | Toolbar: ' + CONFIG.ENABLE_TOOLBAR);

})();
