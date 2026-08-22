/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/finance/funding-refresh.js
 *
 * Purpose:
 * Performs a persistent, read-only refresh of Finance funding
 * sources that require navigation to Torn-specific pages.
 *
 * Responsibilities:
 * - Refresh globally readable Wallet and Cayman balances
 * - Visit Personal Vault and capture a verified balance
 * - Visit Faction Vault and capture a verified balance
 * - Visit Investment Bank and capture current bank state
 * - Persist progress across full page navigation/reloads
 * - Return the player to the page where refresh began
 *
 * Does NOT:
 * - Deposit money
 * - Withdraw money
 * - Transfer money
 * - Start investments
 * - Submit financial forms
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Funding Refresh] Namespace is unavailable."
        );

        return;
    }

    const storage =
        TACTIC.services?.storage;

    const navigation =
        TACTIC.services?.navigation;

    const logger =
        TACTIC.services?.logger;

    const financeRepository =
        TACTIC.repositories?.finance;

    if (
        !storage ||
        !navigation ||
        !financeRepository
    ) {
        console.error(
            "[TACTIC Funding Refresh] Required dependency is unavailable."
        );

        return;
    }

    const STORAGE_KEY =
        "finance:funding-refresh-session";

    const LAST_RESULT_KEY =
        "finance:funding-refresh-last-result";

    const BANK_ROUTE_ID =
        "finance:investment-bank";

    const SESSION_VERSION =
        1;

    const POLL_INTERVAL_MS =
        300;

    const STEP_TIMEOUT_MS =
        12_000;

    const START_DELAY_MS =
        700;

    const STEPS =
        Object.freeze([
            {
                id:
                    "personal-vault",

                label:
                    "Personal Vault",

                routeId:
                    "deposit:personal-vault",

                refreshMethod:
                    "refreshPersonalVault",

                getMethod:
                    "getPersonalVault",

                isReady(
                    snapshot
                ) {
                    return (
                        snapshot?.live ===
                            true &&
                        snapshot?.verified ===
                            true &&
                        snapshot?.available ===
                            true &&
                        Number.isFinite(
                            snapshot?.value
                        )
                    );
                },
            },

            {
                id:
                    "faction-vault",

                label:
                    "Faction Vault",

                routeId:
                    "deposit:faction-bank",

                refreshMethod:
                    "refreshFactionVault",

                getMethod:
                    "getFactionVault",

                isReady(
                    snapshot
                ) {
                    return (
                        snapshot?.live ===
                            true &&
                        snapshot?.verified ===
                            true &&
                        snapshot?.available ===
                            true &&
                        Number.isFinite(
                            snapshot?.value
                        )
                    );
                },
            },

            {
                id:
                    "investment-bank",

                label:
                    "Investment Bank",

                routeId:
                    BANK_ROUTE_ID,

                refreshMethod:
                    "refreshInvestmentBank",

                getMethod:
                    "getInvestmentBank",

                isReady(
                    snapshot
                ) {
                    return (
                        snapshot?.live ===
                            true &&
                        snapshot?.available ===
                            true
                    );
                },
            },
        ]);

    let processing =
        false;

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

    function delay(
        milliseconds
    ) {
        return new Promise(
            resolve =>
                globalThis.setTimeout(
                    resolve,
                    milliseconds
                )
        );
    }

    function readSession() {
        const session =
            storage.get(
                STORAGE_KEY,
                null
            );

        if (
            !session ||
            typeof session !==
                "object" ||
            session.version !==
                SESSION_VERSION
        ) {
            return null;
        }

        return session;
    }

    function saveSession(
        session
    ) {
        session.updatedAt =
            Date.now();

        storage.set(
            STORAGE_KEY,
            session
        );

        return session;
    }

    function clearSession() {
        storage.remove(
            STORAGE_KEY
        );
    }

    function isActive() {
        return (
            readSession()
                ?.active ===
            true
        );
    }

    function registerBankRoute() {
        if (
            navigation.has(
                BANK_ROUTE_ID
            )
        ) {
            return true;
        }

        navigation.register({
            id:
                BANK_ROUTE_ID,

            name:
                "Investment Bank",

            url:
                "/bank.php",

            pageId:
                "bank",

            match({
                currentRoute,
            }) {
                return (
                    currentRoute
                        ?.pathname ===
                    "/bank.php"
                );
            },

            metadata: {
                type:
                    "finance-refresh",

                readOnly:
                    true,
            },
        });

        return true;
    }

    function refreshGlobalSources(
        reason
    ) {
        const results = {};

        try {
            results.wallet =
                financeRepository
                    .refreshWallet?.(
                        reason,
                        {
                            forceNotify:
                                true,
                        }
                    ) ||
                null;
        } catch (error) {
            results.walletError =
                String(
                    error?.message ||
                    error
                );
        }

        try {
            results.cayman =
                financeRepository
                    .refreshCayman?.(
                        reason,
                        {
                            forceNotify:
                                true,
                        }
                    ) ||
                null;
        } catch (error) {
            results.caymanError =
                String(
                    error?.message ||
                    error
                );
        }

        return results;
    }

    function recordResult(
        session,
        sourceId,
        result
    ) {
        if (
            !session.results ||
            typeof session.results !==
                "object"
        ) {
            session.results = {};
        }

        session.results[
            sourceId
        ] = {
            ...cloneValue(
                result
            ),

            recordedAt:
                Date.now(),
        };

        saveSession(
            session
        );
    }

    function buildSnapshotResult(
        step,
        snapshot,
        status
    ) {
        return {
            status,

            label:
                step.label,

            available:
                snapshot?.available ===
                true,

            live:
                snapshot?.live ===
                true,

            verified:
                snapshot?.verified ===
                true,

            value:
                Number.isFinite(
                    snapshot?.value
                )
                    ? snapshot.value
                    : null,

            reason:
                snapshot?.reason ||
                null,

            source:
                snapshot?.source ||
                null,
        };
    }

    async function waitForStepData(
        step,
        session
    ) {
        const startedAt =
            Date.now();

        while (
            Date.now() -
                startedAt <
            STEP_TIMEOUT_MS
        ) {
            try {
                const refresh =
                    financeRepository[
                        step
                            .refreshMethod
                    ];

                if (
                    typeof refresh ===
                    "function"
                ) {
                    refresh(
                        "funding-source-refresh",
                        {
                            forceNotify:
                                true,
                        }
                    );
                }

                const getter =
                    financeRepository[
                        step.getMethod
                    ];

                const snapshot =
                    typeof getter ===
                    "function"
                        ? getter()
                        : null;

                if (
                    step.isReady(
                        snapshot
                    )
                ) {
                    recordResult(
                        session,
                        step.id,
                        buildSnapshotResult(
                            step,
                            snapshot,
                            "updated"
                        )
                    );

                    return {
                        success:
                            true,

                        snapshot,
                    };
                }
            } catch (error) {
                logger?.warn(
                    `Funding refresh could not read ${step.label}`,
                    {
                        step:
                            step.id,

                        error,
                    }
                );
            }

            await delay(
                POLL_INTERVAL_MS
            );
        }

        let finalSnapshot =
            null;

        try {
            finalSnapshot =
                financeRepository[
                    step.getMethod
                ]?.() ||
                null;
        } catch {
            // Ignore.
        }

        recordResult(
            session,
            step.id,
            buildSnapshotResult(
                step,
                finalSnapshot,
                "timeout"
            )
        );

        return {
            success:
                false,

            reason:
                "step-timeout",

            snapshot:
                finalSnapshot,
        };
    }

    function completeSession(
        session
    ) {
        const globalResults =
            refreshGlobalSources(
                "funding-source-refresh-complete"
            );

        session.active =
            false;

        session.status =
            "completed";

        session.completedAt =
            Date.now();

        session.results = {
            ...(
                session.results ||
                {}
            ),

            finalGlobalRefresh:
                cloneValue(
                    globalResults
                ),
        };

        storage.set(
            LAST_RESULT_KEY,
            cloneValue(
                session
            )
        );

        clearSession();

        logger?.info(
            "Finance funding source refresh completed",
            {
                results:
                    session.results,
            }
        );

        const originalUrl =
            session.originalUrl;

        if (
            typeof originalUrl ===
                "string" &&
            originalUrl &&
            originalUrl !==
                globalThis.location
                    .href
        ) {
            globalThis.location.assign(
                originalUrl
            );

            return;
        }

        globalThis.setTimeout(
            () => {
                TACTIC.finance
                    ?.refresh?.(
                        "funding-source-refresh-completed"
                    );
            },
            100
        );
    }

    async function processSession() {
        if (processing) {
            return false;
        }

        const session =
            readSession();

        if (
            !session ||
            session.active !==
                true
        ) {
            return false;
        }

        processing =
            true;

        try {
            registerBankRoute();

            if (
                !Number.isSafeInteger(
                    session.stepIndex
                )
            ) {
                session.stepIndex =
                    0;

                saveSession(
                    session
                );
            }

            if (
                session.stepIndex >=
                STEPS.length
            ) {
                completeSession(
                    session
                );

                return true;
            }

            const step =
                STEPS[
                    session.stepIndex
                ];

            session.status =
                "running";

            session.currentStep =
                step.id;

            saveSession(
                session
            );

            if (
                !navigation.isCurrent(
                    step.routeId
                )
            ) {
                logger?.info(
                    `Finance funding refresh opening ${step.label}`,
                    {
                        step:
                            step.id,

                        stepIndex:
                            session
                                .stepIndex,
                    }
                );

                const result =
                    navigation.open(
                        step.routeId
                    );

                if (
                    result?.success !==
                    true
                ) {
                    recordResult(
                        session,
                        step.id,
                        {
                            status:
                                "navigation-failed",

                            label:
                                step.label,

                            reason:
                                result?.reason ||
                                "navigation-failed",
                        }
                    );

                    session.stepIndex +=
                        1;

                    saveSession(
                        session
                    );

                    processing =
                        false;

                    globalThis.setTimeout(
                        processSession,
                        100
                    );
                }

                return true;
            }

            logger?.info(
                `Finance funding refresh reading ${step.label}`,
                {
                    step:
                        step.id,
                }
            );

            await waitForStepData(
                step,
                session
            );

            session.stepIndex +=
                1;

            session.currentStep =
                null;

            saveSession(
                session
            );

            processing =
                false;

            globalThis.setTimeout(
                processSession,
                100
            );

            return true;
        } catch (error) {
            session.status =
                "failed";

            session.active =
                false;

            session.failedAt =
                Date.now();

            session.error = {
                name:
                    error?.name ||
                    "Error",

                message:
                    error?.message ||
                    String(error),
            };

            storage.set(
                LAST_RESULT_KEY,
                cloneValue(
                    session
                )
            );

            clearSession();

            logger?.error(
                "Finance funding source refresh failed",
                {
                    error,
                }
            );

            return false;
        } finally {
            processing =
                false;
        }
    }

    function start() {
        const existing =
            readSession();

        if (
            existing?.active ===
            true
        ) {
            return {
                success:
                    false,

                started:
                    false,

                reason:
                    "refresh-already-active",

                session:
                    cloneValue(
                        existing
                    ),
            };
        }

        registerBankRoute();

        const initialGlobalRefresh =
            refreshGlobalSources(
                "funding-source-refresh-start"
            );

        const session = {
            version:
                SESSION_VERSION,

            active:
                true,

            status:
                "starting",

            startedAt:
                Date.now(),

            updatedAt:
                Date.now(),

            completedAt:
                null,

            originalUrl:
                globalThis.location
                    .href,

            stepIndex:
                0,

            currentStep:
                null,

            results: {
                initialGlobalRefresh:
                    cloneValue(
                        initialGlobalRefresh
                    ),
            },
        };

        saveSession(
            session
        );

        logger?.info(
            "Finance funding source refresh started",
            {
                originalUrl:
                    session.originalUrl,
            }
        );

        globalThis.setTimeout(
            processSession,
            100
        );

        return {
            success:
                true,

            started:
                true,

            session:
                cloneValue(
                    session
                ),
        };
    }

    function cancel() {
        const session =
            readSession();

        if (!session) {
            return {
                success:
                    false,

                cancelled:
                    false,

                reason:
                    "no-active-refresh",
            };
        }

        session.active =
            false;

        session.status =
            "cancelled";

        session.cancelledAt =
            Date.now();

        storage.set(
            LAST_RESULT_KEY,
            cloneValue(
                session
            )
        );

        clearSession();

        return {
            success:
                true,

            cancelled:
                true,
        };
    }

    function inspect() {
        return {
            active:
                isActive(),

            session:
                cloneValue(
                    readSession()
                ),

            lastResult:
                cloneValue(
                    storage.get(
                        LAST_RESULT_KEY,
                        null
                    )
                ),

            steps:
                STEPS.map(
                    step => ({
                        id:
                            step.id,

                        label:
                            step.label,

                        routeId:
                            step.routeId,
                    })
                ),

            processing,
        };
    }

    registerBankRoute();

    TACTIC.services
        .financeFundingRefresh =
        Object.freeze({
            start,
            cancel,
            resume:
                processSession,
            isActive,
            inspect,
        });

    /*
     * If page navigation reloaded the userscript while a funding
     * refresh is active, continue from the persisted step.
     */
    globalThis.setTimeout(
        () => {
            if (isActive()) {
                processSession();
            }
        },
        START_DELAY_MS
    );

    logger?.info(
        "Finance funding refresh service loaded"
    );
})();