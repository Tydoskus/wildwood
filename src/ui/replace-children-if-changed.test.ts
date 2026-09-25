import { parseHTML } from "linkedom";
import { expect, it } from "vitest";
import { replaceChildrenIfChanged } from "./replace-children-if-changed";

const { document } = parseHTML("<body></body>");

const icon = (target: HTMLElement, src: string) => {
  const image = document.createElement("img"); image.src = src; target.append(image);
};

it("keeps the same image elements when a refresh draws the same thing", () => {
  const element = document.createElement("span");
  expect(replaceChildrenIfChanged(element, target => icon(target, "male.webp"))).toBe(true);
  const first = element.querySelector("img");
  expect(replaceChildrenIfChanged(element, target => icon(target, "male.webp"))).toBe(false);
  expect(element.querySelector("img")).toBe(first);
});

it("swaps in new children when the content changes", () => {
  const element = document.createElement("span");
  replaceChildrenIfChanged(element, target => icon(target, "male.webp"));
  const first = element.querySelector("img");
  expect(replaceChildrenIfChanged(element, target => icon(target, "female.webp"))).toBe(true);
  expect(element.querySelector("img")).not.toBe(first);
  expect(element.querySelectorAll("img")).toHaveLength(1);
});
