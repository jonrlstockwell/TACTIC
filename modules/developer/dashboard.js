/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * modules/developer/dashboard.js
 *
 * Purpose:
 * Provides shared rendering utilities, data collection, and a
 * section registry for the modular Developer Dashboard.
 *
 * Public API:
 * - TACTIC.developerDashboard.registerSection()
 * - TACTIC.developerDashboard.unregisterSection()
 * - TACTIC.developerDashboard.getSections()
 * - TACTIC.developerDashboard.collectData()
 * - TACTIC.developerDashboard.render()
 * - TACTIC.developerDashboard.tools
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

    const sections =
        new Map();

    const metrics = {
        loadedAt:
            Date.now(),

        registrations:
            0,

        replacements:
            0,

        unregistrations:
            0,

        renders:
            0,

        sectionRenders:
            0,

        sectionErrors:
            0,

        lastRenderAt:
            null,

        lastSectionId:
            null,

        lastError:
            null,
    };

    function isPlainObject(
        value
    ) {
        return (
            value !== null &&
            typeof value ===
                "object" &&
            !Array.isArray(
                value
            )
        );
    }

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
                            "1px solid rgba(255,255,255,.12)",

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
                            "1px solid rgba(255,255,255,.13)",

                        borderRadius:
                            "6px",

                        background:
                            "rgba(255,255,255,.035)",
                    },
                }
            );

        card.append(
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
                            ".04em",

                        textTransform:
                            "uppercase",
                    },
                }
            ),

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
            )
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
                            "repeat(2, minmax(0,1fr))",

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
                            "24px minmax(0,1fr) auto",

                        alignItems:
                            "center",

                        gap:
                            "8px",

                        padding:
                            "9px 10px",

                        border:
                            "1px solid rgba(255,255,255,.1)",

                        borderRadius:
                            "5px",

                        background:
                            "rgba(255,255,255,.025)",
                    },
                }
            );

        const nameContainer =
            createElement(
                "div"
            );

        nameContainer.appendChild(
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
            )
        );

        if (detail) {
            nameContainer.appendChild(
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

                            overflowWrap:
                                "anywhere",
                        },
                    }
                )
            );
        }

        row.append(
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
            ),

            nameContainer,

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
            )
        );

        return row;
    }

    function collectRepositoryDiagnostics() {
        const diagnostics =
            {};

        if (
            !TACTIC.repositories ||
            typeof TACTIC.repositories !==
                "object"
        ) {
            return diagnostics;
        }

        for (
            const [
                name,
                repository,
            ] of Object.entries(
                TACTIC.repositories
            )
        ) {
            diagnostics[name] =
                safelyRead(
                    () =>
                        repository
                            ?.inspect?.(),
                    null
                );
        }

        return diagnostics;
    }

    function collectData() {
        const {
            services,
        } = TACTIC;

        return {
            timestamp:
                Date.now(),

            lifecycle:
                safelyRead(
                    () =>
                        services.lifecycle
                            ?.inspect(),
                    {}
                ),

            health:
                safelyRead(
                    () =>
                        services.health
                            ?.snapshot(),
                    {}
                ),

            timers:
                safelyRead(
                    () =>
                        services.scheduler
                            ?.inspect(),
                    []
                ),

            observers:
                safelyRead(
                    () =>
                        services.dom
                            ?.inspectObservers(),
                    []
                ),

            dom:
                safelyRead(
                    () =>
                        services.dom
                            ?.inspect(),
                    {}
                ),

            settings:
                safelyRead(
                    () =>
                        services.settings
                            ?.inspect(),
                    {}
                ),

            notifications:
                safelyRead(
                    () =>
                        services.notifications
                            ?.inspect(),
                    {}
                ),

            logger:
                safelyRead(
                    () =>
                        services.logger
                            ?.inspect(),
                    {}
                ),

            errorRecords:
                safelyRead(
                    () =>
                        services.errors
                            ?.get(),
                    []
                ),

            state:
                safelyRead(
                    () =>
                        services.state
                            ?.inspect(),
                    {}
                ),

            jobs:
                safelyRead(
                    () =>
                        services.jobs
                            ?.inspect(),
                    {}
                ),

            actions:
                safelyRead(
                    () =>
                        services.actions
                            ?.inspect(),
                    {}
                ),

            workflows:
                safelyRead(
                    () =>
                        services.workflows
                            ?.inspect(),
                    {}
                ),

            selectors:
                safelyRead(
                    () =>
                        services.selectors
                            ?.inspect(),
                    {}
                ),

            navigation:
                safelyRead(
                    () =>
                        services.navigation
                            ?.inspect(),
                    {}
                ),

            modules: [
                ...TACTIC.modules.values(),
            ],

            repositories:
                collectRepositoryDiagnostics(),
        };
    }

    function normalizeSection(
        definition
    ) {
        if (
            !isPlainObject(
                definition
            )
        ) {
            throw new TypeError(
                "Dashboard section definition must be an object."
            );
        }

        if (
            typeof definition.id !==
                "string" ||
            !definition.id.trim()
        ) {
            throw new TypeError(
                "Dashboard section requires an ID."
            );
        }

        if (
            typeof definition.render !==
                "function"
        ) {
            throw new TypeError(
                `Dashboard section "${definition.id}" requires render().`
            );
        }

        return {
            id:
                definition.id
                    .trim()
                    .toLowerCase(),

            order:
                Number.isFinite(
                    definition.order
                )
                    ? definition.order
                    : 500,

            render:
                definition.render,

            registeredAt:
                Date.now(),
        };
    }

    function registerSection(
        definition,
        options = {}
    ) {
        const normalized =
            normalizeSection(
                definition
            );

        const existing =
            sections.has(
                normalized.id
            );

        if (
            existing &&
            options.replace !==
                true
        ) {
            throw new Error(
                `Dashboard section "${normalized.id}" is already registered.`
            );
        }

        sections.set(
            normalized.id,
            normalized
        );

        if (existing) {
            metrics.replacements +=
                1;
        } else {
            metrics.registrations +=
                1;
        }

        return normalized.id;
    }

    function unregisterSection(
        sectionId
    ) {
        const removed =
            sections.delete(
                String(
                    sectionId
                )
                    .trim()
                    .toLowerCase()
            );

        if (removed) {
            metrics.unregistrations +=
                1;
        }

        return removed;
    }

    function getSections() {
        return [
            ...sections.values(),
        ].sort(
            (
                first,
                second
            ) =>
                first.order -
                    second.order ||
                first.id.localeCompare(
                    second.id
                )
        );
    }

    function createHeader(
        container
    ) {
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
                            "1px solid rgba(255,255,255,.18)",

                        borderRadius:
                            "5px",

                        background:
                            "rgba(255,255,255,.08)",

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
                render(
                    container
                );
            }
        );

        header.append(
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
            ),

            refreshButton
        );

        return header;
    }

    function renderSectionError(
        container,
        section,
        error
    ) {
        const errorSection =
            createSection(
                `Section Error: ${section.id}`
            );

        errorSection.content.appendChild(
            createCard(
                "Render Failure",
                error?.message ||
                String(error),
                {
                    color:
                        "#ef9a9a",
                }
            )
        );

        container.appendChild(
            errorSection.section
        );
    }

    function render(
        container
    ) {
        metrics.renders +=
            1;

        metrics.lastRenderAt =
            Date.now();

        container.replaceChildren();

        container.append(
            createHeader(
                container
            ),

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
            )
        );

        const data =
            collectData();

        for (
            const section of
            getSections()
        ) {
            metrics.lastSectionId =
                section.id;

            try {
                section.render({
                    container,
                    data,
                    tools,
                });

                metrics.sectionRenders +=
                    1;
            } catch (error) {
                metrics.sectionErrors +=
                    1;

                metrics.lastError = {
                    sectionId:
                        section.id,

                    name:
                        error?.name ||
                        "Error",

                    message:
                        error?.message ||
                        String(error),

                    timestamp:
                        Date.now(),
                };

                renderSectionError(
                    container,
                    section,
                    error
                );

                TACTIC.services.logger?.error(
                    `Developer Dashboard section failed: ${section.id}`,
                    {
                        error,
                    }
                );
            }
        }
    }

    function inspect() {
        return {
            moduleId:
                MODULE_ID,

            sectionCount:
                sections.size,

            sections:
                getSections().map(
                    (section) => ({
                        id:
                            section.id,

                        order:
                            section.order,

                        registeredAt:
                            section
                                .registeredAt,
                    })
                ),

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

    const tools =
        Object.freeze({
            createElement,
            safelyRead,

            formatDuration,
            formatTimestamp,
            formatMoney,

            getHealthIcon,

            createSection,
            createCard,
            createStatGrid,
            createStatusRow,
        });

    TACTIC.developerDashboard =
        Object.freeze({
            registerSection,
            unregisterSection,
            getSections,

            collectData,
            render,
            inspect,

            tools,
        });

    TACTIC.services.logger?.info(
        "Developer Dashboard framework loaded"
    );
})();