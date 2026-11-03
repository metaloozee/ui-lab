// Colors live in src/index.css as OKLCH tokens. Components reference them by role, so any raw
// color, palette class, or stock shadcn token name in a string is a mistake. If color is the point
// of an experiment, declare it with an oxlint-disable comment on that line.
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|oklch|oklab|lch|lab|hwb)\(/;
const HEX = /(?:^|[\s"'`:,(=_[])#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i;
const UTILITY =
  "(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|caret|decoration|shadow)";
const PALETTE_CLASS = new RegExp(
  `(?<![\\w-])${UTILITY}-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|white|black)(?:-\\d+)?(?![\\w-])`,
);
const STOCK_CLASS = new RegExp(
  `(?<![\\w-])${UTILITY}-(?:background|foreground|primary|secondary|muted|muted-foreground|accent|accent-foreground|card|popover|destructive|input|ring|hover|active|selected)(?![\\w-])`,
);
const STOCK_VARIABLE =
  /var\(--(?:background|foreground|primary|secondary|muted|muted-foreground|accent|card|popover|destructive|border|input|ring|hover|active|selected|tint|tint-hover|fluid-accent|focus-ring|info|success|warning)\b/;

const HOVER_FILL =
  /(?:^|\s)(?:group-|peer-)?hover(?:\/\w+)?:(?:bg|border|ring|outline|shadow|\[--)/;
const HOVER_MESSAGE =
  "Hand-rolled hover. Build hoverable things with useFluidHover and FluidHoverHighlight, or useSelfFluidHover for a lone control.";

const PROBLEMS = [
  [HOVER_FILL, HOVER_MESSAGE],
  [COLOR_FUNCTION, "Raw color function. Use a semantic token from src/index.css."],
  [HEX, "Raw hex color. Use a semantic token from src/index.css."],
  [PALETTE_CLASS, "Palette class. Use a semantic token from src/index.css."],
  [STOCK_CLASS, "Stock shadcn or registry token. Use the role names in src/index.css."],
  [STOCK_VARIABLE, "Stock shadcn or registry variable. Use the role names in src/index.css."],
];

const rule = {
  create(context) {
    const check = (node, text) => {
      for (const [pattern, message] of PROBLEMS) {
        if (pattern.test(text)) {
          context.report({ node, message });
          return;
        }
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
      JSXText(node) {
        check(node, node.value);
      },
    };
  },
};

// Registry primitives own their internals, and the hook files implement hover itself.
const HOVER_INTERNALS =
  /src\/(?:components\/ui|components\/self-fluid-hover|components\/fluid-hover-highlight|hooks)\b/;
const USES_HOOK = /\b(?:useFluidHover|useRegisterFluidHoverItem|useSelfFluidHover)\b/;
const HAND_ROLLED_PROPS = new Set([
  "onMouseEnter",
  "onMouseOver",
  "onPointerEnter",
  "onPointerOver",
  "whileHover",
]);

const fluidHoverRule = {
  create(context) {
    if (HOVER_INTERNALS.test(context.filename)) return {};
    const usesHook = USES_HOOK.test(context.sourceCode.text);
    return {
      JSXAttribute(node) {
        if (HAND_ROLLED_PROPS.has(node.name.name)) context.report({ node, message: HOVER_MESSAGE });
      },
      JSXOpeningElement(node) {
        const tag = elementName(node.name);
        if (INTERACTIVE_TAGS.has(tag) && !usesHook) {
          context.report({ node, message: `<${tag}> without fluid hover. ${HOVER_MESSAGE}` });
        }
      },
    };
  },
};

const INTERACTIVE_TAGS = new Set(["button", "a", "motion.button", "motion.a"]);

function elementName(name) {
  return name.type === "JSXMemberExpression"
    ? `${name.object.name}.${name.property.name}`
    : name.name;
}

// A press must animate, so plain elements are out. Spread pressMotion() onto a motion element, or
// use Button. ToolButton-style wrappers satisfy this inside their own definition.
const pressAnimationRule = {
  create(context) {
    if (HOVER_INTERNALS.test(context.filename)) return {};
    return {
      JSXOpeningElement(node) {
        const tag = elementName(node.name);
        if (tag === "button" || tag === "a") {
          context.report({
            node,
            message: `Plain <${tag}> has no press animation. Use motion.${tag} with pressMotion(), or Button.`,
          });
          return;
        }
        if (tag !== "motion.button" && tag !== "motion.a") return;
        const animated = node.attributes.some(
          (attribute) =>
            (attribute.type === "JSXAttribute" && attribute.name.name === "whileTap") ||
            (attribute.type === "JSXSpreadAttribute" &&
              context.sourceCode.getText(attribute).includes("pressMotion")),
        );
        if (!animated)
          context.report({ node, message: `<${tag}> needs whileTap or pressMotion().` });
      },
    };
  },
};

// Canvas interface motion reads the spring tokens, so Feel and Speed reach all of it. Experiments in
// previews may choose their own timing, and 0 means "no motion" rather than a timing.
const CANVAS_INTERFACE = /src\/canvas\/(?!previews\/)/;
const DURATION_CLASS = /(?:^|\s)(?:[\w-]+:)*duration-\d+(?:\s|$)/;
const DURATION_MESSAGE =
  "Hand-written duration. Use the spring tokens from @/lib/springs, or var(--spring-fast) and var(--spring-moderate) in classes.";

const motionTokensRule = {
  create(context) {
    if (!CANVAS_INTERFACE.test(context.filename) || context.filename.includes(".test.")) return {};
    const checkText = (node, text) => {
      if (DURATION_CLASS.test(text)) context.report({ node, message: DURATION_MESSAGE });
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") checkText(node, node.value);
      },
      TemplateElement(node) {
        checkText(node, node.value.raw);
      },
      Property(node) {
        if (node.key.name !== "duration") return;
        if (node.value.type === "Literal" && node.value.value !== 0) {
          context.report({ node, message: DURATION_MESSAGE });
        }
      },
    };
  },
};

export default {
  meta: { name: "ui-lab" },
  rules: {
    "design-tokens": rule,
    "fluid-hover": fluidHoverRule,
    "press-animation": pressAnimationRule,
    "motion-tokens": motionTokensRule,
  },
};
