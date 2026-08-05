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
                "modules",

            order:
                600,

            render({
                container,
                data,
                tools,
            }) {
                const section =
                    tools.createSection(
                        "Modules"
                    );

                const healthById =
                    new Map(
                        (
                            data.health
                                .grouped
                                ?.modules ||
                            []
                        ).map(
                            (record) => [
                                record.name.replace(
                                    /^module:/,
                                    ""
                                ),

                                record,
                            ]
                        )
                    );

                for (
                    const module of
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
                    )
                ) {
                    const health =
                        healthById.get(
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
                        tools.createStatusRow({
                            icon:
                                module.icon ||
                                tools.getHealthIcon(
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