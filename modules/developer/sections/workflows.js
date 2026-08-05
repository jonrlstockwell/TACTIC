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
                "workflows",

            order:
                540,

            render({
                container,
                data,
                tools,
            }) {
                const section =
                    tools.createSection(
                        "Workflows"
                    );

                const workflows =
                    data.workflows ||
                    {};

                section.content.appendChild(
                    tools.createStatGrid([
                        tools.createCard(
                            "Registered",
                            String(
                                workflows
                                    .workflowCount ||
                                0
                            )
                        ),

                        tools.createCard(
                            "Active",
                            String(
                                workflows
                                    .activeCount ||
                                0
                            )
                        ),

                        tools.createCard(
                            "Authorized",
                            String(
                                workflows
                                    .authorizedCount ||
                                0
                            )
                        ),

                        tools.createCard(
                            "History",
                            String(
                                workflows
                                    .historyCount ||
                                0
                            )
                        ),
                    ])
                );

                const registeredWorkflows =
                    workflows.workflows ||
                    [];

                if (
                    registeredWorkflows.length ===
                        0
                ) {
                    section.content.appendChild(
                        tools.createCard(
                            "Workflows",
                            "No workflows are registered."
                        )
                    );
                }

                for (
                    const workflow of
                    registeredWorkflows
                ) {
                    const stepCount =
                        workflow.steps
                            ?.length ||
                        0;

                    section.content.appendChild(
                        tools.createStatusRow({
                            icon:
                                workflow.authorized
                                    ? "⇢"
                                    : "🔒",

                            name:
                                workflow.id,

                            status:
                                workflow.authorized
                                    ? "ready"
                                    : "denied",

                            detail:
                                `${stepCount} step(s) · ${
                                    workflow.description ||
                                    workflow.name
                                }`,
                        })
                    );
                }

                for (
                    const execution of
                    workflows.active ||
                    []
                ) {
                    section.content.appendChild(
                        tools.createStatusRow({
                            icon:
                                "▶",

                            name:
                                execution
                                    .workflowId,

                            status:
                                execution.state,

                            detail:
                                execution
                                    .currentStepId
                                    ? `Current step: ${execution.currentStepId}`
                                    : "Starting",
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