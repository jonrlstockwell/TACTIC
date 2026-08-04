/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * repositories/user/index.js
 *
 * Purpose:
 * Provides a centralized source of clean, observable user data
 * derived from Torn's interface.
 *
 * Responsibilities:
 * - Read and parse the player's wallet balance
 * - Maintain the latest wallet snapshot
 * - Watch the wallet for live changes
 * - Notify subscribers when wallet data changes
 * - Expose repository diagnostics and metrics
 * - Integrate with Health, Events, Logger, and Errors
 *
 * Does NOT:
 * - Deposit or withdraw money
 * - Decide whether wallet changes are safe
 * - Contain Protection business rules
 * - Render user-facing interfaces
 * - Guess unverified Torn selectors
 *
 * Public API:
 * - getWallet()
 * - refreshWallet()
 * - subscribe()
 * - unsubscribe()
 * - start()
 * - stop()
 * - isStarted()
 * - inspect()
 *
 * Dependencies:
 * - services/dom/index.js
 * - services/dom/selectors.js
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
            "[TACTIC User Repository] Namespace is unavailable."
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
        ERROR_CODES,
        SEVERITY,
        HEALTH_STATES,
    } = constants;

    if (!dom) {
        console.error(
            "[TACTIC User Repository] DOM service is unavailable."
        );

        return;
    }

    /*
     * Ensure the repository namespace exists.
     *
     * This remains compatible whether repositories were already
     * created by namespace.js or this is the first repository.
     */
    if (
        !TACTIC.repositories ||
        typeof TACTIC.repositories !==
            "object"
    ) {
        TACTIC.repositories = {};
    }

    const REPOSITORY_NAME =
        "repository:user";

    const WALLET_OBSERVER_NAME =
        "repository:user:wallet";

    const OBSERVER_GROUP =
        "repository:user";

    const WALLET_SELECTOR_PATH =
        "USER.WALLET";

    const DATA_KEYS =
        Object.freeze({
            WALLET:
                "wallet",
        });

    const subscribers =
        new Map([
            [
                DATA_KEYS.WALLET,
                new Set(),
            ],
        ]);

    const state = {
        started:
            false,

        startedAt:
            null,

        stoppedAt:
            null,

        wallet:
            null,
    };

    const metrics = {
        createdAt:
            Date.now(),

        startCount:
            0,

        stopCount:
            0,

        walletReads:
            0,

        walletRefreshes:
            0,

        walletChanges:
            0,

        subscriptionCount:
            0,

        unsubscriptionCount:
            0,

        subscriberNotifications:
            0,

        subscriberErrors:
            0,

        parseFailures:
            0,

        unavailableReads:
            0,

        lastActivityAt:
            Date.now(),

        lastWalletReadAt:
            null,

        lastWalletChangeAt:
            null,

        lastErrorAt:
            null,
    };

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
                return {
                    ...value,
                };
            }
        }

        return value;
    }

    function recordActivity(
        operation,
        metadata = {}
    ) {
        metrics.lastActivityAt =
            Date.now();

        health?.heartbeat(
            REPOSITORY_NAME,
            {
                metadata: {
                    lastOperation:
                        operation,

                    started:
                        state.started,

                    walletAvailable:
                        state.wallet
                            ?.available ===
                        true,

                    walletValue:
                        state.wallet
                            ?.value ??
                        null,

                    walletSubscriberCount:
                        subscribers
                            .get(
                                DATA_KEYS.WALLET
                            )
                            ?.size ||
                        0,

                    ...metadata,
                },
            }
        );
    }

    function getWalletSelector() {
        const selector =
            dom.getSelector?.(
                WALLET_SELECTOR_PATH
            );

        if (
            typeof selector ===
                "string" &&
            selector.trim()
        ) {
            return selector;
        }

        /*
         * Verified fallback. The selector catalog remains the
         * preferred source of truth.
         */
        return "#user-money";
    }

    function normalizeRawWallet(
        rawValue
    ) {
        return String(
            rawValue ?? ""
        ).trim();
    }

    function parseWalletValue(
        rawValue
    ) {
        const normalizedRaw =
            normalizeRawWallet(
                rawValue
            );

        if (!normalizedRaw) {
            return null;
        }

        /*
         * Keep digits, decimal separators, and a possible minus
         * sign. Torn wallet values are normally whole dollars,
         * but this parser remains tolerant of formatting.
         */
        const numericText =
            normalizedRaw.replace(
                /[^0-9.-]/g,
                ""
            );

        if (
            !numericText ||
            numericText === "-" ||
            numericText === "." ||
            numericText === "-."
        ) {
            return null;
        }

        const value =
            Number(
                numericText
            );

        if (
            !Number.isFinite(
                value
            )
        ) {
            return null;
        }

        return value;
    }

    function createWalletSnapshot({
        raw,
        value,
        available,
        source,
        elementFound,
    }) {
        return {
            type:
                DATA_KEYS.WALLET,

            raw:
                normalizeRawWallet(
                    raw
                ),

            value:
                Number.isFinite(
                    value
                )
                    ? value
                    : null,

            available:
                available ===
                true,

            source:
                String(
                    source ||
                    "unknown"
                ),

            selector:
                getWalletSelector(),

            elementFound:
                elementFound ===
                true,

            updatedAt:
                Date.now(),
        };
    }

    function walletSnapshotsEqual(
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
            first.value ===
                second.value &&
            first.raw ===
                second.raw &&
            first.available ===
                second.available &&
            first.elementFound ===
                second.elementFound
        );
    }

    function createUnavailableWallet(
        source
    ) {
        return createWalletSnapshot({
            raw:
                "",

            value:
                null,

            available:
                false,

            source,

            elementFound:
                false,
        });
    }

    function reportRepositoryError({
        code,
        message,
        details = {},
        error = null,
        severity =
            SEVERITY.WARNING,
        recoverable = true,
        retryable = true,
        recovery = null,
    }) {
        metrics.lastErrorAt =
            Date.now();

        errors?.report({
            code,

            severity,

            service:
                "user-repository",

            message,

            details,

            error,

            recoverable,

            retryable,

            recovery,
        });
    }

    function notifySubscribers(
        dataKey,
        value,
        previousValue,
        reason
    ) {
        const targetSubscribers =
            subscribers.get(
                dataKey
            );

        if (
            !targetSubscribers ||
            targetSubscribers.size ===
                0
        ) {
            return 0;
        }

        const payload = {
            key:
                dataKey,

            value:
                cloneValue(
                    value
                ),

            previousValue:
                cloneValue(
                    previousValue
                ),

            reason,

            timestamp:
                Date.now(),
        };

        let notified =
            0;

        for (
            const callback of
            targetSubscribers
        ) {
            try {
                callback(
                    cloneValue(
                        payload
                    )
                );

                notified +=
                    1;

                metrics
                    .subscriberNotifications +=
                    1;
            } catch (error) {
                metrics.subscriberErrors +=
                    1;

                reportRepositoryError({
                    code:
                        ERROR_CODES
                            .GENERAL
                            .INTERNAL,

                    severity:
                        SEVERITY.ERROR,

                    message:
                        `User Repository subscriber for "${dataKey}" failed.`,

                    details: {
                        dataKey,

                        reason,
                    },

                    error,

                    recoverable:
                        true,

                    retryable:
                        false,

                    recovery:
                        "Correct or remove the failing subscriber callback.",
                });
            }
        }

        return notified;
    }

    function emitWalletChanged(
        wallet,
        previousWallet,
        reason
    ) {
        const eventName =
            TACTIC.EVENTS
                ?.DOM
                ?.WALLET_CHANGED ||
            "dom:wallet-changed";

        events?.emit(
            eventName,
            {
                wallet:
                    cloneValue(
                        wallet
                    ),

                previousWallet:
                    cloneValue(
                        previousWallet
                    ),

                reason,

                repository:
                    "user",

                timestamp:
                    Date.now(),
            }
        );
    }

    function updateWalletState(
        wallet,
        reason,
        options = {}
    ) {
        const previousWallet =
            state.wallet;

        const changed =
            !walletSnapshotsEqual(
                previousWallet,
                wallet
            );

        state.wallet =
            wallet;

        if (
            !changed &&
            options.forceNotify !==
                true
        ) {
            recordActivity(
                "wallet-unchanged",
                {
                    reason,
                }
            );

            return {
                changed:
                    false,

                wallet:
                    cloneValue(
                        wallet
                    ),

                previousWallet:
                    cloneValue(
                        previousWallet
                    ),
            };
        }

        metrics.walletChanges +=
            1;

        metrics.lastWalletChangeAt =
            Date.now();

        notifySubscribers(
            DATA_KEYS.WALLET,
            wallet,
            previousWallet,
            reason
        );

        emitWalletChanged(
            wallet,
            previousWallet,
            reason
        );

        recordActivity(
            "wallet-changed",
            {
                reason,

                walletValue:
                    wallet.value,
            }
        );

        return {
            changed:
                true,

            wallet:
                cloneValue(
                    wallet
                ),

            previousWallet:
                cloneValue(
                    previousWallet
                ),
        };
    }

    function readWalletFromDom(
        source =
            "dom-read"
    ) {
        metrics.walletReads +=
            1;

        metrics.lastWalletReadAt =
            Date.now();

        const selector =
            getWalletSelector();

        const element =
            dom.find(
                selector
            );

        if (!element) {
            metrics.unavailableReads +=
                1;

            const unavailable =
                createUnavailableWallet(
                    source
                );

            recordActivity(
                "wallet-unavailable",
                {
                    selector,
                }
            );

            return unavailable;
        }

        const raw =
            String(
                element.textContent ??
                ""
            ).trim();

        const value =
            parseWalletValue(
                raw
            );

        if (
            !Number.isFinite(
                value
            )
        ) {
            metrics.parseFailures +=
                1;

            reportRepositoryError({
                code:
                    ERROR_CODES
                        .DOM
                        .PARSE_FAILED,

                message:
                    "User Repository could not parse the wallet value.",

                details: {
                    selector,
                    raw,
                },

                recoverable:
                    true,

                retryable:
                    true,

                recovery:
                    "Wait for Torn to render a valid wallet value or update the wallet parser.",
            });

            return createWalletSnapshot({
                raw,

                value:
                    null,

                available:
                    false,

                source,

                elementFound:
                    true,
            });
        }

        return createWalletSnapshot({
            raw,

            value,

            available:
                true,

            source,

            elementFound:
                true,
        });
    }

    function getWallet(
        options = {}
    ) {
        if (
            options.refresh ===
            true ||
            state.wallet ===
                null
        ) {
            refreshWallet(
                options.reason ||
                "get-wallet"
            );
        }

        return cloneValue(
            state.wallet
        );
    }

    function refreshWallet(
        reason =
            "manual-refresh"
    ) {
        metrics.walletRefreshes +=
            1;

        const wallet =
            readWalletFromDom(
                reason
            );

        updateWalletState(
            wallet,
            reason
        );

        return cloneValue(
            wallet
        );
    }

    function validateDataKey(
        dataKey
    ) {
        const normalized =
            String(
                dataKey || ""
            )
                .trim()
                .toLowerCase();

        if (
            !Object.values(
                DATA_KEYS
            ).includes(
                normalized
            )
        ) {
            throw new Error(
                `Unsupported User Repository data key: ${String(dataKey)}`
            );
        }

        return normalized;
    }

    function subscribe(
        dataKey,
        callback,
        options = {}
    ) {
        const normalizedKey =
            validateDataKey(
                dataKey
            );

        if (
            typeof callback !==
            "function"
        ) {
            throw new TypeError(
                "User Repository subscriber must be a function."
            );
        }

        const targetSubscribers =
            subscribers.get(
                normalizedKey
            );

        targetSubscribers.add(
            callback
        );

        metrics.subscriptionCount +=
            1;

        recordActivity(
            "subscribe",
            {
                dataKey:
                    normalizedKey,

                subscriberCount:
                    targetSubscribers.size,
            }
        );

        if (
            options.emitInitial ===
            true
        ) {
            const value =
                normalizedKey ===
                DATA_KEYS.WALLET
                    ? getWallet({
                          refresh:
                              options.refresh ===
                              true,

                          reason:
                              "subscription-initial",
                      })
                    : null;

            try {
                callback({
                    key:
                        normalizedKey,

                    value:
                        cloneValue(
                            value
                        ),

                    previousValue:
                        null,

                    reason:
                        "subscription-initial",

                    initial:
                        true,

                    timestamp:
                        Date.now(),
                });
            } catch (error) {
                metrics.subscriberErrors +=
                    1;

                reportRepositoryError({
                    code:
                        ERROR_CODES
                            .GENERAL
                            .INTERNAL,

                    severity:
                        SEVERITY.ERROR,

                    message:
                        `Initial User Repository subscriber callback for "${normalizedKey}" failed.`,

                    details: {
                        dataKey:
                            normalizedKey,
                    },

                    error,

                    recoverable:
                        true,

                    retryable:
                        false,

                    recovery:
                        "Correct or remove the failing subscriber callback.",
                });
            }
        }

        /*
         * Return a convenient unsubscribe function.
         */
        return () =>
            unsubscribe(
                normalizedKey,
                callback
            );
    }

    function unsubscribe(
        dataKey,
        callback
    ) {
        const normalizedKey =
            validateDataKey(
                dataKey
            );

        const targetSubscribers =
            subscribers.get(
                normalizedKey
            );

        if (
            !targetSubscribers ||
            !targetSubscribers.has(
                callback
            )
        ) {
            return false;
        }

        const removed =
            targetSubscribers.delete(
                callback
            );

        if (removed) {
            metrics.unsubscriptionCount +=
                1;

            recordActivity(
                "unsubscribe",
                {
                    dataKey:
                        normalizedKey,

                    subscriberCount:
                        targetSubscribers.size,
                }
            );
        }

        return removed;
    }

    async function startWalletWatcher() {
        const selector =
            getWalletSelector();

        /*
         * The wallet may not be immediately available while Torn
         * starts. A timeout should not crash the repository.
         */
        try {
            await dom.watchValue(
                WALLET_OBSERVER_NAME,
                selector,
                parseWalletValue,
                ({
                    rawValue,
                    value,
                    initial,
                }) => {
                    const wallet =
                        createWalletSnapshot({
                            raw:
                                rawValue,

                            value,

                            available:
                                Number.isFinite(
                                    value
                                ),

                            source:
                                initial
                                    ? "watcher-initial"
                                    : "watcher-change",

                            elementFound:
                                true,
                        });

                    updateWalletState(
                        wallet,
                        initial
                            ? "watcher-initial"
                            : "watcher-change"
                    );
                },
                {
                    group:
                        OBSERVER_GROUP,

                    emitInitial:
                        true,

                    waitForElement:
                        true,

                    timeoutMs:
                        15_000,

                    rejectOnTimeout:
                        false,

                    emitMutationEvent:
                        false,

                    metadata: {
                        repository:
                            "user",

                        dataKey:
                            DATA_KEYS.WALLET,
                    },
                }
            );

            return dom.hasObserver(
                WALLET_OBSERVER_NAME
            );
        } catch (error) {
            reportRepositoryError({
                code:
                    ERROR_CODES
                        .DOM
                        .OBSERVER_FAILED,

                message:
                    "User Repository could not start the wallet watcher.",

                details: {
                    observerName:
                        WALLET_OBSERVER_NAME,

                    selector,
                },

                error,

                recoverable:
                    true,

                retryable:
                    true,

                recovery:
                    "Retry after Torn finishes loading the wallet display.",
            });

            return false;
        }
    }

    async function start() {
        if (state.started) {
            return inspect();
        }

        state.started =
            true;

        state.startedAt =
            Date.now();

        state.stoppedAt =
            null;

        metrics.startCount +=
            1;

        health?.markHealthy(
            REPOSITORY_NAME,
            {
                message:
                    "User Repository is starting.",

                metadata: {
                    started:
                        true,
                },
            }
        );

        const watcherStarted =
            await startWalletWatcher();

        if (!watcherStarted) {
            /*
             * A missing wallet can be temporary during page load.
             * Keep the repository active but visibly degraded.
             */
            health?.markDegraded(
                REPOSITORY_NAME,
                {
                    score:
                        80,

                    message:
                        "User Repository started without an active wallet watcher.",

                    metadata: {
                        started:
                            true,

                        walletWatcherActive:
                            false,
                    },
                }
            );
        } else {
            health?.markHealthy(
                REPOSITORY_NAME,
                {
                    message:
                        "User Repository is active.",

                    metadata: {
                        started:
                            true,

                        walletWatcherActive:
                            true,
                    },
                }
            );
        }

        recordActivity(
            "start",
            {
                walletWatcherActive:
                    watcherStarted,
            }
        );

        logger?.info(
            "User Repository started",
            {
                walletWatcherActive:
                    watcherStarted,
            }
        );

        return inspect();
    }

    function stop() {
        if (!state.started) {
            return false;
        }

        dom.disconnectGroup(
            OBSERVER_GROUP
        );

        state.started =
            false;

        state.stoppedAt =
            Date.now();

        metrics.stopCount +=
            1;

        health?.markDisabled(
            REPOSITORY_NAME,
            {
                message:
                    "User Repository is stopped.",

                metadata: {
                    started:
                        false,

                    walletWatcherActive:
                        false,
                },
            }
        );

        recordActivity(
            "stop"
        );

        logger?.info(
            "User Repository stopped"
        );

        return true;
    }

    function isStarted() {
        return state.started;
    }

    function inspect() {
        const walletSubscribers =
            subscribers.get(
                DATA_KEYS.WALLET
            )?.size ||
            0;

        return {
            repository:
                "user",

            started:
                state.started,

            startedAt:
                state.startedAt,

            stoppedAt:
                state.stoppedAt,

            uptimeMs:
                state.startedAt ===
                    null ||
                !state.started
                    ? 0
                    : Date.now() -
                      state.startedAt,

            wallet:
                cloneValue(
                    state.wallet
                ),

            walletWatcher: {
                name:
                    WALLET_OBSERVER_NAME,

                active:
                    dom.hasObserver(
                        WALLET_OBSERVER_NAME
                    ),

                selector:
                    getWalletSelector(),
            },

            subscribers: {
                wallet:
                    walletSubscribers,

                total:
                    walletSubscribers,
            },

            metrics: {
                ...metrics,
            },

            dataKeys: {
                ...DATA_KEYS,
            },
        };
    }

    const userRepository =
        Object.freeze({
            getWallet,
            refreshWallet,

            subscribe,
            unsubscribe,

            start,
            stop,
            isStarted,

            inspect,

            keys:
                DATA_KEYS,
        });

    TACTIC.repositories.user =
        userRepository;

    health?.register({
        name:
            REPOSITORY_NAME,

        type:
            health.types.REPOSITORY,

        status:
            HEALTH_STATES.STARTING,

        staleAfterMs:
            300_000,

        metadata: {
            repositoryName:
                "user",

            dataKeys: [
                DATA_KEYS.WALLET,
            ],

            requiresHeartbeat:
                false,

            started:
                false,
        },
    });

    /*
     * Start automatically after repository registration.
     *
     * start() handles delayed wallet rendering without blocking
     * the rest of TACTIC startup.
     */
    start().catch(
        (error) => {
            health?.markFailed(
                REPOSITORY_NAME,
                {
                    status:
                        HEALTH_STATES
                            .UNHEALTHY,

                    score:
                        25,

                    message:
                        error.message,

                    error,
                }
            );

            reportRepositoryError({
                code:
                    ERROR_CODES
                        .GENERAL
                        .INTERNAL,

                severity:
                    SEVERITY.ERROR,

                message:
                    "User Repository startup failed.",

                error,

                recoverable:
                    true,

                retryable:
                    true,

                recovery:
                    "Retry User Repository startup after Torn finishes loading.",
            });
        }
    );

    logger?.info(
        "User Repository loaded"
    );
})();