/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/pages/faction-bank.js
 *
 * Purpose:
 * Registers the Faction Bank deposit page object.
 *
 * Safety boundary:
 * - Reads verified controls
 * - Fills the amount input
 * - Highlights the submit control
 * - Never clicks or submits the form
 * - Never confirms a deposit
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Faction Bank Page] Namespace is unavailable."
        );

        return;
    }

    const {
        pages,
        selectors,
        logger,
    } = TACTIC.services;

    if (!pages) {
        console.error(
            "[TACTIC Faction Bank Page] Page Object service is unavailable."
        );

        return;
    }

    const PAGE_ID =
        "faction-bank";

    const SELECTOR_KEYS =
        Object.freeze({
            ROOT:
                "FACTION.ARMOURY_DONATE_ROOT",

            CASH_SECTION:
                "FACTION.CASH_SECTION",

            FORM:
                "FACTION.CASH_FORM",

            AMOUNT:
                "FACTION.DEPOSIT_AMOUNT",

            SUBMIT:
                "FACTION.DEPOSIT_BUTTON",

            PRESETS:
                "FACTION.PRESET_AMOUNT_BUTTONS",
        });

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
            throw new TypeError(
                "Faction deposit amount must be a positive whole number."
            );
        }

        return numeric;
    }

    function dispatchInputEvents(
        element
    ) {
        element.dispatchEvent(
            new Event(
                "input",
                {
                    bubbles:
                        true,
                }
            )
        );

        element.dispatchEvent(
            new Event(
                "change",
                {
                    bubbles:
                        true,
                }
            )
        );
    }

    function highlightElement(
        element,
        options = {}
    ) {
        if (!element) {
            return false;
        }

        const durationMs =
            Number.isSafeInteger(
                options.durationMs
            ) &&
            options.durationMs > 0
                ? options.durationMs
                : 10_000;

        const previousOutline =
            element.style.outline;

        const previousOffset =
            element.style
                .outlineOffset;

        element.style.outline =
            "3px solid #f5a623";

        element.style.outlineOffset =
            "2px";

        setTimeout(
            () => {
                element.style.outline =
                    previousOutline;

                element.style
                    .outlineOffset =
                    previousOffset;
            },
            durationMs
        );

        return true;
    }

    pages.register(
        {
            id:
                PAGE_ID,

            name:
                "Faction Bank",

            description:
                "Represents the faction armoury cash-deposit page.",

            navigationId:
                "deposit:faction-bank",

            rootSelectorKey:
                SELECTOR_KEYS.ROOT,

            requiredSelectorKeys: [
                SELECTOR_KEYS.AMOUNT,
                SELECTOR_KEYS.SUBMIT,
            ],

            create() {
                function resolve(
                    selectorKey,
                    options = {}
                ) {
                    return selectors.resolve(
                        selectorKey,
                        options
                    );
                }

                function find(
                    selectorKey,
                    options = {}
                ) {
                    return selectors.find(
                        selectorKey,
                        options
                    );
                }

                function findAll(
                    selectorKey,
                    options = {}
                ) {
                    return selectors.findAll(
                        selectorKey,
                        options
                    );
                }

                function isReady() {
                    return pages.isReady(
                        PAGE_ID
                    );
                }

                function getRoot() {
                    return find(
                        SELECTOR_KEYS.ROOT
                    );
                }

                function getCashSection() {
                    return find(
                        SELECTOR_KEYS
                            .CASH_SECTION
                    );
                }

                function getForm() {
                    return find(
                        SELECTOR_KEYS.FORM
                    );
                }

                function getAmountInput() {
                    return find(
                        SELECTOR_KEYS.AMOUNT
                    );
                }

                function getSubmitButton() {
                    return find(
                        SELECTOR_KEYS.SUBMIT
                    );
                }

                function getPresetButtons() {
                    return findAll(
                        SELECTOR_KEYS.PRESETS
                    );
                }

                function setAmount(
                    amount
                ) {
                    const normalizedAmount =
                        normalizeAmount(
                            amount
                        );

                    const input =
                        getAmountInput();

                    if (!input) {
                        return {
                            success:
                                false,

                            reason:
                                "amount-input-not-found",

                            amount:
                                normalizedAmount,
                        };
                    }

                    input.focus();

                    input.value =
                        String(
                            normalizedAmount
                        );

                    dispatchInputEvents(
                        input
                    );

                    return {
                        success:
                            true,

                        amount:
                            normalizedAmount,

                        rawValue:
                            input.value,

                        selector:
                            resolve(
                                SELECTOR_KEYS
                                    .AMOUNT
                            ).selector,
                    };
                }

                function highlightSubmit(
                    options = {}
                ) {
                    const button =
                        getSubmitButton();

                    if (!button) {
                        return {
                            success:
                                false,

                            reason:
                                "submit-button-not-found",
                        };
                    }

                    highlightElement(
                        button,
                        options
                    );

                    return {
                        success:
                            true,

                        selector:
                            resolve(
                                SELECTOR_KEYS
                                    .SUBMIT
                            ).selector,
                    };
                }

                function prepareDeposit(
                    amount,
                    options = {}
                ) {
                    const readiness =
                        isReady();

                    if (!readiness.ready) {
                        return {
                            success:
                                false,

                            submitted:
                                false,

                            reason:
                                "page-not-ready",

                            readiness,
                        };
                    }

                    const amountResult =
                        setAmount(
                            amount
                        );

                    if (
                        !amountResult.success
                    ) {
                        return {
                            success:
                                false,

                            submitted:
                                false,

                            reason:
                                amountResult
                                    .reason,

                            amountResult,
                        };
                    }

                    const highlightResult =
                        options
                            .highlightSubmit ===
                        false
                            ? {
                                  success:
                                      false,

                                  skipped:
                                      true,

                                  reason:
                                      "highlight-disabled",
                              }
                            : highlightSubmit(
                                  options
                              );

                    return {
                        success:
                            true,

                        prepared:
                            true,

                        submitted:
                            false,

                        amount:
                            amountResult
                                .amount,

                        amountResult,

                        highlightResult,

                        safety: {
                            submitClicked:
                                false,

                            confirmationClicked:
                                false,

                            userSubmissionRequired:
                                true,
                        },
                    };
                }

                function inspect() {
                    const readiness =
                        isReady();

                    return {
                        pageId:
                            PAGE_ID,

                        ready:
                            readiness.ready,

                        readiness,

                        elements: {
                            root:
                                Boolean(
                                    getRoot()
                                ),

                            cashSection:
                                Boolean(
                                    getCashSection()
                                ),

                            form:
                                Boolean(
                                    getForm()
                                ),

                            amountInput:
                                Boolean(
                                    getAmountInput()
                                ),

                            submitButton:
                                Boolean(
                                    getSubmitButton()
                                ),

                            presetButtons:
                                getPresetButtons()
                                    .length,
                        },

                        safety: {
                            canFillAmount:
                                true,

                            canHighlightSubmit:
                                true,

                            submitsForm:
                                false,

                            confirmsTransaction:
                                false,
                        },
                    };
                }

                return Object.freeze({
                    id:
                        PAGE_ID,

                    isReady,

                    getRoot,
                    getCashSection,
                    getForm,

                    getAmountInput,
                    getSubmitButton,
                    getPresetButtons,

                    setAmount,
                    highlightSubmit,
                    prepareDeposit,

                    inspect,
                });
            },

            metadata: {
                category:
                    "deposit",

                destination:
                    "faction-bank",

                public:
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
        "Faction Bank page object registered"
    );
})();