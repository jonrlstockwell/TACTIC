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
                "services",

            order:
                300,

            render({
                container,
                data,
                tools,
            }) {
                const section =
                    tools.createSection(
                        "Services"
                    );

                const services =
                    data.health
                        .grouped
                        ?.services ||
                    [];

                if (
                    services.length ===
                    0
                ) {
                    section.content.appendChild(
                        tools.createCard(
                            "Services",
                            "No service health records are available."
                        )
                    );
                } else {
                    for (
                        const service of
                        services
                    ) {
                        section.content.appendChild(
                            tools.createStatusRow({
                                icon:
                                    tools.getHealthIcon(
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