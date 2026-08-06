/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * modules/finance/sections/wallet.js
 *
 * Purpose:
 * Displays the current wallet position inside the unified
 * Finance application.
 *
 * Responsibilities:
 * - Register the Wallet Finance section
 * - Read wallet data from Finance Repository
 * - Display current balance and latest movement
 * - Display Wallet Protection recommendations
 * - Refresh when Finance Repository wallet data changes
 * - Refresh when Protection settings change
 * - Open Wallet Protection when supported by the Drawer
 * - Expose Wallet section diagnostics
 *
 * Does NOT:
 * - Read Torn's DOM directly
 * - Maintain its own wallet observer
 * - Deposit or withdraw money
 * - Submit or confirm financial transactions
 * - Duplicate Protection business rules
 *
 * Dependencies:
 * - modules/finance/index.js
 * - repositories/finance/index.js
 * - modules/protection/index.js
 * - core/events.js
 * - core/logger.js
 * - ui/drawer/index.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Finance Wallet] Namespace is unavailable."
        );

        return;
    }

    if (
        !TACTIC.finance ||
        typeof TACTIC.finance.registerSection !==
            "function"
    ) {
        console.error(
            "[TACTIC Finance Wallet] Finance application is unavailable."
        );

        return;
    }

    const financeRepository =
        TACTIC.repositories?.finance;

    if (
        !financeRepository ||
        typeof financeRepository.getWallet !==
            "function" ||
        typeof financeRepository.subscribe !==
            "function"
    ) {
        console.error(
            "[TACTIC Finance Wallet] Finance Repository is unavailable."
        );

        return;
    }

    const services =
        TACTIC.services ||
        {};

    const drawer =
        services.drawer;

    const events =
        services.events;

    const logger =
        services.logger;

    const notifications =
        services.notifications;

    const SECTION_ID =
        "wallet";

    const SECTION_NAME =
        "Wallet";

    const SECTION_ORDER =
        100;

    const PROTECTION_MODULE_ID =
        "protection";

    const SETTINGS_CHANGED_EVENT =
        TACTIC.EVENTS
            ?.SETTINGS
            ?.CHANGED ||
        "settings:changed";

    const FINANCE_WALLET_CHANGED_EVENT =
        financeRepository.events
            ?.WALLET_CHANGED ||
        "finance:wallet-changed";

    let initializedAt =
        Date.now();

    let destroyedAt =
        null;

    let latestWallet =
        financeRepository.getWallet();

    let unsubscribeWallet =
        null;

    const removeEventListeners =
        [];

    let refreshScheduled =
        false;

    let refreshTimerId =
        null;

    const metrics = {
        loadedAt:
            Date.now(),

        renders:
            0,

        walletUpdates:
            0,

        protectionReads:
            0,

        refreshRequests:
            0,

        refreshesScheduled:
            0,

        refreshesCompleted:
            0,

        refreshesSkipped:
            0,

        protectionOpenRequests:
            0,

        protectionOpenSuccesses:
            0,

        protectionOpenFailures:
            0,

        lastRenderedAt:
            null,

        lastWalletUpdateAt:
            null,

        lastRefreshRequestedAt:
            null,

        lastRefreshCompletedAt:
            null,

        lastProtectionReadAt:
            null,

        lastProtectionOpenAt:
            null,

        lastError:
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

    function createElement(
        tagName,
        options = {}
    ) {
        const element =
            document.createElement(
                tagName
            );

        if (
            options.text !==
            undefined
        ) {
            element.textContent =
                String(
                    options.text
                );
        }

        if (options.className) {
            element.className =
                options.className;
        }

        if (options.styles) {
            Object.assign(
                element.style,
                options.styles
            );
        }

        if (options.attributes) {
            for (
                const [
                    name,
                    value,
                ] of Object.entries(
                    options.attributes
                )
            ) {
                element.setAttribute(
                    name,
                    String(value)
                );
            }
        }

        return element;
    }

    function formatMoney(
        value
    ) {
        if (
            !Number.isFinite(
                value
            )
        ) {
            return "Unavailable";
        }

        return new Intl.NumberFormat(
            "en-US",
            {
                style:
                    "currency",

                currency:
                    "USD",

                maximumFractionDigits:
                    0,
            }
        ).format(
            value
        );
    }

    function formatSignedMoney(
        value
    ) {
        if (
            !Number.isFinite(
                value
            )
        ) {
            return "Unavailable";
        }

        if (value === 0) {
            return "$0";
        }

        const prefix =
            value > 0
                ? "+"
                : "−";

        return (
            prefix +
            formatMoney(
                Math.abs(
                    value
                )
            )
        );
    }

    function formatRelativeTime(
        timestamp
    ) {
        if (
            !Number.isFinite(
                timestamp
            )
        ) {
            return "Not yet recorded";
        }

        const elapsedMs =
            Math.max(
                0,
                Date.now() -
                timestamp
            );

        const elapsedSeconds =
            Math.floor(
                elapsedMs /
                1_000
            );

        if (
            elapsedSeconds <
            5
        ) {
            return "Just now";
        }

        if (
            elapsedSeconds <
            60
        ) {
            return `${elapsedSeconds} seconds ago`;
        }

        const elapsedMinutes =
            Math.floor(
                elapsedSeconds /
                60
            );

        if (
            elapsedMinutes <
            60
        ) {
            return `${elapsedMinutes} minute${
                elapsedMinutes === 1
                    ? ""
                    : "s"
            } ago`;
        }

        const elapsedHours =
            Math.floor(
                elapsedMinutes /
                60
            );

        if (
            elapsedHours <
            24
        ) {
            return `${elapsedHours} hour${
                elapsedHours === 1
                    ? ""
                    : "s"
            } ago`;
        }

        const elapsedDays =
            Math.floor(
                elapsedHours /
                24
            );

        return `${elapsedDays} day${
            elapsedDays === 1
                ? ""
                : "s"
        } ago`;
    }

    function getDirectionPresentation(
        wallet
    ) {
        if (
            wallet?.direction ===
            "increase"
        ) {
            return {
                label:
                    "Increase",

                symbol:
                    "▲",

                color:
                    "#8fd694",

                background:
                    "rgba(76,175,80,.10)",

                border:
                    "rgba(76,175,80,.24)",
            };
        }

        if (
            wallet?.direction ===
            "decrease"
        ) {
            return {
                label:
                    "Decrease",

                symbol:
                    "▼",

                color:
                    "#ff9d9d",

                background:
                    "rgba(220,70,70,.10)",

                border:
                    "rgba(220,70,70,.24)",
            };
        }

        return {
            label:
                "No recent change",

            symbol:
                "●",

            color:
                "#bdbdbd",

            background:
                "rgba(255,255,255,.04)",

            border:
                "rgba(255,255,255,.12)",
        };
    }

    function getProtectionSnapshot() {
        metrics.protectionReads +=
            1;

        metrics.lastProtectionReadAt =
            Date.now();

        try {
            const inspection =
                TACTIC.protection
                    ?.inspect?.();

            if (!inspection) {
                return {
                    available:
                        false,

                    enabled:
                        false,

                    evaluation:
                        null,

                    configuration:
                        null,

                    reason:
                        "protection-unavailable",
                };
            }

            const evaluation =
                inspection.evaluation ||
                null;

            const configuration =
                inspection.configuration ||
                null;

            return {
                available:
                    true,

                enabled:
                    configuration
                        ?.enabled ===
                    true,

                evaluation,

                configuration,

                reason:
                    evaluation
                        ?.reason ||
                    null,
            };
        } catch (error) {
            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            return {
                available:
                    false,

                enabled:
                    false,

                evaluation:
                    null,

                configuration:
                    null,

                reason:
                    "protection-inspection-failed",

                error:
                    cloneValue(
                        metrics.lastError
                    ),
            };
        }
    }

    function createCard(
        label,
        value,
        options = {}
    ) {
        const card =
            createElement(
                "div",
                {
                    styles: {
                        boxSizing:
                            "border-box",

                        minWidth:
                            "0",

                        padding:
                            "10px 11px",

                        border:
                            `1px solid ${
                                options.border ||
                                "rgba(255,255,255,.11)"
                            }`,

                        borderRadius:
                            "6px",

                        background:
                            options.background ||
                            "rgba(255,255,255,.035)",
                    },
                }
            );

        const labelElement =
            createElement(
                "div",
                {
                    text:
                        label,

                    styles: {
                        marginBottom:
                            "4px",

                        color:
                            "#969696",

                        fontSize:
                            "10px",

                        fontWeight:
                            "700",

                        letterSpacing:
                            ".04em",

                        textTransform:
                            "uppercase",
                    },
                }
            );

        const valueElement =
            createElement(
                "div",
                {
                    text:
                        value,

                    styles: {
                        color:
                            options.color ||
                            "#f1f1f1",

                        fontSize:
                            options.compact
                                ? "12px"
                                : "15px",

                        fontWeight:
                            "700",

                        lineHeight:
                            "1.25",

                        overflowWrap:
                            "anywhere",
                    },
                }
            );

        card.append(
            labelElement,
            valueElement
        );

        return card;
    }

    function createButton(
        text,
        onClick,
        options = {}
    ) {
        const button =
            createElement(
                "button",
                {
                    text,

                    attributes: {
                        type:
                            "button",
                    },

                    styles: {
                        boxSizing:
                            "border-box",

                        width:
                            "100%",

                        padding:
                            "9px 11px",

                        border:
                            "1px solid rgba(255,255,255,.16)",

                        borderRadius:
                            "5px",

                        background:
                            options.primary
                                ? "rgba(75,145,230,.24)"
                                : "rgba(255,255,255,.06)",

                        color:
                            "#f2f2f2",

                        cursor:
                            options.disabled
                                ? "not-allowed"
                                : "pointer",

                        fontSize:
                            "12px",

                        fontWeight:
                            "700",

                        opacity:
                            options.disabled
                                ? ".5"
                                : "1",
                    },
                }
            );

        button.disabled =
            options.disabled ===
            true;

        if (
            !button.disabled &&
            typeof onClick ===
                "function"
        ) {
            button.addEventListener(
                "click",
                onClick
            );
        }

        return button;
    }

    function canOpenProtection() {
        return (
            typeof drawer
                ?.openModule ===
                "function" ||
            typeof drawer
                ?.activateModule ===
                "function" ||
            typeof drawer
                ?.selectModule ===
                "function" ||
            typeof drawer
                ?.showModule ===
                "function"
        );
    }

    async function openProtection() {
        metrics.protectionOpenRequests +=
            1;

        metrics.lastProtectionOpenAt =
            Date.now();

        try {
            let result;

            if (
                typeof drawer
                    ?.openModule ===
                "function"
            ) {
                result =
                    await drawer.openModule(
                        PROTECTION_MODULE_ID
                    );
            } else if (
                typeof drawer
                    ?.activateModule ===
                "function"
            ) {
                result =
                    await drawer.activateModule(
                        PROTECTION_MODULE_ID
                    );
            } else if (
                typeof drawer
                    ?.selectModule ===
                "function"
            ) {
                result =
                    await drawer.selectModule(
                        PROTECTION_MODULE_ID
                    );
            } else if (
                typeof drawer
                    ?.showModule ===
                "function"
            ) {
                result =
                    await drawer.showModule(
                        PROTECTION_MODULE_ID
                    );
            } else {
                metrics.protectionOpenFailures +=
                    1;

                notifications?.warning?.(
                    "The Drawer does not currently expose module navigation.",
                    {
                        title:
                            "Wallet Protection",

                        group:
                            "finance",
                    }
                );

                return {
                    success:
                        false,

                    opened:
                        false,

                    reason:
                        "drawer-module-navigation-unavailable",
                };
            }

            metrics.protectionOpenSuccesses +=
                1;

            return {
                success:
                    true,

                opened:
                    true,

                result,
            };
        } catch (error) {
            metrics.protectionOpenFailures +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            logger?.error(
                "Finance Wallet could not open Protection",
                {
                    error,
                }
            );

            notifications?.warning?.(
                "Wallet Protection could not be opened.",
                {
                    title:
                        "Finance",

                    group:
                        "finance",
                }
            );

            return {
                success:
                    false,

                opened:
                    false,

                reason:
                    "protection-open-failed",

                error:
                    cloneValue(
                        metrics.lastError
                    ),
            };
        }
    }

    async function refreshFinance(
        reason
    ) {
        metrics.refreshRequests +=
            1;

        metrics.lastRefreshRequestedAt =
            Date.now();

        if (
            typeof TACTIC.finance
                ?.refresh !==
            "function"
        ) {
            metrics.refreshesSkipped +=
                1;

            return false;
        }

        const result =
            await TACTIC.finance.refresh(
                reason
            );

        if (
            result?.refreshed ===
            true
        ) {
            metrics.refreshesCompleted +=
                1;

            metrics.lastRefreshCompletedAt =
                Date.now();

            return true;
        }

        metrics.refreshesSkipped +=
            1;

        return false;
    }

    function scheduleRefresh(
        reason =
            "wallet-section-change"
    ) {
        if (refreshScheduled) {
            return false;
        }

        refreshScheduled =
            true;

        metrics.refreshesScheduled +=
            1;

        refreshTimerId =
            globalThis.setTimeout(
                async () => {
                    refreshScheduled =
                        false;

                    refreshTimerId =
                        null;

                    try {
                        await refreshFinance(
                            reason
                        );
                    } catch (error) {
                        metrics.lastError =
                            createErrorSnapshot(
                                error
                            );

                        logger?.error(
                            "Finance Wallet scheduled refresh failed",
                            {
                                reason,
                                error,
                            }
                        );
                    }
                },
                50
            );

        return true;
    }

    async function render(
        container
    ) {
        metrics.renders +=
            1;

        metrics.lastRenderedAt =
            Date.now();

        latestWallet =
            financeRepository.getWallet();

        const wallet =
            latestWallet ||
            {};

        const protection =
            getProtectionSnapshot();

        const evaluation =
            protection.evaluation ||
            {};

        const configuration =
            protection.configuration ||
            {};

        const movement =
            getDirectionPresentation(
                wallet
            );

        const wrapper =
            createElement(
                "div",
                {
                    className:
                        "tactic-finance-wallet-content",

                    styles: {
                        display:
                            "grid",

                        gap:
                            "11px",

                        padding:
                            "1px 0",
                    },
                }
            );

        const header =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "flex",

                        alignItems:
                            "center",

                        justifyContent:
                            "space-between",

                        gap:
                            "10px",

                        paddingBottom:
                            "8px",

                        borderBottom:
                            "1px solid rgba(255,255,255,.10)",
                    },
                }
            );

        const titleGroup =
            createElement(
                "div"
            );

        const title =
            createElement(
                "h3",
                {
                    text:
                        "Wallet",

                    styles: {
                        margin:
                            "0",

                        color:
                            "#eee",

                        fontSize:
                            "15px",

                        lineHeight:
                            "1.2",
                    },
                }
            );

        const subtitle =
            createElement(
                "div",
                {
                    text:
                        wallet.available
                            ? `Updated ${formatRelativeTime(
                                  wallet.updatedAt
                              )}`
                            : "Wallet balance is unavailable",

                    styles: {
                        marginTop:
                            "3px",

                        color:
                            "#8f8f8f",

                        fontSize:
                            "10px",
                    },
                }
            );

        titleGroup.append(
            title,
            subtitle
        );

        const statusBadge =
            createElement(
                "div",
                {
                    text:
                        protection.enabled
                            ? "Protected"
                            : "Unprotected",

                    styles: {
                        flex:
                            "0 0 auto",

                        padding:
                            "5px 8px",

                        border:
                            `1px solid ${
                                protection.enabled
                                    ? "rgba(76,175,80,.28)"
                                    : "rgba(245,166,35,.28)"
                            }`,

                        borderRadius:
                            "999px",

                        background:
                            protection.enabled
                                ? "rgba(76,175,80,.10)"
                                : "rgba(245,166,35,.09)",

                        color:
                            protection.enabled
                                ? "#a5d6a7"
                                : "#ffcc80",

                        fontSize:
                            "10px",

                        fontWeight:
                            "700",

                        textTransform:
                            "uppercase",
                    },
                }
            );

        header.append(
            titleGroup,
            statusBadge
        );

        const primaryBalance =
            createElement(
                "div",
                {
                    styles: {
                        padding:
                            "13px 14px",

                        border:
                            "1px solid rgba(255,255,255,.12)",

                        borderRadius:
                            "7px",

                        background:
                            "rgba(255,255,255,.04)",
                    },
                }
            );

        const balanceLabel =
            createElement(
                "div",
                {
                    text:
                        "Current Balance",

                    styles: {
                        color:
                            "#999",

                        fontSize:
                            "10px",

                        fontWeight:
                            "700",

                        letterSpacing:
                            ".04em",

                        textTransform:
                            "uppercase",
                    },
                }
            );

        const balanceValue =
            createElement(
                "div",
                {
                    text:
                        wallet.available
                            ? formatMoney(
                                  wallet.value
                              )
                            : "Unavailable",

                    styles: {
                        marginTop:
                            "3px",

                        color:
                            "#fff",

                        fontSize:
                            "24px",

                        fontWeight:
                            "800",

                        letterSpacing:
                            "-.02em",

                        overflowWrap:
                            "anywhere",
                    },
                }
            );

        const movementText =
            wallet.previousValue ===
            null ||
            wallet.previousValue ===
            undefined
                ? "Waiting for the first wallet change"
                : `${movement.symbol} ${formatSignedMoney(
                      wallet.delta
                  )} since the previous reading`;

        const movementElement =
            createElement(
                "div",
                {
                    text:
                        movementText,

                    styles: {
                        marginTop:
                            "7px",

                        color:
                            movement.color,

                        fontSize:
                            "11px",

                        fontWeight:
                            "600",
                    },
                }
            );

        primaryBalance.append(
            balanceLabel,
            balanceValue,
            movementElement
        );

        const summaryGrid =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gridTemplateColumns:
                            "repeat(2, minmax(0,1fr))",

                        gap:
                            "7px",
                    },
                }
            );

        summaryGrid.append(
            createCard(
                "Previous Balance",
                Number.isFinite(
                    wallet.previousValue
                )
                    ? formatMoney(
                          wallet.previousValue
                      )
                    : "Not yet recorded"
            ),

            createCard(
                "Latest Movement",
                wallet.previousValue ===
                    null ||
                wallet.previousValue ===
                    undefined
                    ? "Waiting"
                    : formatSignedMoney(
                          wallet.delta
                      ),
                {
                    color:
                        movement.color,

                    background:
                        movement.background,

                    border:
                        movement.border,
                }
            ),

            createCard(
                "Keep in Wallet",
                Number.isFinite(
                    configuration.reserve
                )
                    ? formatMoney(
                          configuration.reserve
                      )
                    : "Unavailable"
            ),

            createCard(
                "Available Above Reserve",
                Number.isFinite(
                    wallet.value
                ) &&
                Number.isFinite(
                    configuration.reserve
                )
                    ? formatMoney(
                          Math.max(
                              0,
                              wallet.value -
                              configuration.reserve
                          )
                      )
                    : "Unavailable"
            ),

            createCard(
                "Recommended Deposit",
                Number.isFinite(
                    evaluation.depositAmount
                )
                    ? formatMoney(
                          evaluation.depositAmount
                      )
                    : "$0"
            ),

            createCard(
                "Protection Status",
                protection.available
                    ? (
                          evaluation.shouldDeposit
                              ? "Deposit Recommended"
                              : protection.enabled
                                ? "Wallet Within Limit"
                                : "Protection Disabled"
                      )
                    : "Unavailable",
                {
                    compact:
                        true,

                    color:
                        evaluation.shouldDeposit
                            ? "#ffcc80"
                            : protection.enabled
                              ? "#a5d6a7"
                              : "#bdbdbd",
                }
            )
        );

        const actions =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gridTemplateColumns:
                            canOpenProtection()
                                ? "1fr 1fr"
                                : "1fr",

                        gap:
                            "7px",
                    },
                }
            );

        const refreshButton =
            createButton(
                "Refresh Wallet",
                async () => {
                    latestWallet =
                        financeRepository
                            .refreshWallet(
                                "finance-wallet-ui"
                            );

                    await refreshFinance(
                        "finance-wallet-manual-refresh"
                    );
                }
            );

        actions.appendChild(
            refreshButton
        );

        if (
            canOpenProtection()
        ) {
            actions.appendChild(
                createButton(
                    "Open Protection",
                    openProtection,
                    {
                        primary:
                            evaluation.shouldDeposit ===
                            true,
                    }
                )
            );
        }

        wrapper.append(
            header,
            primaryBalance,
            summaryGrid,
            actions
        );

        container.replaceChildren(
            wrapper
        );
    }

    function inspect() {
        return {
            section:
                SECTION_ID,

            name:
                SECTION_NAME,

            order:
                SECTION_ORDER,

            initializedAt,

            destroyedAt,

            wallet:
                cloneValue(
                    latestWallet
                ),

            protection:
                getProtectionSnapshot(),

            refreshScheduled,

            dependencies: {
                financeApplication:
                    Boolean(
                        TACTIC.finance
                    ),

                financeRepository:
                    Boolean(
                        financeRepository
                    ),

                protection:
                    Boolean(
                        TACTIC.protection
                    ),

                drawer:
                    Boolean(
                        drawer
                    ),

                events:
                    Boolean(
                        events
                    ),
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
        };
    }

    const sectionDefinition = {
        id:
            SECTION_ID,

        name:
            SECTION_NAME,

        icon:
            "💵",

        order:
            SECTION_ORDER,

        enabled:
            true,

        metadata: {
            application:
                "finance",

            dataSource:
                "repository:finance",

            stateKey:
                financeRepository
                    .stateKeys
                    ?.WALLET ||
                "finance.wallet",

            protectionIntegration:
                true,
        },

        render,

        destroy() {
            if (
                refreshTimerId !==
                null
            ) {
                globalThis.clearTimeout(
                    refreshTimerId
                );

                refreshTimerId =
                    null;
            }

            refreshScheduled =
                false;

            if (
                typeof unsubscribeWallet ===
                "function"
            ) {
                unsubscribeWallet();

                unsubscribeWallet =
                    null;
            }

            while (
                removeEventListeners
                    .length >
                0
            ) {
                const removeListener =
                    removeEventListeners
                        .pop();

                if (
                    typeof removeListener ===
                    "function"
                ) {
                    removeListener();
                }
            }

            destroyedAt =
                Date.now();

            logger?.info(
                "Finance Wallet section destroyed"
            );
        },
    };

    TACTIC.finance.registerSection(
        sectionDefinition
    );

    unsubscribeWallet =
        financeRepository.subscribe(
            financeRepository
                .keys
                .WALLET,
            ({
                value,
            }) => {
                latestWallet =
                    value;

                metrics.walletUpdates +=
                    1;

                metrics.lastWalletUpdateAt =
                    Date.now();

                scheduleRefresh(
                    FINANCE_WALLET_CHANGED_EVENT
                );
            }
        );

    const removeSettingsListener =
        events?.on?.(
            SETTINGS_CHANGED_EVENT,
            ({
                namespace,
            }) => {
                if (
                    namespace !==
                    "protection"
                ) {
                    return;
                }

                scheduleRefresh(
                    SETTINGS_CHANGED_EVENT
                );
            }
        );

    if (
        typeof removeSettingsListener ===
        "function"
    ) {
        removeEventListeners.push(
            removeSettingsListener
        );
    }

    /*
     * Public diagnostics are kept separate from the section
     * registration snapshot.
     */
    TACTIC.finance.walletSection =
        Object.freeze({
            inspect,

            refresh(
                reason =
                    "wallet-section-api"
            ) {
                return refreshFinance(
                    reason
                );
            },

            openProtection,
        });

    logger?.info(
        "Finance Wallet section loaded",
        {
            sectionId:
                SECTION_ID,

            order:
                SECTION_ORDER,

            stateKey:
                financeRepository
                    .stateKeys
                    ?.WALLET ||
                "finance.wallet",
        }
    );
})();