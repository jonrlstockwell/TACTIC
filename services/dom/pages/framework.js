/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/dom/pages/framework.js
 *
 * Purpose:
 * Extends the DOM page-helper subsystem with a standardized,
 * capability-based helper interface.
 *
 * Responsibilities:
 * - Standardize registered page helpers
 * - Infer capabilities from existing helper methods
 * - Allow helpers to declare explicit capabilities
 * - Resolve helpers by ID or capability
 * - Identify the helper for the current page
 * - Safely invoke supported helper operations
 * - Preserve compatibility with existing helper files
 * - Expose framework diagnostics
 *
 * Does NOT:
 * - Detect Torn routes itself
 * - Define page-specific selectors
 * - Navigate between pages
 * - Submit forms
 * - Confirm transactions
 * - Replace existing page helpers
 *
 * Public API:
 * - TACTIC.services.dom.pages.capabilities
 * - TACTIC.services.dom.pages.can()
 * - TACTIC.services.dom.pages.current()
 * - TACTIC.services.dom.pages.describeHelper()
 * - TACTIC.services.dom.pages.findByCapability()
 * - TACTIC.services.dom.pages.invoke()
 * - TACTIC.services.dom.pages.inspectFramework()
 *
 * Dependencies:
 * - core/dependencies.js
 * - services/dom/index.js
 * - services/dom/pages/index.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC DOM Page Framework] Namespace is unavailable."
        );

        return;
    }

    if (
        typeof TACTIC.use !==
        "function"
    ) {
        console.error(
            "[TACTIC DOM Page Framework] Dependency Registry is unavailable."
        );

        return;
    }

    let dependencies;

    try {
        dependencies =
            TACTIC.use({
                dom:
                    true,

                logger:
                    false,
            });
    } catch (error) {
        console.error(
            "[TACTIC DOM Page Framework] Required dependencies are unavailable.",
            error
        );

        return;
    }

    const {
        dom,
        logger,
    } = dependencies;

    if (
        !dom.pages ||
        typeof dom.pages.registerHelper !==
            "function" ||
        typeof dom.pages.getHelper !==
            "function"
    ) {
        console.error(
            "[TACTIC DOM Page Framework] DOM page subsystem is unavailable."
        );

        return;
    }

    const pages =
        dom.pages;

    const CAPABILITIES =
        Object.freeze({
            READY:
                "page.ready",

            WAIT_UNTIL_READY:
                "page.wait-until-ready",

            INSPECT:
                "page.inspect",

            AMOUNT_READ:
                "amount.read",

            AMOUNT_SET:
                "amount.set",

            AMOUNT_MAXIMUM:
                "amount.maximum",

            SUBMIT_LOCATE:
                "submit.locate",

            SUBMIT_HIGHLIGHT:
                "submit.highlight",

            DEPOSIT_PREPARE:
                "deposit.prepare",

            DEPOSIT_SUBMIT:
                "deposit.submit",

            TRANSACTION_CONFIRM:
                "transaction.confirm",
        });

    const DEFAULT_METHOD_BY_CAPABILITY =
        Object.freeze({
            [CAPABILITIES.READY]:
                "isReady",

            [CAPABILITIES.WAIT_UNTIL_READY]:
                "waitUntilReady",

            [CAPABILITIES.INSPECT]:
                "inspect",

            [CAPABILITIES.AMOUNT_READ]:
                "getAmountInput",

            [CAPABILITIES.AMOUNT_SET]:
                "setAmount",

            [CAPABILITIES.AMOUNT_MAXIMUM]:
                "getMaximumDeposit",

            [CAPABILITIES.SUBMIT_LOCATE]:
                "getSubmitButton",

            [CAPABILITIES.SUBMIT_HIGHLIGHT]:
                "highlightSubmit",

            [CAPABILITIES.DEPOSIT_PREPARE]:
                "prepareDeposit",

            [CAPABILITIES.DEPOSIT_SUBMIT]:
                "submitDeposit",

            [CAPABILITIES.TRANSACTION_CONFIRM]:
                "confirmTransaction",
        });

    const originalRegisterHelper =
        pages.registerHelper.bind(
            pages
        );

    const frameworkRecords =
        new Map();

    const metrics = {
        loadedAt:
            Date.now(),

        helperRegistrationsObserved:
            0,

        helpersStandardized:
            0,

        explicitCapabilities:
            0,

        inferredCapabilities:
            0,

        capabilityChecks:
            0,

        capabilityMatches:
            0,

        capabilityMisses:
            0,

        currentHelperChecks:
            0,

        currentHelperMatches:
            0,

        currentHelperMisses:
            0,

        invocations:
            0,

        successfulInvocations:
            0,

        failedInvocations:
            0,

        lastHelperId:
            null,

        lastCapability:
            null,

        lastInvocationAt:
            null,

        lastError:
            null,
    };

    function createErrorSnapshot(
        error
    ) {
        if (!error) {
            return null;
        }

        return {
            name:
                error?.name ||
                "Error",

            message:
                error?.message ||
                String(error),

            timestamp:
                Date.now(),
        };
    }

    function normalizeHelperId(
        value
    ) {
        if (
            typeof value !==
                "string" ||
            !value.trim()
        ) {
            throw new TypeError(
                "Page-helper ID must be a non-empty string."
            );
        }

        return value
            .trim()
            .toLowerCase();
    }

    function normalizeCapability(
        value
    ) {
        if (
            typeof value !==
                "string" ||
            !value.trim()
        ) {
            throw new TypeError(
                "Page-helper capability must be a non-empty string."
            );
        }

        const normalized =
            value
                .trim()
                .toLowerCase();

        if (
            !/^[a-z0-9._:-]+$/
                .test(normalized)
        ) {
            throw new TypeError(
                `Unsupported page-helper capability: "${value}".`
            );
        }

        return normalized;
    }

    function normalizeMethodName(
        value
    ) {
        if (
            typeof value !==
                "string" ||
            !value.trim()
        ) {
            throw new TypeError(
                "Page-helper method name must be a non-empty string."
            );
        }

        return value.trim();
    }

    function readExplicitCapabilities(
        helper
    ) {
        const result =
            new Map();

        const declared =
            helper.capabilities;

        if (
            Array.isArray(
                declared
            )
        ) {
            for (
                const capability of
                declared
            ) {
                const normalizedCapability =
                    normalizeCapability(
                        capability
                    );

                const methodName =
                    DEFAULT_METHOD_BY_CAPABILITY[
                        normalizedCapability
                    ] ||
                    null;

                if (
                    methodName &&
                    typeof helper[
                        methodName
                    ] ===
                        "function"
                ) {
                    result.set(
                        normalizedCapability,
                        methodName
                    );
                }
            }

            return result;
        }

        if (
            declared &&
            typeof declared ===
                "object"
        ) {
            for (
                const [
                    capability,
                    configuration,
                ] of Object.entries(
                    declared
                )
            ) {
                const normalizedCapability =
                    normalizeCapability(
                        capability
                    );

                if (
                    configuration ===
                    false
                ) {
                    continue;
                }

                let methodName =
                    null;

                if (
                    typeof configuration ===
                    "string"
                ) {
                    methodName =
                        normalizeMethodName(
                            configuration
                        );
                } else if (
                    configuration ===
                    true
                ) {
                    methodName =
                        DEFAULT_METHOD_BY_CAPABILITY[
                            normalizedCapability
                        ] ||
                        null;
                } else if (
                    configuration &&
                    typeof configuration ===
                        "object"
                ) {
                    methodName =
                        typeof configuration
                            .method ===
                            "string"
                            ? normalizeMethodName(
                                  configuration
                                      .method
                              )
                            : DEFAULT_METHOD_BY_CAPABILITY[
                                  normalizedCapability
                              ] ||
                              null;
                }

                if (
                    methodName &&
                    typeof helper[
                        methodName
                    ] ===
                        "function"
                ) {
                    result.set(
                        normalizedCapability,
                        methodName
                    );
                }
            }
        }

        return result;
    }

    function inferCapabilities(
        helper,
        existing
    ) {
        const result =
            new Map(
                existing
            );

        for (
            const [
                capability,
                methodName,
            ] of Object.entries(
                DEFAULT_METHOD_BY_CAPABILITY
            )
        ) {
            if (
                result.has(
                    capability
                )
            ) {
                continue;
            }

            if (
                typeof helper[
                    methodName
                ] ===
                "function"
            ) {
                result.set(
                    capability,
                    methodName
                );
            }
        }

        return result;
    }

    function createCapabilityObject(
        capabilityMethods
    ) {
        return Object.freeze(
            Object.fromEntries(
                [
                    ...capabilityMethods
                        .entries(),
                ]
                    .sort(
                        (
                            first,
                            second
                        ) =>
                            first[0]
                                .localeCompare(
                                    second[0]
                                )
                    )
                    .map(
                        ([
                            capability,
                            method,
                        ]) => [
                            capability,
                            Object.freeze({
                                supported:
                                    true,

                                method,
                            }),
                        ]
                    )
            )
        );
    }

    function createFrameworkRecord(
        helperId,
        originalHelper,
        standardizedHelper,
        capabilityMethods,
        options = {}
    ) {
        return {
            id:
                helperId,

            name:
                typeof originalHelper
                    .name ===
                    "string"
                    ? originalHelper
                          .name
                    : helperId,

            pageId:
                typeof originalHelper
                    .pageId ===
                    "string"
                    ? originalHelper
                          .pageId
                    : typeof options.pageId ===
                          "string"
                        ? options.pageId
                        : null,

            routeId:
                typeof originalHelper
                    .routeId ===
                    "string"
                    ? originalHelper
                          .routeId
                    : typeof options.routeId ===
                          "string"
                        ? options.routeId
                        : null,

            registeredAt:
                Date.now(),

            originalHelper,

            standardizedHelper,

            capabilityMethods:
                new Map(
                    capabilityMethods
                ),

            explicitCapabilityCount:
                readExplicitCapabilities(
                    originalHelper
                ).size,

            capabilityCount:
                capabilityMethods.size,
        };
    }

    function standardizeHelper(
        helperId,
        helper,
        options = {}
    ) {
        const id =
            normalizeHelperId(
                helperId
            );

        const explicitCapabilities =
            readExplicitCapabilities(
                helper
            );

        const capabilityMethods =
            inferCapabilities(
                helper,
                explicitCapabilities
            );

        metrics.explicitCapabilities +=
            explicitCapabilities.size;

        metrics.inferredCapabilities +=
            Math.max(
                0,
                capabilityMethods.size -
                    explicitCapabilities.size
            );

        const capabilities =
            createCapabilityObject(
                capabilityMethods
            );

        function can(
            capability
        ) {
            const normalizedCapability =
                normalizeCapability(
                    capability
                );

            return capabilityMethods.has(
                normalizedCapability
            );
        }

        function getCapabilityMethod(
            capability
        ) {
            const normalizedCapability =
                normalizeCapability(
                    capability
                );

            return (
                capabilityMethods.get(
                    normalizedCapability
                ) ||
                null
            );
        }

        async function invokeCapability(
            capability,
            ...args
        ) {
            const normalizedCapability =
                normalizeCapability(
                    capability
                );

            const methodName =
                capabilityMethods.get(
                    normalizedCapability
                );

            if (!methodName) {
                throw new Error(
                    `Page helper "${id}" does not support "${normalizedCapability}".`
                );
            }

            return helper[
                methodName
            ](
                ...args
            );
        }

        const standardizedHelper =
            Object.freeze({
                ...helper,

                id,

                name:
                    typeof helper.name ===
                        "string"
                        ? helper.name
                        : id,

                pageId:
                    typeof helper.pageId ===
                        "string"
                        ? helper.pageId
                        : typeof options
                              .pageId ===
                              "string"
                            ? options.pageId
                            : null,

                routeId:
                    typeof helper.routeId ===
                        "string"
                        ? helper.routeId
                        : typeof options
                              .routeId ===
                              "string"
                            ? options.routeId
                            : null,

                capabilities,

                can,
                supports:
                    can,

                getCapabilityMethod,

                invokeCapability,
            });

        frameworkRecords.set(
            id,
            createFrameworkRecord(
                id,
                helper,
                standardizedHelper,
                capabilityMethods,
                options
            )
        );

        metrics.helpersStandardized +=
            1;

        metrics.lastHelperId =
            id;

        return standardizedHelper;
    }

    function registerHelper(
        helperId,
        helper,
        options = {}
    ) {
        metrics.helperRegistrationsObserved +=
            1;

        const standardizedHelper =
            standardizeHelper(
                helperId,
                helper,
                options
            );

        try {
            return originalRegisterHelper(
                helperId,
                standardizedHelper,
                options
            );
        } catch (error) {
            frameworkRecords.delete(
                normalizeHelperId(
                    helperId
                )
            );

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            throw error;
        }
    }

    function resolveHelper(
        helperOrId
    ) {
        if (
            typeof helperOrId ===
            "string"
        ) {
            return pages.getHelper(
                helperOrId
            );
        }

        if (
            helperOrId &&
            typeof helperOrId ===
                "object"
        ) {
            return helperOrId;
        }

        return null;
    }

    function can(
        helperOrId,
        capability
    ) {
        metrics.capabilityChecks +=
            1;

        const helper =
            resolveHelper(
                helperOrId
            );

        if (!helper) {
            metrics.capabilityMisses +=
                1;

            return false;
        }

        const normalizedCapability =
            normalizeCapability(
                capability
            );

        metrics.lastHelperId =
            helper.id ||
            null;

        metrics.lastCapability =
            normalizedCapability;

        const supported =
            typeof helper.can ===
                "function"
                ? helper.can(
                      normalizedCapability
                  )
                : Boolean(
                      DEFAULT_METHOD_BY_CAPABILITY[
                          normalizedCapability
                      ] &&
                      typeof helper[
                          DEFAULT_METHOD_BY_CAPABILITY[
                              normalizedCapability
                          ]
                      ] ===
                          "function"
                  );

        if (supported) {
            metrics.capabilityMatches +=
                1;
        } else {
            metrics.capabilityMisses +=
                1;
        }

        return supported;
    }

    function isHelperCurrent(
        helper,
        detectedPage,
        options = {}
    ) {
        if (
            typeof helper.isCurrent ===
            "function"
        ) {
            try {
                return (
                    helper.isCurrent({
                        page:
                            detectedPage,

                        route:
                            detectedPage.route,
                    }) ===
                    true
                );
            } catch {
                return false;
            }
        }

        if (
            helper.pageId &&
            detectedPage.id !==
                helper.pageId
        ) {
            return false;
        }

        if (
            options.requireReady ===
            false
        ) {
            return Boolean(
                helper.pageId
                    ? detectedPage.id ===
                          helper.pageId
                    : true
            );
        }

        if (
            typeof helper.isReady ===
            "function"
        ) {
            try {
                const readiness =
                    helper.isReady();

                return (
                    readiness ===
                        true ||
                    readiness?.ready ===
                        true
                );
            } catch {
                return false;
            }
        }

        return Boolean(
            helper.pageId &&
            detectedPage.id ===
                helper.pageId
        );
    }

    function current(
        options = {}
    ) {
        metrics.currentHelperChecks +=
            1;

        const detectedPage =
            pages.detect();

        const requiredCapability =
            typeof options
                .capability ===
                "string"
                ? normalizeCapability(
                      options.capability
                  )
                : null;

        const helperIds =
            pages.listHelpers();

        for (
            const helperId of
            helperIds
        ) {
            const helper =
                pages.getHelper(
                    helperId
                );

            if (!helper) {
                continue;
            }

            if (
                requiredCapability &&
                !can(
                    helper,
                    requiredCapability
                )
            ) {
                continue;
            }

            if (
                !isHelperCurrent(
                    helper,
                    detectedPage,
                    {
                        requireReady:
                            options
                                .requireReady !==
                            false,
                    }
                )
            ) {
                continue;
            }

            metrics.currentHelperMatches +=
                1;

            metrics.lastHelperId =
                helper.id ||
                helperId;

            return helper;
        }

        metrics.currentHelperMisses +=
            1;

        return null;
    }

    function findByCapability(
        capability,
        options = {}
    ) {
        const normalizedCapability =
            normalizeCapability(
                capability
            );

        if (
            options.current ===
            true
        ) {
            const helper =
                current({
                    capability:
                        normalizedCapability,

                    requireReady:
                        options
                            .requireReady !==
                        false,
                });

            return helper
                ? [
                      helper,
                  ]
                : [];
        }

        const helpers = [];

        for (
            const helperId of
            pages.listHelpers()
        ) {
            const helper =
                pages.getHelper(
                    helperId
                );

            if (
                helper &&
                can(
                    helper,
                    normalizedCapability
                )
            ) {
                helpers.push(
                    helper
                );
            }
        }

        return helpers;
    }

    async function invoke(
        helperOrId,
        capability,
        ...args
    ) {
        metrics.invocations +=
            1;

        metrics.lastInvocationAt =
            Date.now();

        const helper =
            resolveHelper(
                helperOrId
            );

        const normalizedCapability =
            normalizeCapability(
                capability
            );

        metrics.lastCapability =
            normalizedCapability;

        if (!helper) {
            metrics.failedInvocations +=
                1;

            const error =
                new Error(
                    "The requested page helper is unavailable."
                );

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            throw error;
        }

        metrics.lastHelperId =
            helper.id ||
            null;

        try {
            let result;

            if (
                typeof helper
                    .invokeCapability ===
                "function"
            ) {
                result =
                    await helper
                        .invokeCapability(
                            normalizedCapability,
                            ...args
                        );
            } else {
                const methodName =
                    DEFAULT_METHOD_BY_CAPABILITY[
                        normalizedCapability
                    ];

                if (
                    !methodName ||
                    typeof helper[
                        methodName
                    ] !==
                        "function"
                ) {
                    throw new Error(
                        `Page helper "${helper.id || "unknown"}" does not support "${normalizedCapability}".`
                    );
                }

                result =
                    await helper[
                        methodName
                    ](
                        ...args
                    );
            }

            metrics.successfulInvocations +=
                1;

            metrics.lastError =
                null;

            return result;
        } catch (error) {
            metrics.failedInvocations +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            throw error;
        }
    }

    function describeHelper(
        helperOrId
    ) {
        const helper =
            resolveHelper(
                helperOrId
            );

        if (!helper) {
            return null;
        }

        const id =
            normalizeHelperId(
                helper.id
            );

        const record =
            frameworkRecords.get(
                id
            );

        return {
            id,

            name:
                helper.name ||
                id,

            pageId:
                helper.pageId ||
                null,

            routeId:
                helper.routeId ||
                null,

            current:
                isHelperCurrent(
                    helper,
                    pages.detect(),
                    {
                        requireReady:
                            false,
                    }
                ),

            ready:
                isHelperCurrent(
                    helper,
                    pages.detect(),
                    {
                        requireReady:
                            true,
                    }
                ),

            capabilities:
                record
                    ? Object.fromEntries(
                          [
                              ...record
                                  .capabilityMethods
                                  .entries(),
                          ].sort(
                              (
                                  first,
                                  second
                              ) =>
                                  first[0]
                                      .localeCompare(
                                          second[0]
                                      )
                          )
                      )
                    : {},

            capabilityCount:
                record
                    ?.capabilityCount ||
                0,

            registeredAt:
                record
                    ?.registeredAt ||
                null,
        };
    }

    function inspectFramework() {
        return {
            service:
                "dom-page-framework",

            loadedAt:
                metrics.loadedAt,

            uptimeMs:
                Date.now() -
                metrics.loadedAt,

            dependencySource:
                "TACTIC.use",

            capabilityDefinitions: {
                ...CAPABILITIES,
            },

            methodMappings: {
                ...DEFAULT_METHOD_BY_CAPABILITY,
            },

            helperCount:
                frameworkRecords.size,

            helpers:
                pages
                    .listHelpers()
                    .map(
                        describeHelper
                    )
                    .filter(
                        Boolean
                    ),

            currentHelper:
                (() => {
                    const helper =
                        current({
                            requireReady:
                                true,
                        });

                    return helper
                        ? describeHelper(
                              helper
                          )
                        : null;
                })(),

            metrics: {
                ...metrics,

                lastError:
                    metrics.lastError
                        ? {
                              ...metrics
                                  .lastError,
                          }
                        : null,
            },
        };
    }

    /*
     * Override registration only after all framework functions
     * have been created. Existing helper files continue calling
     * dom.pages.registerHelper() exactly as before.
     */
    pages.registerHelper =
        registerHelper;

    pages.capabilities =
        CAPABILITIES;

    pages.capabilityMethods =
        DEFAULT_METHOD_BY_CAPABILITY;

    pages.can =
        can;

    pages.current =
        current;

    pages.describeHelper =
        describeHelper;

    pages.findByCapability =
        findByCapability;

    pages.invoke =
        invoke;

    pages.inspectFramework =
        inspectFramework;

    logger?.info(
        "DOM page-helper framework loaded",
        {
            dependencySource:
                "TACTIC.use",

            capabilityCount:
                Object.keys(
                    CAPABILITIES
                ).length,
        }
    );
})();