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
                "actions",

            order:
                530,

            render({
                container,
                data,
                tools,
            }) {
                const section =
                    tools.createSection(
                        "Actions"
                    );

                const actions =
                    data.actions ||
                    {};

                section.content.appendChild(
                    tools.createStatGrid([
                        tools.createCard(
                            "Registered",
                            String(
                                actions.actionCount ||
                                0
                            )
                        ),

                        tools.createCard(
                            "Active",
                            String(
                                actions.activeCount ||
                                0
                            )
                        ),

                        tools.createCard(
                            "Authorized",
                            String(
                                actions.authorizedCount ||
                                0
                            )
                        ),

                        tools.createCard(
                            "Denied",
                            String(
                                actions.deniedCount ||
                                0
                            )
                        ),
                    ])
                );

                const registeredActions =
                    actions.actions ||
                    [];

                if (
                    registeredActions.length ===
                    0
                ) {
                    section.content.appendChild(
                        tools.createCard(
                            "Actions",
                            "No actions are registered."
                        )
                    );
                }

                for (
                    const action of
                    registeredActions
                ) {
                    section.content.appendChild(
                        tools.createStatusRow({
                            icon:
                                action.authorized
                                    ? "✓"
                                    : "🔒",

                            name:
                                action.id,

                            status:
                                action.authorized
                                    ? "authorized"
                                    : "denied",

                            detail:
                                action.description ||
                                action.name,
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