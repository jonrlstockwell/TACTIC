/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/workflows/protection.js
 *
 * Purpose:
 * Registers shared Wallet Protection workflows.
 *
 * Registered workflows:
 * - protection.prepare-deposit
 *
 * Safety boundary:
 * - Reads the current wallet snapshot
 * - Evaluates Protection rules
 * - Requests deposit.prepare when recommended
 * - May navigate and fill the deposit amount
 * - Never submits or confirms a deposit
 *
 * Dependencies:
 * - core/dependencies.js
 * - services/workflows/index.js
 * - services/actions/deposit.js
 * - services/deposit/index.js
 * - repositories/user/index.js
 * - modules/protection/settings.js
 * - modules/protection/rules.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Protection Workflows] Namespace is unavailable."
        );

        return;
    }

    if (
        typeof TACTIC.use !==
        "function"
    ) {
        console.error(
            "[TACTIC Protection Workflows] Dependency Registry is unavailable."
        );

        return;
    }

    let dependencies;

    try {
        dependencies =
            TACTIC.use([
                "workflows",
                "actions",
                "deposit",
                "logger",
                "user",
                "protection",
            ]);
    } catch (error) {
        console.error(
            "[TACTIC Protection Workflows] Required dependencies are unavailable.",
            error
        );

        return;
    }

    const {
        workflows,
        actions,
        deposit,
        logger,
        user:
            userRepository,
        protection,
    } = dependencies;

    if (
        !actions.has(
            "deposit.prepare"
        )
    ) {
        console.error(
            "[TACTIC Protection Workflows] deposit.prepare action is unavailable."
        );

        return;
    }

    if (
        !protection.settings ||
        !protection.rules
    ) {
        console.error(
            "[TACTIC Protection Workflows] Protection settings or rules are unavailable."
        );

        return;
    }

    function getConfiguration() {
        const settings =
            protection.settings;

        return {
            enabled:
                settings.get(
                    "enabled"
                ),

            destination:
                settings.get(
                    "depositDestination"
                ),

            threshold:
                settings.get(
                    "threshold"
                ),

            reserve:
                settings.get(
                    "reserve"
                ),

            maximumAutomaticDeposit:
                settings.get(
                    "maximumAutomaticDeposit"
                ),

            duplicateCooldownMs:
                settings.get(
                    "duplicateCooldownMs"
                ),

            notifyOnTrigger:
                settings.get(
                    "notifyOnTrigger"
                ),

            notifyOnPrepared:
                settings.get(
                    "notifyOnPrepared"
                ),
        };
    }

    workflows.register(
        {
            id:
                "protection.prepare-deposit",

            name:
                "Prepare Protection Deposit",

            description:
                "Reads the current wallet, evaluates Wallet Protection rules, and prepares the recommended deposit for manual submission.",

            capability:
                "protection.recommend",

            timeoutMs:
                60_000,

            suppressConcurrent:
                true,

            createContext({
                input,
            }) {
                return {
                    wallet:
                        null,

                    configuration:
                        null,

                    evaluation:
                        null,

                    destination:
                        null,

                    depositAction:
                        null,

                    requestedBy:
                        input?.requestedBy ||
                        "protection",
                };
            },

            steps: [
                {
                    id:
                        "read-wallet",

                    name:
                        "Read Wallet",

                    async run({
                        context,
                    }) {
                        context.wallet =
                            userRepository
                                .refreshWallet(
                                    "protection-workflow"
                                );

                        return {
                            wallet:
                                context.wallet,
                        };
                    },
                },

                {
                    id:
                        "read-configuration",

                    name:
                        "Read Protection Configuration",

                    async run({
                        context,
                    }) {
                        context.configuration =
                            getConfiguration();

                        return {
                            configuration:
                                context
                                    .configuration,
                        };
                    },
                },

                {
                    id:
                        "evaluate-rules",

                    name:
                        "Evaluate Protection Rules",

                    async run({
                        context,
                    }) {
                        context.evaluation =
                            protection.rules
                                .evaluate(
                                    context.wallet,
                                    context
                                        .configuration
                                );

                        return {
                            evaluation:
                                context
                                    .evaluation,
                        };
                    },
                },

                {
                    id:
                        "resolve-destination",

                    name:
                        "Resolve Deposit Destination",

                    when({
                        context,
                    }) {
                        return (
                            context.evaluation
                                ?.shouldDeposit ===
                            true
                        );
                    },

                    async run({
                        context,
                    }) {
                        context.destination =
                            deposit
                                .getDestination(
                                    context
                                        .evaluation
                                        .destination
                                ) ||
                            null;

                        if (
                            !context.destination
                        ) {
                            throw new Error(
                                "The selected deposit destination is unavailable."
                            );
                        }

                        if (
                            !context.destination
                                .verified ||
                            !context.destination
                                .fillSupported
                        ) {
                            throw new Error(
                                `${context.destination.name} is not mapped for deposit preparation.`
                            );
                        }

                        return {
                            destination:
                                context
                                    .destination,
                        };
                    },
                },

                {
                    id:
                        "prepare-deposit",

                    name:
                        "Prepare Deposit",

                    when({
                        context,
                    }) {
                        return (
                            context.evaluation
                                ?.shouldDeposit ===
                                true &&
                            context.destination !==
                                null
                        );
                    },

                    action:
                        "deposit.prepare",

                    input({
                        context,
                    }) {
                        return {
                            destination:
                                context
                                    .evaluation
                                    .destination,

                            amount:
                                context
                                    .evaluation
                                    .depositAmount,

                            notify:
                                context
                                    .configuration
                                    .notifyOnPrepared,

                            highlightSubmit:
                                true,
                        };
                    },
                },

                {
                    id:
                        "record-result",

                    name:
                        "Record Workflow Result",

                    async run({
                        context,
                        workflow,
                    }) {
                        const prepareStep =
                            workflow.steps.find(
                                (step) =>
                                    step.id ===
                                    "prepare-deposit"
                            );

                        context.depositAction =
                            prepareStep
                                ?.result ||
                            null;

                        return {
                            shouldDeposit:
                                context.evaluation
                                    ?.shouldDeposit ===
                                true,

                            evaluation:
                                context.evaluation,

                            destination:
                                context.destination,

                            depositAction:
                                context
                                    .depositAction,
                        };
                    },
                },
            ],

            metadata: {
                category:
                    "protection",

                public:
                    true,

                navigation:
                    true,

                preparesDeposit:
                    true,

                submitsDeposit:
                    false,

                confirmsDeposit:
                    false,

                persistent:
                    false,
            },
        },
        {
            replace:
                true,
        }
    );

    logger.info(
        "Protection workflows registered",
        {
            workflows: [
                "protection.prepare-deposit",
            ],

            dependencySource:
                "TACTIC.use",
        }
    );
})();