/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * modules/protection/index.js
 *
 * Purpose:
 * Provides the Wallet Protection drawer application and connects
 * the User Repository, Protection rules, and persistent settings.
 *
 * Responsibilities:
 * - Register the Protection application
 * - Subscribe to live wallet updates
 * - Evaluate the current wallet
 * - Display Protection status and configuration
 * - Allow safe settings changes
 * - Refresh the page when relevant data changes
 *
 * Does NOT:
 * - Navigate to the faction bank
 * - Fill deposit fields
 * - Click deposit or confirmation buttons
 * - Execute automatic transactions
 *
 * Public API:
 * - Registered module: protection
 * - TACTIC.protection.inspect()
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Protection] Namespace is unavailable."
        );

        return;
    }

    const MODULE_ID =
        "protection";

    const settings =
        TACTIC.protection?.settings;

    const rules =
        TACTIC.protection?.rules;

    const userRepository =
        TACTIC.repositories?.user;

    const {
        drawer,
        logger,
        events,
        notifications,
        health,
    } = TACTIC.services;

    if (
        !settings ||
        !rules ||
        !userRepository
    ) {
        console.error(
            "[TACTIC Protection] Required dependencies are unavailable."
        );

        return;
    }

    let unsubscribeWallet =
        null;

    let removeSettingsListener =
        null;

    let latestWallet =
        userRepository.getWallet();

    let latestEvaluation =
        null;

    const metrics = {
        loadedAt:
            Date.now(),

        initializedAt:
            null,

        renders:
            0,

        walletUpdates:
            0,

        evaluations:
            0,

        settingsChanges:
            0,

        refreshRequests:
            0,

        lastWalletUpdateAt:
            null,

        lastEvaluationAt:
            null,
    };

    function formatMoney(
        value
    ) {
        if (
            !Number.isFinite(
                value
            )
        ) {
            return "Unknown";
        }

        return new Intl.NumberFormat(
            "en-US",
            {
                style:
                    "currency",

                currency:
                    "USD",

                maximumFractionDigits:
                    0,
            }
        ).format(
            value
        );
    }

    function getConfiguration() {
        return {
            enabled:
                settings.get(
                    "enabled"
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

            notifyOnComplete:
                settings.get(
                    "notifyOnComplete"
                ),
        };
    }

    function evaluate() {
        metrics.evaluations +=
            1;

        metrics.lastEvaluationAt =
            Date.now();

        latestEvaluation =
            rules.evaluate(
                latestWallet,
                getConfiguration()
            );

        return latestEvaluation;
    }

    function isProtectionPageActive() {
        return (
            drawer?.getActiveModuleId() ===
            MODULE_ID
        );
    }

    async function refreshIfActive() {
        metrics.refreshRequests +=
            1;

        if (
            !isProtectionPageActive()
        ) {
            return false;
        }

        await drawer
            ?.renderActiveModule();

        return true;
    }

    function createElement(
        tagName,
        options = {}
    ) {
        const element =
            document.createElement(
                tagName
            );

        if (options.text !== undefined) {
            element.textContent =
                String(options.text);
        }

        if (options.className) {
            element.className =
                options.className;
        }

        if (options.styles) {
            Object.assign(
                element.style,
                options.styles
            );
        }

        if (options.attributes) {
            for (
                const [
                    name,
                    value,
                ] of Object.entries(
                    options.attributes
                )
            ) {
                element.setAttribute(
                    name,
                    String(value)
                );
            }
        }

        return element;
    }

    function createCard(
        label,
        value
    ) {
        const card =
            createElement(
                "div",
                {
                    styles: {
                        padding:
                            "11px 12px",

                        border:
                            "1px solid rgba(255,255,255,.14)",

                        borderRadius:
                            "6px",

                        background:
                            "rgba(255,255,255,.035)",
                    },
                }
            );

        const labelElement =
            createElement(
                "div",
                {
                    text:
                        label,

                    styles: {
                        marginBottom:
                            "4px",

                        color:
                            "#999",

                        fontSize:
                            "11px",

                        fontWeight:
                            "700",

                        textTransform:
                            "uppercase",
                    },
                }
            );

        const valueElement =
            createElement(
                "div",
                {
                    text:
                        value,

                    styles: {
                        color:
                            "#f2f2f2",

                        fontSize:
                            "16px",

                        fontWeight:
                            "700",
                    },
                }
            );

        card.append(
            labelElement,
            valueElement
        );

        return card;
    }

    function createButton(
        text,
        onClick,
        options = {}
    ) {
        const button =
            createElement(
                "button",
                {
                    text,

                    attributes: {
                        type:
                            "button",
                    },

                    styles: {
                        width:
                            "100%",

                        padding:
                            "10px 12px",

                        border:
                            "1px solid rgba(255,255,255,.18)",

                        borderRadius:
                            "5px",

                        background:
                            options.primary
                                ? "rgba(75,145,230,.28)"
                                : "rgba(255,255,255,.07)",

                        color:
                            "#fff",

                        cursor:
                            "pointer",

                        fontSize:
                            "13px",

                        fontWeight:
                            "700",
                    },
                }
            );

        button.addEventListener(
            "click",
            onClick
        );

        return button;
    }

    function createNumberSetting(
        label,
        key
    ) {
        const wrapper =
            createElement(
                "label",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "5px",
                    },
                }
            );

        const labelElement =
            createElement(
                "span",
                {
                    text:
                        label,

                    styles: {
                        color:
                            "#bbb",

                        fontSize:
                            "12px",

                        fontWeight:
                            "600",
                    },
                }
            );

        const input =
            createElement(
                "input",
                {
                    attributes: {
                        type:
                            "number",

                        min:
                            "0",

                        step:
                            "1",

                        value:
                            settings.get(
                                key
                            ),
                    },

                    styles: {
                        boxSizing:
                            "border-box",

                        width:
                            "100%",

                        padding:
                            "9px 10px",

                        border:
                            "1px solid rgba(255,255,255,.16)",

                        borderRadius:
                            "5px",

                        background:
                            "#202020",

                        color:
                            "#fff",
                    },
                }
            );

        input.addEventListener(
            "change",
            () => {
                const value =
                    Number(
                        input.value
                    );

                try {
                    settings.set(
                        key,
                        value,
                        {
                            source:
                                "protection-ui",
                        }
                    );
                } catch (error) {
                    notifications?.warning(
                        error.message,
                        {
                            title:
                                "Invalid Protection Setting",

                            group:
                                "protection",
                        }
                    );

                    input.value =
                        String(
                            settings.get(
                                key
                            )
                        );
                }
            }
        );

        wrapper.append(
            labelElement,
            input
        );

        return wrapper;
    }

    function render(
        container
    ) {
        metrics.renders +=
            1;

        const evaluation =
            evaluate();

        container.replaceChildren();

        const heading =
            createElement(
                "h2",
                {
                    text:
                        "🛡 Wallet Protection",

                    className:
                        "tactic-page-heading",
                }
            );

        const description =
            createElement(
                "p",
                {
                    text:
                        "Monitors your wallet and calculates how much should be protected. Automatic transactions remain disabled during this build phase.",

                    styles: {
                        color:
                            "#aaa",

                        fontSize:
                            "12px",

                        lineHeight:
                            "1.45",
                    },
                }
            );

        const status =
            createElement(
                "div",
                {
                    text:
                        evaluation.shouldDeposit
                            ? "Deposit recommended"
                            : evaluation.reason.replaceAll(
                                  "-",
                                  " "
                              ),

                    styles: {
                        margin:
                            "12px 0",

                        padding:
                            "10px 12px",

                        borderRadius:
                            "6px",

                        background:
                            evaluation.shouldDeposit
                                ? "rgba(245,166,35,.13)"
                                : settings.get(
                                      "enabled"
                                  )
                                  ? "rgba(67,160,71,.13)"
                                  : "rgba(255,255,255,.05)",

                        color:
                            "#eee",

                        fontWeight:
                            "700",

                        textTransform:
                            "capitalize",
                    },
                }
            );

        const grid =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gridTemplateColumns:
                            "repeat(2, minmax(0,1fr))",

                        gap:
                            "8px",
                    },
                }
            );

        grid.append(
            createCard(
                "Wallet",
                evaluation
                    .wallet
                    .available
                    ? formatMoney(
                          evaluation
                              .wallet
                              .value
                      )
                    : "Unknown"
            ),

            createCard(
                "Keep in Wallet",
                formatMoney(
                    evaluation
                        .configuration
                        .reserve
                )
            ),

            createCard(
                "Next Deposit",
                formatMoney(
                    evaluation
                        .depositAmount
                )
            ),

            createCard(
                "After Deposit",
                formatMoney(
                    evaluation
                        .remainingWallet
                )
            ),

            createCard(
                "Transaction Cap",
                formatMoney(
                    evaluation
                        .configuration
                        .maximumAutomaticDeposit
                )
            ),

            createCard(
                "Protection",
                evaluation
                    .configuration
                    .enabled
                    ? "Enabled"
                    : "Disabled"
            )
        );

        const controls =
            createElement(
                "div",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "8px",

                        marginTop:
                            "14px",
                    },
                }
            );

        controls.append(
            createButton(
                settings.get(
                    "enabled"
                )
                    ? "Disable Protection"
                    : "Enable Protection",
                () => {
                    const enabled =
                        !settings.get(
                            "enabled"
                        );

                    settings.set(
                        "enabled",
                        enabled,
                        {
                            source:
                                "protection-ui",
                        }
                    );

                    notifications?.info(
                        enabled
                            ? "Wallet Protection enabled."
                            : "Wallet Protection disabled.",
                        {
                            title:
                                "Protection",

                            group:
                                "protection",
                        }
                    );
                },
                {
                    primary:
                        !settings.get(
                            "enabled"
                        ),
                }
            ),

            createButton(
                "Refresh Wallet",
                () => {
                    latestWallet =
                        userRepository
                            .refreshWallet(
                                "protection-ui"
                            );

                    refreshIfActive();
                }
            )
        );

        const settingsSection =
            createElement(
                "section",
                {
                    styles: {
                        display:
                            "grid",

                        gap:
                            "10px",

                        marginTop:
                            "18px",
                    },
                }
            );

        const settingsHeading =
            createElement(
                "h3",
                {
                    text:
                        "Protection Settings",

                    styles: {
                        margin:
                            "0",

                        color:
                            "#eee",

                        fontSize:
                            "14px",
                    },
                }
            );

        settingsSection.append(
            settingsHeading,

            createNumberSetting(
                "Activation Threshold",
                "threshold"
            ),

            createNumberSetting(
                "Keep in Wallet",
                "reserve"
            ),

            createNumberSetting(
                "Maximum Transaction",
                "maximumAutomaticDeposit"
            )
        );

        container.append(
            heading,
            description,
            status,
            grid,
            controls,
            settingsSection
        );
    }

    function inspect() {
        return {
            module:
                MODULE_ID,

            initialized:
                metrics.initializedAt !==
                null,

            wallet: {
                ...latestWallet,
            },

            evaluation:
                latestEvaluation
                    ? {
                          ...latestEvaluation,

                          wallet: {
                              ...latestEvaluation
                                  .wallet,
                          },

                          configuration: {
                              ...latestEvaluation
                                  .configuration,
                          },
                      }
                    : null,

            configuration:
                getConfiguration(),

            metrics: {
                ...metrics,
            },
        };
    }

    TACTIC.protection.inspect =
        inspect;

    TACTIC.registerModule({
        id:
            MODULE_ID,

        name:
            "Protection",

        icon:
            "🛡",

        version:
            "1.0.0",

        order:
            100,

        async init() {
            metrics.initializedAt =
                Date.now();

            unsubscribeWallet =
                userRepository.subscribe(
                    "wallet",
                    ({
                        value,
                    }) => {
                        latestWallet =
                            value;

                        metrics.walletUpdates +=
                            1;

                        metrics.lastWalletUpdateAt =
                            Date.now();

                        evaluate();
                        refreshIfActive();
                    },
                    {
                        emitInitial:
                            true,
                    }
                );

            removeSettingsListener =
                events.on(
                    TACTIC.EVENTS
                        .SETTINGS
                        .CHANGED,
                    ({
                        namespace,
                    }) => {
                        if (
                            namespace !==
                            "protection"
                        ) {
                            return;
                        }

                        metrics.settingsChanges +=
                            1;

                        evaluate();
                        refreshIfActive();
                    }
                );

            health?.register({
                name:
                    "module:protection",

                type:
                    health.types.MODULE,

                status:
                    TACTIC
                        .HEALTH_STATES
                        .HEALTHY,

                metadata: {
                    moduleId:
                        MODULE_ID,

                    phase:
                        "safe-foundation",

                    automaticTransactions:
                        false,

                    requiresHeartbeat:
                        false,
                },
            });

            logger?.info(
                "Protection module initialized"
            );
        },

        render(
            container
        ) {
            render(
                container
            );
        },

        destroy() {
            if (
                typeof unsubscribeWallet ===
                "function"
            ) {
                unsubscribeWallet();

                unsubscribeWallet =
                    null;
            }

            if (
                typeof removeSettingsListener ===
                "function"
            ) {
                removeSettingsListener();

                removeSettingsListener =
                    null;
            }

            logger?.info(
                "Protection module destroyed"
            );
        },
    });
})();