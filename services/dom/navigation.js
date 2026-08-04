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
 * Detects Torn navigation and SPA route changes without
 * observing unrelated page mutations.
 *
 * Responsibilities:
 * - Monitor pushState and replaceState
 * - Monitor popstate and hashchange
 * - Identify the current Torn page
 * - Emit navigation-change events
 * - Debounce duplicate route checks
 * - Expose navigation diagnostics
 *
 * Does NOT:
 * - Observe the entire document body
 * - React to unrelated Torn DOM mutations
 * - Perform navigation
 * - Click links
 * - Contain application business logic
 *
 * Public API:
 * - TACTIC.services.dom.startNavigation()
 * - TACTIC.services.dom.stopNavigation()
 * - TACTIC.services.dom.getNavigation()
 * - TACTIC.services.dom.getPage()
 * - TACTIC.services.dom.checkNavigation()
 *
 * Dependencies:
 * - services/dom/index.js
 * - services/dom/pages.js
 * - services/scheduler/index.js
 * - core/events.js
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
            "[TACTIC DOM Navigation] Namespace is unavailable."
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
        scheduler,
        health,
    } = services;

    const {
        EVENTS,
    } = constants;

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

    const CHECK_TIMER_NAME =
        "dom:navigation-check";

    const TIMER_GROUP =
        "dom:system";

    const CHECK_DELAY_MS =
        50;

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

        scheduledCheckCount:
            0,

        duplicateCheckCount:
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

            scheduledCheckCount:
                state
                    .scheduledCheckCount,

            duplicateCheckCount:
                state
                    .duplicateCheckCount,

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

    function updateHealth() {
        health?.heartbeat(
            "service:dom",
            {
                metadata: {
                    navigationStarted:
                        state.started,

                    currentPage:
                        state.current
                            ?.id ||
                        null,

                    currentHref:
                        state.current
                            ?.route
                            ?.href ||
                        null,

                    navigationChecks:
                        state.checkCount,

                    navigationChanges:
                        state.changeCount,

                    scheduledNavigationChecks:
                        state
                            .scheduledCheckCount,

                    duplicateNavigationChecks:
                        state
                            .duplicateCheckCount,
                },
            }
        );
    }

    function runNavigationCheck(
        reason =
            "manual"
    ) {
        if (!state.started) {
            return false;
        }

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
            state.duplicateCheckCount +=
                1;

            updateHealth();

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

        updateHealth();

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

        state.scheduledCheckCount +=
            1;

        if (scheduler) {
            scheduler.once(
                CHECK_TIMER_NAME,
                CHECK_DELAY_MS,
                () => {
                    runNavigationCheck(
                        reason
                    );
                },
                {
                    group:
                        TIMER_GROUP,

                    replaceExisting:
                        true,

                    continueOnError:
                        true,

                    metadata: {
                        service:
                            "dom",

                        purpose:
                            "navigation-check",

                        reason,
                    },
                }
            );

            return true;
        }

        setTimeout(
            () => {
                runNavigationCheck(
                    reason
                );
            },
            CHECK_DELAY_MS
        );

        return true;
    }

    function patchHistory() {
        if (
            globalThis.history[
                HISTORY_PATCH
            ]
        ) {
            return false;
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
            const previousHref =
                globalThis.location.href;

            const result =
                originalPushState
                    .apply(
                        this,
                        args
                    );

            if (
                globalThis.location
                    .href !==
                previousHref
            ) {
                scheduleCheck(
                    "history:pushState"
                );
            }

            return result;
        }

        function patchedReplaceState(
            ...args
        ) {
            const previousHref =
                globalThis.location.href;

            const result =
                originalReplaceState
                    .apply(
                        this,
                        args
                    );

            if (
                globalThis.location
                    .href !==
                previousHref
            ) {
                scheduleCheck(
                    "history:replaceState"
                );
            }

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

        return true;
    }

    function restoreHistory() {
        const patch =
            globalThis.history[
                HISTORY_PATCH
            ];

        if (!patch) {
            return false;
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

        return true;
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

        runNavigationCheck(
            "navigation:start"
        );

        updateHealth();

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

        globalThis.removeEventListener(
            "popstate",
            handlePopState
        );

        globalThis.removeEventListener(
            "hashchange",
            handleHashChange
        );

        restoreHistory();

        updateHealth();

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

    startNavigation();
})();