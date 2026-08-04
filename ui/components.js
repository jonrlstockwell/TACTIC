(() => {
    "use strict";

    const TACTIC = globalThis.TACTIC;

    if (!TACTIC) {
        console.error(
            "[TACTIC Components] Namespace is unavailable."
        );

        return;
    }

    const utilities =
        TACTIC.services.utilities;

    function createElement(
        tagName,
        options = {}
    ) {
        const element =
            document.createElement(tagName);

        if (options.id) {
            element.id = options.id;
        }

        if (options.className) {
            element.className =
                options.className;
        }

        if (
            options.text !== undefined
        ) {
            element.textContent =
                String(options.text);
        }

        if (
            options.html !== undefined
        ) {
            element.innerHTML =
                String(options.html);
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

        if (options.styles) {
            Object.assign(
                element.style,
                options.styles
            );
        }

        if (options.dataset) {
            for (
                const [
                    name,
                    value,
                ] of Object.entries(
                    options.dataset
                )
            ) {
                element.dataset[name] =
                    String(value);
            }
        }

        if (
            Array.isArray(
                options.children
            )
        ) {
            for (
                const child of
                options.children
            ) {
                if (
                    child instanceof Node
                ) {
                    element.appendChild(
                        child
                    );
                }
            }
        }

        return element;
    }

    function createButton(
        text,
        options = {}
    ) {
        const button =
            createElement(
                "button",
                {
                    ...options,

                    text,

                    attributes: {
                        type: "button",
                        ...options.attributes,
                    },
                }
            );

        if (
            typeof options.onClick ===
            "function"
        ) {
            button.addEventListener(
                "click",
                options.onClick
            );
        }

        return button;
    }

    function createInfoCard(
        label,
        value,
        options = {}
    ) {
        const card =
            createElement(
                "div",
                {
                    className:
                        "tactic-info-card",
                }
            );

        const labelElement =
            createElement(
                "div",
                {
                    className:
                        "tactic-info-card-label",

                    text: label,
                }
            );

        const valueElement =
            createElement(
                "div",
                {
                    className:
                        "tactic-info-card-value",

                    text: value,
                }
            );

        card.append(
            labelElement,
            valueElement
        );

        if (options.id) {
            card.id = options.id;
        }

        return card;
    }

    function createEmptyState(
        title,
        description
    ) {
        const wrapper =
            createElement(
                "div",
                {
                    className:
                        "tactic-empty-state",
                }
            );

        wrapper.append(
            createElement(
                "div",
                {
                    className:
                        "tactic-empty-state-title",

                    text: title,
                }
            ),

            createElement(
                "div",
                {
                    className:
                        "tactic-empty-state-description",

                    text: description,
                }
            )
        );

        return wrapper;
    }

    function clearElement(element) {
        if (!(element instanceof Node)) {
            return;
        }

        element.replaceChildren();
    }

    function setText(
        element,
        value
    ) {
        if (!(element instanceof Node)) {
            return;
        }

        element.textContent =
            String(value ?? "");
    }

    function safeHtml(value) {
        return utilities.escapeHtml(
            value
        );
    }

    TACTIC.services.components = {
        createElement,
        createButton,
        createInfoCard,
        createEmptyState,
        clearElement,
        setText,
        safeHtml,
    };

    TACTIC.services.logger?.info(
        "UI components loaded"
    );
})();