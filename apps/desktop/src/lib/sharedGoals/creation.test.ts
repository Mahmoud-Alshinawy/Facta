import { expect, it } from "vitest";
import { creationFields, validateCreation, validateProfile } from "./creation";
const fields = creationFields(1, "Asia/Riyadh");
it("validates Gym targets and normalizes the shared Custom schedule", () => {
  expect(validateCreation({ ...fields, name: "Gym", target: 1 })).toBeTruthy();
  expect(validateCreation({ ...fields, name: "Gym", target: 2 })).toBeNull();
  expect(validateCreation({ ...fields, name: "Gym", target: 7 })).toBeNull();
  expect(validateCreation({ ...fields, name: "Gym", target: 8 })).toBeTruthy();
  expect(
    validateCreation({
      ...fields,
      name: "Read",
      template: "custom",
      schedule_kind: "days",
      weekdays: [],
      target: null,
    }),
  ).toBeTruthy();
  expect(
    validateCreation({
      ...fields,
      name: "Read",
      template: "custom",
      schedule_kind: "days",
      weekdays: [0, 2],
      target: null,
    }),
  ).toBeNull();
  expect(
    validateCreation({
      ...fields,
      name: "Read",
      template: "custom",
      schedule_kind: "n",
      times_per_week: 0,
      target: null,
    }),
  ).toBeTruthy();
});
it("requires a bounded immutable-profile handle and display name", () => {
  expect(validateProfile("ab", "Person")).toBeTruthy();
  expect(validateProfile("person_1", "Person")).toBeNull();
  expect(validateProfile("person_1", " ")).toBeTruthy();
});
