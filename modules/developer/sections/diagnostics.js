(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    const dashboard =
        TACTIC?.developerDashboard;

    if (!dashboard) {
        return;
    }

    dashboard.registerSection(
        {
            id:
                "diagnostics",

            order:
                900,

            render({
                container,
                data,
                tools,
            }) {
                const section =
                    tools.createSection(
                        "Diagnostics"
                    );

                const page =
                    tools.safelyRead(
                        () =>
                            TACTIC.services
                                .dom
                                .getPage(),
                        null
                    );

                section.content.append(
                    tools.createStatGrid([
                        tools.createCard(
                            "Current Page",
                            page
                                ? `${page.name} (${page.id})`
                                : "Unknown"
                        ),

                        tools.createCard(
                            "Current Route",
                            data.navigation
                                .currentHref ||
                            globalThis.location
                                .href
                        ),

                        tools.createCard(
                            "Logger Level",
                            data.logger
                                .level ||
                            "unknown"
                        ),

                        tools.createCard(
                            "DOM Activity",
                            data.dom
                                .metrics
                                ?.lastOperation ||
                            "None"
                        ),

                        tools.createCard(
                            "Selector Count",
                            String(
                                data.selectors
                                    .selectorCount ||
                                0
                            )
                        ),

                        tools.createCard(
                            "Fallbacks in Use",
                            String(
                                data.selectors
                                    .fallbackInUseCount ||
                                0
                            )
                        ),

                        tools.createCard(
                            "Dashboard Sections",
                            String(
                                dashboard
                                    .getSections()
                                    .length
                            )
                        ),

                        tools.createCard(
                            "Last Refreshed",
                            tools.formatTimestamp(
                                data.timestamp
                            )
                        ),
                    ])
                );

                container.appendChild(
                    section.section
                );
            },
        },
        {
            replace:
                true,
        }
    );
})();