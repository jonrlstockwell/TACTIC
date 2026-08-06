/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * repositories/finance/index.js
 *
 * Purpose:
 * Provides a centralized, observable source of financial data
 * for TACTIC.
 *
 * Initial Scope:
 * - Wallet
 *
 * Planned Scope:
 * - Personal vault
 * - Faction bank
 * - City bank investments
 * - Stocks
 * - Bazaar
 * - Properties
 * - Company funds
 * - Net worth
 *
 * Responsibilities:
 * - Read and parse the player's wallet balance
 * - Watch the wallet for live changes
 * - Store current and previous wallet values
 * - Calculate wallet deltas
 * - Publish wallet data to shared State
 * - Notify subscribers when wallet data changes
 * - Emit finance-specific events
 * - Expose repository diagnostics and metrics
 *
 * Does NOT:
 * - Deposit or withdraw money
 * - Decide whether money should be moved
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
 * - finance.wallet
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Finance Repository] Namespace is unavailable."
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
            "[TACTIC Finance Repository] DOM service is unavailable."
        );

        return;
    }

    if (!sharedState) {
        console.error(
            "[TACTIC Finance Repository] State service is unavailable."
        );

        return;
    }

    if (
        !TACTIC.repositories ||
        typeof TACTIC.repositories !==
            "object"
    ) {
        TACTIC.repositories = {};
    }

    const REPOSITORY_NAME =
        "repository:finance";

    const WALLET_OBSERVER_NAME =
        "repository:finance:wallet";

    const OBSERVER_GROUP =
        "repository:finance";

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
                "finance.wallet",
        });

    const EVENT_NAMES =
        Object.freeze({
            WALLET_CHANGED:
                "finance:wallet-changed",
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

        walletIncreases:
            0,

        walletDecreases:
            0,

        walletNoChange:
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

        lastWalletIncreaseAt:
            null,

        lastWalletDecreaseAt:
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

                    walletPreviousValue:
                        repositoryState
                            .wallet
                            ?.previousValue ??
                        null,

                    walletDelta:
                        repositoryState
                            .wallet
                            ?.delta ??
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

        const numericText =
            normalizedRaw.replace(
                /[^0-9.-]/g,
                ""
            );

        if (
            !numericText ||
            numericText ===
                "-" ||
            numericText ===
                "." ||
            numericText ===
                "-."
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
        previousWallet =
            null,
    }) {
        const normalizedValue =
            Number.isFinite(
                value
            )
                ? value
                : null;

        const previousValue =
            Number.isFinite(
                previousWallet
                    ?.value
            )
                ? previousWallet.value
                : null;

        const delta =
            normalizedValue !==
                null &&
            previousValue !==
                null
                ? normalizedValue -
                  previousValue
                : 0;

        let direction =
            "unchanged";

        if (delta > 0) {
            direction =
                "increase";
        } else if (delta < 0) {
            direction =
                "decrease";
        }

        return {
            type:
                DATA_KEYS.WALLET,

            raw:
                normalizeRawWallet(
                    raw
                ),

            value:
                normalizedValue,

            previousValue,

            delta,

            absoluteDelta:
                Math.abs(
                    delta
                ),

            direction,

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

            changedAt:
                delta !== 0
                    ? Date.now()
                    : previousWallet
                          ?.changedAt ??
                      null,

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

            previousWallet:
                repositoryState
                    .wallet,
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
                "finance-repository",

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
                            "repository:finance",

                        force:
                            options.force ===
                            true,

                        metadata: {
                            repository:
                                "finance",

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

                            previousValue:
                                wallet
                                    ?.previousValue ??
                                null,

                            delta:
                                wallet
                                    ?.delta ??
                                null,

                            direction:
                                wallet
                                    ?.direction ??
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
                    "Finance Repository could not publish the wallet to shared State.",

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
                    "Verify that the State service is loaded before the Finance Repository.",
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
                        `Finance Repository subscriber for "${dataKey}" failed.`,

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
        events?.emit(
            EVENT_NAMES.WALLET_CHANGED,
            {
                wallet:
                    cloneValue(
                        wallet
                    ),

                previousWallet:
                    cloneValue(
                        previousWallet
                    ),

                value:
                    wallet
                        ?.value ??
                    null,

                previousValue:
                    wallet
                        ?.previousValue ??
                    null,

                delta:
                    wallet
                        ?.delta ??
                    0,

                direction:
                    wallet
                        ?.direction ??
                    "unchanged",

                reason,

                repository:
                    "finance",

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
            metrics.walletNoChange +=
                1;

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

        if (
            wallet.delta > 0
        ) {
            metrics.walletIncreases +=
                1;

            metrics.lastWalletIncreaseAt =
                Date.now();
        } else if (
            wallet.delta < 0
        ) {
            metrics.walletDecreases +=
                1;

            metrics.lastWalletDecreaseAt =
                Date.now();
        }

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

                walletPreviousValue:
                    wallet.previousValue,

                walletDelta:
                    wallet.delta,

                walletDirection:
                    wallet.direction,

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
                    "Finance Repository could not parse the wallet value.",

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

                previousWallet:
                    repositoryState
                        .wallet,
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

            previousWallet:
                repositoryState
                    .wallet,
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
                dataKey ||
                ""
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
                `Unsupported Finance Repository data key: ${String(dataKey)}`
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
                "Finance Repository subscriber must be a function."
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
                        `Initial Finance Repository subscriber callback for "${normalizedKey}" failed.`,

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

                            previousWallet:
                                repositoryState
                                    .wallet,
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
                            "finance",

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
                    "Finance Repository could not start the wallet watcher.",

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
                    "Finance Repository is starting.",

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
            health?.markDegraded(
                REPOSITORY_NAME,
                {
                    score:
                        80,

                    message:
                        "Finance Repository started without an active wallet watcher.",

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
                        "Finance Repository is active.",

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
            "Finance Repository started",
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
                    "Finance Repository is stopped.",

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
            "Finance Repository stopped"
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
                "finance",

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

            events: {
                ...EVENT_NAMES,
            },
        };
    }

    const financeRepository =
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

            events:
                EVENT_NAMES,
        });

    TACTIC.repositories.finance =
        financeRepository;

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
                "finance",

            dataKeys: [
                DATA_KEYS.WALLET,
            ],

            stateKeys: [
                STATE_KEYS.WALLET,
            ],

            eventNames: [
                EVENT_NAMES
                    .WALLET_CHANGED,
            ],

            requiresHeartbeat:
                false,

            started:
                false,
        },
    });

    start().catch(
        error => {
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
                    "Finance Repository startup failed.",

                error,

                recoverable:
                    true,

                retryable:
                    true,

                recovery:
                    "Retry Finance Repository startup after Torn finishes loading.",
            });
        }
    );

    logger?.info(
        "Finance Repository loaded",
        {
            stateKey:
                STATE_KEYS.WALLET,

            eventName:
                EVENT_NAMES
                    .WALLET_CHANGED,
        }
    );
})();