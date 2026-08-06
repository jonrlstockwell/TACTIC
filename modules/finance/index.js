/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * modules/finance/index.js
 *
 * Purpose:
 * Provides the Finance application shell, internal tab
 * navigation, overview workspace, and registered Finance
 * section rendering.
 *
 * Responsibilities:
 * - Create or retrieve the Finance Section Manager
 * - Register the Finance drawer module
 * - Generate tabs from registered Finance sections
 * - Provide a compact Finance overview
 * - Render one Finance section at a time
 * - Persist the selected Finance tab
 * - Refresh the active Finance workspace when data changes
 * - Expose Finance application diagnostics and navigation
 *
 * Does NOT:
 * - Scrape Torn financial data
 * - Own wallet, bank, stock, income, or net-worth data
 * - Perform financial transactions
 * - Contain section-specific business logic
 *
 * Public API:
 * - TACTIC.finance.sections
 * - TACTIC.finance.registerSection()
 * - TACTIC.finance.unregisterSection()
 * - TACTIC.finance.enableSection()
 * - TACTIC.finance.disableSection()
 * - TACTIC.finance.getSection()
 * - TACTIC.finance.getSections()
 * - TACTIC.finance.getActiveTab()
 * - TACTIC.finance.setActiveTab()
 * - TACTIC.finance.refresh()
 * - TACTIC.finance.inspect()
 *
 * Dependencies:
 * - core/section-manager.js
 * - core/module-manager.js
 * - core/storage.js
 * - core/events.js
 * - core/logger.js
 * - core/health.js
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
            "[TACTIC Finance] Namespace is unavailable."
        );

        return;
    }

    if (
        typeof TACTIC.createSectionManager !==
            "function" ||
        typeof TACTIC.getSectionManager !==
            "function"
    ) {
        console.error(
            "[TACTIC Finance] Section Manager framework is unavailable."
        );

        return;
    }

    if (
        typeof TACTIC.registerModule !==
        "function"
    ) {
        console.error(
            "[TACTIC Finance] Module Manager is unavailable."
        );

        return;
    }

    if (
        !TACTIC.finance ||
        typeof TACTIC.finance !==
            "object"
    ) {
        TACTIC.finance = {};
    }

    const MODULE_ID =
        "finance";

    const SECTION_MANAGER_ID =
        "finance";

    const OVERVIEW_TAB_ID =
        "overview";

    const STORAGE_KEY =
        "finance:active-tab";

    const MODULE_VERSION =
        "1.2.0";

    const MODULE_ORDER =
        200;

    const services =
        TACTIC.services ||
        {};

    const drawer =
        services.drawer;

    const events =
        services.events;

    const logger =
        services.logger;

    const health =
        services.health;

    const storage =
        services.storage;

    const financeAdvisor =
        services.financeAdvisor;

    if (!drawer) {
        console.error(
            "[TACTIC Finance] Drawer service is unavailable."
        );

        return;
    }

    const SECTION_EVENTS =
        services.sectionManager
            ?.events ||
        {};

    const sectionManager =
        TACTIC.getSectionManager(
            SECTION_MANAGER_ID
        ) ||
        TACTIC.createSectionManager(
            SECTION_MANAGER_ID
        );

    let initialized =
        false;

    let initializedAt =
        null;

    let destroyedAt =
        null;

    let rendering =
        false;

    let refreshPending =
        false;

    let refreshTimerId =
        null;

    let activeTabId =
        readStoredTab();

    const removeEventListeners =
        [];

    const metrics = {
        loadedAt:
            Date.now(),

        initializationCount:
            0,

        destructionCount:
            0,

        renderRequests:
            0,

        renderPasses:
            0,

        successfulRenders:
            0,

        failedRenders:
            0,

        overviewRenders:
            0,

        advisorEvaluations:
            0,

        advisorEvaluationFailures:
            0,

        advisorActions:
            0,

        sectionRenders:
            0,

        emptyStateRenders:
            0,

        tabChanges:
            0,

        rejectedTabChanges:
            0,

        refreshRequests:
            0,

        refreshesCompleted:
            0,

        refreshesSkipped:
            0,

        sectionEventsReceived:
            0,

        lastRenderStartedAt:
            null,

        lastRenderedAt:
            null,

        lastRenderDurationMs:
            null,

        lastRefreshRequestedAt:
            null,

        lastRefreshCompletedAt:
            null,

        lastTabChangedAt:
            null,

        lastAdvisorEvaluationAt:
            null,

        lastAdvisorActionAt:
            null,

        lastSectionEventAt:
            null,

        lastSectionEvent:
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

    function formatDuration(
        milliseconds
    ) {
        if (
            !Number.isFinite(
                milliseconds
            )
        ) {
            return "Unavailable";
        }

        const totalMinutes =
            Math.max(
                0,
                Math.floor(
                    milliseconds /
                    60_000
                )
            );

        const days =
            Math.floor(
                totalMinutes /
                1_440
            );

        const hours =
            Math.floor(
                (
                    totalMinutes %
                    1_440
                ) /
                60
            );

        const minutes =
            totalMinutes %
            60;

        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
        }

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }

        return `${minutes}m`;
    }

    function readStoredTab() {
        try {
            const stored =
                storage?.get?.(
                    STORAGE_KEY,
                    OVERVIEW_TAB_ID
                );

            return typeof stored ===
                "string" &&
                stored.trim()
                ? stored.trim()
                : OVERVIEW_TAB_ID;
        } catch {
            return OVERVIEW_TAB_ID;
        }
    }

    function storeActiveTab(
        tabId
    ) {
        try {
            storage?.set?.(
                STORAGE_KEY,
                tabId
            );
        } catch (error) {
            logger?.warn(
                "Finance active tab could not be stored",
                {
                    tabId,
                    error,
                }
            );
        }
    }

    function getEnabledSections() {
        return sectionManager.getAll({
            includeDisabled:
                false,
        });
    }

    function getAvailableTabIds() {
        return [
            OVERVIEW_TAB_ID,
            ...getEnabledSections()
                .map(
                    section =>
                        section.id
                ),
        ];
    }

    function isValidTab(
        tabId
    ) {
        return getAvailableTabIds()
            .includes(
                tabId
            );
    }

    function normalizeActiveTab() {
        if (
            isValidTab(
                activeTabId
            )
        ) {
            return activeTabId;
        }

        activeTabId =
            OVERVIEW_TAB_ID;

        storeActiveTab(
            activeTabId
        );

        return activeTabId;
    }

    function getActiveTab() {
        return normalizeActiveTab();
    }

    async function setActiveTab(
        tabId,
        options = {}
    ) {
        const normalized =
            String(
                tabId ||
                ""
            ).trim();

        if (
            !isValidTab(
                normalized
            )
        ) {
            metrics.rejectedTabChanges +=
                1;

            return {
                success:
                    false,

                changed:
                    false,

                reason:
                    "finance-tab-unavailable",

                requestedTab:
                    normalized,

                availableTabs:
                    getAvailableTabIds(),
            };
        }

        const previousTab =
            activeTabId;

        if (
            previousTab ===
            normalized
        ) {
            return {
                success:
                    true,

                changed:
                    false,

                previousTab,

                activeTab:
                    activeTabId,
            };
        }

        activeTabId =
            normalized;

        storeActiveTab(
            activeTabId
        );

        metrics.tabChanges +=
            1;

        metrics.lastTabChangedAt =
            Date.now();

        events?.emit?.(
            "finance:tab-changed",
            {
                previousTab,

                activeTab:
                    activeTabId,

                source:
                    options.source ||
                    "finance-api",

                timestamp:
                    Date.now(),
            }
        );

        if (
            options.refresh !==
            false
        ) {
            await refresh(
                "finance-tab-changed"
            );
        }

        return {
            success:
                true,

            changed:
                true,

            previousTab,

            activeTab:
                activeTabId,
        };
    }

    function isFinancePageActive() {
        return (
            drawer
                ?.getActiveModuleId?.() ===
            MODULE_ID
        );
    }

    function createPageHeader() {
        const header =
            createElement(
                "header",
                {
                    className:
                        "tactic-finance-header",

                    styles: {
                        display:
                            "grid",

                        gap:
                            "6px",

                        marginBottom:
                            "12px",
                    },
                }
            );

        const heading =
            createElement(
                "h2",
                {
                    text:
                        "💰 Finance",

                    className:
                        "tactic-page-heading",

                    styles: {
                        margin:
                            "0",

                        color:
                            "#f2f2f2",

                        fontSize:
                            "22px",

                        lineHeight:
                            "1.2",
                    },
                }
            );

        const description =
            createElement(
                "p",
                {
                    text:
                        "Wallet management, investments, income, assets, and financial planning.",

                    styles: {
                        margin:
                            "0",

                        color:
                            "#aaa",

                        fontSize:
                            "12px",

                        lineHeight:
                            "1.45",
                    },
                }
            );

        header.append(
            heading,
            description
        );

        return header;
    }

    function createTabButton(
        tab,
        selected
    ) {
        const button =
            createElement(
                "button",
                {
                    text:
                        tab.icon
                            ? `${tab.icon} ${tab.name}`
                            : tab.name,

                    attributes: {
                        type:
                            "button",

                        role:
                            "tab",

                        "aria-selected":
                            selected
                                ? "true"
                                : "false",

                        "data-finance-tab":
                            tab.id,
                    },

                    styles: {
                        flex:
                            "0 0 auto",

                        padding:
                            "8px 10px",

                        border:
                            selected
                                ? "1px solid rgba(75,145,230,.35)"
                                : "1px solid rgba(255,255,255,.12)",

                        borderRadius:
                            "6px",

                        background:
                            selected
                                ? "rgba(75,145,230,.16)"
                                : "rgba(255,255,255,.04)",

                        color:
                            selected
                                ? "#dceeff"
                                : "#bbb",

                        cursor:
                            "pointer",

                        fontSize:
                            "11px",

                        fontWeight:
                            selected
                                ? "800"
                                : "700",

                        whiteSpace:
                            "nowrap",
                    },
                }
            );

        button.addEventListener(
            "click",
            () => {
                setActiveTab(
                    tab.id,
                    {
                        source:
                            "finance-tab-navigation",
                    }
                );
            }
        );

        return button;
    }

    function createTabNavigation() {
        const selectedTab =
            getActiveTab();

        const navigation =
            createElement(
                "nav",
                {
                    className:
                        "tactic-finance-tabs",

                    attributes: {
                        role:
                            "tablist",

                        "aria-label":
                            "Finance sections",
                    },

                    styles: {
                        display:
                            "flex",

                        gap:
                            "6px",

                        overflowX:
                            "auto",

                        padding:
                            "2px 0 10px",

                        marginBottom:
                            "12px",

                        borderBottom:
                            "1px solid rgba(255,255,255,.10)",

                        scrollbarWidth:
                            "thin",
                    },
                }
            );

        const tabs = [
            {
                id:
                    OVERVIEW_TAB_ID,

                name:
                    "Overview",

                icon:
                    "📊",

                order:
                    0,
            },

            ...getEnabledSections()
                .map(
                    section => ({
                        id:
                            section.id,

                        name:
                            section.name,

                        icon:
                            section.icon,

                        order:
                            section.order,
                    })
                ),
        ];

        for (
            const tab of
            tabs
        ) {
            navigation.appendChild(
                createTabButton(
                    tab,
                    tab.id ===
                        selectedTab
                )
            );
        }

        return navigation;
    }

    function createSummaryCard(
        label,
        value,
        options = {}
    ) {
        const card =
            createElement(
                "button",
                {
                    attributes: {
                        type:
                            "button",
                    },

                    styles: {
                        boxSizing:
                            "border-box",

                        width:
                            "100%",

                        minWidth:
                            "0",

                        padding:
                            "11px 12px",

                        border:
                            `1px solid ${
                                options.border ||
                                "rgba(255,255,255,.11)"
                            }`,

                        borderRadius:
                            "7px",

                        background:
                            options.background ||
                            "rgba(255,255,255,.035)",

                        textAlign:
                            "left",

                        cursor:
                            options.onClick
                                ? "pointer"
                                : "default",
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
                            "5px",

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
                                : "16px",

                        fontWeight:
                            "800",

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

        if (options.detail) {
            card.appendChild(
                createElement(
                    "div",
                    {
                        text:
                            options.detail,

                        styles: {
                            marginTop:
                                "5px",

                            color:
                                "#888",

                            fontSize:
                                "9px",

                            lineHeight:
                                "1.35",
                        },
                    }
                )
            );
        }

        if (
            typeof options.onClick ===
            "function"
        ) {
            card.addEventListener(
                "click",
                options.onClick
            );
        } else {
            card.disabled =
                true;

            card.style.opacity =
                "1";
        }

        return card;
    }

    function createOverviewHeading(
        title,
        actionText,
        action
    ) {
        const row =
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
                            "7px",

                        borderBottom:
                            "1px solid rgba(255,255,255,.09)",
                    },
                }
            );

        row.appendChild(
            createElement(
                "h3",
                {
                    text:
                        title,

                    styles: {
                        margin:
                            "0",

                        color:
                            "#eee",

                        fontSize:
                            "14px",
                    },
                }
            )
        );

        if (
            actionText &&
            typeof action ===
                "function"
        ) {
            const button =
                createElement(
                    "button",
                    {
                        text:
                            actionText,

                        attributes: {
                            type:
                                "button",
                        },

                        styles: {
                            padding:
                                "5px 8px",

                            border:
                                "1px solid rgba(255,255,255,.14)",

                            borderRadius:
                                "5px",

                            background:
                                "rgba(255,255,255,.05)",

                            color:
                                "#bbb",

                            cursor:
                                "pointer",

                            fontSize:
                                "10px",

                            fontWeight:
                                "700",
                        },
                    }
                );

            button.addEventListener(
                "click",
                action
            );

            row.appendChild(
                button
            );
        }

        return row;
    }

    function createEmptyOverview() {
        metrics.emptyStateRenders +=
            1;

        return createElement(
            "div",
            {
                text:
                    "No Finance sections have been registered yet.",

                styles: {
                    padding:
                        "18px 16px",

                    border:
                        "1px solid rgba(255,255,255,.12)",

                    borderRadius:
                        "7px",

                    background:
                        "rgba(255,255,255,.035)",

                    color:
                        "#999",

                    fontSize:
                        "12px",

                    textAlign:
                        "center",
                },
            }
        );
    }

    function getAdvisorPriorityPresentation(
        priority
    ) {
        switch (priority) {
            case "critical":
                return {
                    label:
                        "Immediate",

                    icon:
                        "🚨",

                    background:
                        "rgba(220,70,70,.10)",

                    border:
                        "rgba(220,70,70,.30)",

                    color:
                        "#ffaaaa",
                };

            case "high":
                return {
                    label:
                        "High Priority",

                    icon:
                        "⚠️",

                    background:
                        "rgba(245,166,35,.10)",

                    border:
                        "rgba(245,166,35,.30)",

                    color:
                        "#ffcc80",
                };

            case "medium":
                return {
                    label:
                        "Recommended",

                    icon:
                        "💡",

                    background:
                        "rgba(75,145,230,.09)",

                    border:
                        "rgba(75,145,230,.28)",

                    color:
                        "#90caf9",
                };

            case "low":
                return {
                    label:
                        "Planning",

                    icon:
                        "📌",

                    background:
                        "rgba(156,136,255,.08)",

                    border:
                        "rgba(156,136,255,.24)",

                    color:
                        "#c5baff",
                };

            case "informational":
            default:
                return {
                    label:
                        "Status",

                    icon:
                        "✓",

                    background:
                        "rgba(76,175,80,.07)",

                    border:
                        "rgba(76,175,80,.22)",

                    color:
                        "#a5d6a7",
                };
        }
    }

    function getAdvisorEvaluation(
        financeRepository
    ) {
        if (
            !financeAdvisor ||
            typeof financeAdvisor.evaluate !==
                "function"
        ) {
            return null;
        }

        metrics.advisorEvaluations +=
            1;

        metrics.lastAdvisorEvaluationAt =
            Date.now();

        try {
            const wallet =
                financeRepository
                    ?.getWallet?.() ||
                null;

            const investmentBank =
                financeRepository
                    ?.getInvestmentBank?.() ||
                null;

            const protection =
                TACTIC.protection
                    ?.inspect?.() ||
                null;

            return financeAdvisor.evaluate({
                wallet,
                protection,
                investmentBank,
            });
        } catch (error) {
            metrics.advisorEvaluationFailures +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            logger?.error(
                "Finance Overview Advisor evaluation failed",
                {
                    error,
                }
            );

            return null;
        }
    }

    async function executeAdvisorAction(
        recommendation
    ) {
        const action =
            recommendation
                ?.action;

        if (
            !action ||
            action.available !==
                true
        ) {
            return {
                success:
                    false,

                executed:
                    false,

                reason:
                    "advisor-action-unavailable",
            };
        }

        metrics.advisorActions +=
            1;

        metrics.lastAdvisorActionAt =
            Date.now();

        if (
            action.type ===
                "open-finance-tab" &&
            action.target
        ) {
            return setActiveTab(
                action.target,
                {
                    source:
                        "finance-advisor-overview",
                }
            );
        }

        if (
            action.type ===
                "open-tactic-module" &&
            action.target
        ) {
            const navigationMethods = [
                "openModule",
                "activateModule",
                "selectModule",
                "showModule",
            ];

            for (
                const methodName of
                navigationMethods
            ) {
                if (
                    typeof drawer?.[
                        methodName
                    ] ===
                    "function"
                ) {
                    const result =
                        await drawer[
                            methodName
                        ](
                            action.target
                        );

                    return {
                        success:
                            true,

                        executed:
                            true,

                        action:
                            action.type,

                        target:
                            action.target,

                        result,
                    };
                }
            }

            return {
                success:
                    false,

                executed:
                    false,

                reason:
                    "drawer-module-navigation-unavailable",
            };
        }

        return {
            success:
                false,

            executed:
                false,

            reason:
                "unsupported-advisor-action",
        };
    }

    function createAdvisorOverview(
        financeRepository
    ) {
        const evaluation =
            getAdvisorEvaluation(
                financeRepository
            );

        const recommendation =
            evaluation?.primary ||
            null;

        const presentation =
            getAdvisorPriorityPresentation(
                recommendation
                    ?.priority
            );

        const section =
            createElement(
                "section",
                {
                    className:
                        "tactic-finance-advisor-overview",

                    styles: {
                        display:
                            "grid",

                        gap:
                            "9px",

                        padding:
                            "13px",

                        border:
                            `1px solid ${presentation.border}`,

                        borderRadius:
                            "8px",

                        background:
                            presentation.background,
                    },
                }
            );

        const headingRow =
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
                    },
                }
            );

        const heading =
            createElement(
                "div",
                {
                    text:
                        "Financial Advisor",

                    styles: {
                        color:
                            "#f2f2f2",

                        fontSize:
                            "14px",

                        fontWeight:
                            "800",
                    },
                }
            );

        const priorityBadge =
            createElement(
                "div",
                {
                    text:
                        `${presentation.icon} ${presentation.label}`,

                    styles: {
                        flex:
                            "0 0 auto",

                        padding:
                            "4px 8px",

                        border:
                            `1px solid ${presentation.border}`,

                        borderRadius:
                            "999px",

                        color:
                            presentation.color,

                        fontSize:
                            "9px",

                        fontWeight:
                            "800",

                        letterSpacing:
                            ".03em",

                        textTransform:
                            "uppercase",
                    },
                }
            );

        headingRow.append(
            heading,
            priorityBadge
        );

        section.appendChild(
            headingRow
        );

        if (!recommendation) {
            section.appendChild(
                createElement(
                    "div",
                    {
                        text:
                            financeAdvisor
                                ? "TACTIC could not create a financial recommendation from the currently available data."
                                : "The Finance Advisor service is unavailable.",

                        styles: {
                            color:
                                "#aaa",

                            fontSize:
                                "11px",

                            lineHeight:
                                "1.45",
                        },
                    }
                )
            );

            return section;
        }

        const recommendationTitle =
            createElement(
                "div",
                {
                    text:
                        recommendation.title,

                    styles: {
                        color:
                            presentation.color,

                        fontSize:
                            "15px",

                        fontWeight:
                            "800",

                        lineHeight:
                            "1.3",
                    },
                }
            );

        const message =
            createElement(
                "div",
                {
                    text:
                        recommendation.message,

                    styles: {
                        color:
                            "#ddd",

                        fontSize:
                            "11px",

                        lineHeight:
                            "1.5",
                    },
                }
            );

        const reason =
            createElement(
                "div",
                {
                    text:
                        recommendation.reason,

                    styles: {
                        paddingTop:
                            "7px",

                        borderTop:
                            "1px solid rgba(255,255,255,.09)",

                        color:
                            "#929292",

                        fontSize:
                            "9px",

                        lineHeight:
                            "1.4",
                    },
                }
            );

        section.append(
            recommendationTitle,
            message,
            reason
        );

        if (
            recommendation
                .action
                ?.available ===
                true
        ) {
            const actionButton =
                createElement(
                    "button",
                    {
                        text:
                            recommendation
                                .action
                                .label ||
                            "Review Recommendation",

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
                                `1px solid ${presentation.border}`,

                            borderRadius:
                                "5px",

                            background:
                                "rgba(255,255,255,.055)",

                            color:
                                presentation.color,

                            cursor:
                                "pointer",

                            fontSize:
                                "11px",

                            fontWeight:
                                "800",
                        },
                    }
                );

            actionButton.addEventListener(
                "click",
                async () => {
                    try {
                        await executeAdvisorAction(
                            recommendation
                        );
                    } catch (error) {
                        metrics.lastError =
                            createErrorSnapshot(
                                error
                            );

                        logger?.error(
                            "Finance Advisor action failed",
                            {
                                recommendation,
                                error,
                            }
                        );
                    }
                }
            );

            section.appendChild(
                actionButton
            );
        }

        if (
            evaluation
                ?.counts
                ?.total >
            1
        ) {
            section.appendChild(
                createElement(
                    "div",
                    {
                        text:
                            `${evaluation.counts.total - 1} additional financial recommendation${
                                evaluation.counts.total -
                                    1 ===
                                1
                                    ? ""
                                    : "s"
                            } available for future Advisor expansion.`,

                        styles: {
                            color:
                                "#777",

                            fontSize:
                                "9px",

                            lineHeight:
                                "1.4",

                            textAlign:
                                "center",
                        },
                    }
                )
            );
        }

        return section;
    }

    function createWalletOverview(
        financeRepository
    ) {
        const section =
            createElement(
                "section",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "8px",
                    },
                }
            );

        section.appendChild(
            createOverviewHeading(
                "Wallet",
                "View Wallet",
                () => {
                    setActiveTab(
                        "wallet",
                        {
                            source:
                                "finance-overview",
                        }
                    );
                }
            )
        );

        const wallet =
            financeRepository
                ?.getWallet?.() ||
            null;

        const protection =
            TACTIC.protection
                ?.inspect?.() ||
            null;

        const evaluation =
            protection
                ?.evaluation ||
            null;

        const configuration =
            protection
                ?.configuration ||
            null;

        const grid =
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

        grid.append(
            createSummaryCard(
                "Current Balance",
                wallet?.available
                    ? formatMoney(
                          wallet.value
                      )
                    : "Unavailable",
                {
                    onClick:
                        () => {
                            setActiveTab(
                                "wallet",
                                {
                                    source:
                                        "finance-overview",
                                }
                            );
                        },
                }
            ),

            createSummaryCard(
                "Recommended Deposit",
                Number.isFinite(
                    evaluation
                        ?.depositAmount
                )
                    ? formatMoney(
                          evaluation
                              .depositAmount
                      )
                    : "$0",
                {
                    color:
                        evaluation
                            ?.shouldDeposit
                            ? "#ffcc80"
                            : "#a5d6a7",

                    detail:
                        configuration
                            ?.enabled
                            ? evaluation
                                  ?.shouldDeposit
                                ? "Deposit recommended"
                                : "Wallet within limit"
                            : "Protection disabled",

                    onClick:
                        () => {
                            setActiveTab(
                                "wallet",
                                {
                                    source:
                                        "finance-overview",
                                }
                            );
                        },
                }
            )
        );

        section.appendChild(
            grid
        );

        return section;
    }

    function createBankOverview(
        financeRepository
    ) {
        const section =
            createElement(
                "section",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "8px",
                    },
                }
            );

        section.appendChild(
            createOverviewHeading(
                "Investment Bank",
                "View Bank",
                () => {
                    setActiveTab(
                        "bank",
                        {
                            source:
                                "finance-overview",
                        }
                    );
                }
            )
        );

        const bank =
            financeRepository
                ?.getInvestmentBank?.() ||
            null;

        const active =
            bank
                ?.activeInvestment;

        const recommendation =
            bank
                ?.analysis
                ?.recommendation
                ?.recommendation;

        const countdown =
            active
                ?.countdown;

        const remainingMs =
            Number.isFinite(
                countdown
                    ?.estimatedMaturesAt
            )
                ? Math.max(
                      0,
                      countdown
                          .estimatedMaturesAt -
                      Date.now()
                  )
                : countdown
                      ?.milliseconds;

        const grid =
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

        grid.append(
            createSummaryCard(
                active?.active
                    ? "Active Payout"
                    : "Bank Status",
                active?.active
                    ? formatMoney(
                          active
                              ?.payout
                              ?.value
                      )
                    : bank?.available
                      ? "Available"
                      : "Unavailable",
                {
                    detail:
                        active?.active
                            ? `${formatDuration(
                                  remainingMs
                              )} remaining${
                                  bank?.cached
                                      ? " · cached"
                                      : ""
                              }`
                            : bank?.cached
                              ? "Last known Bank data"
                              : "No active investment",

                    onClick:
                        () => {
                            setActiveTab(
                                "bank",
                                {
                                    source:
                                        "finance-overview",
                                }
                            );
                        },
                }
            ),

            createSummaryCard(
                "Recommended Term",
                recommendation
                    ?.option
                    ?.label ||
                "Unavailable",
                {
                    color:
                        recommendation
                            ? "#90caf9"
                            : "#aaa",

                    detail:
                        recommendation
                            ? `${formatMoney(
                                  recommendation
                                      .profit
                                      ?.value
                              )} projected profit`
                            : "Open the Investment Bank page to load rates",

                    onClick:
                        () => {
                            setActiveTab(
                                "bank",
                                {
                                    source:
                                        "finance-overview",
                                }
                            );
                        },
                }
            )
        );

        section.appendChild(
            grid
        );

        return section;
    }

    function createUpcomingPlaceholder() {
        const section =
            createElement(
                "section",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "8px",
                    },
                }
            );

        section.appendChild(
            createOverviewHeading(
                "Coming Later"
            )
        );

        const grid =
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

        grid.append(
            createSummaryCard(
                "Income",
                "Not yet added",
                {
                    compact:
                        true,

                    detail:
                        "Daily, weekly, and monthly income tracking",
                }
            ),

            createSummaryCard(
                "Net Worth",
                "Not yet added",
                {
                    compact:
                        true,

                    detail:
                        "Assets, cash, investments, and historical growth",
                }
            ),

            createSummaryCard(
                "Advisor",
                "Not yet added",
                {
                    compact:
                        true,

                    detail:
                        "Financial recommendations and next actions",
                }
            )
        );

        section.appendChild(
            grid
        );

        return section;
    }

    function renderOverview(
        container
    ) {
        metrics.overviewRenders +=
            1;

        const sections =
            getEnabledSections();

        if (
            sections.length ===
            0
        ) {
            container.replaceChildren(
                createEmptyOverview()
            );

            return {
                success:
                    true,

                rendered:
                    true,

                empty:
                    true,
            };
        }

        const repository =
            TACTIC.repositories
                ?.finance ||
            null;

        const overview =
            createElement(
                "div",
                {
                    className:
                        "tactic-finance-overview",

                    styles: {
                        display:
                            "grid",

                        gap:
                            "16px",
                    },
                }
            );

        overview.appendChild(
            createAdvisorOverview(
                repository
            )
        );

        if (
            sectionManager.has(
                "wallet"
            )
        ) {
            overview.appendChild(
                createWalletOverview(
                    repository
                )
            );
        }

        if (
            sectionManager.has(
                "bank"
            )
        ) {
            overview.appendChild(
                createBankOverview(
                    repository
                )
            );
        }

        overview.appendChild(
            createUpcomingPlaceholder()
        );

        container.replaceChildren(
            overview
        );

        return {
            success:
                true,

            rendered:
                true,

            empty:
                false,

            overviewSectionCount:
                overview.children
                    .length,
        };
    }

    async function renderSelectedSection(
        container,
        sectionId
    ) {
        metrics.sectionRenders +=
            1;

        container.replaceChildren();

        const sectionContainer =
            createElement(
                "section",
                {
                    className:
                        [
                            "tactic-application-section",
                            "tactic-finance-section",
                            `tactic-finance-section-${sectionId}`,
                        ].join(
                            " "
                        ),

                    attributes: {
                        "data-tactic-application":
                            MODULE_ID,

                        "data-tactic-section":
                            sectionId,
                    },
                }
            );

        container.appendChild(
            sectionContainer
        );

        return sectionManager.renderSection(
            sectionId,
            sectionContainer,
            {
                rootContainer:
                    container,

                application:
                    MODULE_ID,

                financeRepository:
                    TACTIC.repositories
                        ?.finance ||
                    null,

                activeTab:
                    sectionId,
            }
        );
    }

    async function renderWorkspace(
        container
    ) {
        const selectedTab =
            getActiveTab();

        if (
            selectedTab ===
            OVERVIEW_TAB_ID
        ) {
            return renderOverview(
                container
            );
        }

        return renderSelectedSection(
            container,
            selectedTab
        );
    }

    async function render(
        container
    ) {
        metrics.renderRequests +=
            1;

        if (
            !(container instanceof
                Element)
        ) {
            throw new TypeError(
                "Finance requires a valid render container."
            );
        }

        if (rendering) {
            return {
                success:
                    false,

                rendered:
                    false,

                reason:
                    "finance-render-already-running",
            };
        }

        rendering =
            true;

        metrics.renderPasses +=
            1;

        metrics.lastRenderStartedAt =
            Date.now();

        metrics.lastError =
            null;

        try {
            normalizeActiveTab();

            container.replaceChildren();

            container.append(
                createPageHeader(),
                createTabNavigation()
            );

            const workspace =
                createElement(
                    "div",
                    {
                        className:
                            "tactic-finance-workspace",

                        attributes: {
                            role:
                                "tabpanel",

                            "data-finance-active-tab":
                                activeTabId,
                        },

                        styles: {
                            minWidth:
                                "0",
                        },
                    }
                );

            container.appendChild(
                workspace
            );

            const result =
                await renderWorkspace(
                    workspace
                );

            if (
                result?.success !==
                false
            ) {
                metrics.successfulRenders +=
                    1;
            } else {
                metrics.failedRenders +=
                    1;
            }

            metrics.lastRenderedAt =
                Date.now();

            metrics.lastRenderDurationMs =
                metrics.lastRenderedAt -
                metrics.lastRenderStartedAt;

            return {
                ...result,

                application:
                    MODULE_ID,

                activeTab:
                    activeTabId,

                durationMs:
                    metrics
                        .lastRenderDurationMs,
            };
        } catch (error) {
            metrics.failedRenders +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            logger?.error(
                "Finance application render failed",
                {
                    error,

                    activeTab:
                        activeTabId,

                    message:
                        metrics
                            .lastError
                            .message,
                }
            );

            container.replaceChildren(
                createPageHeader()
            );

            container.appendChild(
                createElement(
                    "div",
                    {
                        text:
                            "The Finance dashboard could not be rendered.",

                        styles: {
                            padding:
                                "12px",

                            border:
                                "1px solid rgba(220,70,70,.3)",

                            borderRadius:
                                "6px",

                            background:
                                "rgba(220,70,70,.09)",

                            color:
                                "#ffd0d0",

                            fontSize:
                                "12px",
                        },
                    }
                )
            );

            return {
                success:
                    false,

                rendered:
                    false,

                reason:
                    "finance-render-failed",

                error:
                    cloneValue(
                        metrics.lastError
                    ),
            };
        } finally {
            rendering =
                false;
        }
    }

    async function refresh(
        reason =
            "manual"
    ) {
        metrics.refreshRequests +=
            1;

        metrics.lastRefreshRequestedAt =
            Date.now();

        if (
            !initialized ||
            !isFinancePageActive()
        ) {
            metrics.refreshesSkipped +=
                1;

            return {
                success:
                    false,

                refreshed:
                    false,

                reason:
                    !initialized
                        ? "finance-not-initialized"
                        : "finance-page-not-active",

                source:
                    reason,
            };
        }

        if (
            typeof drawer
                .renderActiveModule !==
            "function"
        ) {
            metrics.refreshesSkipped +=
                1;

            return {
                success:
                    false,

                refreshed:
                    false,

                reason:
                    "drawer-refresh-unavailable",

                source:
                    reason,
            };
        }

        await drawer
            .renderActiveModule();

        metrics.refreshesCompleted +=
            1;

        metrics.lastRefreshCompletedAt =
            Date.now();

        return {
            success:
                true,

            refreshed:
                true,

            reason,

            activeTab:
                activeTabId,

            completedAt:
                metrics
                    .lastRefreshCompletedAt,
        };
    }

    function scheduleRefresh(
        reason =
            "section-change"
    ) {
        refreshPending =
            true;

        if (
            refreshTimerId !==
            null
        ) {
            return false;
        }

        refreshTimerId =
            globalThis.setTimeout(
                async () => {
                    refreshTimerId =
                        null;

                    if (!refreshPending) {
                        return;
                    }

                    refreshPending =
                        false;

                    try {
                        await refresh(
                            reason
                        );
                    } catch (error) {
                        metrics.lastError =
                            createErrorSnapshot(
                                error
                            );

                        logger?.error(
                            "Finance scheduled refresh failed",
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

    function isFinanceSectionEvent(
        payload
    ) {
        return (
            payload
                ?.applicationId ===
            SECTION_MANAGER_ID
        );
    }

    function handleSectionEvent(
        eventName,
        payload
    ) {
        if (
            !isFinanceSectionEvent(
                payload
            )
        ) {
            return;
        }

        metrics.sectionEventsReceived +=
            1;

        metrics.lastSectionEventAt =
            Date.now();

        metrics.lastSectionEvent = {
            eventName,

            sectionId:
                payload
                    ?.section
                    ?.id ||
                payload
                    ?.sectionId ||
                null,

            timestamp:
                metrics
                    .lastSectionEventAt,
        };

        normalizeActiveTab();

        scheduleRefresh(
            eventName
        );
    }

    function registerSection(
        definition
    ) {
        return sectionManager.register(
            definition
        );
    }

    function unregisterSection(
        sectionId
    ) {
        const result =
            sectionManager.unregister(
                sectionId
            );

        normalizeActiveTab();

        return result;
    }

    function enableSection(
        sectionId
    ) {
        return sectionManager.enable(
            sectionId
        );
    }

    function disableSection(
        sectionId
    ) {
        const result =
            sectionManager.disable(
                sectionId
            );

        normalizeActiveTab();

        return result;
    }

    function getSection(
        sectionId
    ) {
        return sectionManager.get(
            sectionId
        );
    }

    function getSections(
        options = {}
    ) {
        return sectionManager.getAll(
            options
        );
    }

    function inspect() {
        return {
            application:
                MODULE_ID,

            version:
                MODULE_VERSION,

            initialized,

            initializedAt,

            destroyedAt,

            rendering,

            refreshPending,

            active:
                isFinancePageActive(),

            activeTab:
                getActiveTab(),

            availableTabs:
                getAvailableTabIds(),

            sectionManager:
                sectionManager.inspect(),

            advisor: {
                available:
                    Boolean(
                        financeAdvisor
                    ),

                lastEvaluation:
                    financeAdvisor
                        ?.inspect?.()
                        ?.lastEvaluation ||
                    null,

                lastPrimaryRecommendation:
                    financeAdvisor
                        ?.inspect?.()
                        ?.lastPrimaryRecommendation ||
                    null,
            },

            repository: {
                financeAvailable:
                    Boolean(
                        TACTIC.repositories
                            ?.finance
                    ),

                finance:
                    TACTIC.repositories
                        ?.finance
                        ?.inspect?.() ||
                    null,
            },

            metrics: {
                ...metrics,

                lastSectionEvent:
                    metrics
                        .lastSectionEvent
                        ? {
                              ...metrics
                                  .lastSectionEvent,
                          }
                        : null,

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

    const financeApi =
        Object.freeze({
            sections:
                sectionManager,

            registerSection,
            unregisterSection,

            enableSection,
            disableSection,

            getSection,
            getSections,

            getActiveTab,
            setActiveTab,

            refresh,
            inspect,
        });

    Object.assign(
        TACTIC.finance,
        financeApi
    );

    TACTIC.registerModule({
        id:
            MODULE_ID,

        name:
            "Finance",

        icon:
            "💰",

        version:
            MODULE_VERSION,

        order:
            MODULE_ORDER,

        async init() {
            if (initialized) {
                return inspect();
            }

            initialized =
                true;

            initializedAt =
                Date.now();

            destroyedAt =
                null;

            metrics.initializationCount +=
                1;

            normalizeActiveTab();

            const sectionEventNames = [
                SECTION_EVENTS
                    .SECTION_REGISTERED ||
                    "section:registered",

                SECTION_EVENTS
                    .SECTION_UNREGISTERED ||
                    "section:unregistered",

                SECTION_EVENTS
                    .SECTION_CHANGED ||
                    "section:changed",
            ];

            for (
                const eventName of
                sectionEventNames
            ) {
                const removeListener =
                    events?.on?.(
                        eventName,
                        payload => {
                            handleSectionEvent(
                                eventName,
                                payload
                            );
                        }
                    );

                if (
                    typeof removeListener ===
                    "function"
                ) {
                    removeEventListeners.push(
                        removeListener
                    );
                }
            }

            health?.register({
                name:
                    "module:finance",

                type:
                    health.types.MODULE,

                status:
                    TACTIC
                        .HEALTH_STATES
                        ?.HEALTHY ||
                    "healthy",

                staleAfterMs:
                    null,

                metadata: {
                    moduleId:
                        MODULE_ID,

                    version:
                        MODULE_VERSION,

                    sectionManagerId:
                        SECTION_MANAGER_ID,

                    sectionCount:
                        sectionManager
                            .getAll()
                            .length,

                    activeTab:
                        activeTabId,

                    tabbedNavigation:
                        true,

                    requiresHeartbeat:
                        false,
                },
            });

            logger?.info(
                "Finance application initialized",
                {
                    sectionCount:
                        sectionManager
                            .getAll()
                            .length,

                    activeTab:
                        activeTabId,

                    tabbedNavigation:
                        true,
                }
            );

            return inspect();
        },

        async render(
            container
        ) {
            return render(
                container
            );
        },

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

            refreshPending =
                false;

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

            initialized =
                false;

            destroyedAt =
                Date.now();

            metrics.destructionCount +=
                1;

            health?.markDisabled?.(
                "module:finance",
                {
                    message:
                        "Finance application is stopped.",

                    metadata: {
                        moduleId:
                            MODULE_ID,

                        initialized:
                            false,
                    },
                }
            );

            logger?.info(
                "Finance application destroyed"
            );
        },
    });

    logger?.info(
        "Finance application loaded",
        {
            sectionManagerId:
                SECTION_MANAGER_ID,

            activeTab:
                activeTabId,

            tabbedNavigation:
                true,
        }
    );
})();