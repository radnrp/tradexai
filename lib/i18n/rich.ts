import { createElement, Fragment, isValidElement, type ReactNode } from "react";
import { getLang, isolate, t, type Key } from "./index.ts";

/** t() for a sentence that holds an element, like an <Amount>. */
export function tx(key: Key, values: Record<string, ReactNode>): ReactNode {
  const parts = t(key)
    .split(/(\{\w+\})/)
    .map((part) => {
      const name = part.match(/^\{(\w+)\}$/)?.[1];
      if (!name || !(name in values)) return part;
      const value = values[name];
      if (getLang() !== "fa" || value == null) return value;
      return isValidElement(value) ? createElement("bdi", null, value) : isolate(String(value));
    });
  return createElement(Fragment, null, ...parts);
}
