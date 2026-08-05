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
                "framework",

            order:
                100,

            render({
                container,
                data,
                tools,
            }) {
                const section =
                    tools.createSection(
                        "Framework"
                    );

                const status =
                    data.health
                        .overallStatus ||
                    "unknown";

                const score =
                    Number.isFinite(
                        data.health
                            .overallScore
                    )
                        ? data.health
                              .overallScore
                        : 0;

                section.content.append(
                    tools.createStatGrid([
                        tools.createCard(
                            "Version",
                            TACTIC.version,
                            {
                                large:
                                    true,
                            }
                        ),

                        tools.createCard(
                            "Lifecycle",
                            data.lifecycle
                                .state ||
                            "unknown",
                            {
                                large:
                                    true,
                            }
                        ),

                        tools.createCard(
                            "Health",
                            `${tools.getHealthIcon(
                                status
                            )} ${status}`,
                            {
                                large:
                                    true,
                            }
                        ),

                        tools.createCard(
                            "Health Score",
                            `${score}/100`,
                            {
                                large:
                                    true,
                            }
                        ),

                        tools.createCard(
                            "Uptime",
                            tools.formatDuration(
                                data.lifecycle
                                    .uptimeMs ||
                                0
                            )
                        ),

                        tools.createCard(
                            "Initialized",
                            TACTIC.initialized
                                ? "Yes"
                                : "No"
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