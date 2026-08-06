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
 * Provides the Finance application shell and composes registered
 * Finance sections into one unified drawer workspace.
 *
 * Responsibilities:
 * - Create or retrieve the Finance Section Manager
 * - Register the Finance drawer module
 * - Render enabled Finance sections in configured order
 * - Display an empty state when no sections are registered
 * - Refresh the Finance page when its sections change
 * - Expose Finance application diagnostics
 *
 * Does NOT:
 * - Scrape Torn financial data
 * - Own wallet, bank, stock, or net-worth data
 * - Perform financial transactions
 * - Contain individual Finance section implementations
 *
 * Public API:
 * - TACTIC.finance.sections
 * - TACTIC.finance.registerSection()
 * - TACTIC.finance.unregisterSection()
 * - TACTIC.finance.refresh()
 * - TACTIC.finance.inspect()
 *
 * Dependencies:
 * - core/section-manager.js
 * - core/module-manager.js
 * - ui/drawer/index.js
 * - core/events.js
 * - core/logger.js
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

    const MODULE_VERSION =
        "1.0.0";

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

        emptyStateRenders:
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
                            "16px",
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
                        "Your financial command center for wallet protection, investments, income, assets, and planning.",

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

    function createEmptyState() {
        metrics.emptyStateRenders +=
            1;

        const emptyState =
            createElement(
                "div",
                {
                    className:
                        "tactic-finance-empty-state",

                    styles: {
                        boxSizing:
                            "border-box",

                        padding:
                            "18px 16px",

                        border:
                            "1px solid rgba(255,255,255,.12)",

                        borderRadius:
                            "7px",

                        background:
                            "rgba(255,255,255,.035)",

                        textAlign:
                            "center",
                    },
                }
            );

        const title =
            createElement(
                "div",
                {
                    text:
                        "Finance Dashboard",

                    styles: {
                        marginBottom:
                            "7px",

                        color:
                            "#eee",

                        fontSize:
                            "15px",

                        fontWeight:
                            "700",
                    },
                }
            );

        const message =
            createElement(
                "div",
                {
                    text:
                        "No financial sections have been registered yet.",

                    styles: {
                        color:
                            "#999",

                        fontSize:
                            "12px",

                        lineHeight:
                            "1.45",
                    },
                }
            );

        emptyState.append(
            title,
            message
        );

        return emptyState;
    }

    function createSectionRoot() {
        return createElement(
            "div",
            {
                className:
                    "tactic-finance-sections",

                styles: {
                    display:
                        "grid",

                    gap:
                        "14px",
                },
            }
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
            container.replaceChildren();

            container.appendChild(
                createPageHeader()
            );

            const sections =
                sectionManager.getAll({
                    includeDisabled:
                        false,
                });

            if (
                sections.length ===
                0
            ) {
                container.appendChild(
                    createEmptyState()
                );

                metrics.successfulRenders +=
                    1;

                metrics.lastRenderedAt =
                    Date.now();

                metrics.lastRenderDurationMs =
                    metrics.lastRenderedAt -
                    metrics.lastRenderStartedAt;

                return {
                    success:
                        true,

                    rendered:
                        true,

                    empty:
                        true,

                    sectionCount:
                        0,

                    durationMs:
                        metrics
                            .lastRenderDurationMs,
                };
            }

            const sectionRoot =
                createSectionRoot();

            container.appendChild(
                sectionRoot
            );

            const result =
                await sectionManager.renderAll(
                    sectionRoot,
                    {
                        clear:
                            true,

                        sectionTagName:
                            "section",

                        removeFailed:
                            false,

                        context: {
                            application:
                                MODULE_ID,

                            financeRepository:
                                TACTIC.repositories
                                    ?.finance ||
                                null,
                        },
                    }
                );

            if (
                result.success ===
                true
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

                empty:
                    false,

                financeDurationMs:
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

                    message:
                        metrics
                            .lastError
                            .message,
                }
            );

            container.replaceChildren(
                createPageHeader()
            );

            const errorNotice =
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
                );

            container.appendChild(
                errorNotice
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
        return sectionManager.unregister(
            sectionId
        );
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
        return sectionManager.disable(
            sectionId
        );
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

            sectionManager:
                sectionManager.inspect(),

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
        }
    );
})();