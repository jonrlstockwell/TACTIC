/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/navigation/index.js
 *
 * Purpose:
 * Provides centralized Torn route registration, navigation,
 * route readiness, and event-driven navigation subscriptions.
 *
 * Responsibilities:
 * - Register named Torn routes
 * - Resolve route IDs to URLs
 * - Identify whether a route is currently active
 * - Navigate to registered routes
 * - Wait for a route or selector to become ready
 * - Consume DOM navigation-change events
 * - Notify Navigation Service subscribers
 * - Wait for navigation, pages, and registered routes
 * - Expose navigation diagnostics and Health information
 *
 * Does NOT:
 * - Detect browser-history changes directly
 * - Observe the document body
 * - Fill forms
 * - Click submit or confirmation controls
 * - Contain Protection business rules
 *
 * Public API:
 * - register()
 * - has()
 * - get()
 * - list()
 * - isCurrent()
 * - open()
 * - waitFor()
 * - subscribe()
 * - unsubscribe()
 * - waitForNavigation()
 * - waitForPage()
 * - waitForRoute()
 * - inspect()
 *
 * Dependencies:
 * - services/dom/pages/index.js
 * - services/dom/navigation.js
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
            "[TACTIC Navigation] Namespace is unavailable."
        );

        return;
    }

    const {
        services,
        constants,
    } = TACTIC;

    const {
        dom,
        events,
        logger,
        errors,
        health,
    } = services;

    const {
        EVENTS,
        HEALTH_STATES,
    } = constants;

    if (
        !dom ||
        typeof dom.getRoute !==
            "function"
    ) {
        console.error(
            "[TACTIC Navigation] DOM route service is unavailable."
        );

        return;
    }

    if (
        !events ||
        typeof events.on !==
            "function"
    ) {
        console.error(
            "[TACTIC Navigation] Events service is unavailable."
        );

        return;
    }

    const SERVICE_NAME =
        "service:navigation";

    const DEFAULT_TIMEOUT_MS =
        15_000;

    const DEFAULT_POLL_INTERVAL_MS =
        100;

    const routes =
        new Map();

    const subscribers =
        new Map();

    let nextSubscriberId =
        1;

    let removeDomNavigationListener =
        null;

    const metrics = {
        startedAt:
            Date.now(),

        registrations:
            0,

        lookups:
            0,

        missingLookups:
            0,

        navigationRequests:
            0,

        navigationsStarted:
            0,

        alreadyCurrent:
            0,

        waits:
            0,

        waitTimeouts:
            0,

        subscriptions:
            0,

        unsubscriptions:
            0,

        navigationEventsReceived:
            0,

        subscriberNotifications:
            0,

        subscriberErrors:
            0,

        navigationWaits:
            0,

        navigationWaitResolutions:
            0,

        navigationWaitTimeouts:
            0,

        pageWaits:
            0,

        pageWaitResolutions:
            0,

        pageWaitTimeouts:
            0,

        routeEventWaits:
            0,

        routeEventWaitResolutions:
            0,

        routeEventWaitTimeouts:
            0,

        lastActivityAt:
            Date.now(),

        lastRouteId:
            null,

        lastNavigationAt:
            null,

        lastWaitAt:
            null,

        lastEventAt:
            null,

        lastEvent:
            null,

        lastResult:
            null,

        lastError:
            null,
    };

    function isPlainObject(
        value
    ) {
        return (
            value !== null &&
            typeof value ===
                "object" &&
            !Array.isArray(
                value
            )
        );
    }

    function cloneValue(
        value
    ) {
        if (
            value === null ||
            value === undefined
        ) {
            return value;
        }

        if (
            typeof structuredClone ===
            "function"
        ) {
            try {
                return structuredClone(
                    value
                );
            } catch {
                // Fall through.
            }
        }

        if (
            typeof value ===
                "object"
        ) {
            try {
                return JSON.parse(
                    JSON.stringify(
                        value
                    )
                );
            } catch {
                return value;
            }
        }

        return value;
    }

    function createErrorSnapshot(
        error
    ) {
        return {
            name:
                error?.name ||
                "Error",

            message:
                error?.message ||
                String(error),

            timestamp:
                Date.now(),
        };
    }

    function normalizeRouteId(
        routeId
    ) {
        if (
            typeof routeId !==
                "string" ||
            !routeId.trim()
        ) {
            throw new TypeError(
                "Navigation route ID must be a non-empty string."
            );
        }

        const normalized =
            routeId
                .trim()
                .toLowerCase();

        if (
            !/^[a-z0-9:_-]+$/
                .test(normalized)
        ) {
            throw new TypeError(
                "Navigation route ID contains unsupported characters."
            );
        }

        return normalized;
    }

    function normalizePageId(
        pageId
    ) {
        if (
            typeof pageId !==
                "string" ||
            !pageId.trim()
        ) {
            throw new TypeError(
                "Navigation page ID must be a non-empty string."
            );
        }

        return pageId
            .trim()
            .toLowerCase();
    }

    function normalizeTimeout(
        value
    ) {
        return (
            Number.isSafeInteger(
                value
            ) &&
            value > 0
                ? value
                : DEFAULT_TIMEOUT_MS
        );
    }

    function normalizeDefinition(
        definition
    ) {
        if (
            !isPlainObject(
                definition
            )
        ) {
            throw new TypeError(
                "Navigation route definition must be an object."
            );
        }

        const id =
            normalizeRouteId(
                definition.id
            );

        if (
            typeof definition.url !==
                "string" ||
            !definition.url.trim()
        ) {
            throw new TypeError(
                `Navigation route "${id}" requires a URL.`
            );
        }

        return {
            id,

            name:
                typeof definition.name ===
                    "string" &&
                definition.name.trim()
                    ? definition.name.trim()
                    : id,

            url:
                definition.url.trim(),

            pageId:
                typeof definition.pageId ===
                    "string" &&
                definition.pageId.trim()
                    ? definition.pageId
                          .trim()
                          .toLowerCase()
                    : null,

            readySelectorPath:
                typeof definition
                    .readySelectorPath ===
                    "string" &&
                definition
                    .readySelectorPath
                    .trim()
                    ? definition
                          .readySelectorPath
                          .trim()
                    : null,

            match:
                typeof definition.match ===
                    "function"
                    ? definition.match
                    : null,

            metadata:
                isPlainObject(
                    definition.metadata
                )
                    ? {
                          ...definition.metadata,
                      }
                    : {},

            registeredAt:
                Date.now(),
        };
    }

    function createSnapshot(
        route
    ) {
        if (!route) {
            return null;
        }

        return {
            id:
                route.id,

            name:
                route.name,

            url:
                route.url,

            pageId:
                route.pageId,

            readySelectorPath:
                route.readySelectorPath,

            hasCustomMatcher:
                Boolean(
                    route.match
                ),

            metadata: {
                ...route.metadata,
            },

            registeredAt:
                route.registeredAt,
        };
    }

    function createResult(
        values = {}
    ) {
        const result = {
            success:
                false,

            routeId:
                null,

            navigationStarted:
                false,

            alreadyCurrent:
                false,

            ready:
                false,

            reason:
                null,

            message:
                null,

            href:
                globalThis.location.href,

            timestamp:
                Date.now(),

            ...values,
        };

        metrics.lastResult =
            cloneValue(
                result
            );

        return result;
    }

    function recordActivity(
        operation,
        metadata = {}
    ) {
        metrics.lastActivityAt =
            Date.now();

        health?.heartbeat(
            SERVICE_NAME,
            {
                metadata: {
                    lastOperation:
                        operation,

                    routeCount:
                        routes.size,

                    subscriberCount:
                        subscribers.size,

                    lastRouteId:
                        metrics.lastRouteId,

                    lastNavigationAt:
                        metrics.lastNavigationAt,

                    navigationEventsReceived:
                        metrics
                            .navigationEventsReceived,

                    ...metadata,
                },
            }
        );
    }

    function register(
        definition
    ) {
        const normalized =
            normalizeDefinition(
                definition
            );

        routes.set(
            normalized.id,
            normalized
        );

        metrics.registrations +=
            1;

        metrics.lastRouteId =
            normalized.id;

        recordActivity(
            "register",
            {
                routeId:
                    normalized.id,
            }
        );

        return createSnapshot(
            normalized
        );
    }

    function has(
        routeId
    ) {
        try {
            return routes.has(
                normalizeRouteId(
                    routeId
                )
            );
        } catch {
            return false;
        }
    }

    function getInternal(
        routeId
    ) {
        metrics.lookups +=
            1;

        const normalizedId =
            normalizeRouteId(
                routeId
            );

        const route =
            routes.get(
                normalizedId
            );

        metrics.lastRouteId =
            normalizedId;

        if (!route) {
            metrics.missingLookups +=
                1;

            return null;
        }

        return route;
    }

    function get(
        routeId
    ) {
        return createSnapshot(
            getInternal(
                routeId
            )
        );
    }

    function list() {
        return [
            ...routes.values(),
        ]
            .map(
                createSnapshot
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

    function toUrl(
        urlValue
    ) {
        return new URL(
            String(
                urlValue
            ),
            globalThis.location.origin
        );
    }

    function defaultRouteMatch(
        route
    ) {
        const target =
            toUrl(
                route.url
            );

        const current =
            new URL(
                globalThis.location.href
            );

        return (
            current.pathname ===
                target.pathname &&
            current.search ===
                target.search &&
            current.hash ===
                target.hash
        );
    }

    function isCurrent(
        routeId
    ) {
        const route =
            getInternal(
                routeId
            );

        if (!route) {
            return false;
        }

        if (route.match) {
            try {
                return route.match({
                    route:
                        createSnapshot(
                            route
                        ),

                    currentRoute:
                        dom.getRoute(),

                    currentPage:
                        dom.getPage?.() ||
                        dom.detectPage(),
                }) === true;
            } catch (error) {
                logger?.warn(
                    `Navigation matcher failed: ${route.id}`,
                    {
                        error,
                    }
                );

                return false;
            }
        }

        return defaultRouteMatch(
            route
        );
    }

    function resolveReadySelector(
        route,
        explicitSelectorPath
    ) {
        const selectorPath =
            explicitSelectorPath ||
            route.readySelectorPath;

        if (!selectorPath) {
            return null;
        }

        return (
            dom.getSelector?.(
                selectorPath
            ) ||
            selectorPath
        );
    }

    function delay(
        milliseconds
    ) {
        return new Promise(
            (resolve) => {
                setTimeout(
                    resolve,
                    milliseconds
                );
            }
        );
    }

    async function waitFor(
        routeId,
        options = {}
    ) {
        metrics.waits +=
            1;

        metrics.lastWaitAt =
            Date.now();

        const route =
            getInternal(
                routeId
            );

        if (!route) {
            return createResult({
                routeId,

                reason:
                    "route-not-registered",

                message:
                    `Navigation route "${String(routeId)}" is not registered.`,
            });
        }

        const timeoutMs =
            normalizeTimeout(
                options.timeoutMs
            );

        const pollIntervalMs =
            Number.isSafeInteger(
                options.pollIntervalMs
            ) &&
            options.pollIntervalMs > 0
                ? options.pollIntervalMs
                : DEFAULT_POLL_INTERVAL_MS;

        const readySelector =
            resolveReadySelector(
                route,
                options.readySelectorPath
            );

        const startedAt =
            Date.now();

        while (
            Date.now() -
                startedAt <
            timeoutMs
        ) {
            const routeCurrent =
                isCurrent(
                    route.id
                );

            let selectorReady =
                true;

            if (readySelector) {
                const element =
                    dom.find(
                        readySelector
                    );

                selectorReady =
                    Boolean(
                        element
                    );

                if (
                    selectorReady &&
                    options.visible ===
                        true
                ) {
                    selectorReady =
                        Boolean(
                            element
                                .getClientRects()
                                .length
                        );
                }
            }

            if (
                routeCurrent &&
                selectorReady
            ) {
                recordActivity(
                    "route-ready",
                    {
                        routeId:
                            route.id,
                    }
                );

                return createResult({
                    success:
                        true,

                    routeId:
                        route.id,

                    alreadyCurrent:
                        true,

                    ready:
                        true,

                    reason:
                        "route-ready",

                    message:
                        `${route.name} is ready.`,

                    href:
                        globalThis.location.href,
                });
            }

            await delay(
                pollIntervalMs
            );
        }

        metrics.waitTimeouts +=
            1;

        recordActivity(
            "wait-timeout",
            {
                routeId:
                    route.id,
            }
        );

        return createResult({
            routeId:
                route.id,

            reason:
                "route-timeout",

            message:
                `Timed out waiting for ${route.name}.`,
        });
    }

    function open(
        routeId,
        options = {}
    ) {
        metrics.navigationRequests +=
            1;

        const route =
            getInternal(
                routeId
            );

        if (!route) {
            return createResult({
                routeId,

                reason:
                    "route-not-registered",

                message:
                    `Navigation route "${String(routeId)}" is not registered.`,
            });
        }

        if (
            isCurrent(
                route.id
            )
        ) {
            metrics.alreadyCurrent +=
                1;

            recordActivity(
                "already-current",
                {
                    routeId:
                        route.id,
                }
            );

            return createResult({
                success:
                    true,

                routeId:
                    route.id,

                alreadyCurrent:
                    true,

                ready:
                    false,

                reason:
                    "already-current",

                message:
                    `Already on ${route.name}.`,
            });
        }

        const targetUrl =
            toUrl(
                route.url
            );

        metrics.navigationsStarted +=
            1;

        metrics.lastNavigationAt =
            Date.now();

        metrics.lastRouteId =
            route.id;

        recordActivity(
            "navigation-started",
            {
                routeId:
                    route.id,

                href:
                    targetUrl.href,
            }
        );

        logger?.info(
            `Opening Torn route: ${route.name}`,
            {
                routeId:
                    route.id,

                href:
                    targetUrl.href,
            }
        );

        if (
            options.replace ===
            true
        ) {
            globalThis.location.replace(
                targetUrl.href
            );
        } else {
            globalThis.location.assign(
                targetUrl.href
            );
        }

        return createResult({
            success:
                true,

            routeId:
                route.id,

            navigationStarted:
                true,

            ready:
                false,

            reason:
                "navigation-started",

            message:
                `Opening ${route.name}.`,

            href:
                targetUrl.href,
        });
    }

    function createNavigationEvent(
        payload
    ) {
        return {
            reason:
                payload?.reason ||
                "unknown",

            timestamp:
                payload?.timestamp ||
                Date.now(),

            current:
                cloneValue(
                    payload?.current ||
                    dom.getPage?.() ||
                    dom.detectPage()
                ),

            previous:
                cloneValue(
                    payload?.previous ||
                    null
                ),

            navigation:
                cloneValue(
                    payload?.navigation ||
                    dom.getNavigation?.() ||
                    null
                ),
        };
    }

    function notifySubscriber(
        subscriber,
        navigationEvent
    ) {
        try {
            subscriber.callback(
                cloneValue(
                    navigationEvent
                )
            );

            subscriber.notificationCount +=
                1;

            subscriber.lastNotifiedAt =
                Date.now();

            metrics
                .subscriberNotifications +=
                1;

            return true;
        } catch (error) {
            subscriber.errorCount +=
                1;

            subscriber.lastError =
                createErrorSnapshot(
                    error
                );

            metrics.subscriberErrors +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            logger?.warn(
                "Navigation subscriber callback failed",
                {
                    subscriberId:
                        subscriber.id,

                    error,
                }
            );

            return false;
        }
    }

    function handleDomNavigationChanged(
        payload
    ) {
        metrics.navigationEventsReceived +=
            1;

        metrics.lastEventAt =
            Date.now();

        const navigationEvent =
            createNavigationEvent(
                payload
            );

        metrics.lastEvent =
            cloneValue(
                navigationEvent
            );

        for (
            const subscriber of
            subscribers.values()
        ) {
            notifySubscriber(
                subscriber,
                navigationEvent
            );
        }

        recordActivity(
            "navigation-event",
            {
                currentPageId:
                    navigationEvent
                        .current
                        ?.id ||
                    null,

                currentHref:
                    navigationEvent
                        .current
                        ?.route
                        ?.href ||
                    null,
            }
        );
    }

    function subscribe(
        callback,
        options = {}
    ) {
        if (
            typeof callback !==
                "function"
        ) {
            throw new TypeError(
                "Navigation subscriber must be a function."
            );
        }

        const subscriber = {
            id:
                nextSubscriberId++,

            callback,

            createdAt:
                Date.now(),

            notificationCount:
                0,

            errorCount:
                0,

            lastNotifiedAt:
                null,

            lastError:
                null,

            metadata:
                isPlainObject(
                    options.metadata
                )
                    ? {
                          ...options.metadata,
                      }
                    : {},
        };

        subscribers.set(
            subscriber.id,
            subscriber
        );

        metrics.subscriptions +=
            1;

        recordActivity(
            "subscribe",
            {
                subscriberId:
                    subscriber.id,
            }
        );

        if (
            options.emitInitial ===
            true
        ) {
            queueMicrotask(
                () => {
                    if (
                        subscribers.has(
                            subscriber.id
                        )
                    ) {
                        notifySubscriber(
                            subscriber,
                            createNavigationEvent({
                                reason:
                                    "subscription-initial",

                                current:
                                    dom.getPage?.() ||
                                    dom.detectPage(),

                                previous:
                                    null,

                                navigation:
                                    dom.getNavigation?.() ||
                                    null,
                            })
                        );
                    }
                }
            );
        }

        return subscriber.id;
    }

    function unsubscribe(
        subscriberId
    ) {
        const numericId =
            Number(
                subscriberId
            );

        if (
            !Number.isSafeInteger(
                numericId
            )
        ) {
            return false;
        }

        const removed =
            subscribers.delete(
                numericId
            );

        if (removed) {
            metrics.unsubscriptions +=
                1;

            recordActivity(
                "unsubscribe",
                {
                    subscriberId:
                        numericId,
                }
            );
        }

        return removed;
    }

    function createWaitPromise({
        timeoutMs,
        test,
        timeoutReason,
        timeoutMessage,
        onStart,
        onResolve,
        onTimeout,
    }) {
        return new Promise(
            (resolve) => {
                const startedAt =
                    Date.now();

                let settled =
                    false;

                let timeoutHandle =
                    null;

                let subscriberId =
                    null;

                function cleanup() {
                    if (
                        subscriberId !==
                        null
                    ) {
                        unsubscribe(
                            subscriberId
                        );

                        subscriberId =
                            null;
                    }

                    if (
                        timeoutHandle !==
                        null
                    ) {
                        clearTimeout(
                            timeoutHandle
                        );

                        timeoutHandle =
                            null;
                    }
                }

                function finish(
                    result
                ) {
                    if (settled) {
                        return;
                    }

                    settled =
                        true;

                    cleanup();

                    resolve(
                        result
                    );
                }

                onStart?.();

                subscriberId =
                    subscribe(
                        (
                            navigationEvent
                        ) => {
                            let matched =
                                false;

                            try {
                                matched =
                                    test(
                                        navigationEvent
                                    ) ===
                                    true;
                            } catch (error) {
                                metrics.lastError =
                                    createErrorSnapshot(
                                        error
                                    );
                            }

                            if (!matched) {
                                return;
                            }

                            onResolve?.();

                            finish({
                                success:
                                    true,

                                ready:
                                    true,

                                reason:
                                    "matched",

                                waitedMs:
                                    Date.now() -
                                    startedAt,

                                event:
                                    navigationEvent,
                            });
                        },
                        {
                            metadata: {
                                purpose:
                                    "navigation-wait",
                            },
                        }
                    );

                timeoutHandle =
                    setTimeout(
                        () => {
                            onTimeout?.();

                            finish({
                                success:
                                    false,

                                ready:
                                    false,

                                reason:
                                    timeoutReason,

                                message:
                                    timeoutMessage,

                                waitedMs:
                                    Date.now() -
                                    startedAt,

                                event:
                                    null,
                            });
                        },
                        timeoutMs
                    );
            }
        );
    }

    function waitForNavigation(
        options = {}
    ) {
        const timeoutMs =
            normalizeTimeout(
                options.timeoutMs
            );

        metrics.navigationWaits +=
            1;

        return createWaitPromise({
            timeoutMs,

            test:
                typeof options.test ===
                    "function"
                    ? options.test
                    : () =>
                          true,

            timeoutReason:
                "navigation-timeout",

            timeoutMessage:
                "Timed out waiting for a navigation change.",

            onResolve() {
                metrics
                    .navigationWaitResolutions +=
                    1;
            },

            onTimeout() {
                metrics
                    .navigationWaitTimeouts +=
                    1;
            },
        });
    }

    function waitForPage(
        pageId,
        options = {}
    ) {
        const normalizedPageId =
            normalizePageId(
                pageId
            );

        const currentPage =
            dom.getPage?.() ||
            dom.detectPage();

        if (
            currentPage?.id ===
            normalizedPageId
        ) {
            return Promise.resolve({
                success:
                    true,

                ready:
                    true,

                reason:
                    "already-current",

                waitedMs:
                    0,

                event: {
                    reason:
                        "already-current",

                    timestamp:
                        Date.now(),

                    current:
                        cloneValue(
                            currentPage
                        ),

                    previous:
                        null,

                    navigation:
                        cloneValue(
                            dom.getNavigation?.() ||
                            null
                        ),
                },
            });
        }

        metrics.pageWaits +=
            1;

        return createWaitPromise({
            timeoutMs:
                normalizeTimeout(
                    options.timeoutMs
                ),

            test:
                (
                    navigationEvent
                ) =>
                    navigationEvent
                        .current
                        ?.id ===
                    normalizedPageId,

            timeoutReason:
                "page-timeout",

            timeoutMessage:
                `Timed out waiting for page "${normalizedPageId}".`,

            onResolve() {
                metrics
                    .pageWaitResolutions +=
                    1;
            },

            onTimeout() {
                metrics
                    .pageWaitTimeouts +=
                    1;
            },
        });
    }

    function waitForRoute(
        routeId,
        options = {}
    ) {
        const normalizedRouteId =
            normalizeRouteId(
                routeId
            );

        if (
            isCurrent(
                normalizedRouteId
            )
        ) {
            return Promise.resolve({
                success:
                    true,

                ready:
                    true,

                routeId:
                    normalizedRouteId,

                reason:
                    "already-current",

                waitedMs:
                    0,

                event:
                    null,
            });
        }

        metrics.routeEventWaits +=
            1;

        return createWaitPromise({
            timeoutMs:
                normalizeTimeout(
                    options.timeoutMs
                ),

            test() {
                return isCurrent(
                    normalizedRouteId
                );
            },

            timeoutReason:
                "route-event-timeout",

            timeoutMessage:
                `Timed out waiting for route "${normalizedRouteId}".`,

            onResolve() {
                metrics
                    .routeEventWaitResolutions +=
                    1;
            },

            onTimeout() {
                metrics
                    .routeEventWaitTimeouts +=
                    1;
            },
        }).then(
            (result) => ({
                ...result,

                routeId:
                    normalizedRouteId,
            })
        );
    }

    function inspectSubscribers() {
        return [
            ...subscribers.values(),
        ].map(
            (subscriber) => ({
                id:
                    subscriber.id,

                createdAt:
                    subscriber.createdAt,

                notificationCount:
                    subscriber
                        .notificationCount,

                errorCount:
                    subscriber.errorCount,

                lastNotifiedAt:
                    subscriber
                        .lastNotifiedAt,

                lastError:
                    subscriber.lastError
                        ? {
                              ...subscriber
                                  .lastError,
                          }
                        : null,

                metadata: {
                    ...subscriber.metadata,
                },
            })
        );
    }

    function inspect() {
        return {
            service:
                "navigation",

            startedAt:
                metrics.startedAt,

            uptimeMs:
                Date.now() -
                metrics.startedAt,

            currentHref:
                globalThis.location.href,

            currentPage:
                dom.getPage?.() ||
                dom.detectPage(),

            routeCount:
                routes.size,

            routes:
                list(),

            subscriberCount:
                subscribers.size,

            subscribers:
                inspectSubscribers(),

            domNavigationListenerActive:
                typeof removeDomNavigationListener ===
                "function",

            metrics: {
                ...metrics,

                lastEvent:
                    metrics.lastEvent
                        ? cloneValue(
                              metrics.lastEvent
                          )
                        : null,

                lastResult:
                    metrics.lastResult
                        ? cloneValue(
                              metrics.lastResult
                          )
                        : null,

                lastError:
                    metrics.lastError
                        ? {
                              ...metrics
                                  .lastError,
                          }
                        : null,
            },

            defaults: {
                timeoutMs:
                    DEFAULT_TIMEOUT_MS,

                pollIntervalMs:
                    DEFAULT_POLL_INTERVAL_MS,
            },
        };
    }

    removeDomNavigationListener =
        events.on(
            EVENTS.DOM
                .NAVIGATION_CHANGED,
            handleDomNavigationChanged
        );

    TACTIC.services.navigation =
        Object.freeze({
            register,
            has,
            get,
            list,

            isCurrent,
            open,
            waitFor,

            subscribe,
            unsubscribe,

            waitForNavigation,
            waitForPage,
            waitForRoute,

            inspect,
        });

    health?.register({
        name:
            SERVICE_NAME,

        type:
            health.types.SERVICE,

        status:
            HEALTH_STATES.HEALTHY,

        staleAfterMs:
            null,

        metadata: {
            serviceName:
                "navigation",

            routeCount:
                routes.size,

            eventDriven:
                true,

            domNavigationListener:
                true,

            requiresHeartbeat:
                false,
        },
    });

    logger?.info(
        "Navigation service loaded",
        {
            eventDriven:
                true,
        }
    );
})();