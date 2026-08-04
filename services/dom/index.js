/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/dom/index.js
 *
 * Purpose:
 * Provides centralized, safe DOM discovery and element-waiting
 * capabilities for TACTIC services, repositories, and modules.
 *
 * Responsibilities:
 * - Locate one or more DOM elements
 * - Check whether matching elements exist
 * - Wait for an element to appear
 * - Wait for an element to disappear
 * - Validate selectors and DOM roots
 * - Track DOM-service activity and diagnostics
 *
 * Does NOT:
 * - Contain Torn-specific selectors
 * - Perform feature business logic
 * - Submit forms or click controls
 * - Create persistent MutationObservers
 *
 * Public API:
 * - find()
 * - findAll()
 * - exists()
 * - waitFor()
 * - waitForRemoval()
 * - inspect()
 *
 * Dependencies:
 * - core/constants.js
 * - core/events.js
 * - core/logger.js
 * - core/errors.js
 * - core/health.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC DOM] Namespace is unavailable."
        );

        return;
    }

    const {
        services,
        constants,
    } = TACTIC;

    const {
        events,
        logger,
        errors,
        health,
    } = services;

    const {
        EVENTS,
        ERROR_CODES,
        SEVERITY,
        HEALTH_STATES,
    } = constants;

    const SERVICE_NAME =
        "service:dom";

    const DEFAULT_TIMEOUT_MS =
        10_000;

    const DEFAULT_POLL_INTERVAL_MS =
        100;

    const metrics = {
        startedAt:
            Date.now(),

        findCalls:
            0,

        findAllCalls:
            0,

        existsCalls:
            0,

        waitForCalls:
            0,

        waitForRemovalCalls:
            0,

        successfulWaits:
            0,

        timedOutWaits:
            0,

        invalidSelectors:
            0,

        lastSelector:
            null,

        lastOperation:
            null,

        lastActivityAt:
            Date.now(),
    };

    function recordActivity(
        operation,
        selector = null
    ) {
        metrics.lastOperation =
            operation;

        metrics.lastSelector =
            selector;

        metrics.lastActivityAt =
            Date.now();

        health?.heartbeat(
            SERVICE_NAME,
            {
                metadata: {
                    lastOperation:
                        operation,

                    lastSelector:
                        selector,
                },
            }
        );
    }

    function validateSelector(
        selector
    ) {
        if (
            typeof selector !==
                "string" ||
            !selector.trim()
        ) {
            metrics.invalidSelectors +=
                1;

            throw new TypeError(
                "DOM selector must be a non-empty string."
            );
        }

        const normalized =
            selector.trim();

        try {
            document.createDocumentFragment()
                .querySelector(
                    normalized
                );
        } catch (error) {
            metrics.invalidSelectors +=
                1;

            errors?.report({
                code:
                    ERROR_CODES.DOM
                        .PARSE_FAILED,

                severity:
                    SEVERITY.ERROR,

                service:
                    "dom",

                message:
                    `Invalid DOM selector: ${normalized}`,

                details: {
                    selector:
                        normalized,
                },

                error,

                recoverable:
                    true,

                recovery:
                    "Correct the CSS selector and retry the operation.",
            });

            throw error;
        }

        return normalized;
    }

    function validateRoot(
        root
    ) {
        if (
            root === document ||
            root instanceof Element ||
            root instanceof DocumentFragment ||
            root instanceof ShadowRoot
        ) {
            return root;
        }

        throw new TypeError(
            "DOM root must be document, an Element, a DocumentFragment, or a ShadowRoot."
        );
    }

    function normalizeOptions(
        options = {}
    ) {
        return {
            root:
                validateRoot(
                    options.root ||
                        document
                ),

            timeoutMs:
                Number.isFinite(
                    options.timeoutMs
                ) &&
                options.timeoutMs >= 0
                    ? Math.floor(
                          options.timeoutMs
                      )
                    : DEFAULT_TIMEOUT_MS,

            pollIntervalMs:
                Number.isFinite(
                    options.pollIntervalMs
                ) &&
                options.pollIntervalMs >
                    0
                    ? Math.floor(
                          options.pollIntervalMs
                      )
                    : DEFAULT_POLL_INTERVAL_MS,

            visible:
                options.visible ===
                true,

            rejectOnTimeout:
                options.rejectOnTimeout !==
                false,
        };
    }

    function isVisible(
        element
    ) {
        if (
            !(element instanceof Element)
        ) {
            return false;
        }

        const style =
            getComputedStyle(
                element
            );

        const rect =
            element.getBoundingClientRect();

        return (
            style.display !==
                "none" &&
            style.visibility !==
                "hidden" &&
            Number(style.opacity) !==
                0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    function find(
        selector,
        options = {}
    ) {
        const normalizedSelector =
            validateSelector(
                selector
            );

        const {
            root,
            visible,
        } = normalizeOptions(
            options
        );

        metrics.findCalls +=
            1;

        recordActivity(
            "find",
            normalizedSelector
        );

        const element =
            root.querySelector(
                normalizedSelector
            );

        if (
            visible &&
            element &&
            !isVisible(element)
        ) {
            return null;
        }

        return element;
    }

    function findAll(
        selector,
        options = {}
    ) {
        const normalizedSelector =
            validateSelector(
                selector
            );

        const {
            root,
            visible,
        } = normalizeOptions(
            options
        );

        metrics.findAllCalls +=
            1;

        recordActivity(
            "findAll",
            normalizedSelector
        );

        const elements = [
            ...root.querySelectorAll(
                normalizedSelector
            ),
        ];

        if (!visible) {
            return elements;
        }

        return elements.filter(
            isVisible
        );
    }

    function exists(
        selector,
        options = {}
    ) {
        metrics.existsCalls +=
            1;

        recordActivity(
            "exists",
            String(selector)
        );

        return (
            find(
                selector,
                options
            ) !== null
        );
    }

    function createTimeoutError(
        selector,
        timeoutMs,
        operation
    ) {
        return new Error(
            `DOM ${operation} timed out after ${timeoutMs} ms for selector "${selector}".`
        );
    }

    function waitFor(
        selector,
        options = {}
    ) {
        const normalizedSelector =
            validateSelector(
                selector
            );

        const normalizedOptions =
            normalizeOptions(
                options
            );

        const {
            root,
            timeoutMs,
            pollIntervalMs,
            visible,
            rejectOnTimeout,
        } = normalizedOptions;

        metrics.waitForCalls +=
            1;

        recordActivity(
            "waitFor",
            normalizedSelector
        );

        return new Promise(
            (
                resolve,
                reject
            ) => {
                const startedAt =
                    Date.now();

                let timerHandle =
                    null;

                function finish(
                    value,
                    error = null
                ) {
                    if (
                        timerHandle !==
                        null
                    ) {
                        clearTimeout(
                            timerHandle
                        );

                        timerHandle =
                            null;
                    }

                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(value);
                }

                function check() {
                    let element =
                        null;

                    try {
                        element =
                            root.querySelector(
                                normalizedSelector
                            );
                    } catch (error) {
                        finish(
                            null,
                            error
                        );

                        return;
                    }

                    if (
                        element &&
                        (!visible ||
                            isVisible(
                                element
                            ))
                    ) {
                        metrics.successfulWaits +=
                            1;

                        recordActivity(
                            "waitFor:resolved",
                            normalizedSelector
                        );

                        finish(
                            element
                        );

                        return;
                    }

                    const elapsed =
                        Date.now() -
                        startedAt;

                    if (
                        elapsed >=
                        timeoutMs
                    ) {
                        metrics.timedOutWaits +=
                            1;

                        const timeoutError =
                            createTimeoutError(
                                normalizedSelector,
                                timeoutMs,
                                "waitFor"
                            );

                        errors?.report({
                            code:
                                ERROR_CODES.DOM
                                    .TIMEOUT,

                            severity:
                                SEVERITY.WARNING,

                            service:
                                "dom",

                            message:
                                timeoutError.message,

                            details: {
                                selector:
                                    normalizedSelector,

                                timeoutMs,

                                visible,
                            },

                            error:
                                timeoutError,

                            recoverable:
                                true,

                            retryable:
                                true,

                            recovery:
                                "Retry after the page or interface finishes loading.",
                        });

                        events?.emit(
                            EVENTS.DOM
                                .SELECTOR_MISSING,
                            {
                                selector:
                                    normalizedSelector,

                                timeoutMs,

                                visible,
                            }
                        );

                        if (
                            rejectOnTimeout
                        ) {
                            finish(
                                null,
                                timeoutError
                            );
                        } else {
                            finish(
                                null
                            );
                        }

                        return;
                    }

                    timerHandle =
                        setTimeout(
                            check,
                            pollIntervalMs
                        );
                }

                check();
            }
        );
    }

    function waitForRemoval(
        selector,
        options = {}
    ) {
        const normalizedSelector =
            validateSelector(
                selector
            );

        const normalizedOptions =
            normalizeOptions(
                options
            );

        const {
            root,
            timeoutMs,
            pollIntervalMs,
            rejectOnTimeout,
        } = normalizedOptions;

        metrics.waitForRemovalCalls +=
            1;

        recordActivity(
            "waitForRemoval",
            normalizedSelector
        );

        return new Promise(
            (
                resolve,
                reject
            ) => {
                const startedAt =
                    Date.now();

                let timerHandle =
                    null;

                function finish(
                    value,
                    error = null
                ) {
                    if (
                        timerHandle !==
                        null
                    ) {
                        clearTimeout(
                            timerHandle
                        );

                        timerHandle =
                            null;
                    }

                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(value);
                }

                function check() {
                    const element =
                        root.querySelector(
                            normalizedSelector
                        );

                    if (!element) {
                        metrics.successfulWaits +=
                            1;

                        recordActivity(
                            "waitForRemoval:resolved",
                            normalizedSelector
                        );

                        finish(
                            true
                        );

                        return;
                    }

                    const elapsed =
                        Date.now() -
                        startedAt;

                    if (
                        elapsed >=
                        timeoutMs
                    ) {
                        metrics.timedOutWaits +=
                            1;

                        const timeoutError =
                            createTimeoutError(
                                normalizedSelector,
                                timeoutMs,
                                "waitForRemoval"
                            );

                        errors?.report({
                            code:
                                ERROR_CODES.DOM
                                    .TIMEOUT,

                            severity:
                                SEVERITY.WARNING,

                            service:
                                "dom",

                            message:
                                timeoutError.message,

                            details: {
                                selector:
                                    normalizedSelector,

                                timeoutMs,
                            },

                            error:
                                timeoutError,

                            recoverable:
                                true,

                            retryable:
                                true,

                            recovery:
                                "Retry after the interface changes.",
                        });

                        if (
                            rejectOnTimeout
                        ) {
                            finish(
                                false,
                                timeoutError
                            );
                        } else {
                            finish(
                                false
                            );
                        }

                        return;
                    }

                    timerHandle =
                        setTimeout(
                            check,
                            pollIntervalMs
                        );
                }

                check();
            }
        );
    }

    function inspect() {
        return {
            service:
                "dom",

            startedAt:
                metrics.startedAt,

            uptimeMs:
                Date.now() -
                metrics.startedAt,

            documentReadyState:
                document.readyState,

            bodyAvailable:
                Boolean(
                    document.body
                ),

            activeElement:
                document.activeElement
                    ?.tagName ||
                null,

            metrics: {
                ...metrics,
            },

            defaults: {
                timeoutMs:
                    DEFAULT_TIMEOUT_MS,

                pollIntervalMs:
                    DEFAULT_POLL_INTERVAL_MS,
            },
        };
    }

    TACTIC.services.dom = {
        find,
        findAll,
        exists,
        waitFor,
        waitForRemoval,
        inspect,
        isVisible,
    };

    health?.register({
        name:
            SERVICE_NAME,

        type:
            health.types.SERVICE,

        status:
            HEALTH_STATES.HEALTHY,

        staleAfterMs:
            300_000,

        metadata: {
            serviceName:
                "dom",

            phase:
                "discovery",
        },
    });

    events?.emit(
        EVENTS.DOM.READY,
        {
            service:
                "dom",
        }
    );

    logger?.info(
        "DOM service loaded"
    );
})();