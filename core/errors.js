/**
 * ============================================================
 * TACTIC
 * Torn Assistant & Companion Toolkit
 * ============================================================
 *
 * File:
 * core/errors.js
 *
 * Purpose:
 * Provides centralized error creation, reporting,
 * storage, and event emission.
 *
 * Responsibilities:
 * - Standardize all TACTIC errors
 * - Store recent errors
 * - Emit error events
 * - Integrate with logger
 *
 * Does NOT:
 * - Display notifications
 * - Restart modules
 * - Modify UI
 *
 * Public API:
 * - test()
 * - create()
 * - report()
 * - get()
 * - latest()
 * - count()
 * - clear()
 *
 * ============================================================
 */

(() => {
    "use strict";

    const TACTIC = globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Errors] Namespace unavailable."
        );

        return;
    }

    const logger =
        TACTIC.services.logger;

    const events =
        TACTIC.services.events;

    const MAX_ERRORS = 250;

    const SEVERITY = Object.freeze({
        INFO: "info",
        WARNING: "warning",
        ERROR: "error",
        CRITICAL: "critical",
    });

    const CODE = Object.freeze({
        UNKNOWN:
            "UNKNOWN",

        DOM_SELECTOR_MISSING:
            "DOM_SELECTOR_MISSING",

        DOM_TIMEOUT:
            "DOM_TIMEOUT",

        DOM_OBSERVER_FAILED:
            "DOM_OBSERVER_FAILED",

        API_TIMEOUT:
            "API_TIMEOUT",

        API_RATE_LIMIT:
            "API_RATE_LIMIT",

        API_INVALID_KEY:
            "API_INVALID_KEY",

        API_NETWORK:
            "API_NETWORK",

        MODULE_INIT_FAILED:
            "MODULE_INIT_FAILED",

        MODULE_RENDER_FAILED:
            "MODULE_RENDER_FAILED",

        MODULE_CRASHED:
            "MODULE_CRASHED",

        SETTINGS_CORRUPT:
            "SETTINGS_CORRUPT",

        SETTINGS_VERSION:
            "SETTINGS_VERSION",

        SETTINGS_SAVE_FAILED:
            "SETTINGS_SAVE_FAILED",

        ASSERTION:
            "ASSERTION",

        INTERNAL:
            "INTERNAL",
    });

    let nextId = 1;

    const history = [];

    class TACTICErrorRecord {
        constructor({
            code = CODE.UNKNOWN,
            severity = SEVERITY.ERROR,
            module = null,
            service = null,
            message = "",
            details = {},
            error = null,
            recoverable = false,
            retryable = false,
            recovery = null,
        } = {}) {
            this.id =
                nextId++;

            this.timestamp =
                Date.now();

            this.isoTime =
                new Date(
                    this.timestamp
                ).toISOString();

            this.code =
                normalizeCode(code);

            this.severity =
                normalizeSeverity(
                    severity
                );

            this.module =
                normalizeOptionalString(
                    module
                );

            this.service =
                normalizeOptionalString(
                    service
                );

            this.message =
                normalizeMessage(
                    message,
                    error
                );

            this.details =
                normalizeDetails(
                    details
                );

            this.recoverable =
                Boolean(
                    recoverable
                );

            this.retryable =
                Boolean(
                    retryable
                );

            this.recovery =
                normalizeOptionalString(
                    recovery
                );

            this.name =
                error?.name ||
                null;

            this.stack =
                error?.stack ||
                captureStack();

            this.originalError =
                serializeNativeError(
                    error
                );
        }
    }

    function normalizeSeverity(
        severity
    ) {
        const normalized =
            String(
                severity || ""
            )
                .trim()
                .toLowerCase();

        return Object.values(
            SEVERITY
        ).includes(normalized)
            ? normalized
            : SEVERITY.ERROR;
    }

    function normalizeCode(code) {
        const normalized =
            String(
                code || CODE.UNKNOWN
            )
                .trim()
                .toUpperCase();

        return normalized ||
            CODE.UNKNOWN;
    }

    function normalizeOptionalString(
        value
    ) {
        if (
            value === null ||
            value === undefined
        ) {
            return null;
        }

        const normalized =
            String(value).trim();

        return normalized ||
            null;
    }

    function normalizeMessage(
        message,
        error
    ) {
        const supplied =
            String(
                message || ""
            ).trim();

        if (supplied) {
            return supplied;
        }

        if (
            error instanceof Error &&
            error.message
        ) {
            return error.message;
        }

        return "An unknown TACTIC error occurred.";
    }

    function normalizeDetails(
        details
    ) {
        if (
            details === null ||
            details === undefined
        ) {
            return {};
        }

        if (
            typeof details ===
                "object" &&
            !Array.isArray(details)
        ) {
            return {
                ...details,
            };
        }

        return {
            value: details,
        };
    }

    function serializeNativeError(
        error
    ) {
        if (
            !(error instanceof Error)
        ) {
            return null;
        }

        return {
            name:
                error.name,

            message:
                error.message,

            stack:
                error.stack ||
                null,
        };
    }

    function captureStack() {
        try {
            return new Error()
                .stack ||
                null;
        } catch {
            return null;
        }
    }

    function trimHistory() {
        if (
            history.length <=
            MAX_ERRORS
        ) {
            return;
        }

        history.splice(
            0,
            history.length -
                MAX_ERRORS
        );
    }

    function logRecord(record) {
        if (!logger) {
            return;
        }

        const context = {
            id:
                record.id,

            code:
                record.code,

            module:
                record.module,

            service:
                record.service,

            recoverable:
                record.recoverable,

            retryable:
                record.retryable,

            recovery:
                record.recovery,

            details:
                record.details,

            stack:
                record.stack,
        };

        switch (
            record.severity
        ) {
            case SEVERITY.INFO:
                logger.info(
                    record.message,
                    context
                );
                break;

            case SEVERITY.WARNING:
                logger.warn(
                    record.message,
                    context
                );
                break;

            case SEVERITY.CRITICAL:
            case SEVERITY.ERROR:
            default:
                logger.error(
                    record.message,
                    context
                );
                break;
        }
    }

    function create(options = {}) {
        if (
            options instanceof
            TACTICErrorRecord
        ) {
            return options;
        }

        if (
            options instanceof Error
        ) {
            return new TACTICErrorRecord({
                error: options,

                message:
                    options.message,

                code:
                    CODE.UNKNOWN,

                severity:
                    SEVERITY.ERROR,
            });
        }

        return new TACTICErrorRecord(
            options
        );
    }

    function report(options = {}) {
        const record =
            create(options);

        history.push(record);

        trimHistory();

        logRecord(record);

        events?.emit(
            "error:reported",
            {
                error: record,
            }
        );

        if (
            record.severity ===
            SEVERITY.CRITICAL
        ) {
            events?.emit(
                "error:critical",
                {
                    error:
                        record,
                }
            );
        }

        return record;
    }

    function get(filters = {}) {
        let results =
            [...history];

        if (
            filters.severity
        ) {
            const severity =
                normalizeSeverity(
                    filters.severity
                );

            results =
                results.filter(
                    (entry) =>
                        entry.severity ===
                        severity
                );
        }

        if (filters.code) {
            const code =
                normalizeCode(
                    filters.code
                );

            results =
                results.filter(
                    (entry) =>
                        entry.code ===
                        code
                );
        }

        if (filters.module) {
            const moduleName =
                normalizeOptionalString(
                    filters.module
                );

            results =
                results.filter(
                    (entry) =>
                        entry.module ===
                        moduleName
                );
        }

        if (filters.service) {
            const serviceName =
                normalizeOptionalString(
                    filters.service
                );

            results =
                results.filter(
                    (entry) =>
                        entry.service ===
                        serviceName
                );
        }

        if (
            Number.isSafeInteger(
                filters.limit
            ) &&
            filters.limit > 0
        ) {
            results =
                results.slice(
                    -filters.limit
                );
        }

        return results;
    }

    function latest() {
        return (
            history[
                history.length - 1
            ] ||
            null
        );
    }

    function count(filters = null) {
        if (!filters) {
            return history.length;
        }

        return get(filters).length;
    }

    function clear() {
        const removed =
            history.length;

        history.length = 0;

        events?.emit(
            "error:cleared",
            {
                removed,
            }
        );

        logger?.info(
            "TACTIC error history cleared",
            {
                removed,
            }
        );

        return removed;
    }

    function test() {
        return "TACTIC Errors Ready";
    }

    TACTIC.services.errors = {
        test,
        create,
        report,
        get,
        latest,
        count,
        clear,

        codes:
            CODE,

        severity:
            SEVERITY,

        ErrorRecord:
            TACTICErrorRecord,
    };

    logger?.info(
        "Error service loaded"
    );
})();