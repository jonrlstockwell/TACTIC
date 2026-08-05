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
                "repositories",

            order:
                400,

            render({
                container,
                data,
                tools,
            }) {
                const section =
                    tools.createSection(
                        "Repositories"
                    );

                const repositoryHealth =
                    data.health
                        .grouped
                        ?.repositories ||
                    [];

                const healthByName =
                    new Map(
                        repositoryHealth.map(
                            (record) => [
                                record.name.replace(
                                    /^repository:/,
                                    ""
                                ),

                                record,
                            ]
                        )
                    );

                const names =
                    new Set([
                        ...healthByName.keys(),
                        ...Object.keys(
                            data.repositories
                        ),
                    ]);

                if (
                    names.size ===
                    0
                ) {
                    section.content.appendChild(
                        tools.createCard(
                            "Repositories",
                            "No repositories are registered."
                        )
                    );
                }

                for (
                    const name of
                    [
                        ...names,
                    ].sort()
                ) {
                    const diagnostics =
                        data.repositories[
                            name
                        ];

                    const health =
                        healthByName.get(
                            name
                        );

                    const status =
                        health?.status ||
                        (
                            diagnostics
                                ?.started
                                ? "healthy"
                                : "unknown"
                        );

                    const details =
                        [];

                    if (
                        Number.isFinite(
                            health?.score
                        )
                    ) {
                        details.push(
                            `Score ${health.score}/100`
                        );
                    }

                    if (
                        name ===
                            "user" &&
                        diagnostics
                    ) {
                        const wallet =
                            diagnostics.wallet;

                        details.push(
                            wallet?.available
                                ? tools.formatMoney(
                                      wallet.value
                                  )
                                : "Wallet unavailable"
                        );

                        details.push(
                            diagnostics
                                .walletWatcher
                                ?.active
                                ? "watcher active"
                                : "watcher inactive"
                        );

                        details.push(
                            diagnostics
                                .sharedState
                                ?.published
                                ? "state published"
                                : "state unavailable"
                        );
                    }

                    section.content.appendChild(
                        tools.createStatusRow({
                            icon:
                                tools.getHealthIcon(
                                    status
                                ),

                            name,

                            status,

                            detail:
                                details.join(
                                    " · "
                                ) ||
                                "Repository diagnostics available",
                        })
                    );

                    if (
                        name ===
                            "user" &&
                        diagnostics
                    ) {
                        section.content.appendChild(
                            tools.createStatGrid([
                                tools.createCard(
                                    "Wallet",
                                    diagnostics
                                        .wallet
                                        ?.available
                                        ? tools.formatMoney(
                                              diagnostics
                                                  .wallet
                                                  .value
                                          )
                                        : "Unavailable"
                                ),

                                tools.createCard(
                                    "Wallet Source",
                                    diagnostics
                                        .wallet
                                        ?.source ||
                                    "Unknown"
                                ),

                                tools.createCard(
                                    "State Revision",
                                    String(
                                        diagnostics
                                            .sharedState
                                            ?.revision ||
                                        0
                                    )
                                ),

                                tools.createCard(
                                    "Subscribers",
                                    String(
                                        diagnostics
                                            .subscribers
                                            ?.total ||
                                        0
                                    )
                                ),
                            ])
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