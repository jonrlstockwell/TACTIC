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

    /*
     * Even after a fresh value is detected, remain on the
     * destination page long enough for Torn's page state and
     * DOM helpers to stabilize.
     */
    const MIN_STEP_DWELL_MS =
        1_500;

    const START_DELAY_MS =
        700;

    const OVERLAY_ID =
        "tactic-finance-funding-refresh-overlay";

    const COMPLETION_OVERLAY_MS =
        4_000;

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

    function formatMoney(
        value
    ) {
        if (
            !Number.isFinite(
                value
            )
        ) {
            return null;
        }

        return new Intl
            .NumberFormat(
                "en-US",
                {
                    style:
                        "currency",

                    currency:
                        "USD",

                    maximumFractionDigits:
                        0,
                }
            )
            .format(
                value
            );
    }

    function removeProgressOverlay() {
        document
            .getElementById(
                OVERLAY_ID
            )
            ?.remove();
    }

    function getStepResult(
        session,
        step
    ) {
        return (
            session?.results?.[
                step.id
            ] ||
            null
        );
    }

    function createProgressRow(
        step,
        session
    ) {
        const result =
            getStepResult(
                session,
                step
            );

        const isCurrent =
            session?.currentStep ===
            step.id;

        const row =
            document.createElement(
                "div"
            );

        row.style.display =
            "grid";

        row.style.gridTemplateColumns =
            "22px 1fr auto";

        row.style.alignItems =
            "center";

        row.style.gap =
            "8px";

        row.style.padding =
            "5px 0";

        const icon =
            document.createElement(
                "span"
            );

        const label =
            document.createElement(
                "span"
            );

        const value =
            document.createElement(
                "span"
            );

        label.textContent =
            step.label;

        label.style.fontWeight =
            "600";

        value.style.opacity =
            "0.85";

        value.style.textAlign =
            "right";

        if (
            result?.status ===
            "verified" &&
            result?.freshRead ===
            true
        ) {
            icon.textContent =
                "✓";

            const formatted =
                formatMoney(
                    result.value
                );

            value.textContent =
                formatted ||
                "Verified";
        } else if (
            result?.status ===
                "timeout" ||
            result?.status ===
                "navigation-failed"
        ) {
            icon.textContent =
                "⚠";

            value.textContent =
                result.status ===
                "timeout"
                    ? "Could not verify"
                    : "Unavailable";
        } else if (
            isCurrent
        ) {
            icon.textContent =
                "→";

            value.textContent =
                "Verifying...";
        } else {
            icon.textContent =
                "○";

            value.textContent =
                "Pending";
        }

        row.append(
            icon,
            label,
            value
        );

        return row;
    }

    function renderProgressOverlay(
        session,
        {
            completed =
                false,
        } = {}
    ) {
        if (
            !document.body
        ) {
            globalThis.setTimeout(
                () => {
                    renderProgressOverlay(
                        session,
                        {
                            completed,
                        }
                    );
                },
                100
            );

            return;
        }

        removeProgressOverlay();

        const overlay =
            document.createElement(
                "div"
            );

        overlay.id =
            OVERLAY_ID;

        overlay.style.position =
            "fixed";

        overlay.style.top =
            "18px";

        overlay.style.right =
            "18px";

        overlay.style.zIndex =
            "2147483647";

        overlay.style.width =
            "340px";

        overlay.style.maxWidth =
            "calc(100vw - 36px)";

        overlay.style.padding =
            "14px 16px";

        overlay.style.borderRadius =
            "8px";

        overlay.style.background =
            "rgba(24, 26, 29, 0.97)";

        overlay.style.border =
            "1px solid rgba(255, 255, 255, 0.14)";

        overlay.style.boxShadow =
            "0 8px 28px rgba(0, 0, 0, 0.45)";

        overlay.style.color =
            "#f2f2f2";

        overlay.style.fontFamily =
            "Arial, Helvetica, sans-serif";

        overlay.style.fontSize =
            "13px";

        overlay.style.lineHeight =
            "1.35";

        overlay.style.pointerEvents =
            "none";

        const title =
            document.createElement(
                "div"
            );

        title.textContent =
            completed
                ? "TACTIC • Funding Sources Updated"
                : "TACTIC • Updating Funding Sources";

        title.style.fontSize =
            "14px";

        title.style.fontWeight =
            "700";

        title.style.marginBottom =
            "8px";

        overlay.appendChild(
            title
        );

        for (
            const step of
            STEPS
        ) {
            overlay.appendChild(
                createProgressRow(
                    step,
                    session
                )
            );
        }

        const footer =
            document.createElement(
                "div"
            );

        footer.style.marginTop =
            "8px";

        footer.style.paddingTop =
            "8px";

        footer.style.borderTop =
            "1px solid rgba(255, 255, 255, 0.10)";

        footer.style.opacity =
            "0.75";

        footer.style.fontSize =
            "12px";

        const verifiedCount =
            STEPS.filter(
                step => {
                    const result =
                        getStepResult(
                            session,
                            step
                        );

                    return (
                        result?.status ===
                            "verified" &&
                        result?.freshRead ===
                            true
                    );
                }
            ).length;

        if (completed) {
            footer.textContent =
                `${verifiedCount} of ${STEPS.length} freshly verified`;
        } else {
            const currentNumber =
                Number.isSafeInteger(
                    session?.stepIndex
                )
                    ? Math.min(
                        session.stepIndex +
                            1,
                        STEPS.length
                    )
                    : 1;

            footer.textContent =
                `Step ${currentNumber} of ${STEPS.length}`;
        }

        overlay.appendChild(
            footer
        );

        document.body.appendChild(
            overlay
        );
    }

    function renderActiveProgress() {
        const session =
            readSession();

        if (
            !session ||
            session.active !==
                true
        ) {
            return;
        }

        renderProgressOverlay(
            session
        );
    }

    function showCompletionOverlay(
        session
    ) {
        renderProgressOverlay(
            session,
            {
                completed:
                    true,
            }
        );

        globalThis.setTimeout(
            removeProgressOverlay,
            COMPLETION_OVERLAY_MS
        );
    }

    function getSnapshotReadAt(
        snapshot
    ) {
        if (
            Number.isFinite(
                snapshot?.lastLiveReadAt
            )
        ) {
            return snapshot.lastLiveReadAt;
        }

        return null;
    }

    function isFreshSnapshot(
        snapshot,
        stepStartedAt
    ) {
        const lastLiveReadAt =
            getSnapshotReadAt(
                snapshot
            );

        return (
            Number.isFinite(
                lastLiveReadAt
            ) &&
            Number.isFinite(
                stepStartedAt
            ) &&
            lastLiveReadAt >=
                stepStartedAt
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

        if (
            session?.active ===
            true
        ) {
            globalThis.setTimeout(
                () => {
                    renderProgressOverlay(
                        session
                    );
                },
                0
            );
        }

        return session;

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
        status,
        options = {}
    ) {
        const stepStartedAt =
            Number.isFinite(
                options.stepStartedAt
            )
                ? options.stepStartedAt
                : null;

        const verifiedAt =
            Number.isFinite(
                options.verifiedAt
            )
                ? options.verifiedAt
                : null;

        const lastLiveReadAt =
            getSnapshotReadAt(
                snapshot
            );

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

            /*
             * Freshness audit information.
             */
            freshRead:
                isFreshSnapshot(
                    snapshot,
                    stepStartedAt
                ),

            stepStartedAt,

            lastLiveReadAt,

            verifiedAt,

            durationMs:
                Number.isFinite(
                    stepStartedAt
                ) &&
                Number.isFinite(
                    verifiedAt
                )
                    ? Math.max(
                        0,
                        verifiedAt -
                            stepStartedAt
                    )
                    : null,
        };
    }

    async function waitForStepData(
        step,
        session
    ) {
        const stepStartedAt =
            Number.isFinite(
                session.stepStartedAt
            )
                ? session.stepStartedAt
                : Date.now();

        session.stepStartedAt =
            stepStartedAt;

        saveSession(
            session
        );

        const deadline =
            stepStartedAt +
            STEP_TIMEOUT_MS;

        while (
            Date.now() <
            deadline
        ) {
            try {
                const refresh =
                    financeRepository[
                        step.refreshMethod
                    ];

                /*
                 * Force the repository to read the currently loaded
                 * Torn page instead of relying on its previous state.
                 */
                let refreshedSnapshot =
                    null;

                if (
                    typeof refresh ===
                    "function"
                ) {
                    refreshedSnapshot =
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
                    refreshedSnapshot ||
                    (
                        typeof getter ===
                        "function"
                            ? getter()
                            : null
                    );

                const ready =
                    step.isReady(
                        snapshot
                    );

                const fresh =
                    isFreshSnapshot(
                        snapshot,
                        stepStartedAt
                    );

                if (
                    ready &&
                    fresh
                ) {
                    /*
                     * We now know the repository performed a live read
                     * after this refresh step began.
                     *
                     * Keep the page open for at least 1.5 seconds total
                     * so Torn's SPA/DOM state has time to stabilize.
                     */
                    const elapsed =
                        Date.now() -
                        stepStartedAt;

                    const dwellRemaining =
                        Math.max(
                            0,
                            MIN_STEP_DWELL_MS -
                                elapsed
                        );

                    if (
                        dwellRemaining >
                        0
                    ) {
                        await delay(
                            dwellRemaining
                        );
                    }

                    /*
                     * Perform one final read after stabilization.
                     */
                    let finalSnapshot =
                        snapshot;

                    try {
                        const finalRefresh =
                            financeRepository[
                                step
                                    .refreshMethod
                            ];

                        if (
                            typeof finalRefresh ===
                            "function"
                        ) {
                            finalSnapshot =
                                finalRefresh(
                                    "funding-source-refresh-final-verification",
                                    {
                                        forceNotify:
                                            true,
                                    }
                                ) ||
                                finalSnapshot;
                        }
                    } catch (
                        error
                    ) {
                        logger?.warn(
                            `Funding refresh final verification failed for ${step.label}`,
                            {
                                step:
                                    step.id,

                                error,
                            }
                        );
                    }

                    const verifiedAt =
                        Date.now();

                    const finalReady =
                        step.isReady(
                            finalSnapshot
                        );

                    const finalFresh =
                        isFreshSnapshot(
                            finalSnapshot,
                            stepStartedAt
                        );

                    if (
                        finalReady &&
                        finalFresh
                    ) {
                        recordResult(
                            session,
                            step.id,
                            buildSnapshotResult(
                                step,
                                finalSnapshot,
                                "verified",
                                {
                                    stepStartedAt,
                                    verifiedAt,
                                }
                            )
                        );

                        logger?.info(
                            `Finance funding source verified: ${step.label}`,
                            {
                                step:
                                    step.id,

                                value:
                                    finalSnapshot
                                        ?.value ??
                                    null,

                                lastLiveReadAt:
                                    finalSnapshot
                                        ?.lastLiveReadAt ??
                                    null,

                                durationMs:
                                    verifiedAt -
                                    stepStartedAt,
                            }
                        );

                        return {
                            success:
                                true,

                            fresh:
                                true,

                            snapshot:
                                finalSnapshot,

                            stepStartedAt,

                            verifiedAt,

                            durationMs:
                                verifiedAt -
                                stepStartedAt,
                        };
                    }
                }
            } catch (
                error
            ) {
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

        const timedOutAt =
            Date.now();

        recordResult(
            session,
            step.id,
            buildSnapshotResult(
                step,
                finalSnapshot,
                "timeout",
                {
                    stepStartedAt,
                    verifiedAt:
                        timedOutAt,
                }
            )
        );

        logger?.warn(
            `Finance funding source could not be freshly verified: ${step.label}`,
            {
                step:
                    step.id,

                lastLiveReadAt:
                    finalSnapshot
                        ?.lastLiveReadAt ??
                    null,

                stepStartedAt,

                durationMs:
                    timedOutAt -
                    stepStartedAt,
            }
        );

        return {
            success:
                false,

            fresh:
                false,

            reason:
                "step-timeout",

            snapshot:
                finalSnapshot,

            stepStartedAt,

            verifiedAt:
                timedOutAt,

            durationMs:
                timedOutAt -
                stepStartedAt,
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

        showCompletionOverlay(
            session
        );

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
                /*
                 * Persist this before leaving the current page.
                 *
                 * The next userscript instance can then prove that the
                 * destination-page snapshot was read after navigation began.
                 */
                session.stepStartedAt =
                    Date.now();

                saveSession(
                    session
                );

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

                    session.currentStep =
                        null;

                    session.stepStartedAt =
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
                }

                return true;
            }

            if (
                !Number.isFinite(
                    session.stepStartedAt
                )
            ) {
                session.stepStartedAt =
                    Date.now();

                saveSession(
                    session
                );
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

            session.stepStartedAt =
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

            stepStartedAt:
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

    function restoreProgressOverlay() {
        const session =
            readSession();

        if (
            session?.active ===
            true
        ) {
            renderProgressOverlay(
                session
            );

            return;
        }

        const lastResult =
            storage.get(
                LAST_RESULT_KEY,
                null
            );

        if (
            lastResult?.status !==
                "completed" ||
            !Number.isFinite(
                lastResult?.completedAt
            )
        ) {
            return;
        }

        const age =
            Date.now() -
            lastResult.completedAt;

        /*
         * Only restore a completion message immediately following
         * a funding refresh. Do not resurrect an old result during
         * normal browsing later.
         */
        if (
            age < 0 ||
            age >
                COMPLETION_OVERLAY_MS +
                    3_000
        ) {
            return;
        }

        showCompletionOverlay(
            lastResult
        );
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
            restoreProgressOverlay();

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