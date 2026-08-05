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
 * - Publish the latest wallet snapshot to shared State
 * - Watch the wallet for live changes
 * - Notify repository subscribers when wallet data changes
 * - Expose repository diagnostics and metrics
 * - Integrate with State, Health, Events, Logger, and Errors
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
 * Shared State:
 * - user.wallet
 *
 * Dependencies:
 * - services/dom/index.js
 * - services/dom/selectors.js
 * - services/state/index.js
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
        state:
            sharedState,
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

    if (!sharedState) {
        console.error(
            "[TACTIC User Repository] State service is unavailable."
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

    const STATE_KEYS =
        Object.freeze({
            WALLET:
                "user.wallet",
        });

    const subscribers =
        new Map([
            [
                DATA_KEYS.WALLET,
                new Set(),
            ],
        ]);

    const repositoryState = {
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

        statePublishes:
            0,

        statePublishChanges:
            0,

        statePublishNoChanges:
            0,

        statePublishFailures:
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

        lastStatePublishAt:
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
                        repositoryState
                            .started,

                    walletAvailable:
                        repositoryState
                            .wallet
                            ?.available ===
                        true,

                    walletValue:
                        repositoryState
                            .wallet
                            ?.value ??
                        null,

                    walletSubscriberCount:
                        subscribers
                            .get(
                                DATA_KEYS.WALLET
                            )
                            ?.size ||
                        0,

                    stateKey:
                        STATE_KEYS.WALLET,

                    statePublished:
                        sharedState.has(
                            STATE_KEYS.WALLET
                        ),

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

    function publishWalletState(
        wallet,
        reason,
        options = {}
    ) {
        metrics.statePublishes +=
            1;

        metrics.lastStatePublishAt =
            Date.now();

        try {
            const result =
                sharedState.set(
                    STATE_KEYS.WALLET,
                    wallet,
                    {
                        source:
                            "repository:user",

                        force:
                            options.force ===
                            true,

                        metadata: {
                            repository:
                                "user",

                            dataKey:
                                DATA_KEYS.WALLET,

                            reason,

                            available:
                                wallet
                                    ?.available ===
                                true,

                            value:
                                wallet
                                    ?.value ??
                                null,
                        },
                    }
                );

            if (
                result.changed ===
                true
            ) {
                metrics
                    .statePublishChanges +=
                    1;
            } else {
                metrics
                    .statePublishNoChanges +=
                    1;
            }

            return result;
        } catch (error) {
            metrics
                .statePublishFailures +=
                1;

            reportRepositoryError({
                code:
                    ERROR_CODES
                        .GENERAL
                        .INTERNAL,

                severity:
                    SEVERITY.ERROR,

                message:
                    "User Repository could not publish the wallet to shared State.",

                details: {
                    stateKey:
                        STATE_KEYS.WALLET,

                    reason,

                    wallet:
                        cloneValue(
                            wallet
                        ),
                },

                error,

                recoverable:
                    true,

                retryable:
                    true,

                recovery:
                    "Verify that the State service is loaded before the User Repository.",
            });

            return {
                changed:
                    false,

                failed:
                    true,

                error: {
                    name:
                        error?.name ||
                        "Error",

                    message:
                        error?.message ||
                        String(error),
                },
            };
        }
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

                stateKey:
                    STATE_KEYS.WALLET,

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
            repositoryState.wallet;

        const changed =
            !walletSnapshotsEqual(
                previousWallet,
                wallet
            );

        repositoryState.wallet =
            wallet;

        /*
         * Publish the latest repository snapshot to shared State
         * even when repository subscribers do not need another
         * notification.
         *
         * State suppresses equal values unless force is requested.
         */
        const stateResult =
            publishWalletState(
                wallet,
                reason,
                {
                    force:
                        options.forceStateNotify ===
                        true,
                }
            );

        if (
            !changed &&
            options.forceNotify !==
                true
        ) {
            recordActivity(
                "wallet-unchanged",
                {
                    reason,

                    stateChanged:
                        stateResult.changed ===
                        true,
                }
            );

            return {
                changed:
                    false,

                stateChanged:
                    stateResult.changed ===
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

                stateChanged:
                    stateResult.changed ===
                    true,
            }
        );

        return {
            changed:
                true,

            stateChanged:
                stateResult.changed ===
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
            repositoryState.wallet ===
                null
        ) {
            refreshWallet(
                options.reason ||
                "get-wallet"
            );
        }

        return cloneValue(
            repositoryState.wallet
        );
    }

    function refreshWallet(
        reason =
            "manual-refresh",
        options = {}
    ) {
        metrics.walletRefreshes +=
            1;

        const wallet =
            readWalletFromDom(
                reason
            );

        updateWalletState(
            wallet,
            reason,
            options
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

                        stateKey:
                            STATE_KEYS.WALLET,
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
        if (
            repositoryState.started
        ) {
            return inspect();
        }

        repositoryState.started =
            true;

        repositoryState.startedAt =
            Date.now();

        repositoryState.stoppedAt =
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

                    stateKey:
                        STATE_KEYS.WALLET,
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

                        stateKey:
                            STATE_KEYS.WALLET,
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

                        stateKey:
                            STATE_KEYS.WALLET,
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

                stateKey:
                    STATE_KEYS.WALLET,
            }
        );

        return inspect();
    }

    function stop() {
        if (
            !repositoryState.started
        ) {
            return false;
        }

        dom.disconnectGroup(
            OBSERVER_GROUP
        );

        repositoryState.started =
            false;

        repositoryState.stoppedAt =
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

                    stateKey:
                        STATE_KEYS.WALLET,
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
        return repositoryState
            .started;
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
                repositoryState
                    .started,

            startedAt:
                repositoryState
                    .startedAt,

            stoppedAt:
                repositoryState
                    .stoppedAt,

            uptimeMs:
                repositoryState
                    .startedAt ===
                    null ||
                !repositoryState
                    .started
                    ? 0
                    : Date.now() -
                      repositoryState
                          .startedAt,

            wallet:
                cloneValue(
                    repositoryState
                        .wallet
                ),

            sharedState: {
                key:
                    STATE_KEYS.WALLET,

                published:
                    sharedState.has(
                        STATE_KEYS.WALLET
                    ),

                value:
                    sharedState.get(
                        STATE_KEYS.WALLET,
                        null
                    ),

                revision:
                    sharedState
                        .getRevision(
                            STATE_KEYS.WALLET
                        ),
            },

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

            stateKeys: {
                ...STATE_KEYS,
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

            stateKeys:
                STATE_KEYS,
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

            stateKeys: [
                STATE_KEYS.WALLET,
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
        "User Repository loaded",
        {
            stateKey:
                STATE_KEYS.WALLET,
        }
    );
})();