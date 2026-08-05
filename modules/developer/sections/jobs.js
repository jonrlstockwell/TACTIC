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
                "jobs",

            order:
                520,

            render({
                container,
                data,
                tools,
            }) {
                const section =
                    tools.createSection(
                        "Jobs"
                    );

                const jobs =
                    data.jobs ||
                    {};

                section.content.appendChild(
                    tools.createStatGrid([
                        tools.createCard(
                            "Active",
                            String(
                                jobs.activeCount ||
                                0
                            )
                        ),

                        tools.createCard(
                            "Queued",
                            String(
                                jobs.queueCount ||
                                0
                            )
                        ),

                        tools.createCard(
                            "History",
                            String(
                                jobs.historyCount ||
                                0
                            )
                        ),

                        tools.createCard(
                            "Concurrency",
                            String(
                                jobs.concurrency ||
                                0
                            )
                        ),
                    ])
                );

                const active =
                    jobs.active ||
                    [];

                const queued =
                    jobs.queue ||
                    [];

                if (
                    active.length ===
                        0 &&
                    queued.length ===
                        0
                ) {
                    section.content.appendChild(
                        tools.createCard(
                            "Job Queue",
                            "No active or queued jobs."
                        )
                    );
                }

                for (
                    const job of
                    active
                ) {
                    section.content.appendChild(
                        tools.createStatusRow({
                            icon:
                                "▶",

                            name:
                                job.name,

                            status:
                                job.state,

                            detail:
                                `Job ${job.id} · attempt ${job.attempt}/${job.maximumAttempts}`,
                        })
                    );
                }

                for (
                    const job of
                    queued
                ) {
                    section.content.appendChild(
                        tools.createStatusRow({
                            icon:
                                job.state ===
                                "paused"
                                    ? "⏸"
                                    : "⏳",

                            name:
                                job.name,

                            status:
                                job.state,

                            detail:
                                `Job ${job.id} · ${job.priority} priority`,
                        })
                    );
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