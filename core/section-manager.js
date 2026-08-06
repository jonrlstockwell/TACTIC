/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * core/section-manager.js
 *
 * Purpose:
 * Provides reusable section registries for TACTIC applications.
 *
 * Example:
 *
 * const financeSections =
 *     TACTIC.createSectionManager("finance");
 *
 * financeSections.register({
 *     id: "wallet",
 *     name: "Wallet",
 *     order: 100,
 *     render(container) {}
 * });
 *
 * Responsibilities:
 * - Create isolated section registries by application
 * - Validate and normalize section definitions
 * - Register and unregister sections
 * - Enable and disable sections
 * - Sort sections by order and name
 * - Render all enabled sections
 * - Track rendering state and errors
 * - Emit section lifecycle events
 * - Expose diagnostics through inspect()
 *
 * Does NOT:
 * - Register drawer modules
 * - Own application data
 * - Scrape Torn
 * - Contain application-specific business logic
 *
 * Public API:
 * - TACTIC.createSectionManager()
 * - TACTIC.getSectionManager()
 * - TACTIC.hasSectionManager()
 * - TACTIC.getSectionManagers()
 * - TACTIC.services.sectionManager
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC =
        globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Section Manager] Namespace is unavailable."
        );

        return;
    }

    const logger =
        TACTIC.services.logger;

    const events =
        TACTIC.services.events;

    const health =
        TACTIC.services.health;

    const VALID_ID_PATTERN =
        /^[a-z][a-z0-9-]*$/;

    const managers =
        new Map();

    const SERVICE_NAME =
        "service:sectionManager";

    const EVENT_NAMES =
        Object.freeze({
            MANAGER_CREATED:
                "section-manager:created",

            MANAGER_REMOVED:
                "section-manager:removed",

            SECTION_REGISTERED:
                "section:registered",

            SECTION_UNREGISTERED:
                "section:unregistered",

            SECTION_CHANGED:
                "section:changed",

            SECTION_RENDER_STARTED:
                "section:render-started",

            SECTION_RENDERED:
                "section:rendered",

            SECTION_RENDER_FAILED:
                "section:render-failed",

            RENDER_STARTED:
                "sections:render-started",

            RENDER_COMPLETED:
                "sections:render-completed",
        });

    const metrics = {
        loadedAt:
            Date.now(),

        managersCreated:
            0,

        managersRemoved:
            0,

        sectionsRegistered:
            0,

        sectionsUnregistered:
            0,

        renderPasses:
            0,

        sectionRenderAttempts:
            0,

        sectionRendersCompleted:
            0,

        sectionRenderFailures:
            0,

        lastActivityAt:
            Date.now(),

        lastManagerCreatedAt:
            null,

        lastManagerRemovedAt:
            null,

        lastSectionRegisteredAt:
            null,

        lastSectionRenderedAt:
            null,

        lastRenderCompletedAt:
            null,

        lastError:
            null,
    };

    function cloneValue(
        value
    ) {
        if (
            value === null ||
            value === undefined
        ) {
            return value;
        }

        if (
            typeof structuredClone ===
            "function"
        ) {
            try {
                return structuredClone(
                    value
                );
            } catch {
                // Fall through.
            }
        }

        if (
            typeof value ===
                "object"
        ) {
            try {
                return JSON.parse(
                    JSON.stringify(
                        value
                    )
                );
            } catch {
                return {
                    ...value,
                };
            }
        }

        return value;
    }

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

            stack:
                error?.stack ||
                null,

            timestamp:
                Date.now(),
        };
    }

    function recordActivity(
        operation,
        metadata = {}
    ) {
        metrics.lastActivityAt =
            Date.now();

        health?.heartbeat(
            SERVICE_NAME,
            {
                metadata: {
                    lastOperation:
                        operation,

                    managerCount:
                        managers.size,

                    sectionCount:
                        getTotalSectionCount(),

                    ...metadata,
                },
            }
        );
    }

    function normalizeId(
        value,
        label
    ) {
        const id =
            String(
                value ||
                ""
            )
                .trim()
                .toLowerCase();

        if (
            !VALID_ID_PATTERN.test(
                id
            )
        ) {
            throw new Error(
                `Invalid ${label} id: ${String(value)}`
            );
        }

        return id;
    }

    function normalizeManagerId(
        value
    ) {
        return normalizeId(
            value,
            "section manager"
        );
    }

    function normalizeSectionId(
        value
    ) {
        return normalizeId(
            value,
            "section"
        );
    }

    function validateSectionDefinition(
        definition
    ) {
        if (
            !definition ||
            typeof definition !==
                "object" ||
            Array.isArray(
                definition
            )
        ) {
            throw new TypeError(
                "Section definition must be an object."
            );
        }

        const {
            id,
            name,
            icon,
            order,
            enabled,
            render,
            destroy,
            metadata,
        } = definition;

        normalizeSectionId(
            id
        );

        if (
            typeof name !==
                "string" ||
            !name.trim()
        ) {
            throw new Error(
                `Section "${String(id)}" requires a name.`
            );
        }

        if (
            icon !== undefined &&
            typeof icon !==
                "string"
        ) {
            throw new Error(
                `Section "${id}" icon must be a string.`
            );
        }

        if (
            order !== undefined &&
            !Number.isFinite(
                order
            )
        ) {
            throw new Error(
                `Section "${id}" order must be numeric.`
            );
        }

        if (
            enabled !== undefined &&
            typeof enabled !==
                "boolean"
        ) {
            throw new Error(
                `Section "${id}" enabled must be boolean.`
            );
        }

        if (
            typeof render !==
            "function"
        ) {
            throw new Error(
                `Section "${id}" requires a render function.`
            );
        }

        if (
            destroy !== undefined &&
            typeof destroy !==
                "function"
        ) {
            throw new Error(
                `Section "${id}" destroy must be a function.`
            );
        }

        if (
            metadata !== undefined &&
            (
                !metadata ||
                typeof metadata !==
                    "object" ||
                Array.isArray(
                    metadata
                )
            )
        ) {
            throw new Error(
                `Section "${id}" metadata must be an object.`
            );
        }
    }

    function normalizeSectionDefinition(
        definition
    ) {
        return {
            id:
                normalizeSectionId(
                    definition.id
                ),

            name:
                definition.name.trim(),

            icon:
                definition.icon ||
                "",

            order:
                Number.isFinite(
                    definition.order
                )
                    ? definition.order
                    : 100,

            enabled:
                definition.enabled !==
                false,

            render:
                definition.render,

            destroy:
                definition.destroy ||
                (() => {}),

            metadata: {
                ...(
                    definition.metadata ||
                    {}
                ),
            },

            registeredAt:
                Date.now(),

            updatedAt:
                Date.now(),

            renderCount:
                0,

            rendering:
                false,

            lastRenderStartedAt:
                null,

            lastRenderedAt:
                null,

            lastRenderDurationMs:
                null,

            lastError:
                null,
        };
    }

    function createSectionSnapshot(
        section
    ) {
        if (!section) {
            return null;
        }

        return {
            id:
                section.id,

            name:
                section.name,

            icon:
                section.icon,

            order:
                section.order,

            enabled:
                section.enabled,

            registeredAt:
                section.registeredAt,

            updatedAt:
                section.updatedAt,

            renderCount:
                section.renderCount,

            rendering:
                section.rendering,

            lastRenderStartedAt:
                section.lastRenderStartedAt,

            lastRenderedAt:
                section.lastRenderedAt,

            lastRenderDurationMs:
                section.lastRenderDurationMs,

            lastError:
                section.lastError
                    ? {
                          ...section
                              .lastError,
                      }
                    : null,

            metadata: {
                ...section.metadata,
            },
        };
    }

    function getTotalSectionCount() {
        let count =
            0;

        for (
            const manager of
            managers.values()
        ) {
            count +=
                manager.getAll().length;
        }

        return count;
    }

    function createSectionManager(
        applicationId,
        options = {}
    ) {
        const managerId =
            normalizeManagerId(
                applicationId
            );

        if (
            managers.has(
                managerId
            )
        ) {
            if (
                options.returnExisting ===
                true
            ) {
                return managers.get(
                    managerId
                );
            }

            throw new Error(
                `Section Manager "${managerId}" already exists.`
            );
        }

        const sections =
            new Map();

        const managerMetrics = {
            createdAt:
                Date.now(),

            registrations:
                0,

            unregistrations:
                0,

            enableChanges:
                0,

            renderPasses:
                0,

            sectionRenderAttempts:
                0,

            sectionRendersCompleted:
                0,

            sectionRenderFailures:
                0,

            lastActivityAt:
                Date.now(),

            lastRenderStartedAt:
                null,

            lastRenderCompletedAt:
                null,

            lastRenderDurationMs:
                null,

            lastError:
                null,
        };

        let rendering =
            false;

        function touch(
            operation
        ) {
            managerMetrics.lastActivityAt =
                Date.now();

            recordActivity(
                operation,
                {
                    managerId,

                    managerSectionCount:
                        sections.size,
                }
            );
        }

        function register(
            definition
        ) {
            validateSectionDefinition(
                definition
            );

            const section =
                normalizeSectionDefinition(
                    definition
                );

            if (
                sections.has(
                    section.id
                )
            ) {
                throw new Error(
                    `Section "${section.id}" is already registered with "${managerId}".`
                );
            }

            sections.set(
                section.id,
                section
            );

            managerMetrics.registrations +=
                1;

            metrics.sectionsRegistered +=
                1;

            metrics.lastSectionRegisteredAt =
                Date.now();

            touch(
                "section-registered"
            );

            logger?.info(
                `Section registered: ${managerId}.${section.id}`,
                {
                    applicationId:
                        managerId,

                    sectionId:
                        section.id,

                    name:
                        section.name,

                    order:
                        section.order,
                }
            );

            events?.emit(
                EVENT_NAMES
                    .SECTION_REGISTERED,
                {
                    applicationId:
                        managerId,

                    section:
                        createSectionSnapshot(
                            section
                        ),

                    timestamp:
                        Date.now(),
                }
            );

            return createSectionSnapshot(
                section
            );
        }

        function unregister(
            sectionId
        ) {
            const normalizedId =
                normalizeSectionId(
                    sectionId
                );

            const section =
                sections.get(
                    normalizedId
                );

            if (!section) {
                return false;
            }

            try {
                section.destroy({
                    TACTIC,

                    applicationId:
                        managerId,

                    section:
                        createSectionSnapshot(
                            section
                        ),
                });
            } catch (error) {
                logger?.error(
                    `Section destroy failed: ${managerId}.${normalizedId}`,
                    {
                        message:
                            error?.message ||
                            String(error),
                    }
                );
            }

            sections.delete(
                normalizedId
            );

            managerMetrics.unregistrations +=
                1;

            metrics.sectionsUnregistered +=
                1;

            touch(
                "section-unregistered"
            );

            events?.emit(
                EVENT_NAMES
                    .SECTION_UNREGISTERED,
                {
                    applicationId:
                        managerId,

                    sectionId:
                        normalizedId,

                    timestamp:
                        Date.now(),
                }
            );

            logger?.info(
                `Section unregistered: ${managerId}.${normalizedId}`
            );

            return true;
        }

        function has(
            sectionId
        ) {
            try {
                return sections.has(
                    normalizeSectionId(
                        sectionId
                    )
                );
            } catch {
                return false;
            }
        }

        function get(
            sectionId
        ) {
            const section =
                sections.get(
                    normalizeSectionId(
                        sectionId
                    )
                );

            return createSectionSnapshot(
                section
            );
        }

        function getInternal(
            sectionId
        ) {
            return (
                sections.get(
                    normalizeSectionId(
                        sectionId
                    )
                ) ||
                null
            );
        }

        function getAll(
            listOptions = {}
        ) {
            const includeDisabled =
                listOptions
                    .includeDisabled !==
                false;

            return [
                ...sections.values(),
            ]
                .filter(
                    section =>
                        includeDisabled ||
                        section.enabled
                )
                .sort(
                    (
                        first,
                        second
                    ) =>
                        first.order -
                            second.order ||
                        first.name.localeCompare(
                            second.name
                        )
                )
                .map(
                    createSectionSnapshot
                );
        }

        function setEnabled(
            sectionId,
            enabled
        ) {
            const section =
                getInternal(
                    sectionId
                );

            if (!section) {
                return {
                    success:
                        false,

                    changed:
                        false,

                    reason:
                        "section-not-found",
                };
            }

            const normalized =
                Boolean(
                    enabled
                );

            const previousEnabled =
                section.enabled;

            if (
                previousEnabled ===
                normalized
            ) {
                return {
                    success:
                        true,

                    changed:
                        false,

                    section:
                        createSectionSnapshot(
                            section
                        ),
                };
            }

            section.enabled =
                normalized;

            section.updatedAt =
                Date.now();

            managerMetrics.enableChanges +=
                1;

            touch(
                "section-enabled-changed"
            );

            const snapshot =
                createSectionSnapshot(
                    section
                );

            events?.emit(
                EVENT_NAMES
                    .SECTION_CHANGED,
                {
                    applicationId:
                        managerId,

                    section:
                        snapshot,

                    previousEnabled,

                    enabled:
                        normalized,

                    timestamp:
                        Date.now(),
                }
            );

            logger?.info(
                `Section ${normalized ? "enabled" : "disabled"}: ${managerId}.${section.id}`
            );

            return {
                success:
                    true,

                changed:
                    true,

                previousEnabled,

                enabled:
                    normalized,

                section:
                    snapshot,
            };
        }

        function enable(
            sectionId
        ) {
            return setEnabled(
                sectionId,
                true
            );
        }

        function disable(
            sectionId
        ) {
            return setEnabled(
                sectionId,
                false
            );
        }

        async function renderSection(
            sectionId,
            container,
            context = {}
        ) {
            const section =
                getInternal(
                    sectionId
                );

            if (!section) {
                return {
                    success:
                        false,

                    rendered:
                        false,

                    reason:
                        "section-not-found",

                    sectionId:
                        String(
                            sectionId
                        ),
                };
            }

            if (!section.enabled) {
                return {
                    success:
                        true,

                    rendered:
                        false,

                    reason:
                        "section-disabled",

                    section:
                        createSectionSnapshot(
                            section
                        ),
                };
            }

            if (
                !(container instanceof
                    Element)
            ) {
                throw new TypeError(
                    `Section "${managerId}.${section.id}" requires a valid container element.`
                );
            }

            section.rendering =
                true;

            section.lastRenderStartedAt =
                Date.now();

            section.lastError =
                null;

            managerMetrics
                .sectionRenderAttempts +=
                1;

            metrics.sectionRenderAttempts +=
                1;

            events?.emit(
                EVENT_NAMES
                    .SECTION_RENDER_STARTED,
                {
                    applicationId:
                        managerId,

                    section:
                        createSectionSnapshot(
                            section
                        ),

                    timestamp:
                        Date.now(),
                }
            );

            try {
                await section.render(
                    container,
                    {
                        TACTIC,

                        applicationId:
                            managerId,

                        section:
                            createSectionSnapshot(
                                section
                            ),

                        manager:
                            api,

                        ...context,
                    }
                );

                section.renderCount +=
                    1;

                section.lastRenderedAt =
                    Date.now();

                section.lastRenderDurationMs =
                    section.lastRenderedAt -
                    section.lastRenderStartedAt;

                managerMetrics
                    .sectionRendersCompleted +=
                    1;

                metrics
                    .sectionRendersCompleted +=
                    1;

                metrics.lastSectionRenderedAt =
                    section.lastRenderedAt;

                touch(
                    "section-rendered"
                );

                const result = {
                    success:
                        true,

                    rendered:
                        true,

                    section:
                        createSectionSnapshot(
                            section
                        ),
                };

                events?.emit(
                    EVENT_NAMES
                        .SECTION_RENDERED,
                    {
                        applicationId:
                            managerId,

                        ...result,

                        timestamp:
                            Date.now(),
                    }
                );

                return result;
            } catch (error) {
                const errorSnapshot =
                    createErrorSnapshot(
                        error
                    );

                section.lastError =
                    errorSnapshot;

                section.lastRenderDurationMs =
                    Date.now() -
                    section.lastRenderStartedAt;

                managerMetrics
                    .sectionRenderFailures +=
                    1;

                managerMetrics.lastError =
                    errorSnapshot;

                metrics.sectionRenderFailures +=
                    1;

                metrics.lastError =
                    errorSnapshot;

                logger?.error(
                    `Section render failed: ${managerId}.${section.id}`,
                    {
                        message:
                            errorSnapshot
                                .message,

                        stack:
                            errorSnapshot
                                .stack,
                    }
                );

                const result = {
                    success:
                        false,

                    rendered:
                        false,

                    reason:
                        "section-render-failed",

                    section:
                        createSectionSnapshot(
                            section
                        ),

                    error:
                        errorSnapshot,
                };

                events?.emit(
                    EVENT_NAMES
                        .SECTION_RENDER_FAILED,
                    {
                        applicationId:
                            managerId,

                        ...result,

                        timestamp:
                            Date.now(),
                    }
                );

                return result;
            } finally {
                section.rendering =
                    false;
            }
        }

        async function renderAll(
            container,
            renderOptions = {}
        ) {
            if (
                !(container instanceof
                    Element)
            ) {
                throw new TypeError(
                    `Section Manager "${managerId}" requires a valid container element.`
                );
            }

            if (rendering) {
                return {
                    success:
                        false,

                    rendered:
                        false,

                    reason:
                        "render-already-running",

                    applicationId:
                        managerId,
                };
            }

            rendering =
                true;

            metrics.renderPasses +=
                1;

            managerMetrics.renderPasses +=
                1;

            managerMetrics.lastRenderStartedAt =
                Date.now();

            const clearContainer =
                renderOptions.clear !==
                false;

            if (clearContainer) {
                container.replaceChildren();
            }

            const enabledSections =
                [
                    ...sections.values(),
                ]
                    .filter(
                        section =>
                            section.enabled
                    )
                    .sort(
                        (
                            first,
                            second
                        ) =>
                            first.order -
                                second.order ||
                            first.name.localeCompare(
                                second.name
                            )
                    );

            events?.emit(
                EVENT_NAMES
                    .RENDER_STARTED,
                {
                    applicationId:
                        managerId,

                    sectionCount:
                        enabledSections
                            .length,

                    timestamp:
                        Date.now(),
                }
            );

            const results =
                [];

            try {
                for (
                    const section of
                    enabledSections
                ) {
                    const sectionContainer =
                        document.createElement(
                            renderOptions
                                .sectionTagName ||
                            "section"
                        );

                    sectionContainer.dataset
                        .tacticApplication =
                        managerId;

                    sectionContainer.dataset
                        .tacticSection =
                        section.id;

                    sectionContainer.className =
                        [
                            "tactic-application-section",
                            `tactic-${managerId}-section`,
                            `tactic-${managerId}-section-${section.id}`,
                        ].join(
                            " "
                        );

                    container.appendChild(
                        sectionContainer
                    );

                    const result =
                        await renderSection(
                            section.id,
                            sectionContainer,
                            {
                                rootContainer:
                                    container,

                                renderOptions,

                                context:
                                    renderOptions
                                        .context ||
                                    {},
                            }
                        );

                    results.push(
                        result
                    );

                    if (
                        result.success !==
                            true &&
                        renderOptions
                            .removeFailed !==
                            false
                    ) {
                        sectionContainer
                            .remove();
                    }
                }

                managerMetrics.lastRenderCompletedAt =
                    Date.now();

                managerMetrics.lastRenderDurationMs =
                    managerMetrics
                        .lastRenderCompletedAt -
                    managerMetrics
                        .lastRenderStartedAt;

                metrics.lastRenderCompletedAt =
                    managerMetrics
                        .lastRenderCompletedAt;

                touch(
                    "sections-rendered"
                );

                const completed = {
                    success:
                        results.every(
                            result =>
                                result.success ===
                                true
                        ),

                    rendered:
                        true,

                    applicationId:
                        managerId,

                    sectionCount:
                        enabledSections
                            .length,

                    successCount:
                        results.filter(
                            result =>
                                result.success ===
                                true
                        ).length,

                    failureCount:
                        results.filter(
                            result =>
                                result.success !==
                                true
                        ).length,

                    durationMs:
                        managerMetrics
                            .lastRenderDurationMs,

                    results,
                };

                events?.emit(
                    EVENT_NAMES
                        .RENDER_COMPLETED,
                    {
                        ...completed,

                        timestamp:
                            Date.now(),
                    }
                );

                return completed;
            } finally {
                rendering =
                    false;
            }
        }

        function inspect() {
            const allSections =
                getAll({
                    includeDisabled:
                        true,
                });

            return {
                applicationId:
                    managerId,

                rendering,

                sectionCount:
                    allSections.length,

                enabledSectionCount:
                    allSections.filter(
                        section =>
                            section.enabled
                    ).length,

                disabledSectionCount:
                    allSections.filter(
                        section =>
                            !section.enabled
                    ).length,

                failedSectionCount:
                    allSections.filter(
                        section =>
                            Boolean(
                                section
                                    .lastError
                            )
                    ).length,

                sections:
                    allSections,

                metrics: {
                    ...managerMetrics,

                    lastError:
                        managerMetrics
                            .lastError
                            ? {
                                  ...managerMetrics
                                      .lastError,
                              }
                            : null,
                },
            };
        }

        function destroy() {
            for (
                const sectionId of
                [
                    ...sections.keys(),
                ]
            ) {
                unregister(
                    sectionId
                );
            }

            return removeSectionManager(
                managerId
            );
        }

        const api =
            Object.freeze({
                id:
                    managerId,

                register,
                unregister,

                has,
                get,
                getAll,

                setEnabled,
                enable,
                disable,

                renderSection,
                renderAll,

                inspect,
                destroy,
            });

        managers.set(
            managerId,
            api
        );

        metrics.managersCreated +=
            1;

        metrics.lastManagerCreatedAt =
            Date.now();

        recordActivity(
            "manager-created",
            {
                managerId,
            }
        );

        logger?.info(
            `Section Manager created: ${managerId}`
        );

        events?.emit(
            EVENT_NAMES
                .MANAGER_CREATED,
            {
                applicationId:
                    managerId,

                timestamp:
                    Date.now(),
            }
        );

        return api;
    }

    function removeSectionManager(
        applicationId
    ) {
        const managerId =
            normalizeManagerId(
                applicationId
            );

        const removed =
            managers.delete(
                managerId
            );

        if (!removed) {
            return false;
        }

        metrics.managersRemoved +=
            1;

        metrics.lastManagerRemovedAt =
            Date.now();

        recordActivity(
            "manager-removed",
            {
                managerId,
            }
        );

        events?.emit(
            EVENT_NAMES
                .MANAGER_REMOVED,
            {
                applicationId:
                    managerId,

                timestamp:
                    Date.now(),
            }
        );

        logger?.info(
            `Section Manager removed: ${managerId}`
        );

        return true;
    }

    function getSectionManager(
        applicationId
    ) {
        try {
            return (
                managers.get(
                    normalizeManagerId(
                        applicationId
                    )
                ) ||
                null
            );
        } catch {
            return null;
        }
    }

    function hasSectionManager(
        applicationId
    ) {
        return (
            getSectionManager(
                applicationId
            ) !==
            null
        );
    }

    function getSectionManagers() {
        return [
            ...managers.values(),
        ].sort(
            (
                first,
                second
            ) =>
                first.id.localeCompare(
                    second.id
                )
        );
    }

    function inspect() {
        return {
            service:
                "section-manager",

            managerCount:
                managers.size,

            sectionCount:
                getTotalSectionCount(),

            managers:
                getSectionManagers()
                    .map(
                        manager =>
                            manager.inspect()
                    ),

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

            events: {
                ...EVENT_NAMES,
            },
        };
    }

    TACTIC.createSectionManager =
        createSectionManager;

    TACTIC.removeSectionManager =
        removeSectionManager;

    TACTIC.getSectionManager =
        getSectionManager;

    TACTIC.hasSectionManager =
        hasSectionManager;

    TACTIC.getSectionManagers =
        getSectionManagers;

    TACTIC.services.sectionManager =
        Object.freeze({
            create:
                createSectionManager,

            remove:
                removeSectionManager,

            get:
                getSectionManager,

            has:
                hasSectionManager,

            list:
                getSectionManagers,

            inspect,

            events:
                EVENT_NAMES,
        });

    health?.register({
        name:
            SERVICE_NAME,

        type:
            health.types.SERVICE,

        status:
            TACTIC.HEALTH_STATES
                ?.HEALTHY ||
            "healthy",

        staleAfterMs:
            null,

        metadata: {
            serviceName:
                "sectionManager",

            requiresHeartbeat:
                false,
        },
    });

    logger?.info(
        "Section Manager loaded"
    );
})();