/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * core/lifecycle.js
 *
 * Purpose:
 * Coordinates TACTIC application initialization, startup,
 * pausing, resuming, stopping, and restarting.
 *
 * Responsibilities:
 * - Maintain application lifecycle state
 * - Validate lifecycle transitions
 * - Initialize registered modules
 * - Initialize the drawer interface
 * - Coordinate Scheduler and Health services
 * - Emit lifecycle events
 * - Provide a read-only lifecycle snapshot
 *
 * Does NOT:
 * - Contain feature-module business logic
 * - Perform Torn DOM operations
 * - Make API requests
 *
 * Public API:
 * - initialize()
 * - start()
 * - pause()
 * - resume()
 * - stop()
 * - restart()
 * - getState()
 * - inspect()
 * - canTransition()
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Lifecycle] Namespace is unavailable."
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
        scheduler,
    } = services;

    const {
        EVENTS,
        ERROR_CODES,
        SEVERITY,
        LIFECYCLE_STATES,
        HEALTH_STATES,
    } = constants;

    const TRANSITIONS =
        Object.freeze({
            [LIFECYCLE_STATES.CREATED]: [
                LIFECYCLE_STATES.INITIALIZING,
                LIFECYCLE_STATES.ERROR,
            ],

            [LIFECYCLE_STATES.INITIALIZING]: [
                LIFECYCLE_STATES.INITIALIZED,
                LIFECYCLE_STATES.ERROR,
            ],

            [LIFECYCLE_STATES.INITIALIZED]: [
                LIFECYCLE_STATES.STARTING,
                LIFECYCLE_STATES.STOPPING,
                LIFECYCLE_STATES.ERROR,
            ],

            [LIFECYCLE_STATES.STARTING]: [
                LIFECYCLE_STATES.RUNNING,
                LIFECYCLE_STATES.ERROR,
            ],

            [LIFECYCLE_STATES.RUNNING]: [
                LIFECYCLE_STATES.PAUSING,
                LIFECYCLE_STATES.STOPPING,
                LIFECYCLE_STATES.ERROR,
            ],

            [LIFECYCLE_STATES.PAUSING]: [
                LIFECYCLE_STATES.PAUSED,
                LIFECYCLE_STATES.ERROR,
            ],

            [LIFECYCLE_STATES.PAUSED]: [
                LIFECYCLE_STATES.RESUMING,
                LIFECYCLE_STATES.STOPPING,
                LIFECYCLE_STATES.ERROR,
            ],

            [LIFECYCLE_STATES.RESUMING]: [
                LIFECYCLE_STATES.RUNNING,
                LIFECYCLE_STATES.ERROR,
            ],

            [LIFECYCLE_STATES.STOPPING]: [
                LIFECYCLE_STATES.STOPPED,
                LIFECYCLE_STATES.ERROR,
            ],

            [LIFECYCLE_STATES.STOPPED]: [
                LIFECYCLE_STATES.INITIALIZING,
                LIFECYCLE_STATES.STARTING,
                LIFECYCLE_STATES.ERROR,
            ],

            [LIFECYCLE_STATES.ERROR]: [
                LIFECYCLE_STATES.INITIALIZING,
                LIFECYCLE_STATES.STOPPING,
                LIFECYCLE_STATES.STOPPED,
            ],

            [LIFECYCLE_STATES.DESTROYING]: [
                LIFECYCLE_STATES.DESTROYED,
                LIFECYCLE_STATES.ERROR,
            ],

            [LIFECYCLE_STATES.DESTROYED]: [],
        });

    let state =
        LIFECYCLE_STATES.CREATED;

    let previousState =
        null;

    let stateChangedAt =
        Date.now();

    let initializedAt =
        null;

    let startedAt =
        null;

    let pausedAt =
        null;

    let stoppedAt =
        null;

    let initializationResults =
        [];

    const lifecyclePausedTimers =
        new Set();

    function canTransition(
        nextState
    ) {
        const allowed =
            TRANSITIONS[state] || [];

        return allowed.includes(
            nextState
        );
    }

    function createStateSnapshot() {
        const now =
            Date.now();

        return {
            state,
            previousState,

            stateChangedAt,

            millisecondsInState:
                now -
                stateChangedAt,

            initialized:
                TACTIC.initialized,

            initializedAt,
            startedAt,
            pausedAt,
            stoppedAt,

            uptimeMs:
                startedAt === null
                    ? 0
                    : now -
                      startedAt,

            registeredModules:
                TACTIC.modules.size,

            initializedModules:
                [
                    ...TACTIC.modules.values(),
                ].filter(
                    (module) =>
                        module.initialized
                ).length,

            pausedTimerCount:
                lifecyclePausedTimers.size,

            initializationResults:
                initializationResults.map(
                    (result) => ({
                        ...result,
                    })
                ),
        };
    }

    function emitStateEvent(
        eventName,
        extra = {}
    ) {
        events?.emit(
            eventName,
            {
                lifecycle:
                    createStateSnapshot(),

                ...extra,
            }
        );
    }

    function setState(
        nextState,
        options = {}
    ) {
        if (
            nextState === state
        ) {
            return createStateSnapshot();
        }

        if (
            options.force !== true &&
            !canTransition(nextState)
        ) {
            const message =
                `Invalid lifecycle transition: ${state} → ${nextState}`;

            errors?.report({
                code:
                    ERROR_CODES
                        .LIFECYCLE
                        .INVALID_TRANSITION,

                severity:
                    SEVERITY.ERROR,

                service:
                    "lifecycle",

                message,

                details: {
                    currentState:
                        state,

                    requestedState:
                        nextState,
                },

                recoverable:
                    true,

                recovery:
                    "Request a valid lifecycle transition.",
            });

            throw new Error(
                message
            );
        }

        previousState =
            state;

        state =
            nextState;

        stateChangedAt =
            Date.now();

        logger?.debug(
            `Lifecycle state changed: ${previousState} → ${state}`
        );

        emitStateEvent(
            EVENTS.LIFECYCLE
                .STATE_CHANGED,
            {
                previousState,
                state,
            }
        );

        return createStateSnapshot();
    }

    function getState() {
        return state;
    }

    function inspect() {
        return createStateSnapshot();
    }

    async function initialize() {
        if (
            state ===
                LIFECYCLE_STATES.INITIALIZED ||
            state ===
                LIFECYCLE_STATES.RUNNING ||
            state ===
                LIFECYCLE_STATES.PAUSED
        ) {
            return createStateSnapshot();
        }

        setState(
            LIFECYCLE_STATES.INITIALIZING
        );

        emitStateEvent(
            EVENTS.LIFECYCLE
                .INITIALIZING
        );

        health?.markHealthy(
            "service:lifecycle",
            {
                message:
                    "Lifecycle initialization started.",

                defaults: {
                    type:
                        health.types
                            .SERVICE,

                    status:
                        HEALTH_STATES
                            .STARTING,
                },
            }
        );

        try {
            initializationResults =
                await TACTIC
                    .initializeAllModules();

            setState(
                LIFECYCLE_STATES.INITIALIZED
            );

            initializedAt =
                Date.now();

            emitStateEvent(
                EVENTS.LIFECYCLE
                    .INITIALIZED,
                {
                    results:
                        initializationResults,
                }
            );

            logger?.info(
                "TACTIC lifecycle initialized",
                {
                    modules:
                        initializationResults,
                }
            );

            return createStateSnapshot();
        } catch (error) {
            setState(
                LIFECYCLE_STATES.ERROR,
                {
                    force: true,
                }
            );

            health?.markFailed(
                "service:lifecycle",
                {
                    status:
                        HEALTH_STATES
                            .UNHEALTHY,

                    score:
                        20,

                    message:
                        error.message,

                    error,
                }
            );

            errors?.report({
                code:
                    ERROR_CODES
                        .LIFECYCLE
                        .START_FAILED,

                severity:
                    SEVERITY.ERROR,

                service:
                    "lifecycle",

                message:
                    "TACTIC lifecycle initialization failed.",

                details: {
                    state,
                },

                error,

                recoverable:
                    true,

                retryable:
                    true,

                recovery:
                    "Retry lifecycle initialization.",
            });

            emitStateEvent(
                EVENTS.LIFECYCLE.ERROR,
                {
                    error,
                }
            );

            throw error;
        }
    }

    async function start() {
        if (
            state ===
            LIFECYCLE_STATES.RUNNING
        ) {
            logger?.warn(
                "TACTIC is already running"
            );

            return createStateSnapshot();
        }

        if (
            state ===
            LIFECYCLE_STATES.PAUSED
        ) {
            return resume();
        }

        events?.emit(
            EVENTS.APP.STARTING,
            {
                state,
            }
        );

        if (
            state ===
                LIFECYCLE_STATES.CREATED ||
            state ===
                LIFECYCLE_STATES.STOPPED ||
            state ===
                LIFECYCLE_STATES.ERROR
        ) {
            await initialize();
        }

        setState(
            LIFECYCLE_STATES.STARTING
        );

        emitStateEvent(
            EVENTS.LIFECYCLE
                .STARTING
        );

        try {
            const drawer =
                TACTIC.services.drawer;

            if (!drawer) {
                throw new Error(
                    "Drawer service is unavailable."
                );
            }

            await drawer.initialize();

            health?.startMonitoring();

            setState(
                LIFECYCLE_STATES.RUNNING
            );

            TACTIC.initialized =
                true;

            startedAt =
                startedAt ||
                Date.now();

            stoppedAt =
                null;

            health?.markHealthy(
                "framework:tactic",
                {
                    message:
                        "TACTIC is running.",
                }
            );

            health?.markHealthy(
                "service:lifecycle",
                {
                    message:
                        "Lifecycle service is running.",
                }
            );

            emitStateEvent(
                EVENTS.LIFECYCLE.RUNNING
            );

            events?.emit(
                EVENTS.APP.READY,
                {
                    version:
                        TACTIC.version,

                    moduleCount:
                        TACTIC.modules.size,

                    lifecycle:
                        createStateSnapshot(),
                }
            );

            logger?.info(
                "TACTIC started successfully",
                {
                    version:
                        TACTIC.version,

                    modules:
                        TACTIC.modules.size,
                }
            );

            return createStateSnapshot();
        } catch (error) {
            setState(
                LIFECYCLE_STATES.ERROR,
                {
                    force: true,
                }
            );

            TACTIC.initialized =
                false;

            health?.markFailed(
                "framework:tactic",
                {
                    message:
                        error.message,

                    error,
                }
            );

            errors?.report({
                code:
                    ERROR_CODES
                        .APP
                        .STARTUP_FAILED,

                severity:
                    SEVERITY.CRITICAL,

                service:
                    "lifecycle",

                message:
                    "TACTIC startup failed.",

                details: {
                    state,
                },

                error,

                recoverable:
                    true,

                retryable:
                    true,

                recovery:
                    "Correct the startup error and call lifecycle.restart().",
            });

            emitStateEvent(
                EVENTS.LIFECYCLE.ERROR,
                {
                    error,
                }
            );

            events?.emit(
                EVENTS.APP.ERROR,
                {
                    error,
                }
            );

            throw error;
        }
    }

    function pauseSchedulerTimers() {
        if (!scheduler) {
            return 0;
        }

        lifecyclePausedTimers.clear();

        const timers =
            scheduler.inspect();

        for (
            const timer of timers
        ) {
            if (
                timer.state !==
                    scheduler.states
                        .SCHEDULED
            ) {
                continue;
            }

            if (
                scheduler.pause(
                    timer.name
                )
            ) {
                lifecyclePausedTimers.add(
                    timer.name
                );
            }
        }

        return lifecyclePausedTimers.size;
    }

    function resumeSchedulerTimers() {
        if (!scheduler) {
            return 0;
        }

        let resumed =
            0;

        for (
            const timerName of
            lifecyclePausedTimers
        ) {
            if (
                scheduler.has(
                    timerName
                ) &&
                scheduler.resume(
                    timerName
                )
            ) {
                resumed +=
                    1;
            }
        }

        lifecyclePausedTimers.clear();

        return resumed;
    }

    async function pause() {
        if (
            state ===
            LIFECYCLE_STATES.PAUSED
        ) {
            return createStateSnapshot();
        }

        if (
            state !==
            LIFECYCLE_STATES.RUNNING
        ) {
            const error =
                new Error(
                    `TACTIC cannot pause while in state "${state}".`
                );

            errors?.report({
                code:
                    ERROR_CODES
                        .LIFECYCLE
                        .INVALID_TRANSITION,

                severity:
                    SEVERITY.ERROR,

                service:
                    "lifecycle",

                message:
                    error.message,

                error,

                recoverable:
                    true,
            });

            throw error;
        }

        setState(
            LIFECYCLE_STATES.PAUSING
        );

        emitStateEvent(
            EVENTS.LIFECYCLE.PAUSING
        );

        try {
            const pausedTimers =
                pauseSchedulerTimers();

            setState(
                LIFECYCLE_STATES.PAUSED
            );

            pausedAt =
                Date.now();

            health?.markDegraded(
                "framework:tactic",
                {
                    score:
                        85,

                    message:
                        "TACTIC is paused.",
                }
            );

            emitStateEvent(
                EVENTS.LIFECYCLE.PAUSED,
                {
                    pausedTimers,
                }
            );

            logger?.info(
                "TACTIC paused",
                {
                    pausedTimers,
                }
            );

            return createStateSnapshot();
        } catch (error) {
            setState(
                LIFECYCLE_STATES.ERROR,
                {
                    force: true,
                }
            );

            errors?.report({
                code:
                    ERROR_CODES
                        .LIFECYCLE
                        .INVALID_TRANSITION,

                severity:
                    SEVERITY.ERROR,

                service:
                    "lifecycle",

                message:
                    "TACTIC pause failed.",

                error,

                recoverable:
                    true,

                retryable:
                    true,
            });

            throw error;
        }
    }

    async function resume() {
        if (
            state ===
            LIFECYCLE_STATES.RUNNING
        ) {
            return createStateSnapshot();
        }

        if (
            state !==
            LIFECYCLE_STATES.PAUSED
        ) {
            const error =
                new Error(
                    `TACTIC cannot resume while in state "${state}".`
                );

            errors?.report({
                code:
                    ERROR_CODES
                        .LIFECYCLE
                        .INVALID_TRANSITION,

                severity:
                    SEVERITY.ERROR,

                service:
                    "lifecycle",

                message:
                    error.message,

                error,

                recoverable:
                    true,
            });

            throw error;
        }

        setState(
            LIFECYCLE_STATES.RESUMING
        );

        emitStateEvent(
            EVENTS.LIFECYCLE.RESUMING
        );

        try {
            const resumedTimers =
                resumeSchedulerTimers();

            setState(
                LIFECYCLE_STATES.RUNNING
            );

            pausedAt =
                null;

            health?.markHealthy(
                "framework:tactic",
                {
                    message:
                        "TACTIC resumed.",
                }
            );

            emitStateEvent(
                EVENTS.LIFECYCLE.RUNNING,
                {
                    resumedTimers,
                }
            );

            logger?.info(
                "TACTIC resumed",
                {
                    resumedTimers,
                }
            );

            return createStateSnapshot();
        } catch (error) {
            setState(
                LIFECYCLE_STATES.ERROR,
                {
                    force: true,
                }
            );

            errors?.report({
                code:
                    ERROR_CODES
                        .LIFECYCLE
                        .INVALID_TRANSITION,

                severity:
                    SEVERITY.ERROR,

                service:
                    "lifecycle",

                message:
                    "TACTIC resume failed.",

                error,

                recoverable:
                    true,

                retryable:
                    true,
            });

            throw error;
        }
    }

    async function stop(
        options = {}
    ) {
        if (
            state ===
            LIFECYCLE_STATES.STOPPED
        ) {
            return createStateSnapshot();
        }

        events?.emit(
            EVENTS.APP.STOPPING,
            {
                state,
            }
        );

        setState(
            LIFECYCLE_STATES.STOPPING,
            {
                force:
                    state ===
                    LIFECYCLE_STATES.ERROR,
            }
        );

        emitStateEvent(
            EVENTS.LIFECYCLE.STOPPING
        );

        try {
            TACTIC.services.drawer
                ?.setOpen(false);

            health?.stopMonitoring();

            const cancelledTimers =
                options.keepTimers ===
                true
                    ? 0
                    : scheduler
                      ?.cancelAll() ||
                      0;

            lifecyclePausedTimers.clear();

            TACTIC.initialized =
                false;

            stoppedAt =
                Date.now();

            pausedAt =
                null;

            setState(
                LIFECYCLE_STATES.STOPPED
            );

            health?.markDisabled(
                "framework:tactic",
                {
                    message:
                        "TACTIC is stopped.",
                }
            );

            emitStateEvent(
                EVENTS.LIFECYCLE.STOPPED,
                {
                    cancelledTimers,
                }
            );

            events?.emit(
                EVENTS.APP.STOPPED,
                {
                    cancelledTimers,
                }
            );

            logger?.info(
                "TACTIC stopped",
                {
                    cancelledTimers,
                }
            );

            return createStateSnapshot();
        } catch (error) {
            setState(
                LIFECYCLE_STATES.ERROR,
                {
                    force: true,
                }
            );

            errors?.report({
                code:
                    ERROR_CODES
                        .APP
                        .SHUTDOWN_FAILED,

                severity:
                    SEVERITY.ERROR,

                service:
                    "lifecycle",

                message:
                    "TACTIC shutdown failed.",

                error,

                recoverable:
                    true,

                retryable:
                    true,
            });

            emitStateEvent(
                EVENTS.LIFECYCLE.ERROR,
                {
                    error,
                }
            );

            throw error;
        }
    }

    async function restart() {
        emitStateEvent(
            EVENTS.LIFECYCLE.RESTARTING
        );

        logger?.info(
            "Restarting TACTIC"
        );

        if (
            state !==
            LIFECYCLE_STATES.STOPPED
        ) {
            await stop();
        }

        return start();
    }

    TACTIC.services.lifecycle = {
        initialize,
        start,
        pause,
        resume,
        stop,
        restart,

        getState,
        inspect,
        canTransition,

        states:
            LIFECYCLE_STATES,
    };

    TACTIC.start =
        start;

    TACTIC.pause =
        pause;

    TACTIC.resume =
        resume;

    TACTIC.stop =
        stop;

    TACTIC.restart =
        restart;

    health?.register({
        name:
            "service:lifecycle",

        type:
            health.types.SERVICE,

        status:
            HEALTH_STATES.STARTING,

        staleAfterMs:
            120_000,

        metadata: {
            serviceName:
                "lifecycle",
        },
    });

    logger?.info(
        "Lifecycle service loaded"
    );
})();