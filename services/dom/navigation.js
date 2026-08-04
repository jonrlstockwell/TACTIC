/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/dom/navigation.js
 *
 * Purpose:
 * Detects Torn navigation and SPA route changes.
 *
 * Responsibilities:
 * - Monitor pushState and replaceState
 * - Monitor popstate and hashchange
 * - Detect navigation caused by DOM replacement
 * - Identify the current Torn page
 * - Emit navigation-change events
 * - Expose navigation diagnostics
 *
 * Does NOT:
 * - Perform navigation
 * - Click links
 * - Contain application business logic
 *
 * Public API:
 * - TACTIC.services.dom.startNavigation()
 * - TACTIC.services.dom.stopNavigation()
 * - TACTIC.services.dom.getNavigation()
 * - TACTIC.services.dom.getPage()
 *
 * Dependencies:
 * - services/dom/index.js
 * - services/dom/pages.js
 * - services/scheduler/index.js
 * - core/events.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC DOM Navigation] Namespace is unavailable."
        );

        return;
    }

    const dom =
        TACTIC.services.dom;

    const events =
        TACTIC.services.events;

    const logger =
        TACTIC.services.logger;

    const scheduler =
        TACTIC.services.scheduler;

    const health =
        TACTIC.services.health;

    const constants =
        TACTIC.constants;

    if (
        !dom ||
        typeof dom.detectPage !==
            "function"
    ) {
        console.error(
            "[TACTIC DOM Navigation] DOM page detection is unavailable."
        );

        return;
    }

    const {
        EVENTS,
    } = constants;

    const OBSERVER_NAME =
        "dom:navigation-observer";

    const OBSERVER_GROUP =
        "dom:system";

    const CHECK_TIMER_NAME =
        "dom:navigation-check";

    const HISTORY_PATCH =
        Symbol.for(
            "TACTIC.DOM.HISTORY_PATCH"
        );

    const state = {
        started:
            false,

        startedAt:
            null,

        stoppedAt:
            null,

        changeCount:
            0,

        checkCount:
            0,

        lastCheckedAt:
            null,

        lastChangedAt:
            null,

        lastReason:
            null,

        current:
            null,

        previous:
            null,
    };

    function clonePage(
        page
    ) {
        if (!page) {
            return null;
        }

        return {
            ...page,

            route: {
                ...page.route,

                query: {
                    ...page.route.query,
                },

                hashParameters: {
                    ...page
                        .route
                        .hashParameters,
                },
            },
        };
    }

    function createSnapshot() {
        return {
            started:
                state.started,

            startedAt:
                state.startedAt,

            stoppedAt:
                state.stoppedAt,

            changeCount:
                state.changeCount,

            checkCount:
                state.checkCount,

            lastCheckedAt:
                state.lastCheckedAt,

            lastChangedAt:
                state.lastChangedAt,

            lastReason:
                state.lastReason,

            current:
                clonePage(
                    state.current
                ),

            previous:
                clonePage(
                    state.previous
                ),
        };
    }

    function routesEqual(
        first,
        second
    ) {
        if (
            !first ||
            !second
        ) {
            return false;
        }

        return (
            first.id ===
                second.id &&
            first.route.href ===
                second.route.href
        );
    }

    function runNavigationCheck(
        reason =
            "manual"
    ) {
        state.checkCount +=
            1;

        state.lastCheckedAt =
            Date.now();

        const detected =
            dom.detectPage();

        if (
            routesEqual(
                state.current,
                detected
            )
        ) {
            health?.heartbeat(
                "service:dom",
                {
                    metadata: {
                        navigationStarted:
                            state.started,

                        navigationChecks:
                            state.checkCount,

                        navigationChanges:
                            state.changeCount,
                    },
                }
            );

            return false;
        }

        state.previous =
            state.current;

        state.current =
            detected;

        state.changeCount +=
            1;

        state.lastChangedAt =
            Date.now();

        state.lastReason =
            reason;

        const payload = {
            reason,

            timestamp:
                state.lastChangedAt,

            current:
                clonePage(
                    state.current
                ),

            previous:
                clonePage(
                    state.previous
                ),

            navigation:
                createSnapshot(),
        };

        events?.emit(
            EVENTS.DOM
                .NAVIGATION_CHANGED,
            payload
        );

        health?.heartbeat(
            "service:dom",
            {
                metadata: {
                    currentPage:
                        state.current.id,

                    currentHref:
                        state.current
                            .route.href,

                    navigationStarted:
                        state.started,

                    navigationChecks:
                        state.checkCount,

                    navigationChanges:
                        state.changeCount,
                },
            }
        );

        logger?.debug(
            `Torn navigation detected: ${
                state.previous
                    ?.id ||
                "none"
            } → ${state.current.id}`,
            {
                reason,

                href:
                    state.current
                        .route.href,
            }
        );

        return true;
    }

    function scheduleCheck(
        reason
    ) {
        if (!state.started) {
            return false;
        }

        if (scheduler) {
            scheduler.once(
                CHECK_TIMER_NAME,
                50,
                () => {
                    runNavigationCheck(
                        reason
                    );
                },
                {
                    group:
                        OBSERVER_GROUP,

                    replaceExisting:
                        true,

                    continueOnError:
                        true,

                    metadata: {
                        service:
                            "dom",

                        purpose:
                            "navigation-check",
                    },
                }
            );

            return true;
        }

        queueMicrotask(
            () => {
                runNavigationCheck(
                    reason
                );
            }
        );

        return true;
    }

    function patchHistory() {
        if (
            globalThis.history[
                HISTORY_PATCH
            ]
        ) {
            return;
        }

        const originalPushState =
            globalThis.history
                .pushState;

        const originalReplaceState =
            globalThis.history
                .replaceState;

        function patchedPushState(
            ...args
        ) {
            const result =
                originalPushState
                    .apply(
                        this,
                        args
                    );

            scheduleCheck(
                "history:pushState"
            );

            return result;
        }

        function patchedReplaceState(
            ...args
        ) {
            const result =
                originalReplaceState
                    .apply(
                        this,
                        args
                    );

            scheduleCheck(
                "history:replaceState"
            );

            return result;
        }

        globalThis.history
            .pushState =
            patchedPushState;

        globalThis.history
            .replaceState =
            patchedReplaceState;

        globalThis.history[
            HISTORY_PATCH
        ] = {
            originalPushState,
            originalReplaceState,
        };
    }

    function restoreHistory() {
        const patch =
            globalThis.history[
                HISTORY_PATCH
            ];

        if (!patch) {
            return;
        }

        globalThis.history
            .pushState =
            patch.originalPushState;

        globalThis.history
            .replaceState =
            patch.originalReplaceState;

        delete globalThis.history[
            HISTORY_PATCH
        ];
    }

    function handlePopState() {
        scheduleCheck(
            "window:popstate"
        );
    }

    function handleHashChange() {
        scheduleCheck(
            "window:hashchange"
        );
    }

    function startDomObserver() {
        if (!document.body) {
            return false;
        }

        dom.observe(
            OBSERVER_NAME,
            document.body,
            () => {
                scheduleCheck(
                    "dom:mutation"
                );
            },
            {
                group:
                    OBSERVER_GROUP,

                replaceExisting:
                    true,

                childList:
                    true,

                subtree:
                    true,

                attributes:
                    false,

                characterData:
                    false,

                emitMutationEvent:
                    false,

                metadata: {
                    purpose:
                        "navigation-detection",
                },
            }
        );

        return true;
    }

    function startNavigation() {
        if (state.started) {
            return createSnapshot();
        }

        state.started =
            true;

        state.startedAt =
            Date.now();

        state.stoppedAt =
            null;

        patchHistory();

        globalThis.addEventListener(
            "popstate",
            handlePopState
        );

        globalThis.addEventListener(
            "hashchange",
            handleHashChange
        );

        startDomObserver();

        runNavigationCheck(
            "navigation:start"
        );

        health?.heartbeat(
            "service:dom",
            {
                metadata: {
                    navigationStarted:
                        true,
                },
            }
        );

        logger?.info(
            "DOM navigation detection started"
        );

        return createSnapshot();
    }

    function stopNavigation() {
        if (!state.started) {
            return false;
        }

        state.started =
            false;

        state.stoppedAt =
            Date.now();

        scheduler?.cancel(
            CHECK_TIMER_NAME
        );

        dom.disconnect(
            OBSERVER_NAME
        );

        globalThis.removeEventListener(
            "popstate",
            handlePopState
        );

        globalThis.removeEventListener(
            "hashchange",
            handleHashChange
        );

        restoreHistory();

        health?.heartbeat(
            "service:dom",
            {
                metadata: {
                    navigationStarted:
                        false,
                },
            }
        );

        logger?.info(
            "DOM navigation detection stopped"
        );

        return true;
    }

    function getNavigation() {
        return createSnapshot();
    }

    function getPage() {
        if (!state.current) {
            state.current =
                dom.detectPage();
        }

        return clonePage(
            state.current
        );
    }

    dom.startNavigation =
        startNavigation;

    dom.stopNavigation =
        stopNavigation;

    dom.getNavigation =
        getNavigation;

    dom.getPage =
        getPage;

    dom.checkNavigation =
        runNavigationCheck;

    /*
     * Navigation detection starts automatically after the
     * service extension loads.
     */
    startNavigation();
})();