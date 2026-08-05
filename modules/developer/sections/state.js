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
                "state",

            order:
                450,

            render({
                container,
                data,
                tools,
            }) {
                const section =
                    tools.createSection(
                        "Shared State"
                    );

                const state =
                    data.state ||
                    {};

                section.content.appendChild(
                    tools.createStatGrid([
                        tools.createCard(
                            "State Keys",
                            String(
                                state
                                    .stateKeyCount ||
                                0
                            )
                        ),

                        tools.createCard(
                            "Revision",
                            String(
                                state
                                    .globalRevision ||
                                0
                            )
                        ),

                        tools.createCard(
                            "Subscribers",
                            String(
                                state
                                    .subscriberCount ||
                                0
                            )
                        ),

                        tools.createCard(
                            "History",
                            String(
                                state
                                    .historyCount ||
                                0
                            )
                        ),
                    ])
                );

                const snapshot =
                    state.snapshot ||
                    {};

                const entries =
                    Object.entries(
                        snapshot
                    );

                if (
                    entries.length ===
                    0
                ) {
                    section.content.appendChild(
                        tools.createCard(
                            "State",
                            "No runtime state has been published."
                        )
                    );
                } else {
                    for (
                        const [
                            key,
                            value,
                        ] of entries
                    ) {
                        let displayValue;

                        if (
                            key ===
                                "user.wallet" &&
                            Number.isFinite(
                                value?.value
                            )
                        ) {
                            displayValue =
                                tools.formatMoney(
                                    value.value
                                );
                        } else if (
                            value !== null &&
                            typeof value ===
                                "object"
                        ) {
                            try {
                                displayValue =
                                    JSON.stringify(
                                        value
                                    );
                            } catch {
                                displayValue =
                                    "[Object]";
                            }
                        } else {
                            displayValue =
                                String(value);
                        }

                        section.content.appendChild(
                            tools.createStatusRow({
                                icon:
                                    "◆",

                                name:
                                    key,

                                status:
                                    `r${
                                        state
                                            .revisions
                                            ?.[key] ||
                                        0
                                    }`,

                                detail:
                                    displayValue,
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