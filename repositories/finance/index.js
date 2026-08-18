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
 * - Faction Vault
 *
 * Responsibilities:
 * - Observe and publish the player's wallet
 * - Read Investment Bank data through its registered DOM helper
 * - Read the player's personal Faction Vault balance
 * - Preserve verified page-specific financial data in storage
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
 * - getFactionVault()
 * - refreshFactionVault()
 * - getFundingSources()
 * - getLiquiditySnapshot()
 * - evaluateAffordability()
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
 * - finance.factionVault
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

    const storage =
        services.storage;

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
    
    const CAYMAN_OBSERVER_NAME =
        "repository:finance:cayman";

    const CAYMAN_OBSERVER_GROUP =
        "repository:finance:cayman";

    const BANK_OBSERVER_GROUP =
        "repository:finance:investment-bank";

    const BANK_HELPER_ID =
        "investment-bank";

    const FACTION_VAULT_HELPER_ID =
        "faction-bank";

    const PERSONAL_VAULT_HELPER_ID =
        "personal-vault";

    const CAYMAN_HELPER_ID =
        "cayman";

    const FACTION_VAULT_ROOT_SELECTOR =
        "#tab\\=armoury\\&sub\\=donate";

    const PERSONAL_VAULT_ROOT_SELECTOR =
        ".properties-wrap";

    const BANK_CACHE_STORAGE_KEY =
        "finance:investment-bank-cache";

    const BANK_CACHE_VERSION =
        1;

    const BANK_RATE_CACHE_MAX_AGE_MS =
        24 *
        60 *
        60 *
        1_000;

    const FACTION_VAULT_CACHE_STORAGE_KEY =
        "finance:faction-vault-cache";

    const FACTION_VAULT_CACHE_VERSION =
        1;

    const FACTION_VAULT_CACHE_MAX_AGE_MS =
        7 *
        24 *
        60 *
        60 *
        1_000;

    const PERSONAL_VAULT_CACHE_STORAGE_KEY =
        "finance:personal-vault-cache";

    const PERSONAL_VAULT_CACHE_VERSION =
        1;

    const PERSONAL_VAULT_CACHE_MAX_AGE_MS =
        7 *
        24 *
        60 *
        60 *
        1_000;

    const CAYMAN_CACHE_STORAGE_KEY =
        "finance:cayman-cache";

    const CAYMAN_CACHE_VERSION =
        1;

    const CAYMAN_CACHE_MAX_AGE_MS =
        7 *
        24 *
        60 *
        60 *
        1_000;

    const WALLET_SELECTOR_PATH =
        "USER.WALLET";

    const DEFAULT_STRATEGY =
        financeEngine.strategies
            ?.MAXIMUM_RETURN ||
        "maximum-return";

    const BANK_REFRESH_DEBOUNCE_MS =
        350;

    const FACTION_VAULT_REFRESH_DEBOUNCE_MS =
        350;

    const PERSONAL_VAULT_REFRESH_DEBOUNCE_MS =
        350;

    const DATA_KEYS =
        Object.freeze({
            WALLET:
                "wallet",

            INVESTMENT_BANK:
                "investmentBank",

            FACTION_VAULT:
                "factionVault",

            PERSONAL_VAULT:
                "personalVault",

            CAYMAN:
                "cayman",
        });

    const STATE_KEYS =
        Object.freeze({
            WALLET:
                "finance.wallet",

            INVESTMENT_BANK:
                "finance.investmentBank",

            FACTION_VAULT:
                "finance.factionVault",

            PERSONAL_VAULT:
                "finance.personalVault",

            CAYMAN:
                "finance.cayman",
        });

    const EVENT_NAMES =
        Object.freeze({
            WALLET_CHANGED:
                "finance:wallet-changed",

            INVESTMENT_BANK_CHANGED:
                "finance:investment-bank-changed",

            FACTION_VAULT_CHANGED:
                "finance:faction-vault-changed",

            PERSONAL_VAULT_CHANGED:
                "finance:personal-vault-changed",

            CAYMAN_CHANGED:
                "finance:cayman-changed",

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
            [
                DATA_KEYS.FACTION_VAULT,
                new Set(),
            ],
            [
                DATA_KEYS.PERSONAL_VAULT,
                new Set(),
            ],
            [
                DATA_KEYS.CAYMAN,
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

        factionVault:
            null,

        personalVault:
            null,

        cayman:
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

        bankCacheReads:
            0,

        bankCacheHits:
            0,

        bankCacheMisses:
            0,

        bankCacheWrites:
            0,

        bankCacheWriteFailures:
            0,

        bankCacheReadFailures:
            0,

        bankRecommendationCalculations:
            0,

        bankRecommendationFailures:
            0,

        factionVaultReads:
            0,

        factionVaultRefreshes:
            0,

        factionVaultChanges:
            0,

        factionVaultNoChanges:
            0,

        factionVaultUnavailableReads:
            0,

        factionVaultCacheReads:
            0,

        factionVaultCacheHits:
            0,

        factionVaultCacheMisses:
            0,

        factionVaultCacheWrites:
            0,

        factionVaultCacheWriteFailures:
            0,

        factionVaultCacheReadFailures:
            0,

        personalVaultReads:
            0,

        personalVaultRefreshes:
            0,

        personalVaultChanges:
            0,

        personalVaultNoChanges:
            0,

        personalVaultUnavailableReads:
            0,

        personalVaultCacheReads:
            0,

        personalVaultCacheHits:
            0,

        personalVaultCacheMisses:
            0,

        personalVaultCacheWrites:
            0,

        personalVaultCacheWriteFailures:
            0,

        personalVaultCacheReadFailures:
            0,

        caymanReads:
            0,

        caymanRefreshes:
            0,

        caymanChanges:
            0,

        caymanNoChanges:
            0,

        caymanUnavailableReads:
            0,

        caymanCacheReads:
            0,

        caymanCacheHits:
            0,

        caymanCacheMisses:
            0,

        caymanCacheWrites:
            0,

        caymanCacheWriteFailures:
            0,

        caymanCacheReadFailures:
            0,

        fundingSourceSnapshots:
            0,

        liquiditySnapshots:
            0,

        affordabilityEvaluations:
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

        lastBankCacheReadAt:
            null,

        lastBankCacheWriteAt:
            null,

        lastRecommendationAt:
            null,

        lastFactionVaultReadAt:
            null,

        lastFactionVaultChangeAt:
            null,

        lastFactionVaultCacheReadAt:
            null,

        lastFactionVaultCacheWriteAt:
            null,

        lastPersonalVaultReadAt:
            null,

        lastPersonalVaultChangeAt:
            null,

        lastPersonalVaultCacheReadAt:
            null,

        lastPersonalVaultCacheWriteAt:
            null,

        lastCaymanReadAt:
            null,

        lastCaymanChangeAt:
            null,

        lastCaymanCacheReadAt:
            null,

        lastCaymanCacheWriteAt:
            null,

        lastFundingSourceSnapshotAt:
            null,

        lastLiquiditySnapshotAt:
            null,

        lastAffordabilityEvaluationAt:
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

    let factionVaultMutationObserver =
        null;

    let factionVaultRefreshTimerId =
        null;

    let personalVaultMutationObserver =
        null;

    let personalVaultRefreshTimerId =
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

                    factionVaultAvailable:
                        repositoryState
                            .factionVault
                            ?.available ===
                        true,

                    factionVaultValue:
                        repositoryState
                            .factionVault
                            ?.value ??
                        null,

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

    function createBankCacheRecord(
        snapshot
    ) {
        return {
            version:
                BANK_CACHE_VERSION,

            savedAt:
                Date.now(),

            lastLiveReadAt:
                snapshot
                    ?.lastLiveReadAt ||
                snapshot
                    ?.updatedAt ||
                Date.now(),

            snapshot:
                cloneValue(
                    snapshot
                ),
        };
    }

    function saveBankCache(
        snapshot
    ) {
        if (
            !storage ||
            typeof storage.set !==
                "function" ||
            !snapshot ||
            snapshot.live !==
                true
        ) {
            return false;
        }

        try {
            const record =
                createBankCacheRecord(
                    snapshot
                );

            storage.set(
                BANK_CACHE_STORAGE_KEY,
                record
            );

            metrics.bankCacheWrites +=
                1;

            metrics.lastBankCacheWriteAt =
                Date.now();

            return true;
        } catch (error) {
            metrics.bankCacheWriteFailures +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            logger?.error(
                "Finance Repository could not save the Investment Bank cache",
                {
                    error,
                }
            );

            return false;
        }
    }

    function readBankCacheRecord() {
        metrics.bankCacheReads +=
            1;

        metrics.lastBankCacheReadAt =
            Date.now();

        if (
            !storage ||
            typeof storage.get !==
                "function"
        ) {
            metrics.bankCacheMisses +=
                1;

            return null;
        }

        try {
            const record =
                storage.get(
                    BANK_CACHE_STORAGE_KEY,
                    null
                );

            if (
                !record ||
                typeof record !==
                    "object" ||
                record.version !==
                    BANK_CACHE_VERSION ||
                !record.snapshot
            ) {
                metrics.bankCacheMisses +=
                    1;

                return null;
            }

            metrics.bankCacheHits +=
                1;

            return cloneValue(
                record
            );
        } catch (error) {
            metrics.bankCacheReadFailures +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            logger?.error(
                "Finance Repository could not read the Investment Bank cache",
                {
                    error,
                }
            );

            return null;
        }
    }

    function createCachedBankSnapshot(
        record,
        reason
    ) {
        if (
            !record ||
            !record.snapshot
        ) {
            return null;
        }

        const cached =
            cloneValue(
                record.snapshot
            );

        const now =
            Date.now();

        const lastLiveReadAt =
            record.lastLiveReadAt ||
            cached.lastLiveReadAt ||
            cached.updatedAt ||
            record.savedAt ||
            null;

        const cacheAgeMs =
            Number.isFinite(
                lastLiveReadAt
            )
                ? Math.max(
                      0,
                      now -
                          lastLiveReadAt
                  )
                : null;

        cached.available =
            true;

        cached.ready =
            false;

        cached.live =
            false;

        cached.cached =
            true;

        cached.reason =
            reason;

        cached.source =
            "repository:finance-persistent-cache";

        cached.cachedAt =
            record.savedAt ||
            now;

        cached.lastLiveReadAt =
            lastLiveReadAt;

        cached.cacheAgeMs =
            cacheAgeMs;

        cached.ratesStale =
            Number.isFinite(
                cacheAgeMs
            )
                ? cacheAgeMs >
                  BANK_RATE_CACHE_MAX_AGE_MS
                : true;

        cached.updatedAt =
            now;

        const countdown =
            cached
                .activeInvestment
                ?.countdown;

        if (
            Number.isFinite(
                countdown
                    ?.estimatedMaturesAt
            )
        ) {
            const remainingMs =
                Math.max(
                    0,
                    countdown
                        .estimatedMaturesAt -
                    now
                );

            countdown.milliseconds =
                remainingMs;

            countdown.totalSeconds =
                Math.floor(
                    remainingMs /
                    1_000
                );

            countdown.days =
                Math.floor(
                    countdown
                        .totalSeconds /
                    86_400
                );

            countdown.hours =
                Math.floor(
                    (
                        countdown
                            .totalSeconds %
                        86_400
                    ) /
                    3_600
                );

            countdown.minutes =
                Math.floor(
                    (
                        countdown
                            .totalSeconds %
                        3_600
                    ) /
                    60
                );

            countdown.seconds =
                countdown
                    .totalSeconds %
                60;

            countdown.cached =
                true;

            countdown.live =
                false;

            countdown.source =
                "cached-maturity-projection";
        }

        if (
            cached.pageSnapshot
        ) {
            cached.pageSnapshot.ready =
                false;

            cached.pageSnapshot.source =
                "persistent-cache";
        }

        return cached;
    }

    function loadBankCache(
        reason =
            "persistent-cache"
    ) {
        const record =
            readBankCacheRecord();

        if (!record) {
            return null;
        }

        return createCachedBankSnapshot(
            record,
            reason
        );
    }

    function getFactionVaultHelper() {
        return (
            dom.pages
                ?.getHelper?.(
                    FACTION_VAULT_HELPER_ID
                ) ||
            null
        );
    }

    function getPersonalVaultHelper() {
        return (
            dom.pages
                ?.getHelper?.(
                    PERSONAL_VAULT_HELPER_ID
                ) ||
            null
        );
    }

    function getCaymanHelper() {
        return (
            dom.global
                ?.getHelper?.(
                    CAYMAN_HELPER_ID
                ) ||
            null
        );
    }

    function createPersonalVaultCacheRecord(
        snapshot
    ) {
        return {
            version:
                PERSONAL_VAULT_CACHE_VERSION,

            savedAt:
                Date.now(),

            lastLiveReadAt:
                snapshot
                    ?.lastLiveReadAt ||
                snapshot
                    ?.updatedAt ||
                Date.now(),

            snapshot:
                cloneValue(
                    snapshot
                ),
        };
    }

    function savePersonalVaultCache(
        snapshot
    ) {
        if (
            !storage ||
            typeof storage.set !==
                "function" ||
            !snapshot ||
            snapshot.live !==
                true ||
            snapshot.verified !==
                true
        ) {
            return false;
        }

        try {
            storage.set(
                PERSONAL_VAULT_CACHE_STORAGE_KEY,
                createPersonalVaultCacheRecord(
                    snapshot
                )
            );

            metrics.personalVaultCacheWrites +=
                1;

            metrics.lastPersonalVaultCacheWriteAt =
                Date.now();

            return true;
        } catch (error) {
            metrics
                .personalVaultCacheWriteFailures +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            logger?.error(
                "Finance Repository could not save the Personal Vault cache",
                {
                    error,
                }
            );

            return false;
        }
    }

    function readPersonalVaultCacheRecord() {
        metrics.personalVaultCacheReads +=
            1;

        metrics.lastPersonalVaultCacheReadAt =
            Date.now();

        if (
            !storage ||
            typeof storage.get !==
                "function"
        ) {
            metrics.personalVaultCacheMisses +=
                1;

            return null;
        }

        try {
            const record =
                storage.get(
                    PERSONAL_VAULT_CACHE_STORAGE_KEY,
                    null
                );

            if (
                !record ||
                typeof record !==
                    "object" ||
                record.version !==
                    PERSONAL_VAULT_CACHE_VERSION ||
                !record.snapshot
            ) {
                metrics.personalVaultCacheMisses +=
                    1;

                return null;
            }

            metrics.personalVaultCacheHits +=
                1;

            return cloneValue(
                record
            );
        } catch (error) {
            metrics
                .personalVaultCacheReadFailures +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            logger?.error(
                "Finance Repository could not read the Personal Vault cache",
                {
                    error,
                }
            );

            return null;
        }
    }

    function createCachedPersonalVaultSnapshot(
        record,
        reason
    ) {
        if (
            !record ||
            !record.snapshot
        ) {
            return null;
        }

        const cached =
            cloneValue(
                record.snapshot
            );

        const now =
            Date.now();

        const lastLiveReadAt =
            record.lastLiveReadAt ||
            cached.lastLiveReadAt ||
            cached.updatedAt ||
            record.savedAt ||
            null;

        const cacheAgeMs =
            Number.isFinite(
                lastLiveReadAt
            )
                ? Math.max(
                    0,
                    now -
                        lastLiveReadAt
                )
                : null;

        cached.available =
            Number.isFinite(
                cached.value
            );

        cached.verified =
            cached.available;

        cached.ready =
            false;

        cached.live =
            false;

        cached.cached =
            true;

        cached.stale =
            Number.isFinite(
                cacheAgeMs
            )
                ? cacheAgeMs >
                PERSONAL_VAULT_CACHE_MAX_AGE_MS
                : true;

        cached.reason =
            reason;

        cached.source =
            "repository:finance-persistent-cache";

        cached.cachedAt =
            record.savedAt ||
            now;

        cached.lastLiveReadAt =
            lastLiveReadAt;

        cached.cacheAgeMs =
            cacheAgeMs;

        cached.updatedAt =
            now;

        return cached;
    }

    function loadPersonalVaultCache(
        reason =
            "persistent-cache"
    ) {
        const record =
            readPersonalVaultCacheRecord();

        if (!record) {
            return null;
        }

        return createCachedPersonalVaultSnapshot(
            record,
            reason
        );
    }

    function createUnavailablePersonalVaultSnapshot(
        reason
    ) {
        const previous =
            repositoryState
                .personalVault;

        if (
            previous &&
            Number.isFinite(
                previous.value
            )
        ) {
            const cached =
                createCachedPersonalVaultSnapshot(
                    {
                        version:
                            PERSONAL_VAULT_CACHE_VERSION,

                        savedAt:
                            previous.cachedAt ||
                            previous.updatedAt ||
                            Date.now(),

                        lastLiveReadAt:
                            previous.lastLiveReadAt ||
                            previous.updatedAt ||
                            null,

                        snapshot:
                            previous,
                    },
                    reason
                );

            if (cached) {
                return cached;
            }
        }

        const persisted =
            loadPersonalVaultCache(
                reason
            );

        if (persisted) {
            return persisted;
        }

        return {
            type:
                DATA_KEYS
                    .PERSONAL_VAULT,

            id:
                "personal-vault",

            name:
                "Personal Vault",

            ownership:
                "personal",

            value:
                null,

            available:
                false,

            verified:
                false,

            ready:
                false,

            live:
                false,

            cached:
                false,

            stale:
                false,

            spendable:
                false,

            immediatelyAvailable:
                false,

            liquidityClass:
                "self-accessible",

            access: {
                canDeposit:
                    false,

                canSelfWithdraw:
                    true,

                requiresThirdParty:
                    false,

                requiresTravel:
                    false,

                timing:
                    "immediate-on-access",
            },

            accessCost: {
                timeMinutes:
                    0,

                timeKnown:
                    true,

                risk:
                    "low",

                dependencies: [],
            },

            funding: {
                usableForRecommendations:
                    false,

                affordabilityClass:
                    "unavailable",

                transferRequired:
                    false,

                selfWithdrawalRequired:
                    true,
            },

            reason,

            source:
                "repository:finance",

            updatedAt:
                Date.now(),
        };
    }

    function createPersonalVaultSnapshot(
        helperSnapshot,
        reason
    ) {
        const balanceValue =
            helperSnapshot
                ?.balance
                ?.value;

        const available =
            Number.isFinite(
                balanceValue
            ) &&
            helperSnapshot
                ?.balance
                ?.available ===
            true;

        return {
            type:
                DATA_KEYS
                    .PERSONAL_VAULT,

            id:
                "personal-vault",

            name:
                "Personal Vault",

            ownership:
                helperSnapshot
                    ?.ownership ||
                "personal",

            value:
                available
                    ? balanceValue
                    : null,

            raw:
                helperSnapshot
                    ?.balance
                    ?.raw ||
                "",

            available,

            verified:
                available &&
                helperSnapshot
                    ?.balance
                    ?.verified ===
                true,

            ready:
                available,

            live:
                available,

            cached:
                false,

            stale:
                false,

            spendable:
                helperSnapshot
                    ?.spendable ===
                true,

            immediatelyAvailable:
                helperSnapshot
                    ?.immediatelyAvailable ===
                true,

            liquidityClass:
                helperSnapshot
                    ?.liquidityClass ||
                "self-accessible",

            access:
                cloneValue(
                    helperSnapshot
                        ?.access ||
                    {
                        canDeposit:
                            false,

                        canSelfWithdraw:
                            true,

                        requiresThirdParty:
                            false,

                        requiresTravel:
                            false,

                        timing:
                            "immediate-on-access",
                    }
                ),

            accessCost:
                cloneValue(
                    helperSnapshot
                        ?.accessCost ||
                    {
                        timeMinutes:
                            0,

                        timeKnown:
                            true,

                        risk:
                            "low",

                        dependencies: [],
                    }
                ),

            funding:
                cloneValue(
                    helperSnapshot
                        ?.funding ||
                    {
                        usableForRecommendations:
                            available,

                        affordabilityClass:
                            available
                                ? "affordable-after-self-withdrawal"
                                : "unavailable",

                        transferRequired:
                            false,

                        selfWithdrawalRequired:
                            true,
                    }
                ),

            helperSnapshot:
                cloneValue(
                    helperSnapshot
                ),

            reason,

            lastLiveReadAt:
                available
                    ? Date.now()
                    : null,

            source:
                "repository:finance",

            updatedAt:
                Date.now(),
        };
    }

    function personalVaultSnapshotsEqual(
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
            first.verified ===
                second.verified &&
            first.live ===
                second.live &&
            first.cached ===
                second.cached &&
            first.stale ===
                second.stale
        );
    }

    function createCaymanCacheRecord(
        snapshot
    ) {
        return {
            version:
                CAYMAN_CACHE_VERSION,

            savedAt:
                Date.now(),

            lastLiveReadAt:
                snapshot
                    ?.lastLiveReadAt ||
                snapshot
                    ?.updatedAt ||
                Date.now(),

            snapshot:
                cloneValue(
                    snapshot
                ),
        };
    }

    function saveCaymanCache(
        snapshot
    ) {
        if (
            !storage ||
            typeof storage.set !==
                "function" ||
            !snapshot ||
            snapshot.live !==
                true ||
            snapshot.verified !==
                true
        ) {
            return false;
        }

        try {
            storage.set(
                CAYMAN_CACHE_STORAGE_KEY,
                createCaymanCacheRecord(
                    snapshot
                )
            );

            metrics.caymanCacheWrites +=
                1;

            metrics.lastCaymanCacheWriteAt =
                Date.now();

            return true;
        } catch (error) {
            metrics
                .caymanCacheWriteFailures +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            logger?.error(
                "Finance Repository could not save the Cayman cache",
                {
                    error,
                }
            );

            return false;
        }
    }

    function readCaymanCacheRecord() {
        metrics.caymanCacheReads +=
            1;

        metrics.lastCaymanCacheReadAt =
            Date.now();

        if (
            !storage ||
            typeof storage.get !==
                "function"
        ) {
            metrics.caymanCacheMisses +=
                1;

            return null;
        }

        try {
            const record =
                storage.get(
                    CAYMAN_CACHE_STORAGE_KEY,
                    null
                );

            if (
                !record ||
                typeof record !==
                    "object" ||
                record.version !==
                    CAYMAN_CACHE_VERSION ||
                !record.snapshot
            ) {
                metrics.caymanCacheMisses +=
                    1;

                return null;
            }

            metrics.caymanCacheHits +=
                1;

            return cloneValue(
                record
            );
        } catch (error) {
            metrics
                .caymanCacheReadFailures +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            logger?.error(
                "Finance Repository could not read the Cayman cache",
                {
                    error,
                }
            );

            return null;
        }
    }

    function createCachedCaymanSnapshot(
        record,
        reason
    ) {
        if (
            !record ||
            !record.snapshot
        ) {
            return null;
        }

        const cached =
            cloneValue(
                record.snapshot
            );

        const now =
            Date.now();

        const lastLiveReadAt =
            record.lastLiveReadAt ||
            cached.lastLiveReadAt ||
            cached.updatedAt ||
            record.savedAt ||
            null;

        const cacheAgeMs =
            Number.isFinite(
                lastLiveReadAt
            )
                ? Math.max(
                    0,
                    now -
                        lastLiveReadAt
                )
                : null;

        cached.available =
            Number.isFinite(
                cached.value
            );

        cached.verified =
            cached.available;

        cached.ready =
            false;

        cached.live =
            false;

        cached.cached =
            true;

        cached.stale =
            Number.isFinite(
                cacheAgeMs
            )
                ? cacheAgeMs >
                CAYMAN_CACHE_MAX_AGE_MS
                : true;

        cached.reason =
            reason;

        cached.source =
            "repository:finance-persistent-cache";

        cached.cachedAt =
            record.savedAt ||
            now;

        cached.lastLiveReadAt =
            lastLiveReadAt;

        cached.cacheAgeMs =
            cacheAgeMs;

        cached.updatedAt =
            now;

        return cached;
    }

    function loadCaymanCache(
        reason =
            "persistent-cache"
    ) {
        const record =
            readCaymanCacheRecord();

        if (!record) {
            return null;
        }

        return createCachedCaymanSnapshot(
            record,
            reason
        );
    }

    function createUnavailableCaymanSnapshot(
        reason
    ) {
        const previous =
            repositoryState.cayman;

        if (
            previous &&
            Number.isFinite(
                previous.value
            )
        ) {
            const cached =
                createCachedCaymanSnapshot(
                    {
                        version:
                            CAYMAN_CACHE_VERSION,

                        savedAt:
                            previous.cachedAt ||
                            previous.updatedAt ||
                            Date.now(),

                        lastLiveReadAt:
                            previous.lastLiveReadAt ||
                            previous.updatedAt ||
                            null,

                        snapshot:
                            previous,
                    },
                    reason
                );

            if (cached) {
                return cached;
            }
        }

        const persisted =
            loadCaymanCache(
                reason
            );

        if (persisted) {
            return persisted;
        }

        return {
            type:
                DATA_KEYS.CAYMAN,

            id:
                "cayman",

            name:
                "Cayman",

            ownership:
                "personal",

            value:
                null,

            available:
                false,

            verified:
                false,

            ready:
                false,

            live:
                false,

            cached:
                false,

            stale:
                false,

            spendable:
                false,

            immediatelyAvailable:
                false,

            liquidityClass:
                "travel-dependent",

            access: {
                canDeposit:
                    false,

            canSelfWithdraw:
                true,

                requiresThirdParty:
                    false,

                requiresTravel:
                    true,

                timing:
                    "travel-required",
            },

            accessCost: {
                timeMinutes:
                    null,

                timeKnown:
                    false,

                risk:
                    "elevated",

                dependencies: [
                    "travel-to-cayman-islands",
                ],
            },

            funding: {
                usableForRecommendations:
                    false,

                affordabilityClass:
                    "unavailable",

                transferRequired:
                    true,

                travelRequired:
                    true,
            },

            reason,

            source:
                "repository:finance",

            updatedAt:
                Date.now(),
        };
    }

    function createCaymanSnapshot(
        helperSnapshot,
        reason
    ) {
        const balanceValue =
            helperSnapshot
                ?.balance
                ?.value;

        const available =
            Number.isFinite(
                balanceValue
            ) &&
            helperSnapshot
                ?.balance
                ?.available ===
            true;

        return {
            type:
                DATA_KEYS.CAYMAN,

            id:
                "cayman",

            name:
                "Cayman",

            ownership:
                helperSnapshot
                    ?.ownership ||
                "personal",

            value:
                available
                    ? balanceValue
                    : null,

            raw:
                helperSnapshot
                    ?.balance
                    ?.raw ||
                "",

            available,

            verified:
                available &&
                helperSnapshot
                    ?.balance
                    ?.verified ===
                true,

            ready:
                available,

            live:
                available,

            cached:
                false,

            stale:
                false,

            spendable:
                helperSnapshot
                    ?.spendable ===
                true,

            immediatelyAvailable:
                false,

            liquidityClass:
                helperSnapshot
                    ?.liquidityClass ||
                "travel-dependent",

            access:
                cloneValue(
                    helperSnapshot
                        ?.access ||
                    {
                        canDeposit:
                            false,

                        canSelfWithdraw:
                            true,

                        requiresThirdParty:
                            false,

                        requiresTravel:
                            true,

                        timing:
                            "travel-required",
                    }
                ),

            accessCost:
                cloneValue(
                    helperSnapshot
                        ?.accessCost ||
                    {
                        timeMinutes:
                            null,

                        timeKnown:
                            false,

                        risk:
                            "elevated",

                        dependencies: [
                            "travel-to-cayman-islands",
                        ],
                    }
                ),

            funding:
                cloneValue(
                    helperSnapshot
                        ?.funding ||
                    {
                        usableForRecommendations:
                            available,

                        affordabilityClass:
                            available
                                ? "affordable-after-travel"
                                : "unavailable",

                        transferRequired:
                            true,

                        travelRequired:
                            true,
                    }
                ),

            helperSnapshot:
                cloneValue(
                    helperSnapshot
                ),

            reason,

            lastLiveReadAt:
                available
                    ? Date.now()
                    : null,

            source:
                "repository:finance",

            updatedAt:
                Date.now(),
        };
    }

    function caymanSnapshotsEqual(
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
            first.verified ===
                second.verified &&
            first.live ===
                second.live &&
            first.cached ===
                second.cached &&
            first.stale ===
                second.stale
        );
    }

    function createFactionVaultCacheRecord(
        snapshot
    ) {
        return {
            version:
                FACTION_VAULT_CACHE_VERSION,

            savedAt:
                Date.now(),

            lastLiveReadAt:
                snapshot
                    ?.lastLiveReadAt ||
                snapshot
                    ?.updatedAt ||
                Date.now(),

            snapshot:
                cloneValue(
                    snapshot
                ),
        };
    }

    function saveFactionVaultCache(
        snapshot
    ) {
        if (
            !storage ||
            typeof storage.set !==
                "function" ||
            !snapshot ||
            snapshot.live !==
                true ||
            snapshot.verified !==
                true
        ) {
            return false;
        }

        try {
            storage.set(
                FACTION_VAULT_CACHE_STORAGE_KEY,
                createFactionVaultCacheRecord(
                    snapshot
                )
            );

            metrics.factionVaultCacheWrites +=
                1;

            metrics.lastFactionVaultCacheWriteAt =
                Date.now();

            return true;
        } catch (error) {
            metrics
                .factionVaultCacheWriteFailures +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            logger?.error(
                "Finance Repository could not save the Faction Vault cache",
                {
                    error,
                }
            );

            return false;
        }
    }

    function readFactionVaultCacheRecord() {
        metrics.factionVaultCacheReads +=
            1;

        metrics.lastFactionVaultCacheReadAt =
            Date.now();

        if (
            !storage ||
            typeof storage.get !==
                "function"
        ) {
            metrics.factionVaultCacheMisses +=
                1;

            return null;
        }

        try {
            const record =
                storage.get(
                    FACTION_VAULT_CACHE_STORAGE_KEY,
                    null
                );

            if (
                !record ||
                typeof record !==
                    "object" ||
                record.version !==
                    FACTION_VAULT_CACHE_VERSION ||
                !record.snapshot
            ) {
                metrics.factionVaultCacheMisses +=
                    1;

                return null;
            }

            metrics.factionVaultCacheHits +=
                1;

            return cloneValue(
                record
            );
        } catch (error) {
            metrics
                .factionVaultCacheReadFailures +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            logger?.error(
                "Finance Repository could not read the Faction Vault cache",
                {
                    error,
                }
            );

            return null;
        }
    }

    function createCachedFactionVaultSnapshot(
        record,
        reason
    ) {
        if (
            !record ||
            !record.snapshot
        ) {
            return null;
        }

        const cached =
            cloneValue(
                record.snapshot
            );

        const now =
            Date.now();

        const lastLiveReadAt =
            record.lastLiveReadAt ||
            cached.lastLiveReadAt ||
            cached.updatedAt ||
            record.savedAt ||
            null;

        const cacheAgeMs =
            Number.isFinite(
                lastLiveReadAt
            )
                ? Math.max(
                      0,
                      now -
                          lastLiveReadAt
                  )
                : null;

        cached.available =
            Number.isFinite(
                cached.value
            );

        cached.verified =
            cached.available;

        cached.ready =
            false;

        cached.live =
            false;

        cached.cached =
            true;

        cached.stale =
            Number.isFinite(
                cacheAgeMs
            )
                ? cacheAgeMs >
                  FACTION_VAULT_CACHE_MAX_AGE_MS
                : true;

        cached.reason =
            reason;

        cached.source =
            "repository:finance-persistent-cache";

        cached.cachedAt =
            record.savedAt ||
            now;

        cached.lastLiveReadAt =
            lastLiveReadAt;

        cached.cacheAgeMs =
            cacheAgeMs;

        cached.updatedAt =
            now;

        return cached;
    }

    function loadFactionVaultCache(
        reason =
            "persistent-cache"
    ) {
        const record =
            readFactionVaultCacheRecord();

        if (!record) {
            return null;
        }

        return createCachedFactionVaultSnapshot(
            record,
            reason
        );
    }

    function createUnavailableFactionVaultSnapshot(
        reason
    ) {
        const previous =
            repositoryState
                .factionVault;

        if (
            previous &&
            Number.isFinite(
                previous.value
            )
        ) {
            const cached =
                createCachedFactionVaultSnapshot(
                    {
                        version:
                            FACTION_VAULT_CACHE_VERSION,

                        savedAt:
                            previous.cachedAt ||
                            previous.updatedAt ||
                            Date.now(),

                        lastLiveReadAt:
                            previous.lastLiveReadAt ||
                            previous.updatedAt ||
                            null,

                        snapshot:
                            previous,
                    },
                    reason
                );

            if (cached) {
                return cached;
            }
        }

        const persisted =
            loadFactionVaultCache(
                reason
            );

        if (persisted) {
            return persisted;
        }

        return {
            type:
                DATA_KEYS
                    .FACTION_VAULT,

            id:
                "faction-vault",

            name:
                "Faction Vault",

            ownership:
                "personal",

            value:
                null,

            available:
                false,

            verified:
                false,

            ready:
                false,

            live:
                false,

            cached:
                false,

            stale:
                false,

            spendable:
                false,

            immediatelyAvailable:
                false,

            liquidityClass:
                "request-dependent",

            access: {
                canDeposit:
                    false,

                canSelfWithdraw:
                    false,

                canRequestWithdrawal:
                    false,

                requiresFactionBanker:
                    true,

                requiresAuthorizedFactionMember:
                    true,

                transferDelayPossible:
                    true,

                timing:
                    "variable",
            },

            funding: {
                usableForRecommendations:
                    false,

                affordabilityClass:
                    "unavailable",

                transferRequired:
                    true,
            },

            reason,

            source:
                "repository:finance",

            updatedAt:
                Date.now(),
        };
    }

    function createFactionVaultSnapshot(
        helperSnapshot,
        reason
    ) {
        const balanceValue =
            helperSnapshot
                ?.balance
                ?.value;

        const available =
            Number.isFinite(
                balanceValue
            ) &&
            helperSnapshot
                ?.balance
                ?.available ===
            true;

        return {
            type:
                DATA_KEYS
                    .FACTION_VAULT,

            id:
                "faction-vault",

            name:
                "Faction Vault",

            ownership:
                "personal",

            value:
                available
                    ? balanceValue
                    : null,

            raw:
                helperSnapshot
                    ?.balance
                    ?.raw ||
                "",

            available,

            verified:
                available &&
                helperSnapshot
                    ?.balance
                    ?.verified ===
                true,

            ready:
                available,

            live:
                available,

            cached:
                false,

            stale:
                false,

            spendable:
                available,

            immediatelyAvailable:
                false,

            liquidityClass:
                "request-dependent",

            access:
                cloneValue(
                    helperSnapshot
                        ?.access ||
                    {
                        canDeposit:
                            false,

                        canSelfWithdraw:
                            false,

                        canRequestWithdrawal:
                            available,

                        requiresFactionBanker:
                            true,

                        timing:
                            "variable",
                    }
                ),

            accessCost:
                cloneValue(
                    helperSnapshot
                        ?.accessCost ||
                    {
                        timeMinutes:
                            null,

                        timeKnown:
                            false,

                        risk:
                            "low",

                        dependencies: [
                            "authorized-faction-member",
                            "faction-banker-availability",
                        ],
                    }
                ),

            funding:
                cloneValue(
                    helperSnapshot
                        ?.funding ||
                    {
                        usableForRecommendations:
                            available,

                        affordabilityClass:
                            available
                                ? "affordable-after-transfer"
                                : "unavailable",

                        transferRequired:
                            true,
                    }
                ),

            helperSnapshot:
                cloneValue(
                    helperSnapshot
                ),

            reason,

            lastLiveReadAt:
                available
                    ? Date.now()
                    : null,

            source:
                "repository:finance",

            updatedAt:
                Date.now(),
        };
    }

    function factionVaultSnapshotsEqual(
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
            first.verified ===
                second.verified &&
            first.live ===
                second.live &&
            first.cached ===
                second.cached &&
            first.stale ===
                second.stale
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
                                        100_000_000,

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
        const previous =
            repositoryState
                .investmentBank;

        if (
            previous &&
            (
                previous.live ===
                    true ||
                previous.cached ===
                    true ||
                previous.available ===
                    true
            )
        ) {
            const record = {
                version:
                    BANK_CACHE_VERSION,

                savedAt:
                    previous.cachedAt ||
                    previous.updatedAt ||
                    Date.now(),

                lastLiveReadAt:
                    previous.lastLiveReadAt ||
                    previous.updatedAt ||
                    null,

                snapshot:
                    previous,
            };

            const cached =
                createCachedBankSnapshot(
                    record,
                    reason
                );

            if (cached) {
                return cached;
            }
        }

        const persisted =
            loadBankCache(
                reason
            );

        if (persisted) {
            return persisted;
        }

        return {
            type:
                DATA_KEYS
                    .INVESTMENT_BANK,

            available:
                false,

            ready:
                false,

            live:
                false,

            cached:
                false,

            ratesStale:
                false,

            cacheAgeMs:
                null,

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

            live:
                helperSnapshot
                    ?.ready ===
                true,

            cached:
                false,

            reason,

            lastLiveReadAt:
                helperSnapshot
                    ?.ready ===
                true
                    ? Date.now()
                    : null,

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

                ready:
                    snapshot.ready,

                live:
                    snapshot.live ===
                    true,

                cached:
                    snapshot.cached ===
                    true,

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

    function updateFactionVaultState(
        factionVault,
        reason,
        forceNotify =
            false
    ) {
        const previousFactionVault =
            repositoryState
                .factionVault;

        const changed =
            !factionVaultSnapshotsEqual(
                previousFactionVault,
                factionVault
            );

        repositoryState.factionVault =
            factionVault;

        publishState(
            STATE_KEYS.FACTION_VAULT,
            factionVault,
            reason,
            forceNotify
        );

        if (
            !changed &&
            !forceNotify
        ) {
            metrics.factionVaultNoChanges +=
                1;

            return {
                changed:
                    false,

                factionVault:
                    cloneValue(
                        factionVault
                    ),
            };
        }

        metrics.factionVaultChanges +=
            1;

        metrics.lastFactionVaultChangeAt =
            Date.now();

        notifySubscribers(
            DATA_KEYS.FACTION_VAULT,
            factionVault,
            previousFactionVault,
            reason
        );

        events?.emit?.(
            EVENT_NAMES.FACTION_VAULT_CHANGED,
            {
                factionVault:
                    cloneValue(
                        factionVault
                    ),

                previousFactionVault:
                    cloneValue(
                        previousFactionVault
                    ),

                reason,

                timestamp:
                    Date.now(),
            }
        );

        recordActivity(
            "faction-vault-changed",
            {
                available:
                    factionVault.available,

                value:
                    factionVault.value,

                live:
                    factionVault.live,

                cached:
                    factionVault.cached,
            }
        );

        return {
            changed:
                true,

            factionVault:
                cloneValue(
                    factionVault
                ),
        };
    }

    function updatePersonalVaultState(
        personalVault,
        reason,
        forceNotify =
            false
    ) {
        const previousPersonalVault =
            repositoryState
                .personalVault;

        const changed =
            !personalVaultSnapshotsEqual(
                previousPersonalVault,
                personalVault
            );

        repositoryState.personalVault =
            personalVault;

        publishState(
            STATE_KEYS.PERSONAL_VAULT,
            personalVault,
            reason,
            forceNotify
        );

        if (
            !changed &&
            !forceNotify
        ) {
            metrics.personalVaultNoChanges +=
                1;

            return {
                changed:
                    false,

                personalVault:
                    cloneValue(
                        personalVault
                    ),
            };
        }

        metrics.personalVaultChanges +=
            1;

        metrics.lastPersonalVaultChangeAt =
            Date.now();

        notifySubscribers(
            DATA_KEYS.PERSONAL_VAULT,
            personalVault,
            previousPersonalVault,
            reason
        );

        events?.emit?.(
            EVENT_NAMES.PERSONAL_VAULT_CHANGED,
            {
                personalVault:
                    cloneValue(
                        personalVault
                    ),

                previousPersonalVault:
                    cloneValue(
                        previousPersonalVault
                    ),

                reason,

                timestamp:
                    Date.now(),
            }
        );

        recordActivity(
            "personal-vault-changed",
            {
                available:
                    personalVault.available,

                value:
                    personalVault.value,

                live:
                    personalVault.live,

                cached:
                    personalVault.cached,
            }
        );

        return {
            changed:
                true,

            personalVault:
                cloneValue(
                    personalVault
                ),
        };
    }

    function updateCaymanState(
        cayman,
        reason,
        forceNotify =
            false
    ) {
        const previousCayman =
            repositoryState.cayman;

        const changed =
            !caymanSnapshotsEqual(
                previousCayman,
                cayman
            );

        repositoryState.cayman =
            cayman;

        publishState(
            STATE_KEYS.CAYMAN,
            cayman,
            reason,
            forceNotify
        );

        if (
            !changed &&
            !forceNotify
        ) {
            metrics.caymanNoChanges +=
                1;

            return {
                changed:
                    false,

                cayman:
                    cloneValue(
                        cayman
                    ),
            };
        }

        metrics.caymanChanges +=
            1;

        metrics.lastCaymanChangeAt =
            Date.now();

        notifySubscribers(
            DATA_KEYS.CAYMAN,
            cayman,
            previousCayman,
            reason
        );

        events?.emit?.(
            EVENT_NAMES.CAYMAN_CHANGED,
            {
                cayman:
                    cloneValue(
                        cayman
                    ),

                previousCayman:
                    cloneValue(
                        previousCayman
                    ),

                reason,

                timestamp:
                    Date.now(),
            }
        );

        recordActivity(
            "cayman-changed",
            {
                available:
                    cayman.available,

                value:
                    cayman.value,

                live:
                    cayman.live,

                cached:
                    cayman.cached,
            }
        );

        return {
            changed:
                true,

            cayman:
                cloneValue(
                    cayman
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

            /*
             * The helper remains registered after navigating away
             * from the Investment Bank, but its page snapshot is
             * no longer ready. Treat that as a page-unavailable
             * condition so the repository preserves the last
             * successful live snapshot instead of replacing it
             * with empty data.
             */
            if (
                helperSnapshot
                    ?.ready !==
                true
            ) {
                metrics.bankUnavailableReads +=
                    1;

                return createUnavailableBankSnapshot(
                    helperSnapshot
                        ?.readiness
                        ?.reason ||
                    helperSnapshot
                        ?.reason ||
                    "investment-bank-page-unavailable"
                );
            }

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

        if (
            bank?.live ===
            true
        ) {
            saveBankCache(
                bank
            );
        }

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

    function readFactionVault(
        reason =
            "manual-read"
    ) {
        metrics.factionVaultReads +=
            1;

        metrics.lastFactionVaultReadAt =
            Date.now();

        const helper =
            getFactionVaultHelper();

        if (
            !helper ||
            typeof helper.getFinancialSnapshot !==
                "function"
        ) {
            metrics
                .factionVaultUnavailableReads +=
                1;

            return createUnavailableFactionVaultSnapshot(
                "faction-vault-helper-unavailable"
            );
        }

        try {
            const helperSnapshot =
                helper.getFinancialSnapshot();

            if (
                helperSnapshot
                    ?.balance
                    ?.available !==
                true ||
                !Number.isFinite(
                    helperSnapshot
                        ?.balance
                        ?.value
                )
            ) {
                metrics
                    .factionVaultUnavailableReads +=
                    1;

                return createUnavailableFactionVaultSnapshot(
                    helperSnapshot
                        ?.balance
                        ?.reason ||
                    "faction-vault-page-unavailable"
                );
            }

            return createFactionVaultSnapshot(
                helperSnapshot,
                reason
            );
        } catch (error) {
            metrics
                .factionVaultUnavailableReads +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            logger?.error(
                "Finance Repository could not read the Faction Vault",
                {
                    error,
                    reason,
                }
            );

            return createUnavailableFactionVaultSnapshot(
                "faction-vault-read-failed"
            );
        }
    }

    function readPersonalVault(
        reason =
            "manual-read"
    ) {
        metrics.personalVaultReads +=
            1;

        metrics.lastPersonalVaultReadAt =
            Date.now();

        const helper =
            getPersonalVaultHelper();

        if (
            !helper ||
            typeof helper.getFinancialSnapshot !==
                "function"
        ) {
            metrics
                .personalVaultUnavailableReads +=
                1;

            return createUnavailablePersonalVaultSnapshot(
                "personal-vault-helper-unavailable"
            );
        }

        try {
            const helperSnapshot =
                helper.getFinancialSnapshot();

            if (
                helperSnapshot
                    ?.balance
                    ?.available !==
                true ||
                !Number.isFinite(
                    helperSnapshot
                        ?.balance
                        ?.value
                )
            ) {
                metrics
                    .personalVaultUnavailableReads +=
                    1;

                return createUnavailablePersonalVaultSnapshot(
                    helperSnapshot
                        ?.balance
                        ?.reason ||
                    "personal-vault-page-unavailable"
                );
            }

            return createPersonalVaultSnapshot(
                helperSnapshot,
                reason
            );
        } catch (error) {
            metrics
                .personalVaultUnavailableReads +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            logger?.error(
                "Finance Repository could not read the Personal Vault",
                {
                    error,
                    reason,
                }
            );

            return createUnavailablePersonalVaultSnapshot(
                "personal-vault-read-failed"
            );
        }
    }

    function getFactionVault(
        options = {}
    ) {
        if (
            options.refresh ===
                true ||
            repositoryState
                .factionVault ===
                null
        ) {
            refreshFactionVault(
                options.reason ||
                "get-faction-vault"
            );
        }

        return cloneValue(
            repositoryState
                .factionVault
        );
    }

    function refreshFactionVault(
        reason =
            "manual-refresh",
        options = {}
    ) {
        metrics.factionVaultRefreshes +=
            1;

        const factionVault =
            readFactionVault(
                reason
            );

        if (
            factionVault?.live ===
                true &&
            factionVault?.verified ===
                true
        ) {
            saveFactionVaultCache(
                factionVault
            );
        }

        updateFactionVaultState(
            factionVault,
            reason,
            options.forceNotify ===
                true
        );

        return cloneValue(
            factionVault
        );
    }

    function refreshPersonalVault(
        reason =
            "manual-refresh",
        options = {}
    ) {
        metrics.personalVaultRefreshes +=
            1;

        const personalVault =
            readPersonalVault(
                reason
            );

        if (
            personalVault?.live ===
                true &&
            personalVault?.verified ===
                true
        ) {
            savePersonalVaultCache(
                personalVault
            );
        }

        updatePersonalVaultState(
            personalVault,
            reason,
            options.forceNotify ===
                true
        );

        return cloneValue(
            personalVault
        );
    }

    function getPersonalVault(
        options = {}
    ) {
        if (
            options.refresh ===
                true ||
            repositoryState
                .personalVault ===
            null
        ) {
            refreshPersonalVault(
                options.reason ||
                "get-personal-vault"
            );
        }

        return cloneValue(
            repositoryState
                .personalVault
        );
    }

    function readCayman(
        reason =
            "manual-read"
    ) {
        metrics.caymanReads +=
            1;

        metrics.lastCaymanReadAt =
            Date.now();

        const helper =
            getCaymanHelper();

        if (
            !helper ||
            typeof helper
                .getFinancialSnapshot !==
                "function"
        ) {
            metrics.caymanUnavailableReads +=
                1;

            return createUnavailableCaymanSnapshot(
                "cayman-helper-unavailable"
            );
        }

        try {
            const helperSnapshot =
                helper.getFinancialSnapshot();

            if (
                helperSnapshot
                    ?.balance
                    ?.available !==
                    true ||
                !Number.isFinite(
                    helperSnapshot
                        ?.balance
                        ?.value
                )
            ) {
                metrics.caymanUnavailableReads +=
                    1;

                return createUnavailableCaymanSnapshot(
                    helperSnapshot
                        ?.balance
                        ?.reason ||
                    "cayman-global-indicator-unavailable"
                );
            }

            return createCaymanSnapshot(
                helperSnapshot,
                reason
            );
        } catch (error) {
            metrics.caymanUnavailableReads +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            logger?.error(
                "Finance Repository could not read Cayman",
                {
                    error,
                    reason,
                }
            );

            return createUnavailableCaymanSnapshot(
                "cayman-read-failed"
            );
        }
    }

    function refreshCayman(
        reason =
            "manual-refresh",
        options = {}
    ) {
        metrics.caymanRefreshes +=
            1;

        const cayman =
            readCayman(
                reason
            );

        if (
            cayman?.live ===
                true &&
            cayman?.verified ===
                true
        ) {
            saveCaymanCache(
                cayman
            );
        }

        updateCaymanState(
            cayman,
            reason,
            options.forceNotify ===
                true
        );

        return cloneValue(
            cayman
        );
    }

    function getCayman(
        options = {}
    ) {
        if (
            options.refresh ===
                true ||
            repositoryState.cayman ===
                null
        ) {
            refreshCayman(
                options.reason ||
                "get-cayman"
            );
        }

        return cloneValue(
            repositoryState.cayman
        );
    }

    function buildFinancialState() {
        const wallet =
            repositoryState.wallet;

        const factionVault =
            repositoryState.factionVault;

        const personalVault =
            repositoryState.personalVault;

        const investmentBank =
            repositoryState.investmentBank;

        const cayman =
            repositoryState.cayman;

        const investmentPayout =
            investmentBank
                ?.activeInvestment
                ?.payout;

        return {
            wallet: {
                amount:
                    Number.isFinite(
                        wallet?.value
                    )
                        ? wallet.value
                        : 0,

                verified:
                    wallet?.available ===
                    true,

                estimated:
                    false,

                source:
                    wallet?.source ||
                    "finance-repository",

                metadata: {
                    available:
                        wallet?.available ===
                        true,

                    elementFound:
                        wallet?.elementFound ===
                        true,

                    updatedAt:
                        wallet?.updatedAt ||
                        null,
                },
            },

            personalVault: {
                amount:
                    Number.isFinite(
                        personalVault?.value
                    )
                        ? personalVault.value
                        : 0,

                verified:
                    personalVault
                        ?.verified ===
                    true,

                estimated:
                    false,

                source:
                    personalVault
                        ?.source ||
                    "finance-repository",

                metadata: {
                    available:
                        personalVault
                            ?.available ===
                        true,

                    live:
                        personalVault
                            ?.live ===
                        true,

                    cached:
                        personalVault
                            ?.cached ===
                        true,

                    stale:
                        personalVault
                            ?.stale ===
                        true,

                    lastLiveReadAt:
                        personalVault
                            ?.lastLiveReadAt ||
                        null,

                    cacheAgeMs:
                        personalVault
                            ?.cacheAgeMs ??
                        null,

                    canSelfWithdraw:
                        personalVault
                            ?.access
                            ?.canSelfWithdraw ===
                        true,

                    requiresThirdParty:
                        personalVault
                            ?.access
                            ?.requiresThirdParty ===
                        true,

                    liquidityClass:
                        personalVault
                            ?.liquidityClass ||
                        "self-accessible",
                },
            },

            factionVault: {
                amount:
                    Number.isFinite(
                        factionVault
                            ?.value
                    )
                        ? factionVault.value
                        : 0,

                verified:
                    factionVault
                        ?.verified ===
                    true,

                estimated:
                    false,

                source:
                    factionVault
                        ?.source ||
                    "finance-repository",

                metadata: {
                    available:
                        factionVault
                            ?.available ===
                        true,

                    live:
                        factionVault
                            ?.live ===
                        true,

                    cached:
                        factionVault
                            ?.cached ===
                        true,

                    stale:
                        factionVault
                            ?.stale ===
                        true,

                    lastLiveReadAt:
                        factionVault
                            ?.lastLiveReadAt ||
                        null,

                    cacheAgeMs:
                        factionVault
                            ?.cacheAgeMs ??
                        null,

                    requiresFactionBanker:
                        factionVault
                            ?.access
                            ?.requiresFactionBanker ===
                        true,

                    liquidityClass:
                        factionVault
                            ?.liquidityClass ||
                        "request-dependent",
                },
            },

            investmentBank: {
                /*
                 * Use Torn's verified payout as the tracked
                 * locked value. The original principal is not
                 * always known with certainty.
                 */
                amount:
                    Number.isFinite(
                        investmentPayout
                            ?.value
                    )
                        ? investmentPayout
                              .value
                        : 0,

                verified:
                    investmentPayout
                        ?.verified ===
                    true,

                estimated:
                    false,

                source:
                    investmentBank
                        ?.source ||
                    "finance-repository",

                maturesAt:
                    investmentBank
                        ?.activeInvestment
                        ?.countdown
                        ?.estimatedMaturesAt ??
                    null,

                metadata: {
                    available:
                        investmentBank
                            ?.available ===
                        true,

                    live:
                        investmentBank
                            ?.live ===
                        true,

                    cached:
                        investmentBank
                            ?.cached ===
                        true,

                    active:
                        investmentBank
                            ?.activeInvestment
                            ?.active ===
                        true,

                    fundsLocked:
                        investmentBank
                            ?.activeInvestment
                            ?.investmentLocked ===
                        true,

                    payoutVerified:
                        investmentPayout
                            ?.verified ===
                        true,

                    selectedTerm:
                        investmentBank
                            ?.activeInvestment
                            ?.selectedTerm
                            ?.id ||
                        null,

                    lastLiveReadAt:
                        investmentBank
                            ?.lastLiveReadAt ||
                        null,
                },
            },

            cayman: {
                amount:
                    Number.isFinite(
                        cayman?.value
                    )
                        ? cayman.value
                        : 0,

                verified:
                    cayman?.verified ===
                    true,

                estimated:
                    false,

                availability:
                    cayman
                        ?.liquidityClass ||
                    "travel-dependent",

                source:
                    cayman?.source ||
                    "finance-repository",

                metadata: {
                    available:
                        cayman?.available ===
                        true,

                    live:
                        cayman?.live ===
                        true,

                    cached:
                        cayman?.cached ===
                        true,

                    stale:
                        cayman?.stale ===
                        true,

                    lastLiveReadAt:
                        cayman
                            ?.lastLiveReadAt ||
                        null,

                    cacheAgeMs:
                        cayman
                            ?.cacheAgeMs ??
                        null,

                    canSelfWithdraw:
                        cayman
                            ?.access
                            ?.canSelfWithdraw ===
                        true,

                    requiresTravel:
                        cayman
                            ?.access
                            ?.requiresTravel ===
                        true,

                    risk:
                        cayman
                            ?.accessCost
                            ?.risk ||
                        "elevated",

                    liquidityClass:
                        cayman
                            ?.liquidityClass ||
                        "travel-dependent",
                },
            },
        };
    }

    function getFundingSources() {
        metrics.fundingSourceSnapshots +=
            1;

        metrics.lastFundingSourceSnapshotAt =
            Date.now();

        const financialState =
            buildFinancialState();

        const sources =
            financeEngine
                .getFundingSources(
                    financialState
                );

        recordActivity(
            "funding-sources-created",
            {
                sourceCount:
                    sources.length,
            }
        );

        return cloneValue(
            sources
        );
    }

    function getLiquiditySnapshot() {
        metrics.liquiditySnapshots +=
            1;

        metrics.lastLiquiditySnapshotAt =
            Date.now();

        const financialState =
            buildFinancialState();

        const snapshot =
            financeEngine
                .getLiquiditySnapshot(
                    financialState
                );

        recordActivity(
            "liquidity-snapshot-created",
            {
                immediate:
                    snapshot.immediate,

                conditional:
                    snapshot.conditional,

                accessible:
                    snapshot.accessible,

                locked:
                    snapshot.locked,

                totalKnown:
                    snapshot.totalKnown,
            }
        );

        return cloneValue(
            snapshot
        );
    }

    function evaluateAffordability(
        amount
    ) {
        metrics.affordabilityEvaluations +=
            1;

        metrics.lastAffordabilityEvaluationAt =
            Date.now();

        const financialState =
            buildFinancialState();

        const evaluation =
            financeEngine
                .evaluateAffordability(
                    amount,
                    financialState
                );

        recordActivity(
            "affordability-evaluated",
            {
                required:
                    evaluation.required,

                affordable:
                    evaluation.affordable,

                status:
                    evaluation.status,

                requiresAction:
                    evaluation
                        .requiresAction,
            }
        );

        return cloneValue(
            evaluation
        );
    }

    function scheduleFactionVaultRefresh(
        reason =
            "faction-vault-dom-change"
    ) {
        if (
            factionVaultRefreshTimerId !==
            null
        ) {
            globalThis.clearTimeout(
                factionVaultRefreshTimerId
            );
        }

        factionVaultRefreshTimerId =
            globalThis.setTimeout(
                () => {
                    factionVaultRefreshTimerId =
                        null;

                    refreshFactionVault(
                        reason
                    );
                },
                FACTION_VAULT_REFRESH_DEBOUNCE_MS
            );

        return true;
    }

    function schedulePersonalVaultRefresh(
        reason =
            "personal-vault-dom-change"
    ) {
        if (
            personalVaultRefreshTimerId !==
            null
        ) {
            globalThis.clearTimeout(
                personalVaultRefreshTimerId
            );
        }

        personalVaultRefreshTimerId =
            globalThis.setTimeout(
                () => {
                    personalVaultRefreshTimerId =
                        null;

                    refreshPersonalVault(
                        reason
                    );
                },
                PERSONAL_VAULT_REFRESH_DEBOUNCE_MS
            );

        return true;
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
                    .INVESTMENT_BANK ||
            value ===
                DATA_KEYS
                    .FACTION_VAULT ||
            value ===
                DATA_KEYS
                    .PERSONAL_VAULT ||
            value ===
                DATA_KEYS
                    .CAYMAN
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
            let value;

            if (
                normalizedKey ===
                DATA_KEYS.WALLET
            ) {
                value =
                    getWallet({
                        refresh:
                            options.refresh ===
                            true,
                    });
            } else if (
                normalizedKey ===
                DATA_KEYS
                    .INVESTMENT_BANK
            ) {
                value =
                    getInvestmentBank({
                        refresh:
                            options.refresh ===
                            true,
                    });
            } else if (
                normalizedKey ===
                DATA_KEYS
                    .FACTION_VAULT
            ) {
                value =
                    getFactionVault({
                        refresh:
                            options.refresh ===
                            true,
                    });
            } else if (
                normalizedKey ===
                DATA_KEYS
                    .PERSONAL_VAULT
            ) {
                value =
                    getPersonalVault({
                        refresh:
                            options.refresh ===
                            true,
                    });
            } else if (
                normalizedKey ===
                DATA_KEYS.CAYMAN
            ) {
                value =
                    getCayman({
                        refresh:
                            options.refresh ===
                            true,
                    });
            }

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

    function startFactionVaultWatcher() {
        if (
            factionVaultMutationObserver
        ) {
            factionVaultMutationObserver
                .disconnect();

            factionVaultMutationObserver =
                null;
        }

        const factionRoot =
            document.querySelector(
                FACTION_VAULT_ROOT_SELECTOR
            );

        if (!factionRoot) {
            refreshFactionVault(
                "faction-vault-watcher-root-unavailable"
            );

            return false;
        }

        factionVaultMutationObserver =
            new MutationObserver(
                () => {
                    scheduleFactionVaultRefresh(
                        "faction-vault-dom-mutation"
                    );
                }
            );

        factionVaultMutationObserver.observe(
            factionRoot,
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

        refreshFactionVault(
            "faction-vault-watcher-initial"
        );

        return true;
    }

    function startPersonalVaultWatcher() {
        if (
            personalVaultMutationObserver
        ) {
            personalVaultMutationObserver
                .disconnect();

            personalVaultMutationObserver =
                null;
        }

        const helper =
            getPersonalVaultHelper();

        const balanceElement =
            helper
                ?.getBalanceElement?.() ||
            null;

        if (!balanceElement) {
            refreshPersonalVault(
                "personal-vault-watcher-element-unavailable"
            );

            return false;
        }

        personalVaultMutationObserver =
            new MutationObserver(
                () => {
                    schedulePersonalVaultRefresh(
                        "personal-vault-dom-mutation"
                    );
                }
            );

        personalVaultMutationObserver.observe(
            balanceElement,
            {
                childList:
                    true,

                subtree:
                    true,

                characterData:
                    true,
            }
        );

        refreshPersonalVault(
            "personal-vault-watcher-initial"
        );

        return true;
    }

    async function startCaymanWatcher() {
        const helper =
            getCaymanHelper();

        const selector =
            helper
                ?.getBalanceElement
                ? helper
                    .getBalanceElement()
                : null;

        /*
         * The helper's DOM element may not yet exist at repository
         * startup, so resolve the registered selector directly.
         */
        const caymanSelector =
            dom.getSelector?.(
                "USER.CAYMAN"
            );

        if (
            typeof caymanSelector !==
                "string" ||
            !caymanSelector.trim()
        ) {
            refreshCayman(
                "cayman-watcher-selector-unavailable"
            );

            return false;
        }

        try {
            await dom.watchValue(
                CAYMAN_OBSERVER_NAME,
                caymanSelector,
                rawValue =>
                    getCaymanHelper()
                        ?.parseBalance?.(
                            rawValue
                        ) ??
                    null,
                () => {
                    refreshCayman(
                        "cayman-global-balance-changed"
                    );
                },
                {
                    group:
                        CAYMAN_OBSERVER_GROUP,

                    attribute:
                        "aria-label",

                    emitInitial:
                        true,

                    waitForElement:
                        true,

                    rejectOnTimeout:
                        false,

                    timeoutMs:
                        15_000,

                    metadata: {
                        repository:
                            "finance",

                        dataKey:
                            DATA_KEYS.CAYMAN,
                    },
                }
            );

            return dom.hasObserver(
                CAYMAN_OBSERVER_NAME
            );
        } catch (error) {
            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            logger?.error(
                "Finance Repository could not start the Cayman watcher",
                {
                    error,
                }
            );

            refreshCayman(
                "cayman-watcher-start-failed"
            );

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

        /*
         * Restore the most recently verified Bank snapshot before
         * attempting a live page read. This keeps Finance usable
         * after navigation, reloads, and userscript restarts.
         */
        if (
            repositoryState
                .investmentBank ===
            null
        ) {
            const cachedBank =
                loadBankCache(
                    "repository-startup-cache"
                );

            if (cachedBank) {
                repositoryState
                    .investmentBank =
                    cachedBank;

                publishState(
                    STATE_KEYS
                        .INVESTMENT_BANK,
                    cachedBank,
                    "repository-startup-cache",
                    true
                );
            }
        }

        /*
         * Restore the most recently verified Faction Vault
         * snapshot before attempting a live faction-page read.
         */
        if (
            repositoryState
                .factionVault ===
            null
        ) {
            const cachedFactionVault =
                loadFactionVaultCache(
                    "repository-startup-cache"
                );

            if (cachedFactionVault) {
                repositoryState
                    .factionVault =
                    cachedFactionVault;

                publishState(
                    STATE_KEYS
                        .FACTION_VAULT,
                    cachedFactionVault,
                    "repository-startup-cache",
                    true
                );
            }
        }

        /*
        * Restore the most recently verified Personal Vault
        * snapshot before attempting a live property-page read.
        */
        if (
            repositoryState
                .personalVault ===
            null
        ) {
            const cachedPersonalVault =
                loadPersonalVaultCache(
                    "repository-startup-cache"
                );

            if (cachedPersonalVault) {
                repositoryState
                    .personalVault =
                    cachedPersonalVault;

                publishState(
                    STATE_KEYS
                        .PERSONAL_VAULT,
                    cachedPersonalVault,
                    "repository-startup-cache",
                    true
                );
            }
        }

        /*
         * Restore the most recently verified Cayman snapshot before
         * attempting the global live read.
         */
        if (
            repositoryState.cayman ===
            null
        ) {
            const cachedCayman =
                loadCaymanCache(
                    "repository-startup-cache"
                );

            if (cachedCayman) {
                repositoryState.cayman =
                    cachedCayman;

                publishState(
                    STATE_KEYS.CAYMAN,
                    cachedCayman,
                    "repository-startup-cache",
                    true
                );
            }
        }

        const walletWatcherActive =
            await startWalletWatcher();

        const bankWatcherActive =
            startInvestmentBankWatcher();

        const factionVaultWatcherActive =
            startFactionVaultWatcher();

        const personalVaultWatcherActive =
            startPersonalVaultWatcher();

        const caymanWatcherActive =
            await startCaymanWatcher();

        health?.markHealthy?.(
            REPOSITORY_NAME,
            {
                message:
                    "Finance Repository is active.",

                metadata: {
                    walletWatcherActive,

                    bankWatcherActive,

                    factionVaultWatcherActive,

                    personalVaultWatcherActive,

                    caymanWatcherActive,
                },
            }
        );

        recordActivity(
            "start",
            {
                walletWatcherActive,

                bankWatcherActive,

                factionVaultWatcherActive,

                personalVaultWatcherActive,

                caymanWatcherActive,
            }
        );

        logger?.info(
            "Finance Repository started",
            {
                walletWatcherActive,

                bankWatcherActive,

                factionVaultWatcherActive,

                personalVaultWatcherActive,

                caymanWatcherActive,
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

        dom.disconnectGroup?.(
            CAYMAN_OBSERVER_GROUP
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
            factionVaultMutationObserver
        ) {
            factionVaultMutationObserver
                .disconnect();

            factionVaultMutationObserver =
                null;
        }

        if (
            personalVaultMutationObserver
        ) {
            personalVaultMutationObserver
                .disconnect();

            personalVaultMutationObserver =
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

        if (
            factionVaultRefreshTimerId !==
            null
        ) {
            globalThis.clearTimeout(
                factionVaultRefreshTimerId
            );

            factionVaultRefreshTimerId =
                null;
        }

        if (
            personalVaultRefreshTimerId !==
            null
        ) {
            globalThis.clearTimeout(
                personalVaultRefreshTimerId
            );

            personalVaultRefreshTimerId =
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

        const factionVaultSubscribers =
            subscribers.get(
                DATA_KEYS
                    .FACTION_VAULT
            )?.size ||
            0;

        const personalVaultSubscribers =
            subscribers.get(
                DATA_KEYS
                    .PERSONAL_VAULT
            )?.size ||
            0;

        const caymanSubscribers =
            subscribers.get(
                DATA_KEYS.CAYMAN
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

            factionVault:
                cloneValue(
                    repositoryState
                        .factionVault
                ),
            
            personalVault:
                cloneValue(
                    repositoryState
                        .personalVault
                ),

            cayman:
                cloneValue(
                    repositoryState
                        .cayman
                ),

            financialIntelligence: {
                fundingSources:
                    getFundingSources(),

                liquidity:
                    getLiquiditySnapshot(),
            },

            investmentStrategy:
                repositoryState
                    .investmentStrategy,
            
            investmentBankCache: {
                storageKey:
                    BANK_CACHE_STORAGE_KEY,

                version:
                    BANK_CACHE_VERSION,

                rateMaxAgeMs:
                    BANK_RATE_CACHE_MAX_AGE_MS,

                snapshotCached:
                    repositoryState
                        .investmentBank
                        ?.cached ===
                    true,

                snapshotLive:
                    repositoryState
                        .investmentBank
                        ?.live ===
                    true,

                cachedAt:
                    repositoryState
                        .investmentBank
                        ?.cachedAt ||
                    null,

                lastLiveReadAt:
                    repositoryState
                        .investmentBank
                        ?.lastLiveReadAt ||
                    null,

                ageMs:
                    repositoryState
                        .investmentBank
                        ?.cacheAgeMs ??
                    null,

                ratesStale:
                    repositoryState
                        .investmentBank
                        ?.ratesStale ===
                    true,
            },

            factionVaultCache: {
                storageKey:
                    FACTION_VAULT_CACHE_STORAGE_KEY,

                version:
                    FACTION_VAULT_CACHE_VERSION,

                maxAgeMs:
                    FACTION_VAULT_CACHE_MAX_AGE_MS,

                snapshotCached:
                    repositoryState
                        .factionVault
                        ?.cached ===
                    true,

                snapshotLive:
                    repositoryState
                        .factionVault
                        ?.live ===
                    true,

                cachedAt:
                    repositoryState
                        .factionVault
                        ?.cachedAt ||
                    null,

                lastLiveReadAt:
                    repositoryState
                        .factionVault
                        ?.lastLiveReadAt ||
                    null,

                ageMs:
                    repositoryState
                        .factionVault
                        ?.cacheAgeMs ??
                    null,

                stale:
                    repositoryState
                        .factionVault
                        ?.stale ===
                    true,
            },

            personalVaultCache: {
                storageKey:
                    PERSONAL_VAULT_CACHE_STORAGE_KEY,

                version:
                    PERSONAL_VAULT_CACHE_VERSION,

                maxAgeMs:
                    PERSONAL_VAULT_CACHE_MAX_AGE_MS,

                snapshotCached:
                    repositoryState
                        .personalVault
                        ?.cached ===
                    true,

                snapshotLive:
                    repositoryState
                        .personalVault
                        ?.live ===
                    true,

                cachedAt:
                    repositoryState
                        .personalVault
                        ?.cachedAt ||
                    null,

                lastLiveReadAt:
                    repositoryState
                        .personalVault
                        ?.lastLiveReadAt ||
                    null,

                ageMs:
                    repositoryState
                        .personalVault
                        ?.cacheAgeMs ??
                    null,

                stale:
                    repositoryState
                        .personalVault
                        ?.stale ===
                    true,
            },

            caymanCache: {
                storageKey:
                    CAYMAN_CACHE_STORAGE_KEY,

                version:
                    CAYMAN_CACHE_VERSION,

                maxAgeMs:
                    CAYMAN_CACHE_MAX_AGE_MS,

                snapshotCached:
                    repositoryState
                        .cayman
                        ?.cached ===
                    true,

                snapshotLive:
                    repositoryState
                        .cayman
                        ?.live ===
                    true,

                cachedAt:
                    repositoryState
                        .cayman
                        ?.cachedAt ||
                    null,

                lastLiveReadAt:
                    repositoryState
                        .cayman
                        ?.lastLiveReadAt ||
                    null,

                ageMs:
                    repositoryState
                        .cayman
                        ?.cacheAgeMs ??
                    null,

                stale:
                    repositoryState
                        .cayman
                        ?.stale ===
                    true,
            },


            investmentBankHelper: {
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

            factionVaultHelper: {
                id:
                    FACTION_VAULT_HELPER_ID,

                available:
                    Boolean(
                        getFactionVaultHelper()
                    ),

                balanceReadable:
                    getFactionVaultHelper()
                        ?.getPersonalBalance?.()
                        ?.available ===
                    true,
            },

            personalVaultHelper: {
                id:
                    PERSONAL_VAULT_HELPER_ID,

                available:
                    Boolean(
                        getPersonalVaultHelper()
                    ),

                balanceReadable:
                    getPersonalVaultHelper()
                        ?.getBalance?.()
                        ?.available ===
                    true,
            },

            caymanHelper: {
                id:
                    CAYMAN_HELPER_ID,

                available:
                    Boolean(
                        getCaymanHelper()
                    ),

                balanceReadable:
                    getCaymanHelper()
                        ?.getBalance?.()
                        ?.available ===
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

                factionVault: {
                    active:
                        Boolean(
                            factionVaultMutationObserver
                        ),

                    rootPresent:
                        Boolean(
                            document.querySelector(
                                FACTION_VAULT_ROOT_SELECTOR
                            )
                        ),
                },

                personalVault: {
                    active:
                        Boolean(
                            personalVaultMutationObserver
                        ),

                    balancePresent:
                        Boolean(
                            getPersonalVaultHelper()
                                ?.getBalanceElement?.()
                        ),
                },

                cayman: {
                    name:
                        CAYMAN_OBSERVER_NAME,

                    active:
                        dom.hasObserver(
                            CAYMAN_OBSERVER_NAME
                        ),

                    balancePresent:
                        Boolean(
                            getCaymanHelper()
                                ?.getBalanceElement?.()
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

                factionVault: {
                    key:
                        STATE_KEYS
                            .FACTION_VAULT,

                    published:
                        sharedState.has(
                            STATE_KEYS
                                .FACTION_VAULT
                        ),

                    revision:
                        sharedState
                            .getRevision(
                                STATE_KEYS
                                    .FACTION_VAULT
                            ),
                },

                personalVault: {
                    key:
                        STATE_KEYS
                            .PERSONAL_VAULT,

                    published:
                        sharedState.has(
                            STATE_KEYS
                                .PERSONAL_VAULT
                        ),

                    revision:
                        sharedState
                            .getRevision(
                                STATE_KEYS
                                    .PERSONAL_VAULT
                            ),
                },

                cayman: {
                    key:
                        STATE_KEYS.CAYMAN,

                    published:
                        sharedState.has(
                            STATE_KEYS.CAYMAN
                        ),

                    revision:
                        sharedState
                            .getRevision(
                                STATE_KEYS.CAYMAN
                            ),
                },
            },

            subscribers: {
                wallet:
                    walletSubscribers,

                investmentBank:
                    bankSubscribers,

                factionVault:
                    factionVaultSubscribers,

                personalVault:
                    personalVaultSubscribers,

                cayman:
                    caymanSubscribers,

                total:
                    walletSubscribers +
                    bankSubscribers +
                    factionVaultSubscribers +
                    personalVaultSubscribers +
                    caymanSubscribers,
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

            getFactionVault,
            refreshFactionVault,

            getPersonalVault,
            refreshPersonalVault,

            getCayman,
            refreshCayman,

            getFundingSources,
            getLiquiditySnapshot,
            evaluateAffordability,

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
                DATA_KEYS
                    .FACTION_VAULT,
                DATA_KEYS
                    .PERSONAL_VAULT,
            ],

            defaultInvestmentStrategy:
                DEFAULT_STRATEGY,
        }
    );
})();