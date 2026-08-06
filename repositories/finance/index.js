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
 * Provides TACTIC's centralized source of observable financial
 * data.
 *
 * Current Domains:
 * - Wallet
 * - Investment Bank
 *
 * Responsibilities:
 * - Observe and publish the player's wallet
 * - Read Investment Bank data through its registered DOM helper
 * - Publish normalized financial state
 * - Calculate live Investment Bank comparisons
 * - Generate strategy-based investment recommendations
 * - Notify subscribers when financial data changes
 * - Expose repository diagnostics
 *
 * Does NOT:
 * - Submit deposits
 * - Start or withdraw investments
 * - Click financial controls
 * - Render user interfaces
 *
 * Public API:
 * - getWallet()
 * - refreshWallet()
 * - getInvestmentBank()
 * - refreshInvestmentBank()
 * - setInvestmentStrategy()
 * - getInvestmentStrategy()
 * - subscribe()
 * - unsubscribe()
 * - start()
 * - stop()
 * - isStarted()
 * - inspect()
 *
 * Shared State:
 * - finance.wallet
 * - finance.investmentBank
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

    const services =
        TACTIC.services || {};

    const dom =
        services.dom;

    const sharedState =
        services.state;

    const events =
        services.events;

    const logger =
        services.logger;

    const health =
        services.health;

    const financeEngine =
        services.finance;

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

    if (!financeEngine) {
        console.error(
            "[TACTIC Finance Repository] Finance Engine is unavailable."
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

    const WALLET_OBSERVER_GROUP =
        "repository:finance:wallet";

    const BANK_OBSERVER_GROUP =
        "repository:finance:investment-bank";

    const BANK_HELPER_ID =
        "investment-bank";

    const WALLET_SELECTOR_PATH =
        "USER.WALLET";

    const DEFAULT_STRATEGY =
        financeEngine.strategies
            ?.MAXIMUM_RETURN ||
        "maximum-return";

    const BANK_REFRESH_DEBOUNCE_MS =
        350;

    const DATA_KEYS =
        Object.freeze({
            WALLET:
                "wallet",

            INVESTMENT_BANK:
                "investmentBank",
        });

    const STATE_KEYS =
        Object.freeze({
            WALLET:
                "finance.wallet",

            INVESTMENT_BANK:
                "finance.investmentBank",
        });

    const EVENT_NAMES =
        Object.freeze({
            WALLET_CHANGED:
                "finance:wallet-changed",

            INVESTMENT_BANK_CHANGED:
                "finance:investment-bank-changed",

            INVESTMENT_STRATEGY_CHANGED:
                "finance:investment-strategy-changed",
        });

    const subscribers =
        new Map([
            [
                DATA_KEYS.WALLET,
                new Set(),
            ],
            [
                DATA_KEYS.INVESTMENT_BANK,
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

        investmentBank:
            null,

        investmentStrategy:
            DEFAULT_STRATEGY,
    };

    const metrics = {
        loadedAt:
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

        walletNoChanges:
            0,

        bankReads:
            0,

        bankRefreshes:
            0,

        bankChanges:
            0,

        bankNoChanges:
            0,

        bankUnavailableReads:
            0,

        bankRecommendationCalculations:
            0,

        bankRecommendationFailures:
            0,

        strategyChanges:
            0,

        statePublishes:
            0,

        statePublishFailures:
            0,

        subscriberNotifications:
            0,

        subscriberErrors:
            0,

        lastWalletReadAt:
            null,

        lastWalletChangeAt:
            null,

        lastBankReadAt:
            null,

        lastBankChangeAt:
            null,

        lastRecommendationAt:
            null,

        lastStrategyChangeAt:
            null,

        lastActivityAt:
            Date.now(),

        lastError:
            null,
    };

    let bankMutationObserver =
        null;

    let bankRefreshTimerId =
        null;

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

    function createErrorSnapshot(
        error
    ) {
        if (!error) {
            return null;
        }

        return {
            name:
                error?.name ||
                "Error",

            message:
                error?.message ||
                String(error),

            stack:
                error?.stack ||
                null,

            timestamp:
                Date.now(),
        };
    }

    function recordActivity(
        operation,
        metadata = {}
    ) {
        metrics.lastActivityAt =
            Date.now();

        health?.heartbeat?.(
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

                    investmentBankAvailable:
                        repositoryState
                            .investmentBank
                            ?.available ===
                        true,

                    investmentStrategy:
                        repositoryState
                            .investmentStrategy,

                    ...metadata,
                },
            }
        );
    }

    function normalizeText(
        value
    ) {
        return String(
            value ?? ""
        ).trim();
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

    function parseWalletValue(
        rawValue
    ) {
        const normalizedRaw =
            normalizeText(
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

        return Number.isFinite(
            value
        )
            ? value
            : null;
    }

    function createWalletSnapshot({
        raw,
        value,
        source,
        elementFound,
    }) {
        const previousWallet =
            repositoryState.wallet;

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
                normalizeText(
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
                normalizedValue !==
                null,

            source:
                source ||
                "unknown",

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
            first.available ===
                second.available &&
            first.elementFound ===
                second.elementFound
        );
    }

    function getBankHelper() {
        return (
            dom.pages
                ?.getHelper?.(
                    BANK_HELPER_ID
                ) ||
            null
        );
    }

    function normalizeBankOption(
        option
    ) {
        if (!option) {
            return null;
        }

        return {
            id:
                option.id,

            label:
                option.label,

            days:
                option.days,

            profitPercent:
                option.profitPercent,

            aprPercent:
                option.aprPercent,

            selected:
                option.selected ===
                true,

            verified:
                option.verified ===
                true,

            profitRateVerified:
                option.verified ===
                true,

            aprVerified:
                option.aprVerified ===
                true,

            source:
                option.source ||
                "investment-bank-helper",
        };
    }

    function calculateBankAnalysis(
        helperSnapshot
    ) {
        const walletValue =
            Number.isFinite(
                repositoryState
                    .wallet
                    ?.value
            )
                ? repositoryState
                      .wallet
                      .value
                : 0;

        const options =
            (
                helperSnapshot
                    ?.options ||
                []
            )
                .map(
                    normalizeBankOption
                )
                .filter(
                    option =>
                        option &&
                        Number.isFinite(
                            option.days
                        ) &&
                        Number.isFinite(
                            option.profitPercent
                        )
                );

        const activeInvestment =
            helperSnapshot
                ?.currentInvestment ||
            null;

        /*
         * When an investment is active, the original principal
         * and historical rate are not verified by the page.
         *
         * Recommendation calculations therefore use:
         * - Current wallet when no investment is active
         * - A reconstructed principal only when a usable current
         *   term rate is available, clearly marked estimated
         */
        let comparisonPrincipal =
            walletValue;

        let principalSource =
            "wallet";

        let principalEstimated =
            false;

        let activeEstimate =
            null;

        if (
            activeInvestment
                ?.active ===
                true &&
            Number.isFinite(
                activeInvestment
                    ?.payout
                    ?.value
            )
        ) {
            const selectedTerm =
                activeInvestment
                    .selectedTerm;

            const selectedCurrentOption =
                options.find(
                    option =>
                        option.id ===
                        selectedTerm
                            ?.id
                );

            if (
                selectedCurrentOption &&
                Number.isFinite(
                    selectedCurrentOption
                        .profitPercent
                )
            ) {
                try {
                    activeEstimate =
                        financeEngine
                            .estimatePrincipalFromPayout({
                                payout:
                                    activeInvestment
                                        .payout
                                        .value,

                                profitPercent:
                                    selectedCurrentOption
                                        .profitPercent,

                                options: {
                                    roundTo:
                                        1_000_000,

                                    payoutVerified:
                                        true,

                                    confidence:
                                        "approximate-current-rate",
                                },
                            });

                    comparisonPrincipal =
                        activeEstimate
                            .principal
                            .value;

                    principalSource =
                        "estimated-active-principal";

                    principalEstimated =
                        true;
                } catch (error) {
                    metrics
                        .bankRecommendationFailures +=
                        1;

                    metrics.lastError =
                        createErrorSnapshot(
                            error
                        );
                }
            }
        }

        let comparison =
            null;

        let recommendation =
            null;

        if (
            comparisonPrincipal >
                0 &&
            options.length >
                0
        ) {
            try {
                metrics
                    .bankRecommendationCalculations +=
                    1;

                metrics.lastRecommendationAt =
                    Date.now();

                comparison =
                    financeEngine
                        .compareInvestments(
                            comparisonPrincipal,
                            options,
                            {
                                principalSource,

                                principalEstimated,
                            }
                        );

                recommendation =
                    financeEngine
                        .recommendInvestment(
                            comparisonPrincipal,
                            options,
                            {
                                strategy:
                                    repositoryState
                                        .investmentStrategy,

                                principalSource,

                                principalEstimated,
                            }
                        );
            } catch (error) {
                metrics
                    .bankRecommendationFailures +=
                    1;

                metrics.lastError =
                    createErrorSnapshot(
                        error
                    );
            }
        }

        return {
            comparisonPrincipal: {
                value:
                    comparisonPrincipal,

                source:
                    principalSource,

                estimated:
                    principalEstimated,

                verified:
                    !principalEstimated,
            },

            activeEstimate,

            comparison,

            recommendation,

            calculatedAt:
                Date.now(),
        };
    }

    function createUnavailableBankSnapshot(
        reason
    ) {
        return {
            type:
                DATA_KEYS
                    .INVESTMENT_BANK,

            available:
                false,

            ready:
                false,

            reason,

            strategy:
                repositoryState
                    .investmentStrategy,

            pageSnapshot:
                null,

            options:
                [],

            activeInvestment:
                null,

            analysis:
                null,

            source:
                "repository:finance",

            updatedAt:
                Date.now(),
        };
    }

    function createBankSnapshot(
        helperSnapshot,
        reason
    ) {
        const analysis =
            calculateBankAnalysis(
                helperSnapshot
            );

        return {
            type:
                DATA_KEYS
                    .INVESTMENT_BANK,

            available:
                helperSnapshot
                    ?.ready ===
                true,

            ready:
                helperSnapshot
                    ?.ready ===
                true,

            reason,

            strategy:
                repositoryState
                    .investmentStrategy,

            pageSnapshot:
                cloneValue(
                    helperSnapshot
                ),

            options:
                (
                    helperSnapshot
                        ?.options ||
                    []
                )
                    .map(
                        normalizeBankOption
                    )
                    .filter(
                        Boolean
                    ),

            activeInvestment:
                cloneValue(
                    helperSnapshot
                        ?.currentInvestment ||
                    null
                ),

            controls:
                cloneValue(
                    helperSnapshot
                        ?.controls ||
                    null
                ),

            state:
                cloneValue(
                    helperSnapshot
                        ?.state ||
                    null
                ),

            analysis,

            source:
                "repository:finance",

            updatedAt:
                Date.now(),
        };
    }

    function bankSnapshotsEqual(
        first,
        second
    ) {
        if (
            !first ||
            !second
        ) {
            return false;
        }

        const simplify =
            snapshot => ({
                available:
                    snapshot.available,

                strategy:
                    snapshot.strategy,

                options:
                    snapshot.options.map(
                        option => ({
                            id:
                                option.id,

                            days:
                                option.days,

                            profitPercent:
                                option
                                    .profitPercent,

                            aprPercent:
                                option
                                    .aprPercent,

                            selected:
                                option.selected,
                        })
                    ),

                active:
                    snapshot
                        .activeInvestment
                        ?.active ===
                    true,

                payout:
                    snapshot
                        .activeInvestment
                        ?.payout
                        ?.value ??
                    null,

                selectedTerm:
                    snapshot
                        .activeInvestment
                        ?.selectedTerm
                        ?.id ||
                    null,

                /*
                 * Compare maturity rounded to one minute so the
                 * live second-by-second countdown does not cause
                 * constant repository change events.
                 */
                maturityMinute:
                    Number.isFinite(
                        snapshot
                            .activeInvestment
                            ?.countdown
                            ?.estimatedMaturesAt
                    )
                        ? Math.round(
                              snapshot
                                  .activeInvestment
                                  .countdown
                                  .estimatedMaturesAt /
                                  60_000
                          )
                        : null,

                recommendation:
                    snapshot
                        .analysis
                        ?.recommendation
                        ?.recommendation
                        ?.option
                        ?.id ||
                    null,
            });

        return (
            JSON.stringify(
                simplify(
                    first
                )
            ) ===
            JSON.stringify(
                simplify(
                    second
                )
            )
        );
    }

    function publishState(
        stateKey,
        value,
        reason,
        force =
            false
    ) {
        metrics.statePublishes +=
            1;

        try {
            return sharedState.set(
                stateKey,
                value,
                {
                    source:
                        REPOSITORY_NAME,

                    force,

                    metadata: {
                        repository:
                            "finance",

                        reason,
                    },
                }
            );
        } catch (error) {
            metrics.statePublishFailures +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            logger?.error(
                "Finance Repository state publish failed",
                {
                    stateKey,
                    reason,
                    error,
                }
            );

            return {
                changed:
                    false,

                failed:
                    true,
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

                metrics
                    .subscriberNotifications +=
                    1;

                notified +=
                    1;
            } catch (error) {
                metrics.subscriberErrors +=
                    1;

                metrics.lastError =
                    createErrorSnapshot(
                        error
                    );

                logger?.error(
                    "Finance Repository subscriber failed",
                    {
                        dataKey,
                        reason,
                        error,
                    }
                );
            }
        }

        return notified;
    }

    function updateWalletState(
        wallet,
        reason,
        forceNotify =
            false
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

        publishState(
            STATE_KEYS.WALLET,
            wallet,
            reason,
            forceNotify
        );

        if (
            !changed &&
            !forceNotify
        ) {
            metrics.walletNoChanges +=
                1;

            return {
                changed:
                    false,

                wallet:
                    cloneValue(
                        wallet
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

        events?.emit?.(
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

                reason,

                timestamp:
                    Date.now(),
            }
        );

        recordActivity(
            "wallet-changed",
            {
                value:
                    wallet.value,

                delta:
                    wallet.delta,
            }
        );

        return {
            changed:
                true,

            wallet:
                cloneValue(
                    wallet
                ),
        };
    }

    function updateBankState(
        bank,
        reason,
        forceNotify =
            false
    ) {
        const previousBank =
            repositoryState
                .investmentBank;

        const changed =
            !bankSnapshotsEqual(
                previousBank,
                bank
            );

        repositoryState
            .investmentBank =
            bank;

        publishState(
            STATE_KEYS
                .INVESTMENT_BANK,
            bank,
            reason,
            forceNotify
        );

        if (
            !changed &&
            !forceNotify
        ) {
            metrics.bankNoChanges +=
                1;

            return {
                changed:
                    false,

                investmentBank:
                    cloneValue(
                        bank
                    ),
            };
        }

        metrics.bankChanges +=
            1;

        metrics.lastBankChangeAt =
            Date.now();

        notifySubscribers(
            DATA_KEYS
                .INVESTMENT_BANK,
            bank,
            previousBank,
            reason
        );

        events?.emit?.(
            EVENT_NAMES
                .INVESTMENT_BANK_CHANGED,
            {
                investmentBank:
                    cloneValue(
                        bank
                    ),

                previousInvestmentBank:
                    cloneValue(
                        previousBank
                    ),

                reason,

                timestamp:
                    Date.now(),
            }
        );

        recordActivity(
            "investment-bank-changed",
            {
                available:
                    bank.available,

                optionCount:
                    bank.options
                        .length,

                activeInvestment:
                    bank
                        .activeInvestment
                        ?.active ===
                    true,

                recommendation:
                    bank
                        .analysis
                        ?.recommendation
                        ?.recommendation
                        ?.option
                        ?.id ||
                    null,
            }
        );

        return {
            changed:
                true,

            investmentBank:
                cloneValue(
                    bank
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
            return createWalletSnapshot({
                raw:
                    "",

                value:
                    null,

                source,

                elementFound:
                    false,
            });
        }

        const raw =
            normalizeText(
                element.textContent
            );

        return createWalletSnapshot({
            raw,

            value:
                parseWalletValue(
                    raw
                ),

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
            options.forceNotify ===
                true
        );

        /*
         * A wallet change can alter the amount used by current
         * Investment Bank recommendations.
         */
        if (
            repositoryState
                .investmentBank
                ?.available ===
            true
        ) {
            scheduleInvestmentBankRefresh(
                "wallet-changed"
            );
        }

        return cloneValue(
            wallet
        );
    }

    function readInvestmentBank(
        reason =
            "manual-read"
    ) {
        metrics.bankReads +=
            1;

        metrics.lastBankReadAt =
            Date.now();

        const helper =
            getBankHelper();

        if (
            !helper ||
            typeof helper.getSnapshot !==
                "function"
        ) {
            metrics.bankUnavailableReads +=
                1;

            return createUnavailableBankSnapshot(
                "investment-bank-helper-unavailable"
            );
        }

        try {
            const helperSnapshot =
                helper.getSnapshot();

            return createBankSnapshot(
                helperSnapshot,
                reason
            );
        } catch (error) {
            metrics.bankUnavailableReads +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            logger?.error(
                "Finance Repository could not read the Investment Bank",
                {
                    error,
                    reason,
                }
            );

            return createUnavailableBankSnapshot(
                "investment-bank-read-failed"
            );
        }
    }

    function getInvestmentBank(
        options = {}
    ) {
        if (
            options.refresh ===
                true ||
            repositoryState
                .investmentBank ===
                null
        ) {
            refreshInvestmentBank(
                options.reason ||
                "get-investment-bank"
            );
        }

        return cloneValue(
            repositoryState
                .investmentBank
        );
    }

    function refreshInvestmentBank(
        reason =
            "manual-refresh",
        options = {}
    ) {
        metrics.bankRefreshes +=
            1;

        const bank =
            readInvestmentBank(
                reason
            );

        updateBankState(
            bank,
            reason,
            options.forceNotify ===
                true
        );

        return cloneValue(
            bank
        );
    }

    function scheduleInvestmentBankRefresh(
        reason =
            "bank-dom-change"
    ) {
        if (
            bankRefreshTimerId !==
            null
        ) {
            globalThis.clearTimeout(
                bankRefreshTimerId
            );
        }

        bankRefreshTimerId =
            globalThis.setTimeout(
                () => {
                    bankRefreshTimerId =
                        null;

                    refreshInvestmentBank(
                        reason
                    );
                },
                BANK_REFRESH_DEBOUNCE_MS
            );

        return true;
    }

    function getInvestmentStrategy() {
        return repositoryState
            .investmentStrategy;
    }

    function setInvestmentStrategy(
        strategy,
        options = {}
    ) {
        const normalized =
            String(
                strategy ||
                ""
            )
                .trim()
                .toLowerCase();

        const validStrategies =
            Object.values(
                financeEngine
                    .strategies ||
                {}
            );

        if (
            !validStrategies.includes(
                normalized
            )
        ) {
            throw new Error(
                `Unsupported investment strategy: ${String(strategy)}`
            );
        }

        const previousStrategy =
            repositoryState
                .investmentStrategy;

        if (
            previousStrategy ===
            normalized
        ) {
            return {
                success:
                    true,

                changed:
                    false,

                strategy:
                    normalized,
            };
        }

        repositoryState
            .investmentStrategy =
            normalized;

        metrics.strategyChanges +=
            1;

        metrics.lastStrategyChangeAt =
            Date.now();

        events?.emit?.(
            EVENT_NAMES
                .INVESTMENT_STRATEGY_CHANGED,
            {
                previousStrategy,

                strategy:
                    normalized,

                source:
                    options.source ||
                    "finance-repository",

                timestamp:
                    Date.now(),
            }
        );

        refreshInvestmentBank(
            "investment-strategy-changed",
            {
                forceNotify:
                    true,
            }
        );

        return {
            success:
                true,

            changed:
                true,

            previousStrategy,

            strategy:
                normalized,
        };
    }

    function normalizeDataKey(
        dataKey
    ) {
        const value =
            String(
                dataKey ||
                ""
            ).trim();

        if (
            value ===
                DATA_KEYS.WALLET ||
            value ===
                DATA_KEYS
                    .INVESTMENT_BANK
        ) {
            return value;
        }

        throw new Error(
            `Unsupported Finance Repository data key: ${String(dataKey)}`
        );
    }

    function subscribe(
        dataKey,
        callback,
        options = {}
    ) {
        const normalizedKey =
            normalizeDataKey(
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
                      })
                    : getInvestmentBank({
                          refresh:
                              options.refresh ===
                              true,
                      });

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
            normalizeDataKey(
                dataKey
            );

        return subscribers
            .get(
                normalizedKey
            )
            ?.delete(
                callback
            ) ===
            true;
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

                    if (
                        repositoryState
                            .investmentBank
                            ?.available ===
                        true
                    ) {
                        scheduleInvestmentBankRefresh(
                            "wallet-watcher-change"
                        );
                    }
                },
                {
                    group:
                        WALLET_OBSERVER_GROUP,

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
                    },
                }
            );

            return dom.hasObserver(
                WALLET_OBSERVER_NAME
            );
        } catch (error) {
            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            logger?.error(
                "Finance Repository wallet watcher failed",
                {
                    error,
                }
            );

            return false;
        }
    }

    function startInvestmentBankWatcher() {
        if (
            bankMutationObserver
        ) {
            bankMutationObserver
                .disconnect();

            bankMutationObserver =
                null;
        }

        const bankRoot =
            document.querySelector(
                ".invest-wrap"
            );

        if (!bankRoot) {
            refreshInvestmentBank(
                "bank-watcher-root-unavailable"
            );

            return false;
        }

        bankMutationObserver =
            new MutationObserver(
                () => {
                    scheduleInvestmentBankRefresh(
                        "bank-dom-mutation"
                    );
                }
            );

        bankMutationObserver.observe(
            bankRoot,
            {
                childList:
                    true,

                subtree:
                    true,

                characterData:
                    true,

                attributes:
                    true,

                attributeFilter: [
                    "class",
                    "disabled",
                    "value",
                ],
            }
        );

        refreshInvestmentBank(
            "bank-watcher-initial"
        );

        return true;
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

        const walletWatcherActive =
            await startWalletWatcher();

        const bankWatcherActive =
            startInvestmentBankWatcher();

        health?.markHealthy?.(
            REPOSITORY_NAME,
            {
                message:
                    "Finance Repository is active.",

                metadata: {
                    walletWatcherActive,

                    bankWatcherActive,
                },
            }
        );

        recordActivity(
            "start",
            {
                walletWatcherActive,

                bankWatcherActive,
            }
        );

        logger?.info(
            "Finance Repository started",
            {
                walletWatcherActive,

                bankWatcherActive,
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

        dom.disconnectGroup?.(
            WALLET_OBSERVER_GROUP
        );

        if (
            bankMutationObserver
        ) {
            bankMutationObserver
                .disconnect();

            bankMutationObserver =
                null;
        }

        if (
            bankRefreshTimerId !==
            null
        ) {
            globalThis.clearTimeout(
                bankRefreshTimerId
            );

            bankRefreshTimerId =
                null;
        }

        repositoryState.started =
            false;

        repositoryState.stoppedAt =
            Date.now();

        metrics.stopCount +=
            1;

        health?.markDisabled?.(
            REPOSITORY_NAME,
            {
                message:
                    "Finance Repository is stopped.",
            }
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

        const bankSubscribers =
            subscribers.get(
                DATA_KEYS
                    .INVESTMENT_BANK
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
                    .startedAt &&
                repositoryState
                    .started
                    ? Date.now() -
                      repositoryState
                          .startedAt
                    : 0,

            wallet:
                cloneValue(
                    repositoryState
                        .wallet
                ),

            investmentBank:
                cloneValue(
                    repositoryState
                        .investmentBank
                ),

            investmentStrategy:
                repositoryState
                    .investmentStrategy,

            helper: {
                id:
                    BANK_HELPER_ID,

                available:
                    Boolean(
                        getBankHelper()
                    ),

                ready:
                    getBankHelper()
                        ?.isReady?.()
                        ?.ready ===
                    true,
            },

            watchers: {
                wallet: {
                    name:
                        WALLET_OBSERVER_NAME,

                    active:
                        dom.hasObserver(
                            WALLET_OBSERVER_NAME
                        ),

                    selector:
                        getWalletSelector(),
                },

                investmentBank: {
                    active:
                        Boolean(
                            bankMutationObserver
                        ),

                    rootPresent:
                        Boolean(
                            document.querySelector(
                                ".invest-wrap"
                            )
                        ),
                },
            },

            sharedState: {
                wallet: {
                    key:
                        STATE_KEYS.WALLET,

                    published:
                        sharedState.has(
                            STATE_KEYS.WALLET
                        ),

                    revision:
                        sharedState
                            .getRevision(
                                STATE_KEYS.WALLET
                            ),
                },

                investmentBank: {
                    key:
                        STATE_KEYS
                            .INVESTMENT_BANK,

                    published:
                        sharedState.has(
                            STATE_KEYS
                                .INVESTMENT_BANK
                        ),

                    revision:
                        sharedState
                            .getRevision(
                                STATE_KEYS
                                    .INVESTMENT_BANK
                            ),
                },
            },

            subscribers: {
                wallet:
                    walletSubscribers,

                investmentBank:
                    bankSubscribers,

                total:
                    walletSubscribers +
                    bankSubscribers,
            },

            metrics: {
                ...metrics,

                lastError:
                    metrics.lastError
                        ? {
                              ...metrics
                                  .lastError,
                          }
                        : null,
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

            getInvestmentBank,
            refreshInvestmentBank,

            getInvestmentStrategy,
            setInvestmentStrategy,

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

    health?.register?.({
        name:
            REPOSITORY_NAME,

        type:
            health.types
                ?.REPOSITORY ||
            "repository",

        status:
            TACTIC
                .HEALTH_STATES
                ?.STARTING ||
            "starting",

        staleAfterMs:
            null,

        metadata: {
            repositoryName:
                "finance",

            dataKeys:
                Object.values(
                    DATA_KEYS
                ),

            stateKeys:
                Object.values(
                    STATE_KEYS
                ),

            requiresHeartbeat:
                false,
        },
    });

    start().catch(
        error => {
            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            health?.markFailed?.(
                REPOSITORY_NAME,
                {
                    message:
                        error.message,

                    error,
                }
            );

            logger?.error(
                "Finance Repository startup failed",
                {
                    error,
                }
            );
        }
    );

    logger?.info(
        "Finance Repository loaded",
        {
            domains: [
                DATA_KEYS.WALLET,
                DATA_KEYS
                    .INVESTMENT_BANK,
            ],

            defaultInvestmentStrategy:
                DEFAULT_STRATEGY,
        }
    );
})();