/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * modules/developer/index.js
 *
 * Purpose:
 * Provides a read-only dashboard for inspecting the current
 * TACTIC framework, services, runtime, health, and modules.
 *
 * Responsibilities:
 * - Display framework identity and lifecycle state
 * - Display overall Health status and score
 * - Display registered service health
 * - Display Scheduler, DOM, Settings, and Notification metrics
 * - Display error and warning counts
 * - Display registered module status
 * - Allow manual dashboard refresh
 *
 * Does NOT:
 * - Modify framework state
 * - Stop or restart services
 * - Clear logs, errors, or settings
 * - Execute destructive developer actions
 *
 * Public API:
 * - Registered module: developer-dashboard
 *
 * Dependencies:
 * - core/module-manager.js
 * - core/health.js
 * - core/lifecycle.js
 * - core/errors.js
 * - services/scheduler/index.js
 * - services/dom/index.js
 * - services/settings/index.js
 * - services/notifications/index.js
 * - ui/components/index.js
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
            "[TACTIC Developer Dashboard] Namespace is unavailable."
        );

        return;
    }

    const MODULE_ID =
        "developer-dashboard";

    const HEALTH_ICONS =
        Object.freeze({
            healthy:
                "🟢",

            starting:
                "🔵",

            recovering:
                "🔵",

            degraded:
                "🟡",

            unhealthy:
                "🟠",

            failed:
                "🔴",

            disabled:
                "⚪",

            stopped:
                "⚪",

            unknown:
                "⚪",
        });

    function createElement(
        tagName,
        options = {}
    ) {
        const element =
            document.createElement(
                tagName
            );

        if (options.className) {
            element.className =
                options.className;
        }

        if (
            options.text !==
            undefined
        ) {
            element.textContent =
                String(
                    options.text
                );
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

    function formatDuration(
        milliseconds
    ) {
        const totalSeconds =
            Math.max(
                0,
                Math.floor(
                    Number(
                        milliseconds
                    ) / 1000
                )
            );

        const days =
            Math.floor(
                totalSeconds /
                86400
            );

        const hours =
            Math.floor(
                (
                    totalSeconds %
                    86400
                ) /
                3600
            );

        const minutes =
            Math.floor(
                (
                    totalSeconds %
                    3600
                ) /
                60
            );

        const seconds =
            totalSeconds %
            60;

        const parts =
            [];

        if (days > 0) {
            parts.push(
                `${days}d`
            );
        }

        if (
            hours > 0 ||
            days > 0
        ) {
            parts.push(
                `${hours}h`
            );
        }

        if (
            minutes > 0 ||
            hours > 0 ||
            days > 0
        ) {
            parts.push(
                `${minutes}m`
            );
        }

        parts.push(
            `${seconds}s`
        );

        return parts.join(
            " "
        );
    }

    function formatTimestamp(
        timestamp
    ) {
        if (
            !Number.isFinite(
                timestamp
            )
        ) {
            return "Never";
        }

        return new Date(
            timestamp
        ).toLocaleString();
    }

    function getHealthIcon(
        status
    ) {
        return (
            HEALTH_ICONS[
                status
            ] ||
            HEALTH_ICONS.unknown
        );
    }

    function createSection(
        title
    ) {
        const section =
            createElement(
                "section",
                {
                    styles: {
                        marginTop:
                            "16px",
                    },
                }
            );

        const heading =
            createElement(
                "h3",
                {
                    text:
                        title,

                    styles: {
                        margin:
                            "0 0 8px",

                        paddingBottom:
                            "7px",

                        borderBottom:
                            "1px solid rgba(255, 255, 255, 0.12)",

                        color:
                            "#f2f2f2",

                        fontSize:
                            "14px",

                        fontWeight:
                            "700",
                    },
                }
            );

        const content =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "8px",
                    },
                }
            );

        section.append(
            heading,
            content
        );

        return {
            section,
            content,
        };
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

                        padding:
                            "10px 12px",

                        border:
                            "1px solid rgba(255, 255, 255, 0.13)",

                        borderRadius:
                            "6px",

                        background:
                            "rgba(255, 255, 255, 0.035)",
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
                            "#aaa",

                        fontSize:
                            "11px",

                        fontWeight:
                            "700",

                        letterSpacing:
                            "0.04em",

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
                            "#f2f2f2",

                        fontSize:
                            options.large
                                ? "18px"
                                : "14px",

                        fontWeight:
                            options.large
                                ? "700"
                                : "600",

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

    function createStatGrid(
        cards
    ) {
        const grid =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gridTemplateColumns:
                            "repeat(2, minmax(0, 1fr))",

                        gap:
                            "8px",
                    },
                }
            );

        grid.append(
            ...cards
        );

        return grid;
    }

    function createStatusRow({
        icon,
        name,
        status,
        detail = null,
    }) {
        const row =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gridTemplateColumns:
                            "24px minmax(0, 1fr) auto",

                        alignItems:
                            "center",

                        gap:
                            "8px",

                        padding:
                            "9px 10px",

                        border:
                            "1px solid rgba(255, 255, 255, 0.1)",

                        borderRadius:
                            "5px",

                        background:
                            "rgba(255, 255, 255, 0.025)",
                    },
                }
            );

        const iconElement =
            createElement(
                "span",
                {
                    text:
                        icon,

                    styles: {
                        textAlign:
                            "center",
                    },
                }
            );

        const nameContainer =
            createElement(
                "div"
            );

        const nameElement =
            createElement(
                "div",
                {
                    text:
                        name,

                    styles: {
                        color:
                            "#eee",

                        fontSize:
                            "13px",

                        fontWeight:
                            "600",
                    },
                }
            );

        nameContainer.appendChild(
            nameElement
        );

        if (detail) {
            const detailElement =
                createElement(
                    "div",
                    {
                        text:
                            detail,

                        styles: {
                            marginTop:
                                "2px",

                            color:
                                "#999",

                            fontSize:
                                "11px",
                        },
                    }
                );

            nameContainer.appendChild(
                detailElement
            );
        }

        const statusElement =
            createElement(
                "span",
                {
                    text:
                        status,

                    styles: {
                        color:
                            "#bbb",

                        fontSize:
                            "11px",

                        textTransform:
                            "capitalize",
                    },
                }
            );

        row.append(
            iconElement,
            nameContainer,
            statusElement
        );

        return row;
    }

    function safelyRead(
        reader,
        fallback = null
    ) {
        try {
            const value =
                reader();

            return value ??
                fallback;
        } catch {
            return fallback;
        }
    }

    function collectDashboardData() {
        const {
            services,
        } = TACTIC;

        const lifecycle =
            safelyRead(
                () =>
                    services
                        .lifecycle
                        ?.inspect(),
                {}
            );

        const health =
            safelyRead(
                () =>
                    services
                        .health
                        ?.snapshot(),
                {}
            );

        const timers =
            safelyRead(
                () =>
                    services
                        .scheduler
                        ?.inspect(),
                []
            );

        const observers =
            safelyRead(
                () =>
                    services
                        .dom
                        ?.inspectObservers(),
                []
            );

        const dom =
            safelyRead(
                () =>
                    services
                        .dom
                        ?.inspect(),
                {}
            );

        const settings =
            safelyRead(
                () =>
                    services
                        .settings
                        ?.inspect(),
                {}
            );

        const notifications =
            safelyRead(
                () =>
                    services
                        .notifications
                        ?.inspect(),
                {}
            );

        const logger =
            safelyRead(
                () =>
                    services
                        .logger
                        ?.inspect(),
                {}
            );

        const errorRecords =
            safelyRead(
                () =>
                    services
                        .errors
                        ?.get(),
                []
            );

        const modules = [
            ...TACTIC.modules
                .values(),
        ];

        return {
            timestamp:
                Date.now(),

            lifecycle,
            health,
            timers,
            observers,
            dom,
            settings,
            notifications,
            logger,
            errorRecords,
            modules,
        };
    }

    function renderOverview(
        root,
        data
    ) {
        const section =
            createSection(
                "Framework"
            );

        const healthStatus =
            data.health
                .overallStatus ||
            "unknown";

        const healthScore =
            Number.isFinite(
                data.health
                    .overallScore
            )
                ? data.health
                      .overallScore
                : 0;

        const lifecycleState =
            data.lifecycle
                .state ||
            "unknown";

        const uptime =
            formatDuration(
                data.lifecycle
                    .uptimeMs ||
                0
            );

        section.content.append(
            createStatGrid([
                createCard(
                    "Version",
                    TACTIC.version,
                    {
                        large:
                            true,
                    }
                ),

                createCard(
                    "Lifecycle",
                    lifecycleState,
                    {
                        large:
                            true,
                    }
                ),

                createCard(
                    "Health",
                    `${getHealthIcon(
                        healthStatus
                    )} ${healthStatus}`,
                    {
                        large:
                            true,
                    }
                ),

                createCard(
                    "Health Score",
                    `${healthScore}/100`,
                    {
                        large:
                            true,
                    }
                ),

                createCard(
                    "Uptime",
                    uptime
                ),

                createCard(
                    "Initialized",
                    TACTIC.initialized
                        ? "Yes"
                        : "No"
                ),
            ])
        );

        root.appendChild(
            section.section
        );
    }

    function renderRuntime(
        root,
        data
    ) {
        const section =
            createSection(
                "Runtime"
            );

        const activeTimers =
            data.timers.filter(
                (timer) =>
                    ![
                        "completed",
                        "cancelled",
                    ].includes(
                        timer.state
                    )
            ).length;

        const activeObservers =
            data.observers.filter(
                (observer) =>
                    observer.active
            ).length;

        const activeNotifications =
            data.notifications
                .activeCount ||
            0;

        const namespaceCount =
            data.settings
                .namespaceCount ||
            0;

        const warnings =
            data.errorRecords.filter(
                (entry) =>
                    entry.severity ===
                    "warning"
            ).length;

        const errors =
            data.errorRecords.filter(
                (entry) =>
                    [
                        "error",
                        "critical",
                    ].includes(
                        entry.severity
                    )
            ).length;

        section.content.append(
            createStatGrid([
                createCard(
                    "Active Timers",
                    String(
                        activeTimers
                    )
                ),

                createCard(
                    "DOM Observers",
                    String(
                        activeObservers
                    )
                ),

                createCard(
                    "Settings Namespaces",
                    String(
                        namespaceCount
                    )
                ),

                createCard(
                    "Active Notifications",
                    String(
                        activeNotifications
                    )
                ),

                createCard(
                    "Warnings",
                    String(
                        warnings
                    )
                ),

                createCard(
                    "Errors",
                    String(
                        errors
                    )
                ),
            ])
        );

        root.appendChild(
            section.section
        );
    }

    function renderServices(
        root,
        data
    ) {
        const section =
            createSection(
                "Services"
            );

        const serviceHealth =
            data.health
                .grouped
                ?.services ||
            [];

        if (
            serviceHealth.length ===
            0
        ) {
            section.content.appendChild(
                createCard(
                    "Services",
                    "No service health records are available."
                )
            );
        } else {
            for (
                const service of
                serviceHealth
            ) {
                section.content.appendChild(
                    createStatusRow({
                        icon:
                            getHealthIcon(
                                service.status
                            ),

                        name:
                            service.name.replace(
                                /^service:/,
                                ""
                            ),

                        status:
                            service.status,

                        detail:
                            `Score ${service.score}/100`,
                    })
                );
            }
        }

        root.appendChild(
            section.section
        );
    }

    function renderTimers(
        root,
        data
    ) {
        const section =
            createSection(
                "Scheduled Tasks"
            );

        if (
            data.timers.length ===
            0
        ) {
            section.content.appendChild(
                createCard(
                    "Scheduler",
                    "No scheduled tasks."
                )
            );
        } else {
            for (
                const timer of
                data.timers
            ) {
                const nextRun =
                    timer
                        .millisecondsUntilNextRun ===
                    null
                        ? "No future run"
                        : `Next run in ${formatDuration(
                              timer
                                  .millisecondsUntilNextRun
                          )}`;

                section.content.appendChild(
                    createStatusRow({
                        icon:
                            timer.state ===
                            "scheduled"
                                ? "⏱"
                                : timer.state ===
                                  "running"
                                  ? "▶"
                                  : timer.state ===
                                    "paused"
                                    ? "⏸"
                                    : "•",

                        name:
                            timer.name,

                        status:
                            timer.state,

                        detail:
                            `${nextRun} · Executions ${timer.executionCount}`,
                    })
                );
            }
        }

        root.appendChild(
            section.section
        );
    }

    function renderModules(
        root,
        data
    ) {
        const section =
            createSection(
                "Modules"
            );

        const moduleHealth =
            new Map(
                (
                    data.health
                        .grouped
                        ?.modules ||
                    []
                ).map(
                    (component) => [
                        component.name.replace(
                            /^module:/,
                            ""
                        ),

                        component,
                    ]
                )
            );

        if (
            data.modules.length ===
            0
        ) {
            section.content.appendChild(
                createCard(
                    "Modules",
                    "No modules are registered."
                )
            );
        } else {
            const sorted =
                [
                    ...data.modules,
                ].sort(
                    (
                        first,
                        second
                    ) =>
                        (
                            first.order ||
                            0
                        ) -
                        (
                            second.order ||
                            0
                        )
                );

            for (
                const module of
                sorted
            ) {
                const health =
                    moduleHealth.get(
                        module.id
                    );

                const status =
                    health?.status ||
                    (
                        module.error
                            ? "failed"
                            : module.initialized
                              ? "healthy"
                              : "starting"
                    );

                section.content.appendChild(
                    createStatusRow({
                        icon:
                            module.icon ||
                            getHealthIcon(
                                status
                            ),

                        name:
                            module.name,

                        status,

                        detail:
                            `${module.id} · v${module.version}`,
                    })
                );
            }
        }

        root.appendChild(
            section.section
        );
    }

    function renderDiagnostics(
        root,
        data
    ) {
        const section =
            createSection(
                "Diagnostics"
            );

        const currentPage =
            safelyRead(
                () =>
                    TACTIC.services
                        .dom
                        .getPage(),
                null
            );

        section.content.append(
            createStatGrid([
                createCard(
                    "Current Page",
                    currentPage
                        ? `${currentPage.name} (${currentPage.id})`
                        : "Unknown"
                ),

                createCard(
                    "Logger Level",
                    data.logger
                        .level ||
                    "unknown"
                ),

                createCard(
                    "DOM Activity",
                    data.dom
                        .metrics
                        ?.lastOperation ||
                    "None"
                ),

                createCard(
                    "Last Refreshed",
                    formatTimestamp(
                        data.timestamp
                    )
                ),
            ])
        );

        root.appendChild(
            section.section
        );
    }

    function renderDashboard(
        container
    ) {
        container.replaceChildren();

        const data =
            collectDashboardData();

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
                            "12px",

                        marginBottom:
                            "10px",
                    },
                }
            );

        const heading =
            createElement(
                "h2",
                {
                    className:
                        "tactic-page-heading",

                    text:
                        "🧪 Developer Dashboard",

                    styles: {
                        margin:
                            "0",
                    },
                }
            );

        const refreshButton =
            createElement(
                "button",
                {
                    text:
                        "Refresh",

                    attributes: {
                        type:
                            "button",
                    },

                    styles: {
                        padding:
                            "8px 12px",

                        border:
                            "1px solid rgba(255, 255, 255, 0.18)",

                        borderRadius:
                            "5px",

                        background:
                            "rgba(255, 255, 255, 0.08)",

                        color:
                            "#fff",

                        cursor:
                            "pointer",

                        fontSize:
                            "12px",

                        fontWeight:
                            "600",
                    },
                }
            );

        refreshButton.addEventListener(
            "click",
            () => {
                renderDashboard(
                    container
                );
            }
        );

        header.append(
            heading,
            refreshButton
        );

        const description =
            createElement(
                "p",
                {
                    text:
                        "Read-only runtime diagnostics for the TACTIC framework.",

                    styles: {
                        margin:
                            "0 0 12px",

                        color:
                            "#aaa",

                        fontSize:
                            "12px",

                        lineHeight:
                            "1.4",
                    },
                }
            );

        container.append(
            header,
            description
        );

        renderOverview(
            container,
            data
        );

        renderRuntime(
            container,
            data
        );

        renderServices(
            container,
            data
        );

        renderTimers(
            container,
            data
        );

        renderModules(
            container,
            data
        );

        renderDiagnostics(
            container,
            data
        );
    }

    TACTIC.registerModule({
        id:
            MODULE_ID,

        name:
            "Developer",

        icon:
            "🧪",

        version:
            "1.0.0",

        order:
            900,

        async init({
            logger,
            events,
        }) {
            logger.info(
                "Developer Dashboard module initialized"
            );

            events.emit(
                "developer-dashboard:initialized"
            );
        },

        render(
            container
        ) {
            renderDashboard(
                container
            );
        },

        destroy({
            logger,
        }) {
            logger.info(
                "Developer Dashboard module destroyed"
            );
        },
    });
})();