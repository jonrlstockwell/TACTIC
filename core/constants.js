/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * core/constants.js
 *
 * Purpose:
 * Provides centralized constants shared across the TACTIC
 * framework, services, repositories, UI, and modules.
 *
 * Responsibilities:
 * - Define event names
 * - Define error codes
 * - Define severity levels
 * - Define health states
 * - Define module states
 * - Define lifecycle states
 * - Define capability names
 * - Define shared storage keys
 *
 * Does NOT:
 * - Store runtime state
 * - Emit events
 * - Perform business logic
 *
 * Public API:
 * - TACTIC.constants
 * - TACTIC.EVENTS
 * - TACTIC.ERROR_CODES
 * - TACTIC.SEVERITY
 * - TACTIC.HEALTH_STATES
 * - TACTIC.MODULE_STATES
 * - TACTIC.LIFECYCLE_STATES
 * - TACTIC.CAPABILITIES
 * - TACTIC.STORAGE_KEYS
 * - TACTIC.DEFAULTS
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC = globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Constants] Namespace is unavailable."
        );

        return;
    }

    function deepFreeze(value) {
        if (
            value === null ||
            typeof value !== "object" ||
            Object.isFrozen(value)
        ) {
            return value;
        }

        Object.freeze(value);

        for (const nestedValue of Object.values(value)) {
            deepFreeze(nestedValue);
        }

        return value;
    }

    const EVENTS = deepFreeze({
        APP: {
            STARTING: "app:starting",
            READY: "app:ready",
            ERROR: "app:error",
            STOPPING: "app:stopping",
            STOPPED: "app:stopped",
        },

        LIFECYCLE: {
            STATE_CHANGED:
                "lifecycle:state-changed",

            INITIALIZING:
                "lifecycle:initializing",

            INITIALIZED:
                "lifecycle:initialized",

            STARTING:
                "lifecycle:starting",

            RUNNING:
                "lifecycle:running",

            PAUSING:
                "lifecycle:pausing",

            PAUSED:
                "lifecycle:paused",

            RESUMING:
                "lifecycle:resuming",

            STOPPING:
                "lifecycle:stopping",

            STOPPED:
                "lifecycle:stopped",

            RESTARTING:
                "lifecycle:restarting",

            ERROR:
                "lifecycle:error",
        },

        MODULE: {
            REGISTERED:
                "module:registered",

            UNREGISTERED:
                "module:unregistered",

            INITIALIZING:
                "module:initializing",

            INITIALIZED:
                "module:initialized",

            STARTED:
                "module:started",

            PAUSED:
                "module:paused",

            RESUMED:
                "module:resumed",

            STOPPED:
                "module:stopped",

            DESTROYED:
                "module:destroyed",

            ERROR:
                "module:error",

            STATE_CHANGED:
                "module:state-changed",
        },

        ERROR: {
            REPORTED:
                "error:reported",

            CRITICAL:
                "error:critical",

            CLEARED:
                "error:cleared",
        },

        HEALTH: {
            REGISTERED:
                "health:registered",

            UPDATED:
                "health:updated",

            DEGRADED:
                "health:degraded",

            FAILED:
                "health:failed",

            RECOVERED:
                "health:recovered",

            CHECK_COMPLETED:
                "health:check-completed",
        },

        UI: {
            DRAWER_OPENED:
                "ui:drawer-opened",

            DRAWER_CLOSED:
                "ui:drawer-closed",

            ACTIVE_MODULE_CHANGED:
                "ui:active-module-changed",

            MODULE_RENDERED:
                "ui:module-rendered",

            STATUS_CHANGED:
                "ui:status-changed",
        },

        LOG: {
            CREATED:
                "log:created",

            CLEARED:
                "log:cleared",
        },

        DEVELOPER: {
            CHANGED:
                "developer:changed",

            SNAPSHOT_CREATED:
                "developer:snapshot-created",
        },

        SETTINGS: {
            LOADED:
                "settings:loaded",

            CHANGED:
                "settings:changed",

            RESET:
                "settings:reset",

            MIGRATED:
                "settings:migrated",

            ERROR:
                "settings:error",
        },

        DOM: {
            READY:
                "dom:ready",

            MUTATION:
                "dom:mutation",

            WALLET_CHANGED:
                "dom:wallet-changed",

            NAVIGATION_CHANGED:
                "dom:navigation-changed",

            SELECTOR_MISSING:
                "dom:selector-missing",
        },

        API: {
            REQUESTED:
                "api:requested",

            COMPLETED:
                "api:completed",

            FAILED:
                "api:failed",

            RATE_LIMITED:
                "api:rate-limited",

            QUEUE_CHANGED:
                "api:queue-changed",
        },

        NOTIFICATION: {
            CREATED:
                "notification:created",

            CLICKED:
                "notification:clicked",

            FAILED:
                "notification:failed",
        },

        SCHEDULER: {
            TASK_CREATED:
                "scheduler:task-created",

            TASK_STARTED:
                "scheduler:task-started",

            TASK_COMPLETED:
                "scheduler:task-completed",

            TASK_FAILED:
                "scheduler:task-failed",

            TASK_FINISHED:
                "scheduler:task-finished",

            TASK_CANCELLED:
                "scheduler:task-cancelled",

            TASK_PAUSED:
                "scheduler:task-paused",

            TASK_RESUMED:
                "scheduler:task-resumed",
        },
    });

    const ERROR_CODES = deepFreeze({
        GENERAL: {
            UNKNOWN:
                "UNKNOWN",

            ASSERTION:
                "ASSERTION",

            INTERNAL:
                "INTERNAL",

            INVALID_ARGUMENT:
                "INVALID_ARGUMENT",

            NOT_IMPLEMENTED:
                "NOT_IMPLEMENTED",
        },

        APP: {
            STARTUP_FAILED:
                "APP_STARTUP_FAILED",

            SHUTDOWN_FAILED:
                "APP_SHUTDOWN_FAILED",

            INVALID_STATE:
                "APP_INVALID_STATE",
        },

        DOM: {
            SELECTOR_MISSING:
                "DOM_SELECTOR_MISSING",

            TIMEOUT:
                "DOM_TIMEOUT",

            OBSERVER_FAILED:
                "DOM_OBSERVER_FAILED",

            PARSE_FAILED:
                "DOM_PARSE_FAILED",

            ELEMENT_NOT_VISIBLE:
                "DOM_ELEMENT_NOT_VISIBLE",

            NAVIGATION_FAILED:
                "DOM_NAVIGATION_FAILED",
        },

        API: {
            TIMEOUT:
                "API_TIMEOUT",

            RATE_LIMIT:
                "API_RATE_LIMIT",

            INVALID_KEY:
                "API_INVALID_KEY",

            NETWORK:
                "API_NETWORK",

            INVALID_RESPONSE:
                "API_INVALID_RESPONSE",

            REQUEST_FAILED:
                "API_REQUEST_FAILED",

            CACHE_FAILED:
                "API_CACHE_FAILED",
        },

        MODULE: {
            REGISTRATION_FAILED:
                "MODULE_REGISTRATION_FAILED",

            DUPLICATE:
                "MODULE_DUPLICATE",

            NOT_FOUND:
                "MODULE_NOT_FOUND",

            DEPENDENCY_MISSING:
                "MODULE_DEPENDENCY_MISSING",

            CIRCULAR_DEPENDENCY:
                "MODULE_CIRCULAR_DEPENDENCY",

            INIT_FAILED:
                "MODULE_INIT_FAILED",

            START_FAILED:
                "MODULE_START_FAILED",

            PAUSE_FAILED:
                "MODULE_PAUSE_FAILED",

            RESUME_FAILED:
                "MODULE_RESUME_FAILED",

            STOP_FAILED:
                "MODULE_STOP_FAILED",

            RENDER_FAILED:
                "MODULE_RENDER_FAILED",

            DESTROY_FAILED:
                "MODULE_DESTROY_FAILED",

            CRASHED:
                "MODULE_CRASHED",
        },

        SETTINGS: {
            CORRUPT:
                "SETTINGS_CORRUPT",

            VERSION:
                "SETTINGS_VERSION",

            LOAD_FAILED:
                "SETTINGS_LOAD_FAILED",

            SAVE_FAILED:
                "SETTINGS_SAVE_FAILED",

            MIGRATION_FAILED:
                "SETTINGS_MIGRATION_FAILED",

            VALIDATION_FAILED:
                "SETTINGS_VALIDATION_FAILED",
        },

        STORAGE: {
            READ_FAILED:
                "STORAGE_READ_FAILED",

            WRITE_FAILED:
                "STORAGE_WRITE_FAILED",

            DELETE_FAILED:
                "STORAGE_DELETE_FAILED",

            INVALID_KEY:
                "STORAGE_INVALID_KEY",
        },

        HEALTH: {
            CHECK_FAILED:
                "HEALTH_CHECK_FAILED",

            COMPONENT_FAILED:
                "HEALTH_COMPONENT_FAILED",

            COMPONENT_STALE:
                "HEALTH_COMPONENT_STALE",

            REGISTRATION_FAILED:
                "HEALTH_REGISTRATION_FAILED",
        },

        NOTIFICATION: {
            FAILED:
                "NOTIFICATION_FAILED",

            PERMISSION_DENIED:
                "NOTIFICATION_PERMISSION_DENIED",
        },

        LIFECYCLE: {
            INVALID_TRANSITION:
                "LIFECYCLE_INVALID_TRANSITION",

            START_FAILED:
                "LIFECYCLE_START_FAILED",

            STOP_FAILED:
                "LIFECYCLE_STOP_FAILED",

            RESTART_FAILED:
                "LIFECYCLE_RESTART_FAILED",
        },
    });

    const SEVERITY = deepFreeze({
        INFO:
            "info",

        WARNING:
            "warning",

        ERROR:
            "error",

        CRITICAL:
            "critical",
    });

    const HEALTH_STATES = deepFreeze({
        UNKNOWN:
            "unknown",

        HEALTHY:
            "healthy",

        DEGRADED:
            "degraded",

        UNHEALTHY:
            "unhealthy",

        FAILED:
            "failed",

        DISABLED:
            "disabled",

        STARTING:
            "starting",

        STOPPED:
            "stopped",

        RECOVERING:
            "recovering",
    });

    const MODULE_STATES = deepFreeze({
        REGISTERED:
            "registered",

        INITIALIZING:
            "initializing",

        INITIALIZED:
            "initialized",

        STARTING:
            "starting",

        RUNNING:
            "running",

        PAUSING:
            "pausing",

        PAUSED:
            "paused",

        RESUMING:
            "resuming",

        STOPPING:
            "stopping",

        STOPPED:
            "stopped",

        DESTROYING:
            "destroying",

        DESTROYED:
            "destroyed",

        ERROR:
            "error",

        DISABLED:
            "disabled",
    });

    const LIFECYCLE_STATES = deepFreeze({
        CREATED:
            "created",

        INITIALIZING:
            "initializing",

        INITIALIZED:
            "initialized",

        STARTING:
            "starting",

        RUNNING:
            "running",

        PAUSING:
            "pausing",

        PAUSED:
            "paused",

        RESUMING:
            "resuming",

        STOPPING:
            "stopping",

        STOPPED:
            "stopped",

        DESTROYING:
            "destroying",

        DESTROYED:
            "destroyed",

        ERROR:
            "error",
    });

    const CAPABILITIES = deepFreeze({
        STORAGE:
            "storage",

        EVENTS:
            "events",

        LOGGER:
            "logger",

        ERRORS:
            "errors",

        HEALTH:
            "health",

        LIFECYCLE:
            "lifecycle",

        DOM:
            "dom",

        API:
            "api",

        SETTINGS:
            "settings",

        NOTIFICATIONS:
            "notifications",

        SCHEDULER:
            "scheduler",

        DRAWER:
            "drawer",

        REPOSITORIES: {
            USER:
                "repository:user",

            FACTION:
                "repository:faction",

            ITEMS:
                "repository:items",

            MARKET:
                "repository:market",
        },
    });

    const STORAGE_KEYS = deepFreeze({
        CORE: {
            LOGS:
                "core:logs",

            ERRORS:
                "core:errors",

            HEALTH:
                "core:health",

            LIFECYCLE:
                "core:lifecycle",
        },

        DEVELOPER: {
            ENABLED:
                "developer:enabled",
        },

        UI: {
            DRAWER_OPEN:
                "ui:drawer-open",

            ACTIVE_MODULE:
                "ui:active-module",

            THEME:
                "ui:theme",
        },

        SETTINGS: {
            ROOT:
                "settings:root",

            VERSION:
                "settings:version",
        },

        API: {
            KEY:
                "api:key",

            CACHE:
                "api:cache",

            RATE_LIMIT:
                "api:rate-limit",
        },

        MODULES: {
            ENABLED:
                "modules:enabled",

            STATES:
                "modules:states",
        },
    });

    const DEFAULTS = deepFreeze({
        MAX_ERROR_HISTORY:
            250,

        MAX_LOG_HISTORY:
            500,

        DRAWER_WIDTH_PX:
            420,

        UI_ANIMATION_DURATION_MS:
            250,

        HEALTH_SCORE_MAXIMUM:
            100,

        HEALTH_SCORE_MINIMUM:
            0,
    });

    const constants = deepFreeze({
        EVENTS,
        ERROR_CODES,
        SEVERITY,
        HEALTH_STATES,
        MODULE_STATES,
        LIFECYCLE_STATES,
        CAPABILITIES,
        STORAGE_KEYS,
        DEFAULTS,
    });

    TACTIC.constants =
        constants;

    TACTIC.EVENTS =
        EVENTS;

    TACTIC.ERROR_CODES =
        ERROR_CODES;

    TACTIC.SEVERITY =
        SEVERITY;

    TACTIC.HEALTH_STATES =
        HEALTH_STATES;

    TACTIC.MODULE_STATES =
        MODULE_STATES;

    TACTIC.LIFECYCLE_STATES =
        LIFECYCLE_STATES;

    TACTIC.CAPABILITIES =
        CAPABILITIES;

    TACTIC.STORAGE_KEYS =
        STORAGE_KEYS;

    TACTIC.DEFAULTS =
        DEFAULTS;

    console.log(
        "[TACTIC Constants] Constants loaded",
        constants
    );
})();