(() => {
    "use strict";

    const dashboard =
        globalThis.TACTIC
            ?.developerDashboard;

    if (!dashboard) {
        return;
    }

    dashboard.registerSection(
        {
            id:
                "runtime",

            order:
                200,

            render({
                container,
                data,
                tools,
            }) {
                const section =
                    tools.createSection(
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
                    tools.createStatGrid([
                        tools.createCard(
                            "Active Timers",
                            String(
                                activeTimers
                            )
                        ),

                        tools.createCard(
                            "DOM Observers",
                            String(
                                activeObservers
                            )
                        ),

                        tools.createCard(
                            "State Keys",
                            String(
                                data.state
                                    .stateKeyCount ||
                                0
                            )
                        ),

                        tools.createCard(
                            "Repositories",
                            String(
                                Object.keys(
                                    data.repositories
                                ).length
                            )
                        ),

                        tools.createCard(
                            "Jobs Active",
                            String(
                                data.jobs
                                    .activeCount ||
                                0
                            )
                        ),

                        tools.createCard(
                            "Actions Active",
                            String(
                                data.actions
                                    .activeCount ||
                                0
                            )
                        ),

                        tools.createCard(
                            "Workflows Active",
                            String(
                                data.workflows
                                    .activeCount ||
                                0
                            )
                        ),

                        tools.createCard(
                            "Notifications",
                            String(
                                data.notifications
                                    .activeCount ||
                                0
                            )
                        ),

                        tools.createCard(
                            "Warnings",
                            String(
                                warnings
                            )
                        ),

                        tools.createCard(
                            "Errors",
                            String(
                                errors
                            )
                        ),

                        tools.createCard(
                            "Modules",
                            String(
                                data.modules.length
                            )
                        ),

                        tools.createCard(
                            "Subscribers",
                            String(
                                data.state
                                    .subscriberCount ||
                                0
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