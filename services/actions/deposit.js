/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/actions/deposit.js
 *
 * Purpose:
 * Registers shared Deposit Service operations as framework
 * actions.
 *
 * Registered actions:
 * - deposit.prepare
 *
 * Safety boundary:
 * - May navigate to a verified destination
 * - May fill a verified amount field
 * - May highlight the submit control
 * - Never submits or confirms the deposit
 *
 * Dependencies:
 * - services/actions/index.js
 * - services/deposit/index.js
 * - services/capabilities/index.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Deposit Actions] Namespace is unavailable."
        );

        return;
    }

    const {
        actions,
        deposit,
        logger,
    } = TACTIC.services;

    if (!actions) {
        console.error(
            "[TACTIC Deposit Actions] Action service is unavailable."
        );

        return;
    }

    if (!deposit) {
        console.error(
            "[TACTIC Deposit Actions] Deposit service is unavailable."
        );

        return;
    }

    function normalizeAmount(
        value
    ) {
        const numeric =
            Number(value);

        if (
            !Number.isSafeInteger(
                numeric
            ) ||
            numeric <= 0
        ) {
            return null;
        }

        return numeric;
    }

    actions.register(
        {
            id:
                "deposit.prepare",

            name:
                "Prepare Deposit",

            description:
                "Navigates to a verified deposit destination, fills the requested amount, highlights the submit control, and leaves submission to the user.",

            capability:
                "deposit.prepare",

            timeoutMs:
                45_000,

            suppressConcurrent:
                true,

            validate({
                input,
            }) {
                if (
                    !input ||
                    typeof input !==
                        "object" ||
                    Array.isArray(
                        input
                    )
                ) {
                    return {
                        valid:
                            false,

                        message:
                            "Deposit action input must be an object.",
                    };
                }

                const destination =
                    input.destination ||
                    input.destinationId;

                const amount =
                    normalizeAmount(
                        input.amount
                    );

                if (
                    typeof destination !==
                        "string" ||
                    !destination.trim()
                ) {
                    return {
                        valid:
                            false,

                        message:
                            "Deposit preparation requires a destination.",
                    };
                }

                if (!amount) {
                    return {
                        valid:
                            false,

                        message:
                            "Deposit preparation requires a positive whole-number amount.",
                    };
                }

                return {
                    valid:
                        true,

                    input: {
                        ...input,

                        destination:
                            destination
                                .trim()
                                .toLowerCase(),

                        amount,
                    },
                };
            },

            async execute({
                input,
            }) {
                return deposit.prepare({
                    destination:
                        input.destination,

                    amount:
                        input.amount,

                    timeoutMs:
                        input.timeoutMs,

                    notify:
                        input.notify !==
                        false,

                    highlightSubmit:
                        input
                            .highlightSubmit !==
                        false,
                });
            },

            metadata: {
                category:
                    "deposit",

                public:
                    true,

                navigation:
                    true,

                fillsForm:
                    true,

                submitsForm:
                    false,

                confirmsTransaction:
                    false,
            },
        },
        {
            replace:
                true,
        }
    );

    logger?.info(
        "Deposit actions registered",
        {
            actions: [
                "deposit.prepare",
            ],
        }
    );
})();