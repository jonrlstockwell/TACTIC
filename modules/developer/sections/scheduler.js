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
                "scheduler",

            order:
                500,

            render({
                container,
                data,
                tools,
            }) {
                const section =
                    tools.createSection(
                        "Scheduled Tasks"
                    );

                if (
                    data.timers.length ===
                    0
                ) {
                    section.content.appendChild(
                        tools.createCard(
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
                                : `Next run in ${tools.formatDuration(
                                      timer
                                          .millisecondsUntilNextRun
                                  )}`;

                        section.content.appendChild(
                            tools.createStatusRow({
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