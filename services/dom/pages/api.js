/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * services/dom/pages/api.js
 *
 * Purpose:
 * Provides a high-level application API over registered DOM
 * page helpers.
 *
 * Responsibilities:
 * - Resolve the current compatible page helper
 * - Create stable page façade objects
 * - Expose logical operation namespaces
 * - Invoke helper capabilities without exposing method names
 * - Preserve the page-helper safety boundary
 * - Expose Page API diagnostics
 *
 * Does NOT:
 * - Define Torn selectors
 * - Detect pages independently
 * - Register page-specific helpers
 * - Navigate between pages
 * - Submit forms
 * - Confirm transactions
 *
 * Public API:
 * - TACTIC.page
 * - TACTIC.page.current()
 * - TACTIC.page.get()
 * - TACTIC.page.require()
 * - TACTIC.page.inspect()
 * - TACTIC.services.pageApi
 * - TACTIC.services.dom.currentPage()
 *
 * Dependencies:
 * - core/dependencies.js
 * - services/dom/index.js
 * - services/dom/pages/index.js
 * - services/dom/pages/framework.js
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Page API] Namespace is unavailable."
        );

        return;
    }

    if (
        typeof TACTIC.use !==
        "function"
    ) {
        console.error(
            "[TACTIC Page API] Dependency Registry is unavailable."
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
            "[TACTIC Page API] Required dependencies are unavailable.",
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
        typeof dom.pages.current !==
            "function" ||
        typeof dom.pages.getHelper !==
            "function" ||
        typeof dom.pages.can !==
            "function" ||
        typeof dom.pages.invoke !==
            "function"
    ) {
        console.error(
            "[TACTIC Page API] Page-helper framework is unavailable."
        );

        return;
    }

    const pages =
        dom.pages;

    const CAPABILITIES =
        pages.capabilities;

    const façadeCache =
        new WeakMap();

    const metrics = {
        loadedAt:
            Date.now(),

        currentRequests:
            0,

        helperRequests:
            0,

        façadeCreations:
            0,

        façadeCacheHits:
            0,

        requirementChecks:
            0,

        requirementFailures:
            0,

        invocations:
            0,

        invocationFailures:
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
                "Page helper ID must be a non-empty string."
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
                "Page capability must be a non-empty string."
            );
        }

        return value
            .trim()
            .toLowerCase();
    }

    function resolveHelper(
        helperOrId
    ) {
        if (
            typeof helperOrId ===
                "string"
        ) {
            return pages.getHelper(
                normalizeHelperId(
                    helperOrId
                )
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

    function supports(
        helper,
        capability
    ) {
        if (!helper) {
            return false;
        }

        return pages.can(
            helper,
            normalizeCapability(
                capability
            )
        );
    }

    async function invoke(
        helper,
        capability,
        ...args
    ) {
        const normalizedCapability =
            normalizeCapability(
                capability
            );

        metrics.invocations +=
            1;

        metrics.lastInvocationAt =
            Date.now();

        metrics.lastHelperId =
            helper?.id ||
            null;

        metrics.lastCapability =
            normalizedCapability;

        try {
            const result =
                await pages.invoke(
                    helper,
                    normalizedCapability,
                    ...args
                );

            metrics.lastError =
                null;

            return result;
        } catch (error) {
            metrics.invocationFailures +=
                1;

            metrics.lastError =
                createErrorSnapshot(
                    error
                );

            throw error;
        }
    }

    function requireCapability(
        helper,
        capability
    ) {
        metrics.requirementChecks +=
            1;

        const normalizedCapability =
            normalizeCapability(
                capability
            );

        if (
            !supports(
                helper,
                normalizedCapability
            )
        ) {
            metrics.requirementFailures +=
                1;

            throw new Error(
                `Page "${helper?.id || "unknown"}" does not support "${normalizedCapability}".`
            );
        }

        return true;
    }

    function createReadinessApi(
        helper
    ) {
        return Object.freeze({
            supported:
                supports(
                    helper,
                    CAPABILITIES.READY
                ),

            waitSupported:
                supports(
                    helper,
                    CAPABILITIES
                        .WAIT_UNTIL_READY
                ),

            async check() {
                requireCapability(
                    helper,
                    CAPABILITIES.READY
                );

                return invoke(
                    helper,
                    CAPABILITIES.READY
                );
            },

            async wait(
                options = {}
            ) {
                requireCapability(
                    helper,
                    CAPABILITIES
                        .WAIT_UNTIL_READY
                );

                return invoke(
                    helper,
                    CAPABILITIES
                        .WAIT_UNTIL_READY,
                    options
                );
            },
        });
    }

    function createAmountApi(
        helper
    ) {
        return Object.freeze({
            readSupported:
                supports(
                    helper,
                    CAPABILITIES
                        .AMOUNT_READ
                ),

            setSupported:
                supports(
                    helper,
                    CAPABILITIES
                        .AMOUNT_SET
                ),

            maximumSupported:
                supports(
                    helper,
                    CAPABILITIES
                        .AMOUNT_MAXIMUM
                ),

            async read() {
                requireCapability(
                    helper,
                    CAPABILITIES
                        .AMOUNT_READ
                );

                return invoke(
                    helper,
                    CAPABILITIES
                        .AMOUNT_READ
                );
            },

            async set(
                amount
            ) {
                requireCapability(
                    helper,
                    CAPABILITIES
                        .AMOUNT_SET
                );

                return invoke(
                    helper,
                    CAPABILITIES
                        .AMOUNT_SET,
                    amount
                );
            },

            async maximum() {
                requireCapability(
                    helper,
                    CAPABILITIES
                        .AMOUNT_MAXIMUM
                );

                return invoke(
                    helper,
                    CAPABILITIES
                        .AMOUNT_MAXIMUM
                );
            },
        });
    }

    function createSubmitApi(
        helper
    ) {
        return Object.freeze({
            locateSupported:
                supports(
                    helper,
                    CAPABILITIES
                        .SUBMIT_LOCATE
                ),

            highlightSupported:
                supports(
                    helper,
                    CAPABILITIES
                        .SUBMIT_HIGHLIGHT
                ),

            submissionSupported:
                supports(
                    helper,
                    CAPABILITIES
                        .DEPOSIT_SUBMIT
                ),

            async locate() {
                requireCapability(
                    helper,
                    CAPABILITIES
                        .SUBMIT_LOCATE
                );

                return invoke(
                    helper,
                    CAPABILITIES
                        .SUBMIT_LOCATE
                );
            },

            async highlight(
                options = {}
            ) {
                requireCapability(
                    helper,
                    CAPABILITIES
                        .SUBMIT_HIGHLIGHT
                );

                return invoke(
                    helper,
                    CAPABILITIES
                        .SUBMIT_HIGHLIGHT,
                    options
                );
            },

            async execute(
                ...args
            ) {
                requireCapability(
                    helper,
                    CAPABILITIES
                        .DEPOSIT_SUBMIT
                );

                return invoke(
                    helper,
                    CAPABILITIES
                        .DEPOSIT_SUBMIT,
                    ...args
                );
            },
        });
    }

    function createDepositApi(
        helper
    ) {
        return Object.freeze({
            prepareSupported:
                supports(
                    helper,
                    CAPABILITIES
                        .DEPOSIT_PREPARE
                ),

            submitSupported:
                supports(
                    helper,
                    CAPABILITIES
                        .DEPOSIT_SUBMIT
                ),

            confirmationSupported:
                supports(
                    helper,
                    CAPABILITIES
                        .TRANSACTION_CONFIRM
                ),

            async prepare(
                amount,
                options = {}
            ) {
                requireCapability(
                    helper,
                    CAPABILITIES
                        .DEPOSIT_PREPARE
                );

                return invoke(
                    helper,
                    CAPABILITIES
                        .DEPOSIT_PREPARE,
                    amount,
                    options
                );
            },

            async submit(
                ...args
            ) {
                requireCapability(
                    helper,
                    CAPABILITIES
                        .DEPOSIT_SUBMIT
                );

                return invoke(
                    helper,
                    CAPABILITIES
                        .DEPOSIT_SUBMIT,
                    ...args
                );
            },

            async confirm(
                ...args
            ) {
                requireCapability(
                    helper,
                    CAPABILITIES
                        .TRANSACTION_CONFIRM
                );

                return invoke(
                    helper,
                    CAPABILITIES
                        .TRANSACTION_CONFIRM,
                    ...args
                );
            },
        });
    }

    function createPageFacade(
        helper
    ) {
        if (!helper) {
            return null;
        }

        if (
            façadeCache.has(
                helper
            )
        ) {
            metrics.façadeCacheHits +=
                1;

            return façadeCache.get(
                helper
            );
        }

        metrics.façadeCreations +=
            1;

        const descriptor =
            pages.describeHelper(
                helper
            );

        const façade =
            Object.freeze({
                id:
                    helper.id,

                name:
                    helper.name ||
                    helper.id,

                description:
                    helper.description ||
                    null,

                pageId:
                    helper.pageId ||
                    null,

                routeId:
                    helper.routeId ||
                    null,

                metadata:
                    helper.metadata
                        ? Object.freeze({
                              ...helper
                                  .metadata,
                          })
                        : Object.freeze(
                              {}
                          ),

                capabilityDefinitions:
                    helper.capabilities ||
                    Object.freeze(
                        {}
                    ),

                readiness:
                    createReadinessApi(
                        helper
                    ),

                amount:
                    createAmountApi(
                        helper
                    ),

                submit:
                    createSubmitApi(
                        helper
                    ),

                deposit:
                    createDepositApi(
                        helper
                    ),

                supports(
                    capability
                ) {
                    return supports(
                        helper,
                        capability
                    );
                },

                async invoke(
                    capability,
                    ...args
                ) {
                    requireCapability(
                        helper,
                        capability
                    );

                    return invoke(
                        helper,
                        capability,
                        ...args
                    );
                },

                async inspect() {
                    if (
                        supports(
                            helper,
                            CAPABILITIES
                                .INSPECT
                        )
                    ) {
                        return invoke(
                            helper,
                            CAPABILITIES
                                .INSPECT
                        );
                    }

                    return descriptor;
                },

                describe() {
                    return pages
                        .describeHelper(
                            helper
                        );
                },
            });

        façadeCache.set(
            helper,
            façade
        );

        return façade;
    }

    function get(
        helperId
    ) {
        metrics.helperRequests +=
            1;

        const helper =
            resolveHelper(
                helperId
            );

        metrics.lastHelperId =
            helper?.id ||
            null;

        return createPageFacade(
            helper
        );
    }

    function current(
        options = {}
    ) {
        metrics.currentRequests +=
            1;

        const helper =
            pages.current({
                capability:
                    options.capability,

                requireReady:
                    options.requireReady !==
                    false,
            });

        metrics.lastHelperId =
            helper?.id ||
            null;

        return createPageFacade(
            helper
        );
    }

    function requirePage(
        options = {}
    ) {
        const page =
            typeof options ===
                "string"
                ? get(
                      options
                  )
                : current(
                      options
                  );

        if (!page) {
            throw new Error(
                typeof options ===
                    "string"
                    ? `Page helper "${options}" is unavailable.`
                    : "No compatible current page helper is available."
            );
        }

        return page;
    }

    function list() {
        return pages
            .listHelpers()
            .map(
                get
            )
            .filter(
                Boolean
            );
    }

    function inspect() {
        const activePage =
            current({
                requireReady:
                    false,
            });

        return {
            service:
                "page-api",

            dependencySource:
                "TACTIC.use",

            loadedAt:
                metrics.loadedAt,

            uptimeMs:
                Date.now() -
                metrics.loadedAt,

            frameworkAvailable:
                true,

            helperCount:
                pages
                    .listHelpers()
                    .length,

            helpers:
                pages
                    .listHelpers(),

            currentPage:
                activePage
                    ? activePage
                          .describe()
                    : null,

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

    const pageApi =
        Object.freeze({
            current,
            get,
            require:
                requirePage,
            list,
            inspect,

            capabilities:
                CAPABILITIES,
        });

    TACTIC.services.pageApi =
        pageApi;

    try {
        Object.defineProperty(
            TACTIC,
            "page",
            {
                configurable:
                    true,

                enumerable:
                    true,

                writable:
                    false,

                value:
                    pageApi,
            }
        );
    } catch (error) {
        logger?.warn(
            "Page API could not be exposed at TACTIC.page",
            {
                error,
            }
        );
    }

    /*
     * Convenience alias beneath the existing DOM service.
     */
    dom.currentPage =
        current;

    logger?.info(
        "Page API loaded",
        {
            dependencySource:
                "TACTIC.use",

            helperCount:
                pages
                    .listHelpers()
                    .length,

            publicApi:
                "TACTIC.page",
        }
    );
})();