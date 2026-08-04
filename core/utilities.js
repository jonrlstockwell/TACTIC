(() => {
    "use strict";

    const TACTIC = globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Utilities] Namespace is unavailable."
        );
        return;
    }

    function sleep(milliseconds) {
        return new Promise(
            (resolve) => {
                setTimeout(
                    resolve,
                    milliseconds
                );
            }
        );
    }

    function formatMoney(value) {
        const amount =
            Number(value);

        if (
            !Number.isFinite(amount)
        ) {
            return "$0";
        }

        return `$${Math.max(
            0,
            Math.floor(amount)
        ).toLocaleString("en-US")}`;
    }

    function parseMoney(value) {
        if (
            value === null ||
            value === undefined
        ) {
            return null;
        }

        const cleaned =
            String(value)
                .replace(
                    /[^0-9.-]/g,
                    ""
                )
                .trim();

        if (!cleaned) {
            return null;
        }

        const amount =
            Number(cleaned);

        if (
            !Number.isSafeInteger(
                amount
            ) ||
            amount < 0
        ) {
            return null;
        }

        return amount;
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll(
                "'",
                "&#039;"
            );
    }

    function normalizeText(value) {
        return String(value || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function isVisible(element) {
        if (
            !(
                element instanceof
                HTMLElement
            )
        ) {
            return false;
        }

        const style =
            getComputedStyle(element);

        const rect =
            element.getBoundingClientRect();

        return (
            style.display !== "none" &&
            style.visibility !==
                "hidden" &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    function debounce(
        callback,
        delayMs
    ) {
        if (
            typeof callback !==
            "function"
        ) {
            throw new TypeError(
                "Debounced callback must be a function."
            );
        }

        let timer = null;

        return function debounced(
            ...args
        ) {
            if (timer !== null) {
                clearTimeout(timer);
            }

            timer = setTimeout(
                () => {
                    timer = null;

                    callback.apply(
                        this,
                        args
                    );
                },
                delayMs
            );
        };
    }

    function uniqueArray(values) {
        return [
            ...new Set(
                Array.isArray(values)
                    ? values
                    : []
            ),
        ];
    }

    function clamp(
        value,
        minimum,
        maximum
    ) {
        return Math.min(
            maximum,
            Math.max(
                minimum,
                value
            )
        );
    }

    TACTIC.services.utilities = {
        sleep,
        formatMoney,
        parseMoney,
        escapeHtml,
        normalizeText,
        isVisible,
        debounce,
        uniqueArray,
        clamp,
    };

    TACTIC.services.logger?.info(
        "Utilities service loaded"
    );
})();