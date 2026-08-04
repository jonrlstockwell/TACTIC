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
 * Provides centralized DOM discovery, waiting, observation,
 * value watching, and observer lifecycle management.
 *
 * Responsibilities:
 * - Locate one or more DOM elements
 * - Check whether matching elements exist
 * - Wait for elements to appear or disappear
 * - Create named MutationObservers
 * - Watch text, attributes, and parsed values
 * - Disconnect individual or grouped observers
 * - Track DOM-service metrics and observer diagnostics
 *
 * Does NOT:
 * - Contain Torn-specific selectors
 * - Perform feature business logic
 * - Submit forms or click controls
 * - Decide what observed values mean
 *
 * Public API:
 * - find()
 * - findAll()
 * - exists()
 * - waitFor()
 * - waitForRemoval()
 * - observe()
 * - disconnect()
 * - disconnectGroup()
 * - disconnectAll()
 * - watchText()
 * - watchAttribute()
 * - watchValue()
 * - hasObserver()
 * - inspectObservers()
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

    const DEFAULT_OBSERVER_GROUP =
        "default";

    const observers =
        new Map();

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

        observersCreated:
            0,

        observersDisconnected:
            0,

        observerCallbacks:
            0,

        observerErrors:
            0,

        textWatchersCreated:
            0,

        attributeWatchersCreated:
            0,

        valueWatchersCreated:
            0,

        valueChangesDetected:
            0,

        lastSelector:
            null,

        lastOperation:
            null,

        lastActivityAt:
            Date.now(),

        lastMutationAt:
            null,
    };

    function recordActivity(
        operation,
        selector = null,
        metadata = {}
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

                    activeObserverCount:
                        observers.size,

                    ...metadata,
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
            document
                .createDocumentFragment()
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
            (
                typeof ShadowRoot !==
                    "undefined" &&
                root instanceof ShadowRoot
            )
        ) {
            return root;
        }

        throw new TypeError(
            "DOM root must be document, an Element, a DocumentFragment, or a ShadowRoot."
        );
    }

    function validateObserverName(
        name
    ) {
        if (
            typeof name !==
                "string" ||
            !name.trim()
        ) {
            throw new TypeError(
                "DOM observer name must be a non-empty string."
            );
        }

        return name.trim();
    }

    function validateCallback(
        callback
    ) {
        if (
            typeof callback !==
            "function"
        ) {
            throw new TypeError(
                "DOM observer callback must be a function."
            );
        }

        return callback;
    }

    function normalizeGroup(
        group
    ) {
        if (
            typeof group ===
                "string" &&
            group.trim()
        ) {
            return group.trim();
        }

        return DEFAULT_OBSERVER_GROUP;
    }

    function normalizeDiscoveryOptions(
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

    function normalizeObserverOptions(
        options = {}
    ) {
        const mutationOptions = {
            childList:
                options.childList !==
                false,

            subtree:
                options.subtree !==
                false,

            attributes:
                options.attributes ===
                true,

            characterData:
                options.characterData ===
                true,
        };

        if (
            Array.isArray(
                options.attributeFilter
            ) &&
            options.attributeFilter
                .length > 0
        ) {
            mutationOptions.attributes =
                true;

            mutationOptions.attributeFilter =
                options.attributeFilter.map(
                    String
                );
        }

        if (
            options.attributeOldValue ===
            true
        ) {
            mutationOptions.attributes =
                true;

            mutationOptions.attributeOldValue =
                true;
        }

        if (
            options.characterDataOldValue ===
            true
        ) {
            mutationOptions.characterData =
                true;

            mutationOptions.characterDataOldValue =
                true;
        }

        return {
            group:
                normalizeGroup(
                    options.group
                ),

            replaceExisting:
                options.replaceExisting !==
                false,

            emitMutationEvent:
                options.emitMutationEvent !==
                false,

            metadata:
                options.metadata &&
                typeof options.metadata ===
                    "object" &&
                !Array.isArray(
                    options.metadata
                )
                    ? {
                          ...options.metadata,
                      }
                    : {},

            mutationOptions,
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
        } = normalizeDiscoveryOptions(
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
        } = normalizeDiscoveryOptions(
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

    function reportTimeout({
        selector,
        timeoutMs,
        operation,
        visible = false,
    }) {
        metrics.timedOutWaits +=
            1;

        const timeoutError =
            createTimeoutError(
                selector,
                timeoutMs,
                operation
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
                selector,
                timeoutMs,
                visible,
                operation,
            },

            error:
                timeoutError,

            recoverable:
                true,

            retryable:
                true,

            recovery:
                "Retry after the page or interface changes.",
        });

        return timeoutError;
    }

    function waitFor(
        selector,
        options = {}
    ) {
        const normalizedSelector =
            validateSelector(
                selector
            );

        const {
            root,
            timeoutMs,
            pollIntervalMs,
            visible,
            rejectOnTimeout,
        } = normalizeDiscoveryOptions(
            options
        );

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
                        (
                            !visible ||
                            isVisible(
                                element
                            )
                        )
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
                        const timeoutError =
                            reportTimeout({
                                selector:
                                    normalizedSelector,

                                timeoutMs,

                                operation:
                                    "waitFor",

                                visible,
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

        const {
            root,
            timeoutMs,
            pollIntervalMs,
            rejectOnTimeout,
        } = normalizeDiscoveryOptions(
            options
        );

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
                        const timeoutError =
                            reportTimeout({
                                selector:
                                    normalizedSelector,

                                timeoutMs,

                                operation:
                                    "waitForRemoval",
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

    function createObserverSnapshot(
        record
    ) {
        if (!record) {
            return null;
        }

        return {
            name:
                record.name,

            group:
                record.group,

            target:
                describeTarget(
                    record.target
                ),

            active:
                record.active,

            createdAt:
                record.createdAt,

            lastMutationAt:
                record.lastMutationAt,

            callbackCount:
                record.callbackCount,

            mutationCount:
                record.mutationCount,

            errorCount:
                record.errorCount,

            lastError:
                record.lastError
                    ? {
                          ...record.lastError,
                      }
                    : null,

            mutationOptions: {
                ...record.mutationOptions,

                attributeFilter:
                    record
                        .mutationOptions
                        .attributeFilter
                        ? [
                              ...record
                                  .mutationOptions
                                  .attributeFilter,
                          ]
                        : undefined,
            },

            metadata: {
                ...record.metadata,
            },
        };
    }

    function describeTarget(
        target
    ) {
        if (target === document) {
            return "document";
        }

        if (
            target instanceof Element
        ) {
            const id =
                target.id
                    ? `#${target.id}`
                    : "";

            const classes =
                typeof target.className ===
                    "string" &&
                target.className.trim()
                    ? `.${target.className
                          .trim()
                          .split(/\s+/)
                          .join(".")}`
                    : "";

            return `${target.tagName.toLowerCase()}${id}${classes}`;
        }

        if (
            target instanceof DocumentFragment
        ) {
            return "document-fragment";
        }

        return "unknown";
    }

    function observe(
        name,
        target,
        callback,
        options = {}
    ) {
        const normalizedName =
            validateObserverName(
                name
            );

        const normalizedTarget =
            validateRoot(
                target
            );

        const normalizedCallback =
            validateCallback(
                callback
            );

        const normalizedOptions =
            normalizeObserverOptions(
                options
            );

        if (
            observers.has(
                normalizedName
            )
        ) {
            if (
                !normalizedOptions
                    .replaceExisting
            ) {
                throw new Error(
                    `DOM observer "${normalizedName}" already exists.`
                );
            }

            disconnect(
                normalizedName
            );
        }

        const record = {
            name:
                normalizedName,

            group:
                normalizedOptions.group,

            target:
                normalizedTarget,

            observer:
                null,

            callback:
                normalizedCallback,

            active:
                true,

            createdAt:
                Date.now(),

            lastMutationAt:
                null,

            callbackCount:
                0,

            mutationCount:
                0,

            errorCount:
                0,

            lastError:
                null,

            mutationOptions:
                normalizedOptions
                    .mutationOptions,

            emitMutationEvent:
                normalizedOptions
                    .emitMutationEvent,

            metadata:
                normalizedOptions
                    .metadata,
        };

        const observer =
            new MutationObserver(
                (
                    mutationRecords,
                    mutationObserver
                ) => {
                    if (!record.active) {
                        return;
                    }

                    const now =
                        Date.now();

                    record.lastMutationAt =
                        now;

                    record.callbackCount +=
                        1;

                    record.mutationCount +=
                        mutationRecords.length;

                    metrics.observerCallbacks +=
                        1;

                    metrics.lastMutationAt =
                        now;

                    recordActivity(
                        "observer:mutation",
                        null,
                        {
                            observerName:
                                record.name,

                            mutationCount:
                                mutationRecords
                                    .length,
                        }
                    );

                    try {
                        record.callback({
                            name:
                                record.name,

                            group:
                                record.group,

                            records:
                                mutationRecords,

                            observer:
                                mutationObserver,

                            target:
                                record.target,

                            disconnect:
                                () =>
                                    disconnect(
                                        record.name
                                    ),
                        });
                    } catch (error) {
                        record.errorCount +=
                            1;

                        metrics.observerErrors +=
                            1;

                        record.lastError = {
                            name:
                                error?.name ||
                                "Error",

                            message:
                                error?.message ||
                                String(error),

                            timestamp:
                                Date.now(),
                        };

                        errors?.report({
                            code:
                                ERROR_CODES.DOM
                                    .OBSERVER_FAILED,

                            severity:
                                SEVERITY.ERROR,

                            service:
                                "dom",

                            message:
                                `DOM observer "${record.name}" callback failed.`,

                            details: {
                                observerName:
                                    record.name,

                                observerGroup:
                                    record.group,

                                target:
                                    describeTarget(
                                        record.target
                                    ),

                                mutationCount:
                                    mutationRecords
                                        .length,
                            },

                            error:
                                error instanceof
                                Error
                                    ? error
                                    : new Error(
                                          String(
                                              error
                                          )
                                      ),

                            recoverable:
                                true,

                            retryable:
                                true,

                            recovery:
                                "The observer remains active. Correct the callback and replace the observer if necessary.",
                        });
                    }

                    if (
                        record.emitMutationEvent
                    ) {
                        events?.emit(
                            EVENTS.DOM.MUTATION,
                            {
                                observerName:
                                    record.name,

                                group:
                                    record.group,

                                target:
                                    record.target,

                                records:
                                    mutationRecords,

                                timestamp:
                                    now,
                            }
                        );
                    }
                }
            );

        record.observer =
            observer;

        observer.observe(
            normalizedTarget,
            normalizedOptions
                .mutationOptions
        );

        observers.set(
            normalizedName,
            record
        );

        metrics.observersCreated +=
            1;

        recordActivity(
            "observe",
            null,
            {
                observerName:
                    normalizedName,

                observerGroup:
                    record.group,
            }
        );

        logger?.debug(
            `DOM observer created: ${normalizedName}`,
            {
                group:
                    record.group,

                target:
                    describeTarget(
                        normalizedTarget
                    ),

                mutationOptions:
                    record.mutationOptions,
            }
        );

        return createObserverSnapshot(
            record
        );
    }

    function disconnect(
        name
    ) {
        const normalizedName =
            validateObserverName(
                name
            );

        const record =
            observers.get(
                normalizedName
            );

        if (!record) {
            return false;
        }

        record.active =
            false;

        record.observer.disconnect();

        observers.delete(
            normalizedName
        );

        metrics.observersDisconnected +=
            1;

        recordActivity(
            "disconnect",
            null,
            {
                observerName:
                    normalizedName,
            }
        );

        logger?.debug(
            `DOM observer disconnected: ${normalizedName}`
        );

        return true;
    }

    function disconnectGroup(
        group
    ) {
        const normalizedGroup =
            normalizeGroup(
                group
            );

        const names = [
            ...observers.values(),
        ]
            .filter(
                (record) =>
                    record.group ===
                    normalizedGroup
            )
            .map(
                (record) =>
                    record.name
            );

        for (
            const name of names
        ) {
            disconnect(
                name
            );
        }

        return names.length;
    }

    function disconnectAll() {
        const names = [
            ...observers.keys(),
        ];

        for (
            const name of names
        ) {
            disconnect(
                name
            );
        }

        return names.length;
    }

    function hasObserver(
        name
    ) {
        try {
            return observers.has(
                validateObserverName(
                    name
                )
            );
        } catch {
            return false;
        }
    }

    function inspectObservers(
        filters = {}
    ) {
        let results = [
            ...observers.values(),
        ];

        if (filters.group) {
            results =
                results.filter(
                    (record) =>
                        record.group ===
                        filters.group
                );
        }

        if (
            filters.active !==
            undefined
        ) {
            results =
                results.filter(
                    (record) =>
                        record.active ===
                        Boolean(
                            filters.active
                        )
                );
        }

        return results
            .map(
                createObserverSnapshot
            )
            .sort(
                (
                    first,
                    second
                ) =>
                    first.name.localeCompare(
                        second.name
                    )
            );
    }

    function readText(
        element,
        options = {}
    ) {
        if (
            !(element instanceof Node)
        ) {
            return null;
        }

        const raw =
            options.useInnerText ===
            true &&
            element instanceof
                HTMLElement
                ? element.innerText
                : element.textContent;

        const value =
            String(raw ?? "");

        return options.trim ===
            false
            ? value
            : value.trim();
    }

    async function resolveWatchElement(
        selector,
        options
    ) {
        if (
            options.waitForElement ===
            false
        ) {
            return find(
                selector,
                options
            );
        }

        return waitFor(
            selector,
            {
                ...options,

                rejectOnTimeout:
                    options
                        .rejectOnTimeout !==
                    false,
            }
        );
    }

    async function watchText(
        name,
        selector,
        callback,
        options = {}
    ) {
        const normalizedName =
            validateObserverName(
                name
            );

        const normalizedSelector =
            validateSelector(
                selector
            );

        const normalizedCallback =
            validateCallback(
                callback
            );

        const element =
            await resolveWatchElement(
                normalizedSelector,
                options
            );

        if (!element) {
            return null;
        }

        let previousValue =
            readText(
                element,
                options
            );

        if (
            options.emitInitial ===
            true
        ) {
            normalizedCallback({
                name:
                    normalizedName,

                selector:
                    normalizedSelector,

                element,

                value:
                    previousValue,

                previousValue:
                    null,

                initial:
                    true,
            });
        }

        metrics.textWatchersCreated +=
            1;

        return observe(
            normalizedName,
            element,
            () => {
                const currentValue =
                    readText(
                        element,
                        options
                    );

                if (
                    currentValue ===
                    previousValue
                ) {
                    return;
                }

                const oldValue =
                    previousValue;

                previousValue =
                    currentValue;

                metrics.valueChangesDetected +=
                    1;

                normalizedCallback({
                    name:
                        normalizedName,

                    selector:
                        normalizedSelector,

                    element,

                    value:
                        currentValue,

                    previousValue:
                        oldValue,

                    initial:
                        false,
                });
            },
            {
                group:
                    options.group,

                replaceExisting:
                    options.replaceExisting,

                childList:
                    true,

                subtree:
                    options.subtree !==
                    false,

                characterData:
                    true,

                emitMutationEvent:
                    options.emitMutationEvent,

                metadata: {
                    watcherType:
                        "text",

                    selector:
                        normalizedSelector,

                    ...options.metadata,
                },
            }
        );
    }

    async function watchAttribute(
        name,
        selector,
        attributeName,
        callback,
        options = {}
    ) {
        const normalizedName =
            validateObserverName(
                name
            );

        const normalizedSelector =
            validateSelector(
                selector
            );

        if (
            typeof attributeName !==
                "string" ||
            !attributeName.trim()
        ) {
            throw new TypeError(
                "Attribute name must be a non-empty string."
            );
        }

        const normalizedAttribute =
            attributeName.trim();

        const normalizedCallback =
            validateCallback(
                callback
            );

        const element =
            await resolveWatchElement(
                normalizedSelector,
                options
            );

        if (!element) {
            return null;
        }

        let previousValue =
            element.getAttribute(
                normalizedAttribute
            );

        if (
            options.emitInitial ===
            true
        ) {
            normalizedCallback({
                name:
                    normalizedName,

                selector:
                    normalizedSelector,

                attributeName:
                    normalizedAttribute,

                element,

                value:
                    previousValue,

                previousValue:
                    null,

                initial:
                    true,
            });
        }

        metrics.attributeWatchersCreated +=
            1;

        return observe(
            normalizedName,
            element,
            () => {
                const currentValue =
                    element.getAttribute(
                        normalizedAttribute
                    );

                if (
                    currentValue ===
                    previousValue
                ) {
                    return;
                }

                const oldValue =
                    previousValue;

                previousValue =
                    currentValue;

                metrics.valueChangesDetected +=
                    1;

                normalizedCallback({
                    name:
                        normalizedName,

                    selector:
                        normalizedSelector,

                    attributeName:
                        normalizedAttribute,

                    element,

                    value:
                        currentValue,

                    previousValue:
                        oldValue,

                    initial:
                        false,
                });
            },
            {
                group:
                    options.group,

                replaceExisting:
                    options.replaceExisting,

                childList:
                    false,

                subtree:
                    false,

                attributes:
                    true,

                attributeFilter: [
                    normalizedAttribute,
                ],

                attributeOldValue:
                    true,

                emitMutationEvent:
                    options.emitMutationEvent,

                metadata: {
                    watcherType:
                        "attribute",

                    selector:
                        normalizedSelector,

                    attributeName:
                        normalizedAttribute,

                    ...options.metadata,
                },
            }
        );
    }

    async function watchValue(
        name,
        selector,
        parser,
        callback,
        options = {}
    ) {
        const normalizedName =
            validateObserverName(
                name
            );

        const normalizedSelector =
            validateSelector(
                selector
            );

        const normalizedParser =
            validateCallback(
                parser
            );

        const normalizedCallback =
            validateCallback(
                callback
            );

        const element =
            await resolveWatchElement(
                normalizedSelector,
                options
            );

        if (!element) {
            return null;
        }

        function readRawValue() {
            if (
                typeof options.read ===
                "function"
            ) {
                return options.read(
                    element
                );
            }

            if (
                options.attribute
            ) {
                return element.getAttribute(
                    String(
                        options.attribute
                    )
                );
            }

            return readText(
                element,
                options
            );
        }

        function parseValue(
            rawValue
        ) {
            try {
                return normalizedParser(
                    rawValue,
                    element
                );
            } catch (error) {
                errors?.report({
                    code:
                        ERROR_CODES.DOM
                            .PARSE_FAILED,

                    severity:
                        SEVERITY.ERROR,

                    service:
                        "dom",

                    message:
                        `DOM value watcher "${normalizedName}" could not parse its value.`,

                    details: {
                        observerName:
                            normalizedName,

                        selector:
                            normalizedSelector,

                        rawValue,
                    },

                    error,

                    recoverable:
                        true,

                    retryable:
                        true,

                    recovery:
                        "Correct the parser or wait for a valid DOM value.",
                });

                return undefined;
            }
        }

        let previousRawValue =
            readRawValue();

        let previousValue =
            parseValue(
                previousRawValue
            );

        if (
            options.emitInitial ===
            true
        ) {
            normalizedCallback({
                name:
                    normalizedName,

                selector:
                    normalizedSelector,

                element,

                rawValue:
                    previousRawValue,

                previousRawValue:
                    null,

                value:
                    previousValue,

                previousValue:
                    null,

                initial:
                    true,
            });
        }

        metrics.valueWatchersCreated +=
            1;

        const attributeName =
            options.attribute
                ? String(
                      options.attribute
                  )
                : null;

        return observe(
            normalizedName,
            element,
            () => {
                const currentRawValue =
                    readRawValue();

                const currentValue =
                    parseValue(
                        currentRawValue
                    );

                const equals =
                    typeof options.equals ===
                    "function"
                        ? options.equals(
                              currentValue,
                              previousValue
                          )
                        : Object.is(
                              currentValue,
                              previousValue
                          );

                if (equals) {
                    previousRawValue =
                        currentRawValue;

                    return;
                }

                const oldRawValue =
                    previousRawValue;

                const oldValue =
                    previousValue;

                previousRawValue =
                    currentRawValue;

                previousValue =
                    currentValue;

                metrics.valueChangesDetected +=
                    1;

                normalizedCallback({
                    name:
                        normalizedName,

                    selector:
                        normalizedSelector,

                    element,

                    rawValue:
                        currentRawValue,

                    previousRawValue:
                        oldRawValue,

                    value:
                        currentValue,

                    previousValue:
                        oldValue,

                    initial:
                        false,
                });
            },
            {
                group:
                    options.group,

                replaceExisting:
                    options.replaceExisting,

                childList:
                    attributeName ===
                    null,

                subtree:
                    attributeName ===
                        null &&
                    options.subtree !==
                        false,

                characterData:
                    attributeName ===
                    null,

                attributes:
                    attributeName !==
                    null,

                attributeFilter:
                    attributeName !==
                    null
                        ? [
                              attributeName,
                          ]
                        : undefined,

                emitMutationEvent:
                    options.emitMutationEvent,

                metadata: {
                    watcherType:
                        "value",

                    selector:
                        normalizedSelector,

                    attributeName,

                    ...options.metadata,
                },
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

            activeObserverCount:
                observers.size,

            observerGroups: [
                ...new Set(
                    [
                        ...observers.values(),
                    ].map(
                        (record) =>
                            record.group
                    )
                ),
            ].sort(),

            metrics: {
                ...metrics,
            },

            defaults: {
                timeoutMs:
                    DEFAULT_TIMEOUT_MS,

                pollIntervalMs:
                    DEFAULT_POLL_INTERVAL_MS,

                observerGroup:
                    DEFAULT_OBSERVER_GROUP,
            },
        };
    }

    TACTIC.services.dom = {
        find,
        findAll,
        exists,

        waitFor,
        waitForRemoval,

        observe,
        disconnect,
        disconnectGroup,
        disconnectAll,

        watchText,
        watchAttribute,
        watchValue,

        hasObserver,
        inspectObservers,

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
                "observers",

            requiresHeartbeat:
                true,

            activeObserverCount:
                0,
        },
    });

    events?.emit(
        EVENTS.DOM.READY,
        {
            service:
                "dom",

            phase:
                "observers",
        }
    );

    logger?.info(
        "DOM service loaded"
    );
})();